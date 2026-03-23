const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// ✅ CORRECT IMPORT: Import the model we defined in models/Document.js
const Document = require('../models/Document');

// DELETE /api/documents/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Find the document first
    const doc = await Document.findById(id);

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    // 2. (Optional) Delete the physical file if you want to save space
    // if (doc.originalName) {
    //    const filePath = path.join(__dirname, '../uploads', doc.originalName); 
    //    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    // }

    // 3. Delete from MongoDB
    await Document.findByIdAndDelete(id);

    return res.status(200).json({ 
      success: true, 
      message: '✅ Document deleted successfully',
      id: id
    });

  } catch (error) {
    console.error('Delete Error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
});

module.exports = router;