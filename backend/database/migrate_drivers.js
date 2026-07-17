/**
 * database/migrate_drivers.js
 * Run: node database/migrate_drivers.js
 * Adds tables for the Driver Job Registration and Hiring Module.
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function migrate() {
  console.log('📦 Connecting to database...');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'vehicle_portfolio',
    multipleStatements: true
  });

  console.log('📋 Creating new tables...');

  // 1. DRIVER PROFILES TABLE
  await conn.query(`
    CREATE TABLE IF NOT EXISTS driver_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      full_name VARCHAR(200) NOT NULL,
      mobile_number VARCHAR(20) NOT NULL,
      address TEXT,
      driving_license_number VARCHAR(100),
      license_expiry_date DATE,
      vehicle_types VARCHAR(200),
      years_of_experience INT DEFAULT 0,
      languages_known VARCHAR(255),
      preferred_location VARCHAR(200),
      expected_salary DECIMAL(10,2),
      availability ENUM('Available', 'On Duty', 'Not Looking for Job') DEFAULT 'Available',
      profile_photo_url VARCHAR(500),
      resume_url VARCHAR(500),
      id_proof_url VARCHAR(500),
      is_verified BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('  ✅ driver_profiles table created or verified.');

  // 2. JOB REQUESTS TABLE
  await conn.query(`
    CREATE TABLE IF NOT EXISTS job_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      owner_id INT NOT NULL,
      driver_id INT NOT NULL,
      status ENUM('waiting', 'accepted', 'rejected') DEFAULT 'waiting',
      message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('  ✅ job_requests table created or verified.');

  // 3. REVIEWS TABLE
  await conn.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reviewer_id INT NOT NULL,
      reviewee_id INT NOT NULL,
      rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
      review_text TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewee_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('  ✅ reviews table created or verified.');

  await conn.end();
  console.log('🎉 Driver migration completed successfully!');
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
