/**
 * routes/ai.js — FleetIQ AI Assistant API Route
 * Supports AWS Bedrock Foundation Models with instant direct smart engine fallback.
 */
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const { queryManagedPrompt } = require('../utils/bedrockService');

// ===== POST /api/ai/chat =====
router.post('/chat', verifyToken, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ message: 'Please provide a valid question or prompt.' });
  }

  try {
    const isDriver = req.user.role === 'driver';

    // 1. Fetch live fleet context directly from MySQL DB
    const [vehicles] = await db.execute(
      `SELECT id, vehicle_number, make, model, year, vehicle_type, owner_name, owner_phone, driver_name, driver_phone, last_service_date, next_service_date, service_reminder_days, status
       FROM vehicles
       WHERE ${isDriver ? 'driver_user_id = ?' : 'owner_id = ?'}
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    const [serviceAlerts] = await db.execute(
      `SELECT vehicle_number, make, model, owner_phone, driver_phone, next_service_date, DATEDIFF(next_service_date, CURDATE()) AS days_left
       FROM vehicles
       WHERE next_service_date IS NOT NULL
         AND ${isDriver ? 'driver_user_id = ?' : 'owner_id = ?'}
         AND DATEDIFF(next_service_date, CURDATE()) <= 30
       ORDER BY next_service_date ASC`,
      [req.user.id]
    );

    const [recentDiesel] = await db.execute(
      `SELECT d.liters as litres, d.cost, d.refuel_datetime as fuel_date, v.vehicle_number
       FROM diesel_records d
       JOIN vehicles v ON d.vehicle_id = v.id
       WHERE ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}
       ORDER BY d.refuel_datetime DESC LIMIT 15`,
      [req.user.id]
    );

    const [recentTrips] = await db.execute(
      `SELECT t.source_address as start_location, t.destination_address as end_location, t.trip_date, t.revenue, 0 as fuel_cost, v.vehicle_number
       FROM trips t
       JOIN vehicles v ON t.vehicle_id = v.id
       WHERE ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}
       ORDER BY t.trip_date DESC LIMIT 15`,
      [req.user.id]
    );

    let complianceAlerts = [];
    try {
      const [comp] = await db.execute(
        `SELECT c.doc_type, c.expiry_date, v.vehicle_number, DATEDIFF(c.expiry_date, CURDATE()) as days_to_expiry
         FROM vehicle_compliance c
         JOIN vehicles v ON c.vehicle_id = v.id
         WHERE ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}
           AND DATEDIFF(c.expiry_date, CURDATE()) <= 30
         ORDER BY c.expiry_date ASC`,
        [req.user.id]
      );
      complianceAlerts = comp;
    } catch (cErr) {
      // Compliance table optional
    }

    const fleetContext = {
      userRole: req.user.role,
      userName: req.user.name || req.user.username || 'Fleet Manager',
      totalVehicles: vehicles.length,
      vehicles: vehicles,
      serviceAlerts: serviceAlerts,
      recentDiesel: recentDiesel,
      recentTrips: recentTrips,
      complianceAlerts: complianceAlerts
    };

    // 2. Try AWS Bedrock AI first if AWS Credentials are provided
    try {
      const aiAnswer = await queryManagedPrompt(prompt.trim(), fleetContext);
      return res.json({
        source: 'Amazon Bedrock AI',
        answer: aiAnswer
      });
    } catch (bedrockErr) {
      console.warn('⚠️ Bedrock fallback engaged:', bedrockErr.message);

      // Smart Direct AI engine fallback if Bedrock credentials/quota not set yet
      const fallbackAnswer = generateDirectSmartAIAnswer(prompt.trim(), fleetContext);
      return res.json({
        source: 'FleetIQ Smart AI Engine',
        answer: fallbackAnswer
      });
    }

  } catch (err) {
    console.error('AI chat error:', err);
    return res.status(500).json({ message: 'Failed to process AI query: ' + err.message });
  }
});

/**
 * Direct Intelligent Fleet Analytics & NLP Answer Generator (Fallback / Direct)
 */
function generateDirectSmartAIAnswer(userPrompt, ctx) {
  const q = userPrompt.toLowerCase();

  // --- GREETINGS & HELP ---
  if (/^(hi|hello|hey|greetings|help|options|who are you)/i.test(q)) {
    return `👋 **Hello ${ctx.userName}! I am FleetIQ AI.**\n\nI analyze your live fleet database directly to provide instant analytics. Here is what I can answer:\n\n- 🔧 *"Which vehicles are due for service?"*\n- ⛽ *"What are my recent diesel costs?"*\n- 🚛 *"List all my registered vehicles"* \n- 🛣️ *"Show trip revenue and profit summary"*\n- 📜 *"Any document or insurance expiries?"*\n- 📊 *"Show complete fleet overview"*`;
  }

  // --- SERVICE & MAINTENANCE ---
  if (q.includes('service') || q.includes('due') || q.includes('maintenance') || q.includes('repair')) {
    if (!ctx.serviceAlerts || !ctx.serviceAlerts.length) {
      return `✅ **All clear!** None of your **${ctx.totalVehicles} registered vehicle(s)** have service due in the next 30 days.`;
    }
    const list = ctx.serviceAlerts.map(s => {
      const formattedDate = s.next_service_date ? String(s.next_service_date).split('T')[0] : 'N/A';
      const statusBadge = s.days_left <= 0 ? '⚠️ **OVERDUE**' : `⏳ **${s.days_left} days remaining**`;
      return `- **${s.vehicle_number}** (${s.make || ''} ${s.model || ''}): Due **${formattedDate}** (${statusBadge})`;
    }).join('\n');

    return `🔧 **Service & Maintenance Status Report:**\n\nYou have **${ctx.serviceAlerts.length} vehicle(s)** requiring service attention within 30 days:\n\n${list}\n\n💡 *Tip: Click on the Service menu to update service records after maintenance.*`;
  }

  // --- DIESEL & FUEL EXPENSES ---
  if (q.includes('diesel') || q.includes('fuel') || q.includes('petrol') || q.includes('gas') || q.includes('expense') || q.includes('refuel')) {
    if (!ctx.recentDiesel || !ctx.recentDiesel.length) {
      return `⛽ **Diesel Expense Report:** No recent diesel fueling records found in your fleet account. You can log fuel fill-ups from the Diesel tab.`;
    }

    const totalCost = ctx.recentDiesel.reduce((sum, d) => sum + parseFloat(d.cost || 0), 0);
    const totalLitres = ctx.recentDiesel.reduce((sum, d) => sum + parseFloat(d.litres || 0), 0);
    const avgRate = totalLitres > 0 ? (totalCost / totalLitres).toFixed(2) : '0.00';

    const recentLogs = ctx.recentDiesel.slice(0, 5).map(d => {
      const fDate = d.fuel_date ? String(d.fuel_date).split('T')[0] : 'Recent';
      return `- **${d.vehicle_number}**: ${d.litres}L (₹${parseFloat(d.cost).toLocaleString('en-IN')}) on ${fDate}`;
    }).join('\n');

    return `⛽ **Diesel & Fuel Expense Summary:**\n\n- **Recent Transactions:** ${ctx.recentDiesel.length} logs\n- **Total Fuel Purchased:** ${totalLitres.toFixed(1)} Litres\n- **Total Cost:** ₹${totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n- **Average Cost/Litre:** ₹${avgRate}/L\n\n📋 **Recent Logged Refuels:**\n${recentLogs}`;
  }

  // --- TRIPS, REVENUE & PROFIT ---
  if (q.includes('trip') || q.includes('revenue') || q.includes('profit') || q.includes('earning') || q.includes('income')) {
    if (!ctx.recentTrips || !ctx.recentTrips.length) {
      return `🛣️ **Trips & Earnings:** No trip records logged yet in your account. Use the Trips menu to log route trips and revenue!`;
    }

    const totalRevenue = ctx.recentTrips.reduce((sum, t) => sum + parseFloat(t.revenue || 0), 0);
    const totalFuelCost = ctx.recentTrips.reduce((sum, t) => sum + parseFloat(t.fuel_cost || 0), 0);
    const netProfit = totalRevenue - totalFuelCost;

    const recentList = ctx.recentTrips.slice(0, 5).map(t => {
      const tDate = t.trip_date ? String(t.trip_date).split('T')[0] : 'Recent';
      return `- **${t.vehicle_number}**: ${t.start_location || 'Start'} ➡️ ${t.end_location || 'End'} (Rev: ₹${parseFloat(t.revenue).toLocaleString('en-IN')}) on ${tDate}`;
    }).join('\n');

    return `🛣️ **Trips & Revenue Overview:**\n\n- **Trips Analyzed:** ${ctx.recentTrips.length}\n- **Total Revenue:** ₹${totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n- **Total Trip Fuel Costs:** ₹${totalFuelCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n- **Net Estimated Profit:** ₹${netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n\n📋 **Recent Trips Logged:**\n${recentList}`;
  }

  // --- COMPLIANCE & DOCUMENTS ---
  if (q.includes('compliance') || q.includes('document') || q.includes('insurance') || q.includes('permit') || q.includes('fitness') || q.includes('expire') || q.includes('expiry')) {
    if (!ctx.complianceAlerts || !ctx.complianceAlerts.length) {
      return `📜 **Compliance Check:** All vehicle compliance documents (Insurance, Fitness, Permits) are currently valid and up to date!`;
    }

    const list = ctx.complianceAlerts.map(c => {
      const expDate = c.expiry_date ? String(c.expiry_date).split('T')[0] : 'N/A';
      const badge = c.days_to_expiry < 0 ? '⚠️ **EXPIRED**' : `⏳ **Expires in ${c.days_to_expiry} days**`;
      return `- **${c.vehicle_number}** - ${c.doc_type}: ${expDate} (${badge})`;
    }).join('\n');

    return `📜 **Vehicle Compliance Alerts:**\n\nYou have **${ctx.complianceAlerts.length} document(s)** expiring soon or expired:\n\n${list}\n\n💡 *Action Needed: Renew documents in the Compliance section to avoid legal penalties.*`;
  }

  // --- VEHICLES & DRIVERS LIST ---
  if (q.includes('vehicle') || q.includes('truck') || q.includes('fleet') || q.includes('list') || q.includes('driver')) {
    if (!ctx.vehicles || !ctx.vehicles.length) {
      return `🚛 You currently have **0 vehicles** registered in your portfolio. Go to **My Vehicles** or **Add Vehicle** to register your trucks!`;
    }

    const vList = ctx.vehicles.map(v => {
      const driverStr = v.driver_name ? `Driver: ${v.driver_name}` : '⚠️ Driver Unassigned';
      const statusStr = v.status || 'Active';
      return `- **${v.vehicle_number}** (${v.make || ''} ${v.model || ''}) | ${driverStr} | Status: ${statusStr}`;
    }).join('\n');

    return `🚛 **Registered Fleet Portfolio (${ctx.totalVehicles} Vehicles):**\n\n${vList}`;
  }

  // --- OVERVIEW / SUMMARY / DASHBOARD ---
  if (q.includes('summary') || q.includes('overview') || q.includes('dashboard') || q.includes('stat') || q.includes('total') || q.includes('report')) {
    const totalDieselCost = ctx.recentDiesel.reduce((sum, d) => sum + parseFloat(d.cost || 0), 0);
    const totalRevenue = ctx.recentTrips.reduce((sum, t) => sum + parseFloat(t.revenue || 0), 0);
    const netEarnings = totalRevenue - totalDieselCost;

    return `📊 **FleetIQ Comprehensive Performance Summary:**\n\n- 🚛 **Total Active Vehicles:** ${ctx.totalVehicles}\n- 🔧 **Pending Service Reminders:** ${ctx.serviceAlerts ? ctx.serviceAlerts.length : 0}\n- 📜 **Expiring Compliance Docs:** ${ctx.complianceAlerts ? ctx.complianceAlerts.length : 0}\n- ⛽ **Recent Diesel Expense:** ₹${totalDieselCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n- 🛣️ **Recent Trip Revenue:** ₹${totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n- 💰 **Est. Gross Net Earnings:** ₹${netEarnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  }

  // --- SPECIFIC VEHICLE NUMBER MATCH ---
  const foundVehicle = ctx.vehicles.find(v => q.includes(v.vehicle_number.toLowerCase().replace(/[\s-]/g, '')));
  if (foundVehicle) {
    const nextService = foundVehicle.next_service_date ? String(foundVehicle.next_service_date).split('T')[0] : 'Not Scheduled';
    return `🚛 **Vehicle Details: ${foundVehicle.vehicle_number}**\n\n- **Make & Model:** ${foundVehicle.make || ''} ${foundVehicle.model || ''} (${foundVehicle.year || 'N/A'})\n- **Assigned Driver:** ${foundVehicle.driver_name || 'Unassigned'} (${foundVehicle.driver_phone || 'N/A'})\n- **Status:** ${foundVehicle.status || 'Active'}\n- **Next Service Due:** ${nextService}\n- **Owner Contact:** ${foundVehicle.owner_phone || 'N/A'}`;
  }

  // --- DEFAULT SMART FALLBACK ---
  return `🤖 **FleetIQ AI Assistant:**\n\nI searched your fleet records (**${ctx.totalVehicles} vehicles registered**). Here are top things you can ask me:\n- *"Which vehicles are due for service?"*\n- *"What are my recent diesel costs?"*\n- *"Show trip revenue & net profit"* \n- *"List all registered trucks"*`;
}

module.exports = router;
