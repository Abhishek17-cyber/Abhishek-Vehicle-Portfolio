/**
 * routes/analytics.js — Fleet Analytics API
 * Restricted to Owner and Admin roles.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// Apply JWT token verification
router.use(verifyToken);

// Middleware to restrict access to Owner & Admin
const requireOwnerOrAdmin = (req, res, next) => {
  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied: Owners and Admins only' });
  }
  next();
};

router.get('/dashboard', requireOwnerOrAdmin, async (req, res) => {
  try {
    const ownerId = req.user.id;

    // 1. Fetch Owner's vehicles
    const [vehicles] = await db.execute(
      'SELECT id, vehicle_number, make, model, status, next_service_date, service_reminder_days FROM vehicles WHERE owner_id = ?',
      [ownerId]
    );

    if (vehicles.length === 0) {
      return res.json({
        monthlyFuel: [],
        monthlyService: [],
        monthlyDistance: [],
        utilization: {
          statusBreakdown: { active: 0, inactive: 0, in_service: 0 },
          vehicleUtilization: []
        },
        serviceDueVehicles: []
      });
    }

    const vehicleIds = vehicles.map(v => v.id);
    const placeholders = vehicleIds.map(() => '?').join(',');

    // 2. Fetch Monthly Fuel Expenses (from diesel_records)
    const [fuelRows] = await db.query(
      `SELECT DATE_FORMAT(refuel_datetime, '%Y-%m') AS month, SUM(cost) AS total_fuel 
       FROM diesel_records 
       WHERE vehicle_id IN (${placeholders}) 
       GROUP BY month 
       ORDER BY month ASC`,
      [...vehicleIds]
    );

    // 3. Fetch Monthly Maintenance/Service Costs (from service_records)
    const [serviceRows] = await db.query(
      `SELECT DATE_FORMAT(service_date, '%Y-%m') AS month, SUM(cost) AS total_service 
       FROM service_records 
       WHERE vehicle_id IN (${placeholders}) 
       GROUP BY month 
       ORDER BY month ASC`,
      [...vehicleIds]
    );

    // 4. Fetch Total Kilometers Travelled (from trips)
    const [distanceRows] = await db.query(
      `SELECT DATE_FORMAT(trip_date, '%Y-%m') AS month, SUM(distance_km) AS total_distance 
       FROM trips 
       WHERE vehicle_id IN (${placeholders}) AND status = 'completed'
       GROUP BY month 
       ORDER BY month ASC`,
      [...vehicleIds]
    );

    // 5. Calculate Vehicle Utilization
    // Donut breakdown of current status
    const statusBreakdown = { active: 0, inactive: 0, in_service: 0 };
    vehicles.forEach(v => {
      if (statusBreakdown[v.status] !== undefined) {
        statusBreakdown[v.status]++;
      }
    });

    // 30-day trip utilization rate per vehicle
    const [utilizationRows] = await db.query(
      `SELECT v.id, v.vehicle_number, COUNT(DISTINCT DATE(t.trip_date)) AS active_days 
       FROM vehicles v 
       LEFT JOIN trips t ON v.id = t.vehicle_id 
                        AND t.trip_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                        AND t.status IN ('completed', 'in_progress')
       WHERE v.owner_id = ? 
       GROUP BY v.id, v.vehicle_number`,
      [ownerId]
    );

    const vehicleUtilization = utilizationRows.map(row => {
      const rate = ((row.active_days / 30) * 100).toFixed(1);
      return {
        vehicle_id: row.id,
        vehicle_number: row.vehicle_number,
        active_days: row.active_days,
        utilization_rate: parseFloat(rate)
      };
    });

    // 6. Vehicles Nearing Service (sorted by closest next_service_date)
    const serviceDueVehicles = vehicles
      .map(v => {
        let daysLeft = null;
        if (v.next_service_date) {
          const diffTime = new Date(v.next_service_date) - new Date();
          daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
        return {
          id: v.id,
          vehicle_number: v.vehicle_number,
          make: v.make,
          model: v.model,
          next_service_date: v.next_service_date,
          days_left: daysLeft
        };
      })
      .filter(v => v.next_service_date !== null)
      .sort((a, b) => a.days_left - b.days_left);

    return res.json({
      monthlyFuel: fuelRows,
      monthlyService: serviceRows,
      monthlyDistance: distanceRows,
      utilization: {
        statusBreakdown,
        vehicleUtilization
      },
      serviceDueVehicles
    });
  } catch (err) {
    console.error('Analytics dashboard error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
