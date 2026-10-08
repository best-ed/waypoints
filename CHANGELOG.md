# Changelog

## Unreleased

### The map in dark mode

- **The map is dimmed in dark mode.** The tile colours are turned over so the map sits inside
  the dark interface instead of glaring out of it. Pins, photos, popups and the journey line
  are untouched, and **Settings -> Dim the map in dark mode** turns it off. It is off entirely
  under forced colours, where the palette has already been decided.
- The map popup took its surface from Leaflet rather than from the theme, so in dark mode it
  was near-white text on a white panel: the title, date, place and note were all unreadable.

### Design

- A warm palette: paper in light, charcoal in dark, with the rust accent unchanged.
- Fraunces, self-hosted and subset, for headings and the titles of memories.
- A type scale, a spacing scale, three elevation levels and motion tokens, with reduced motion
  handled once rather than per rule.
- An icon set drawn for the app, on every control that has room for one.
- Buttons, form controls and chips as primitives, so a filter chip and a tag in a popup no
  longer look identical, and a photo's Remove button no longer covers the photo.
- Boolean settings are switches.
- Dialog actions stay on screen when the form is taller than the window.

## 1.0.0 (2026-10-07)

The first release.

### Memories

- Pin a memory anywhere on the map, with a title, a date, a note, tags and up to six photos.
- Edit, move and delete, with a six second undo that restores the original record rather than
  a copy of it.
- Photos are resized to 1600px, re-encoded as JPEG with EXIF rotation applied, given a
  thumbnail, and stored on the device. Up to six per memory, 25MB per file before processing.

### Finding things

- Search by text, filter by tag, and filter by date range. Tags are a union, so picking a
  second tag widens the result.
- Tag counts and the timeline histogram are faceted: each one counts over everything except
  its own filter, so a chip's number means "this many if you pick me".
- A timeline under the filters doubles as a range slider.
- Every filter is kept in the URL, so a filtered view can be bookmarked or shared.

### The map

- Markers cluster as you zoom out and are reachable by keyboard, including clusters.
- Place search by name, with the result offering to put a memory there.
- Journey mode joins the visible memories in date order, draws the route along great circles,
  and plays it back a stop at a time.

### Offline and installing

- A service worker precaches everything the app needs to boot and keeps the map tiles you have
  already seen, up to 300 of them.
- Installable on Chromium-based browsers and from Safari's share sheet.
- An update is offered as a toast and only ever applied when you ask for it.

### Your data

- Everything stays in the browser on your own device. No account, no server, no telemetry.
- Export and import one JSON file, with or without the photos inside it. Import merges by
  modification time and never replaces your collection.
- Place name suggestions can be turned off, after which placing a pin sends nothing anywhere.

### Appearance and access

- Light and dark, following the system or set explicitly, and a forced-colours mode.
- Keyboard and screen reader support throughout, checked with axe-core in the end-to-end
  suite.
- A layout that works down to 375px, with the map and the list as separate panes.

### Known limits

- **One basemap.** CARTO's Voyager and Dark Matter were dropped before release: they now need
  an API key and serve a watermark without one. There is no keyless dark basemap, so dark mode
  draws a light map.
- **Photos live only on the device they were added on.** They are in an export by default,
  so moving a collection moves the photos with it; the Include photos option leaves them out
  for a far smaller file, keeping the references so an import can match them to photos
  already there.
- **Storage is per origin.** Memories made on `localhost` are not visible on the deployed site;
  move them with an export and an import.
