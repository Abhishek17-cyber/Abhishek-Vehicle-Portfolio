const db = require('./config/db');

async function run() {
  try {
    const [result] = await db.execute(
      `INSERT INTO vehicles (
        vehicle_number, make, model, year, purchase_date,
        length, length_unit, weight, weight_unit, photo_url,
        owner_name, owner_phone, owner_address,
        driver_name, driver_phone, driver_salary,
        description, next_service_date, service_reminder_days, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'MH 12 AB 1234', 'Tata', '407',
        null, null,
        null, 'meters',
        null, 'tons',
        null,
        'Abhishek', '+91 9876543210', null,
        'Prakash', '+91 9845632143', '25000',
        null, '2026-03-12',
        7, 'active'
      ]
    );
    console.log('SUCCESS', result);
  } catch (err) {
    console.error('ERROR', err);
  }
  process.exit();
}

run();
