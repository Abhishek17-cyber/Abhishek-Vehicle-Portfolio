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
    const isDriver = req.user.role === 'driver';
    
    let query = `
      SELECT t.*, v.vehicle_number, v.make, v.model
      FROM trips t
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      WHERE ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}
    `;
    const params = [req.user.id];

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
    load_weight, load_unit, distance_km, notes, status, revenue, load_rental
  } = req.body;

  try {
    // Verify vehicle authorization
    const isDriver = req.user.role === 'driver';
    const [vehicles] = await db.execute(
      `SELECT id FROM vehicles 
       WHERE id = ? AND ${isDriver ? 'driver_user_id = ?' : 'owner_id = ?'}`,
      [vehicle_id, req.user.id]
    );
    if (!vehicles.length && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized vehicle or vehicle not found' });
    }

    const [result] = await db.execute(
      `INSERT INTO trips (
        vehicle_id, trip_date, source_address, source_city,
        destination_address, destination_city,
        toll_fee_up, toll_fee_down,
        load_weight, load_unit, distance_km, notes, status, revenue, load_rental
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vehicle_id, trip_date, source_address, source_city || null,
        destination_address, destination_city || null,
        parseFloat(toll_fee_up) || 0, parseFloat(toll_fee_down) || 0,
        load_weight || null, load_unit || 'tons',
        distance_km ? parseFloat(distance_km) : null,
        notes || null, status || 'planned',
        parseFloat(revenue) || 0,
        parseFloat(load_rental) || 0
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
    const isDriver = req.user.role === 'driver';
    const [rows] = await db.execute(
      `SELECT t.*, v.vehicle_number, v.make, v.model
       FROM trips t
       LEFT JOIN vehicles v ON t.vehicle_id = v.id
       WHERE t.id = ? AND ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Trip not found or unauthorized' });
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
    load_weight, load_unit, distance_km, notes, status, revenue, load_rental
  } = req.body;

  try {
    // Check authority first
    const isDriver = req.user.role === 'driver';
    const [existing] = await db.execute(
      `SELECT t.id FROM trips t 
       LEFT JOIN vehicles v ON t.vehicle_id = v.id 
       WHERE t.id = ? AND ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}`,
      [req.params.id, req.user.id]
    );
    if (!existing.length && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Record not found or unauthorized' });
    }

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
        distance_km = ?,
        revenue = COALESCE(?, revenue),
        load_rental = COALESCE(?, load_rental),
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
        load_unit || null,
        distance_km !== undefined ? (distance_km ? parseFloat(distance_km) : null) : null,
        revenue !== undefined ? parseFloat(revenue) : null,
        load_rental !== undefined ? parseFloat(load_rental) : null,
        notes !== undefined ? notes : null,
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
    // Check authority first
    const isDriver = req.user.role === 'driver';
    const [existing] = await db.execute(
      `SELECT t.id FROM trips t 
       LEFT JOIN vehicles v ON t.vehicle_id = v.id 
       WHERE t.id = ? AND ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}`,
      [req.params.id, req.user.id]
    );
    if (!existing.length && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Record not found or unauthorized' });
    }

    const [result] = await db.execute('DELETE FROM trips WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Trip not found' });
    return res.json({ message: 'Trip deleted successfully' });
  } catch(err) {
    console.error('Delete trip error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
