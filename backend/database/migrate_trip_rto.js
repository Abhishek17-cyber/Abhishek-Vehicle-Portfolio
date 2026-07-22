const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'vehicle_portfolio'
  });

  console.log('Running migration: Add rto_charges to trips');
  try {
    await conn.query(`
      ALTER TABLE trips 
      ADD COLUMN rto_charges DECIMAL(10,2) DEFAULT 0.00 AFTER unloading_cost
    `);
    console.log('✅ Successfully added rto_charges to trips table.');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️ rto_charges column already exists.');
    } else {
      console.error('❌ Migration error:', err.message);
    }
  }

  await conn.end();
}

migrate();
