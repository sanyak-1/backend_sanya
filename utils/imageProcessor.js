const { runPythonOCR } = require('./pythonBridge');
// 🚀 NEW: Import the EasyOCR table processor
const { processTablesWithEasyOCR } = require('./tableProcessor'); 

const processImage = async (buffer, originalName = 'upload.png') => {
  try {
    console.log('🐍 Routing to Python Vision Pipeline...');
    
    // 1. Run the main OCR (EasyOCR pure-python version)
    const ocrResult = await runPythonOCR(buffer, originalName);

    // 2. 🚀 NEW: Check if the Python script detected any tables
    if (ocrResult.pages && ocrResult.pages[0] && ocrResult.pages[0].tables && ocrResult.pages[0].tables.length > 0) {
      const tables = ocrResult.pages[0].tables;
      const words = ocrResult.pages[0].words || []; // 🚀 Grab all the words EasyOCR found

      console.log(`📊 Formatting ${tables.length} table(s) using EasyOCR coordinates...`);

      // 🚀 NEW: Pass BOTH tables and words to the spatial math processor
      const processedTables = await processTablesWithEasyOCR(tables, words);
      
      // Update the result with the refined table data
      ocrResult.pages[0].tables = processedTables;
    }

    return ocrResult;
  } catch (error) {
    console.error('❌ Python Vision Pipeline failed:', error.message);
    throw new Error('Image processing failed: ' + error.message);
  }
};

module.exports = { processImage };