/**
 * routes/reviews.js — Reviews API
 */
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// ===== POST /api/reviews =====
// Submit a review
router.post('/', verifyToken, async (req, res) => {
  const { reviewee_id, rating, review_text } = req.body;
  if (!reviewee_id || !rating) {
    return res.status(400).json({ message: 'Reviewee ID and rating are required' });
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' });
  }

  try {
    await db.execute(
      'INSERT INTO reviews (reviewer_id, reviewee_id, rating, review_text) VALUES (?, ?, ?, ?)',
      [req.user.id, reviewee_id, rating, review_text || '']
    );
    return res.status(201).json({ message: 'Review submitted successfully' });
  } catch (err) {
    console.error('Submit review error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== GET /api/reviews/:reviewee_id =====
// Get reviews for a specific user
router.get('/:reviewee_id', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT r.*, u.username as reviewer_name 
       FROM reviews r
       JOIN users u ON r.reviewer_id = u.id
       WHERE r.reviewee_id = ?
       ORDER BY r.created_at DESC`,
      [req.params.reviewee_id]
    );
    return res.json({ reviews: rows });
  } catch (err) {
    console.error('Get reviews error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
