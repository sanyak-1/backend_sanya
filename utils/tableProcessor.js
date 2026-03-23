/**
 * Pure Spatial Table Processor
 * Uses EasyOCR's existing word coordinates to build tables instantly without secondary Python calls.
 */
const processTablesWithEasyOCR = async (tables, pageWords = []) => {
  const processedTables = [];

  for (const table of tables) {
    try {
      // 1. Find all words that physically sit inside this table's bounding box
      const tableWords = pageWords.filter(word => {
        // 10px buffer so we don't accidentally cut off letters touching the edge
        return word.x >= (table.x - 10) && 
               word.y >= (table.y - 10) && 
               (word.x + word.width) <= (table.x + table.width + 10) &&
               (word.y + word.height) <= (table.y + table.height + 10);
      });

      // 2. Group the words into horizontal rows based on their Y coordinate
      const rows = [];
      tableWords.sort((a, b) => a.y - b.y); // Sort top-to-bottom

      let currentRow = [];
      let currentY = -1;

      for (const word of tableWords) {
        // If the word is within 15 vertical pixels, it belongs in the same row
        if (currentY === -1 || Math.abs(word.y - currentY) < 15) {
          currentRow.push(word);
          currentY = currentY === -1 ? word.y : ((currentY + word.y) / 2);
        } else {
          // New row detected! Sort the finished row left-to-right (by X)
          currentRow.sort((a, b) => a.x - b.x);
          rows.push(currentRow.map(w => w.text).join(' | ')); // Use pipe for clean markdown
          
          // Start the next row
          currentRow = [word];
          currentY = word.y;
        }
      }
      
      // Add the very last row
      if (currentRow.length > 0) {
        currentRow.sort((a, b) => a.x - b.x);
        rows.push(currentRow.map(w => w.text).join(' | '));
      }

      // Calculate average confidence for the table
      let totalConf = 0;
      tableWords.forEach(w => totalConf += (w.confidence || 0));
      const avgConfidence = tableWords.length > 0 ? Math.round(totalConf / tableWords.length) : 0;

      processedTables.push({
        ...table,
        rawText: rows.join('\n'), // Used by your Lexical RAG!
        structuredData: { rows },
        text: rows.join('\n'), // Keeping for backwards compatibility 
        words: tableWords,
        confidence: avgConfidence,
        method: 'easyocr-spatial',
        accepted: true
      });

      console.log(`  ✅ Spatial Table Math: Rebuilt table instantly (${avgConfidence}% confidence)`);

    } catch (error) {
      console.error(`  ❌ Table processing error:`, error.message);
      processedTables.push({
        ...table,
        rawText: '',
        text: '',
        words: [],
        confidence: 0,
        method: 'easyocr-spatial',
        accepted: false,
        error: error.message
      });
    }
  }

  const accepted = processedTables.filter(t => t.accepted).length;
  console.log(`✅ Table formatting: ${accepted} processed instantly via coordinates`);

  return processedTables;
};

module.exports = { processTablesWithEasyOCR };