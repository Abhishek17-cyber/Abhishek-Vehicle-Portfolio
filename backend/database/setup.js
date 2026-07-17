/**
 * database/setup.js — MySQL Schema Setup
 * Run: node database/setup.js
 * Creates the vehicle_portfolio database and all required tables.
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function setup() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log("║   Abhishek's Vehicle Portfolio — DB Setup        ║");
  console.log('╚══════════════════════════════════════════════════╝');

  // Connect without specifying database first
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  const DB = process.env.DB_NAME || 'vehicle_portfolio';
  console.log(`\n📦 Creating database: ${DB}`);

  // Create database
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${DB}\``);

  console.log('📋 Creating tables...');

  // ===== USERS TABLE =====
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      username            VARCHAR(50) NOT NULL UNIQUE,
      password            VARCHAR(255) NOT NULL,
      role                ENUM('owner','driver','admin') NOT NULL DEFAULT 'owner',
      owner_id            INT NULL,
      profile_picture_url VARCHAR(500) NULL,
      created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('  ✅ users');

  // Migration: Add owner_id to users if not exists
  try {
    await conn.query(`
      ALTER TABLE users 
      ADD COLUMN owner_id INT NULL,
      ADD CONSTRAINT fk_users_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    `);
    console.log('  🔧 Migrated: Added owner_id to users');
  } catch (e) {
    if (e.code !== 'ER_DUP_COLUMN_NAME' && e.code !== 'ER_FK_DUP_NAME') {
      console.log('  ℹ️ Users migration status:', e.message);
    }
  }

  // ===== VEHICLES TABLE =====
  await conn.query(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      vehicle_number        VARCHAR(20) NOT NULL UNIQUE,
      make                  VARCHAR(100) NOT NULL,
      model                 VARCHAR(100) NOT NULL,
      year                  YEAR,
      purchase_date         DATE,
      length                DECIMAL(8,2),
      length_unit           ENUM('meters','feet') DEFAULT 'meters',
      weight                DECIMAL(10,2),
      weight_unit           ENUM('tons','kg') DEFAULT 'tons',
      photo_url             VARCHAR(500),
      owner_name            VARCHAR(200) NOT NULL,
      owner_phone           VARCHAR(20) NOT NULL,
      owner_address         TEXT,
      driver_name           VARCHAR(200),
      driver_phone          VARCHAR(20),
      driver_salary         DECIMAL(10,2),
      description           TEXT,
      next_service_date     DATE,
      service_reminder_days INT DEFAULT 7,
      status                ENUM('active','inactive','in_service') DEFAULT 'active',
      owner_id              INT NULL,
      driver_user_id        INT NULL,
      created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (driver_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('  ✅ vehicles');

  // Migration: Add owner_id to vehicles if not exists
  try {
    await conn.query(`
      ALTER TABLE vehicles 
      ADD COLUMN owner_id INT NULL,
      ADD CONSTRAINT fk_vehicles_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
    `);
    console.log('  🔧 Migrated: Added owner_id to vehicles');
  } catch (e) {
    if (e.code !== 'ER_DUP_COLUMN_NAME' && e.code !== 'ER_FK_DUP_NAME') {
      console.log('  ℹ️ Vehicles migration status:', e.message);
    }
  }

  // ===== TRIPS TABLE =====
  await conn.query(`
    CREATE TABLE IF NOT EXISTS trips (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      vehicle_id            INT NOT NULL,
      trip_date             DATETIME NOT NULL,
      source_address        VARCHAR(500) NOT NULL,
      source_city           VARCHAR(200),
      destination_address   VARCHAR(500) NOT NULL,
      destination_city      VARCHAR(200),
      toll_fee_up           DECIMAL(10,2) DEFAULT 0,
      toll_fee_down         DECIMAL(10,2) DEFAULT 0,
      total_toll            DECIMAL(10,2) GENERATED ALWAYS AS (toll_fee_up + toll_fee_down) STORED,
      load_weight           DECIMAL(10,2),
      load_unit             ENUM('tons','kg') DEFAULT 'tons',
      distance_km           DECIMAL(10,2) NULL,
      revenue               DECIMAL(10,2) DEFAULT 0.00,
      load_rental           DECIMAL(10,2) DEFAULT 0.00,
      notes                 TEXT,
      status                ENUM('planned','in_progress','completed') DEFAULT 'planned',
      created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('  ✅ trips');

  // ===== DIESEL RECORDS TABLE =====
  await conn.query(`
    CREATE TABLE IF NOT EXISTS diesel_records (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      vehicle_id        INT NOT NULL,
      trip_id           INT,
      refuel_datetime   DATETIME NOT NULL,
      cost              DECIMAL(10,2) NOT NULL,
      liters            DECIMAL(10,2),
      trip_source       VARCHAR(500),
      trip_destination  VARCHAR(500),
      pump_station      VARCHAR(300),
      bill_image_url    VARCHAR(500),
      notes             TEXT,
      created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
      FOREIGN KEY (trip_id)    REFERENCES trips(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('  ✅ diesel_records');

  // ===== SERVICE RECORDS TABLE =====
  await conn.query(`
    CREATE TABLE IF NOT EXISTS service_records (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      vehicle_id        INT NOT NULL,
      service_date      DATE NOT NULL,
      service_type      VARCHAR(200) NOT NULL,
      description       TEXT,
      cost              DECIMAL(10,2),
      next_service_date DATE,
      mechanic_name     VARCHAR(200),
      garage_name       VARCHAR(300),
      created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('  ✅ service_records');

  // ===== UPLOADS TABLE =====
  await conn.query(`
    CREATE TABLE IF NOT EXISTS uploads (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      vehicle_id  INT,
      trip_id     INT,
      doc_type    ENUM('diesel_bill','load_bill','weight_bill','vehicle_photo','other') DEFAULT 'other',
      file_name   VARCHAR(500) NOT NULL,
      file_url    VARCHAR(500) NOT NULL,
      file_size   INT,
      mime_type   VARCHAR(100),
      notes       TEXT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
      FOREIGN KEY (trip_id)    REFERENCES trips(id)    ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('  ✅ uploads');

  // ===== DRIVER PROFILES TABLE =====
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
  console.log('  ✅ driver_profiles');

  // ===== JOB REQUESTS TABLE =====
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
  console.log('  ✅ job_requests');

  // ===== REVIEWS TABLE =====
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
  console.log('  ✅ reviews');

  // ===== SEED USERS =====
  console.log('\n👤 Creating default users...');
  const [existingUsers] = await conn.query('SELECT id FROM users WHERE username IN (?, ?, ?)', ['admin', 'owner', 'driver']);

  if (existingUsers.length === 0) {
    const adminHash  = await bcrypt.hash('admin123', 10);
    const ownerHash  = await bcrypt.hash('owner123', 10);
    const driverHash = await bcrypt.hash('driver123', 10);

    await conn.query(
      'INSERT INTO users (username, password, role) VALUES (?,?,?),(?,?,?),(?,?,?)',
      ['admin', adminHash, 'admin', 'owner', ownerHash, 'owner', 'driver', driverHash, 'driver']
    );

    console.log('  ✅ Created users:');
    console.log('     admin  / admin123  (role: admin)');
    console.log('     owner  / owner123  (role: owner)');
    console.log('     driver / driver123 (role: driver)');
  } else {
    console.log('  ℹ️  Users already exist, skipping seed.');
  }

  await conn.end();

  console.log('\n✅ Database setup complete!');
  console.log('   You can now start the server: npm start\n');
}

setup().catch(err => {
  console.error('\n❌ Setup failed:', err.message);
  console.error('   Make sure MySQL is running and your .env file is configured correctly.');
  process.exit(1);
});
