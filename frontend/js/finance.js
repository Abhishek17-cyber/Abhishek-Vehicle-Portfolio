/**
 * finance.js — Frontend logic for the Financial Dashboard
 */

let allVehicles = [];
let financeData = null;

// Keep track of Chart.js instances to avoid overlapping on redraw
let trendChartInstance = null;
let breakdownChartInstance = null;
let vehicleProfitChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth();
  loadNavUser();
  initRealtimePolling();
  
  await loadVehicleFilterOptions();
  await loadFinanceData();
  
  // Real-time ticking for finance data refresh
  onPollTick(silentRefreshFinance);
});

// Load vehicle list to populate filter dropdown
async function loadVehicleFilterOptions() {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/vehicles`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    allVehicles = data.vehicles || data;

    const select = document.getElementById('filterVehicle');
    if (select) {
      select.innerHTML = '<option value="">All Vehicles</option>';
      allVehicles.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = `${v.vehicle_number} — ${v.make} ${v.model}`;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Error loading vehicle filter options:', err);
  }
}

// Main loader for finance analytics
async function loadFinanceData() {
  const token = getToken();
  const alertBox = document.getElementById('financeAlert');
  if (alertBox) alertBox.innerHTML = '';

  const vehicleId = document.getElementById('filterVehicle').value;
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo = document.getElementById('filterDateTo').value;

  // Build query params
  let query = '';
  const params = [];
  if (vehicleId) params.push(`vehicle_id=${vehicleId}`);
  if (dateFrom) params.push(`date_from=${dateFrom}`);
  if (dateTo) params.push(`date_to=${dateTo}`);
  if (params.length > 0) query = '?' + params.join('&');

  try {
    const res = await fetch(`${API_BASE_URL}/api/finance/analytics${query}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Failed to fetch financial stats');
    }

    financeData = await res.json();
    
    // Update visuals
    updateSummaryCards(financeData.summary);
    renderCharts(financeData);
    renderLedgerTable(financeData.vehicleProfitability);
    renderPerLoadTable(financeData.perLoadTrends);

  } catch (err) {
    console.error('Load finance error:', err);
    if (alertBox) {
      alertBox.innerHTML = `<div class="alert alert-danger">⚠️ Error loading financial metrics: ${err.message}</div>`;
    }
  }
}

// Refresh data silently for real-time updates
async function silentRefreshFinance() {
  const token = getToken();
  const vehicleId = document.getElementById('filterVehicle').value;
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo = document.getElementById('filterDateTo').value;

  let query = '';
  const params = [];
  if (vehicleId) params.push(`vehicle_id=${vehicleId}`);
  if (dateFrom) params.push(`date_from=${dateFrom}`);
  if (dateTo) params.push(`date_to=${dateTo}`);
  if (params.length > 0) query = '?' + params.join('&');

  try {
    const res = await fetch(`${API_BASE_URL}/api/finance/analytics${query}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;

    financeData = await res.json();
    updateSummaryCards(financeData.summary);
    renderCharts(financeData);
    renderLedgerTable(financeData.vehicleProfitability);
    renderPerLoadTable(financeData.perLoadTrends);
  } catch (e) {}
}

function clearFilters() {
  document.getElementById('filterVehicle').value = '';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  loadFinanceData();
}

function formatCurrency(val) {
  return '₹' + parseFloat(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function updateSummaryCards(summary) {
  const isPerLoad = currentTrendMode === 'perLoad';
  const mult = (isPerLoad && summary.totalTrips > 0) ? (1 / summary.totalTrips) : 1;
  const prefix = isPerLoad ? 'Avg/Load: ' : 'Total ';
  
  const titleRev = document.getElementById('titleRevenue');
  const titleExp = document.getElementById('titleExpenses');
  const titleNet = document.getElementById('titleNetProfit');
  const titleSalary = document.getElementById('titleSalary');
  
  if (titleRev) titleRev.textContent = prefix + 'Rental';
  if (titleExp) titleExp.textContent = prefix + 'Charges';
  if (titleNet) titleNet.textContent = isPerLoad ? 'Avg/Load: Remaining' : 'Remaining Money';
  if (titleSalary) titleSalary.textContent = isPerLoad ? 'Monthly Salary (N/A)' : 'Driver Salary';
  
  document.getElementById('statRevenue').textContent = formatCurrency(summary.totalRental * mult);
  
  // Exclude driver salary from Trip Charges
  const tripCharges = summary.totalExpenses - summary.totalDriverSalaries;
  document.getElementById('statExpenses').textContent = formatCurrency(tripCharges * mult);

  // Show Driver salary only on monthly view
  const salaryDisplay = isPerLoad ? 0 : summary.totalDriverSalaries;
  const statSalary = document.getElementById('statSalary');
  if (statSalary) statSalary.textContent = formatCurrency(salaryDisplay);
  
  // Calculate remaining money 
  const remaining = isPerLoad ? ((summary.totalRental - tripCharges) * mult) : summary.remainingMoney;
  const netProfitEl = document.getElementById('statNetProfit');
  netProfitEl.textContent = formatCurrency(remaining);
  
  // Format profit card style based on positive/negative gain
  if (remaining < 0) {
    netProfitEl.className = 'h3 mb-0 fw-bold text-danger';
  } else {
    netProfitEl.className = 'h3 mb-0 fw-bold text-success';
  }

  const margin = (summary.totalRental > 0) ? (remaining / (summary.totalRental * mult)) * 100 : 0;
  document.getElementById('statMargin').textContent = margin.toFixed(1) + '%';
}

// Render or update charts
function renderCharts(data) {
  const isDarkMode = document.documentElement.getAttribute('data-bs-theme') === 'dark';
  const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
  const labelColor = isDarkMode ? '#adb5bd' : '#495057';

  // 1. Render Monthly/Per Load Trend Chart
  renderTrendChart();

  // 2. Render Expense Breakdown Chart (Pie/Doughnut)
  const breakdownCtx = document.getElementById('breakdownChart').getContext('2d');
  if (breakdownChartInstance) breakdownChartInstance.destroy();

  const exp = data.expenseBreakdown;
  const mult = (currentTrendMode === 'perLoad' && data.summary.totalTrips > 0) ? (1 / data.summary.totalTrips) : 1;
  
  const breakdownLabels = ['Fuel', 'Tolls', 'Maintenance', 'Salaries', 'Other Charges'];
  const breakdownValues = [exp.diesel * mult, exp.tolls * mult, exp.service * mult, exp.salaries * mult, (exp.other || 0) * mult];
  const hasExpenseData = breakdownValues.some(v => v > 0);

  breakdownChartInstance = new Chart(breakdownCtx, {
    type: 'doughnut',
    data: {
      labels: breakdownLabels,
      datasets: [{
        data: hasExpenseData ? breakdownValues : [1],
        backgroundColor: hasExpenseData ? ['#fd7e14', '#0d6efd', '#ffc107', '#6f42c1', '#20c997'] : ['#e9ecef'],
        borderWidth: isDarkMode ? 2 : 1,
        borderColor: isDarkMode ? '#1e293b' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: labelColor, boxWidth: 12 }
        },
        tooltip: {
          enabled: hasExpenseData,
          callbacks: {
            label: (item) => {
              const val = item.raw;
              const sum = breakdownValues.reduce((a, b) => a + b, 0);
              const pct = sum > 0 ? ((val / sum) * 100).toFixed(1) + '%' : '0%';
              return ` ${item.label}: ₹${val.toLocaleString('en-IN')} (${pct})`;
            }
          }
        }
      },
      cutout: '65%'
    }
  });

  // 3. Render Vehicle Profitability Chart (Horizontal Bar Chart)
  const vehicleCtx = document.getElementById('vehicleProfitChart').getContext('2d');
  if (vehicleProfitChartInstance) vehicleProfitChartInstance.destroy();

  // Sort vehicles by net profit
  const sortedVehicles = [...data.vehicleProfitability].sort((a, b) => b.netProfit - a.netProfit);
  const vehicleLabels = sortedVehicles.map(v => v.vehicle_number);
  const vehicleNetProfits = sortedVehicles.map(v => v.netProfit * mult);

  vehicleProfitChartInstance = new Chart(vehicleCtx, {
    type: 'bar',
    data: {
      labels: vehicleLabels.length > 0 ? vehicleLabels : ['No Data'],
      datasets: [{
        label: 'Net Profit (₹)',
        data: vehicleNetProfits.length > 0 ? vehicleNetProfits : [0],
        backgroundColor: vehicleNetProfits.map(v => v >= 0 ? '#198754' : '#dc3545'),
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { 
          grid: { color: gridColor }, 
          ticks: { 
            color: labelColor,
            callback: (v) => '₹' + v.toLocaleString('en-IN')
          } 
        },
        y: { grid: { display: false }, ticks: { color: labelColor } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => 'Net Profit: ₹' + context.raw.toLocaleString('en-IN')
          }
        }
      }
    }
  });
}

let currentTrendMode = 'monthly';

function toggleTrendChart(mode) {
  currentTrendMode = mode;
  const title = document.getElementById('trendChartTitle');
  if (title) {
    title.innerHTML = `<i class="bi bi-graph-up me-2 text-primary"></i>Revenue vs Expenses (${mode === 'monthly' ? 'Monthly' : 'Per Load'})`;
  }
  
  if (financeData) {
    updateSummaryCards(financeData.summary);
    renderCharts(financeData);
  }
}

function renderTrendChart() {
  if (!financeData) return;
  const isDarkMode = document.documentElement.getAttribute('data-bs-theme') === 'dark';
  const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
  const labelColor = isDarkMode ? '#adb5bd' : '#495057';

  const trendCtx = document.getElementById('trendChart').getContext('2d');
  if (trendChartInstance) trendChartInstance.destroy();

  let labels = [];
  let rentals = [];
  let expenses = [];
  let xLabel = '';

  if (currentTrendMode === 'monthly') {
    labels = financeData.monthlyTrends.map(t => t.month);
    rentals = financeData.monthlyTrends.map(t => t.rental);
    expenses = financeData.monthlyTrends.map(t => t.expenses);
  } else {
    // Per load mode
    labels = financeData.perLoadTrends.map(t => `Load #${t.id} (${t.date})`);
    rentals = financeData.perLoadTrends.map(t => t.rental);
    expenses = financeData.perLoadTrends.map(t => t.expenses);
  }

  trendChartInstance = new Chart(trendCtx, {
    type: 'bar',
    data: {
      labels: labels.length > 0 ? labels : ['No Data'],
      datasets: [
        {
          label: 'Rental',
          data: rentals.length > 0 ? rentals : [0],
          backgroundColor: '#198754',
          borderColor: '#198754',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Charges',
          data: expenses.length > 0 ? expenses : [0],
          backgroundColor: '#dc3545',
          borderColor: '#dc3545',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { color: labelColor } },
        y: { 
          grid: { color: gridColor }, 
          ticks: { 
            color: labelColor,
            callback: (v) => '₹' + v.toLocaleString('en-IN')
          } 
        }
      },
      plugins: {
        legend: { labels: { color: labelColor } }
      }
    }
  });
}

// Populate the ledger detail table
function renderLedgerTable(vehicleList) {
  const tbody = document.getElementById('ledgerTableBody');
  if (!tbody) return;

  if (vehicleList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted">No vehicle records found.</td></tr>';
    return;
  }

  // Sort by vehicle number
  tbody.innerHTML = vehicleList.map(v => {
    const tripRental = v.rental;
    const totalExpenses = v.expenses;
    const remainingMoney = v.netProfit;
    const margin = tripRental > 0 ? ((remainingMoney / tripRental) * 100).toFixed(1) + '%' : '0.0%';

    const profitClass = remainingMoney >= 0 ? 'text-success fw-bold' : 'text-danger fw-bold';
    const profitSign = remainingMoney >= 0 ? '' : '-';

    return `
      <tr>
        <td><strong>${v.vehicle_number}</strong></td>
        <td>${v.make} ${v.model}</td>
        <td class="text-end">${formatCurrency(v.salary)}</td>
        <td class="text-end text-success">${tripRental > 0 ? '+' + formatCurrency(tripRental) : '₹0'}</td>
        <td class="text-end text-danger">${formatCurrency(v.diesel)}</td>
        <td class="text-end text-danger">${formatCurrency(v.tolls)}</td>
        <td class="text-end text-danger">${formatCurrency(v.service)}</td>
        <td class="text-end">${formatCurrency(totalExpenses)}</td>
        <td class="text-end ${profitClass}">${profitSign}${formatCurrency(Math.abs(remainingMoney))}</td>
        <td class="text-center">
          <span class="badge ${remainingMoney >= 0 ? 'bg-success' : 'bg-danger'}">${margin}</span>
        </td>
      </tr>
    `;
  }).join('');
}

// Export CSV helper
function exportLedger() {
  if (!financeData || !financeData.vehicleProfitability.length) {
    alert('No data available to export.');
    return;
  }

  let csv = 'Vehicle Number,Make,Model,Load Rental (INR),Total Charges (INR),Remaining Money (INR),Margin (%)\n';
  financeData.vehicleProfitability.forEach(v => {
    const margin = v.rental > 0 ? ((v.netProfit / v.rental) * 100).toFixed(2) : '0.00';
    csv += `"${v.vehicle_number}","${v.make}","${v.model}",${v.rental},${v.expenses},${v.netProfit},${margin}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `fleet_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Populate the per-load details table
function renderPerLoadTable(perLoadTrends) {
  const tbody = document.getElementById('perLoadTableBody');
  if (!tbody) return;

  if (!perLoadTrends || perLoadTrends.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted">No per-load records found for selected filters.</td></tr>';
    return;
  }

  // Sort by date descending
  const sortedTrends = [...perLoadTrends].sort((a, b) => new Date(b.date) - new Date(a.date));

  tbody.innerHTML = sortedTrends.map(t => {
    const profitClass = t.profit >= 0 ? 'text-success fw-bold' : 'text-danger fw-bold';
    const profitSign = t.profit >= 0 ? '+' : '-';
    const otherExp = parseFloat(t.other || 0);
    const maintExp = parseFloat(t.maint || 0);

    return `
      <tr>
        <td>${t.date}</td>
        <td><strong>${t.vehicle}</strong></td>
        <td>${t.source}</td>
        <td>${t.destination}</td>
        <td class="text-end text-success">${formatCurrency(t.rental)}</td>
        <td class="text-end text-danger">${formatCurrency(t.diesel)}</td>
        <td class="text-end text-danger">${formatCurrency(t.toll)}</td>
        <td class="text-end text-danger">${formatCurrency(maintExp)}</td>
        <td class="text-end text-danger">${formatCurrency(otherExp)}</td>
        <td class="text-end ${profitClass}">${profitSign}${formatCurrency(Math.abs(t.profit))}</td>
      </tr>
    `;
  }).join('');
}
