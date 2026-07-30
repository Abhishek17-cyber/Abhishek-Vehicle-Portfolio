const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Abhi@401',
    database: process.env.DB_NAME || 'vehicle_portfolio',
  });

  console.log('Running database migrations...');
  
  // Add profile_picture_url to users
  try {
    await pool.query('ALTER TABLE users ADD COLUMN profile_picture_url VARCHAR(500) NULL');
    console.log('✅ Added profile_picture_url to users table successfully');
  } catch (err) {
    if (err.code === 'ER_DUP_COLUMN_NAME') {
      console.log('ℹ️ profile_picture_url column already exists in users');
    } else {
      console.error('❌ Error adding profile_picture_url:', err);
    }
  }

  // Add driver_user_id to vehicles
  try {
    await pool.query('ALTER TABLE vehicles ADD COLUMN driver_user_id INT NULL');
    console.log('✅ Added driver_user_id to vehicles table successfully');
  } catch (err) {
    if (err.code === 'ER_DUP_COLUMN_NAME') {
      console.log('ℹ️ driver_user_id column already exists in vehicles');
    } else {
      console.error('❌ Error adding driver_user_id:', err);
    }
  }

  // Add foreign key constraint
  try {
    await pool.query('ALTER TABLE vehicles ADD CONSTRAINT fk_vehicles_driver FOREIGN KEY (driver_user_id) REFERENCES users(id) ON DELETE SET NULL');
    console.log('✅ Added foreign key constraint fk_vehicles_driver');
  } catch (err) {
    if (err.code === 'ER_FK_DUP_NAME' || err.message.includes('Duplicate foreign key')) {
      console.log('ℹ️ Foreign key constraint fk_vehicles_driver already exists');
    } else {
      console.error('❌ Error adding foreign key constraint:', err.message);
    }
  }

  // Add distance_km to trips table
  try {
    await pool.query('ALTER TABLE trips ADD COLUMN distance_km DECIMAL(10,2) NULL');
    console.log('✅ Added distance_km column to trips table successfully');
  } catch (err) {
    if (err.code === 'ER_DUP_COLUMN_NAME') {
      console.log('ℹ️ distance_km column already exists in trips');
    } else {
      console.error('❌ Error adding distance_km column:', err);
    }
  }

  // Modify vehicle_type column to VARCHAR(100) to avoid ENUM truncation errors
  try {
    await pool.query('ALTER TABLE vehicles MODIFY COLUMN vehicle_type VARCHAR(100) NULL');
    console.log('✅ Modified vehicle_type column to VARCHAR(100) successfully');
  } catch (err) {
    console.error('❌ Error modifying vehicle_type column:', err.message);
  }

  await pool.end();
  console.log('Migration finished!');
}

run().catch(console.error);
