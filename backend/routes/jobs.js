/**
 * routes/jobs.js — Job Requests API
 */
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// ===== POST /api/jobs/request =====
// Owner sends a job request
router.post('/request', verifyToken, async (req, res) => {
  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only owners can send job requests' });
  }
  const { driver_id, message } = req.body;
  if (!driver_id) return res.status(400).json({ message: 'Driver ID is required' });

  try {
    await db.execute(
      'INSERT INTO job_requests (owner_id, driver_id, message) VALUES (?, ?, ?)',
      [req.user.id, driver_id, message || '']
    );
    return res.status(201).json({ message: 'Job request sent successfully' });
  } catch (err) {
    console.error('Send job request error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== GET /api/jobs/requests =====
// Get job requests (for both owners and drivers)
router.get('/requests', verifyToken, async (req, res) => {
  try {
    let query, params;
    if (req.user.role === 'owner' || req.user.role === 'admin') {
      query = `
        SELECT j.*, dp.full_name, dp.mobile_number 
        FROM job_requests j
        JOIN driver_profiles dp ON j.driver_id = dp.user_id
        WHERE j.owner_id = ?
        ORDER BY j.created_at DESC
      `;
      params = [req.user.id];
    } else if (req.user.role === 'driver') {
      query = `
        SELECT j.*, u.username as owner_username,
               (SELECT owner_phone FROM vehicles WHERE owner_id = j.owner_id LIMIT 1) as owner_phone,
               (SELECT owner_name FROM vehicles WHERE owner_id = j.owner_id LIMIT 1) as owner_name
        FROM job_requests j
        JOIN users u ON j.owner_id = u.id
        WHERE j.driver_id = ?
        ORDER BY j.created_at DESC
      `;
      params = [req.user.id];
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }

    const [rows] = await db.query(query, params);
    return res.json({ requests: rows });
  } catch (err) {
    console.error('Get job requests error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== PUT /api/jobs/request/:id =====
// Driver accepts/rejects a job request
router.put('/request/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'driver') {
    return res.status(403).json({ message: 'Only drivers can update request status' });
  }
  const { status } = req.body;
  if (!['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    // Get the owner_id from the job request first
    const [reqRows] = await db.execute(
      'SELECT owner_id FROM job_requests WHERE id = ? AND driver_id = ?',
      [req.params.id, req.user.id]
    );
    
    if (reqRows.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }
    const jobOwnerId = reqRows[0].owner_id;

    const [result] = await db.execute(
      'UPDATE job_requests SET status = ? WHERE id = ? AND driver_id = ?',
      [status, req.params.id, req.user.id]
    );
    
    if (status === 'accepted') {
      // Assign driver to the owner
      await db.execute('UPDATE users SET owner_id = ? WHERE id = ?', [jobOwnerId, req.user.id]);
      // Set driver as On Duty
      await db.execute('UPDATE driver_profiles SET availability = ? WHERE user_id = ?', ['On Duty', req.user.id]);
    }
    
    return res.json({ message: `Job request ${status}` });
  } catch (err) {
    console.error('Update job request error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
