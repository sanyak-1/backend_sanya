const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// 1. 🚀 NEW: Import rate limiter
const rateLimit = require('express-rate-limit'); 
require('dotenv').config();

const uploadRoute = require('./routes/upload');
const chatRoute = require('./routes/chat');  // ✅ NEW

const app = express();
const PORT = process.env.PORT || 5000;

// 2. 🚀 NEW: Define the Limiter Rules (Max 15 requests per minute)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 15, // Limit each IP to 15 requests per windowMs
  message: { 
    success: false, 
    error: 'Too many requests from this IP, please try again after a minute.' 
  },
  standardHeaders: true, 
  legacyHeaders: false, 
});

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ─────────────────────────────────────────────────
// 3. 🚀 NEW: Apply the apiLimiter to your sensitive endpoints
app.use('/api/upload', apiLimiter, uploadRoute);
app.use('/api/chat', apiLimiter, chatRoute);  // ✅ NEW

app.get('/', (req, res) => {
  res.json({ message: '🧠 DocuMind API is running' });
});

// ── MongoDB Connection ─────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });