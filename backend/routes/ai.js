/**
 * routes/ai.js — Amazon Bedrock AI Assistant API Route
 */
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const { queryBedrockAI } = require('../utils/bedrockService');

// ===== POST /api/ai/chat =====
router.post('/chat', verifyToken, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ message: 'Please provide a valid question or prompt.' });
  }

  try {
    const isDriver = req.user.role === 'driver';

    // 1. Fetch live fleet context for Bedrock
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
      `SELECT d.litres, d.cost, d.fuel_date, v.vehicle_number
       FROM diesel d
       JOIN vehicles v ON d.vehicle_id = v.id
       WHERE ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}
       ORDER BY d.fuel_date DESC LIMIT 10`,
      [req.user.id]
    );

    const [recentTrips] = await db.execute(
      `SELECT t.start_location, t.end_location, t.trip_date, t.revenue, t.fuel_cost, v.vehicle_number
       FROM trips t
       JOIN vehicles v ON t.vehicle_id = v.id
       WHERE ${isDriver ? 'v.driver_user_id = ?' : 'v.owner_id = ?'}
       ORDER BY t.trip_date DESC LIMIT 10`,
      [req.user.id]
    );

    const fleetContext = {
      userRole: req.user.role,
      totalVehicles: vehicles.length,
      vehicles: vehicles,
      serviceAlerts: serviceAlerts,
      recentDiesel: recentDiesel,
      recentTrips: recentTrips
    };

    // 2. Try invoking Amazon Bedrock
    try {
      const aiAnswer = await queryBedrockAI(prompt.trim(), fleetContext);
      return res.json({
        source: 'Amazon Bedrock AI',
        answer: aiAnswer
      });
    } catch (bedrockErr) {
      console.warn('⚠️ Bedrock fallback engaged:', bedrockErr.message);

      // Smart rule-based AI engine fallback if Bedrock credentials/quota not set yet
      const fallbackAnswer = generateSmartFallbackAnswer(prompt.trim().toLowerCase(), fleetContext);
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
 * Fallback Smart AI Assistant logic when AWS Bedrock API is initializing or offline
 */
function generateSmartFallbackAnswer(q, ctx) {
  if (q.includes('service') || q.includes('due') || q.includes('maintenance')) {
    if (!ctx.serviceAlerts || !ctx.serviceAlerts.length) {
      return `✅ **All clear!** None of your ${ctx.totalVehicles} registered vehicles have service due in the next 30 days.`;
    }
    const list = ctx.serviceAlerts.map(s => 
      `- **${s.vehicle_number}** (${s.make} ${s.model || ''}): Next service on **${s.next_service_date ? s.next_service_date.toString().split('T')[0] : 'N/A'}** (${s.days_left <= 0 ? '⚠️ OVERDUE' : s.days_left + ' days remaining'}). Owner: ${s.owner_phone || 'N/A'}`
    ).join('\n');
    return `🔧 **Service Status Report:**\n\nYou have **${ctx.serviceAlerts.length} vehicle(s)** due for service:\n\n${list}`;
  }

  if (q.includes('diesel') || q.includes('fuel') || q.includes('expense')) {
    if (!ctx.recentDiesel || !ctx.recentDiesel.length) {
      return `⛽ **Diesel Expense Report:** No recent diesel fueling records found in your fleet account.`;
    }
    const totalCost = ctx.recentDiesel.reduce((sum, d) => sum + parseFloat(d.cost || 0), 0);
    const totalLitres = ctx.recentDiesel.reduce((sum, d) => sum + parseFloat(d.litres || 0), 0);
    return `⛽ **Diesel & Fuel Summary:**\n\n- **Recent Logs Analyzed:** ${ctx.recentDiesel.length} transactions\n- **Total Fuel Purchased:** ${totalLitres.toFixed(1)} Litres\n- **Total Fuel Cost:** ₹${totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  }

  if (q.includes('vehicle') || q.includes('truck') || q.includes('fleet') || q.includes('list')) {
    if (!ctx.vehicles || !ctx.vehicles.length) {
      return `🚛 You currently have **0 vehicles** registered in your portfolio. Use **Add Vehicle** to register your first truck!`;
    }
    const vList = ctx.vehicles.map(v => `- **${v.vehicle_number}** (${v.make} ${v.model || ''} - ${v.year || ''}) | Driver: ${v.driver_name || 'Unassigned'} | Status: ${v.status}`).join('\n');
    return `🚛 **Registered Fleet Portfolio (${ctx.totalVehicles} Vehicles):**\n\n${vList}`;
  }

  if (q.includes('trip') || q.includes('revenue') || q.includes('profit')) {
    if (!ctx.recentTrips || !ctx.recentTrips.length) {
      return `🛣️ **Trips Summary:** No recent trip entries recorded.`;
    }
    const totalRevenue = ctx.recentTrips.reduce((sum, t) => sum + parseFloat(t.revenue || 0), 0);
    return `🛣️ **Recent Trips & Revenue Overview:**\n\n- **Trips Analyzed:** ${ctx.recentTrips.length}\n- **Total Revenue:** ₹${totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  }

  return `🤖 **FleetIQ AI Assistant:**\n\nI analyzed your fleet of **${ctx.totalVehicles} vehicle(s)**. You can ask me:\n- *"Which vehicles are due for service?"*\n- *"What are my recent diesel costs?"*\n- *"List all my registered vehicles"*`;
}

module.exports = router;
