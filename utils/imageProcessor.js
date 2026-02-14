const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const path = require('path');

const processDocument = async (filePath) => {
    try {
        // Create a path for the cleaned version of the image
        const cleanedPath = filePath.replace(path.extname(filePath), '-cleaned.png');

        // PHASE 1: Image Enhancement (DIP)
        await sharp(filePath)
            .grayscale()       // Step 1: Grayscale
            .sharpen()         // Step 2: Noise reduction/Sharpening
            .threshold(128)    // Step 3: Black & White Thresholding
            .toFile(cleanedPath);

        // PHASE 1: Local OCR Extraction
        const { data: { text } } = await Tesseract.recognize(cleanedPath, 'eng');
        
        return { text, cleanedPath };
    } catch (error) {
        console.error("DIP Processing Error:", error);
        throw error;
    }
};

module.exports = { processDocument };