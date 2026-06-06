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
    avatarEl.textContent = (user.username || 'A')[0].toUpperCase();
  }
  if (nameEl) {
    nameEl.textContent = user.username || 'Admin';
  }
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

// Auto-run on pages that call requireAuth() + loadNavUser()
document.addEventListener('DOMContentLoaded', () => {
  requireAuth();
  loadNavUser();
});

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
  setTimeout(() => { if (el) el.innerHTML = ''; }, 6000);
}
