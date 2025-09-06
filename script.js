// script.js - Leaflet + Nominatim (OpenStreetMap)
// Replace the `email` value in nominatimUrl with your actual email address.

let map, markersLayer, polyline;
const startBtn = document.getElementById('startBtn');
const calcBtn = document.getElementById('calcBtn');
const clearBtn = document.getElementById('clearBtn');
const place1El = document.getElementById('place1');
const place2El = document.getElementById('place2');
const distanceEl = document.getElementById('distance');
const errorsEl = document.getElementById('errors');
const calculator = document.getElementById('calculator');
const cover = document.getElementById('cover');

startBtn.addEventListener('click', () => {
  cover.classList.add('hidden');
  calculator.classList.remove('hidden');
  initMap();
});

calcBtn.addEventListener('click', calculateDistance);
clearBtn.addEventListener('click', clearAll);

// Initialize Leaflet map
function initMap() {
  if (map) return;
  map = L.map('map', { zoomControl:true }).setView([20.5937,78.9629], 5); // center India

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

// Helper: Nominatim geocode (returns first result)
async function geocode(query) {
  // IMPORTANT: replace the email param with your real contact email
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&addressdetails=1&q=${encodeURIComponent(query + ', India')}&email=your-email@example.com`;
  const res = await fetch(nominatimUrl, { method: 'GET' });
  if (!res.ok) throw new Error('Geocoding failed: ' + res.status);
  const data = await res.json();
  if (!data || data.length === 0) return null;
  return data[0]; // first match
}

// Haversine distance (in kilometers)
function haversine(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180;
  const R = 6371; // Earth radius km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function calculateDistance() {
  const p1 = place1El.value.trim();
  const p2 = place2El.value.trim();
  distanceEl.textContent = '';
  errorsEl.textContent = '';

  if (!p1 || !p2) {
    errorsEl.textContent = 'Please enter both places.';
    return;
  }
  try {
    calcBtn.disabled = true;
    calcBtn.textContent = 'Searching...';

    const [r1, r2] = await Promise.all([geocode(p1), geocode(p2)]);

    if (!r1 || !r2) {
      errorsEl.textContent = ( !r1 && !r2 ) ? 'Neither place was found. Try different keywords.' : (!r1 ? 'First place not found.' : 'Second place not found.');
      calcBtn.disabled = false;
      calcBtn.textContent = 'Calculate Distance';
      return;
    }

    const lat1 = parseFloat(r1.lat), lon1 = parseFloat(r1.lon);
    const lat2 = parseFloat(r2.lat), lon2 = parseFloat(r2.lon);

    // Clear previous markers/polyline
    markersLayer.clearLayers();
    if (polyline) { polyline.remove(); polyline = null; }

    // Add markers with popups
    const marker1 = L.marker([lat1, lon1]).bindPopup(`<strong>${escapeHtml(p1)}</strong><br>${escapeHtml(r1.display_name)}`).addTo(markersLayer);
    const marker2 = L.marker([lat2, lon2]).bindPopup(`<strong>${escapeHtml(p2)}</strong><br>${escapeHtml(r2.display_name)}`).addTo(markersLayer);

    // Fit bounds
    const bounds = L.latLngBounds([[lat1, lon1],[lat2, lon2]]);
    map.fitBounds(bounds.pad(0.25));

    // Draw line
    polyline = L.polyline([[lat1, lon1], [lat2, lon2]], { color: '#2b79ff', weight: 4, opacity: 0.85 }).addTo(map);

    // Compute distance
    let km = haversine(lat1, lon1, lat2, lon2);
    km = Math.max(0, km); // guard
    const unit = document.querySelector('input[name="unit"]:checked').value;
    let display;
    if (unit === 'km') {
      display = `${km.toFixed(2)} km (straight-line)`;
    } else {
      const miles = km * 0.621371;
      display = `${miles.toFixed(2)} miles (straight-line)`;
    }
    distanceEl.textContent = display;

    // open both popups briefly
    marker1.openPopup();
    setTimeout(()=> marker2.openPopup(), 700);

  } catch (err) {
    console.error(err);
    errorsEl.textContent = 'An error occurred while finding places. Try again later.';
  } finally {
    calcBtn.disabled = false;
    calcBtn.textContent = 'Calculate Distance';
  }
}

function clearAll() {
  place1El.value = '';
  place2El.value = '';
  distanceEl.textContent = '';
  errorsEl.textContent = '';
  if (markersLayer) markersLayer.clearLayers();
  if (polyline) { polyline.remove(); polyline = null; }
  if (map) map.setView([20.5937,78.9629], 5);
}

// small helper to avoid HTML injection when using innerHTML
function escapeHtml(s){ return (s+'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
