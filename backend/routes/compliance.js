/**
 * routes/compliance.js — Vehicle Compliance and Documents CRUD
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// ===== GET /api/compliance =====
router.get('/', async (req, res) => {
  try {
    const { vehicle_id, status } = req.query;
    const isDriver = req.user.role === 'driver';
    
    let query = `
      SELECT c.*, v.vehicle_number, u.file_url, u.file_name,
        DATEDIFF(c.expiry_date, CURDATE()) as days_to_expiry
      FROM vehicle_compliance c
      JOIN vehicles v ON c.vehicle_id = v.id
      LEFT JOIN uploads u ON c.upload_id = u.id
      WHERE ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}
    `;
    const params = [req.user.id];

    if (vehicle_id) { query += ' AND c.vehicle_id = ?'; params.push(vehicle_id); }
    
    // Status filters: 'valid', 'expiring_soon', 'expired'
    if (status === 'expired') {
      query += ' AND DATEDIFF(c.expiry_date, CURDATE()) < 0';
    } else if (status === 'expiring_soon') {
      query += ' AND DATEDIFF(c.expiry_date, CURDATE()) BETWEEN 0 AND 30';
    } else if (status === 'valid') {
      query += ' AND DATEDIFF(c.expiry_date, CURDATE()) > 30';
    }

    query += ' ORDER BY c.expiry_date ASC';

    const [rows] = await db.execute(query, params);
    return res.json(rows);
  } catch (err) {
    console.error('Get compliance error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== GET /api/compliance/alerts =====
router.get('/alerts', async (req, res) => {
  try {
    const isDriver = req.user.role === 'driver';
    
    let query = `
      SELECT c.id, c.doc_type, c.expiry_date, v.vehicle_number,
        DATEDIFF(c.expiry_date, CURDATE()) as days_to_expiry
      FROM vehicle_compliance c
      JOIN vehicles v ON c.vehicle_id = v.id
      WHERE ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}
      AND DATEDIFF(c.expiry_date, CURDATE()) <= 30
      ORDER BY c.expiry_date ASC
    `;
    
    const [rows] = await db.execute(query, [req.user.id]);
    return res.json(rows);
  } catch (err) {
    console.error('Get compliance alerts error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== POST /api/compliance =====
router.post('/', async (req, res) => {
  const { vehicle_id, doc_type, document_number, issue_date, expiry_date, upload_id, notes } = req.body;

  if (!vehicle_id || !doc_type || !expiry_date) {
    return res.status(400).json({ message: 'Vehicle, Document Type, and Expiry Date are required' });
  }

  try {
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
      `INSERT INTO vehicle_compliance (
        vehicle_id, doc_type, document_number, issue_date, expiry_date, upload_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        vehicle_id, doc_type, document_number || null,
        issue_date || null, expiry_date, upload_id || null, notes || null
      ]
    );
    return res.status(201).json({ message: 'Compliance record added', id: result.insertId });
  } catch (err) {
    console.error('Create compliance error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== PUT /api/compliance/:id =====
router.put('/:id', async (req, res) => {
  const { vehicle_id, doc_type, document_number, issue_date, expiry_date, upload_id, notes } = req.body;

  if (!vehicle_id || !doc_type || !expiry_date) {
    return res.status(400).json({ message: 'Vehicle, Document Type, and Expiry Date are required' });
  }

  try {
    const isDriver = req.user.role === 'driver';
    const [existing] = await db.execute(
      `SELECT c.id FROM vehicle_compliance c 
       JOIN vehicles v ON c.vehicle_id = v.id 
       WHERE c.id = ? AND ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}`,
      [req.params.id, req.user.id]
    );
    if (!existing.length && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Record not found or unauthorized' });
    }

    await db.execute(
      `UPDATE vehicle_compliance SET 
        vehicle_id = ?, doc_type = ?, document_number = ?, issue_date = ?, expiry_date = ?, upload_id = ?, notes = ?
       WHERE id = ?`,
      [
        vehicle_id, doc_type, document_number || null,
        issue_date || null, expiry_date, upload_id || null, notes || null,
        req.params.id
      ]
    );
    return res.json({ message: 'Compliance record updated' });
  } catch (err) {
    console.error('Update compliance error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== DELETE /api/compliance/:id =====
router.delete('/:id', async (req, res) => {
  try {
    const isDriver = req.user.role === 'driver';
    const [existing] = await db.execute(
      `SELECT c.id FROM vehicle_compliance c 
       JOIN vehicles v ON c.vehicle_id = v.id 
       WHERE c.id = ? AND ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}`,
      [req.params.id, req.user.id]
    );
    if (!existing.length && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Record not found or unauthorized' });
    }

    await db.execute('DELETE FROM vehicle_compliance WHERE id = ?', [req.params.id]);
    return res.json({ message: 'Compliance record deleted' });
  } catch (err) {
    console.error('Delete compliance error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
