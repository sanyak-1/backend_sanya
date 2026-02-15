const express = require('express');
const multer = require('multer');
const { createCanvas } = require('canvas');
const { processImage } = require('../utils/imageProcessor');
const { buildDocumentTree } = require('../utils/structureParser');
const Document = require('../models/Document'); // ✅ Make sure this path is correct

const router = express.Router();

// ── Multer Config ──────────────────────────────────────────
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ── PDF → Direct Text Layer Extraction ────────────────────
async function extractTextFromPDF(buffer) {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = false;

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdfDoc = await loadingTask.promise;

  const totalPages = pdfDoc.numPages;
  console.log(`📄 PDF loaded | Total pages: ${totalPages}`);

  let fullText = '';

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    console.log(`🔄 Extracting text from page ${pageNum}/${totalPages}...`);

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    fullText += `\n--- Page ${pageNum} ---\n${pageText}`;
    console.log(`✅ Page ${pageNum} done | Chars: ${pageText.length}`);
  }

  return fullText;
}

// ── POST /api/upload ───────────────────────────────────────
router.post('/', upload.any(), async (req, res) => {
  try {

    // 1. Grab file
    const file = req.files && req.files[0];
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { mimetype, buffer, originalname, size } = file;

    // 2. Validate type
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/tiff'];
    if (!allowedTypes.includes(mimetype)) {
      return res.status(400).json({ error: `Unsupported type: ${mimetype}` });
    }

    console.log(`📂 Received: ${originalname} | ${mimetype} | ${size} bytes`);

    // ── 3. DUPLICATE CHECK ─────────────────────────────────
    // Check MongoDB BEFORE heavy processing
    const existingDocument = await Document.findOne({ originalName: originalname });

    if (existingDocument) {
      // ✅ Found in DB — return immediately, skip processing
      console.log(`⚡ Duplicate found: "${originalname}" — Returning from database`);

      return res.status(200).json({
        success: true,
        message: '⚡ Retrieved from Database',
        source: 'database',                          // tells frontend this came from DB
        documentId: existingDocument._id,
        filename: existingDocument.originalName,
        pipeline: existingDocument.pipeline || 'cached',
        preview: existingDocument.extractedText?.substring(0, 500),
        structuredTree: existingDocument.structure,
      });
    }

    // ── 4. NOT FOUND — Run Full Processing ─────────────────
    console.log(`🆕 New document: "${originalname}" — Starting processing...`);

    let extractedText = '';
    let pipeline = '';

    // HYBRID ENGINE
    if (mimetype === 'application/pdf') {
      pipeline = 'pdfjs-text-layer';
      console.log('🔵 PDF Direct Text Extraction activated');
      extractedText = await extractTextFromPDF(buffer);
      console.log(`✅ PDF done | Total chars: ${extractedText.length}`);

    } else if (mimetype.startsWith('image/')) {
      pipeline = 'tesseract-ocr';
      console.log('🟢 Image OCR Pipeline activated');
      extractedText = await processImage(buffer);
      console.log(`✅ Image done | Chars: ${extractedText.length}`);
    }

    // ── 5. Structure Parsing ───────────────────────────────
    const structuredTree = buildDocumentTree(extractedText);

    // ── 6. Save to MongoDB ─────────────────────────────────
    const newDocument = await Document.create({
      originalName: originalname,
      extractedText,
      structure: structuredTree,
      pipeline,
      mimetype,
      uploadedAt: new Date(),
    });

    console.log(`💾 Saved to MongoDB with ID: ${newDocument._id}`);

    // ── 7. Response ────────────────────────────────────────
    return res.status(201).json({
      success: true,
      message: '✅ Document Processed and Saved',
      source: 'freshly_processed',                  // tells frontend this was just processed
      documentId: newDocument._id,
      filename: originalname,
      pipeline,
      preview: extractedText.substring(0, 500),
      structuredTree,
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
    return res.status(500).json({ error: `Processing failed: ${err.message}` });
  }
});

module.exports = router;