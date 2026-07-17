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

  console.log('Running load rental migration...');
  
  // Add load_rental column to trips
  try {
    await pool.query('ALTER TABLE trips ADD COLUMN load_rental DECIMAL(10,2) DEFAULT 0.00');
    console.log('✅ Added load_rental column to trips table successfully');
  } catch (err) {
    if (err.code === 'ER_DUP_COLUMN_NAME') {
      console.log('ℹ️ load_rental column already exists in trips');
    } else {
      console.error('❌ Error adding load_rental column:', err);
    }
  }

  await pool.end();
  console.log('Load rental migration finished!');
}

run().catch(console.error);
