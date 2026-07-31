/**
 * dashboard.js — Dashboard page logic
 * Loads stats, vehicle grid, service alerts, real-time polling.
 */

// ═══════ Initialization ═══════
document.addEventListener('DOMContentLoaded', () => {
  requireAuth();
  loadNavUser();
  checkRoleRestrictions();
  initRealtimePolling();
  loadDashboard();
  onPollTick(refreshStats);
  
  if (getCurrentUser() && getCurrentUser().role === 'owner') {
    initDriverManagement();
  }
});

// ═══════ Main Dashboard Loader ═══════
async function loadDashboard() {
  await Promise.all([
    loadStats(),
    loadVehicleGrid(),
    loadServiceAlertsCheck(),
    loadComplianceAlertsCheck()
  ]);
}

async function refreshDashboard() {
  const loading = document.getElementById('vehiclesLoading');
  const grid    = document.getElementById('vehiclesGrid');
  const empty   = document.getElementById('vehiclesEmpty');

  loading.style.display = 'block';
  grid.innerHTML = '';
  empty.style.display = 'none';

  await loadDashboard();
}

// ═══════ Statistics ═══════
async function loadStats() {
  const token = getToken();
  try {
    const [vehiclesRes, tripsRes, dieselRes, alertsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/vehicles`,              { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch(`${API_BASE_URL}/api/trips`,                 { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch(`${API_BASE_URL}/api/diesel`,                { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch(`${API_BASE_URL}/api/vehicles/service-alerts`, { headers: { 'Authorization': `Bearer ${token}` } })
    ]);

    if (vehiclesRes.ok) {
      const data = await vehiclesRes.json();
      const count = (data.vehicles || data).length;
      document.getElementById('statVehicles').textContent = count;
      const countEl = document.getElementById('vehicleCount');
      if (countEl) countEl.textContent = count + ' vehicle' + (count !== 1 ? 's' : '');
    }

    if (tripsRes.ok) {
      const data = await tripsRes.json();
      document.getElementById('statTrips').textContent = (data.trips || data).length;
    }

    if (dieselRes.ok) {
      const data = await dieselRes.json();
      const records = data.records || data;
      const total = records.reduce((sum, r) => sum + parseFloat(r.cost || 0), 0);
      document.getElementById('statDiesel').textContent =
        total >= 100000 ? (total / 100000).toFixed(1) + 'L' :
        total >= 1000   ? (total / 1000).toFixed(1) + 'K' :
        total.toFixed(0);
    }

    if (alertsRes.ok) {
      const alerts = await alertsRes.json();
      const count = alerts.length;
      document.getElementById('statService').textContent = count;
      const trendEl = document.getElementById('serviceAlertTrend');
      if (trendEl) trendEl.style.display = count > 0 ? 'inline-flex' : 'none';
    }

  } catch(e) {
    console.error('Stats error:', e);
  }
}

async function refreshStats() {
  await loadStats();
}

// ═══════ Vehicle Grid ═══════
async function loadVehicleGrid() {
  const token   = getToken();
  const grid    = document.getElementById('vehiclesGrid');
  const loading = document.getElementById('vehiclesLoading');
  const empty   = document.getElementById('vehiclesEmpty');

  try {
    const res = await fetch(`${API_BASE_URL}/api/vehicles`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    loading.style.display = 'none';

    if (!res.ok) {
      grid.innerHTML = '<div class="alert alert-danger" style="grid-column:1/-1">Failed to load vehicles. Check server connection.</div>';
      return;
    }

    const data     = await res.json();
    const vehicles = data.vehicles || data;

    grid.innerHTML = '';

    if (!vehicles.length) {
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    vehicles.forEach(v => grid.appendChild(createVehicleCard(v)));

  } catch(e) {
    loading.style.display = 'none';
    grid.innerHTML = `
      <div class="alert alert-danger" style="grid-column:1/-1">
        ⚠️ Cannot connect to server. Make sure the backend is running at ${API_BASE_URL}
      </div>`;
  }
}

// ═══════ Vehicle Card Builder ═══════
function createVehicleCard(v) {
  const statusMap = {
    active:     { cls: 'bg-success',   txt: 'Active' },
    inactive:   { cls: 'bg-secondary', txt: 'Inactive' },
    in_service: { cls: 'bg-warning text-dark',  txt: 'In Service' }
  };
  const s = statusMap[v.status] || statusMap.active;

  // Days until next service
  const daysToService = v.next_service_date ? getDaysUntil(v.next_service_date) : null;
  let serviceChip = '';
  let dueBadge = '';
  
  if (daysToService !== null) {
    if (daysToService <= 0) {
      serviceChip = `<span class="badge bg-danger"><i class="bi bi-exclamation-triangle-fill me-1"></i>Service OVERDUE</span>`;
      dueBadge = `<div class="position-absolute top-0 end-0 m-2 badge bg-danger shadow-sm"><i class="bi bi-exclamation-triangle-fill me-1"></i>Service Due</div>`;
    } else if (daysToService <= 7) {
      serviceChip = `<span class="badge bg-warning text-dark"><i class="bi bi-wrench me-1"></i>Service in ${daysToService} day(s)</span>`;
      dueBadge = `<div class="position-absolute top-0 end-0 m-2 badge bg-warning text-dark shadow-sm"><i class="bi bi-wrench me-1"></i>Service Due</div>`;
    }
  }

  // Extra chips
  const chips = [];
  if (v.driver_name) chips.push(`<span class="badge bg-light text-dark border"><i class="bi bi-person me-1"></i>${v.driver_name}</span>`);
  if (v.length) chips.push(`<span class="badge bg-light text-dark border"><i class="bi bi-rulers me-1"></i>${v.length} ${v.length_unit || 'm'}</span>`);
  if (v.weight) chips.push(`<span class="badge bg-light text-dark border"><i class="bi bi-box-seam me-1"></i>${v.weight} ${v.weight_unit || 't'}</span>`);

  const card = document.createElement('div');
  card.className = 'col-md-6 col-xl-4 col-xxl-3';
  card.style.cursor = 'pointer';
  
  let mainPhoto = v.photo_url;
  if (mainPhoto) {
    try {
      const photos = JSON.parse(mainPhoto);
      if (Array.isArray(photos) && photos.length > 0) mainPhoto = photos[0];
    } catch(e) {} // Not JSON, use as is
  }

  const imgHtml = mainPhoto 
    ? `<img src="${API_BASE_URL}/${mainPhoto}" class="card-img-top object-fit-cover" style="height: 180px;" alt="${v.vehicle_number}">`
    : `<div class="bg-light text-muted d-flex align-items-center justify-content-center" style="height: 180px;"><i class="bi bi-truck fs-1 opacity-50"></i></div>`;

  const currentUser = getCurrentUser();
  const isOwner = currentUser && currentUser.role === 'owner';
  
  const displayPersonName = isOwner ? (v.driver_name || 'No Driver Linked') : (v.owner_name || 'N/A');
  const displayPersonPhone = isOwner ? (v.driver_phone || 'N/A') : (v.owner_phone || 'N/A');
  const personIcon = isOwner ? 'bi-person' : 'bi-person-badge';

  card.innerHTML = `
    <div class="card text-decoration-none text-dark h-100 shadow-sm hover-shadow border-0 position-relative" onclick="window.location.href='vehicle-detail.html?id=${v.id}'">
      ${imgHtml}
      ${dueBadge}
      <div class="position-absolute top-0 start-0 m-2 badge ${s.cls} shadow-sm">${s.txt}</div>
      <div class="card-body">
        <h5 class="card-title fw-bold mb-1 text-primary">${v.vehicle_number}</h5>
        <h6 class="card-subtitle mb-3 text-muted">${[v.make, v.model, v.year, v.vehicle_type].filter(Boolean).join(' · ')}</h6>
        <div class="d-flex flex-wrap gap-2 mb-2">
          ${chips.join('')}
        </div>
        ${serviceChip ? `<div class="mt-2">${serviceChip}</div>` : ''}
      </div>
      <div class="card-footer bg-white border-top text-muted small d-flex justify-content-between align-items-center">
        <span><i class="bi ${personIcon} me-1"></i>${displayPersonName}</span>
        <span><i class="bi bi-telephone me-1"></i>${displayPersonPhone}</span>
      </div>
    </div>
  `;
  return card;
}

// ═══════ Service Alerts ═══════
async function loadServiceAlertsCheck() {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/vehicles/service-alerts`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const alerts = await res.json();

    // Show banner
    const banner   = document.getElementById('serviceAlertBanner');
    const itemsDiv = document.getElementById('alertBannerItems');

    if (alerts.length > 0 && banner && itemsDiv) {
      banner.classList.remove('d-none');
      banner.classList.add('d-flex');
      
      const badge = document.getElementById('serviceAlertCount');
      if (badge) {
        badge.classList.remove('d-none');
        badge.textContent = alerts.length;
      }

      itemsDiv.innerHTML = alerts.map(v => {
        const days = getDaysUntil(v.next_service_date);
        const daysStr = days <= 0
          ? `<span class="text-danger fw-bold">OVERDUE</span>`
          : `<span class="fw-bold">${days} day(s) left</span>`;
        return `
          <div class="mb-2 pb-1 border-bottom border-light">
            <strong>${v.vehicle_number}</strong> (${v.make || ''} ${v.model || ''}) &mdash;
            Next service: <span class="fw-bold">${formatDate(v.next_service_date)}</span> &mdash; ${daysStr}
            <br>
            <span class="text-muted"><i class="bi bi-person me-1"></i>Owner: ${v.owner_name || 'N/A'} <i class="bi bi-telephone ms-1 me-1"></i><a href="tel:${v.owner_phone}" class="text-decoration-none">${v.owner_phone || 'N/A'}</a> | <i class="bi bi-person-badge ms-1 me-1"></i>Driver: ${v.driver_name || 'N/A'} <i class="bi bi-telephone ms-1 me-1"></i><a href="tel:${v.driver_phone}" class="text-decoration-none">${v.driver_phone || 'N/A'}</a></span>
          </div>`;
      }).join('');

      // Show popup alert ONCE per session
      const alertShownKey = 'serviceAlertShown_' + new Date().toDateString();
      if (!sessionStorage.getItem(alertShownKey)) {
        sessionStorage.setItem(alertShownKey, '1');
        const msgs = alerts.map(v => {
          const days = getDaysUntil(v.next_service_date);
          return `⚠️ ${v.vehicle_number} — Service ${days <= 0 ? 'OVERDUE' : 'in ' + days + ' day(s)'}!\nOwner: ${v.owner_phone || 'N/A'}  |  Driver: ${v.driver_phone || 'N/A'}`;
        });
        window.alert('🔧 VEHICLE SERVICE REMINDERS\n\n' + msgs.join('\n\n'));
      }
    } else if (banner) {
      banner.classList.add('d-none');
      banner.classList.remove('d-flex');
      const badge = document.getElementById('serviceAlertCount');
      if (badge) badge.classList.add('d-none');
    }

  } catch(e) {
    console.warn('Service alert check failed:', e.message);
  }
}

// ═══════ Compliance Alerts ═══════
async function loadComplianceAlertsCheck() {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/compliance/alerts`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const alerts = await res.json();

    const banner = document.getElementById('complianceAlertBanner');
    const itemsDiv = document.getElementById('complianceBannerItems');

    if (alerts.length > 0 && banner && itemsDiv) {
      banner.classList.remove('d-none');
      banner.classList.add('d-flex');

      const docTypeLabels = {
        'insurance': 'Insurance',
        'fitness_cert': 'Fitness Cert (FC)',
        'permit': 'National Permit',
        'puc': 'Emission (PUC)',
        'road_tax': 'Road Tax',
        'other': 'Other'
      };

      itemsDiv.innerHTML = alerts.map(c => {
        const docName = docTypeLabels[c.doc_type] || c.doc_type;
        const days = c.days_to_expiry;
        const daysStr = days < 0
          ? `<span class="text-danger fw-bold">EXPIRED</span>`
          : `<span class="text-danger fw-bold">${days} day(s) left</span>`;
          
        return `
          <div class="mb-1">
            <strong>${c.vehicle_number}</strong> &mdash;
            ${docName} expires on <span class="fw-bold">${new Date(c.expiry_date).toLocaleDateString('en-IN')}</span> &mdash; ${daysStr}
          </div>`;
      }).join('');
    } else if (banner) {
      banner.classList.add('d-none');
      banner.classList.remove('d-flex');
    }
  } catch(e) {
    console.warn('Compliance alert check failed:', e.message);
  }
}

// ═══════ Role-based Restrictions & Dynamic Tab Switching ═══════
function checkRoleRestrictions() {
  const user = getCurrentUser();
  if (!user) return;

  if (user.role === 'driver') {
    // Hide owner-only elements on sidebar
    const addVehicleLink = document.getElementById('nav-add-vehicle');
    if (addVehicleLink) addVehicleLink.style.display = 'none';

    const mgmtHeading = document.getElementById('nav-mgmt-heading');
    if (mgmtHeading) mgmtHeading.style.display = 'none';

    const driversLink = document.getElementById('nav-drivers');
    if (driversLink) driversLink.style.display = 'none';

    // Hide actions on main page
    const dashboardActions = document.getElementById('dashboardActions');
    if (dashboardActions) dashboardActions.style.display = 'none';
    
    const addVehicleGridBtn = document.getElementById('addVehicleGridBtn');
    if (addVehicleGridBtn) addVehicleGridBtn.style.display = 'none';

    // Update welcome header
    const welcomeTitle = document.getElementById('welcomeUserTitle');
    if (welcomeTitle) welcomeTitle.textContent = 'Welcome, Driver';
    const welcomeSub = document.getElementById('welcomeUserSub');
    if (welcomeSub) welcomeSub.textContent = 'View your assigned vehicles and upload reports.';
  }
}

let currentMainTab = 'dashboard';
function switchMainTab(tab) {
  currentMainTab = tab;
  const dashSec = document.getElementById('dashboardSection');
  const driveSec = document.getElementById('driversSection');
  const dashNav = document.getElementById('nav-dashboard');
  const driveNav = document.getElementById('nav-drivers');

  if (tab === 'drivers') {
    dashSec.classList.add('d-none');
    driveSec.classList.remove('d-none');
    dashNav.classList.remove('active');
    driveNav.classList.add('active');
    loadDriversList();
    loadDriverVehicleSuggestions();
  } else {
    dashSec.classList.remove('d-none');
    driveSec.classList.add('d-none');
    dashNav.classList.add('active');
    driveNav.classList.remove('active');
    loadDashboard();
  }
}

// ═══════ Driver Management Actions ═══════
function initDriverManagement() {
  const form = document.getElementById('addDriverForm');
  if (form) {
    form.addEventListener('submit', handleAddDriver);
  }
}

async function loadDriversList() {
  const token = getToken();
  const tbody = document.getElementById('driversListBody');
  const countText = document.getElementById('driverCountText');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary"></div></td></tr>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/drivers`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-4">Failed to load drivers.</td></tr>';
      return;
    }

    const data = await res.json();
    const drivers = data.drivers || [];

    countText.textContent = drivers.length;

    if (!drivers.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">No drivers registered yet.</td></tr>';
      return;
    }

    tbody.innerHTML = drivers.map(d => {
      const avatarHtml = d.profile_picture_url
        ? `<img src="${API_BASE_URL}/${d.profile_picture_url}" class="rounded-circle me-2 object-fit-cover" style="width: 32px; height: 32px;" alt="${d.username}">`
        : `<div class="bg-primary text-white rounded-circle d-inline-flex align-items-center justify-content-center me-2 fw-semibold" style="width: 32px; height: 32px; font-size: 0.85rem;">${d.username[0].toUpperCase()}</div>`;

      const vehicleHtml = d.vehicle_number
        ? `<span class="badge bg-info text-dark fw-bold" style="cursor: pointer;" onclick="assignVehiclePrompt(${d.id}, '${d.vehicle_number}')" title="Click to change vehicle"><i class="bi bi-truck me-1"></i>${d.vehicle_number}</span>`
        : `<span class="badge bg-secondary" style="cursor: pointer;" onclick="assignVehiclePrompt(${d.id}, '')" title="Click to assign vehicle">Assign Vehicle</span>`;

      // Show full name and mobile if available
      const driverDetails = (d.full_name || d.mobile_number) 
        ? `<div class="small text-muted">${d.full_name || ''} ${d.mobile_number ? '📞 ' + d.mobile_number : ''}</div>` 
        : '';

      return `
        <tr>
          <td class="text-dark">
            <div class="d-flex align-items-center">
              ${avatarHtml}
              <div>
                <div class="fw-semibold">${d.username}</div>
                ${driverDetails}
              </div>
            </div>
          </td>
          <td class="align-middle">${vehicleHtml}</td>
          <td class="align-middle">${new Date(d.created_at).toLocaleDateString()}</td>
          <td class="align-middle text-end">
            <button class="btn btn-outline-danger btn-sm" onclick="deleteDriver(${d.id})"><i class="bi bi-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Load drivers error:', err);
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger py-4">Server connection failed.</td></tr>';
  }
}

async function handleAddDriver(e) {
  e.preventDefault();

  const usernameInput = document.getElementById('driverUsername');
  const passwordInput = document.getElementById('driverPassword');
  const vehicleInput = document.getElementById('driverVehicleInput');
  const submitBtn = document.getElementById('driverSubmitBtn');
  const submitText = document.getElementById('driverSubmitBtnText');
  const spinner = document.getElementById('driverSubmitSpinner');
  const alertBox = document.getElementById('driverFormAlert');

  alertBox.className = 'alert d-none';
  submitBtn.disabled = true;
  spinner.classList.remove('d-none');
  submitText.textContent = 'Creating...';

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/drivers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: usernameInput.value.trim(),
        password: passwordInput.value,
        vehicle_number: vehicleInput ? (vehicleInput.value.trim() || null) : null
      })
    });

    const data = await res.json();

    if (res.ok) {
      alertBox.className = 'alert alert-success py-2';
      alertBox.textContent = 'Driver account created successfully!';
      alertBox.classList.remove('d-none');
      usernameInput.value = '';
      passwordInput.value = '';
      if (vehicleInput) vehicleInput.value = '';
      loadDriversList();
      loadDriverVehicleSuggestions();

      // Automatically hide the form and show the list after success
      setTimeout(() => {
        const addCol = document.getElementById('addDriverCol');
        const listCol = document.getElementById('driversListCol');
        const btn = document.getElementById('toggleDriverFormBtn');
        if (addCol && listCol) {
          addCol.classList.add('d-none');
          listCol.classList.remove('d-none');
          if (btn) btn.innerHTML = '<i class="bi bi-person-plus me-1"></i>Create Driver Account';
        }
        alertBox.classList.add('d-none'); // Hide the success alert for the next time
      }, 1500);
    } else {
      alertBox.className = 'alert alert-danger py-2';
      alertBox.textContent = data.message || 'Failed to create driver account';
      alertBox.classList.remove('d-none');
    }
  } catch (err) {
    alertBox.className = 'alert alert-danger py-2';
    alertBox.textContent = 'Server connection failed.';
    alertBox.classList.remove('d-none');
  } finally {
    submitBtn.disabled = false;
    spinner.classList.add('d-none');
    submitText.textContent = 'Create Account';
  }
}

async function deleteDriver(id) {
  if (!confirm('Are you sure you want to delete this driver? The driver will lose access.')) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/drivers/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });

    if (res.ok) {
      loadDriversList();
    } else {
      const data = await res.json();
      alert(data.message || 'Failed to delete driver');
    }
  } catch (err) {
    alert('Server connection failed.');
  }
}

async function loadDriverVehicleSuggestions() {
  const datalist = document.getElementById('vehicleSuggestions');
  if (!datalist) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/vehicles`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });

    if (res.ok) {
      const data = await res.json();
      const vehicles = data.vehicles || [];

      datalist.innerHTML = '';
      vehicles.forEach(v => {
        datalist.innerHTML += `<option value="${v.vehicle_number}">${v.make} ${v.model}</option>`;
      });
    }
  } catch (err) {
    console.error('Error loading vehicle suggestions:', err);
  }
}

async function assignVehiclePrompt(driverId, currentVehicle) {
  const newVehicle = prompt(`Enter new vehicle number for this driver (currently: ${currentVehicle || 'None'}):`);
  if (newVehicle === null) return; // User cancelled

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/drivers/${driverId}/vehicle`, {
      method: 'PUT',
      headers: { 
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ vehicle_number: newVehicle })
    });
    
    if (res.ok) {
      loadDriversList();
    } else {
      const data = await res.json();
      alert(data.message || 'Failed to update vehicle assignment');
    }
  } catch (err) {
    console.error('Assign vehicle error:', err);
    alert('Server connection failed.');
  }
}
