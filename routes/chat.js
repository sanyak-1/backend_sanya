const express = require('express');
const Groq = require('groq-sdk');
const Document = require('../models/Document');

const router = express.Router();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ══════════════════════════════════════════════════════════
// HELPER: Flatten Document Tree (All Nodes)
// ══════════════════════════════════════════════════════════
function flattenTree(structure) {
  const nodes = [];
  
  function traverse(node) {
    if (!node) return;
    
    // Add current node
    nodes.push(node);
    
    // Recursively traverse children
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(child => traverse(child));
    }
  }
  
  if (Array.isArray(structure)) {
    structure.forEach(node => traverse(node));
  } else if (structure && structure.children) {
    traverse(structure);
  } else if (structure) {
    nodes.push(structure);
  }
  
  return nodes;
}

// ══════════════════════════════════════════════════════════
// HELPER: Extract Keywords with Smart Filtering
// ══════════════════════════════════════════════════════════
function extractKeywords(question) {
  const stopWords = new Set([
    'what', 'is', 'the', 'a', 'an', 'of', 'in', 'on', 'for', 'to', 'with',
    'how', 'many', 'much', 'are', 'does', 'do', 'did', 'can', 'could',
    'would', 'should', 'will', 'be', 'this', 'that', 'these', 'those',
    'it', 'its', 'from', 'by', 'at', 'and', 'or', 'not', 'but', 'which',
    'where', 'who', 'whom', 'whose', 'why', 'tell', 'me', 'about', 'please'
  ]);

  return question
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 0 && !stopWords.has(word));
}

// ══════════════════════════════════════════════════════════
// HELPER: Get Searchable Text from Node (Handles All Types)
// ══════════════════════════════════════════════════════════
function getSearchableText(node) {
  const textParts = [];
  
  // Standard text fields
  if (node.text) textParts.push(node.text);
  if (node.content) textParts.push(node.content);
  if (node.title) textParts.push(node.title);
  
  // Table-specific fields (use searchableText for best matching)
  if (node.type === 'table') {
    if (node.tableData?.searchableText) textParts.push(node.tableData.searchableText);
    if (node.tableData?.cleanedText) textParts.push(node.tableData.cleanedText);
    if (node.tableData?.rawText) textParts.push(node.tableData.rawText);
    if (node.tableData?.structuredData?.rows) {
      const rows = node.tableData.structuredData.rows;
      textParts.push(rows.flat().join(' '));
    }
  }
  
  return textParts.join(' ').toLowerCase();
}

// ══════════════════════════════════════════════════════════
// HELPER: Smart Node Filtering (Fuzzy + Partial Matching)
// ══════════════════════════════════════════════════════════
function filterRelevantNodes(nodes, keywords) {
  const scoredNodes = nodes.map(node => {
    const searchText = getSearchableText(node);
    let score = 0;
    
    keywords.forEach(keyword => {
      // Exact match (high score)
      if (searchText.includes(keyword)) {
        score += 10;
      }
      // Partial match (medium score)
      else if (searchText.includes(keyword.substring(0, Math.max(3, keyword.length - 2)))) {
        score += 5;
      }
      // Word boundary match (e.g., "burger" matches "burgers")
      else if (new RegExp(`\\b${keyword}`, 'i').test(searchText)) {
        score += 7;
      }
    });
    
    // Boost table nodes (they often contain the answer)
    if (node.type === 'table') {
      score += 3;
    }
    
    return { node, score };
  });
  
  // Return nodes with score > 0, sorted by relevance
  return scoredNodes
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.node);
}

// ══════════════════════════════════════════════════════════
// HELPER: Build Context String from Nodes
// ══════════════════════════════════════════════════════════
function buildContext(nodes) {
  let context = '';
  
  nodes.forEach((node, index) => {
    // Headings
    if (node.type === 'heading' || node.type === 'section') {
      context += `\n## ${node.title || node.content || node.text}\n\n`;
    }
    // Paragraphs
    else if (node.type === 'paragraph' || node.type === 'content') {
      context += `${node.content || node.text}\n\n`;
    }
    // Tables
    else if (node.type === 'table') {
      context += `\n=== TABLE ${index + 1} START ===\n`;
      
      // ✅ CRITICAL FIX: Use cleanedText instead of rawText
      const tableText = node.tableData?.cleanedText || 
                        node.tableData?.rawText || 
                        node.text || '';
      
      // Try structured data first
      if (node.tableData?.structuredData?.rows && node.tableData.structuredData.rows.length > 0) {
        const rows = node.tableData.structuredData.rows;
        
        // Render as clean markdown table
        context += rows[0].join(' | ') + '\n';
        context += rows[0].map(() => '---').join(' | ') + '\n';
        for (let i = 1; i < rows.length; i++) {
          context += rows[i].join(' | ') + '\n';
        }
      } else {
        // Use cleaned text (OCR artifacts removed)
        context += tableText + '\n';
      }
      
      context += `=== TABLE ${index + 1} END ===\n\n`;
    }
    // Other nodes
    else if (node.text || node.content) {
      context += `${node.text || node.content}\n\n`;
    }
  });
  
  return context.trim();
}

// ══════════════════════════════════════════════════════════
// MAIN ENDPOINT
// ══════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  try {
    const { documentId, question } = req.body;

    if (!documentId || !question) {
      return res.status(400).json({ error: 'Missing required fields: documentId and question' });
    }

    console.log(`\n💬 Chat query: "${question}" for document: ${documentId}`);

    // ── Retrieve Document ──────────────────────────────────
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    console.log(`📄 Document: ${document.originalName}`);

    // ── Check Q&A Cache ────────────────────────────────────
    const normalizedQuestion = question.trim().toLowerCase();
    const cachedQnA = document.chatHistory?.find(
      (entry) => entry.question.toLowerCase() === normalizedQuestion
    );

    if (cachedQnA) {
      console.log('⚡ CACHE HIT! Returning saved answer (0 tokens used)');
      return res.status(200).json({
        success: true,
        question,
        answer: cachedQnA.answer,
        confidence: cachedQnA.confidence,
        sourceQuote: cachedQnA.sourceQuote,
        documentId: document._id,
        documentName: document.originalName,
        ragMetrics: {
          cached: true,
          tokensSaved: '100%',
          nodesSearched: 0,
          nodesRetrieved: 0
        }
      });
    }

    // ── STEP 1: Flatten Tree ───────────────────────────────
    let allNodes = [];
    
    if (document.pages && document.pages.length > 0) {
      // Multi-page PDF
      document.pages.forEach(page => {
        if (page.structure) {
          allNodes = allNodes.concat(flattenTree(page.structure));
        }
      });
    } else if (document.structure) {
      // Single image
      allNodes = flattenTree(document.structure);
    }

    console.log(`📊 Total document nodes: ${allNodes.length}`);

    // ── STEP 2: Extract Keywords ───────────────────────────
    const keywords = extractKeywords(question);
    console.log(`🔍 Keywords extracted: [${keywords.join(', ')}]`);

    // ── STEP 3: Filter Relevant Nodes ──────────────────────
    let retrievedNodes = [];
    
    if (allNodes.length < 10 || keywords.length === 0) {
      console.log('⚡ Small document: Using all nodes');
      retrievedNodes = allNodes;
    } else {
      retrievedNodes = filterRelevantNodes(allNodes, keywords);
      
      // CRITICAL: Minimum context threshold (at least 30% of document)
      const minNodes = Math.max(5, Math.ceil(allNodes.length * 0.3));
      
      if (retrievedNodes.length === 0) {
        console.log('⚠️ No keyword matches found. Using top 10 nodes by position.');
        retrievedNodes = allNodes.slice(0, 10);
      } else if (retrievedNodes.length < minNodes) {
        console.log(`⚠️ Only ${retrievedNodes.length} nodes matched. Expanding to ${minNodes} nodes.`);
        // Add more nodes to meet minimum threshold
        const additionalNodes = allNodes
          .filter(node => !retrievedNodes.includes(node))
          .slice(0, minNodes - retrievedNodes.length);
        retrievedNodes = [...retrievedNodes, ...additionalNodes];
      }
    }

    console.log(`📄 Retrieved nodes: ${retrievedNodes.length}/${allNodes.length}`);
    const tokenSavings = Math.round((1 - retrievedNodes.length / allNodes.length) * 100);
    console.log(`💰 Estimated token savings: ${tokenSavings}%`);

    // ── STEP 4: Build Context ──────────────────────────────
    const contextString = buildContext(retrievedNodes);

    console.log(`\n--- 🔍 CONTEXT SENT TO AI (${contextString.length} chars) ---`);
    console.log(contextString.substring(0, 500));
    if (contextString.length > 500) console.log('... (truncated)');
    console.log('-------------------------------------------\n');

    // ── STEP 5: Query Groq ─────────────────────────────────
    console.log('🤖 Querying Groq with optimized context...');

    // ✅ FIX 3: STRENGTHENED CONFIDENCE PROMPT
    const systemPrompt = `You are a precise document Q&A assistant. Answer questions using ONLY the provided context.

CRITICAL CONFIDENCE RULES:
1. If you find a CLEAR, EXACT match in the context → Set confidence to 95-100
2. If you find a PARTIAL match or need to infer → Set confidence to 85-94
3. If the answer is ABSOLUTELY NOT in the context → Respond "Information not found in document" with confidence 0

HANDLING MESSY OCR TEXT:
- The context may have OCR errors (e.g., "buffa1o" instead of "buffalo")
- Use fuzzy matching and common sense to interpret the text
- Ignore formatting artifacts like "|", "---", or excessive spaces
- Focus on the actual content words

ANSWER FORMAT:
- Keep answers EXTREMELY concise (5-15 words)
- Extract EXACT information, don't paraphrase
- Always cite the source quote

CONTEXT (OCR-extracted, may contain artifacts):
"""
${contextString}
"""

Return JSON with:
{
  "answer": "ultra-concise answer or 'Information not found in document'",
  "confidence": 0-100 (use 95+ for clear matches),
  "sourceQuote": "exact text from context (include OCR artifacts if present)"
}`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const aiResponse = JSON.parse(completion.choices[0]?.message?.content || '{}');
    
    const answer = aiResponse.answer || 'Unable to process question';
    const confidence = aiResponse.confidence || 0;
    const sourceQuote = aiResponse.sourceQuote || '';

    console.log(`✅ Answer generated | Confidence: ${confidence}%`);
    console.log(`📝 Answer: ${answer.substring(0, 100)}${answer.length > 100 ? '...' : ''}`);

    // ── STEP 6: Save to Cache ──────────────────────────────
    if (!document.chatHistory) {
      document.chatHistory = [];
    }
    
    document.chatHistory.push({
      question: question.trim(),
      answer,
      confidence,
      sourceQuote,
      askedAt: new Date()
    });
    
    await document.save();
    console.log('💾 Saved Q&A to cache\n');

    // ── Response ───────────────────────────────────────────
    return res.status(200).json({
      success: true,
      question,
      answer,
      confidence,
      sourceQuote,
      documentId: document._id,
      documentName: document.originalName,
      ragMetrics: {
        cached: false,
        nodesSearched: allNodes.length,
        nodesRetrieved: retrievedNodes.length,
        tokenSavings: `${tokenSavings}%`,
        keywordsUsed: keywords.length
      }
    });

  } catch (error) {
    console.error('❌ Chat error:', error.message);
    return res.status(500).json({
      error: `Chat failed: ${error.message}`
    });
  }
});

module.exports = router;