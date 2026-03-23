const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
  originalName: {
    type: String,
    required: true,
  },
  fileHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  extractedText: {
    type: String,
    default: '',
  },
  structure: {
    type: Object,
    default: {},
  },
  // ── Spatial Data (Bounding Boxes from OCR) ────────────
  spatialData: {
    type: Array,  // Array of page objects with word coordinates
    default: [],
  },
  // ── Vision Agent Output ────────────────────────────────
  visionAnalysis: {
    type: Object,
    default: {
      hasTables: false,
      hasLogos: false,
      hasCharts: false,
      layoutType: 'unknown',
      description: '',
    },
  },
  // ── Actor Agent Output ─────────────────────────────────
  audioIntro: {
    type: String,
    default: '',
  },
  navigationHints: {
    type: Array,  // ["Press N for next section", "Press P for previous"]
    default: [],
  },
  // ── Reviewer Agent Output ──────────────────────────────
  reviewerVerdict: {
    type: Object,
    default: {
      approved: false,
      confidence: 0,
      issues: [],
      corrections: [],
    },
  },
  // ── Q&A Cache (Zero-Cost Repeat Answers) ───────────────
  chatHistory: [{
    question: String,
    answer: String,
    confidence: Number,
    sourceQuote: String,
    askedAt: { type: Date, default: Date.now }
  }],
  // ── Original Fields ────────────────────────────────────
  pipeline: {
    type: String,
    default: '',
  },
  mimetype: {
    type: String,
    default: '',
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Document', DocumentSchema);