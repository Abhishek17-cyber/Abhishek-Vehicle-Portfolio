/**
 * routes/service.js — Service Records CRUD + Alerts
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const { sendDirectSMS } = require('../utils/snsService');

router.use(verifyToken);

// ===== GET /api/service/alerts =====
router.get('/alerts', async (req, res) => {
  try {
    const defaultDays = req.query.days ? parseInt(req.query.days) : 7;
    const isDriver = req.user.role === 'driver';
    const [rows] = await db.execute(
      `SELECT v.id, v.vehicle_number, v.make, v.model,
              v.owner_name, v.owner_phone,
              v.driver_name, v.driver_phone,
              v.last_service_date, v.next_service_date, v.service_reminder_days,
              DATEDIFF(v.next_service_date, CURDATE()) AS days_until_service
       FROM vehicles v
       WHERE v.next_service_date IS NOT NULL
         AND ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}
         AND DATEDIFF(v.next_service_date, CURDATE()) <= COALESCE(v.service_reminder_days, ?)
       ORDER BY v.next_service_date ASC`,
      [req.user.id, defaultDays]
    );
    return res.json(rows);
  } catch(err) {
    console.error('Service alerts error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== POST /api/service/send-sms-reminder =====
router.post('/send-sms-reminder', async (req, res) => {
  try {
    const { vehicle_id } = req.body;
    const days = req.query.days ? parseInt(req.query.days) : 7;
    const isDriver = req.user.role === 'driver';

    let query = `
      SELECT v.id, v.vehicle_number, v.make, v.model,
             v.owner_name, v.owner_phone,
             v.driver_name, v.driver_phone,
             v.next_service_date,
             DATEDIFF(v.next_service_date, CURDATE()) AS days_until_service
      FROM vehicles v
      WHERE v.next_service_date IS NOT NULL
    `;
    const params = [];

    if (vehicle_id) {
      query += ` AND v.id = ?`;
      params.push(vehicle_id);
    } else {
      query += ` AND DATEDIFF(v.next_service_date, CURDATE()) <= ?`;
      params.push(days);
    }

    if (req.user.role !== 'admin') {
      query += ` AND ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}`;
      params.push(req.user.id);
    }

    const [vehicles] = await db.execute(query, params);

    if (!vehicles.length) {
      return res.status(404).json({ message: 'No vehicles found with upcoming service due.' });
    }

    const results = [];

    for (const v of vehicles) {
      const formattedDate = v.next_service_date
        ? new Date(v.next_service_date).toLocaleDateString('en-IN', {
            year: 'numeric', month: 'short', day: 'numeric'
          })
        : 'Soon';

      // 1. Send SMS to Owner
      if (v.owner_phone) {
        const ownerMsg = `Fleet Alert: Dear ${v.owner_name || 'Owner'}, your vehicle ${v.vehicle_number} service is due on ${formattedDate}. Please schedule service.`;
        const ownerResult = await sendDirectSMS(v.owner_phone, ownerMsg);
        results.push({
          vehicle_number: v.vehicle_number,
          role: 'owner',
          name: v.owner_name,
          phone: v.owner_phone,
          status: ownerResult.success ? 'Sent' : 'Failed',
          error: ownerResult.error,
          messageId: ownerResult.messageId
        });
      }

      // 2. Send SMS to Driver
      if (v.driver_phone) {
        const driverMsg = `Fleet Alert: Hi ${v.driver_name || 'Driver'}, vehicle ${v.vehicle_number} assigned to you is due for service on ${formattedDate}. Please inform fleet manager.`;
        const driverResult = await sendDirectSMS(v.driver_phone, driverMsg);
        results.push({
          vehicle_number: v.vehicle_number,
          role: 'driver',
          name: v.driver_name,
          phone: v.driver_phone,
          status: driverResult.success ? 'Sent' : 'Failed',
          error: driverResult.error,
          messageId: driverResult.messageId
        });
      }
    }

    const sentCount = results.filter(r => r.status === 'Sent').length;
    const failedCount = results.filter(r => r.status === 'Failed').length;

    return res.json({
      message: `SMS reminder process completed. Sent: ${sentCount}, Failed: ${failedCount}`,
      sentCount,
      failedCount,
      details: results
    });
  } catch (err) {
    console.error('Send SMS reminder error:', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});

// ===== GET /api/service =====
router.get('/', async (req, res) => {
  try {
    const { vehicle_id, date_from, date_to } = req.query;
    const isDriver = req.user.role === 'driver';

    let query = `
      SELECT s.*, v.vehicle_number, v.make, v.model
      FROM service_records s
      LEFT JOIN vehicles v ON s.vehicle_id = v.id
      WHERE ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}
    `;
    const params = [req.user.id];

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
    const isDriver = req.user.role === 'driver';
    const [rows] = await db.execute(
      `SELECT s.*, v.vehicle_number FROM service_records s
       LEFT JOIN vehicles v ON s.vehicle_id = v.id
       WHERE s.id = ? AND ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Record not found or unauthorized' });
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
    // Check authority first
    const isDriver = req.user.role === 'driver';
    const [existing] = await db.execute(
      `SELECT s.id FROM service_records s 
       LEFT JOIN vehicles v ON s.vehicle_id = v.id 
       WHERE s.id = ? AND ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}`,
      [req.params.id, req.user.id]
    );
    if (!existing.length && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Record not found or unauthorized' });
    }

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
    // Check authority first
    const isDriver = req.user.role === 'driver';
    const [existing] = await db.execute(
      `SELECT s.id FROM service_records s 
       LEFT JOIN vehicles v ON s.vehicle_id = v.id 
       WHERE s.id = ? AND ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}`,
      [req.params.id, req.user.id]
    );
    if (!existing.length && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Record not found or unauthorized' });
    }

    const [result] = await db.execute('DELETE FROM service_records WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Record not found' });
    return res.json({ message: 'Service record deleted' });
  } catch(err) {
    console.error('Delete service error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
