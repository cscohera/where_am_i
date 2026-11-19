# Where Am I Running

Draw a run on a map and send the link to someone so they can see your route and how far you're going.

No backend: the route is stored in the link itself (`#r=...`), so nothing is saved anywhere.

## Run locally

```sh
python3 -m http.server 8000
```

Open http://localhost:8000.

## Use it

1. Tap the map to add points. With **Follow roads & paths** on, each new point is joined along the actual streets and footpaths (via the free OSRM foot router at routing.openstreetmap.de). Turn it off to draw straight lines, e.g. across a park or a trail the router doesn't know about. The distance updates as you go.
2. **Undo**, **Clear**, or **Loop to start** to close a loop. Tap the unit to switch between km and mi.
3. Add a note if you like (e.g. "Leaving 6:30am").
4. **Share**: on a phone this opens the share sheet. Otherwise use Copy, Text, or Email.

Opening a shared link shows the route, the distance and the note.

## Files

- `index.html`: the page
- `style.css`: styles
- `app.js`: map, drawing, distance, routing, and encoding the route into the link (Leaflet + OpenStreetMap)
- `handlers.js`: edit-mode event handlers (map taps, Undo, Clear, Loop, Share, Copy, toggles)
