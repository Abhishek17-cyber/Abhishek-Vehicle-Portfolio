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

  console.log('Running migration: Create vehicle_compliance table');
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS vehicle_compliance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vehicle_id INT NOT NULL,
        doc_type ENUM('insurance', 'fitness_cert', 'permit', 'puc', 'road_tax', 'other') NOT NULL,
        document_number VARCHAR(100),
        issue_date DATE,
        expiry_date DATE NOT NULL,
        upload_id INT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
        FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Successfully created vehicle_compliance table.');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
  }

  await conn.end();
}

migrate();
