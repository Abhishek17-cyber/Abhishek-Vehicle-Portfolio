/**
 * routes/trips.js — Trip Records CRUD
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// ===== GET /api/trips =====
router.get('/', async (req, res) => {
  try {
    const { vehicle_id, date_from, date_to, status } = req.query;
    let query = `
      SELECT t.*, v.vehicle_number, v.make, v.model
      FROM trips t
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      WHERE 1=1
    `;
    const params = [];

    if (vehicle_id) { query += ' AND t.vehicle_id = ?'; params.push(vehicle_id); }
    if (date_from) { query += ' AND DATE(t.trip_date) >= ?'; params.push(date_from); }
    if (date_to) { query += ' AND DATE(t.trip_date) <= ?'; params.push(date_to); }
    if (status) { query += ' AND t.status = ?'; params.push(status); }

    query += ' ORDER BY t.trip_date DESC';

    const [rows] = await db.execute(query, params);
    return res.json({ trips: rows });
  } catch(err) {
    console.error('Get trips error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== POST /api/trips =====
router.post('/', [
  body('vehicle_id').notEmpty().withMessage('Vehicle is required'),
  body('trip_date').notEmpty().withMessage('Trip date is required'),
  body('source_address').trim().notEmpty().withMessage('Source address is required'),
  body('destination_address').trim().notEmpty().withMessage('Destination address is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const {
    vehicle_id, trip_date, source_address, source_city,
    destination_address, destination_city,
    toll_fee_up, toll_fee_down,
    load_weight, load_unit, notes, status
  } = req.body;

  try {
    const [result] = await db.execute(
      `INSERT INTO trips (
        vehicle_id, trip_date, source_address, source_city,
        destination_address, destination_city,
        toll_fee_up, toll_fee_down,
        load_weight, load_unit, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vehicle_id, trip_date, source_address, source_city || null,
        destination_address, destination_city || null,
        parseFloat(toll_fee_up) || 0, parseFloat(toll_fee_down) || 0,
        load_weight || null, load_unit || 'tons',
        notes || null, status || 'planned'
      ]
    );
    return res.status(201).json({ message: 'Trip added successfully', id: result.insertId });
  } catch(err) {
    console.error('Create trip error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== GET /api/trips/:id =====
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT t.*, v.vehicle_number, v.make, v.model
       FROM trips t
       LEFT JOIN vehicles v ON t.vehicle_id = v.id
       WHERE t.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Trip not found' });
    return res.json({ trip: rows[0] });
  } catch(err) {
    console.error('Get trip error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== PUT /api/trips/:id =====
router.put('/:id', async (req, res) => {
  const {
    vehicle_id, trip_date, source_address, source_city,
    destination_address, destination_city,
    toll_fee_up, toll_fee_down,
    load_weight, load_unit, notes, status
  } = req.body;

  try {
    const [result] = await db.execute(
      `UPDATE trips SET
        vehicle_id = COALESCE(?, vehicle_id),
        trip_date = COALESCE(?, trip_date),
        source_address = COALESCE(?, source_address),
        source_city = ?,
        destination_address = COALESCE(?, destination_address),
        destination_city = ?,
        toll_fee_up = COALESCE(?, toll_fee_up),
        toll_fee_down = COALESCE(?, toll_fee_down),
        load_weight = ?,
        load_unit = COALESCE(?, load_unit),
        notes = ?,
        status = COALESCE(?, status)
      WHERE id = ?`,
      [
        vehicle_id || null, trip_date || null,
        source_address || null, source_city !== undefined ? source_city : null,
        destination_address || null, destination_city !== undefined ? destination_city : null,
        toll_fee_up !== undefined ? parseFloat(toll_fee_up) : null,
        toll_fee_down !== undefined ? parseFloat(toll_fee_down) : null,
        load_weight !== undefined ? load_weight : null,
        load_unit || null, notes !== undefined ? notes : null,
        status || null, req.params.id
      ]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Trip not found' });
    return res.json({ message: 'Trip updated successfully' });
  } catch(err) {
    console.error('Update trip error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== DELETE /api/trips/:id =====
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM trips WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Trip not found' });
    return res.json({ message: 'Trip deleted successfully' });
  } catch(err) {
    console.error('Delete trip error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
