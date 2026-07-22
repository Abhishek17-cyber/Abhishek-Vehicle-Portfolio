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

  console.log('Running migration: Add vehicle_type to vehicles');
  try {
    await conn.query(`
      ALTER TABLE vehicles 
      ADD COLUMN vehicle_type ENUM('Container', 'Body', 'Trailor', 'Tipper') NULL AFTER weight_unit
    `);
    console.log('✅ Successfully added vehicle_type to vehicles table.');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️ vehicle_type column already exists.');
    } else {
      console.error('❌ Migration error:', err.message);
    }
  }

  await conn.end();
}

migrate();
