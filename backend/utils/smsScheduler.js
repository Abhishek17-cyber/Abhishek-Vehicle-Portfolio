/**
 * utils/smsScheduler.js — Automatic Service Due SMS Reminder Scheduler
 * Checks vehicles with upcoming or overdue service dates daily and automatically sends AWS SNS SMS to Owners and Drivers.
 */

const db = require('../config/db');
const { sendDirectSMS } = require('./snsService');

/**
 * Check and send automatic SMS reminders for all vehicles with service due.
 * Deduplicates sending so each vehicle only receives one reminder per day.
 */
async function runAutomaticServiceSMSReminders() {
  console.log('[SMS Scheduler] Running automatic service SMS reminder check...');

  try {
    // Fetch all vehicles where next_service_date is approaching (within service_reminder_days) or overdue
    // AND an SMS has not been sent today (last_service_sms_date IS NULL OR last_service_sms_date < CURDATE())
    const [vehicles] = await db.execute(`
      SELECT id, vehicle_number, make, model, owner_name, owner_phone, driver_name, driver_phone,
             next_service_date, service_reminder_days,
             DATEDIFF(next_service_date, CURDATE()) AS days_until_service
      FROM vehicles
      WHERE next_service_date IS NOT NULL
        AND DATEDIFF(next_service_date, CURDATE()) <= COALESCE(service_reminder_days, 7)
        AND DATEDIFF(next_service_date, CURDATE()) >= -30
        AND (last_service_sms_date IS NULL OR last_service_sms_date < CURDATE())
    `);

    if (!vehicles.length) {
      console.log('[SMS Scheduler] No pending service SMS reminders to send today.');
      return { sentCount: 0, failedCount: 0 };
    }

    console.log(`[SMS Scheduler] Found ${vehicles.length} vehicle(s) needing automatic service SMS reminders.`);

    let sentCount = 0;
    let failedCount = 0;

    for (const v of vehicles) {
      const daysLeft = v.days_until_service;
      const formattedDate = new Date(v.next_service_date).toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric'
      });

      const dueStatus = daysLeft <= 0 ? 'OVERDUE' : `${daysLeft} days left`;

      let smsSentForThisVehicle = false;

      // Send to Owner
      if (v.owner_phone) {
        const ownerMsg = `Fleet Alert: Dear ${v.owner_name || 'Owner'}, vehicle ${v.vehicle_number} service is due on ${formattedDate} (${dueStatus}). Please schedule service.`;
        const res = await sendDirectSMS(v.owner_phone, ownerMsg);
        if (res.success) {
          sentCount++;
          smsSentForThisVehicle = true;
        } else {
          failedCount++;
        }
      }

      // Send to Driver
      if (v.driver_phone) {
        const driverMsg = `Fleet Alert: Hi ${v.driver_name || 'Driver'}, vehicle ${v.vehicle_number} assigned to you is due for service on ${formattedDate} (${dueStatus}). Please inform fleet manager.`;
        const res = await sendDirectSMS(v.driver_phone, driverMsg);
        if (res.success) {
          sentCount++;
          smsSentForThisVehicle = true;
        } else {
          failedCount++;
        }
      }

      // If at least one SMS was attempted and sent, mark last_service_sms_date as CURDATE() to avoid duplicate SMS today
      if (smsSentForThisVehicle) {
        await db.execute('UPDATE vehicles SET last_service_sms_date = CURDATE() WHERE id = ?', [v.id]);
      }
    }

    console.log(`[SMS Scheduler] Completed automatic SMS reminders. Sent: ${sentCount}, Failed: ${failedCount}`);
    return { sentCount, failedCount };
  } catch (err) {
    console.error('[SMS Scheduler] Error running automatic service SMS reminders:', err.message || err);
  }
}

/**
 * Initialize background scheduler:
 * - Runs once 20 seconds after server startup.
 * - Schedules recurring daily check every 24 hours.
 */
function initSMSScheduler() {
  console.log('[SMS Scheduler] Initializing automatic daily service SMS reminder task...');

  // Initial run 20 seconds after startup
  setTimeout(() => {
    runAutomaticServiceSMSReminders();
  }, 20000);

  // Daily interval (24 hours = 86,400,000 milliseconds)
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    runAutomaticServiceSMSReminders();
  }, TWENTY_FOUR_HOURS);
}

module.exports = {
  initSMSScheduler,
  runAutomaticServiceSMSReminders
};
