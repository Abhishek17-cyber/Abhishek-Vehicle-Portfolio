/**
 * service.js — Service Records page logic
 * Includes service alert system with window.alert() and banner.
 */

let allServiceRecords = [];
let serviceVehicles = [];
let alertsShown = false;

document.addEventListener('DOMContentLoaded', () => {
  requireAuth();
  loadNavUser();
  initRealtimePolling();
  loadServiceVehicles();
  loadServiceRecords();
  checkServiceAlerts();
  onPollTick(silentRefreshService);
});

// ===== Load vehicles =====
async function loadServiceVehicles() {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/vehicles`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    serviceVehicles = data.vehicles || data;

    const selects = ['filterVehicle', 'serviceVehicle'];
    selects.forEach(sid => {
      const sel = document.getElementById(sid);
      if (!sel) return;
      serviceVehicles.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = `${v.vehicle_number} — ${v.make} ${v.model}`;
        sel.appendChild(opt);
      });
    });
  } catch(e) { console.error(e); }
}

// ===== Service Alerts — CRITICAL FEATURE =====
async function checkServiceAlerts() {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/vehicles/service-alerts`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const alerts = await res.json();

    // Update summary count
    document.getElementById('summaryAlertsCount').textContent = alerts.length;

    if (!alerts.length) return;

    // ===== Browser Alert Popup =====
    if (!alertsShown) {
      alertsShown = true;
      const messages = alerts.map(v => {
        const days = getDaysUntil(v.next_service_date);
        const dayStr = days <= 0 ? 'OVERDUE!' : `in ${days} day(s)`;
        return `⚠️ SERVICE ALERT: ${v.vehicle_number} service is due on ${formatDate(v.next_service_date)} (${dayStr})!\nPlease contact owner: ${v.owner_phone || 'N/A'} and driver: ${v.driver_phone || 'N/A'}`;
      });
      window.alert('🔧 VEHICLE SERVICE REMINDERS\n\n' + messages.join('\n\n---\n\n'));
    }

    // ===== On-page Alert Banner =====
    const banner = document.getElementById('serviceAlertBanner');
    const itemsContainer = document.getElementById('serviceAlertItems');

    if (banner && itemsContainer) {
      banner.classList.add('show');
      itemsContainer.innerHTML = '';
      alerts.forEach(v => {
        const days = getDaysUntil(v.next_service_date);
        const dayStr = days <= 0 ? '<span style="color:#ff4444; font-weight:800;">OVERDUE</span>' : `<strong>${days} day(s) left</strong>`;
        const item = document.createElement('div');
        item.className = 'alert-banner-item';
        item.innerHTML = `
          ⚠️ <strong>${v.vehicle_number}</strong> (${v.make} ${v.model || ''}) — 
          Service due: <strong>${formatDate(v.next_service_date)}</strong> — ${dayStr} |
          Owner: <strong>${v.owner_name || 'N/A'}</strong> 
          📞 <a href="tel:${v.owner_phone}" style="color:var(--accent-blue);">${v.owner_phone || 'N/A'}</a> |
          Driver: <strong>${v.driver_name || 'N/A'}</strong>
          📞 <a href="tel:${v.driver_phone}" style="color:var(--accent-blue);">${v.driver_phone || 'N/A'}</a>
        `;
        itemsContainer.appendChild(item);
      });
    }
  } catch(e) {
    console.warn('Service alert check failed:', e);
  }
}

// ===== Load service records =====
async function loadServiceRecords() {
  const token = getToken();
  const tbody = document.getElementById('serviceTableBody');
  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px;"><div class="spinner"></div></td></tr>';

  const vehicleId = document.getElementById('filterVehicle').value;
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo = document.getElementById('filterDateTo').value;

  const params = new URLSearchParams();
  if (vehicleId) params.append('vehicle_id', vehicleId);
  if (dateFrom) params.append('date_from', dateFrom);
  if (dateTo) params.append('date_to', dateTo);

  try {
    const res = await fetch(`${API_BASE_URL}/api/service?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    allServiceRecords = data.records || data;
    renderServiceRecords(allServiceRecords);
    updateServiceSummary(allServiceRecords);
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--accent-orange); padding:30px;">Error: ${e.message}</td></tr>`;
  }
}

async function silentRefreshService() {
  try {
    await checkServiceAlerts();
  } catch(e) {}
}

function renderServiceRecords(records) {
  const tbody = document.getElementById('serviceTableBody');
  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-secondary); padding:40px;">No service records found.</td></tr>';
    return;
  }

  tbody.innerHTML = records.map(r => {
    const vehicle = serviceVehicles.find(v => v.id === r.vehicle_id);
    const daysLeft = r.next_service_date ? getDaysUntil(r.next_service_date) : null;
    let daysDisplay = '—';
    if (daysLeft !== null) {
      if (daysLeft <= 0) daysDisplay = '<span style="color:#ff4444; font-weight:700;">OVERDUE</span>';
      else if (daysLeft <= 7) daysDisplay = `<span style="color:var(--accent-orange); font-weight:600;">${daysLeft}d</span>`;
      else daysDisplay = `<span style="color:var(--accent-green);">${daysLeft}d</span>`;
    }
    return `
      <tr>
        <td><strong>${vehicle ? vehicle.vehicle_number : r.vehicle_id}</strong></td>
        <td>${formatDate(r.service_date)}</td>
        <td>${r.service_type || '—'}</td>
        <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.description || '—'}</td>
        <td style="color:var(--accent-gold); font-weight:600;">${formatCurrency(r.cost)}</td>
        <td>${[r.mechanic_name, r.garage_name].filter(Boolean).join(' / ') || '—'}</td>
        <td>${formatDate(r.next_service_date)}</td>
        <td>${daysDisplay}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="editService(${r.id})">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteService(${r.id})" style="margin-left:4px;">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function updateServiceSummary(records) {
  document.getElementById('summaryTotalService').textContent = records.length;
  const total = records.reduce((s, r) => s + parseFloat(r.cost || 0), 0);
  document.getElementById('summaryTotalCost').textContent = '₹' + total.toLocaleString('en-IN');
}

function clearServiceFilters() {
  document.getElementById('filterVehicle').value = '';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  loadServiceRecords();
}

// ===== Modal =====
function openAddService() {
  document.getElementById('serviceModalTitle').textContent = '🔧 Add Service Record';
  document.getElementById('serviceRecordId').value = '';
  document.getElementById('serviceForm').reset();
  document.getElementById('serviceDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('serviceModal').classList.add('active');
}

function closeServiceModal() {
  document.getElementById('serviceModal').classList.remove('active');
}

async function editService(id) {
  const record = allServiceRecords.find(r => r.id === id);
  if (!record) return;

  document.getElementById('serviceModalTitle').textContent = '✏️ Edit Service Record';
  document.getElementById('serviceRecordId').value = record.id;
  document.getElementById('serviceVehicle').value = record.vehicle_id;
  document.getElementById('serviceDate').value = record.service_date ? record.service_date.split('T')[0] : '';
  document.getElementById('serviceType').value = record.service_type || '';
  document.getElementById('serviceCost').value = record.cost || '';
  document.getElementById('mechanicName').value = record.mechanic_name || '';
  document.getElementById('garageName').value = record.garage_name || '';
  document.getElementById('nextServiceDate').value = record.next_service_date ? record.next_service_date.split('T')[0] : '';
  document.getElementById('serviceDescription').value = record.description || '';

  document.getElementById('serviceModal').classList.add('active');
}

// ===== Form Submit =====
document.getElementById('serviceForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitText = document.getElementById('serviceSubmitText');
  const submitSpinner = document.getElementById('serviceSubmitSpinner');
  const submitBtn = document.getElementById('serviceSubmitBtn');

  const vehicleId = document.getElementById('serviceVehicle').value;
  const serviceDate = document.getElementById('serviceDate').value;
  const serviceType = document.getElementById('serviceType').value;

  if (!vehicleId || !serviceDate || !serviceType) {
    showAlert('serviceAlert', '⚠️ Please fill in Vehicle, Date, and Service Type', 'warning');
    return;
  }

  submitText.style.display = 'none';
  submitSpinner.style.display = 'inline';
  submitBtn.disabled = true;

  const recordId = document.getElementById('serviceRecordId').value;
  const payload = {
    vehicle_id: vehicleId,
    service_date: serviceDate,
    service_type: serviceType,
    description: document.getElementById('serviceDescription').value.trim() || null,
    cost: document.getElementById('serviceCost').value || null,
    next_service_date: document.getElementById('nextServiceDate').value || null,
    mechanic_name: document.getElementById('mechanicName').value.trim() || null,
    garage_name: document.getElementById('garageName').value.trim() || null
  };

  const token = getToken();
  const url = recordId ? `${API_BASE_URL}/api/service/${recordId}` : `${API_BASE_URL}/api/service`;
  const method = recordId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      closeServiceModal();
      showAlert('serviceAlert', `✅ Record ${recordId ? 'updated' : 'added'}`, 'success');
      alertsShown = false; // Allow alert re-trigger after update
      await loadServiceRecords();
      await checkServiceAlerts();
    } else {
      showAlert('serviceAlert', `❌ ${data.message || 'Failed to save'}`, 'danger');
    }
  } catch(err) {
    showAlert('serviceAlert', `❌ Error: ${err.message}`, 'danger');
  } finally {
    submitText.style.display = 'inline';
    submitSpinner.style.display = 'none';
    submitBtn.disabled = false;
  }
});

async function deleteService(id) {
  if (!confirm('Delete this service record?')) return;
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/service/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      showAlert('serviceAlert', '✅ Record deleted', 'success');
      await loadServiceRecords();
    }
  } catch(e) {
    showAlert('serviceAlert', '❌ Failed to delete', 'danger');
  }
}
