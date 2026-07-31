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
    const defaultDays = req.query.days ? parseInt(req.query.days) : 7;
    const isDriver = req.user.role === 'driver';
    const [rows] = await db.execute(
      `SELECT id, vehicle_number, make, model, year, owner_name, owner_phone,
              driver_name, driver_phone, last_service_date, next_service_date, service_reminder_days, status
       FROM vehicles
       WHERE next_service_date IS NOT NULL
         AND ${isDriver ? 'driver_user_id = ?' : 'owner_id = ?'}
         AND DATEDIFF(next_service_date, CURDATE()) <= COALESCE(service_reminder_days, ?)
         AND DATEDIFF(next_service_date, CURDATE()) >= -30
       ORDER BY next_service_date ASC`,
      [req.user.id, defaultDays]
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
    const isDriver = req.user.role === 'driver';
    const [rows] = await db.execute(
      `SELECT id, vehicle_number, make, model, year, purchase_date,
              length, length_unit, weight, weight_unit, vehicle_type, photo_url,
              owner_name, owner_phone, driver_name, driver_phone,
              next_service_date, status, created_at, driver_user_id
       FROM vehicles
       WHERE ${isDriver ? 'driver_user_id = ?' : 'owner_id = ?'}
       ORDER BY created_at DESC`,
      [req.user.id]
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
  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only owners can add vehicles' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const {
    vehicle_number, make, model, year, purchase_date,
    length, length_unit, weight, weight_unit, vehicle_type, photo_url,
    owner_name, owner_phone, owner_address, owner_email,
    driver_name, driver_phone, driver_salary, driver_email,
    description, last_service_date, next_service_date, service_reminder_days, status
  } = req.body;

  try {
    const [result] = await db.execute(
      `INSERT INTO vehicles (
        vehicle_number, make, model, year, purchase_date,
        length, length_unit, weight, weight_unit, vehicle_type, photo_url,
        owner_name, owner_phone, owner_address, owner_email,
        driver_name, driver_phone, driver_salary, driver_email,
        description, last_service_date, next_service_date, service_reminder_days, status, owner_id, driver_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vehicle_number, make, model,
        year || null, purchase_date || null,
        length || null, length_unit || 'meters',
        weight || null, weight_unit || 'tons',
        vehicle_type || null,
        photo_url || null,
        owner_name, owner_phone, owner_address || null, owner_email || null,
        driver_name || null, driver_phone || null, driver_salary || null, driver_email || null,
        description || null, last_service_date || null, next_service_date || null,
        service_reminder_days || 7, status || 'active', req.user.id,
        req.body.driver_user_id || null
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
    const isDriver = req.user.role === 'driver';
    const [rows] = await db.execute(
      `SELECT * FROM vehicles 
       WHERE id = ? AND ${isDriver ? 'driver_user_id = ?' : 'owner_id = ?'}`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Vehicle not found' });
    
    const vehicle = rows[0];
    if (isDriver) {
      vehicle.driver_salary = null; // hide from drivers
    }
    return res.json({ vehicle });
  } catch(err) {
    console.error('Get vehicle error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== PUT /api/vehicles/:id =====
router.put('/:id', async (req, res) => {
  try {
    if (!req.user || (req.user.role !== 'owner' && req.user.role !== 'admin')) {
      return res.status(403).json({ message: 'Only owners or admins can update vehicles' });
    }

    const {
      vehicle_number, make, model, year, purchase_date,
      length, length_unit, weight, weight_unit, vehicle_type, photo_url,
      owner_name, owner_phone, owner_address, owner_email,
      driver_name, driver_phone, driver_salary, driver_email,
      description, last_service_date, next_service_date, service_reminder_days, status
    } = req.body;

    // Verify vehicle exists
    const isOwner = req.user.role === 'owner';
    const [existing] = await db.execute(
      `SELECT id FROM vehicles WHERE id = ? ${isOwner ? 'AND owner_id = ?' : ''}`,
      isOwner ? [req.params.id, req.user.id] : [req.params.id]
    );

    if (!existing.length) {
      return res.status(404).json({ message: 'Vehicle not found or unauthorized' });
    }

    // Data sanitization
    let driverUserId = null;
    if (req.body.driver_user_id !== undefined && req.body.driver_user_id !== null && req.body.driver_user_id !== '') {
      const parsedDriverId = parseInt(req.body.driver_user_id);
      if (!isNaN(parsedDriverId) && parsedDriverId > 0) {
        const [driverCheck] = await db.execute('SELECT id FROM users WHERE id = ? AND role = ?', [parsedDriverId, 'driver']);
        if (driverCheck.length) {
          driverUserId = parsedDriverId;
        }
      }
    }

    const validYear = (year && !isNaN(year) && parseInt(year) > 1900) ? parseInt(year) : null;
    const validSalary = (driver_salary !== null && driver_salary !== undefined && driver_salary !== '' && !isNaN(driver_salary)) ? parseFloat(driver_salary) : null;

    let cleanLastServiceDate = null;
    if (last_service_date && typeof last_service_date === 'string' && last_service_date.trim() !== '') {
      cleanLastServiceDate = last_service_date.trim().split('T')[0];
    }

    let cleanNextServiceDate = null;
    if (next_service_date && typeof next_service_date === 'string' && next_service_date.trim() !== '') {
      cleanNextServiceDate = next_service_date.trim().split('T')[0];
    }

    let cleanVehicleType = (typeof vehicle_type === 'string' && vehicle_type.trim() !== '') ? vehicle_type.trim() : null;

    const validStatus = ['active', 'inactive', 'in_service'].includes(status) ? status : 'active';
    const validReminderDays = (service_reminder_days && !isNaN(service_reminder_days)) ? parseInt(service_reminder_days) : 7;

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
        vehicle_type = ?,
        photo_url = COALESCE(?, photo_url),
        owner_name = COALESCE(?, owner_name),
        owner_phone = COALESCE(?, owner_phone),
        owner_address = ?,
        owner_email = ?,
        driver_name = ?,
        driver_phone = ?,
        driver_salary = ?,
        driver_email = ?,
        description = ?,
        last_service_date = ?,
        next_service_date = ?,
        service_reminder_days = ?,
        status = ?,
        driver_user_id = ?
      WHERE id = ?`,
      [
        vehicle_number || null,
        make || null,
        model || null,
        validYear,
        purchase_date || null,
        length || null,
        length_unit || null,
        weight || null,
        weight_unit || null,
        cleanVehicleType,
        photo_url || null,
        owner_name || null,
        owner_phone || null,
        owner_address !== undefined ? owner_address : null,
        owner_email !== undefined ? owner_email : null,
        driver_name !== undefined ? driver_name : null,
        driver_phone !== undefined ? driver_phone : null,
        validSalary,
        driver_email !== undefined ? driver_email : null,
        description !== undefined ? description : null,
        cleanLastServiceDate,
        cleanNextServiceDate,
        validReminderDays,
        validStatus,
        driverUserId,
        req.params.id
      ]
    );

    return res.json({ message: 'Vehicle updated successfully' });
  } catch(err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Vehicle number already exists' });
    }
    console.error('Update vehicle error:', err);
    return res.status(500).json({ message: 'Update failed: ' + (err.sqlMessage || err.message) });
  }
});

// ===== DELETE /api/vehicles/:id =====
router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only owners can delete vehicles' });
  }

  try {
    const [result] = await db.execute('DELETE FROM vehicles WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Vehicle not found or unauthorized' });
    return res.json({ message: 'Vehicle deleted successfully' });
  } catch(err) {
    console.error('Delete vehicle error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
