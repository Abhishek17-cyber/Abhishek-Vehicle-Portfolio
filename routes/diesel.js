/**
 * routes/diesel.js — Diesel Records CRUD
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// ===== GET /api/diesel =====
router.get('/', async (req, res) => {
  try {
    const { vehicle_id, date_from, date_to } = req.query;
    let query = `
      SELECT d.*, v.vehicle_number, v.make, v.model
      FROM diesel_records d
      LEFT JOIN vehicles v ON d.vehicle_id = v.id
      WHERE 1=1
    `;
    const params = [];

    if (vehicle_id) { query += ' AND d.vehicle_id = ?'; params.push(vehicle_id); }
    if (date_from) { query += ' AND DATE(d.refuel_datetime) >= ?'; params.push(date_from); }
    if (date_to) { query += ' AND DATE(d.refuel_datetime) <= ?'; params.push(date_to); }

    query += ' ORDER BY d.refuel_datetime DESC';

    const [rows] = await db.execute(query, params);
    return res.json({ records: rows });
  } catch(err) {
    console.error('Get diesel error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== POST /api/diesel =====
router.post('/', [
  body('vehicle_id').notEmpty().withMessage('Vehicle is required'),
  body('refuel_datetime').notEmpty().withMessage('Date & time is required'),
  body('cost').isNumeric().withMessage('Cost must be a number')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const {
    vehicle_id, trip_id, refuel_datetime, cost, liters,
    trip_source, trip_destination, pump_station,
    bill_image_url, notes
  } = req.body;

  try {
    const [result] = await db.execute(
      `INSERT INTO diesel_records (
        vehicle_id, trip_id, refuel_datetime, cost, liters,
        trip_source, trip_destination, pump_station,
        bill_image_url, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vehicle_id, trip_id || null, refuel_datetime,
        parseFloat(cost), liters ? parseFloat(liters) : null,
        trip_source || null, trip_destination || null,
        pump_station || null, bill_image_url || null, notes || null
      ]
    );
    return res.status(201).json({ message: 'Diesel record added', id: result.insertId });
  } catch(err) {
    console.error('Create diesel error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== GET /api/diesel/:id =====
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT d.*, v.vehicle_number FROM diesel_records d
       LEFT JOIN vehicles v ON d.vehicle_id = v.id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Record not found' });
    return res.json({ record: rows[0] });
  } catch(err) {
    console.error('Get diesel record error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== PUT /api/diesel/:id =====
router.put('/:id', async (req, res) => {
  const {
    vehicle_id, trip_id, refuel_datetime, cost, liters,
    trip_source, trip_destination, pump_station,
    bill_image_url, notes
  } = req.body;

  try {
    const [result] = await db.execute(
      `UPDATE diesel_records SET
        vehicle_id = COALESCE(?, vehicle_id),
        trip_id = ?,
        refuel_datetime = COALESCE(?, refuel_datetime),
        cost = COALESCE(?, cost),
        liters = ?,
        trip_source = ?,
        trip_destination = ?,
        pump_station = ?,
        bill_image_url = COALESCE(?, bill_image_url),
        notes = ?
      WHERE id = ?`,
      [
        vehicle_id || null,
        trip_id !== undefined ? trip_id : null,
        refuel_datetime || null,
        cost ? parseFloat(cost) : null,
        liters !== undefined ? parseFloat(liters) : null,
        trip_source !== undefined ? trip_source : null,
        trip_destination !== undefined ? trip_destination : null,
        pump_station !== undefined ? pump_station : null,
        bill_image_url || null,
        notes !== undefined ? notes : null,
        req.params.id
      ]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Record not found' });
    return res.json({ message: 'Diesel record updated' });
  } catch(err) {
    console.error('Update diesel error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== DELETE /api/diesel/:id =====
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM diesel_records WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Record not found' });
    return res.json({ message: 'Diesel record deleted' });
  } catch(err) {
    console.error('Delete diesel error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
