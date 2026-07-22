const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function migrate() {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'vehicle_portfolio'
    });

    console.log('Migrating photo_url to TEXT in vehicles table...');
    await conn.query('ALTER TABLE vehicles MODIFY COLUMN photo_url TEXT');
    console.log('Migration successful!');
    await conn.end();
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

migrate();
