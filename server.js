/**
 * server.js — Main Express Server
 * Abhishek's Vehicle Portfolio — Fleet Management System
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CORS =====
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5500',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:3000',
  // Allow S3 bucket URLs (add yours here after deployment)
  // 'http://your-bucket.s3-website.ap-south-1.amazonaws.com'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o)) || !origin) {
      callback(null, true);
    } else {
      // In dev mode allow any origin
      if (process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// ===== BODY PARSERS =====
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ===== STATIC FILE SERVING (uploaded files) =====
const uploadDir = path.join(__dirname, process.env.UPLOAD_DIR || 'uploads');
app.use('/uploads', express.static(uploadDir));

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    server: "Abhishek's Vehicle Portfolio API",
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ===== API ROUTES =====
app.use('/api/auth', require('./routes/auth'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/trips', require('./routes/trips'));
app.use('/api/diesel', require('./routes/diesel'));
app.use('/api/service', require('./routes/service'));
app.use('/api/uploads', require('./routes/uploads'));

// ===== 404 HANDLER =====
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.url} not found` });
});

// ===== GLOBAL ERROR HANDLER =====
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error', error: process.env.NODE_ENV !== 'production' ? err.message : undefined });
});

// ===== START SERVER =====
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log("║   Abhishek's Vehicle Portfolio — Backend API    ║");
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  🚛  Server running on port ${PORT}`);
  console.log(`  🔗  Health check: http://localhost:${PORT}/health`);
  console.log(`  📁  Uploads dir:  ${uploadDir}`);
  console.log(`  🌍  Environment:  ${process.env.NODE_ENV || 'development'}`);
  console.log('');
});

module.exports = app;
