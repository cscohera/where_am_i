// Event handlers for edit mode (map taps, buttons, inputs).
// app.js calls attachEditHandlers(editor) once, passing in the shared state and helpers:
//   editor.state     { waypoints, legs, unit, followRoads }
//   editor.addPoint  add a tapped point (and route to it if Follow roads is on)
//   editor.update    redraw the route and refresh the panel
//   editor.fullPath  the whole route as [[lat, lng], ...]
//   editor.buildLink the share link for the current route

function attachEditHandlers(editor) {
  const { state, addPoint, update, fullPath, buildLink } = editor;
  const { waypoints, legs } = state;

  // Tap the map to add a point.
  map.on("click", (e) => addPoint([e.latlng.lat, e.latlng.lng]));

  $("undo").onclick = () => {
    waypoints.pop();
    if (legs.length > Math.max(0, waypoints.length - 1)) legs.pop();
    update();
  };

  $("clear").onclick = () => {
    waypoints.length = 0;
    legs.length = 0;
    update();
  };

  // Out and back: retrace every earlier point in reverse order to the start.
  $("loop").onclick = () => {
    const backToStart = waypoints.slice(0, -1).reverse();
    for (const returnPoint of backToStart) addPoint(returnPoint);
  };

  $("follow").onchange = () => {
    state.followRoads = $("follow").checked;
    try { localStorage.setItem("followRoads", state.followRoads ? "1" : "0"); } catch {}
  };

  $("unit").onclick = () => {
    state.unit = state.unit === "km" ? "mi" : "km";
    try { localStorage.setItem("unit", state.unit); } catch {}
    update();
  };

  $("note").oninput = () => { $("share-out").hidden = true; };

  $("share").onclick = async () => {
    const link = buildLink();
    const dist = `${formatDistance(totalMeters(map, fullPath()), state.unit)} ${state.unit}`;
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
}
