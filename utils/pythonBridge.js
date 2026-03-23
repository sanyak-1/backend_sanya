const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Run Python OCR script with EasyOCR (No Tesseract dependency)
 * @param {Buffer} imageBuffer - Image file buffer
 * @param {string} originalName - Original filename
 * @returns {Promise<{text: string, pages: Array}>}
 */
const runPythonOCR = (imageBuffer, originalName = 'upload.png') => {
  return new Promise((resolve, reject) => {
    // Create temporary file
    const tempPath = path.join(
      require('os').tmpdir(),
      `docutemp_${Date.now()}${path.extname(originalName)}`
    );

    fs.writeFileSync(tempPath, imageBuffer);
    console.log('📁 Temp file:', tempPath);

    const pythonPath = process.env.PYTHON_PATH || 'python';
    const pythonScript = path.join(__dirname, '../python/ocr_processor.py');

    console.log('🐍 Python:', pythonPath);
    console.log('📜 Script:', pythonScript);

    // ✅ UPDATED: Only pass file path and poppler path (no Tesseract)
    const pythonProcess = spawn(pythonPath, [
      pythonScript,
      tempPath,
      process.env.POPPLER_PATH || ''
    ]);

    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      stderrData += msg;
      // 🚀 NEW: Print Python's background logs in real-time!
      console.log(`🐍 Python Status: ${msg.trim()}`);
    });

    pythonProcess.on('close', (code) => {
      // Clean up temp file
      try {
        fs.unlinkSync(tempPath);
        console.log('🗑️ Temp file deleted');
      } catch (err) {
        console.warn('⚠️ Could not delete temp file:', err.message);
      }

      if (code !== 0) {
        console.error('❌ Python stderr:', stderrData);
        return reject(new Error(`Python process exited with code ${code}: ${stderrData}`));
      }

      try {
        const result = JSON.parse(stdoutData);
        
        if (!result.success) {
          return reject(new Error(result.error || 'OCR processing failed'));
        }

        console.log(`✅ Python OCR done | Chars: ${result.charCount || 0}`);
        
        // Return in the format expected by imageProcessor.js
        resolve({
          text: result.text || '',
          pages: result.pages || []
        });
        
      } catch (parseError) {
        console.error('❌ Failed to parse Python output:', stdoutData);
        reject(new Error(`JSON parse error: ${parseError.message}`));
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('❌ Failed to start Python process:', error);
      
      try {
        fs.unlinkSync(tempPath);
      } catch (err) {
        // Ignore cleanup errors
      }
      
      reject(new Error(`Failed to start Python: ${error.message}`));
    });
  });
};

module.exports = { runPythonOCR };