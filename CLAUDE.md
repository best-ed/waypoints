# CLAUDE.md — waypoints

A web app for pinning memories on an interactive map.

---

## Stack Constraints

- Vanilla HTML, CSS, and JavaScript ES modules
- Leaflet 1.9.4 for mapping, loaded from CDN with SRI integrity hashes
- **No framework. No bundler. No runtime npm dependencies.**
- npm is used for dev tooling only (static server, test runner). `package.json` has no
  `dependencies` block and should not grow one.
- The browser loads the source files as written — what is in `src/` is what ships.

---

## Folder Structure

```
index.html        entry point, lives at the repo root
src/css/          stylesheets
src/js/           ES modules
src/js/data/      schema, normalization, validation, storage, the memory store
src/js/map/       everything that touches Leaflet
src/js/filters/   search matching and filter state, pure
src/js/journey/   chronological ordering, geometry and the playback machine, pure
src/js/geo/       Nominatim client, request scheduler and place parsers, pure
src/js/photos/    photo processing, the repository and its IndexedDB backend
src/js/ui/        everything that touches the DOM, plus selection state
tests/            node --test files, mirroring the src/js layout
.githooks/        git hooks (commit-msg attribution stripper)
```

Modules are grouped by feature inside `src/js/`, not by type. A module that only the map
uses lives under `map/`.

The boundaries matter for testing:

- `data/` is pure. No DOM, no Leaflet. Fully tested.
- `map/` may use the Leaflet global `L`. Not unit tested, verified in the browser.
- `ui/` may touch the DOM. Pure helpers that need testing live in their own module with
  no DOM access, like `ui/form-values.js`, so they can run under node.

`main.js` is the only place the three are wired together.

---

## Module Conventions

- Small, single-purpose modules — one job per file
- **Named exports only. No default exports.**
- Import with explicit `.js` extensions — the browser resolves the path literally
- No side effects at module top level except in `main.js`, which is the only boot entry
- Pure functions where practical; DOM access stays at the edges

---

## Naming and Comments

- Plain descriptive names. If a name needs a comment to explain it, rename it.
- No AI-style comments. Never write `// This function handles the processing of...`
- Comment only where the *why* isn't obvious from the code — a workaround, a spec
  requirement, a non-obvious ordering constraint
- No magic numbers. Use named constants, and keep shared ones in `src/js/config.js`
- No `console.log` left in committed code

---

## Storage Plan

Added in a later phase, documented here so the shape is agreed up front:

- **Metadata in `localStorage`** — waypoint id, coordinates, title, note, timestamp,
  and a reference to any photo. Small, synchronous, easy to serialize.
- **Photos in IndexedDB** — blobs keyed by the id referenced from the metadata record.
  `localStorage` is too small and string-only for image data.
- The two stores are written together and must stay consistent; deleting a waypoint
  deletes its photo blob.
- Export produces a single `waypoints-export*.json` file. Those are gitignored.

---

## Data Model

One memory:

| Field | Type | Rules |
|-------|------|-------|
| `id` | string | UUID, assigned by the store, never changes |
| `title` | string | required, 1-120 chars after trimming |
| `note` | string | optional, max 5000 chars |
| `date` | string | `YYYY-MM-DD`, required, must be a real calendar day |
| `lat` | number | -90 to 90, rounded to 6 decimal places |
| `lng` | number | -180 to 180, rounded to 6 decimal places |
| `placeName` | string | optional, max 200 chars |
| `tags` | string[] | trimmed, lowercased, deduped, blanks dropped, max 10, each max 30 chars |
| `photoIds` | string[] | defaults to `[]`, references IndexedDB blobs |
| `createdAt` | string | ISO timestamp, set on add, never changes |
| `updatedAt` | string | ISO timestamp, bumped on every update |

Input passes through `normalize.js` (trimming, tag cleanup, coordinate rounding) and then
`validate.js`. Invalid input throws a `ValidationError` carrying a per-field `errors`
object - the store never writes a half-valid record.

### Storage

Everything lives under one localStorage key, `waypoints:v1`:

```json
{ "version": 1, "memories": [] }
```

The `version` field exists so the shape can be migrated later without guessing.

- Corrupt JSON is copied to `waypoints:v1:corrupt-<ISO timestamp>` and the app starts with
  an empty collection. User data is never silently destroyed.
- A failed write from a full quota is rethrown as `StorageFullError` so the UI can say
  something real.
- Photos go to IndexedDB, keyed by the ids in `photoIds`. See **Photos** below.

### Store

`createMemoryStore({ storage, now, makeId, onListenerError })` takes its dependencies as
arguments so tests can pass fakes. `main.js` passes `localStorage`, `() => new Date()` and
`createIdFactory(window.crypto)`, which uses `crypto.randomUUID` where it exists and falls
back to a v4 uuid built from `getRandomValues` in insecure contexts such as a LAN address.

- `list()` returns memories sorted by date ascending, ties broken by `createdAt`
- `get(id)` returns a copy or `null`
- `add(input)` returns the stored record
- `update(id, changes)` merges a patch, bumps `updatedAt`, throws on an unknown id
- `remove(id)` returns whether the memory existed
- `restore(memory)` puts a whole record back, keeping its `id`, `createdAt` and
  `updatedAt`. Validates, throws on an unknown shape or a duplicate id, and notifies
- `subscribe(listener)` returns an unsubscribe function, fired after every successful
  mutation and never after a failed one

Every getter returns copies, so callers cannot mutate stored state by accident.

---

## Photos

Blobs live in IndexedDB; the memory record in `localStorage` only holds their ids.

- Database `waypoints`, version 1, object store `photos`, keyPath `id`
- Record: `{ id, blob, thumb, width, height, createdAt }` - real Blobs, never base64
- Max 6 per memory, enforced in `data/schema.js`, in validation, and in the picker
- Files over 25MB are rejected before decoding; anything that fails to decode (HEIC off
  Safari, a text file renamed to .jpg) reports per file and leaves the rest attached

Processing: `createImageBitmap` with `imageOrientation: 'from-image'` so EXIF rotation is
applied, longest edge down to 1600px and never up, JPEG at 0.82, plus a 320px thumbnail
at 0.7. `OffscreenCanvas` where available, a plain canvas otherwise. The canvas is filled
white first, because JPEG has no alpha and a transparent PNG would otherwise go black.

`photos/photo-repository.js` takes an injected backend. `indexeddb-backend.js` is the real
one and maps a `QuotaExceededError` to `StorageFullError`; tests use an in-memory fake.
`navigator.storage.persist()` is requested once, after the first successful write, and
only when `navigator.storage` exists - it is missing in insecure contexts.

### Lifecycle

Photos are processed on selection and held in memory. **Nothing is written until save.**

- **Add**: write the blobs, then `store.add` with their ids. If the memory fails to save,
  delete the blobs just written and report the error as usual.
- **Edit**: removals and additions apply only on save. Cancel writes nothing, so there is
  nothing to clean up.
- **Delete**: the blobs outlive the record for exactly as long as undo is on offer. The
  toast's `onExpire` fires when it times out or is replaced by a newer delete, and only
  then are they purged. Undo keeps them.
- **Startup**: `computeOrphans` compares stored ids against every memory's `photoIds` and
  deletes what nothing references. This is the backstop for a tab closed inside the undo
  window or a write interrupted between the blob and the memory.

### Object URLs

Every `URL.createObjectURL` belongs to a pool from `ui/object-urls.js`, and each pool has
exactly one place that revokes it:

| Pool | Revoked when |
|------|--------------|
| form picker | the dialog's `close` event, on every path out |
| popup strip | `popupclose`, and when the next popup opens |
| lightbox | the lightbox's `close` event |

Do not revoke an individual URL anywhere else. If a new surface shows blobs, give it its
own pool and one teardown.

---

## Selection Flow

The sidebar list and the map never call each other. Both talk to `ui/selection.js`, which
holds one id and notifies subscribers:

```
list click  -> selection.select(id) -> list marks it, then main.js flies the map
marker open -> selection.select(id) -> list marks it and scrolls it into view
marker close -> selection.clear()   -> list unmarks it
```

Three details keep this from looping or fighting itself:

- `select` on the already-selected id notifies nobody. A list click opens a popup, which
  selects the same id again; that second call has to be silent.
- `popupclose` only clears the selection if the closing popup still owns it. Switching
  markers closes the old popup *after* the new id is selected, so an unguarded clear
  would wipe the new selection.
- The fly-to lives on the list-click path, not in the selection subscriber. Clicking a
  marker directly should not move the map out from under the user.

`map/` and `ui/` still do not import each other. `main.js` wires them, and passes
`prefersReducedMotion()` into `focusMarker` rather than letting `map/` read the DOM.

### Focus

Focus is moved deliberately in three places, because the browser would otherwise drop it
on `<body>`:

- deleting: to the list item that slid into the deleted one's position, or the last item,
  or the empty state
- undoing: back to the restored item's list button
- rendering: a keyed update restores focus to the same button if moving nodes dropped it

---

## Place Search and Nominatim

We use the public Nominatim instance. It is free and run on donated capacity, and its
usage policy is a condition of access, not a guideline.

**Non-negotiable:**

- **No autocomplete and no search-as-you-type.** Requests fire on explicit submit only.
  There is deliberately no `input` listener in `map/place-search-control.js` that starts
  a request.
- **At least one second between requests.** Every call, search and reverse alike, goes
  through the single `geo/request-scheduler.js`. There is one queue and one clock, so a
  new call site cannot bypass the spacing by accident.
- **Cache for the session.** Searches by normalized query, reverse lookups by coordinates
  rounded to 4 decimals. A repeat costs no request.
- Superseded requests are aborted; anything still running is dropped when a newer one
  starts. 8 second timeout.
- `format=jsonv2`, search limit 5, `Accept-Language` from `navigator.language`.

Failures map to messages a person can act on: offline, timeout, rate limited (429),
server trouble (5xx), or a generic fallback. `PlaceSearchError.kind` carries which.

If this ever needs to scale beyond personal use, the answer is a different provider or a
self-hosted instance, not a shorter interval.

---

## Untrusted Remote Data

Everything Nominatim returns is untrusted, exactly like text the user typed.

- Place names, display names and addresses go into the DOM through `textContent` only
- Coordinates are parsed with `Number` and checked with `Number.isFinite` before use;
  `lat` and `lon` arrive as strings
- A result missing coordinates or a name is dropped rather than rendered half-formed
- `shortPlaceName` never returns the whole `display_name`, which is a long chain ending
  in the country

The parsers in `geo/parse-place.js` are pure and fixture-tested, so a response shape that
changes is caught there rather than in the UI.

---

## Filters

`filters/` is pure and has no DOM. `filter-state.js` holds what is being filtered on and
notifies on change; `apply-filters.js` turns that into a list.

Adding a dimension means adding one entry to `PREDICATES` with `isActive` and `matches`.
`applyFilters` and `isFilterActive` both read from that list, so nothing else changes.

### Semantics

| Dimension | Within | Notes |
|-----------|--------|-------|
| `query` | AND across terms | each term may match any field |
| `tags` | **ANY** | one selected tag on the memory is enough |
| `from` / `to` | inclusive both ends | either end optional |

Across dimensions it is always AND. Tags being ANY is what makes the chips read as a
union: selecting `trail` and `food` widens the result, it does not narrow it.

Matching folds diacritics through NFD, so "Nairobi" and "Nairóbi" find each other.

Dates are compared as `YYYY-MM-DD` strings. **Never build a `Date` to compare them** -
`new Date("2025-03-04")` is midnight UTC, which is the previous day for anyone behind UTC.
Where a number is genuinely needed, `toDayNumber` builds it from the parts through
`Date.UTC` and `fromDayNumber` reads it back in UTC.

### Faceted counts

`tagCounts(memories, filters)` counts over the memories matching every filter **except
the tag filter itself**, via `applyFilters(..., { except: 'tags' })`. A chip's number
therefore means "this many if you select me", not "this many of what is already showing".

`timelineBuckets` does the same with `{ except: 'dates' }`, so dragging a range handle
inwards does not shrink the histogram underneath it.

Selected tags are pruned in `renderAll` whenever the memories change: a tag nobody carries
has no chip, so it could never be switched off by hand.

### Announcing the timeline

Both range handles carry `aria-valuetext` with the formatted date, which is correct and which
Firefox honours. **Chromium ignores it on a native `<input type="range">`** and announces the raw
day number regardless - a bare input with `aria-valuetext="forty two"` still reads as "42", so
this is not something our markup can fix. The dates therefore also go into a visually hidden
`aria-live` region that both handles point at with `aria-describedby`, which does reach the
accessibility tree on every engine and re-announces as the handles move.

### URL

Filters live in the query string: `q`, `tags` (comma-joined), `from`, `to`. Empty values
are omitted, so an unfiltered view has no query string at all.

- Written with `history.replaceState`. Filtering is not navigation, and a history entry
  per keystroke would bury the page the user arrived from.
- Restored **before the first render**, so the unfiltered set never flashes on screen.
- `parseFilters` sanitizes: a date that is not a real calendar day is dropped, and an
  inverted range is swapped rather than silently matching nothing. A URL can be edited,
  shared or half-remembered, so nothing in it is trusted.

---

## Journey Mode

Connects the visible memories chronologically and plays them back. `journey/` is pure - no DOM,
no Leaflet - so the ordering, the geometry and the state machine are all unit tested.

- `journeyOrder` sorts by date then `createdAt`, ascending: the opposite of the sidebar, which
  reads newest first. Memories without usable coordinates are dropped.
- `journeySegments` pairs consecutive stops and **drops a pair pinned at the same spot**. A
  zero-length polyline renders as a stray dot and would still collect a chevron. Segment indices
  stay those of the ordered list, so a dropped segment never renumbers the steps.
- Distance is haversine against the mean Earth radius, within about 0.3% of the geodesic, which
  is well inside what a summary line needs.

### Drawing

Anything over 300km is interpolated along the great circle, one point per 200km up to a cap of
64. Interpolating lat and lng separately would draw a straight line in the projection, which over
thousands of kilometres is visibly not the path anything takes.

Longitudes are then **unwrapped**: each point is shifted by whole turns until it is within 180
degrees of the one before. Leaflet draws exactly the longitudes it is given, so a path crossing
the antimeridian continues past it - Honolulu to Nairobi ends at -323, not -157. Without this it
is drawn the long way back across Asia and Africa.

One polyline per segment, so playback can restyle the part already travelled without redrawing
the rest. Colours and widths are tokens; Leaflet writes stroke as a presentation attribute, which
CSS overrides.

Direction chevrons sit at the midpoint of each drawn path, rotated by the angle between
**projected screen points** rather than a geographic bearing - Mercator stretches north-south as
latitude rises, so a true bearing would sit visibly off the line. `latLngToLayerPoint` rounds to
whole pixels, so a short bracket can collapse onto one pixel when zoomed out; the fallback widens
to the segment's own endpoints, and the angles are recomputed on `zoomend`. Chevrons are
`aria-hidden`, non-interactive and out of the tab order: the order is already carried by the
numbered pins and the progress readout.

Note when verifying by hand that Leaflet simplifies a polyline at low zoom and clips it to the
padded viewport, so a drawn path is not always the full point list it was given.

### Playback

A state machine over `idle`, `playing`, `paused` and `finished`, holding an index, with
`setTimeout` and `clearTimeout` injected so tests drive the 3500ms dwell with a fake clock.

`prev` at the first stop and `next` at the last are **silent** no-ops - no state change and no
notification, so a held arrow key cannot spam the live region. Reaching the last stop while
playing ends in `finished`, and playing again from there restarts at 0.

**No timer outlives the state that started it**, and this is structural rather than remembered:
every transition goes through one `moveTo`, which clears any pending dwell before doing anything
else, and the single `setTimeout` call site is reached only when the new status is `playing`. A
test fuzzes 400 orderings of the controls and asserts at most one timer is ever outstanding.
Exiting journey mode calls `reset`, which is one such transition.

Each step selects the memory - so the sidebar follows - then flies to it and opens its popup.
Selecting *before* opening is what stops the outgoing popup's close from clearing the incoming
selection, the same ordering the selection flow above depends on.

Playback yields to the user: a map `dragstart`, a click on a different marker or list item, or
opening the edit dialog all pause it. A filter change rebuilds the journey and resets to idle,
since the old index may not even be in the new one. Escape exits, from a **capture-phase**
listener: placement and move mode attach their own Escape handlers to `document` while active, and
this one needs the first look so it can stand aside, rather than also exiting after one of them
has already cancelled itself.

The toggle and the step buttons use `aria-disabled`, not the `disabled` attribute. A disabled
button leaves the tab order, which would put the explanation of why it is unavailable out of
reach, and would drop focus when stepping to the last stop disables the button just pressed.

---

## Rendering User Text

**Non-negotiable. User-supplied text is never inserted as HTML.**

- Build content with `document.createElement` and `textContent`
- No `innerHTML`, no `insertAdjacentHTML`, no HTML string templates containing memory
  fields
- Leaflet popups are given an `HTMLElement`, never a string
- Preserve a note's line breaks with `white-space: pre-wrap` in CSS, never by injecting
  `<br>`
- There are no markup strings left in `src/`. `map/pin-icon.js` builds its pin with
  `createElementNS` and hands `L.divIcon` an `Element`, which Leaflet 1.9 accepts, so even
  a journey step number goes in through `textContent`.

A memory titled `<img src=x onerror=alert(1)>` must render as those literal characters.

---

## Hiding Things

`[hidden]` is set to `display: none !important` in `base.css`. The user agent's own `[hidden]`
rule has the same specificity as a class, so any component rule setting `display` beats it and
the element stays on screen while marked hidden. `.date-range` and `.journey-controls` are both
flex containers toggled by the attribute, and both were visible until this was added.

Use `hidden` for something that comes and goes, and `.visually-hidden` for something that should
reach a screen reader but not the screen.

---

## Undo Deletion

Deleting is immediate, not a confirmation dialog:

1. Read the full record with `store.get(id)` **before** removing it
2. `store.remove(id)`
3. Show a toast naming the memory, with an Undo button, auto-dismissing after 6 seconds
4. Undo calls `store.restore(record)`, which brings the memory back with the same id and
   timestamps - not a copy

The captured record is what makes undo honest. A new toast replaces the one before it and
the earlier deletion simply stands; there is no undo stack. The toast region is
`aria-live="polite"` so the deletion is announced.

---

## Commit Rules

**Non-negotiable:**

- One logical change per commit. Conventional Commits format (feat, fix, chore, docs,
  style, refactor, test).
- NEVER add a Co-Authored-By trailer, a "Generated with Claude Code" footer, or any AI
  attribution to commit messages. Plain subject line, optional short body, nothing else.
- Stage only the files belonging to that change. Commit as you go, don't batch at the end.
- Do not push until I say so.

Two hooks in `.githooks/` enforce this mechanically, though the rules stand on their own. Run
`git config core.hooksPath .githooks` after cloning, or neither of them runs.

- `commit-msg` strips any attribution trailer.
- `pre-commit` runs the full suite and blocks the commit if anything fails. It calls `node`
  directly rather than going through npm, which mangles the quoted glob under Git for Windows
  sh. It tests the **working tree, not the staged snapshot**: catching a red suite is worth far
  more than the stash dance an exact staged test would need, and a stash interrupted mid-commit
  loses work.

Do not reach for `--no-verify`.
