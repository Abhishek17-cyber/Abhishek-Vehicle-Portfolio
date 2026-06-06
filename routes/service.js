/**
 * routes/service.js — Service Records CRUD + Alerts
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// ===== GET /api/service/alerts =====
router.get('/alerts', async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days) : 7;
    const [rows] = await db.execute(
      `SELECT v.id, v.vehicle_number, v.make, v.model,
              v.owner_name, v.owner_phone,
              v.driver_name, v.driver_phone,
              v.next_service_date,
              DATEDIFF(v.next_service_date, CURDATE()) AS days_until_service
       FROM vehicles v
       WHERE v.next_service_date IS NOT NULL
         AND DATEDIFF(v.next_service_date, CURDATE()) <= ?
       ORDER BY v.next_service_date ASC`,
      [days]
    );
    return res.json(rows);
  } catch(err) {
    console.error('Service alerts error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== GET /api/service =====
router.get('/', async (req, res) => {
  try {
    const { vehicle_id, date_from, date_to } = req.query;
    let query = `
      SELECT s.*, v.vehicle_number, v.make, v.model
      FROM service_records s
      LEFT JOIN vehicles v ON s.vehicle_id = v.id
      WHERE 1=1
    `;
    const params = [];

    if (vehicle_id) { query += ' AND s.vehicle_id = ?'; params.push(vehicle_id); }
    if (date_from) { query += ' AND DATE(s.service_date) >= ?'; params.push(date_from); }
    if (date_to) { query += ' AND DATE(s.service_date) <= ?'; params.push(date_to); }

    query += ' ORDER BY s.service_date DESC';

    const [rows] = await db.execute(query, params);
    return res.json({ records: rows });
  } catch(err) {
    console.error('Get service error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== POST /api/service =====
router.post('/', [
  body('vehicle_id').notEmpty().withMessage('Vehicle is required'),
  body('service_date').notEmpty().withMessage('Service date is required'),
  body('service_type').trim().notEmpty().withMessage('Service type is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const {
    vehicle_id, service_date, service_type, description,
    cost, next_service_date, mechanic_name, garage_name
  } = req.body;

  try {
    const [result] = await db.execute(
      `INSERT INTO service_records (
        vehicle_id, service_date, service_type, description,
        cost, next_service_date, mechanic_name, garage_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vehicle_id, service_date, service_type,
        description || null, cost ? parseFloat(cost) : null,
        next_service_date || null,
        mechanic_name || null, garage_name || null
      ]
    );

    // Update vehicle's next_service_date if provided
    if (next_service_date) {
      await db.execute(
        'UPDATE vehicles SET next_service_date = ? WHERE id = ?',
        [next_service_date, vehicle_id]
      );
    }

    return res.status(201).json({ message: 'Service record added', id: result.insertId });
  } catch(err) {
    console.error('Create service error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== GET /api/service/:id =====
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT s.*, v.vehicle_number FROM service_records s
       LEFT JOIN vehicles v ON s.vehicle_id = v.id
       WHERE s.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Record not found' });
    return res.json({ record: rows[0] });
  } catch(err) {
    console.error('Get service record error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== PUT /api/service/:id =====
router.put('/:id', async (req, res) => {
  const {
    vehicle_id, service_date, service_type, description,
    cost, next_service_date, mechanic_name, garage_name
  } = req.body;

  try {
    const [result] = await db.execute(
      `UPDATE service_records SET
        vehicle_id = COALESCE(?, vehicle_id),
        service_date = COALESCE(?, service_date),
        service_type = COALESCE(?, service_type),
        description = ?,
        cost = ?,
        next_service_date = ?,
        mechanic_name = ?,
        garage_name = ?
      WHERE id = ?`,
      [
        vehicle_id || null, service_date || null,
        service_type || null,
        description !== undefined ? description : null,
        cost ? parseFloat(cost) : null,
        next_service_date !== undefined ? next_service_date || null : null,
        mechanic_name !== undefined ? mechanic_name : null,
        garage_name !== undefined ? garage_name : null,
        req.params.id
      ]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Record not found' });

    // Optionally update vehicle next_service_date
    if (next_service_date && vehicle_id) {
      await db.execute(
        'UPDATE vehicles SET next_service_date = ? WHERE id = ?',
        [next_service_date, vehicle_id]
      );
    }

    return res.json({ message: 'Service record updated' });
  } catch(err) {
    console.error('Update service error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== DELETE /api/service/:id =====
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM service_records WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Record not found' });
    return res.json({ message: 'Service record deleted' });
  } catch(err) {
    console.error('Delete service error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
