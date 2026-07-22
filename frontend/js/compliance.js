/**
 * js/compliance.js — Compliance Vault Logic
 */

let allCompliance = [];
let userVehicles = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  loadNavUser();

  // Load vehicles for filter & modal dropdowns
  await loadVehicles();
  // Load compliance records
  await loadCompliance();
});

// ===== LOAD VEHICLES =====
async function loadVehicles() {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/vehicles`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    userVehicles = data.vehicles || (Array.isArray(data) ? data : []);

    const filterSel = document.getElementById('filterVehicle');
    const modalSel = document.getElementById('complianceVehicle');

    let opts = '<option value="">All Vehicles</option>';
    let modalOpts = '<option value="">Select vehicle...</option>';
    
    userVehicles.forEach(v => {
      opts += `<option value="${v.id}">${v.vehicle_number}</option>`;
      modalOpts += `<option value="${v.id}">${v.vehicle_number}</option>`;
    });

    if (filterSel) filterSel.innerHTML = opts;
    if (modalSel) modalSel.innerHTML = modalOpts;
  } catch (err) {
    console.error('Failed to load vehicles:', err);
  }
}

// ===== LOAD COMPLIANCE =====
async function loadCompliance() {
  const token = getToken();
  const vId = document.getElementById('filterVehicle')?.value || '';
  const status = document.getElementById('filterStatus')?.value || '';

  let url = `${API_BASE_URL}/api/compliance?1=1`;
  if (vId) url += `&vehicle_id=${vId}`;
  if (status) url += `&status=${status}`;

  try {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) throw new Error('Failed to fetch documents');
    const data = await res.json();
    allCompliance = data;
    renderCompliance(allCompliance);
  } catch (err) {
    console.error(err);
    document.getElementById('complianceTableBody').innerHTML = 
      `<tr><td colspan="8" class="text-center text-danger py-4">Error loading data.</td></tr>`;
  }
}

function clearFilters() {
  if (document.getElementById('filterVehicle')) document.getElementById('filterVehicle').value = '';
  if (document.getElementById('filterStatus')) document.getElementById('filterStatus').value = '';
  loadCompliance();
}

// ===== RENDER TABLE =====
function renderCompliance(records) {
  const tbody = document.getElementById('complianceTableBody');
  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No documents found.</td></tr>';
    return;
  }

  const docTypeLabels = {
    'insurance': 'Insurance',
    'fitness_cert': 'Fitness Cert (FC)',
    'permit': 'National Permit',
    'puc': 'Emission (PUC)',
    'road_tax': 'Road Tax',
    'other': 'Other'
  };

  tbody.innerHTML = records.map(c => {
    // Status Logic
    let statusBadge = '';
    const days = c.days_to_expiry;
    
    if (days < 0) {
      statusBadge = `<span class="badge bg-danger">Expired (${Math.abs(days)} days ago)</span>`;
    } else if (days <= 30) {
      statusBadge = `<span class="badge bg-warning text-dark">Expiring Soon (${days} days left)</span>`;
    } else {
      statusBadge = `<span class="badge bg-success">Valid (${days} days left)</span>`;
    }

    // File Link Logic
    let fileLink = '<span class="text-muted small">No File</span>';
    if (c.file_url) {
      fileLink = `<a href="${API_BASE_URL}/${c.file_url}" target="_blank" class="btn btn-sm btn-outline-info">
        <i class="bi bi-file-earmark-pdf"></i> View File
      </a>`;
    }

    const docTypeStr = docTypeLabels[c.doc_type] || 'Unknown';
    const issueStr = c.issue_date ? new Date(c.issue_date).toLocaleDateString('en-IN') : '-';
    const expiryStr = c.expiry_date ? new Date(c.expiry_date).toLocaleDateString('en-IN') : '-';

    // JSON stringify for the edit button
    const safeC = JSON.stringify(c).replace(/'/g, "&#39;").replace(/"/g, "&quot;");

    return `
      <tr>
        <td class="fw-semibold text-primary">${c.vehicle_number}</td>
        <td class="fw-bold">${docTypeStr}</td>
        <td>${c.document_number || '-'}</td>
        <td>${issueStr}</td>
        <td class="fw-bold">${expiryStr}</td>
        <td>${statusBadge}</td>
        <td>${fileLink}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" onclick="openEditCompliance('${safeC}')" title="Edit"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-outline-danger" onclick="deleteCompliance(${c.id})" title="Delete"><i class="bi bi-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ===== MODAL LOGIC =====
function openAddCompliance() {
  document.getElementById('complianceForm').reset();
  document.getElementById('complianceId').value = '';
  document.getElementById('complianceUploadId').value = '';
  document.getElementById('complianceModalTitle').textContent = 'Add Document';
  
  document.getElementById('currentFileBadge').classList.add('d-none');
  
  const modalEl = document.getElementById('complianceModal');
  if (window.bootstrap && window.bootstrap.Modal) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

function openEditCompliance(recordJson) {
  const record = JSON.parse(recordJson);
  document.getElementById('complianceForm').reset();
  document.getElementById('complianceId').value = record.id;
  document.getElementById('complianceModalTitle').textContent = 'Edit Document';
  
  document.getElementById('complianceVehicle').value = record.vehicle_id;
  document.getElementById('complianceDocType').value = record.doc_type;
  document.getElementById('complianceDocNum').value = record.document_number || '';
  
  if (record.issue_date) document.getElementById('complianceIssueDate').value = record.issue_date.slice(0, 10);
  if (record.expiry_date) document.getElementById('complianceExpiryDate').value = record.expiry_date.slice(0, 10);
  
  document.getElementById('complianceNotes').value = record.notes || '';
  document.getElementById('complianceUploadId').value = record.upload_id || '';

  const fileBadge = document.getElementById('currentFileBadge');
  if (record.file_name) {
    fileBadge.classList.remove('d-none');
    document.getElementById('currentFileName').textContent = record.file_name;
  } else {
    fileBadge.classList.add('d-none');
  }

  const modalEl = document.getElementById('complianceModal');
  if (window.bootstrap && window.bootstrap.Modal) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

function closeComplianceModal() {
  const modalEl = document.getElementById('complianceModal');
  if (window.bootstrap && window.bootstrap.Modal) {
    bootstrap.Modal.getOrCreateInstance(modalEl).hide();
  }
}

// ===== FORM SUBMISSION & FILE UPLOAD =====
document.getElementById('complianceForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitText = document.getElementById('complianceSubmitText');
  const submitSpinner = document.getElementById('complianceSubmitSpinner');
  const submitBtn = document.getElementById('complianceSubmitBtn');
  
  submitText.classList.add('d-none');
  submitSpinner.classList.remove('d-none');
  submitBtn.disabled = true;

  try {
    const token = getToken();
    const vehicleId = document.getElementById('complianceVehicle').value;
    const docType = document.getElementById('complianceDocType').value;
    let uploadId = document.getElementById('complianceUploadId').value || null;
    
    // Check if there's a new file to upload first
    const fileInput = document.getElementById('complianceFile');
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('vehicle_id', vehicleId);
      formData.append('doc_type', docType);
      
      const upRes = await fetch(`${API_BASE_URL}/api/uploads`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (!upRes.ok) {
        throw new Error('Failed to upload file');
      }
      
      const upData = await upRes.json();
      uploadId = upData.id;
    }

    // Now save the compliance record
    const payload = {
      vehicle_id: vehicleId,
      doc_type: docType,
      document_number: document.getElementById('complianceDocNum').value.trim() || null,
      issue_date: document.getElementById('complianceIssueDate').value || null,
      expiry_date: document.getElementById('complianceExpiryDate').value,
      notes: document.getElementById('complianceNotes').value.trim() || null,
      upload_id: uploadId
    };

    const cId = document.getElementById('complianceId').value;
    const url = cId ? `${API_BASE_URL}/api/compliance/${cId}` : `${API_BASE_URL}/api/compliance`;
    const method = cId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      closeComplianceModal();
      showAlert('complianceAlert', `✅ Document ${cId ? 'updated' : 'added'} successfully`, 'success');
      loadCompliance();
    } else {
      throw new Error(data.message || 'Failed to save record');
    }

  } catch (err) {
    showAlert('complianceAlert', `❌ Error: ${err.message}`, 'danger');
  } finally {
    submitText.classList.remove('d-none');
    submitSpinner.classList.add('d-none');
    submitBtn.disabled = false;
  }
});

// ===== DELETE =====
async function deleteCompliance(id) {
  if (!confirm('Are you sure you want to delete this document record?')) return;
  
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/compliance/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      showAlert('complianceAlert', '✅ Record deleted', 'success');
      loadCompliance();
    } else {
      const data = await res.json();
      showAlert('complianceAlert', `❌ ${data.message || 'Failed to delete'}`, 'danger');
    }
  } catch (err) {
    showAlert('complianceAlert', '❌ Error connecting to server', 'danger');
  }
}

// ===== UI ALERTS =====
function showAlert(containerId, message, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
  setTimeout(() => { container.innerHTML = ''; }, 5000);
}
