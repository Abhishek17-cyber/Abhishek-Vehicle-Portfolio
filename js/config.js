/**
 * config.js — API Configuration
 * Update API_BASE_URL to point to your EC2 backend after deployment.
 *
 * For local development:    http://localhost:3000
 * For EC2 deployment:       http://<your-ec2-public-ip>:3000
 *                        or https://api.yourdomain.com  (if using nginx + SSL)
 */

const API_BASE_URL = 'http://localhost:3000';

// Export for module usage (optional; plain var works in browser)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { API_BASE_URL };
}
