/**
 * Enhanced Document Tree Builder with Table Integration
 * FIXED: Preserves ALL extracted text without data loss + Safe property access
 */

const calculateConfidence = (text) => {
  if (!text || text.trim().length === 0) return { score: 0, label: '🔴 Empty', totalWords: 0, realWords: 0, junkWords: 0 };
  
  const words = text.trim().split(/\s+/);
  const totalWords = words.length;
  if (totalWords === 0) return { score: 0, label: '🔴 Empty', totalWords: 0, realWords: 0, junkWords: 0 };
  
  // Real words: standard English words, hyphenated words, or single letters like 'A' or 'I'
  const realWords = words.filter(w => /^[a-zA-Z]+(-[a-zA-Z]+)*$/.test(w) || ['a', 'A', 'i', 'I'].includes(w)).length;
  
  // Tech terms: code artifacts, percentages, URLs
  const techTerms = words.filter(w => /^[a-zA-Z0-9]+[./][a-zA-Z0-9]+$/.test(w) || w.includes('++') || w.endsWith('%')).length;
  
  // Numeric words: currency, commas, decimals
  const numericWords = words.filter(w => /^[\$€£-]?\d{1,3}(,\d{3})*(\.\d+)?$/.test(w) || /^\d+\.?\d*$/.test(w)).length;
  
  // Junk words: isolated punctuation, gibberish strings
  const junkWords = words.filter(w => {
    // If it's already counted as valid, it's not junk
    if (/^[a-zA-Z]+(-[a-zA-Z]+)*$/.test(w) || ['a', 'A', 'i', 'I'].includes(w)) return false;
    if (/^[\$€£-]?\d{1,3}(,\d{3})*(\.\d+)?$/.test(w) || /^\d+\.?\d*$/.test(w)) return false;
    if (/^[a-zA-Z0-9]+[./][a-zA-Z0-9]+$/.test(w) || w.includes('++') || w.endsWith('%')) return false;
    
    // It IS junk if it's pure punctuation or an unreadable string
    return /^[^\w\s]+$/.test(w) || w.length > 40;
  }).length;
  
  const validWords = realWords + numericWords + techTerms;
  let rawScore = (validWords / totalWords) * 100;
  
  const penalty = (junkWords / totalWords) * 15; 
  const bonus = (techTerms > 0) ? 5 : 0;
  const finalScore = Math.min(100, Math.max(0, rawScore - penalty + bonus));
  
  return {
    score: Math.round(finalScore),
    label: finalScore >= 85 ? '🟢 Excellent' : finalScore >= 70 ? '🟡 Good' : finalScore >= 50 ? '🟠 Fair' : '🔴 Poor',
    totalWords,
    realWords: validWords,
    junkWords,
  };
};

// ══════════════════════════════════════════════════════════
// HELPER: Clean and Structure Table Text (Enhanced)
// ══════════════════════════════════════════════════════════
const processTableText = (rawTableText) => {
  if (!rawTableText || rawTableText.trim().length === 0) {
    return {
      rawText: '',
      searchableText: '',
      cleanedText: '',
      structuredData: null
    };
  }

  // ✅ STEP 1: Remove common OCR artifacts
  let cleanedText = rawTableText
    .replace(/[|_\-]{3,}/g, ' ')  // Remove table borders (---, |||, ___)
    .replace(/[^\w\s$€£.,\-()]/g, ' ')  // Remove special chars except currency
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .replace(/(\w)\s{2,}(\w)/g, '$1 $2')  // Fix excessive spacing between words
    .trim();

  // ✅ STEP 2: Fix common OCR mistakes
  cleanedText = cleanedText
    .replace(/\bl\b/g, 'I')  // lowercase L → capital I
    .replace(/\b0\b/g, 'O')  // zero → letter O (in words)
    .replace(/(\d),(\d)/g, '$1$2')  // Remove commas in numbers for now
    .replace(/[`'']/g, "'")  // Normalize quotes
    .replace(/\s+([.,!?])/g, '$1');  // Remove space before punctuation

  // ✅ STEP 3: Create searchable version (ultra-clean)
  const searchableText = cleanedText
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // ✅ STEP 4: Try to parse into structured rows
  let structuredData = null;
  const lines = cleanedText.split('\n').filter(line => line.trim().length > 0);
  
  if (lines.length >= 2) {
    const rows = lines.map(line => {
      return line
        .split(/\s{2,}|\||\\t/)
        .map(cell => cell.trim())
        .filter(cell => cell.length > 0);
    }).filter(row => row.length > 0);

    if (rows.length > 0 && rows[0].length > 1) {
      structuredData = { rows };
    }
  }

  return {
    rawText: rawTableText,  // Keep original for debugging
    cleanedText,  // OCR-corrected version
    searchableText,  // For RAG matching
    structuredData
  };
};

// ══════════════════════════════════════════════════════════
// MAIN: Build Document Tree with Integrated Tables
// ══════════════════════════════════════════════════════════
const buildDocumentTree = (rawText, tablesData = []) => {
  console.log(`🌲 Building Document Tree (${tablesData.length} tables to integrate)...`);
  console.log(`📄 Input text length: ${rawText.length} chars`);

  const root = {
    id: "doc_root",
    type: "document",
    confidence: calculateConfidence(rawText),
    children: []
  };

  // Parse text into blocks with Y-coordinates
  const textBlocks = parseTextBlocks(rawText);
  console.log(`📦 Parsed ${textBlocks.length} text blocks`);
  
  // Merge text blocks and tables, sorted by Y-coordinate
  const allBlocks = mergeBlocksAndTables(textBlocks, tablesData);
  console.log(`🔗 Merged into ${allBlocks.length} total blocks`);
  
  // Build hierarchical structure
  let currentPage = null;
  let currentSection = null;
  let totalTextChars = 0;  // ✅ Track total text preserved

  allBlocks.forEach((block, index) => {
    if (block.type === 'page_break') {
      // Create new page node
      currentPage = {
        id: `page_${block.pageNumber}`,
        title: `Page ${block.pageNumber}`,
        type: "page",
        children: []
      };
      root.children.push(currentPage);
      currentSection = null;

    } else if (block.type === 'heading') {
      // Create section with heading
      const headingText = block.content || '';  // ✅ Safe
      totalTextChars += headingText.length;
      
      currentSection = {
        id: `section_${index}`,
        title: headingText,
        type: "section",
        content: headingText,
        text: headingText,
        y: block.y || 0,
        children: []
      };
      
      if (currentPage) {
        currentPage.children.push(currentSection);
      } else {
        root.children.push(currentSection);
      }

    } else if (block.type === 'table') {
      // ✅ CRITICAL FIX: Safe access to potentially undefined text
      const tableText = block.text || '';  // ✅ Safe default
      const tableData = processTableText(tableText);
      totalTextChars += tableText.length;  // ✅ Safe length access

      // Insert table node with enhanced data structure
      const tableNode = {
        id: `table_${index}`,
        type: "table",
        y: block.y || 0,
        x: block.x || 0,
        width: block.width || 0,
        height: block.height || 0,
        text: tableText,  // ✅ Safe
        content: tableData.cleanedText,
        tableData: {
          rawText: tableData.rawText,
          cleanedText: tableData.cleanedText,
          searchableText: tableData.searchableText,
          structuredData: tableData.structuredData
        },
        confidence: block.confidence || 0,
        strategy: block.strategy || 'unknown',
        psm: block.psm || 'unknown',
        metadata: {
          position: `(${block.x || 0}, ${block.y || 0})`,
          size: `${block.width || 0}x${block.height || 0}px`
        }
      };

      if (currentSection) {
        currentSection.children.push(tableNode);
      } else if (currentPage) {
        currentPage.children.push(tableNode);
      } else {
        root.children.push(tableNode);
      }

    } else if (block.type === 'paragraph') {
      // ✅ CRITICAL FIX: Preserve paragraph content
      const paragraphText = block.content || '';  // ✅ Safe
      totalTextChars += paragraphText.length;
      
      const paragraphNode = {
        id: `paragraph_${index}`,
        type: "paragraph",
        content: paragraphText,
        text: paragraphText,
        y: block.y || 0
      };

      if (currentSection) {
        currentSection.children.push(paragraphNode);
      } else if (currentPage) {
        currentPage.children.push(paragraphNode);
      } else {
        root.children.push(paragraphNode);
      }
    }
  });

  console.log(`✅ Document Tree built: ${root.children.length} top-level nodes`);
  console.log(`📊 Total text preserved: ${totalTextChars} chars (input: ${rawText.length})`);
  
  // ✅ WARNING: Check for data loss
  const lossPercentage = ((rawText.length - totalTextChars) / rawText.length) * 100;
  if (lossPercentage > 10) {
    console.warn(`⚠️ WARNING: ${lossPercentage.toFixed(1)}% text loss detected!`);
  }
  
  // ✅ Log table data quality
  const tableNodes = allBlocks.filter(b => b.type === 'table');
  if (tableNodes.length > 0) {
    console.log(`📊 Table processing summary:`);
    tableNodes.forEach((table, i) => {
      const processed = processTableText(table.text || '');
      console.log(`   Table ${i + 1}: ${processed.searchableText.split(' ').length} searchable words, ` +
                  `${processed.structuredData ? 'structured' : 'unstructured'}`);
    });
  }
  
  return root;
};

/**
 * ✅ FIXED: Parse raw text into blocks with Y-coordinates
 * CRITICAL BUG FIX: Properly handle page splits without losing content
 */
const parseTextBlocks = (rawText) => {
  const blocks = [];
  
  // ✅ FIX: Handle documents with or without page markers
  const hasPageMarkers = /--- Page \d+ ---/.test(rawText);
  
  if (!hasPageMarkers) {
    // ✅ No page markers - treat entire document as single page
    console.log('📄 No page markers detected - processing as single page');
    const lines = rawText.split('\n').filter(line => line.trim() !== '');
    
    lines.forEach((line, lineIndex) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return;  // Skip empty lines
      
      const estimatedY = lineIndex * 20;
      
      // Detect headings (short, all caps or title case)
      const isHeading = trimmed.length < 60 && 
                        trimmed.length > 3 && 
                        (/^[A-Z0-9\s\W]+$/.test(trimmed) || /^[A-Z][a-z]/.test(trimmed));
      
      if (isHeading) {
        blocks.push({
          type: 'heading',
          content: trimmed,
          y: estimatedY
        });
      } else {
        blocks.push({
          type: 'paragraph',
          content: trimmed,
          y: estimatedY
        });
      }
    });
    
  } else {
    // ✅ CRITICAL FIX: Properly parse multi-page documents
    console.log('📄 Page markers detected - processing multi-page document');
    
    const pageSections = rawText.split(/--- Page (\d+) ---/);
    
    // First element is content before first page marker (if any)
    if (pageSections[0] && pageSections[0].trim().length > 0) {
      const lines = pageSections[0].split('\n').filter(line => line.trim() !== '');
      lines.forEach((line, lineIndex) => {
        const trimmed = line.trim();
        if (trimmed.length === 0) return;
        
        blocks.push({
          type: 'paragraph',
          content: trimmed,
          y: lineIndex * 20
        });
      });
    }
    
    // ✅ FIXED LOOP: Process pairs of (pageNumber, pageContent)
    for (let i = 1; i < pageSections.length; i += 2) {
      const pageNumber = parseInt(pageSections[i]);
      const pageContent = pageSections[i + 1] || '';
      
      // Add page break marker
      blocks.push({ 
        type: 'page_break', 
        pageNumber 
      });
      
      // ✅ CRITICAL: Process the actual page content
      const lines = pageContent.split('\n').filter(line => line.trim() !== '');
      let currentY = 0;
      
      lines.forEach((line, lineIndex) => {
        const trimmed = line.trim();
        if (trimmed.length === 0) return;  // Skip empty lines
        
        const estimatedY = currentY + (lineIndex * 20);
        
        // Detect headings
        const isHeading = trimmed.length < 60 && 
                          trimmed.length > 3 && 
                          (/^[A-Z0-9\s\W]+$/.test(trimmed) || /^[A-Z][a-z]/.test(trimmed));
        
        if (isHeading) {
          blocks.push({
            type: 'heading',
            content: trimmed,
            y: estimatedY
          });
        } else {
          blocks.push({
            type: 'paragraph',
            content: trimmed,  // ✅ Actual text content preserved!
            y: estimatedY
          });
        }
      });
    }
  }
  
  console.log(`✅ Parsed ${blocks.length} blocks from text`);
  return blocks;
};

/**
 * Merge text blocks and tables, sorted by Y-coordinate
 */
const mergeBlocksAndTables = (textBlocks, tablesData) => {
  const merged = [...textBlocks];

  // Add tables to the merged array
  tablesData.forEach(table => {
    merged.push({
      type: 'table',
      y: table.y || 0,
      x: table.x || 0,
      width: table.width || 0,
      height: table.height || 0,
      text: table.text || '',  // ✅ Safe default
      confidence: table.confidence || 0,
      strategy: table.strategy || 'unknown',
      psm: table.psm || 'unknown'
    });
  });

  // Sort by Y-coordinate (top to bottom reading order)
  merged.sort((a, b) => {
    // Page breaks come first within their Y range
    if (a.type === 'page_break' && b.type !== 'page_break') return -1;
    if (a.type !== 'page_break' && b.type === 'page_break') return 1;
    
    // Then sort by Y-coordinate
    return (a.y || 0) - (b.y || 0);
  });

  return merged;
};

module.exports = { buildDocumentTree };