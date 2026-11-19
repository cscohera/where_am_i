// Where Am I Running — plan a route, share it as a link.
// The whole route lives in the URL hash: #r=<encoded polyline>&n=<note>&u=km|mi

const KM_TO_MI = 0.621371;
const DEFAULT_VIEW = { center: [39.8283, -98.5795], zoom: 4 }; // continental US
// Free public OSRM server with a walking/running profile (no key, fair use).
const ROUTER = "https://routing.openstreetmap.de/routed-foot/route/v1/foot/";

// ---------- Google encoded polyline (precision 5) ----------
function encodePolyline(points) {
  let out = "";
  let prevLat = 0, prevLng = 0;
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    out += encodeValue(iLat - prevLat) + encodeValue(iLng - prevLng);
    prevLat = iLat;
    prevLng = iLng;
  }
  return out;
}

function encodeValue(v) {
  v = v < 0 ? ~(v << 1) : v << 1;
  let s = "";
  while (v >= 0x20) {
    s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return s + String.fromCharCode(v + 63);
}

function decodePolyline(str) {
  const points = [];
  let i = 0, lat = 0, lng = 0;
  const next = () => {
    let result = 0, shift = 0, b;
    do {
      if (i >= str.length) throw new Error("Bad polyline");
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += next();
    lng += next();
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

function totalMeters(map, points) {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += map.distance(points[i - 1], points[i]);
  return m;
}

function formatDistance(meters, unit) {
  const km = meters / 1000;
  return (unit === "mi" ? km * KM_TO_MI : km).toFixed(2);
}

// Path along roads/paths from a to b, as [[lat, lng], ...].
async function routeBetween(a, b) {
  const url = `${ROUTER}${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=polyline`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Router HTTP ${res.status}`);
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes || !data.routes.length) throw new Error(data.code || "No route");
  // Keep the tapped points as the ends so consecutive legs join exactly.
  return [a, ...decodePolyline(data.routes[0].geometry), b];
}

function dotMarker(latlng, color) {
  return L.circleMarker(latlng, {
    radius: 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1,
  });
}

// ---------- Map setup ----------
const map = L.map("map", { zoomControl: true }).setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const routeLine = L.polyline([], { color: "#2563eb", weight: 5, opacity: 0.85 }).addTo(map);
const markers = L.layerGroup().addTo(map);

function drawRoute(points) {
  routeLine.setLatLngs(points);
  markers.clearLayers();
  if (points.length > 0) dotMarker(points[0], "#16a34a").bindTooltip("Start").addTo(markers);
  if (points.length > 1) dotMarker(points[points.length - 1], "#dc2626").bindTooltip("End").addTo(markers);
}

// ---------- Modes ----------
const params = new URLSearchParams(location.hash.slice(1));

if (params.get("r")) {
  startViewMode(params);
} else {
  startEditMode();
}

// Re-render if someone pastes a different link into the same tab.
window.addEventListener("hashchange", () => location.reload());

function startViewMode(params) {
  $("view-ui").hidden = false;
  let points;
  try {
    points = decodePolyline(params.get("r"));
  } catch {
    points = [];
  }
  if (points.length === 0) {
    $("v-note").textContent = "This link doesn't contain a valid route.";
    return;
  }
  const unit = params.get("u") === "mi" ? "mi" : "km";
  drawRoute(points);
  map.fitBounds(routeLine.getBounds(), { padding: [40, 40], maxZoom: 17 });
  $("v-distance").textContent = formatDistance(totalMeters(map, points), unit);
  $("v-unit").textContent = unit;
  $("v-note").textContent = params.get("n") || "";
  document.title = "My run today";
}

function startEditMode() {
  $("edit-ui").hidden = false;

  // waypoints: the points you tapped. legs[i] is the path from waypoints[i] to waypoints[i + 1].
  // Kept in one object so handlers.js can read and change it.
  const state = { waypoints: [], legs: [], unit: "mi", followRoads: true };
  const { waypoints, legs } = state;
  try { state.unit = localStorage.getItem("unit") === "km" ? "km" : "mi"; } catch {}
  try { state.followRoads = localStorage.getItem("followRoads") !== "0"; } catch {}
  $("follow").checked = state.followRoads;

  function fullPath() {
    if (legs.length === 0) return waypoints.slice();
    const path = legs[0].points.slice();
    for (let i = 1; i < legs.length; i++) path.push(...legs[i].points.slice(1));
    return path;
  }

  function addPoint(latlng) {
    const prev = waypoints[waypoints.length - 1];
    waypoints.push(latlng);
    if (prev) {
      const leg = { points: [prev, latlng], pending: state.followRoads, failed: false };
      legs.push(leg);
      if (state.followRoads) {
        routeBetween(prev, latlng)
          .then((path) => { leg.points = path; })
          .catch(() => { leg.failed = true; })
          .finally(() => {
            leg.pending = false;
            if (legs.includes(leg)) update(); // ignore results for legs that were undone
          });
      }
    }
    update();
  }

  // Center on the user's location if they allow it.
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 15),
      () => {},
      { timeout: 8000 }
    );
  }

  function update() {
    const path = fullPath();
    const pending = legs.some((l) => l.pending);
    drawRoute(path);
    $("distance").textContent = formatDistance(totalMeters(map, path), state.unit);
    $("unit").textContent = state.unit;
    $("undo").disabled = waypoints.length === 0;
    $("clear").disabled = waypoints.length === 0;
    $("loop").disabled = waypoints.length < 2;
    $("share").disabled = waypoints.length < 2 || pending;
    $("hint").textContent = waypoints.length === 0 ? "Tap the map to add points"
      : waypoints.length === 1 ? "Tap again to draw the route"
      : pending ? "Finding route…"
      : legs.some((l) => l.failed) ? "Couldn't find a path for part of it (straight line used)"
      : `${waypoints.length} points`;
    $("share-out").hidden = true;
  }

  function buildLink() {
    const p = new URLSearchParams();
    p.set("r", encodePolyline(fullPath()));
    const note = $("note").value.trim();
    if (note) p.set("n", note);
    p.set("u", state.unit);
    return `${location.origin}${location.pathname}#${p.toString()}`;
  }

  // All the click/input handlers live in handlers.js.
  attachEditHandlers({ state, addPoint, update, fullPath, buildLink });

  update();
}
