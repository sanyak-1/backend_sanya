const sharp = require('sharp');
const Tesseract = require('tesseract.js');

const processImage = async (buffer) => {
  try {
    console.log('🖼️ Starting Sharp preprocessing...');

    const cleanedBuffer = await sharp(buffer)
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.5 })
      .png()
      .toBuffer();

    console.log('✅ Sharp done. Starting Tesseract OCR...');

    const { data: { text } } = await Tesseract.recognize(cleanedBuffer, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          process.stdout.write(`\r🔍 OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });

    console.log('\n✅ OCR complete.');
    return text;

  } catch (error) {
    console.error('❌ Image processing failed:', error.message);
    throw new Error('Image processing failed: ' + error.message);
  }
};

module.exports = { processImage };