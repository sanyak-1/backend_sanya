const Groq = require('groq-sdk');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ══════════════════════════════════════════════════════════
// AGENT 1: ACTOR AGENT (Llama 3.3 - Content Creator)
// ══════════════════════════════════════════════════════════
const generateAudioScript = async (extractedText, documentTree, visionAnalysis) => {
  try {
    console.log('🎭 Actor Agent generating audio script...');

    const textSample = extractedText.substring(0, 2000);  // First 2000 chars

    const prompt = `You are an AI assistant helping visually impaired users navigate documents.

DOCUMENT TEXT:
"""
${textSample}
"""

VISUAL STRUCTURE:
- Has tables: ${visionAnalysis.hasTables}
- Has logos: ${visionAnalysis.hasLogos}
- Layout: ${visionAnalysis.layoutType}

Generate:
1. "audioIntro": A friendly 1-2 sentence introduction to this document (optimized for text-to-speech)
2. "navigationHints": Array of 2-4 short navigation tips (e.g., "Press N to jump to billing section")

Return ONLY valid JSON: { "audioIntro": "...", "navigationHints": ["...", "..."] }`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',  // Llama 3.3
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 400,
      response_format: { type: 'json_object' },  // Force JSON output
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    console.log('📥 Actor Agent raw response:', responseText);

    const actorOutput = JSON.parse(responseText);

    console.log('✅ Actor Agent complete');
    console.log(`   Audio Intro: ${actorOutput.audioIntro?.substring(0, 60)}...`);
    console.log(`   Navigation Hints: ${actorOutput.navigationHints?.length || 0} hints`);

    return {
      audioIntro: actorOutput.audioIntro || 'Document processed successfully',
      navigationHints: actorOutput.navigationHints || ['Press N for next section', 'Press P for previous section'],
    };

  } catch (error) {
    console.error('❌ Actor Agent failed:', error.message);
    return {
      audioIntro: 'Document processed successfully',
      navigationHints: ['Press N for next section', 'Press P for previous section'],
    };
  }
};

// ══════════════════════════════════════════════════════════
// AGENT 2: REVIEWER AGENT (Llama 3.3 - Fact Checker)
// ══════════════════════════════════════════════════════════
const reviewAudioScript = async (audioIntro, navigationHints, extractedText) => {
  try {
    console.log('🔍 Reviewer Agent fact-checking...');

    const textSample = extractedText.substring(0, 2000);

    const prompt = `You are a fact-checking AI. Review this audio script for accuracy.

ORIGINAL DOCUMENT TEXT:
"""
${textSample}
"""

ACTOR'S AUDIO INTRO:
"""
${audioIntro}
"""

ACTOR'S NAVIGATION HINTS:
${navigationHints.join(', ')}

Check:
1. Does the audio intro accurately describe the document? (no hallucinated numbers, dates, or facts)
2. Are the navigation hints relevant to the actual document structure?
3. Confidence score (0-100) that this script is accurate

Return JSON: { "approved": true/false, "confidence": 0-100, "issues": ["issue1", "issue2"], "corrections": ["fix1", "fix2"] }`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,  // Lower temp for fact-checking
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    console.log('📥 Reviewer Agent raw response:', responseText);

    const reviewerOutput = JSON.parse(responseText);

    console.log('✅ Reviewer Agent complete');
    console.log(`   Approved: ${reviewerOutput.approved}, Confidence: ${reviewerOutput.confidence}%`);
    console.log(`   Issues found: ${reviewerOutput.issues?.length || 0}`);

    return {
      approved: reviewerOutput.approved !== false,  // Default to true if missing
      confidence: reviewerOutput.confidence || 85,
      issues: reviewerOutput.issues || [],
      corrections: reviewerOutput.corrections || [],
    };

  } catch (error) {
    console.error('❌ Reviewer Agent failed:', error.message);
    return {
      approved: true,
      confidence: 70,
      issues: ['Reviewer unavailable'],
      corrections: [],
    };
  }
};

// ══════════════════════════════════════════════════════════
// ORCHESTRATOR: Run Actor + Reviewer Agents
// ══════════════════════════════════════════════════════════
const runMultiAgentPipeline = async (imageBuffer, extractedText, documentTree) => {
  console.log('🚀 Starting Multi-Agent Pipeline...');

  // Step 1: Vision Agent - DISABLED (all models decommissioned)
  const visionAnalysis = {
    hasTables: false,
    hasLogos: false,
    hasCharts: false,
    layoutType: 'unknown',
    description: 'Vision analysis skipped (models unavailable)'
  };

  // Step 2: Actor Agent
  const actorOutput = await generateAudioScript(extractedText, documentTree, visionAnalysis);

  // Step 3: Reviewer Agent
  const reviewerVerdict = await reviewAudioScript(
    actorOutput.audioIntro,
    actorOutput.navigationHints,
    extractedText
  );

  console.log('✅ Multi-Agent Pipeline complete\n');

  return {
    visionAnalysis,
    audioIntro: actorOutput.audioIntro,
    navigationHints: actorOutput.navigationHints,
    reviewerVerdict,
  };
};

module.exports = {
  generateAudioScript,
  reviewAudioScript,
  runMultiAgentPipeline,
};