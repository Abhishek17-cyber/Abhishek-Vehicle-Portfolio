/**
 * config/db.js — MySQL Connection Pool
 * Uses mysql2 with promise wrapper for async/await support.
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'vehicle_portfolio',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Recommended settings for stability
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: '+05:30' // IST
});

// Test connection on startup
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection failed:', err.message);
    console.error('   Check your .env DB_HOST, DB_USER, DB_PASSWORD, DB_NAME settings');
  });

module.exports = pool;
