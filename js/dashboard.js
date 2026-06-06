/**
 * dashboard.js — Dashboard page logic
 * Loads stats, vehicle grid, and service alerts.
 */

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
  requireAuth();
  loadNavUser();
  initRealtimePolling();
  loadDashboard();

  // Register dashboard refresh on each poll tick
  onPollTick(refreshStats);
});

// ===== Main Dashboard Loader =====
async function loadDashboard() {
  await Promise.all([
    loadStats(),
    loadVehicleGrid(),
    loadServiceAlertsCheck()
  ]);
}

async function refreshDashboard() {
  document.getElementById('vehiclesLoading').style.display = 'block';
  document.getElementById('vehiclesGrid').innerHTML = '';
  await loadDashboard();
}

// ===== Statistics =====
async function loadStats() {
  const token = getToken();
  try {
    // Fetch all data in parallel
    const [vehiclesRes, tripsRes, dieselRes, alertsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/vehicles`, { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch(`${API_BASE_URL}/api/trips`, { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch(`${API_BASE_URL}/api/diesel`, { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch(`${API_BASE_URL}/api/vehicles/service-alerts`, { headers: { 'Authorization': `Bearer ${token}` } })
    ]);

    if (vehiclesRes.ok) {
      const data = await vehiclesRes.json();
      const vehicles = data.vehicles || data;
      document.getElementById('statVehicles').textContent = vehicles.length;
    }

    if (tripsRes.ok) {
      const data = await tripsRes.json();
      const trips = data.trips || data;
      document.getElementById('statTrips').textContent = trips.length;
    }

    if (dieselRes.ok) {
      const data = await dieselRes.json();
      const records = data.records || data;
      const total = records.reduce((sum, r) => sum + parseFloat(r.cost || 0), 0);
      document.getElementById('statDiesel').textContent = total > 0
        ? (total >= 1000 ? (total / 1000).toFixed(1) + 'K' : total.toFixed(0))
        : '0';
    }

    if (alertsRes.ok) {
      const alerts = await alertsRes.json();
      document.getElementById('statService').textContent = alerts.length;
    }

  } catch(e) {
    console.error('Stats load error:', e);
  }
}

async function refreshStats() {
  await loadStats();
}

// ===== Vehicle Grid =====
async function loadVehicleGrid() {
  const token = getToken();
  const grid = document.getElementById('vehiclesGrid');
  const loading = document.getElementById('vehiclesLoading');
  const empty = document.getElementById('vehiclesEmpty');

  try {
    const res = await fetch(`${API_BASE_URL}/api/vehicles`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    loading.style.display = 'none';

    if (!res.ok) {
      grid.innerHTML = '<div class="alert alert-danger" style="grid-column:1/-1;">Failed to load vehicles.</div>';
      return;
    }

    const data = await res.json();
    const vehicles = data.vehicles || data;

    grid.innerHTML = '';

    if (!vehicles.length) {
      empty.style.display = 'flex';
      grid.appendChild(empty);
      return;
    }

    vehicles.forEach(vehicle => {
      const card = createVehicleCard(vehicle);
      grid.appendChild(card);
    });

  } catch(e) {
    loading.style.display = 'none';
    grid.innerHTML = `<div class="alert alert-danger" style="grid-column:1/-1;">Error loading vehicles: ${e.message}</div>`;
  }
}

function createVehicleCard(v) {
  const statusClass = { active: 'badge-active', inactive: 'badge-inactive', in_service: 'badge-service' }[v.status] || 'badge-active';
  const statusText = { active: '● Active', inactive: '○ Inactive', in_service: '⚙ In Service' }[v.status] || v.status;

  const daysToService = v.next_service_date ? getDaysUntil(v.next_service_date) : null;
  const serviceWarning = daysToService !== null && daysToService <= 7
    ? `<div style="margin-top:8px; padding:6px 10px; background:rgba(255,107,53,0.15); border-radius:6px; font-size:0.75rem; color:var(--accent-orange);">🔧 Service in ${daysToService <= 0 ? '<span style="color:#ff4444">OVERDUE</span>' : daysToService + ' days'}</div>`
    : '';

  const card = document.createElement('a');
  card.className = 'vehicle-card';
  card.href = `vehicle-detail.html?id=${v.id}`;

  card.innerHTML = `
    <div class="vehicle-card-placeholder">
      ${v.photo_url
        ? `<img src="${API_BASE_URL}/${v.photo_url}" alt="${v.vehicle_number}" style="width:100%; height:100%; object-fit:cover; position:absolute; inset:0;">`
        : '🚛'
      }
    </div>
    <div class="vehicle-card-body">
      <div class="vehicle-number">${v.vehicle_number}</div>
      <div class="vehicle-model">${[v.make, v.model, v.year].filter(Boolean).join(' • ')}</div>
      ${serviceWarning}
      <div class="vehicle-card-meta">
        <div class="vehicle-owner">
          👤 ${v.owner_name || 'N/A'}
        </div>
        <span class="badge ${statusClass}">${statusText}</span>
      </div>
    </div>
  `;

  return card;
}

// ===== Service Alerts =====
async function loadServiceAlertsCheck() {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/vehicles/service-alerts`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const alerts = await res.json();

    if (alerts.length > 0) {
      // Browser alert popup
      const messages = alerts.map(v => {
        const days = getDaysUntil(v.next_service_date);
        return `⚠️ SERVICE ALERT: ${v.vehicle_number} service is due on ${formatDate(v.next_service_date)}! Please contact owner: ${v.owner_phone || 'N/A'} and driver: ${v.driver_phone || 'N/A'}`;
      });
      window.alert(messages.join('\n\n'));
    }
  } catch(e) {
    console.warn('Service alert check failed:', e);
  }
}
