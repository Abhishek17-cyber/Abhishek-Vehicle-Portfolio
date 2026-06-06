/**
 * realtime.js — Polling-based real-time updates
 * Polls backend every 5 seconds to check for changes.
 * Updates DOM badges, stats and "last updated" indicator without page refresh.
 */

const POLL_INTERVAL_MS = 5000; // 5 seconds
let pollingTimer = null;
let lastPollTime = null;
let pollCallbacks = [];

/**
 * Register a callback to run on each poll tick.
 * Callbacks receive no arguments — they should fetch their own data.
 */
function onPollTick(callback) {
  pollCallbacks.push(callback);
}

/**
 * Start the real-time polling loop.
 * Call once per page after auth is confirmed.
 */
function initRealtimePolling() {
  // Immediate first poll
  runPollTick();

  // Recurring interval
  pollingTimer = setInterval(runPollTick, POLL_INTERVAL_MS);
}

/**
 * Stop the polling loop (e.g. on page unload).
 */
function stopRealtimePolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

/**
 * Execute one poll cycle: update timestamp + run all registered callbacks.
 */
async function runPollTick() {
  lastPollTime = new Date();
  updateLastUpdatedDisplay();

  // Run all registered callbacks in parallel
  await Promise.allSettled(pollCallbacks.map(fn => {
    try { return Promise.resolve(fn()); }
    catch(e) { return Promise.reject(e); }
  }));
}

/**
 * Update the "Last updated: X seconds ago" indicator in the navbar.
 */
function updateLastUpdatedDisplay() {
  const el = document.getElementById('lastUpdated');
  if (!el) return;

  // Update text immediately
  el.textContent = 'Updated just now';

  // Then update relative time every second
  let seconds = 0;
  const ticker = setInterval(() => {
    seconds++;
    if (seconds >= POLL_INTERVAL_MS / 1000) {
      clearInterval(ticker);
      return;
    }
    el.textContent = `Updated ${seconds}s ago`;
  }, 1000);
}

/**
 * Fetch service alerts and update sidebar badge + alert banner.
 */
async function pollServiceAlerts() {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/vehicles/service-alerts`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const alerts = await res.json();

    // Update sidebar badge
    const badge = document.getElementById('serviceAlertCount');
    if (badge) {
      if (alerts.length > 0) {
        badge.textContent = alerts.length;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    // Update dashboard/service page alert banner
    const banner = document.getElementById('serviceAlertBanner');
    const itemsContainer = document.getElementById('alertBannerItems') || document.getElementById('serviceAlertItems');

    if (banner && itemsContainer && alerts.length > 0) {
      banner.classList.add('show');
      itemsContainer.innerHTML = '';
      alerts.forEach(v => {
        const days = getDaysUntil(v.next_service_date);
        const item = document.createElement('div');
        item.className = 'alert-banner-item';
        item.innerHTML = `⚠️ <strong>${v.vehicle_number}</strong> (${v.make} ${v.model}) — Service due on <strong>${formatDate(v.next_service_date)}</strong> (${days <= 0 ? '<span style="color:#ff4444">OVERDUE</span>' : days + ' days left'}). Owner: <strong>${v.owner_phone || 'N/A'}</strong> | Driver: <strong>${v.driver_phone || 'N/A'}</strong>`;
        itemsContainer.appendChild(item);
      });
    } else if (banner) {
      banner.classList.remove('show');
    }

    return alerts;
  } catch(e) {
    console.warn('Service alert poll failed:', e.message);
  }
}

/**
 * Utility: days until a date string (negative = overdue)
 */
function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

/**
 * Utility: format date string to locale
 */
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Utility: format datetime string
 */
function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Utility: format currency (Indian Rupees)
 */
function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '₹0.00';
  return '₹' + parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Register service alert poll on all protected pages
onPollTick(pollServiceAlerts);

// Stop polling when page is hidden/unloaded
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopRealtimePolling();
  } else {
    // Restart when page becomes visible again
    if (!pollingTimer) {
      initRealtimePolling();
    }
  }
});

window.addEventListener('beforeunload', stopRealtimePolling);
