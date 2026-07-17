/**
 * analytics.js — Frontend logic for Fleet Analytics Dashboard
 */

let fuelChartInstance = null;
let maintenanceChartInstance = null;
let distanceChartInstance = null;
let statusChartInstance = null;
let utilizationChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth();
  loadNavUser();
  initRealtimePolling();
  
  await loadAnalyticsData();
  
  // Real-time ticking for analytics data refresh
  onPollTick(silentRefreshAnalytics);
  
  // Watch for theme changes to redraw charts with correct label/grid colors
  const themeObserver = new MutationObserver(() => {
    silentRefreshAnalytics();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });
});

// Fetch analytics data and build/refresh all charts and tables
async function loadAnalyticsData() {
  const token = getToken();
  const alertBox = document.getElementById('analyticsAlert');
  if (alertBox) alertBox.innerHTML = '';

  try {
    const res = await fetch(`${API_BASE_URL}/api/analytics/dashboard`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Failed to fetch fleet metrics');
    }

    const analyticsData = await res.json();
    
    renderCharts(analyticsData);
    renderServiceDueTable(analyticsData.serviceDueVehicles);

  } catch (err) {
    console.error('Load analytics error:', err);
    if (alertBox) {
      alertBox.innerHTML = `<div class="alert alert-danger">⚠️ Error loading analytics metrics: ${err.message}</div>`;
    }
  }
}

// Silent refresh for real-time polling
async function silentRefreshAnalytics() {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/analytics/dashboard`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;

    const analyticsData = await res.json();
    renderCharts(analyticsData);
    renderServiceDueTable(analyticsData.serviceDueVehicles);
  } catch (e) {
    console.warn('Real-time analytics refresh failed:', e.message);
  }
}

function renderCharts(data) {
  const isDarkMode = document.documentElement.getAttribute('data-bs-theme') === 'dark';
  const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
  const labelColor = isDarkMode ? '#adb5bd' : '#495057';
  const tooltipBg = isDarkMode ? '#212529' : '#ffffff';
  const tooltipBorder = isDarkMode ? '#373b3e' : '#dee2e6';
  const tooltipText = isDarkMode ? '#f8f9fa' : '#212529';

  // Shared chart options for grid, animations, and tools
  const getSharedOptions = (titleText, isCurrency = false, isKm = false) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: tooltipText,
        bodyColor: tooltipText,
        borderColor: tooltipBorder,
        borderWidth: 1,
        callbacks: {
          label: (context) => {
            let val = context.raw || 0;
            if (isCurrency) return 'Expenses: ₹' + parseFloat(val).toLocaleString('en-IN');
            if (isKm) return 'Distance: ' + parseFloat(val).toLocaleString('en-IN') + ' km';
            return context.label + ': ' + val;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: labelColor }
      },
      y: {
        grid: { color: gridColor },
        ticks: {
          color: labelColor,
          callback: (value) => {
            if (isCurrency) return '₹' + value.toLocaleString('en-IN');
            if (isKm) return value.toLocaleString('en-IN') + ' km';
            return value;
          }
        }
      }
    }
  });

  // 1. Monthly Fuel Expenses Chart (Line Chart for Trends)
  const fuelCtx = document.getElementById('fuelExpensesChart').getContext('2d');
  if (fuelChartInstance) fuelChartInstance.destroy();

  const fuelLabels = data.monthlyFuel.map(f => f.month);
  const fuelValues = data.monthlyFuel.map(f => f.total_fuel);

  fuelChartInstance = new Chart(fuelCtx, {
    type: 'line',
    data: {
      labels: fuelLabels.length > 0 ? fuelLabels : ['No Data'],
      datasets: [{
        label: 'Fuel Expenses',
        data: fuelValues.length > 0 ? fuelValues : [0],
        borderColor: '#ffc107',
        backgroundColor: 'rgba(255, 193, 7, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#ffc107',
        pointRadius: 4
      }]
    },
    options: getSharedOptions('Fuel Expenses', true, false)
  });

  // 2. Monthly Maintenance Costs Chart (Bar Chart)
  const maintenanceCtx = document.getElementById('maintenanceCostsChart').getContext('2d');
  if (maintenanceChartInstance) maintenanceChartInstance.destroy();

  const serviceLabels = data.monthlyService.map(s => s.month);
  const serviceValues = data.monthlyService.map(s => s.total_service);

  maintenanceChartInstance = new Chart(maintenanceCtx, {
    type: 'bar',
    data: {
      labels: serviceLabels.length > 0 ? serviceLabels : ['No Data'],
      datasets: [{
        label: 'Maintenance Costs',
        data: serviceValues.length > 0 ? serviceValues : [0],
        backgroundColor: '#dc3545',
        borderRadius: 5,
        maxBarThickness: 40
      }]
    },
    options: getSharedOptions('Maintenance Costs', true, false)
  });

  // 3. Total Kilometers Travelled Chart (Bar Chart)
  const distanceCtx = document.getElementById('distanceTravelledChart').getContext('2d');
  if (distanceChartInstance) distanceChartInstance.destroy();

  const distanceLabels = data.monthlyDistance.map(d => d.month);
  const distanceValues = data.monthlyDistance.map(d => d.total_distance);

  distanceChartInstance = new Chart(distanceCtx, {
    type: 'bar',
    data: {
      labels: distanceLabels.length > 0 ? distanceLabels : ['No Data'],
      datasets: [{
        label: 'Distance (km)',
        data: distanceValues.length > 0 ? distanceValues : [0],
        backgroundColor: '#0d6efd',
        borderRadius: 5,
        maxBarThickness: 40
      }]
    },
    options: getSharedOptions('Distance', false, true)
  });

  // 4. Vehicle Status Breakdown (Pie/Donut Chart)
  const statusCtx = document.getElementById('vehicleStatusChart').getContext('2d');
  if (statusChartInstance) statusChartInstance.destroy();

  const status = data.utilization.statusBreakdown;
  const statusData = [status.active, status.in_service, status.inactive];

  statusChartInstance = new Chart(statusCtx, {
    type: 'doughnut',
    data: {
      labels: ['Active', 'In Service', 'Inactive'],
      datasets: [{
        data: statusData,
        backgroundColor: ['#198754', '#ffc107', '#6c757d'],
        borderWidth: isDarkMode ? 2 : 1,
        borderColor: isDarkMode ? '#1e1e1e' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: {
            color: labelColor,
            font: { family: 'Inter', size: 12 }
          }
        },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipText,
          bodyColor: tooltipText,
          borderColor: tooltipBorder,
          borderWidth: 1
        }
      },
      cutout: '60%'
    }
  });

  // 5. Vehicle 30-Day Utilization Rate (Horizontal Bar Chart)
  const utilizationCtx = document.getElementById('utilizationChart').getContext('2d');
  if (utilizationChartInstance) utilizationChartInstance.destroy();

  const utVehicles = data.utilization.vehicleUtilization.map(u => u.vehicle_number);
  const utRates = data.utilization.vehicleUtilization.map(u => u.utilization_rate);

  utilizationChartInstance = new Chart(utilizationCtx, {
    type: 'bar',
    data: {
      labels: utVehicles.length > 0 ? utVehicles : ['No Vehicles'],
      datasets: [{
        label: 'Utilization Rate (%)',
        data: utRates.length > 0 ? utRates : [0],
        backgroundColor: '#198754',
        borderRadius: 4,
        maxBarThickness: 25
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipText,
          bodyColor: tooltipText,
          borderColor: tooltipBorder,
          borderWidth: 1,
          callbacks: {
            label: (context) => `Utilization: ${context.raw}% (Active ${Math.round(context.raw * 30 / 100)}/30 days)`
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: labelColor, callback: (v) => v + '%' },
          min: 0,
          max: 100
        },
        y: {
          grid: { display: false },
          ticks: { color: labelColor }
        }
      }
    }
  });
}

function renderServiceDueTable(dueVehicles) {
  const tbody = document.getElementById('serviceDueTableBody');
  if (!tbody) return;

  if (dueVehicles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No vehicles with service dates set.</td></tr>';
    return;
  }

  tbody.innerHTML = dueVehicles.map(v => {
    let daysBadge = '';
    let statusBadge = '';

    if (v.days_left === null) {
      daysBadge = '<span class="text-muted">N/A</span>';
      statusBadge = '<span class="badge bg-secondary">Unknown</span>';
    } else if (v.days_left <= 0) {
      daysBadge = `<span class="text-danger fw-bold">${Math.abs(v.days_left)} day(s) overdue</span>`;
      statusBadge = '<span class="badge bg-danger"><i class="bi bi-exclamation-triangle me-1"></i>Overdue</span>';
    } else if (v.days_left <= 7) {
      daysBadge = `<span class="text-warning fw-bold">${v.days_left} day(s) remaining</span>`;
      statusBadge = '<span class="badge bg-warning text-dark"><i class="bi bi-clock-history me-1"></i>Due Soon</span>';
    } else {
      daysBadge = `<span>${v.days_left} day(s) remaining</span>`;
      statusBadge = '<span class="badge bg-success">Healthy</span>';
    }

    return `
      <tr>
        <td class="fw-semibold text-dark">${v.vehicle_number}</td>
        <td>${v.make} ${v.model}</td>
        <td>${v.next_service_date ? new Date(v.next_service_date).toLocaleDateString() : 'N/A'}</td>
        <td>${daysBadge}</td>
        <td class="text-center">${statusBadge}</td>
      </tr>
    `;
  }).join('');
}
