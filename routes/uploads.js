/**
 * routes/uploads.js — File Upload Routes
 * Handles diesel bills, load bills, weight bills, vehicle photos
 * Files stored in: uploads/<doc_type>/<timestamp>_<originalname>
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// ===== MULTER STORAGE =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const docType = req.body.doc_type || 'other';
    const uploadPath = path.join(
      __dirname, '..', process.env.UPLOAD_DIR || 'uploads', docType
    );
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 40);
    const ts = Date.now();
    cb(null, `${ts}_${base}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp|pdf|doc|docx/;
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.test(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only image and document files are allowed (jpg, png, gif, webp, pdf, doc, docx)'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024 }
});

// ===== POST /api/uploads — General document upload =====
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const { vehicle_id, trip_id, doc_type, notes } = req.body;
  const docType = req.body.doc_type || 'other';
  const fileUrl = `uploads/${docType}/${req.file.filename}`;

  try {
    const [result] = await db.execute(
      `INSERT INTO uploads (vehicle_id, trip_id, doc_type, file_name, file_url, file_size, mime_type, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vehicle_id || null,
        trip_id || null,
        docType,
        req.file.originalname,
        fileUrl,
        req.file.size,
        req.file.mimetype,
        notes || null
      ]
    );

    return res.status(201).json({
      message: 'File uploaded successfully',
      id: result.insertId,
      file_name: req.file.originalname,
      file_url: fileUrl,
      file_size: req.file.size,
      mime_type: req.file.mimetype
    });
  } catch (err) {
    // Clean up uploaded file on DB error
    fs.unlink(req.file.path, () => {});
    console.error('Upload DB error:', err);
    return res.status(500).json({ message: 'Failed to save upload record' });
  }
});

// ===== POST /api/uploads/photo — Vehicle photo upload =====
router.post('/photo', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  const fileUrl = `uploads/vehicle_photo/${req.file.filename}`;
  return res.status(201).json({
    message: 'Photo uploaded',
    file_url: fileUrl,
    file_name: req.file.originalname
  });
});

// ===== GET /api/uploads — List uploads =====
router.get('/', async (req, res) => {
  try {
    const { vehicle_id, trip_id, doc_type } = req.query;
    let query = 'SELECT * FROM uploads WHERE 1=1';
    const params = [];

    if (vehicle_id) { query += ' AND vehicle_id = ?'; params.push(vehicle_id); }
    if (trip_id) { query += ' AND trip_id = ?'; params.push(trip_id); }
    if (doc_type) { query += ' AND doc_type = ?'; params.push(doc_type); }

    query += ' ORDER BY created_at DESC';
    const [rows] = await db.execute(query, params);
    return res.json(rows);
  } catch (err) {
    console.error('List uploads error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== DELETE /api/uploads/:id =====
router.delete('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM uploads WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Upload not found' });

    const record = rows[0];

    // Delete physical file
    const filePath = path.join(__dirname, '..', record.file_url);
    fs.unlink(filePath, () => {}); // Ignore error if file doesn't exist

    // Delete DB record
    await db.execute('DELETE FROM uploads WHERE id = ?', [req.params.id]);
    return res.json({ message: 'File deleted successfully' });
  } catch (err) {
    console.error('Delete upload error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
