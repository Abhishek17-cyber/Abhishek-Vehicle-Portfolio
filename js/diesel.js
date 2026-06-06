/**
 * diesel.js — Diesel Records page logic
 */

let allDieselRecords = [];
let dieselVehicles = [];
let pendingBillFile = null;

document.addEventListener('DOMContentLoaded', () => {
  requireAuth();
  loadNavUser();
  initRealtimePolling();
  loadDieselVehicles();
  loadDieselRecords();
  onPollTick(silentRefreshDiesel);
});

// ===== Load vehicles =====
async function loadDieselVehicles() {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/vehicles`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    dieselVehicles = data.vehicles || data;

    const selects = ['filterVehicle', 'dieselVehicle'];
    selects.forEach(sid => {
      const sel = document.getElementById(sid);
      if (!sel) return;
      dieselVehicles.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = `${v.vehicle_number} — ${v.make} ${v.model}`;
        sel.appendChild(opt);
      });
    });
  } catch(e) { console.error(e); }
}

// ===== Load diesel records =====
async function loadDieselRecords() {
  const token = getToken();
  const tbody = document.getElementById('dieselTableBody');
  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px;"><div class="spinner"></div></td></tr>';

  const vehicleId = document.getElementById('filterVehicle').value;
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo = document.getElementById('filterDateTo').value;

  const params = new URLSearchParams();
  if (vehicleId) params.append('vehicle_id', vehicleId);
  if (dateFrom) params.append('date_from', dateFrom);
  if (dateTo) params.append('date_to', dateTo);

  try {
    const res = await fetch(`${API_BASE_URL}/api/diesel?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    allDieselRecords = data.records || data;
    renderDieselRecords(allDieselRecords);
    updateDieselSummary(allDieselRecords);
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--accent-orange); padding:30px;">Error: ${e.message}</td></tr>`;
  }
}

async function silentRefreshDiesel() {
  try {
    const token = getToken();
    const res = await fetch(`${API_BASE_URL}/api/diesel`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    allDieselRecords = data.records || data;
    // Don't re-render if filters are active
  } catch(e) {}
}

function renderDieselRecords(records) {
  const tbody = document.getElementById('dieselTableBody');
  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-secondary); padding:40px;">No diesel records found.</td></tr>';
    return;
  }

  tbody.innerHTML = records.map(r => {
    const vehicle = dieselVehicles.find(v => v.id === r.vehicle_id);
    const pricePerLiter = r.liters && r.cost ? (r.cost / r.liters).toFixed(2) : '—';
    return `
      <tr>
        <td><strong>${vehicle ? vehicle.vehicle_number : r.vehicle_id}</strong></td>
        <td>${formatDateTime(r.refuel_datetime)}</td>
        <td>${r.liters ? r.liters + ' L' : '—'}</td>
        <td style="color:var(--accent-gold); font-weight:700;">${formatCurrency(r.cost)}</td>
        <td>${pricePerLiter !== '—' ? '₹' + pricePerLiter : '—'}</td>
        <td>${r.pump_station || '—'}</td>
        <td>${[r.trip_source, r.trip_destination].filter(Boolean).join(' → ') || '—'}</td>
        <td>${r.bill_image_url
          ? `<a href="${API_BASE_URL}/${r.bill_image_url}" target="_blank" class="btn btn-outline btn-sm">📄 View</a>`
          : '<span style="color:var(--text-secondary); font-size:0.8rem;">None</span>'
        }</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="editDiesel(${r.id})">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteDiesel(${r.id})" style="margin-left:4px;">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function updateDieselSummary(records) {
  document.getElementById('summaryTotalRecords').textContent = records.length;
  const total = records.reduce((s, r) => s + parseFloat(r.cost || 0), 0);
  document.getElementById('summaryTotalCost').textContent = '₹' + total.toLocaleString('en-IN', { minimumFractionDigits: 0 });
  const totalLiters = records.reduce((s, r) => s + parseFloat(r.liters || 0), 0);
  document.getElementById('summaryTotalLiters').textContent = totalLiters.toFixed(1) + ' L';
}

function clearDieselFilters() {
  document.getElementById('filterVehicle').value = '';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  loadDieselRecords();
}

// ===== Modal =====
function openAddDiesel() {
  document.getElementById('dieselModalTitle').textContent = '⛽ Add Diesel Record';
  document.getElementById('dieselRecordId').value = '';
  document.getElementById('dieselForm').reset();
  pendingBillFile = null;
  document.getElementById('billPreview').style.display = 'none';

  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('dieselDateTime').value = local;

  document.getElementById('dieselModal').classList.add('active');
}

function closeDieselModal() {
  document.getElementById('dieselModal').classList.remove('active');
  pendingBillFile = null;
}

function handleBillUpload(input) {
  if (input.files && input.files[0]) {
    pendingBillFile = input.files[0];
    const preview = document.getElementById('billPreview');
    preview.style.display = 'block';
    preview.textContent = `✅ Selected: ${pendingBillFile.name}`;
  }
}

async function editDiesel(id) {
  const record = allDieselRecords.find(r => r.id === id);
  if (!record) return;

  document.getElementById('dieselModalTitle').textContent = '✏️ Edit Diesel Record';
  document.getElementById('dieselRecordId').value = record.id;
  document.getElementById('dieselVehicle').value = record.vehicle_id;

  const dt = new Date(record.refuel_datetime);
  const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('dieselDateTime').value = local;
  document.getElementById('dieselCost').value = record.cost;
  document.getElementById('dieselLiters').value = record.liters || '';
  document.getElementById('dieselSource').value = record.trip_source || '';
  document.getElementById('dieselDest').value = record.trip_destination || '';
  document.getElementById('dieselStation').value = record.pump_station || '';
  document.getElementById('dieselNotes').value = record.notes || '';

  document.getElementById('dieselModal').classList.add('active');
}

// ===== Form Submit =====
document.getElementById('dieselForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitText = document.getElementById('dieselSubmitText');
  const submitSpinner = document.getElementById('dieselSubmitSpinner');
  const submitBtn = document.getElementById('dieselSubmitBtn');

  const vehicleId = document.getElementById('dieselVehicle').value;
  const dt = document.getElementById('dieselDateTime').value;
  const cost = document.getElementById('dieselCost').value;

  if (!vehicleId || !dt || !cost) {
    showAlert('dieselAlert', '⚠️ Please fill in required fields (Vehicle, Date, Cost)', 'warning');
    return;
  }

  submitText.style.display = 'none';
  submitSpinner.style.display = 'inline';
  submitBtn.disabled = true;

  try {
    const token = getToken();
    let billUrl = null;

    // Upload bill if selected
    if (pendingBillFile) {
      const formData = new FormData();
      formData.append('file', pendingBillFile);
      formData.append('doc_type', 'diesel_bill');
      formData.append('vehicle_id', vehicleId);

      const uploadRes = await fetch(`${API_BASE_URL}/api/uploads`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        billUrl = uploadData.file_url;
      }
    }

    const recordId = document.getElementById('dieselRecordId').value;
    const payload = {
      vehicle_id: vehicleId,
      refuel_datetime: dt,
      cost: parseFloat(cost),
      liters: document.getElementById('dieselLiters').value || null,
      trip_source: document.getElementById('dieselSource').value.trim() || null,
      trip_destination: document.getElementById('dieselDest').value.trim() || null,
      pump_station: document.getElementById('dieselStation').value.trim() || null,
      notes: document.getElementById('dieselNotes').value.trim() || null,
      ...(billUrl ? { bill_image_url: billUrl } : {})
    };

    const url = recordId ? `${API_BASE_URL}/api/diesel/${recordId}` : `${API_BASE_URL}/api/diesel`;
    const method = recordId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      closeDieselModal();
      showAlert('dieselAlert', `✅ Record ${recordId ? 'updated' : 'added'}`, 'success');
      await loadDieselRecords();
    } else {
      showAlert('dieselAlert', `❌ ${data.message || 'Failed to save'}`, 'danger');
    }
  } catch(err) {
    showAlert('dieselAlert', `❌ Error: ${err.message}`, 'danger');
  } finally {
    submitText.style.display = 'inline';
    submitSpinner.style.display = 'none';
    submitBtn.disabled = false;
  }
});

async function deleteDiesel(id) {
  if (!confirm('Delete this diesel record?')) return;
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/diesel/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      showAlert('dieselAlert', '✅ Record deleted', 'success');
      await loadDieselRecords();
    }
  } catch(e) {
    showAlert('dieselAlert', '❌ Failed to delete', 'danger');
  }
}
