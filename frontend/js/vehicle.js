/**
 * vehicle.js — Add Vehicle, Vehicle Detail, Edit Vehicle
 * Used by add-vehicle.html and vehicle-detail.html
 */

// ====================================================
// ADD VEHICLE PAGE (add-vehicle.html)
// ====================================================
let selectedVehiclePhotos = [];

if (document.getElementById('addVehicleForm')) {
  document.addEventListener('DOMContentLoaded', initAddVehiclePage);
}

function initAddVehiclePage() {
  requireAuth();
  loadNavUser();
  
  const user = getCurrentUser();
  if (user && user.role !== 'owner' && user.role !== 'admin') {
    window.location.href = 'dashboard.html';
    return;
  }

  initRealtimePolling();
  loadDriverDropdown('driverUserSelect');

  const form = document.getElementById('addVehicleForm');
  form.addEventListener('submit', handleAddVehicle);

  // Drag and drop for photo zone
  const dropZone = document.getElementById('photoDropZone');
  if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = '#00d4ff'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = ''; });
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFiles(files);
      }
    });
  }

  // OCR Auto-Fill listener
  const ocrInput = document.getElementById('ocrDocument');
  if (ocrInput) {
    ocrInput.addEventListener('change', handleOCRUpload);
  }
}

// ===== OCR AUTO-FILL LOGIC =====
async function handleOCRUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const loadingDiv = document.getElementById('ocrLoading');
  loadingDiv.classList.remove('d-none');

  try {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('documents', files[i]);
    }

    const res = await fetch(`${API_BASE_URL}/api/ocr/extract-vehicle`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData
    });

    if (!res.ok) throw new Error('Failed to extract data');
    const data = await res.json();
    const ext = data.extracted;

    // Fill form fields
    if (ext.vehicleNumber) {
      const el = document.getElementById('vehicleNumber');
      el.value = ext.vehicleNumber;
      el.classList.add('is-valid');
    }
    if (ext.make) {
      const el = document.getElementById('make');
      el.value = ext.make;
      el.classList.add('is-valid');
    }
    if (ext.issueDate) {
      const el = document.getElementById('purchaseDate');
      el.value = ext.issueDate;
      el.classList.add('is-valid');
    }

  } catch (err) {
    console.error('OCR Error:', err);
    alert('Could not extract data from document. Please fill manually.');
  } finally {
    loadingDiv.classList.add('d-none');
    e.target.value = ''; // reset input
  }
}

function handlePhotoSelect(input) {
  if (input.files && input.files.length > 0) {
    handleFiles(input.files);
  }
}

function handleFiles(files) {
  for (let i = 0; i < files.length; i++) {
    if (files[i].type.startsWith('image/')) {
      // Prevent adding more than 10 images
      if (selectedVehiclePhotos.length >= 10) {
        alert("You can only upload a maximum of 10 photos.");
        break;
      }
      selectedVehiclePhotos.push(files[i]);
    }
  }
  renderPhotoPreviews();
}

function renderPhotoPreviews() {
  const container = document.getElementById('photoPreviewContainer');
  const dropZone = document.getElementById('photoDropZone');
  
  if (!container || !dropZone) return;

  if (selectedVehiclePhotos.length === 0) {
    container.classList.add('d-none');
    container.classList.remove('d-flex');
    dropZone.style.display = 'block';
    return;
  }

  dropZone.style.display = 'none';
  container.classList.remove('d-none');
  container.classList.add('d-flex');
  container.innerHTML = '';

  selectedVehiclePhotos.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = e => {
      const div = document.createElement('div');
      div.className = 'position-relative';
      div.style.width = '100px';
      div.style.height = '100px';
      
      div.innerHTML = `
        <img src="${e.target.result}" class="img-fluid rounded border" style="width:100%; height:100%; object-fit: cover;">
        <button type="button" class="btn btn-sm btn-danger position-absolute top-0 end-0 m-1 rounded-circle p-0" style="width: 20px; height: 20px; line-height: 1;" onclick="removePhoto(${index})">
          <i class="bi bi-x" style="font-size: 12px;"></i>
        </button>
      `;
      container.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
  
  // Add a plus button to add more images
  if (selectedVehiclePhotos.length < 10) {
    const addMoreBtn = document.createElement('div');
    addMoreBtn.className = 'border border-dashed rounded bg-light d-flex align-items-center justify-content-center cursor-pointer';
    addMoreBtn.style.width = '100px';
    addMoreBtn.style.height = '100px';
    addMoreBtn.style.cursor = 'pointer';
    addMoreBtn.onclick = () => document.getElementById('vehiclePhotoInput').click();
    addMoreBtn.innerHTML = '<i class="bi bi-plus-lg text-muted fs-3"></i>';
    container.appendChild(addMoreBtn);
  }
}

function removePhoto(index) {
  selectedVehiclePhotos.splice(index, 1);
  renderPhotoPreviews();
}

function clearPhoto() {
  selectedVehiclePhotos = [];
  document.getElementById('vehiclePhotoInput').value = '';
  renderPhotoPreviews();
}

async function handleAddVehicle(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('submitBtn');
  const submitText = document.getElementById('submitBtnText');
  const submitSpinner = document.getElementById('submitSpinner');

  // Validation
  const vehicleNumber = document.getElementById('vehicleNumber').value.trim();
  const make = document.getElementById('make').value.trim();
  const model = document.getElementById('model').value.trim();
  const ownerName = document.getElementById('ownerName').value.trim();
  const ownerPhone = document.getElementById('ownerPhone').value.trim();

  if (!vehicleNumber || !make || !model || !ownerName || !ownerPhone) {
    showAlert('formAlert', '⚠️ Please fill in all required fields (marked with *)', 'warning');
    return;
  }

  submitText.style.display = 'none';
  submitSpinner.style.display = 'inline';
  submitBtn.disabled = true;

  try {
    // Upload photos if provided
    let photoUrl = null;
    if (selectedVehiclePhotos.length > 0) {
      const uploadedUrls = [];
      for (let i = 0; i < selectedVehiclePhotos.length; i++) {
        const formData = new FormData();
        formData.append('doc_type', 'other');
        formData.append('file', selectedVehiclePhotos[i]);

        try {
          const uploadRes = await fetch(`${API_BASE_URL}/api/uploads/photo`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: formData
          });
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            uploadedUrls.push(uploadData.file_url);
          }
        } catch(e) {
          console.error("Failed to upload image", e);
        }
      }
      if (uploadedUrls.length > 0) {
        photoUrl = JSON.stringify(uploadedUrls);
      }
    }

    // Build vehicle payload
    const payload = {
      vehicle_number: vehicleNumber,
      make,
      model,
      year: document.getElementById('year').value || null,
      purchase_date: document.getElementById('purchaseDate').value || null,
      length: document.getElementById('length').value || null,
      length_unit: document.getElementById('lengthUnit').value,
      weight: document.getElementById('weight').value || null,
      weight_unit: document.getElementById('weightUnit').value,
      vehicle_type: document.getElementById('vehicleType') ? document.getElementById('vehicleType').value || null : null,
      photo_url: photoUrl,
      owner_name: ownerName,
      owner_phone: ownerPhone,
      owner_address: document.getElementById('ownerAddress').value.trim() || null,
      owner_email: document.getElementById('ownerEmail')?.value.trim() || null,
      driver_name: document.getElementById('driverName').value.trim() || null,
      driver_phone: document.getElementById('driverPhone').value.trim() || null,
      driver_email: document.getElementById('driverEmail')?.value.trim() || null,
      driver_salary: document.getElementById('driverSalary').value || null,
      driver_user_id: document.getElementById('driverUserSelect')?.value || null,
      description: document.getElementById('description').value.trim() || null,
      last_service_date: document.getElementById('lastServiceDate')?.value || null,
      next_service_date: document.getElementById('nextServiceDate').value || null,
      service_reminder_days: document.getElementById('serviceReminderDays')?.value || 7,
      status: document.getElementById('status').value
    };

    const res = await fetch(`${API_BASE_URL}/api/vehicles`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (res.ok) {
      showAlert('formAlert', '✅ Vehicle added successfully! Redirecting...', 'success');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
    } else {
      showAlert('formAlert', `❌ Error: ${data.message || 'Failed to add vehicle'}`, 'danger');
    }
  } catch(err) {
    showAlert('formAlert', `❌ Connection error: ${err.message}`, 'danger');
  } finally {
    submitText.style.display = 'inline';
    submitSpinner.style.display = 'none';
    submitBtn.disabled = false;
  }
}


// ====================================================
// VEHICLE DETAIL PAGE (vehicle-detail.html)
// ====================================================
let currentVehicle = null;
let isEditing = false;

if (document.getElementById('vehicleDetailContent')) {
  document.addEventListener('DOMContentLoaded', initDetailPage);
}

function initDetailPage() {
  requireAuth();
  loadNavUser();
  initRealtimePolling();

  const params = new URLSearchParams(window.location.search);
  const vehicleId = params.get('id');

  if (!vehicleId) {
    window.location.href = 'dashboard.html';
    return;
  }

  loadVehicleDetail(vehicleId);
}

async function loadVehicleDetail(id) {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/vehicles/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      window.location.href = 'dashboard.html';
      return;
    }

    const data = await res.json();
    currentVehicle = data.vehicle || data;

    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('vehicleDetailContent').classList.remove('hidden');

    renderVehicleDetail(currentVehicle);
    loadVehicleTrips(id);
    loadVehicleDiesel(id);
    loadVehicleService(id);
    loadVehicleDocs(id);

  } catch(e) {
    console.error('Detail load error:', e);
    window.location.href = 'dashboard.html';
  }
}

function renderVehicleDetail(v) {
  // Title
  document.title = `${v.vehicle_number} — Vehicle Detail`;
  document.getElementById('detailTitle').textContent = v.vehicle_number;

  // Header info
  document.getElementById('detailNumber').textContent = v.vehicle_number;
  document.getElementById('detailModel').textContent = [v.make, v.model, v.year, v.vehicle_type].filter(Boolean).join(' • ');

  // Image
  const imgContainer = document.getElementById('detailImageContainer');
  if (v.photo_url) {
    let photos = [];
    try {
      photos = JSON.parse(v.photo_url);
    } catch(e) {
      photos = [v.photo_url]; // Fallback for old single string URLs
    }
    
    if (Array.isArray(photos) && photos.length > 1) {
      let carouselItems = photos.map((url, i) => `
        <div class="carousel-item ${i === 0 ? 'active' : ''} h-100 w-100">
          <img src="${API_BASE_URL}/${url}" class="d-block w-100 h-100" style="object-fit:cover;" alt="${v.vehicle_number} - Photo ${i+1}">
        </div>
      `).join('');
      
      imgContainer.innerHTML = `
        <div id="vehiclePhotoCarousel" class="carousel slide h-100 w-100" data-bs-ride="carousel">
          <div class="carousel-inner h-100 w-100">
            ${carouselItems}
          </div>
          <button class="carousel-control-prev" type="button" data-bs-target="#vehiclePhotoCarousel" data-bs-slide="prev">
            <span class="carousel-control-prev-icon" aria-hidden="true"></span>
            <span class="visually-hidden">Previous</span>
          </button>
          <button class="carousel-control-next" type="button" data-bs-target="#vehiclePhotoCarousel" data-bs-slide="next">
            <span class="carousel-control-next-icon" aria-hidden="true"></span>
            <span class="visually-hidden">Next</span>
          </button>
        </div>
      `;
    } else {
      const url = Array.isArray(photos) ? photos[0] : v.photo_url;
      imgContainer.innerHTML = `<img src="${API_BASE_URL}/${url}" alt="${v.vehicle_number}" style="width:100%; height:100%; object-fit:cover;">`;
    }
  }

  // Status badge
  const statusClass = { active: 'badge-active', inactive: 'badge-inactive', in_service: 'badge-service' }[v.status] || 'badge-active';
  const statusText = { active: '● Active', inactive: '○ Inactive', in_service: '⚙ In Service' }[v.status] || v.status;
  document.getElementById('detailStatusBadge').innerHTML = `<span class="badge ${statusClass}">${statusText}</span>`;

  // Service countdown
  if (v.next_service_date) {
    const days = getDaysUntil(v.next_service_date);
    document.getElementById('serviceReminder').style.display = 'block';
    document.getElementById('countdownDays').textContent = days <= 0 ? 'OVERDUE' : days;
    document.getElementById('countdownDays').style.color = days <= 0 ? '#ff4444' : days <= 7 ? '#ff6b35' : '#00ff88';
    document.getElementById('serviceDate').textContent = `Next service: ${formatDate(v.next_service_date)}`;
  }

  // Quick meta
  if (document.getElementById('quickOwner')) document.getElementById('quickOwner').textContent = v.owner_name || 'N/A';
  if (document.getElementById('quickDriver')) document.getElementById('quickDriver').textContent = v.driver_name || 'N/A';
  if (document.getElementById('quickOwnerPhone')) document.getElementById('quickOwnerPhone').textContent = v.owner_phone || 'N/A';
  if (document.getElementById('quickDriverPhone')) document.getElementById('quickDriverPhone').textContent = v.driver_phone || 'N/A';
  if (document.getElementById('quickLastService')) document.getElementById('quickLastService').textContent = v.last_service_date ? formatDate(v.last_service_date) : 'N/A';
  if (document.getElementById('quickNextService')) document.getElementById('quickNextService').textContent = v.next_service_date ? formatDate(v.next_service_date) : 'N/A';

  // Vehicle detail fields
  renderInfoFields('vehicleDetailFields', [
    { label: 'Registration', value: v.vehicle_number },
    { label: 'Make', value: v.make },
    { label: 'Model', value: v.model },
    { label: 'Year', value: v.year },
    { label: 'Purchase Date', value: formatDate(v.purchase_date) },
    { label: 'Length', value: v.length ? `${v.length} ${v.length_unit}` : 'N/A' },
    { label: 'Weight', value: v.weight ? `${v.weight} ${v.weight_unit}` : 'N/A' },
    { label: 'Last Service', value: formatDate(v.last_service_date) },
    { label: 'Next Service', value: formatDate(v.next_service_date) },
    { label: 'Reminder Days', value: v.service_reminder_days ? `${v.service_reminder_days} days before` : '7 days before' },
    { label: 'Status', value: statusText },
    { label: 'Description', value: v.description, full: true }
  ]);

  // Owner fields
  renderInfoFields('ownerDetailFields', [
    { label: 'Owner Name', value: v.owner_name },
    { label: 'Owner Phone', value: v.owner_phone },
    { label: 'Owner Email', value: v.owner_email },
    { label: 'Owner Address', value: v.owner_address, full: true }
  ]);

  // Driver fields
  const driverFields = [
    { label: 'Driver Name', value: v.driver_name },
    { label: 'Driver Phone', value: v.driver_phone },
    { label: 'Driver Email', value: v.driver_email }
  ];
  const user = getCurrentUser();
  if (user && user.role !== 'driver') {
    driverFields.push({ label: 'Driver Salary', value: v.driver_salary ? formatCurrency(v.driver_salary) + '/month' : 'N/A' });
  }
  renderInfoFields('driverDetailFields', driverFields);
}

function renderInfoFields(containerId, fields) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = fields.map(f => `
    <div style="margin-bottom:14px; ${f.full ? '' : ''}">
      <div style="font-family:'Orbitron',sans-serif; font-size:0.65rem; color:rgba(0,212,255,0.6); letter-spacing:2px; text-transform:uppercase; margin-bottom:4px;">${f.label}</div>
      <div style="font-size:0.95rem; color:white; font-weight:500;">${f.value || 'N/A'}</div>
    </div>
  `).join('');
}

// ===== Tabs =====
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    btn.classList.remove('active');
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

  event.target.classList.add('active');
  const panel = document.getElementById(`tab-${tabName}`);
  if (panel) panel.classList.add('active');
}

// ===== Load related data =====
async function loadVehicleTrips(vehicleId) {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/trips?vehicle_id=${vehicleId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const trips = data.trips || data;
    const tbody = document.getElementById('vehicleTripsBody');
    if (!trips.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-secondary); padding:30px;">No trips recorded yet</td></tr>';
      return;
    }
    tbody.innerHTML = trips.map(t => `
      <tr>
        <td>${formatDateTime(t.trip_date)}</td>
        <td>${t.source_address}</td>
        <td>${t.destination_address}</td>
        <td>${t.load_weight || '—'}</td>
        <td>${t.distance_km ? t.distance_km + ' km' : '—'}</td>
        <td>${formatCurrency(t.toll_fee_up)}</td>
        <td>${formatCurrency(t.toll_fee_down)}</td>
        <td style="color:var(--accent-gold); font-weight:600;">${formatCurrency(t.total_toll)}</td>
        <td><span class="badge ${t.status === 'completed' ? 'badge-active' : t.status === 'in_progress' ? 'badge-service' : 'badge-inactive'}">${t.status}</span></td>
      </tr>
    `).join('');
  } catch(e) { console.error(e); }
}

async function loadVehicleDiesel(vehicleId) {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/diesel?vehicle_id=${vehicleId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const records = data.records || data;
    const tbody = document.getElementById('vehicleDieselBody');
    if (!records.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-secondary); padding:30px;">No diesel records yet</td></tr>';
      return;
    }
    tbody.innerHTML = records.map(r => `
      <tr>
        <td>${formatDateTime(r.refuel_datetime)}</td>
        <td>${r.liters ? r.liters + ' L' : '—'}</td>
        <td style="color:var(--accent-gold); font-weight:600;">${formatCurrency(r.cost)}</td>
        <td>${r.pump_station || '—'}</td>
        <td>${[r.trip_source, r.trip_destination].filter(Boolean).join(' → ') || '—'}</td>
        <td>${r.bill_image_url ? `<a href="${API_BASE_URL}/${r.bill_image_url}" target="_blank" class="btn btn-outline btn-sm">📄 View</a>` : '—'}</td>
      </tr>
    `).join('');
  } catch(e) { console.error(e); }
}

async function loadVehicleService(vehicleId) {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/service?vehicle_id=${vehicleId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const records = data.records || data;
    const tbody = document.getElementById('vehicleServiceBody');
    if (!records.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-secondary); padding:30px;">No service records yet</td></tr>';
      return;
    }
    tbody.innerHTML = records.map(r => `
      <tr>
        <td>${formatDate(r.service_date)}</td>
        <td>${r.service_type || '—'}</td>
        <td>${r.description || '—'}</td>
        <td style="color:var(--accent-gold);">${formatCurrency(r.cost)}</td>
        <td>${[r.mechanic_name, r.garage_name].filter(Boolean).join(' / ') || '—'}</td>
        <td>${formatDate(r.next_service_date)}</td>
      </tr>
    `).join('');
  } catch(e) { console.error(e); }
}

async function loadVehicleDocs(vehicleId) {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/uploads?vehicle_id=${vehicleId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const docs = await res.json();
    const grid = document.getElementById('vehicleDocsGrid');
    if (!docs.length) {
      grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-secondary); padding:30px;">No documents uploaded yet</div>';
      return;
    }
    grid.innerHTML = docs.map(doc => {
      const isImage = doc.file_name && /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.file_name);
      return `
        <div class="file-preview-item">
          ${isImage
            ? `<img src="${API_BASE_URL}/${doc.file_url}" alt="${doc.file_name}" style="cursor:pointer;" onclick="window.open('${API_BASE_URL}/${doc.file_url}', '_blank')">`
            : `<div style="height:120px;display:flex;align-items:center;justify-content:center;font-size:2.5rem;cursor:pointer;" onclick="window.open('${API_BASE_URL}/${doc.file_url}', '_blank')">📄</div>`
          }
          <div class="file-preview-info">${doc.file_name}</div>
        </div>
      `;
    }).join('');
  } catch(e) { console.error(e); }
}

// ===== Edit / Delete =====
function toggleEdit() {
  // Open the edit modal with current vehicle data
  const v = currentVehicle;
  if (!v) return;

  const content = document.getElementById('editModalContent');
  content.innerHTML = `
    <div class="form-grid">
      <div class="form-group"><label>Vehicle Number</label><input type="text" id="editVehicleNumber" class="form-control" value="${v.vehicle_number || ''}"></div>
      <div class="form-group"><label>Make</label><input type="text" id="editMake" class="form-control" value="${v.make || ''}"></div>
      <div class="form-group"><label>Model</label><input type="text" id="editModel" class="form-control" value="${v.model || ''}"></div>
      <div class="form-group"><label>Year</label><input type="number" id="editYear" class="form-control" value="${v.year || ''}"></div>
      <div class="form-group"><label>Vehicle Type</label>
        <select id="editVehicleType" class="form-control">
          <option value="" ${!v.vehicle_type ? 'selected' : ''}>Select Type</option>
          <option value="Container" ${v.vehicle_type === 'Container' ? 'selected' : ''}>Container</option>
          <option value="Body" ${v.vehicle_type === 'Body' ? 'selected' : ''}>Body</option>
          <option value="Trailor" ${v.vehicle_type === 'Trailor' ? 'selected' : ''}>Trailor</option>
          <option value="Tipper" ${v.vehicle_type === 'Tipper' ? 'selected' : ''}>Tipper</option>
        </select>
      </div>
      <div class="form-group"><label>Owner Name</label><input type="text" id="editOwnerName" class="form-control" value="${v.owner_name || ''}"></div>
      <div class="form-group"><label>Owner Phone</label><input type="text" id="editOwnerPhone" class="form-control" value="${v.owner_phone || ''}"></div>
      <div class="form-group"><label>Driver Name</label><input type="text" id="editDriverName" class="form-control" value="${v.driver_name || ''}"></div>
      <div class="form-group"><label>Driver Phone</label><input type="text" id="editDriverPhone" class="form-control" value="${v.driver_phone || ''}"></div>
      <div class="form-group"><label>Driver Salary (₹)</label><input type="number" id="editDriverSalary" class="form-control" value="${v.driver_salary || ''}"></div>
      <div class="form-group"><label>Next Service Date</label><input type="date" id="editNextService" class="form-control" value="${v.next_service_date ? v.next_service_date.split('T')[0] : ''}"></div>
      <div class="form-group"><label>Status</label>
        <select id="editStatus" class="form-control">
          <option value="active" ${v.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${v.status === 'inactive' ? 'selected' : ''}>Inactive</option>
          <option value="in_service" ${v.status === 'in_service' ? 'selected' : ''}>In Service</option>
        </select>
      </div>
      <div class="form-group full-width"><label>Owner Address</label><textarea id="editOwnerAddress" class="form-control">${v.owner_address || ''}</textarea></div>
      <div class="form-group full-width"><label>Description</label><textarea id="editDescription" class="form-control">${v.description || ''}</textarea></div>
    </div>
    <div style="display:flex; gap:12px; justify-content:flex-end; margin-top:16px;">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-gold" onclick="saveVehicle()">💾 Save Changes</button>
    </div>
  `;

  document.getElementById('editModal').classList.add('active');
}

function closeModal() {
  const modalEl = document.getElementById('editModal');
  if (modalEl) {
    modalEl.classList.remove('active');
    if (window.bootstrap && bootstrap.Modal) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }
  }
}

async function saveVehicle() {
  const v = currentVehicle;
  const token = getToken();

  const payload = {
    vehicle_number: document.getElementById('editVehicleNumber')?.value?.trim() || '',
    make: document.getElementById('editMake')?.value?.trim() || '',
    model: document.getElementById('editModel')?.value?.trim() || '',
    year: document.getElementById('editYear')?.value || null,
    vehicle_type: document.getElementById('editVehicleType')?.value || null,
    owner_name: document.getElementById('editOwnerName')?.value?.trim() || '',
    owner_phone: document.getElementById('editOwnerPhone')?.value?.trim() || '',
    owner_address: document.getElementById('editOwnerAddress')?.value?.trim() || '',
    owner_email: document.getElementById('editOwnerEmail')?.value?.trim() || '',
    driver_name: document.getElementById('editDriverName')?.value?.trim() || '',
    driver_phone: document.getElementById('editDriverPhone')?.value?.trim() || '',
    driver_email: document.getElementById('editDriverEmail')?.value?.trim() || '',
    driver_salary: document.getElementById('editDriverSalary')?.value || null,
    driver_user_id: document.getElementById('editDriverUserSelect')?.value || null,
    last_service_date: document.getElementById('editLastService')?.value || null,
    next_service_date: document.getElementById('editNextService')?.value || null,
    service_reminder_days: document.getElementById('editServiceReminderDays')?.value || 7,
    status: document.getElementById('editStatus')?.value || 'active',
    description: document.getElementById('editDescription')?.value?.trim() || ''
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/vehicles/${v.id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      closeModal();
      loadVehicleDetail(v.id);
    } else {
      const d = await res.json();
      alert('Error: ' + (d.message || 'Failed to save'));
    }
  } catch(e) {
    alert('Connection error: ' + e.message);
  }
}

function cancelEdit() {}

async function deleteVehicle() {
  const v = currentVehicle;
  if (!v) return;
  if (!confirm(`Are you sure you want to delete vehicle ${v.vehicle_number}? This will also delete all associated trips, diesel records, and documents.`)) return;

  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/vehicles/${v.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      window.location.href = 'dashboard.html';
    } else {
      alert('Failed to delete vehicle');
    }
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

async function loadDriverDropdown(selectElementId, selectedId = null) {
  const select = document.getElementById(selectElementId);
  if (!select) return;
  
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/drivers`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    
    if (res.ok) {
      const data = await res.json();
      const drivers = data.drivers || [];
      
      select.innerHTML = '<option value="">No Driver Account Linked</option>';
      drivers.forEach(d => {
        const selectedAttr = (selectedId && parseInt(selectedId) === d.id) ? 'selected' : '';
        select.innerHTML += `<option value="${d.id}" ${selectedAttr}>${d.username}</option>`;
      });
    }
  } catch (err) {
    console.error('Error loading driver dropdown:', err);
  }
}
