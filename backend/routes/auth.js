/**
 * routes/auth.js — Authentication Routes
 * POST /api/auth/login
 * GET  /api/auth/me
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// ===== POST /api/auth/login =====
router.post('/login', [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const { username, password } = req.body;

  try {
    const [rows] = await db.execute(
      'SELECT id, username, password, role, owner_id, profile_picture_url FROM users WHERE username = ?',
      [username]
    );

    if (!rows.length) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, owner_id: user.owner_id },
      process.env.JWT_SECRET || 'fallback_secret_change_in_prod',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        owner_id: user.owner_id,
        profile_picture_url: user.profile_picture_url
      }
    });
  } catch(err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== GET /api/auth/me =====
router.get('/me', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, username, role, owner_id, profile_picture_url, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    return res.json({ user: rows[0] });
  } catch(err) {
    console.error('Me error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== POST /api/auth/register (Owner Registration) =====
router.post('/register', [
  body('username').trim().notEmpty().withMessage('Username/Email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const { username, password } = req.body;

  try {
    const [existing] = await db.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length) {
      return res.status(400).json({ message: 'Username/Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.execute(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      [username, hashedPassword, 'owner']
    );

    return res.status(201).json({ message: 'Owner registered successfully' });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== POST /api/auth/drivers (Create Driver Account) =====
router.post('/drivers', verifyToken, [
  body('username').trim().notEmpty().withMessage('Driver unique ID is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only owners can manage drivers' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const { username, password, vehicle_id, vehicle_number } = req.body;

  try {
    const [existing] = await db.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length) {
      return res.status(400).json({ message: 'Driver ID already exists' });
    }

    let resolvedVehicleId = null;
    if (vehicle_number && vehicle_number.trim() !== '') {
      const [vehicles] = await db.execute(
        'SELECT id FROM vehicles WHERE vehicle_number = ? AND owner_id = ?',
        [vehicle_number.trim(), req.user.id]
      );
      if (!vehicles.length) {
        return res.status(400).json({ message: `Vehicle number "${vehicle_number}" does not exist under your account` });
      }
      resolvedVehicleId = vehicles[0].id;
    } else if (vehicle_id) {
      resolvedVehicleId = vehicle_id;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      'INSERT INTO users (username, password, role, owner_id) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, 'driver', req.user.id]
    );

    const driverUserId = result.insertId;

    if (resolvedVehicleId) {
      await db.execute(
        'UPDATE vehicles SET driver_user_id = ? WHERE id = ? AND owner_id = ?',
        [driverUserId, resolvedVehicleId, req.user.id]
      );
    }

    return res.status(201).json({ message: 'Driver created successfully' });
  } catch (err) {
    console.error('Create driver error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== GET /api/auth/drivers (List Owner\'s Drivers) =====
router.get('/drivers', verifyToken, async (req, res) => {
  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only owners can list drivers' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT u.id, u.username, u.profile_picture_url, u.created_at, v.vehicle_number, dp.full_name, dp.mobile_number 
       FROM users u
       LEFT JOIN vehicles v ON v.driver_user_id = u.id
       LEFT JOIN driver_profiles dp ON u.id = dp.user_id
       WHERE u.owner_id = ? AND u.role = 'driver'
       ORDER BY u.created_at DESC`,
      [req.user.id]
    );
    return res.json({ drivers: rows });
  } catch (err) {
    console.error('List drivers error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== DELETE /api/auth/drivers/:id =====
router.delete('/drivers/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only owners can manage drivers' });
  }

  try {
    const [result] = await db.execute(
      'DELETE FROM users WHERE id = ? AND owner_id = ? AND role = ?',
      [req.params.id, req.user.id, 'driver']
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Driver not found or unauthorized' });
    }
    return res.json({ message: 'Driver deleted successfully' });
  } catch (err) {
    console.error('Delete driver error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== PUT /api/auth/drivers/:id/vehicle =====
router.put('/drivers/:id/vehicle', verifyToken, async (req, res) => {
  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only owners can manage drivers' });
  }

  const { vehicle_number } = req.body;
  
  try {
    // 1. Verify driver belongs to owner
    const [driver] = await db.execute('SELECT id FROM users WHERE id = ? AND owner_id = ? AND role = ?', [req.params.id, req.user.id, 'driver']);
    if (driver.length === 0) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // 2. Clear old vehicle assignments for this driver
    await db.execute('UPDATE vehicles SET driver_user_id = NULL WHERE driver_user_id = ? AND owner_id = ?', [req.params.id, req.user.id]);

    // 3. If a new vehicle number is provided, assign it
    if (vehicle_number && vehicle_number.trim() !== '') {
      const [vehicles] = await db.execute('SELECT id FROM vehicles WHERE vehicle_number = ? AND owner_id = ?', [vehicle_number.trim(), req.user.id]);
      if (vehicles.length === 0) {
        return res.status(404).json({ message: `Vehicle ${vehicle_number} not found` });
      }
      
      await db.execute('UPDATE vehicles SET driver_user_id = ? WHERE id = ?', [req.params.id, vehicles[0].id]);
    }
    
    return res.json({ message: 'Vehicle assignment updated successfully' });
  } catch (err) {
    console.error('Update driver vehicle error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
