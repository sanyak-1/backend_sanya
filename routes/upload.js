const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const { processImage } = require('../utils/imageProcessor');
const { buildDocumentTree } = require('../utils/structureParser');
const { calculateFileHash } = require('../utils/hashHelper');
const { runMultiAgentPipeline } = require('../utils/groqService');
const Document = require('../models/Document');
const { runPythonOCR } = require('../utils/pythonBridge');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

async function extractTextWithPdfjs(buffer) {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = false;
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true
  });
  const pdfDoc = await loadingTask.promise;
  let fullText = '';
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    fullText += `\n--- Page ${pageNum} ---\n${pageText}`;
  }
  return fullText;
}

router.post('/', upload.any(), async (req, res) => {
  try {

    const file = req.files && req.files[0];
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { mimetype, buffer, originalname, size } = file;

    const allowedTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/tiff'
    ];
    if (!allowedTypes.includes(mimetype)) {
      return res.status(400).json({ error: `Unsupported type: ${mimetype}` });
    }

    console.log(`📂 Received: ${originalname} | ${mimetype} | ${size} bytes`);

    // ── Calculate MD5 Hash ─────────────────────────────────
    const fileHash = calculateFileHash(buffer);
    console.log(`🔐 File Hash: ${fileHash}`);

    // ── Check for Duplicate ────────────────────────────────
    const existingDocument = await Document.findOne({ fileHash });
    if (existingDocument) {
      console.log(`⚡ Duplicate detected by hash — Returning from DB`);
      return res.status(200).json({
        success: true,
        message: '⚡ Retrieved from Database (duplicate file content)',
        source: 'database',
        documentId: existingDocument._id,
        filename: existingDocument.originalName,
        fileHash: existingDocument.fileHash,
        pipeline: existingDocument.pipeline || 'cached',
        preview: existingDocument.extractedText?.substring(0, 500),
        structuredTree: existingDocument.structure,
        spatialData: existingDocument.spatialData,
        visionAnalysis: existingDocument.visionAnalysis,
        audioIntro: existingDocument.audioIntro,
        navigationHints: existingDocument.navigationHints,
        reviewerVerdict: existingDocument.reviewerVerdict,
      });
    }

    console.log(`🆕 New file (hash unique) — Processing...`);
    let extractedText = '';
    let pipeline = '';
    let spatialData = null;

    // ── Process PDF ────────────────────────────────────────
    if (mimetype === 'application/pdf') {
      try {
        pipeline = 'python-pdf-ocr';
        console.log('🐍 Python PDF Pipeline activated');
        
        const ocrResult = await runPythonOCR(buffer, originalname);
        extractedText = ocrResult.text;
        spatialData = ocrResult.pages;
        
        console.log(`✅ Python PDF done | Chars: ${extractedText.length}`);
        if (extractedText.trim().length < 50) {
          throw new Error('Too little text — switching to pdfjs');
        }
      } catch (pythonErr) {
        console.warn(`⚠️ Python failed, using pdfjs: ${pythonErr.message}`);
        pipeline = 'pdfjs-text-layer';
        extractedText = await extractTextWithPdfjs(buffer);
        spatialData = null;
        console.log(`✅ pdfjs done | Chars: ${extractedText.length}`);
      }

    // ── Process Image ──────────────────────────────────────
    } else if (mimetype.startsWith('image/')) {
      // 🚀 NEW: Updated pipeline name to reflect our new architecture!
      pipeline = 'python-easyocr-spatial';
      console.log('🐍 Python Image Pipeline activated');
      
      const ocrResult = await processImage(buffer, originalname);
      extractedText = ocrResult.text;
      spatialData = ocrResult.pages;
      
      // 🚀 THE REDUNDANT TABLE LOOP HAS BEEN DELETED FROM HERE
      
      console.log(`✅ Image done | Chars: ${extractedText.length}`);
    }

    // ── Build Document Tree with Tables ───────────────────
    const tablesForTree = spatialData && spatialData[0] && spatialData[0].tables 
      ? spatialData[0].tables 
      : [];

    const structuredTree = buildDocumentTree(extractedText, tablesForTree);

    // ── Run Multi-Agent AI Pipeline ────────────────────────
    console.log('\n🤖 Starting AI Multi-Agent Pipeline...');
    const aiResults = await runMultiAgentPipeline(buffer, extractedText, structuredTree);
    console.log('✅ AI Pipeline complete\n');

    // ── Save to MongoDB ────────────────────────────────────
    const newDocument = await Document.create({
      originalName: originalname,
      fileHash,
      extractedText,
      structure: structuredTree,
      spatialData: spatialData || [],
      visionAnalysis: aiResults.visionAnalysis,
      audioIntro: aiResults.audioIntro,
      navigationHints: aiResults.navigationHints,
      reviewerVerdict: aiResults.reviewerVerdict,
      pipeline,
      mimetype,
      uploadedAt: new Date(),
    });
    console.log(`💾 Saved to MongoDB: ${newDocument._id}`);

    try {
      if (file && file.path) {
        fs.unlinkSync(file.path);
        console.log(`🗑️ Storage Cleanup: Deleted ${file.filename || originalname} from server.`);
      }
    } catch (cleanupError) {
      console.error('⚠️ Cleanup Warning: Could not delete file:', cleanupError.message);
    }

    // ── Response ───────────────────────────────────────────
    return res.status(201).json({
      success: true,
      message: '✅ Document Processed with Multi-Agent AI',
      source: 'freshly_processed',
      documentId: newDocument._id,
      filename: originalname,
      fileHash,
      pipeline,
      preview: extractedText.substring(0, 500),
      structuredTree,
      spatialData: spatialData || [],
      visionAnalysis: aiResults.visionAnalysis,
      audioIntro: aiResults.audioIntro,
      navigationHints: aiResults.navigationHints,
      reviewerVerdict: aiResults.reviewerVerdict,
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
    return res.status(500).json({ error: `Processing failed: ${err.message}` });
  }
});

module.exports = router;