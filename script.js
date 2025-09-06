// script.js - improved version with debounce, retries, clearer errors
// IMPORTANT: Replace this with your real email address for Nominatim polite usage:
const NOMINATIM_EMAIL = 'your-real-email@example.com';

// DOM elements (must match your HTML)
const startBtn = document.getElementById('startBtn');
const calcBtn = document.getElementById('calcBtn');
const clearBtn = document.getElementById('clearBtn');
const place1El = document.getElementById('place1');
const place2El = document.getElementById('place2');
const distanceEl = document.getElementById('distance');
const errorsEl = document.getElementById('errors');
const calculator = document.getElementById('calculator');
const cover = document.getElementById('cover');

let map, markersLayer, polyline;

// small helper to avoid HTML injection when using innerHTML
function escapeHtml(s){ return (s+'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ===================== UI wiring =====================
startBtn.addEventListener('click', () => {
  cover.classList.add('hidden');
  calculator.classList.remove('hidden');
  initMap();
});

// Debounced click: prevents accidental double clicks
function debounce(fn, wait) {
  let t;
  return function(...args) {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  }
}

// Allow pressing Enter in either input to trigger calculation
[place1El, place2El].forEach(inp => {
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      debouncedCalculate();
    }
  });
});

calcBtn.addEventListener('click', debouncedCalculate);
clearBtn.addEventListener('click', clearAll);

// debounce wrapper (500ms)
const debouncedCalculate = debounce(() => { calculateDistance(); }, 500);

// ===================== Map init =====================
function initMap() {
  if (map) return;
  map = L.map('map', { zoomControl:true }).setView([20.5937,78.9629], 5); // center India
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

// ===================== Geocoding helper (Nominatim) =====================
// Improved geocode with retries, backoff, and fallback to broader query.
// Returns first match object or null if not found.
// Throws for network/HTTP errors that are not "not found" (so caller can show messages).

async function geocode(query) {
  if (!query) return null;
  if (!NOMINATIM_EMAIL || NOMINATIM_EMAIL.includes('example.com')) {
    console.warn('Nominatim email is not set to a real address. Set NOMINATIM_EMAIL in script.js.');
  }

  const qIndia = encodeURIComponent(query + ', India');
  const qPlain = encodeURIComponent(query);

  // Try with India restriction first, then fallback to plain query
  const urls = [
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&countrycodes=in&q=${qIndia}&email=${encodeURIComponent(NOMINATIM_EMAIL)}`,
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${qPlain}&email=${encodeURIComponent(NOMINATIM_EMAIL)}`
  ];

  // Try each URL sequentially
  for (const url of urls) {
    try {
      const results = await fetchWithRetry(url, 3, 700);
      if (results && results.length > 0) return results[0];
      // if empty, try next (fallback)
    } catch (err) {
      // For rate-limit or network errors, bubble up so caller can show appropriate message
      throw err;
    }
  }
  // none found
  return null;
}

// fetch helper with retry/backoff for 429 (Too Many Requests)
async function fetchWithRetry(url, maxRetries = 3, initialDelayMs = 600) {
  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    attempt++;
    try {
      // Nominatim does allow simple GET from browsers, but some networks may block; handle errors
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        // Provide rich error info
        const txt = await res.text().catch(()=>'');
        const err = new Error(`HTTP ${res.status}: ${res.statusText} - ${txt}`);
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      return data;
    } catch (err) {
      // If 429 (rate limit), retry with backoff
      const status = err.status || (err.message && err.message.includes('429') ? 429 : null);
      const isNetwork = err instanceof TypeError && err.message && (err.message === 'Failed to fetch' || err.message.includes('NetworkError'));
      if (status === 429 && attempt <= maxRetries) {
        console.warn(`Nominatim rate-limited (429). Retrying attempt ${attempt}/${maxRetries} after ${delay}ms.`);
        await sleep(delay);
        delay *= 2;
        continue;
      } else if (status === 403) {
        // Forbidden - likely blocked; don't retry
        throw new Error('Geocoding blocked (403). The geocoding service rejected the request.');
      } else if (isNetwork && attempt <= maxRetries) {
        console.warn(`Network error when calling Nominatim. Retrying ${attempt}/${maxRetries} after ${delay}ms.`);
        await sleep(delay);
        delay *= 2;
        continue;
      } else {
        // rethrow the error for the caller to handle
        throw err;
      }
    }
  }
}

function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }

// ===================== Haversine =====================
function haversine(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ===================== Main calculate function =====================
async function calculateDistance() {
  const p1 = place1El.value.trim();
  const p2 = place2El.value.trim();
  distanceEl.textContent = '';
  errorsEl.textContent = '';

  if (!p1 || !p2) {
    errorsEl.textContent = 'Please enter both places.';
    return;
  }

  // Disable UI while working
  setWorking(true);

  try {
    // Call geocoders in parallel (they use fetchWithRetry internally)
    const [r1, r2] = await Promise.all([geocode(p1), geocode(p2)]);

    if (!r1 || !r2) {
      // specific not-found messages
      if (!r1 && !r2) {
        errorsEl.textContent = 'Neither place was found. Try adding city/state (e.g., "Tambaram, Chennai").';
      } else if (!r1) {
        errorsEl.textContent = 'First place not found. Try a more specific name (add city/state).';
      } else {
        errorsEl.textContent = 'Second place not found. Try a more specific name (add city/state).';
      }
      return;
    }

    const lat1 = parseFloat(r1.lat), lon1 = parseFloat(r1.lon);
    const lat2 = parseFloat(r2.lat), lon2 = parseFloat(r2.lon);

    // Initialize map if not already
    initMap();

    // Clear previous markers / polyline
    markersLayer.clearLayers();
    if (polyline) { polyline.remove(); polyline = null; }

    // Add markers and popups
    const marker1 = L.marker([lat1, lon1]).bindPopup(`<strong>${escapeHtml(p1)}</strong><br>${escapeHtml(r1.display_name)}`).addTo(markersLayer);
    const marker2 = L.marker([lat2, lon2]).bindPopup(`<strong>${escapeHtml(p2)}</strong><br>${escapeHtml(r2.display_name)}`).addTo(markersLayer);

    // Fit bounds with padding
    const bounds = L.latLngBounds([[lat1, lon1], [lat2, lon2]]);
    map.fitBounds(bounds.pad(0.25));

    // Draw polyline
    polyline = L.polyline([[lat1, lon1], [lat2, lon2]], { color: '#2b79ff', weight: 4, opacity: 0.85 }).addTo(map);

    // Compute and display distance based on selected unit
    let km = haversine(lat1, lon1, lat2, lon2);
    km = Math.max(0, km);
    const unit = document.querySelector('input[name="unit"]:checked')?.value || 'km';
    let display;
    if (unit === 'km') {
      display = `${km.toFixed(2)} km (straight-line)`;
    } else {
      const miles = km * 0.621371;
      display = `${miles.toFixed(2)} miles (straight-line)`;
    }
    distanceEl.textContent = display;

    // open first popup, then second shortly
    marker1.openPopup();
    setTimeout(()=> marker2.openPopup(), 700);
  } catch (err) {
    console.error('Geocoding error:', err);
    // Provide friendly message to user depending on type
    if (err.message && err.message.includes('429')) {
      errorsEl.textContent = 'Too many requests to geocoding service (rate-limited). Wait a bit and try again.';
    } else if (err.message && err.message.includes('403')) {
      errorsEl.textContent = 'Geocoding blocked (403). The geocoding service rejected the request. Check network or try again later.';
    } else if (err instanceof TypeError || (err.message && err.message.includes('Failed to fetch'))) {
      errorsEl.textContent = 'Network/CORS error while contacting geocoding service. Check your network or try again from a different network.';
    } else {
      // generic fallback
      errorsEl.textContent = 'An error occurred while finding places. See console for details.';
    }
  } finally {
    setWorking(false);
  }
}

// UI helper to disable/enable while requests run
function setWorking(isWorking) {
  if (isWorking) {
    calcBtn.disabled = true;
    calcBtn.textContent = 'Searching...';
    clearBtn.disabled = true;
  } else {
    calcBtn.disabled = false;
    calcBtn.textContent = 'Calculate Distance';
    clearBtn.disabled = false;
    // small protection: re-enable calc button after short cooldown
    setTimeout(()=> { if (!calcBtn.disabled) return; calcBtn.disabled = false; calcBtn.textContent = 'Calculate Distance'; }, 1200);
  }
}

// clear UI and map
function clearAll() {
  place1El.value = '';
  place2El.value = '';
  distanceEl.textContent = '';
  errorsEl.textContent = '';
  if (markersLayer) markersLayer.clearLayers();
  if (polyline) { polyline.remove(); polyline = null; }
  if (map) map.setView([20.5937,78.9629], 5);
}
