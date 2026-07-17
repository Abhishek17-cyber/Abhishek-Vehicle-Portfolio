/**
 * auth.js — Authentication helpers
 * JWT token management, login/logout, user info.
 */

/**
 * Redirect to login if no token present.
 * Call on every protected page.
 */
function requireAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

/**
 * Get the stored JWT token.
 */
function getToken() {
  return localStorage.getItem('token');
}

/**
 * Get the stored user object.
 */
function getCurrentUser() {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Logout: clear storage and redirect to login.
 */
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'index.html';
}

/**
 * Build standard Authorization header object.
 */
function authHeaders(extra = {}) {
  return {
    'Authorization': `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

/**
 * Build Authorization header for FormData (no Content-Type — browser sets boundary).
 */
function authHeadersFormData() {
  return { 'Authorization': `Bearer ${getToken()}` };
}

/**
 * Populate navbar user info (avatar initials + name).
 * Call after requireAuth().
 */
function loadNavUser() {
  const user = getCurrentUser();
  if (!user) return;

  const avatarEl = document.getElementById('userAvatar');
  const nameEl = document.getElementById('userName');

  if (avatarEl) {
    if (user.profile_picture_url) {
      avatarEl.innerHTML = `<img src="${API_BASE_URL}/${user.profile_picture_url}" class="rounded-circle" style="width: 100%; height: 100%; object-fit: cover;">`;
      avatarEl.classList.remove('bg-primary', 'text-white', 'd-flex', 'align-items-center', 'justify-content-center');
      avatarEl.style.padding = '0';
    } else {
      avatarEl.textContent = (user.username || 'A')[0].toUpperCase();
      avatarEl.innerHTML = (user.username || 'A')[0].toUpperCase();
      avatarEl.className = "bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-2";
      avatarEl.style.width = '32px';
      avatarEl.style.height = '32px';
    }
  }
  if (nameEl) {
    nameEl.textContent = user.username || 'Admin';
  }

  // Inject Profile Settings menu item
  injectProfileDropdownItem();
  
  // Inject the profile modal if not exists
  injectProfileModal();
}

function injectProfileDropdownItem() {
  const dropdownMenu = document.querySelector('.dropdown-menu');
  if (!dropdownMenu) return;
  
  if (!document.getElementById('profileSettingsLink')) {
    const li = document.createElement('li');
    li.innerHTML = `<a class="dropdown-item" id="profileSettingsLink" href="#" onclick="openProfileModal(); return false;"><i class="bi bi-person-gear me-2"></i>Profile Settings</a>`;
    dropdownMenu.insertBefore(li, dropdownMenu.firstChild);
    
    // Add divider if there are other items
    if (dropdownMenu.children.length > 1) {
      const divider = document.createElement('li');
      divider.id = 'profileSettingsDivider';
      divider.innerHTML = `<hr class="dropdown-divider">`;
      dropdownMenu.insertBefore(divider, dropdownMenu.children[1]);
    }
  }
}

let cropperInstance = null;

function injectProfileModal() {
  if (document.getElementById('profileModal')) return;

  const modalHtml = `
    <div class="modal fade" id="profileModal" tabindex="-1" aria-labelledby="profileModalLabel" aria-hidden="true" style="z-index: 1060;">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg" style="border-radius: 12px;">
          <div class="modal-header border-bottom-0 pb-0">
            <h5 class="modal-title fw-bold text-dark" id="profileModalLabel"><i class="bi bi-person-circle me-2 text-primary"></i>Profile Settings</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body text-center pt-2">
            <div class="mb-4 position-relative d-inline-block">
              <div id="profileModalAvatarContainer" class="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center mx-auto shadow-sm" style="width: 120px; height: 120px; font-size: 3rem; overflow: hidden; position: relative;">
                A
              </div>
              <button class="btn btn-primary btn-sm position-absolute bottom-0 end-0 rounded-circle p-2 shadow-sm d-flex align-items-center justify-content-center" style="width: 36px; height: 36px;" onclick="document.getElementById('profilePicInput').click()">
                <i class="bi bi-camera-fill fs-6"></i>
              </button>
            </div>
            <input type="file" id="profilePicInput" accept="image/*" class="d-none" onchange="handleProfilePicSelect(event)">
            
            <div class="mb-3">
              <h4 class="fw-bold mb-1 text-dark" id="profileModalUsername">Username</h4>
              <span class="badge bg-secondary text-uppercase px-3 py-2 rounded-pill" id="profileModalRole">Role</span>
            </div>
            
            <!-- Cropping Area (Hidden by default) -->
            <div id="cropArea" class="mt-4 d-none text-start p-3 bg-light rounded border border-secondary-subtle">
              <h6 class="fw-bold text-dark mb-2"><i class="bi bi-crop me-1"></i>Crop Profile Image</h6>
              <div class="img-container bg-white border rounded" style="max-height: 250px; overflow: hidden; display: flex; justify-content: center; align-items: center;">
                <img id="cropImage" src="" style="max-width: 100%; max-height: 100%;">
              </div>
              <div class="d-flex justify-content-end gap-2 mt-3">
                <button class="btn btn-sm btn-outline-secondary" onclick="cancelCrop()">Cancel</button>
                <button class="btn btn-sm btn-success" onclick="performCrop()"><i class="bi bi-check-lg me-1"></i>Crop & Save</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  const container = document.createElement('div');
  container.innerHTML = modalHtml;
  document.body.appendChild(container.firstElementChild);
}

function loadCropper(callback) {
  if (window.Cropper) {
    callback();
    return;
  }
  
  // Load CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.css';
  document.head.appendChild(link);
  
  // Load JS
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.js';
  script.onload = callback;
  document.head.appendChild(script);
}

function openProfileModal() {
  const user = getCurrentUser();
  if (!user) return;

  // Set username and role
  document.getElementById('profileModalUsername').textContent = user.username;
  document.getElementById('profileModalRole').textContent = user.role;

  // Set avatar image
  const avatarContainer = document.getElementById('profileModalAvatarContainer');
  if (avatarContainer) {
    if (user.profile_picture_url) {
      avatarContainer.innerHTML = `<img src="${API_BASE_URL}/${user.profile_picture_url}" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else {
      avatarContainer.textContent = (user.username || 'A')[0].toUpperCase();
      avatarContainer.style.fontSize = '3rem';
    }
  }

  // Reset crop area
  document.getElementById('cropArea').classList.add('d-none');
  document.getElementById('profilePicInput').value = '';
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('profileModal'));
  modal.show();
}

function handleProfilePicSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = document.getElementById('cropImage');
    img.src = e.target.result;
    document.getElementById('cropArea').classList.remove('d-none');
    
    loadCropper(() => {
      if (cropperInstance) {
        cropperInstance.destroy();
      }
      cropperInstance = new Cropper(img, {
        aspectRatio: 1,
        viewMode: 1,
        autoCropArea: 0.8,
        responsive: true,
        background: false,
        zoomable: true,
        movable: true,
      });
    });
  };
  reader.readAsDataURL(file);
}

function cancelCrop() {
  document.getElementById('cropArea').classList.add('d-none');
  document.getElementById('profilePicInput').value = '';
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
}

async function performCrop() {
  if (!cropperInstance) return;

  cropperInstance.getCroppedCanvas({
    width: 256,
    height: 256
  }).toBlob(async (blob) => {
    const formData = new FormData();
    formData.append('doc_type', 'profile_photo');
    formData.append('file', blob, 'profile_pic.png');

    const saveBtn = document.querySelector('#cropArea .btn-success');
    const originalHtml = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';

    try {
      const res = await fetch(`${API_BASE_URL}/api/uploads/profile-picture`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        
        // Update user in local storage
        const user = getCurrentUser();
        user.profile_picture_url = data.profile_picture_url;
        localStorage.setItem('user', JSON.stringify(user));

        // Refresh navbar user info
        loadNavUser();

        // Update modal info
        const avatarContainer = document.getElementById('profileModalAvatarContainer');
        if (avatarContainer) {
          avatarContainer.innerHTML = `<img src="${API_BASE_URL}/${data.profile_picture_url}" style="width: 100%; height: 100%; object-fit: cover;">`;
        }

        // Hide crop area
        cancelCrop();
        
        // If on dashboard, reload driver table in case this was a driver
        if (typeof loadDriversList === 'function') {
          loadDriversList();
        }
      } else {
        alert('Failed to save profile picture.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error, failed to save profile picture.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalHtml;
    }
  }, 'image/png');
}

/**
 * Make an authenticated API fetch.
 * Automatically redirects to login on 401.
 */
async function apiFetch(url, options = {}) {
  const headers = {
    'Authorization': `Bearer ${getToken()}`,
    ...(options.headers || {})
  };

  // Don't set Content-Type for FormData — let browser do it
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE_URL}${url}`, { ...options, headers });

  if (res.status === 401) {
    logout();
    return null;
  }
  return res;
}

// Global fetch interceptor to handle 401 Unauthorized globally
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  const response = await originalFetch.apply(this, args);
  if (response.status === 401) {
    const url = args[0] || '';
    // Only intercept if the request was to our API
    if (typeof url === 'string' && typeof API_BASE_URL !== 'undefined' && url.includes(API_BASE_URL)) {
      logout();
    }
  }
  return response;
};

// Auto-run on pages that call requireAuth() + loadNavUser()
document.addEventListener('DOMContentLoaded', () => {
  requireAuth();
  loadNavUser();
  updateSidebarBrand();
  
  // Apply global driver role UI restrictions
  hideDriverElements();
  
  // Set up MutationObserver to hide actions dynamically as tables/elements load
  const observer = new MutationObserver(() => {
    hideDriverElements();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Initialize Light/Dark Mode
  initTheme();
});

/**
 * Theme Management (Light / Dark Mode)
 */
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  applyTheme(savedTheme);
  injectThemeToggle();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-bs-theme', theme);
  localStorage.setItem('theme', theme);
  const themeIcon = document.getElementById('themeIcon');
  if (themeIcon) {
    if (theme === 'dark') {
      themeIcon.className = 'bi bi-moon-stars-fill text-warning';
    } else {
      themeIcon.className = 'bi bi-sun-fill text-secondary';
    }
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-bs-theme') || 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
}

function injectThemeToggle() {
  const userDropdown = document.querySelector('.top-navbar .dropdown');
  if (!userDropdown || document.getElementById('themeToggleBtn')) return;

  const btn = document.createElement('button');
  btn.id = 'themeToggleBtn';
  btn.className = 'btn btn-light border d-flex align-items-center justify-content-center p-2 me-2';
  btn.style.width = '38px';
  btn.style.height = '38px';
  btn.style.borderRadius = '50%';
  btn.title = 'Toggle Light/Dark Mode';
  btn.onclick = (e) => {
    e.preventDefault();
    toggleTheme();
  };

  const currentTheme = localStorage.getItem('theme') || 'light';
  const iconClass = currentTheme === 'dark' ? 'bi bi-moon-stars-fill text-warning' : 'bi bi-sun-fill text-secondary';
  
  btn.innerHTML = `<i class="bi ${iconClass}" id="themeIcon" style="font-size: 1.1rem;"></i>`;
  userDropdown.parentNode.insertBefore(btn, userDropdown);
}

function hideDriverElements() {
  const user = getCurrentUser();
  if (!user || user.role !== 'driver') return;

  const path = window.location.pathname;
  const isAllowedPage = path.includes('trips.html') || path.includes('diesel.html') || path.includes('service.html');

  // Redirect driver away from finance and analytics pages
  if (path.includes('finance.html') || path.includes('analytics.html')) {
    window.location.href = 'dashboard.html';
    return;
  }

  // 1. Hide "Add Vehicle", "Finance", and "Analytics" from sidebar links
  document.querySelectorAll('#sidebar a[href="add-vehicle.html"], #sidebar a[href="finance.html"], #sidebar a#nav-finance, #sidebar a[href="analytics.html"], #sidebar a#nav-analytics').forEach(el => el.style.display = 'none');
  
  // 2. Hide any Management heading or driver tabs on sidebar
  const mgmtHeading = document.getElementById('nav-mgmt-heading');
  if (mgmtHeading) mgmtHeading.style.display = 'none';
  const driversLink = document.getElementById('nav-drivers');
  if (driversLink) driversLink.style.display = 'none';

  // 3. Hide add/new/create/edit/delete buttons (except upload/view/back)
  if (!isAllowedPage) {
    document.querySelectorAll('button, a.btn').forEach(btn => {
      const text = btn.textContent.trim().toLowerCase();
      if (
        (text.includes('add') || text.includes('new') || text.includes('create') || text.includes('delete') || text.includes('edit')) &&
        !text.includes('upload') && !text.includes('view') && !text.includes('back')
      ) {
        btn.style.display = 'none';
      }
    });

    // 4. Hide action columns in tables
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
      let actionColIndex = -1;
      const headers = table.querySelectorAll('thead th');
      headers.forEach((th, idx) => {
        const text = th.textContent.trim().toLowerCase();
        if (text === 'actions' || text === 'action' || text === '' || th.getAttribute('title') === 'Actions') {
          actionColIndex = idx;
        }
      });
      
      if (actionColIndex !== -1) {
        if (headers[actionColIndex]) headers[actionColIndex].style.display = 'none';
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells[actionColIndex]) cells[actionColIndex].style.display = 'none';
        });
      }
    });
  }
}

// ===== Sidebar toggle helpers (used across all pages) =====
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar) return;
  sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('show');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
}

// ===== Generic alert helper =====
function showAlert(containerId, message, type = 'info') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => { if (el) el.innerHTML = ''; }, 6000);
}

// ===== Dynamic Sidebar branding text based on User Role =====
function updateSidebarBrand() {
  const user = getCurrentUser();
  if (!user) return;

  const sidebarBrand = document.querySelector('#sidebar .sidebar-heading:first-child');
  if (sidebarBrand) {
    const img = sidebarBrand.querySelector('img');
    sidebarBrand.innerHTML = '';
    if (img) {
      sidebarBrand.appendChild(img);
    }
    const textNode = document.createTextNode(user.role === 'driver' ? "Driver's Site" : "Transport Hub");
    sidebarBrand.appendChild(textNode);
  }
}
