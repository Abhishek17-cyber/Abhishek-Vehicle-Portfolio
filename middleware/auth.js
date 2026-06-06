/**
 * middleware/auth.js — JWT Authentication Middleware
 */

const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Verify JWT token from Authorization header.
 * Attaches decoded user to req.user on success.
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  if (!token) {
    return res.status(401).json({ message: 'Access denied. Invalid token format.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_change_in_prod');
    req.user = decoded;
    next();
  } catch(err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired. Please login again.' });
    }
    return res.status(401).json({ message: 'Invalid token.' });
  }
}

/**
 * Optional auth — attaches user if token present, but doesn't block if missing.
 */
function optionalToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return next();

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_change_in_prod');
  } catch(e) {}
  next();
}

module.exports = { verifyToken, optionalToken };
