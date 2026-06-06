/**
 * routes/vehicles.js — Vehicle CRUD + Service Alerts
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// Apply auth to all routes
router.use(verifyToken);

// ===== GET /api/vehicles/service-alerts =====
// Must be defined BEFORE /:id to avoid param conflict
router.get('/service-alerts', async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days) : 7;
    const [rows] = await db.execute(
      `SELECT id, vehicle_number, make, model, year, owner_name, owner_phone,
              driver_name, driver_phone, next_service_date, service_reminder_days, status
       FROM vehicles
       WHERE next_service_date IS NOT NULL
         AND DATEDIFF(next_service_date, CURDATE()) <= ?
         AND DATEDIFF(next_service_date, CURDATE()) >= -30
       ORDER BY next_service_date ASC`,
      [days]
    );
    return res.json(rows);
  } catch(err) {
    console.error('Service alerts error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== GET /api/vehicles =====
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, vehicle_number, make, model, year, purchase_date,
              length, length_unit, weight, weight_unit, photo_url,
              owner_name, owner_phone, driver_name, driver_phone,
              next_service_date, status, created_at
       FROM vehicles
       ORDER BY created_at DESC`
    );
    return res.json({ vehicles: rows });
  } catch(err) {
    console.error('Get vehicles error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== POST /api/vehicles =====
router.post('/', [
  body('vehicle_number').trim().notEmpty().withMessage('Vehicle number is required'),
  body('make').trim().notEmpty().withMessage('Make is required'),
  body('model').trim().notEmpty().withMessage('Model is required'),
  body('owner_name').trim().notEmpty().withMessage('Owner name is required'),
  body('owner_phone').trim().notEmpty().withMessage('Owner phone is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const {
    vehicle_number, make, model, year, purchase_date,
    length, length_unit, weight, weight_unit, photo_url,
    owner_name, owner_phone, owner_address,
    driver_name, driver_phone, driver_salary,
    description, next_service_date, service_reminder_days, status
  } = req.body;

  try {
    const [result] = await db.execute(
      `INSERT INTO vehicles (
        vehicle_number, make, model, year, purchase_date,
        length, length_unit, weight, weight_unit, photo_url,
        owner_name, owner_phone, owner_address,
        driver_name, driver_phone, driver_salary,
        description, next_service_date, service_reminder_days, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vehicle_number, make, model,
        year || null, purchase_date || null,
        length || null, length_unit || 'meters',
        weight || null, weight_unit || 'tons',
        photo_url || null,
        owner_name, owner_phone, owner_address || null,
        driver_name || null, driver_phone || null, driver_salary || null,
        description || null, next_service_date || null,
        service_reminder_days || 7, status || 'active'
      ]
    );
    return res.status(201).json({ message: 'Vehicle added successfully', id: result.insertId });
  } catch(err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Vehicle number already exists' });
    }
    console.error('Create vehicle error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== GET /api/vehicles/:id =====
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM vehicles WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Vehicle not found' });
    return res.json({ vehicle: rows[0] });
  } catch(err) {
    console.error('Get vehicle error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== PUT /api/vehicles/:id =====
router.put('/:id', async (req, res) => {
  const {
    vehicle_number, make, model, year, purchase_date,
    length, length_unit, weight, weight_unit, photo_url,
    owner_name, owner_phone, owner_address,
    driver_name, driver_phone, driver_salary,
    description, next_service_date, service_reminder_days, status
  } = req.body;

  try {
    const [result] = await db.execute(
      `UPDATE vehicles SET
        vehicle_number = COALESCE(?, vehicle_number),
        make = COALESCE(?, make),
        model = COALESCE(?, model),
        year = ?,
        purchase_date = ?,
        length = ?,
        length_unit = COALESCE(?, length_unit),
        weight = ?,
        weight_unit = COALESCE(?, weight_unit),
        photo_url = COALESCE(?, photo_url),
        owner_name = COALESCE(?, owner_name),
        owner_phone = COALESCE(?, owner_phone),
        owner_address = ?,
        driver_name = ?,
        driver_phone = ?,
        driver_salary = ?,
        description = ?,
        next_service_date = ?,
        service_reminder_days = COALESCE(?, service_reminder_days),
        status = COALESCE(?, status)
      WHERE id = ?`,
      [
        vehicle_number || null, make || null, model || null,
        year || null, purchase_date || null,
        length || null, length_unit || null,
        weight || null, weight_unit || null,
        photo_url || null,
        owner_name || null, owner_phone || null,
        owner_address !== undefined ? owner_address : null,
        driver_name !== undefined ? driver_name : null,
        driver_phone !== undefined ? driver_phone : null,
        driver_salary !== undefined ? driver_salary : null,
        description !== undefined ? description : null,
        next_service_date !== undefined ? next_service_date || null : null,
        service_reminder_days || null,
        status || null,
        req.params.id
      ]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Vehicle not found' });
    return res.json({ message: 'Vehicle updated successfully' });
  } catch(err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Vehicle number already exists' });
    }
    console.error('Update vehicle error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== DELETE /api/vehicles/:id =====
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM vehicles WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Vehicle not found' });
    return res.json({ message: 'Vehicle deleted successfully' });
  } catch(err) {
    console.error('Delete vehicle error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
