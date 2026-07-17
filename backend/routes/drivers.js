/**
 * routes/drivers.js — Driver Registration & Profile API
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Configure multer for public registration uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'driver_docs');
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});
const upload = multer({ storage });

// ===== POST /api/drivers/register =====
// Independent driver registration
router.post('/register', upload.fields([{ name: 'profile_photo', maxCount: 1 }, { name: 'license_photo', maxCount: 1 }]), async (req, res) => {
  const {
    username, password, full_name, mobile_number, address,
    driving_license_number, license_expiry_date, vehicle_types,
    years_of_experience, languages_known, preferred_location, expected_salary,
    prev_company_name, prev_owner_name, prev_employment_period, reason_for_leaving,
    reference_contact_number, reference_consent
  } = req.body;

  if (!username || !password || !full_name || !mobile_number) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  let profilePhotoUrl = null;
  let licensePhotoUrl = null;

  if (req.files) {
    if (req.files['profile_photo']) {
      profilePhotoUrl = `uploads/driver_docs/${req.files['profile_photo'][0].filename}`;
    }
    if (req.files['license_photo']) {
      licensePhotoUrl = `uploads/driver_docs/${req.files['license_photo'][0].filename}`;
    }
  }

  const consentBool = (reference_consent === 'true' || reference_consent === true) ? 1 : 0;

  try {
    // 1. Check if username exists
    const [existing] = await db.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length) {
      return res.status(400).json({ message: 'Username/Email already exists' });
    }

    // 2. Hash password & Insert into users
    const hashedPassword = await bcrypt.hash(password, 10);
    const [userResult] = await db.execute(
      'INSERT INTO users (username, password, role, profile_picture_url) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, 'driver', profilePhotoUrl]
    );
    const userId = userResult.insertId;

    // 3. Insert into driver_profiles
    await db.execute(
      `INSERT INTO driver_profiles (
        user_id, full_name, mobile_number, address, driving_license_number,
        license_expiry_date, vehicle_types, years_of_experience, languages_known,
        preferred_location, expected_salary, id_proof_url,
        prev_company_name, prev_owner_name, prev_employment_period, reason_for_leaving,
        reference_contact_number, reference_consent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, full_name, mobile_number, address || null, driving_license_number || null,
        license_expiry_date || null, vehicle_types || null, years_of_experience || 0,
        languages_known || null, preferred_location || null, expected_salary || null, licensePhotoUrl,
        prev_company_name || null, prev_owner_name || null, prev_employment_period || null, reason_for_leaving || null,
        reference_contact_number || null, consentBool
      ]
    );

    return res.status(201).json({ message: 'Driver registered successfully' });
  } catch (err) {
    console.error('Driver registration error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== GET /api/drivers/profile =====
// Get logged in driver's profile
router.get('/profile', verifyToken, async (req, res) => {
  if (req.user.role !== 'driver') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    const [rows] = await db.execute(
      `SELECT * FROM driver_profiles WHERE user_id = ?`,
      [req.user.id]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Profile not found' });
    }
    return res.json({ profile: rows[0] });
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== PUT /api/drivers/profile/availability =====
router.put('/profile/availability', verifyToken, async (req, res) => {
  if (req.user.role !== 'driver') return res.status(403).json({ message: 'Access denied' });
  
  const { availability } = req.body;
  if (!['Available', 'On Duty', 'Not Looking for Job'].includes(availability)) {
    return res.status(400).json({ message: 'Invalid availability status' });
  }

  try {
    await db.execute('UPDATE driver_profiles SET availability = ? WHERE user_id = ?', [availability, req.user.id]);
    return res.json({ message: 'Availability updated' });
  } catch (err) {
    console.error('Update availability error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== GET /api/drivers =====
// Owner searches for drivers
router.get('/', verifyToken, async (req, res) => {
  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }

  try {
    let query = `
      SELECT dp.*, u.profile_picture_url, u.username,
      (SELECT AVG(rating) FROM reviews WHERE reviewee_id = dp.user_id) as average_rating
      FROM driver_profiles dp
      JOIN users u ON dp.user_id = u.id
      WHERE dp.availability = 'Available'
    `;
    const params = [];

    const { location, vehicle_type, experience } = req.query;
    if (location) {
      query += ' AND dp.preferred_location LIKE ?';
      params.push(`%${location}%`);
    }
    if (vehicle_type) {
      query += ' AND dp.vehicle_types LIKE ?';
      params.push(`%${vehicle_type}%`);
    }
    if (experience) {
      query += ' AND dp.years_of_experience >= ?';
      params.push(parseInt(experience));
    }

    const [rows] = await db.query(query, params);
    return res.json({ drivers: rows });
  } catch (err) {
    console.error('Search drivers error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
