const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
  originalName: {
    type: String,
    required: true,
  },
  extractedText: {
    type: String,
    default: '',
  },
  structure: {
    type: Object,
    default: {},
  },
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