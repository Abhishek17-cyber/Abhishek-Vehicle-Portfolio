/**
 * routes/finance.js — Financial Analytics API
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

router.get('/analytics', requireOwnerOrAdmin, async (req, res) => {
  try {
    const { vehicle_id, date_from, date_to } = req.query;

    // 1. Fetch Owner's vehicles
    let vehicleQuery = 'SELECT id, vehicle_number, make, model, driver_salary FROM vehicles WHERE owner_id = ?';
    let vehicleParams = [req.user.id];

    if (vehicle_id) {
      vehicleQuery += ' AND id = ?';
      vehicleParams.push(vehicle_id);
    }

    const [vehicles] = await db.execute(vehicleQuery, vehicleParams);

    if (vehicles.length === 0) {
      return res.json({
        summary: {
          totalRevenue: 0,
          totalToll: 0,
          totalDiesel: 0,
          totalService: 0,
          totalDriverSalaries: 0,
          totalExpenses: 0,
          netProfit: 0,
          profitMargin: 0
        },
        expenseBreakdown: { diesel: 0, tolls: 0, service: 0, salaries: 0 },
        monthlyTrends: [],
        vehicleProfitability: []
      });
    }

    const vehicleIds = vehicles.map(v => v.id);
    const placeholders = vehicleIds.map(() => '?').join(',');

    // 2. Fetch Trips (for revenue, load_rental, and toll costs)
    let tripsQuery = `
      SELECT id, vehicle_id, trip_date, source_city, source_address, destination_city, destination_address, total_toll, revenue, load_rental, loading_cost, unloading_cost, rto_charges 
      FROM trips 
      WHERE vehicle_id IN (${placeholders})
    `;
    const tripsParams = [...vehicleIds];

    if (date_from) {
      tripsQuery += ' AND DATE(trip_date) >= ?';
      tripsParams.push(date_from);
    }
    if (date_to) {
      tripsQuery += ' AND DATE(trip_date) <= ?';
      tripsParams.push(date_to);
    }

    const [trips] = await db.query(tripsQuery, tripsParams);

    // 3. Fetch Diesel Records (for fuel costs)
    let dieselQuery = `
      SELECT id, vehicle_id, trip_id, refuel_datetime, cost 
      FROM diesel_records 
      WHERE vehicle_id IN (${placeholders})
    `;
    const dieselParams = [...vehicleIds];

    if (date_from) {
      dieselQuery += ' AND DATE(refuel_datetime) >= ?';
      dieselParams.push(date_from);
    }
    if (date_to) {
      dieselQuery += ' AND DATE(refuel_datetime) <= ?';
      dieselParams.push(date_to);
    }

    const [diesel] = await db.query(dieselQuery, dieselParams);

    // 4. Fetch Service Records (for maintenance costs)
    let serviceQuery = `
      SELECT id, vehicle_id, service_date, cost 
      FROM service_records 
      WHERE vehicle_id IN (${placeholders})
    `;
    const serviceParams = [...vehicleIds];

    if (date_from) {
      serviceQuery += ' AND service_date >= ?';
      serviceParams.push(date_from);
    }
    if (date_to) {
      serviceQuery += ' AND service_date <= ?';
      serviceParams.push(date_to);
    }

    const [services] = await db.query(serviceQuery, serviceParams);

    // 5. Calculate timescale (number of months elapsed) to estimate driver salaries
    let months = 1;
    if (date_from && date_to) {
      const d1 = new Date(date_from);
      const d2 = new Date(date_to);
      months = Math.max(1, (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1);
    } else {
      // Aggregate all dates in dataset to find range
      const dates = [
        ...trips.map(t => new Date(t.trip_date)),
        ...diesel.map(d => new Date(d.refuel_datetime)),
        ...services.map(s => new Date(s.service_date))
      ];
      if (dates.length > 0) {
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date();
        months = Math.max(1, (maxDate.getFullYear() - minDate.getFullYear()) * 12 + (maxDate.getMonth() - minDate.getMonth()) + 1);
      }
    }

    // 6. Perform financial aggregation
    const totalRevenue = trips.reduce((sum, t) => sum + parseFloat(t.revenue || 0), 0);
    const totalRental = trips.reduce((sum, t) => sum + parseFloat(t.load_rental || 0), 0);
    const totalToll = trips.reduce((sum, t) => sum + parseFloat(t.total_toll || 0), 0);
    const totalLoading = trips.reduce((sum, t) => sum + parseFloat(t.loading_cost || 0), 0);
    const totalUnloading = trips.reduce((sum, t) => sum + parseFloat(t.unloading_cost || 0), 0);
    const totalRto = trips.reduce((sum, t) => sum + parseFloat(t.rto_charges || 0), 0);
    const totalOtherCharges = totalLoading + totalUnloading + totalRto;
    const totalDiesel = diesel.reduce((sum, d) => sum + parseFloat(d.cost || 0), 0);
    const totalService = services.reduce((sum, s) => sum + parseFloat(s.cost || 0), 0);
    const totalDriverSalaries = vehicles.reduce((sum, v) => sum + (parseFloat(v.driver_salary || 0) * months), 0);

    const totalExpenses = totalToll + totalDiesel + totalService + totalDriverSalaries + totalOtherCharges;
    const remainingMoney = totalRental - totalExpenses;
    const profitMargin = totalRental > 0 ? (remainingMoney / totalRental) * 100 : 0;

    // 7. Monthly Trends (Grouped by YYYY-MM)
    const monthlyMap = {};

    trips.forEach(t => {
      const month = new Date(t.trip_date).toISOString().slice(0, 7);
      if (!monthlyMap[month]) monthlyMap[month] = { month, revenue: 0, rental: 0, expenses: 0 };
      monthlyMap[month].revenue += parseFloat(t.revenue || 0);
      monthlyMap[month].rental += parseFloat(t.load_rental || 0);
      monthlyMap[month].expenses += parseFloat(t.total_toll || 0) + parseFloat(t.loading_cost || 0) + parseFloat(t.unloading_cost || 0) + parseFloat(t.rto_charges || 0);
    });

    diesel.forEach(d => {
      const month = new Date(d.refuel_datetime).toISOString().slice(0, 7);
      if (!monthlyMap[month]) monthlyMap[month] = { month, revenue: 0, rental: 0, expenses: 0 };
      monthlyMap[month].expenses += parseFloat(d.cost || 0);
    });

    services.forEach(s => {
      const month = new Date(s.service_date).toISOString().slice(0, 7);
      if (!monthlyMap[month]) monthlyMap[month] = { month, revenue: 0, rental: 0, expenses: 0 };
      monthlyMap[month].expenses += parseFloat(s.cost || 0);
    });

    // Add monthly driver salaries
    Object.keys(monthlyMap).forEach(month => {
      vehicles.forEach(v => {
        monthlyMap[month].expenses += parseFloat(v.driver_salary || 0);
      });
    });

    const monthlyTrends = Object.values(monthlyMap)
      .map(item => ({
        ...item,
        netProfit: item.rental - item.expenses // Remaining Money
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // 8. Vehicle Profitability Grouping
    const vehicleMap = {};
    vehicles.forEach(v => {
      vehicleMap[v.id] = {
        id: v.id,
        vehicle_number: v.vehicle_number,
        make: v.make,
        model: v.model,
        revenue: 0,
        rental: 0,
        diesel: 0,
        tolls: 0,
        service: 0,
        salary: parseFloat(v.driver_salary || 0) * months,
        expenses: 0
      };
    });

    trips.forEach(t => {
      if (vehicleMap[t.vehicle_id]) {
        vehicleMap[t.vehicle_id].revenue += parseFloat(t.revenue || 0);
        vehicleMap[t.vehicle_id].rental += parseFloat(t.load_rental || 0);
        vehicleMap[t.vehicle_id].tolls += parseFloat(t.total_toll || 0);
        const loading = parseFloat(t.loading_cost || 0);
        const unloading = parseFloat(t.unloading_cost || 0);
        const rto = parseFloat(t.rto_charges || 0);
        vehicleMap[t.vehicle_id].other = (vehicleMap[t.vehicle_id].other || 0) + loading + unloading + rto;
      }
    });

    diesel.forEach(d => {
      if (vehicleMap[d.vehicle_id]) {
        vehicleMap[d.vehicle_id].diesel += parseFloat(d.cost || 0);
      }
    });

    services.forEach(s => {
      if (vehicleMap[s.vehicle_id]) {
        vehicleMap[s.vehicle_id].service += parseFloat(s.cost || 0);
      }
    });

    vehicles.forEach(v => {
      if (vehicleMap[v.id]) {
        const vm = vehicleMap[v.id];
        vm.expenses = vm.diesel + vm.tolls + vm.service + vm.salary + (vm.other || 0);
      }
    });

    const vehicleProfitability = Object.values(vehicleMap).map(v => ({
      ...v,
      netProfit: v.rental - v.expenses // Remaining Money
    }));

    // Calculate trips per vehicle to distribute shared expenses
    const tripsPerVehicle = {};
    trips.forEach(t => {
      tripsPerVehicle[t.vehicle_id] = (tripsPerVehicle[t.vehicle_id] || 0) + 1;
    });

    const perLoadTrends = trips.map(t => {
      const v = vehicles.find(veh => veh.id === t.vehicle_id);
      const vm = vehicleMap[t.vehicle_id];
      
      let apportionedDiesel = 0;
      let sharedExpensePerTrip = 0;
      if (vm && tripsPerVehicle[t.vehicle_id]) {
        apportionedDiesel = vm.diesel / tripsPerVehicle[t.vehicle_id];
        const shared = vm.diesel + vm.service; // Exclude salary from per-load expense
        sharedExpensePerTrip = shared / tripsPerVehicle[t.vehicle_id];
      }

      // Check if there are specific diesel records linked to this trip
      const tripDieselRecords = diesel.filter(d => d.trip_id === t.id);
      const tripDieselCost = tripDieselRecords.reduce((sum, d) => sum + parseFloat(d.cost || 0), 0);

      const finalDiesel = tripDieselCost > 0 ? tripDieselCost : apportionedDiesel;
      const apportionedService = (vm && tripsPerVehicle[t.vehicle_id]) ? (vm.service / tripsPerVehicle[t.vehicle_id]) : 0;
      const toll = parseFloat(t.total_toll || 0);
      const otherCharges = parseFloat(t.loading_cost || 0) + parseFloat(t.unloading_cost || 0) + parseFloat(t.rto_charges || 0);
      const rental = parseFloat(t.load_rental || 0);
      const expenses = toll + otherCharges + apportionedService + finalDiesel;

      return {
        id: t.id,
        date: new Date(t.trip_date).toISOString().slice(0, 10),
        vehicle: v ? v.vehicle_number : 'Unknown',
        source: t.source_city || t.source_address || 'Unknown',
        destination: t.destination_city || t.destination_address || 'Unknown',
        rental: rental,
        toll: toll,
        diesel: finalDiesel,
        maint: apportionedService,
        other: otherCharges,
        expenses: expenses,
        profit: rental - expenses
      };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    return res.json({
      summary: {
        totalTrips: trips.length,
        totalRevenue,
        totalRental,
        totalToll,
        totalDiesel,
        totalService,
        totalDriverSalaries,
        totalExpenses,
        remainingMoney,
        profitMargin
      },
      expenseBreakdown: {
        diesel: totalDiesel,
        tolls: totalToll,
        service: totalService,
        salaries: totalDriverSalaries,
        other: totalOtherCharges
      },
      monthlyTrends,
      perLoadTrends,
      vehicleProfitability
    });

  } catch (err) {
    console.error('Finance analytics error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
