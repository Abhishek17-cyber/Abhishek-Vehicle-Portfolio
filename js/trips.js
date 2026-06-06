/**
 * trips.js — Trips page logic
 */

let allTrips = [];
let tripVehicles = [];

document.addEventListener('DOMContentLoaded', () => {
  requireAuth();
  loadNavUser();
  initRealtimePolling();
  loadVehicleOptions();
  loadTrips();
  onPollTick(silentRefreshTrips);
});

// ===== Load vehicle options =====
async function loadVehicleOptions() {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/vehicles`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    tripVehicles = data.vehicles || data;

    // Fill filter dropdown
    const filterSel = document.getElementById('filterVehicle');
    // Fill modal dropdown
    const modalSel = document.getElementById('tripVehicle');

    tripVehicles.forEach(v => {
      const optF = document.createElement('option');
      optF.value = v.id;
      optF.textContent = `${v.vehicle_number} — ${v.make} ${v.model}`;
      filterSel.appendChild(optF);

      const optM = document.createElement('option');
      optM.value = v.id;
      optM.textContent = `${v.vehicle_number} — ${v.make} ${v.model}`;
      modalSel.appendChild(optM);
    });
  } catch(e) { console.error(e); }
}

// ===== Load trips =====
async function loadTrips() {
  const token = getToken();
  const tbody = document.getElementById('tripsTableBody');
  tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:40px;"><div class="spinner"></div></td></tr>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/trips`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to load trips');

    const data = await res.json();
    allTrips = data.trips || data;

    renderTrips(allTrips);
    updateSummary(allTrips);
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--accent-orange); padding:30px;">Error: ${e.message}</td></tr>`;
  }
}

async function silentRefreshTrips() {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/trips`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    allTrips = data.trips || data;
    applyFilters();
  } catch(e) {}
}

function renderTrips(trips) {
  const tbody = document.getElementById('tripsTableBody');
  if (!trips.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:var(--text-secondary); padding:40px;">No trips found. Add your first trip!</td></tr>';
    return;
  }

  tbody.innerHTML = trips.map(t => {
    const vehicle = tripVehicles.find(v => v.id === t.vehicle_id);
    const statusClass = { completed: 'badge-active', in_progress: 'badge-service', planned: 'badge-inactive' }[t.status] || 'badge-inactive';
    return `
      <tr>
        <td><strong>${vehicle ? vehicle.vehicle_number : t.vehicle_id}</strong></td>
        <td>${formatDateTime(t.trip_date)}</td>
        <td>${t.source_address}${t.source_city ? '<br><small style="color:var(--text-secondary);">' + t.source_city + '</small>' : ''}</td>
        <td>${t.destination_address}${t.destination_city ? '<br><small style="color:var(--text-secondary);">' + t.destination_city + '</small>' : ''}</td>
        <td>${t.load_weight ? t.load_weight + ' ' + (t.load_unit || 'tons') : '—'}</td>
        <td>${formatCurrency(t.toll_fee_up)}</td>
        <td>${formatCurrency(t.toll_fee_down)}</td>
        <td style="color:var(--accent-gold); font-weight:700;">${formatCurrency(t.total_toll)}</td>
        <td><span class="badge ${statusClass}">${t.status}</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="editTrip(${t.id})" title="Edit">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteTrip(${t.id})" title="Delete" style="margin-left:4px;">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function updateSummary(trips) {
  document.getElementById('summaryTotalTrips').textContent = trips.length;
  const totalToll = trips.reduce((s, t) => s + parseFloat(t.total_toll || 0), 0);
  document.getElementById('summaryTotalToll').textContent = '₹' + totalToll.toLocaleString('en-IN');
  const totalLoad = trips.reduce((s, t) => s + parseFloat(t.load_weight || 0), 0);
  document.getElementById('summaryTotalLoad').textContent = totalLoad.toFixed(1) + ' t';
}

// ===== Filters =====
function applyFilters() {
  const vehicleId = document.getElementById('filterVehicle').value;
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo = document.getElementById('filterDateTo').value;
  const source = document.getElementById('filterSource').value.toLowerCase();
  const dest = document.getElementById('filterDest').value.toLowerCase();

  let filtered = allTrips.filter(t => {
    if (vehicleId && t.vehicle_id != vehicleId) return false;
    if (dateFrom && new Date(t.trip_date) < new Date(dateFrom)) return false;
    if (dateTo && new Date(t.trip_date) > new Date(dateTo + 'T23:59:59')) return false;
    if (source && !t.source_address.toLowerCase().includes(source) && !(t.source_city || '').toLowerCase().includes(source)) return false;
    if (dest && !t.destination_address.toLowerCase().includes(dest) && !(t.destination_city || '').toLowerCase().includes(dest)) return false;
    return true;
  });

  renderTrips(filtered);
  updateSummary(filtered);
}

function clearFilters() {
  document.getElementById('filterVehicle').value = '';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  document.getElementById('filterSource').value = '';
  document.getElementById('filterDest').value = '';
  renderTrips(allTrips);
  updateSummary(allTrips);
}

// ===== Modal =====
function openAddTrip() {
  document.getElementById('tripModalTitle').textContent = '🛣️ Add Trip';
  document.getElementById('tripId').value = '';
  document.getElementById('tripForm').reset();
  document.getElementById('totalTollDisplay').value = '₹0.00';
  // Set default date to now
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('tripDate').value = local;
  document.getElementById('tripModal').classList.add('active');
}

function closeTripModal() {
  document.getElementById('tripModal').classList.remove('active');
}

function calcTotalToll() {
  const up = parseFloat(document.getElementById('tollFeeUp').value || 0);
  const down = parseFloat(document.getElementById('tollFeeDown').value || 0);
  document.getElementById('totalTollDisplay').value = '₹' + (up + down).toFixed(2);
}

async function editTrip(id) {
  const trip = allTrips.find(t => t.id === id);
  if (!trip) return;

  document.getElementById('tripModalTitle').textContent = '✏️ Edit Trip';
  document.getElementById('tripId').value = trip.id;
  document.getElementById('tripVehicle').value = trip.vehicle_id;

  const dt = new Date(trip.trip_date);
  const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('tripDate').value = local;
  document.getElementById('tripSource').value = trip.source_address || '';
  document.getElementById('tripSourceCity').value = trip.source_city || '';
  document.getElementById('tripDest').value = trip.destination_address || '';
  document.getElementById('tripDestCity').value = trip.destination_city || '';
  document.getElementById('tollFeeUp').value = trip.toll_fee_up || 0;
  document.getElementById('tollFeeDown').value = trip.toll_fee_down || 0;
  document.getElementById('totalTollDisplay').value = '₹' + parseFloat(trip.total_toll || 0).toFixed(2);
  document.getElementById('tripLoadWeight').value = trip.load_weight || '';
  document.getElementById('tripLoadUnit').value = trip.load_unit || 'tons';
  document.getElementById('tripStatus').value = trip.status || 'planned';
  document.getElementById('tripNotes').value = trip.notes || '';

  document.getElementById('tripModal').classList.add('active');
}

// ===== Form Submit =====
document.getElementById('tripForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitText = document.getElementById('tripSubmitText');
  const submitSpinner = document.getElementById('tripSubmitSpinner');
  const submitBtn = document.getElementById('tripSubmitBtn');

  const vehicleId = document.getElementById('tripVehicle').value;
  const tripDate = document.getElementById('tripDate').value;
  const source = document.getElementById('tripSource').value.trim();
  const dest = document.getElementById('tripDest').value.trim();

  if (!vehicleId || !tripDate || !source || !dest) {
    showAlert('tripAlert', '⚠️ Please fill in all required fields', 'warning');
    return;
  }

  submitText.style.display = 'none';
  submitSpinner.style.display = 'inline';
  submitBtn.disabled = true;

  const payload = {
    vehicle_id: vehicleId,
    trip_date: tripDate,
    source_address: source,
    source_city: document.getElementById('tripSourceCity').value.trim(),
    destination_address: dest,
    destination_city: document.getElementById('tripDestCity').value.trim(),
    toll_fee_up: parseFloat(document.getElementById('tollFeeUp').value || 0),
    toll_fee_down: parseFloat(document.getElementById('tollFeeDown').value || 0),
    load_weight: document.getElementById('tripLoadWeight').value || null,
    load_unit: document.getElementById('tripLoadUnit').value,
    status: document.getElementById('tripStatus').value,
    notes: document.getElementById('tripNotes').value.trim()
  };

  const tripId = document.getElementById('tripId').value;
  const token = getToken();
  const url = tripId ? `${API_BASE_URL}/api/trips/${tripId}` : `${API_BASE_URL}/api/trips`;
  const method = tripId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      closeTripModal();
      showAlert('tripAlert', `✅ Trip ${tripId ? 'updated' : 'added'} successfully`, 'success');
      await loadTrips();
    } else {
      showAlert('tripAlert', `❌ ${data.message || 'Failed to save trip'}`, 'danger');
    }
  } catch(err) {
    showAlert('tripAlert', `❌ Error: ${err.message}`, 'danger');
  } finally {
    submitText.style.display = 'inline';
    submitSpinner.style.display = 'none';
    submitBtn.disabled = false;
  }
});

async function deleteTrip(id) {
  if (!confirm('Delete this trip record?')) return;
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/trips/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      showAlert('tripAlert', '✅ Trip deleted', 'success');
      await loadTrips();
    }
  } catch(e) {
    showAlert('tripAlert', '❌ Failed to delete', 'danger');
  }
}
