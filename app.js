// Where Am I Running — plan a route, share it as a link.
// The whole route lives in the URL hash: #r=<encoded polyline>&n=<note>&u=km|mi

const KM_TO_MI = 0.621371;
const DEFAULT_VIEW = { center: [39.8283, -98.5795], zoom: 4 }; // continental US

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

  const points = [];
  let unit = "mi";
  try { unit = localStorage.getItem("unit") === "km" ? "km" : "mi"; } catch {}

  // Center on the user's location if they allow it.
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 15),
      () => {},
      { timeout: 8000 }
    );
  }

  function update() {
    drawRoute(points);
    $("distance").textContent = formatDistance(totalMeters(map, points), unit);
    $("unit").textContent = unit;
    $("undo").disabled = points.length === 0;
    $("clear").disabled = points.length === 0;
    $("loop").disabled = points.length < 2;
    $("share").disabled = points.length < 2;
    $("hint").textContent = points.length === 0 ? "Tap the map to add points"
      : points.length === 1 ? "Tap again to draw the route" : `${points.length} points`;
    $("share-out").hidden = true;
  }

  map.on("click", (e) => {
    points.push([e.latlng.lat, e.latlng.lng]);
    update();
  });

  $("undo").onclick = () => { points.pop(); update(); };
  $("clear").onclick = () => { points.length = 0; update(); };
  $("loop").onclick = () => { points.push(points[0]); update(); };
  $("unit").onclick = () => {
    unit = unit === "km" ? "mi" : "km";
    try { localStorage.setItem("unit", unit); } catch {}
    update();
  };
  $("note").oninput = () => { $("share-out").hidden = true; };

  function buildLink() {
    const p = new URLSearchParams();
    p.set("r", encodePolyline(points));
    const note = $("note").value.trim();
    if (note) p.set("n", note);
    p.set("u", unit);
    return `${location.origin}${location.pathname}#${p.toString()}`;
  }

  $("share").onclick = async () => {
    const link = buildLink();
    const dist = `${formatDistance(totalMeters(map, points), unit)} ${unit}`;
    const message = `Here's where I'm running today (${dist}): ${link}`;

    $("share-link").value = link;
    $("sms").href = `sms:?&body=${encodeURIComponent(message)}`;
    $("email").href = `mailto:?subject=${encodeURIComponent("My run today")}&body=${encodeURIComponent(message)}`;
    $("share-status").textContent = "";
    $("share-out").hidden = false;

    // Native share sheet on phones (Messages, Mail, WhatsApp, ...).
    if (navigator.share) {
      try {
        await navigator.share({ title: "My run today", text: `Here's where I'm running today (${dist})`, url: link });
      } catch { /* user cancelled — fallbacks are visible */ }
    }
  };

  $("copy").onclick = async () => {
    const link = $("share-link").value;
    try {
      await navigator.clipboard.writeText(link);
      $("share-status").textContent = "Link copied!";
    } catch {
      $("share-link").select();
      $("share-status").textContent = "Press Ctrl/Cmd+C to copy.";
    }
  };

  update();
}
