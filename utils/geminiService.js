const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config(); // Ensure env vars are loaded

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Analyzes document text with Gemini 1.5 Flash (Stable Version)
 * Returns: { classification, visualSummary, audioIntro }
 */
const analyzeDocument = async (extractedText) => {
  try {
    console.log('🤖 Gemini analyzing document...');

    // ✅ FIXED: Use the specific version ID 'gemini-1.5-flash-001' 
    // This prevents 404 errors caused by generic aliases not resolving.
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-001", 
      generationConfig: {
        responseMimeType: "application/json", // Forces JSON output
        temperature: 0.1, // Lower temperature = more deterministic/accurate
      },
    });

    // Truncate text to avoid token limits (safe limit for Flash is huge, but good practice)
    const textSample = extractedText ? extractedText.substring(0, 10000) : "";

    const prompt = `
    You are an assistive technology AI. Analyze this document text and return a raw JSON object.
    
    Fields required:
    1. "classification": String (Choose ONE: Invoice, Receipt, Report, Form, Letter, Resume, Contract, Manual, Article, Other)
    2. "visualSummary": Array of Strings (3 short bullet points summarizing the visual layout and key content)
    3. "audioIntro": String (A warm, helpful 1-sentence summary meant to be read aloud to a blind user. Start with "This document appears to be...")

    Document Text:
    """
    ${textSample}
    """
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    console.log('📥 Gemini raw response received');

    // Parse JSON response
    const analysis = JSON.parse(responseText);

    console.log('✅ Gemini analysis complete');
    console.log(`   Classification: ${analysis.classification}`);
    
    // Handle array or string for visualSummary safely
    const summaryPreview = Array.isArray(analysis.visualSummary) 
      ? analysis.visualSummary.join(', ') 
      : analysis.visualSummary;
      
    console.log(`   Visual Summary: ${summaryPreview ? summaryPreview.substring(0, 50) : ''}...`);
    console.log(`   Audio Intro: ${analysis.audioIntro}`);

    return {
      classification: analysis.classification || 'Other',
      visualSummary: analysis.visualSummary || [], 
      audioIntro: analysis.audioIntro || 'Document processed.',
    };

  } catch (error) {
    console.error('❌ Gemini analysis failed:', error.message);
    // Return safe defaults on error so the app doesn't crash
    return {
      classification: 'Unclassified',
      visualSummary: ['Analysis unavailable due to error.'],
      audioIntro: 'This document was processed, but the AI summary is currently unavailable.',
    };
  }
};

module.exports = { analyzeDocument };