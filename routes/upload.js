const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const { processDocument } = require('../utils/imageProcessor');
const { buildDocumentTree } = require('../utils/structureParser');

// 1. Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'uploads/'); },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});

const upload = multer({ storage });

// 2. The Route Handler (Fixed Wrapper)
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded." });

        console.log("Phase 1: Processing Image...");
        // Phase 1: Custom Vision & OCR
        const result = await processDocument(req.file.path);

        console.log("Phase 2: Building Hierarchical Tree...");
        // Phase 2: Structural Extraction
        const structuredData = buildDocumentTree(result.text);

        res.status(200).json({
            message: "Phase 1 & 2 Complete!",
            tree: structuredData, // This will now be nested
            cleanedImage: result.cleanedPath
        });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;