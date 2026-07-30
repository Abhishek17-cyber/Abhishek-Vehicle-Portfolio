/**
 * config.js — API Configuration
 * PRODUCTION: Points to EC2 backend
 * Update API_BASE_URL with your actual EC2 Public IP after deployment
 */

// ── CHANGE THIS to your EC2 Public IP ──
const API_BASE_URL = 'http://13.207.68.177:3000';

// Examples:
//   const API_BASE_URL = 'http://13.233.45.67:3000';       // EC2 IP
//   const API_BASE_URL = 'https://api.yourdomain.com';     // Custom domain with HTTPS

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { API_BASE_URL };
}
