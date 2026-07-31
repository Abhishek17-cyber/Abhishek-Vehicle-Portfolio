const db = require('./backend/config/db');

async function updateSchema() {
  try {
    const queries = [
      `ALTER TABLE driver_profiles ADD COLUMN prev_company_name VARCHAR(255) DEFAULT NULL;`,
      `ALTER TABLE driver_profiles ADD COLUMN prev_owner_name VARCHAR(255) DEFAULT NULL;`,
      `ALTER TABLE driver_profiles ADD COLUMN prev_employment_period VARCHAR(100) DEFAULT NULL;`,
      `ALTER TABLE driver_profiles ADD COLUMN reason_for_leaving TEXT DEFAULT NULL;`,
      `ALTER TABLE driver_profiles ADD COLUMN reference_contact_number VARCHAR(20) DEFAULT NULL;`,
      `ALTER TABLE driver_profiles ADD COLUMN reference_consent BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE vehicles MODIFY COLUMN vehicle_type VARCHAR(100) DEFAULT NULL;`
    ];
    
    for (const q of queries) {
      try {
        await db.execute(q);
        console.log('Executed:', q);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log('Column already exists, skipping:', q);
        } else {
          throw err;
        }
      }
    }
    console.log('Schema update complete.');
  } catch (err) {
    console.error('Error updating schema:', err);
  } finally {
    process.exit(0);
  }
}

updateSchema();
