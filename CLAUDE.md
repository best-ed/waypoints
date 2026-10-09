# CLAUDE.md — waypoints

A web app for pinning memories on an interactive map.

---

## Stack Constraints

- Vanilla HTML, CSS, and JavaScript ES modules. Two files are not modules, each for a reason
  the platform imposes: `src/js/theme-boot.js` has to run before the first paint and so cannot
  be deferred, and `sw.js` reads its file list with `importScripts`, which cannot load one
- Leaflet 1.9.4 for mapping, loaded from CDN with SRI integrity hashes
- Leaflet.markercluster 1.5.3, same arrangement. Only its structural stylesheet
  (`MarkerCluster.css`) is loaded: `MarkerCluster.Default.css` skins the `.marker-cluster`
  classes the plugin's own icon function emits, and ours emits none of them
- **No framework. No bundler. No runtime npm dependencies.**
- npm is used for dev tooling only (static server, test runners, Playwright). `package.json`
  has no `dependencies` block and should not grow one.
- **devDependencies are pinned to exact versions**, no ranges, so CI and a laptop run the same
  browsers and the same assertions. A new one has to earn its place: it may not ship to the
  browser, and it may not become something the app needs to build.
- The browser loads the source files as written — what is in `src/` is what ships.

---

## Folder Structure

```
index.html        entry point, lives at the repo root
sw.js             the service worker, at the root so its scope is the whole app
manifest.webmanifest  the web app manifest
precache-manifest.js  generated, committed; the file list the worker caches
icons/            the app icon as svg, and the rendered png sizes
scripts/          node tooling, not shipped to the browser
e2e/              Playwright specs and their fixtures
vercel.json       the deployment's cache and security headers
.vercelignore     what the deployment leaves behind
src/css/          stylesheets
src/fonts/        the display face and its licence
src/js/           ES modules
src/js/data/      schema, normalization, validation, storage, the memory store
src/js/map/       everything that touches Leaflet
src/js/filters/   search matching and filter state, pure
src/js/journey/   chronological ordering, geometry and the playback machine, pure
src/js/dev/       sandbox mode and the seed generator, pure
src/js/io/        the export format and the import parser, pure except download.js
src/js/theme-boot.js  the one classic script, run in <head> before the stylesheets
src/js/sw-register.js the registration gate and the update flow, pure
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
- **No em dashes in anything a reader sees.** Not in UI copy, not in a label, a hint, a toast
  or an error, and not in the README, the changelog or `docs/`. Rewrite rather than swapping
  in a hyphen: a colon where what follows explains what came before, a comma or a full stop
  where the clauses stand alone, parentheses for an aside. En dashes are fine in a range.
  `tests/meta/em-dash.test.js` walks the precache manifest plus the documents and fails on
  one, so new copy cannot reintroduce them. This file and `tests/` are exempt.

---

## Storage Plan

Added in a later phase, documented here so the shape is agreed up front:

- **Metadata in `localStorage`** — waypoint id, coordinates, title, note, timestamp,
  and a reference to any photo. Small, synchronous, easy to serialize.
- **Photos in IndexedDB** — blobs keyed by the id referenced from the metadata record.
  `localStorage` is too small and string-only for image data.
- The two stores are written together and must stay consistent; deleting a waypoint
  deletes its photo blob.
- Export produces a single `waypoints-export*.json` file. Those are gitignored. The format is
  specified in `docs/export-format.md`; see **Export and Import** below for the rules.

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

## Sandbox Mode

`?sandbox` in the URL points every piece of storage somewhere else, so a thousand seeded
memories can never land on top of real ones.

| | real | sandbox |
|---|---|---|
| memories | `waypoints:v1` | `waypoints:sandbox:v1` |
| corrupt backups | `waypoints:v1:corrupt-<ISO>` | `waypoints:sandbox:v1:corrupt-<ISO>` |
| photos | database `waypoints` | database `waypoints-sandbox` |

`dev/sandbox.js` resolves all three names **once, at boot, before anything is read**. There is
deliberately no code path that can read one mode's memories while writing the other's photos.
A visible banner says which mode is on, and the filter URL sync puts `?sandbox` back on every
rewrite, since otherwise one keystroke would drop the session onto the real data. `?sw` rides
along the same way - `buildSearch` is the one place that knows how to put a bare flag back.

### Seeding

`window.waypoints` gains `seed(n)` and `clearSandbox()` **only** on a development host **and
only** in sandbox mode. Off a dev host there is no console API at all; on one without
`?sandbox` there is the store and nothing else, so `seed` cannot be aimed at real memories by
leaving a flag off the URL. `dev/dev-api.js` holds that guard on its own so it can be tested.

`seed(n)` writes the envelope and reloads rather than calling `store.add` n times: a thousand
validations, writes and notifications cost far more than the reload. The generator takes its
randomness as an argument, so the tests are reproducible. It produces about 70% around one
city and the rest scattered, because a uniform world scatter would make clustering look like it
works while hiding the dense case that is actually hard.

---

## Settings

`waypoints:settings`, its own key, outside the memories envelope and with a sandbox variant
following the same naming scheme. Same reasoning as the basemap preference: settings are not
user data, they should not travel with an export, and a corrupt memories envelope must not take
them down with it.

Junk, a half-written value or blocked storage all fall back to the defaults, field by field with
a typed fallback, so one bad value can only ever cost that one setting. A setting that cannot be
written is still applied for the session: only remembering it is lost.

`suggestPlaceNames`, default on. When it is off, placing a pin sends **nothing** to Nominatim.
The check is before the request is built, not after it returns, and the "finding place" hint is
cleared so the form does not claim to be looking something up.

---

## Photos

Blobs live in IndexedDB; the memory record in `localStorage` only holds their ids.

- Database `waypoints`, version 1, object store `photos`, keyPath `id`
- Stored record: `{ id, bytes, type, thumbBytes, thumbType, width, height, createdAt }`,
  where both byte fields are `ArrayBuffer`s. Never base64
- Everything above the backend still sees `{ id, blob, thumb, width, height, createdAt }`
  with real Blobs. See **Photo bytes** below
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

### Photo bytes

**WebKit's IndexedDB cannot store a `Blob`.** The transaction errors outright. Probed on that
engine directly: a Blob fails, an `ArrayBuffer`, a `Uint8Array` and a string all succeed, and
Chromium takes any of them. Since that is the backend Safari ships, a photo added there was
simply lost.

So photos are stored as bytes. `photos/photo-serialize.js` holds the two pure functions and
`indexeddb-backend.js` is the **only** place that calls them: `put` serializes, `get`
rebuilds the Blobs. The repository, the picker, the popup strip, the lightbox, export and
import are all unchanged and still deal in Blobs.

Two things this depends on:

- **`blob.arrayBuffer()` is awaited before the transaction is opened, never inside it.** It is
  not an IndexedDB request, so awaiting it with a transaction open lets the microtask queue
  drain and the transaction auto-commits before the write is ever issued.
- **Reads accept both shapes.** A record holding Blobs is handed straight back, so photos
  written before this keep working with no migration and no database version bump. `bytes`
  wins if a record somehow carries both.

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

## The Sidebar

The sidebar is for finding memories. It is not the thing anyone came to look at, and in 1.0
it behaved as though it were: at 1280 the first memory's title sat 618px down an 860px
viewport, with three cards visible under a heading, a search box, thirteen tag chips, two date
fields, a histogram, a count and a journey control. **Sixty-eight percent of it was controls
before a single memory.** It is 341px now, and eight cards.

The order, top to bottom, and why:

1. **Search.** Always visible. It is the one control people reach for without being prompted.
2. **Active filter chips.** One per tag, one for the date range, each removing itself, plus
   Clear all when there is more than one. **Above the disclosure on purpose**: what is
   narrowing the list has to be visible whether or not the panel is open, or a collapsed panel
   hides the reason the list is short.
3. **The Filters disclosure**, with a badge counting active dimensions. Tag chips, date inputs
   and the timeline live inside. Closed by default, open when the URL arrived carrying
   filters, and the state is remembered per viewer under its own key.
4. **The count**, which says how many and nothing else.
5. **Journey**, hidden entirely below two memories in the library.

**There is exactly one clear-filters control.** There were two - a "Reset filters" link in the
header and a "Clear filters" button in the empty state - visible at the same time, doing the
same thing, with different labels and different shapes. The no-results state uses the same
label and shape as the chips row, because it is the same action. The search box had the same
problem in miniature, with `type="search"` drawing its own cross beside ours; the native one is
suppressed, since ours can be named and reached by keyboard.

`filters/describe-filters.js` is pure and turns a filter state into chip descriptors. **Each
descriptor carries the patch that removes it** rather than a kind the caller switches on, so
nothing else has to know that a date chip clears both ends while a tag chip clears only itself.

### The list

Grouped by year, newest first, with a sticky heading. The scroller is a `div` holding an `h3`
and a `ul` per year, so **a card is an `li` inside a list**. The first attempt made the
headings `li`s in a flat list, which is invalid inside a `div` and quietly broke every
`.memory-list li` selector in the suite by counting headings as memories.

A card is a cover thumbnail or a drawn placeholder, the title in the display face, and one
muted line of date, place and tag count, cut rather than wrapped so every card is the same
height whatever someone's place name is. It is still **one button named by the title alone**;
the meta line is reached through `aria-describedby`, because it is description and not name.

Headings, lists and cards all go through the same keyed walk, so a group that stays put is
never torn out from under anything with focus inside it. Selecting a card scrolls it clear of
the sticky heading: `block: nearest` alone puts it flush with the top of the scroller, which is
exactly where the heading is.

### Thumbnails, and the one owner rule

Every other surface has a pool with one place that revokes it. The list cannot work that way,
because rows come and go and there is no moment when they are all finished with, so
`ui/thumbnail-owner.js` owns them instead and is **bounded in two directions**:

- **At most four reads in flight.** Flinging a thousand rows would otherwise queue a thousand
  IndexedDB reads, and the rows you actually stopped on would be behind all of them.
- **At most forty-eight URLs held**, least recently asked for evicted first. A URL that is
  never revoked keeps its blob alive.

A read whose row left before it landed **never becomes a URL at all**, which is the case that
leaks: created with nothing left to revoke it. Rows ask when they enter an `IntersectionObserver`
with about a screen of margin, and give the URL back when they leave.

Measured on 1000 seeded memories with a distinct photo each: a fast scroll of the whole 94,000
pixels peaked at **17 live URLs** and settled to 10. The cap is never reached, because
releasing on exit does the work. Measuring this with a handful of shared photo ids proves
nothing - the owner keys on the photo id, so twenty ids can never produce more than twenty URLs
whatever the scroll does.

### The first run

An empty library hides the search, the filters, the chips, the timeline and the journey, and
shows a welcome instead: a heading, one sentence, a primary "Add your first memory" that starts
placement, and "Import a backup" that opens Settings at the import control.

**This is about the library being empty, never about a filter excluding everything.** Swapping
the search box for a welcome the moment someone mistypes would be a good way to lose what they
were looking for. At 375 the app opens on the List pane when there is nothing saved, because
the welcome is in that pane and the map has nothing on it; at boot only, so it never overrides
a choice made during the session.

Journey is not shown at all below two memories in the library, rather than shown unavailable
with a reason. **A reason only helps once the thing is reachable.** Above two it keeps the
existing disabled-with-reason behaviour when a filter leaves fewer than two in view.

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

## Clustering

Memory markers live in a `MarkerClusterGroup`: `maxClusterRadius` 50, `chunkedLoading` on, and
`disableClusteringAtZoom` 17, past which a cluster would hide the very pin someone zoomed in to
find. The id diffing in `markers-layer.js` is unchanged; it adds to and removes from the group.

**Always through the group, never `marker.remove()`** - the latter takes a marker off the map
without telling the group, which keeps counting it in a cluster.

**Batch.** Each separate `addLayer` re-evaluates the cluster hierarchy, and `chunkedLoading`
only ever applies to the bulk path. Over 1000 markers, measured: 45ms of `addLayer` calls
against 11ms for one `addLayers`, and 20ms against 6ms for the removals. `sync` collects both
batches and makes one call each.

A clustered marker **has no element**, so two things follow. The accessible name lives inside
the icon as a hidden span rather than being set on the marker afterwards, or it would be lost
at creation and nothing would put it back when the marker finally rendered. And `openPopup`
would silently do nothing, so both popup-opening paths go through `reveal` in
`focus-marker.js`, which hands over to `zoomToShowLayer`.

`zoomToShowLayer` also covers a marker pruned by `removeOutsideVisibleBounds` by panning to it.
Do not gate it on `getVisibleParent`: that returns null whenever nothing in the chain is
currently rendered, which is exactly the case it exists to handle.

### Cluster icons

`iconCreateFunction` has to return an `L.Icon`, and the only one taking arbitrary content is
`DivIcon`, whose `html` option is documented as a string. Leaflet 1.9 also accepts an `Element`
and appends it as-is, which is what `cluster-icon.js` relies on: the count goes in through
`textContent`, exactly like a journey step number. A fresh element per call, since divIcon
appends the node it is handed.

Leaflet gives a keyboard marker `role="button"` and `tabindex="0"` but sets no name, and a
button with no name attribute takes one from its contents - so a hidden span carries
"12 memories, press Enter to zoom in" while the numeral itself is `aria-hidden`.

Leaflet forwards key events to a focused marker, but **nothing in the plugin listens**: its
`_onKeyPress` belongs to `bindPopup`, and a cluster has no popup bound. Out of the box neither
Enter nor Space does anything. `enableClusterKeyboard` handles both, delegated from the map
container because cluster elements are thrown away on every zoom, and dispatches a synthetic
click so a cluster that cannot split any further spiderfies instead, exactly as a mouse would.

### Reduced motion

What the plugin allows: the `animate` option, read once when the group is built, which stops
the split and merge and spiderfy animations. Its CSS transitions live in its own stylesheet
with no reduced-motion guard, so `map.css` turns them off.

What it does not allow: `zoomToShowLayer` calls `panTo` and `fitBounds` with no options of its
own. `fitBounds` is covered by setting `zoomAnimation` and `fadeAnimation` on the map itself,
which is why `createMap` takes `reducedMotion`. The `panTo` **is not controllable** - pan
animation is a per-call option in Leaflet and the plugin passes none. That one still animates.

Journey and move modes move the markers onto a plain layer group and back, because a step
cannot be numbered or dragged while it is folded into a cluster. `move-mode` reports `onEnd` so
an Escape revert restores clustering too, and journey mode owns the unclustered state while it
is on, so a move ending inside it must not switch clustering back on underneath it.

When verifying by hand: Leaflet simplifies a polyline at low zoom and clips it to the padded
viewport, so a drawn path is not always the point list it was given, and an off-screen chevron
can look detached from a line that is no longer drawn there.

---

## Basemaps

OpenStreetMap standard, and only that, configured in `config.js`. Attribution is a condition of
use, not decoration; Leaflet's attribution control takes each credit on and off with its layer,
so there is nothing to manage by hand.

**CARTO was here until release day.** Voyager was the default and Dark Matter was the dark
counterpart, and on 7 October 2026 every tile came back as a 2049 byte "API KEY REQUIRED"
watermark - verified against the provider directly, with and without a referer, while
OpenStreetMap returned a real 45KB tile. Shipping it would have meant shipping a map nobody
could read.

Putting it back is a key away: the two urls go into `BASEMAPS` with the key in the query
string, the host goes into the CSP in `vercel.json`, and the host goes into `TILE_HOSTS` in
`sw.js`. A test derives the hosts the policy must allow from `BASEMAPS`, so a basemap the
policy would block fails the suite rather than the deployment.

**There is no keyless dark basemap**, so dark mode draws a light map. That is the honest trade
rather than a broken one. The `darkUrl` machinery in `basemap-control.js` is left in place and
is simply unused: it is one `if`, and it is what any replacement provider would need.

The chooser hides itself when there is fewer than two basemaps to choose between - a control
with nothing to choose is noise over the map - while the layer is added either way.

`create-map.js` deliberately adds **no** tile layer. The basemap control owns it, so exactly one
place adds and removes one. The choice persists under `waypoints:basemap`, its own key, because
a display preference is not user data, should not travel with an export, and must not go down
with a corrupt memories envelope. An unknown or hand-edited value falls back to the default
rather than leaving a blank map.

**Tile layers set `crossOrigin: 'anonymous'`.** See **Offline and Installing**: without it every
tile response is opaque and the worker cannot tell a tile from an error page.

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

## Performance

Budgets, with a thousand memories seeded into the sandbox: under 50ms for a keystroke or a
chip toggle, under 300ms for the initial render and for entering journey mode, tiles excluded.

Measure before changing anything, and measure the **worst** case, not a comfortable one.
Typing another character into an existing query barely changes the result set; clearing a query
that matched nothing brings every row and every marker back, and that is the keystroke that
decides whether typing feels instant. The first is 25ms, the second was 121ms.

Two things mattered, both in the map layer, and both found by measuring rather than guessing:

- **Batch the cluster group's additions and removals.** See **Clustering** above.
- **Build popup content lazily.** `bindPopup` takes a function, which Leaflet calls on open. At
  most one popup is ever open, so building a thousand of them up front was pure waste: 14.5ms
  of the 28.8ms spent building 1000 markers, and more again in allocation. The function reads
  `entry.memory`, so an edit needs no rebinding; an already-open popup is told to `update()`.

Together the worst keystroke went from 121ms to 45ms.

**What was not worth doing:** computing the filtered view once in a derived-view module. The
whole filter computation over 1000 memories - `applyFilters`, `tagCounts`, `allTags`,
`timelineBuckets`, `distinctDateCount` - measures **0.37ms**. Sharing it would have saved a
third of a millisecond out of 121, while adding a layer of indirection between the filters and
everything that reads them. The cost was never in the filtering; it was in the DOM and in the
cluster plugin.

Entering journey mode is the heaviest thing here, at around 155ms for 1000 stops, because it
draws 999 polylines with up to 64 interpolated points each plus 999 chevrons. It is inside
budget at a thousand and over it by about 2000, which is the next thing to look at if the
numbers ever matter again.

---

## Export and Import

The file format is specified in `docs/export-format.md`. What matters here is the posture.

### Export

`io/export-format.js` is pure and builds the envelope from a named field list, so nothing that
has been hung off a record in memory can travel into the file. Photos are encoded separately,
because turning a Blob into base64 is asynchronous and the envelope shape has to stay testable
without one.

Base64 goes through `btoa`/`atob`, which exist in node and the browser alike, chunked at 8k
because `String.fromCharCode` is applied with the chunk as arguments and a few hundred thousand
of those overflow the call stack. A photo blob is comfortably that big.

`io/download.js` is the only browser-facing part: one object URL, created and revoked in the
same function, revoked a task later because revoking immediately cancels the download in some
browsers.

With photos left out, `photos` is empty **but the photoIds stay on the memories**, so an import
can reconcile them against blobs the owner may still have here.

### Import

**The file is hostile.** It can be hand-edited, truncated, or written by something else.

- Over 250MB is refused before being read. Non-JSON, the wrong `format` and an unsupported
  `version` each get their own message; a *newer* version says to update rather than implying
  the file is broken.
- **Every record is rebuilt field by field, by name.** Nothing is spread, `Object.assign`-ed or
  otherwise copied wholesale from the parsed object, so a `__proto__` or `constructor` key is
  never read and never written. A test proves it.
- A mixed-type array is rejected whole rather than filtered, so the problem is reported instead
  of silently changing what the file said. This also keeps `validateMemory` safe: it reads
  `tag.length` with no type check, which throws outright on a null tag.
- An invalid record is skipped and reported with a reason, never fatal. A repeated id keeps the
  first *usable* entry, so a broken first copy cannot shadow a good second one.
- Photos are checked for id, type, clean base64 and decoded size, and then **decoded with
  `createImageBitmap`**, because only an actual decode tells an image from bytes claiming to be
  one. Anything over the pipeline's limits, or missing a usable thumbnail, goes back through the
  ordinary pipeline keeping its id.

Nothing is written until the preview is confirmed. Then photos first, so a memory never
references a blob that is not there yet, with progress in an `aria-live` region. If the merge
then fails, the photos just written are deleted again, so a failed import leaves nothing behind
either way. `writeImportedPhotos` rolls back its own failures the same way, and a rollback that
cannot finish never replaces the original error with its own.

### store.merge

`merge(records)` validates everything before applying anything, so one bad record cannot leave
half a file merged. The importer has already filtered, which makes this a backstop rather than
the first line of defence.

The rule is by `updatedAt`: an unknown id is added, a known one is replaced only if the incoming
record is newer, anything else is left exactly as it is. **There is no mode that replaces the
collection wholesale.** Records are normalized on the way in, as `restore` does, so a
hand-edited file cannot put an untrimmed title or an unrounded coordinate into the store.

One envelope write and one notification whatever the size of the set. A merge that changes
nothing writes nothing and notifies nobody, since a re-render would be pure churn.

---

## Design System

The direction is a field journal: warm, calm, personal. Restraint over decoration - no
gradients, no glass, and a shadow only where something is genuinely above something else.

Everything below lives in `src/css/tokens.css` and `src/css/primitives.css`. A component
stylesheet should be layout and nothing else; the moment it states a colour, a size or a
duration of its own, there are two answers to the same question.

### The scales

- **Type.** A modular scale at 1.2 anchored at 1rem, from `--text-2xs` to `--text-xl`, with
  line heights that tighten as the type gets bigger and named weights. No `font-size` or
  `font-weight` literal appears anywhere else.
- **Display face.** Fraunces 600, self-hosted and subset to Latin, on `--font-display`. It is
  for **headings and the titles of memories only** - the app title, dialog and section
  headings, a memory's title in the list and in its popup, and the journey summary. Body copy,
  controls, hints, dates and anything numeric stay on the system stack. A serif at 13px in a
  button costs legibility and buys nothing.
- **Space.** A 4px scale, `--space-0` to `--space-8`. The only literals left are below the
  base step: two visually-hidden clips, a segmented control's collapsed border, the hairline
  between histogram bars, a 1px cap on a 3px bar, and the device safe-area insets.
- **Radius.** Three steps and a pill: `sm` for something small and boxy, `md` for panels and
  inputs, `lg` for a surface that floats.

### Elevation

Three levels, and each means something: `--elevation-1` floats over the map and stays there,
`--elevation-2` has taken over, `--elevation-3` arrives and then leaves.

**In the dark the shadow is not the mechanism.** Black on near-black has no contrast to spend,
which is why 1.0 made the shadows heavier and the dialogs still read flat. Height there comes
from the surface getting lighter as it rises - `--color-surface`, then `--color-surface-raised`,
then `--color-surface-overlay` - and the shadow only softens the edge.

### Motion

`--duration-fast` for a control answering a pointer, `--duration-base` for something changing
size or position, `--duration-slow` for a surface arriving, plus two easing curves.

**Reduced motion is handled once**, by taking the three duration tokens to zero on `:root`. No
individual rule remembers, and a rule written later is covered the day it is written. A zero
duration still applies the end state, which is the point. Two overrides remain and neither is
about duration: the cluster's hover scale is a state change that would still snap, and the
plugin's own transitions are declared in its stylesheet with its own numbers.

### Icons

`src/js/ui/icons.js`. Twenty-one icons on a 24px grid, strokes only at 2px with round caps and
joins, `currentColor`, no fills and no colour of their own. Built with `createElementNS` from
shape data, so there is no markup template for a value to be interpolated into.

**An icon is decoration.** It is `aria-hidden`, and the accessible name stays on the control.
That is what lets the header show an icon and a label where there is room and the icon alone
where there is not, without the button's name changing. The markup names the icon it wants
through `data-icon` and `applyIcons` turns that into a node once, at boot.

A button whose label changes under it writes to its `.button-label` span. Setting `textContent`
on the button itself would take the icon with it.

Draw a new one against the set at 40, 24, 18 and 14px before keeping it. Two of these were
redrawn after doing that: the settings faders ran together into a smudge below 20px laid out
horizontally, and the offline cloud needed one bump rather than two.

### Primitives

- **Buttons.** `primary`, `secondary` (what a plain `.button` is), `ghost` and `icon-only`, in
  two sizes, with one answer each for hover, active, focus-visible, `aria-disabled`, pressed
  and busy. `.button` is `inline-flex`, which is also what lets a `<label class="button">`
  have a line box its padding can affect.
- **Form controls.** One height, one border, one focus treatment for text, textarea, select,
  date and checkbox. The select keeps its native arrow: replacing it needs `appearance: none`
  and a background image, and the only way to draw one is a data URI with a colour written
  into it.
- **Switch.** A real checkbox with `role="switch"`, drawn as a track and a thumb. Under forced
  colours the drawing is handed back to the user agent, because a forced palette has no way to
  make a custom track and thumb both legible.
- **Chips.** One family, two roles, and the point is telling them apart without clicking.
  `.chip-filter` is a control holding state: an edge, a fill when on, a count badge.
  `.chip-tag` is a label: no edge, a tinted bed, quieter and smaller.

**A component rule that fights a primitive usually loses in a way nobody notices.** Three did:
`.photo-add` set `display: inline-block` and stacked the icon on the label, the plain checkbox
rule was more specific than `.switch` and squashed it to a dot, and `.journey-play` had no
hover so the generic one painted the page background under text coloured for a teal fill. Give
the component the states it needs, or exclude it from the generic rule by name.

---

## Colour and Theme

**No colour literal appears anywhere outside `tokens.css`.** No hex, no `rgb()`, no named
colour. Shadows and scrims are tokenised whole rather than just their colour, so a theme can
change their weight as well as their tint. SVG built in JavaScript carries no `fill` or
`stroke` of its own; it takes them from CSS, or from `currentColor` where it should follow the
text around it.

Two border tokens, because they owe different things:

| | used for | contrast |
|---|---|---|
| `--color-border` | dividers and panel edges | none - the areas either side already differ |
| `--color-border-strong` | the edge of anything interactive | 3:1 |

### The dark set

Declared **twice**, on purpose:

```css
@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { … } }
:root[data-theme='dark'] { … }
```

The media query carries `:not([data-theme='light'])` so an explicit light choice beats the
system preference, and the attribute selector applies dark on a system that prefers light.
Written out twice rather than through another layer of indirection, because one list of values
per theme is far easier to read - and a test asserts the two copies are identical, so they
cannot drift.

The `theme` setting is `system`, `light` or `dark`. **`system` is the absence of the
attribute**, not `data-theme="system"`: that would match neither selector and quietly do
nothing.

`theme-boot.js` applies an explicit choice in `<head>`, before the stylesheets. It is a classic
script because a module is deferred by definition, which would flash the light theme first. It
cannot import, so it repeats the settings key scheme, and it must never throw - reading
`localStorage` alone throws outright when site data is blocked, and a theme preference is never
worth stopping the page for.

### Contrast

`tests/style/contrast.test.js` parses `tokens.css` and checks **every pairing the interface
actually puts together**, in both themes, against an explicit list. 4.5:1 for text, 3:1 for
large text and the things WCAG 1.4.11 calls user interface components, 1.0 for a pairing with no
requirement - and each of those says why.

The list is the point. A new colour token fails the suite until it appears there with a
decision attached. The helper lives in `tests/helpers/` rather than `src/`, because the app
never computes contrast at runtime and `src/` is what ships.

### Dark basemap

**There isn't one**, so the light one is dimmed instead. No keyless provider offers a dark
raster basemap and the one that did now wants an API key (see **Basemaps**).

`map.css` applies `invert(1) hue-rotate(180deg)` with brightness, contrast and saturation
pulled down, **to the tile pane alone**. Markers, popups, the journey path and the draft pin
live in their own Leaflet panes and are untouched, which is what keeps the rust pins and the
teal route reading as themselves over it. The numbers were chosen by looking at Nairobi at
zoom 12 until water read dark blue and parks read muted green, not by reasoning about them.

Three things gate it, and all three are in the stylesheet rather than in script: the dark
theme, declared both ways as everything else is; the `data-dim-map` attribute, which carries
the `dimMapInDark` setting and defaults to on; and forced colours, where it is off entirely
because the palette has already been decided. The filter is a custom property so the forced
colours case can override it on the same selectors rather than through a specificity trick.

It is an approximation of a dark map and not a dark map, which is why it is a setting.

The swap itself still works and is one `if`: a basemap with a `darkUrl` has it applied through
`setUrl` on the **existing** layer, never by rebuilding it - a rebuild makes Leaflet's
attribution control see a remove and an add, which is how a credit ends up flickering or
stacked. Only a url that actually changes is swapped, so a theme change does not refetch every
tile. Nothing currently declares a `darkUrl`; any replacement provider would.

---

## Forced Colours

Windows High Contrast and anything like it flattens the palette to a handful of system
keywords. Everything that carries meaning through colour alone - a pressed chip, a traversed
journey leg, a bar inside the selected range - would otherwise collapse into the same two
colours. `forced-colors.css` is loaded last and restates those in system colours.

Every property relied on there (`color`, `background-color`, `border-color`, `outline-color`,
`fill`, `stroke`) is one the user agent forces, which is why assigning a system keyword is
enough.

**`forced-color-adjust: none` is used in exactly one place**: photo thumbnails and the lightbox
image. A photo is content, not interface. The user agent leaves the image alone but forces the
background of the button behind it, which on some palettes paints a solid block into the gap
around a non-square thumbnail.

---

## Mobile

The breakpoint is 720px, where the sidebar and a usable map stop fitting side by side.

- **Header.** Two labels per button, swapped with `display` - not `visibility`, not
  `aria-hidden` - so the hidden one leaves the accessibility tree and the button's name is
  whichever label is showing. Settings keeps an `aria-label` so its name survives being cut
  down to the icon. The title may ellipsis; the controls may not be pushed off.
- **Map and List.** `data-view` on the app body, read entirely by CSS. Above the breakpoint the
  attribute is **removed**, so a wide layout can never be left with a hidden map. Choosing a
  memory in List switches to Map first, because flying to a marker on a map of the wrong size
  lands in the wrong place - every path that reveals the map calls `invalidateSize`.
- **The sidebar header is not sticky on narrow.** It holds the search, the chips, the dates,
  the timeline and the journey controls, which together are taller than a phone screen; sticky
  pinned all of it over the list and nothing below could be reached.
- **16px inputs.** Below that, iOS Safari zooms the page on focus and does not undo it.
- **`100dvh`, not `100vh`.** With `vh` the page is the height of the largest viewport, so the
  bottom of the layout hides under the URL bar until it scrolls away.
- **Safe areas.** `viewport-fit=cover` plus `env(safe-area-inset-*)` on the header, the dialogs
  and the toast region - the fixed edges.
- **Touch.** 44px minimum under `(pointer: coarse)`. The timeline thumb is the only target
  there, since the input carries `pointer-events: none` so both handles of the pair stay
  reachable; it gets a 44px box with a transparent border and `background-clip: content-box`,
  so the padding does the hitting and the visible disc stays small.
- **No marker tooltips under `(hover: none)`.** A tooltip is a hover affordance: on a touch
  screen it fires on tap, lands over the popup that same tap opened, and will not go away.
- **Lightbox swipe.** Pointer events, so a mouse drag and a pen behave the same. The horizontal
  travel has to beat the vertical, or scrolling a tall photo pages it sideways. `draggable="false"`
  on the image, because a native image drag fires `pointercancel` and the gesture is lost.

---

## Accessibility

Landmarks: the header is `banner`, `<main>` wraps the map, the sidebar is an `<aside>` named by
its heading, and the map container is a **named region**. Deliberately not
`role="application"`: that stops browse mode and passes keys straight through, which would put
the markers - real buttons with real names - out of reach of ordinary navigation.

A skip link is the first thing in the tab order. It targets the memory list, which carries
`tabindex="-1"` so focus can actually land there, and on a narrow screen it brings the list into
view first rather than moving focus to something nobody can see.

One `h1`, then `h2` for the sidebar, popups and dialog titles, then `h3` for the sections inside
Settings. No level is skipped.

axe-core runs from the scratchpad over every state - default, no results, the add and edit
dialogs, settings, the import preview, the lightbox, journey playback, a toast, the sandbox
banner, place search results - in light, dark and forced colours, at 1280px and 375px, plus the
existing suites under WebKit at 375px. **It is never added to the repo**: `package.json` has no
dependencies and is not going to grow any.

---

## Offline and Installing

A progressive web app: a manifest, an icon, and a service worker that precaches everything
needed to boot. `start_url` and `scope` are both `./`, so it still works served from a
subdirectory.

### The precache manifest

`scripts/build-precache.js` writes `precache-manifest.js`, which is **generated and
committed**. It lists every shipped file with the sha-256 of its contents, plus the jsDelivr
urls taken out of `index.html` rather than written down twice. `VERSION` is the hash of the
whole list, so a rename moves it as surely as an edit does, and it names the cache.

**Change a shipped file and you must run `npm run precache`.** This is not a convention:
`tests/pwa/precache.test.js` regenerates the manifest and compares, so a stale one fails the
suite, and with the pre-commit hook on it cannot be committed. The test walks the trees
independently of the generator - sharing the walk would only prove the generator agrees with
itself - and follows the module graph, so a leaf that is imported but not precached is caught
too.

`sw.js` and `precache-manifest.js` are deliberately **not** in the list. The browser manages
the worker's own script cache; a copy of it inside the cache it fills would only ever be
staler.

`.gitattributes` forces `eol=lf`. With `text=auto` alone the working tree follows
`core.autocrlf`, so the same commit checks out LF on one machine and CRLF on another, and
every hash changes with it.

### What the worker does

| request | strategy |
|---|---|
| navigation | the cached `index.html`, network as a fallback |
| anything in the precache | cache first, from the versioned cache |
| map tiles | stale while revalidate, own cache, capped at 300 |
| Nominatim, and everything else | straight to the network, never cached |
| any non-GET | passed through untouched |

- **install** fills a cache named for the version with one `addAll`, which is all or nothing.
  A half-filled precache would boot offline and then fail on one module, which is worse than
  not installing at all. CDN entries are requested in `cors` mode to match the `crossorigin`
  attributes in `index.html`: a `no-cors` request would store an opaque response whose status
  cannot be read, making a cached error page indistinguishable from the library.
- **No `skipWaiting` on install.** A running session is never swapped onto a different set of
  modules underneath itself.
- **activate** deletes every other `waypoints-` cache and calls `clients.claim`, so a first
  visit works offline without a reload. The tile cache is kept: it is not a version of the
  app, and dropping it on every update would blank the map exactly when someone is least able
  to refill it.
- **Anything we do not cache is left alone entirely** - not fetched and passed on, but never
  touched. Not calling `respondWith` is the difference, and for Nominatim it matters: a cached
  geocode is a stale answer to a question about the world, and serving one offline would make
  the app lie rather than say it cannot reach the service.

The tile cache is trimmed oldest first, which `Cache.keys` gives for free in insertion order -
no timestamps to store and keep in step. The trim runs after the response is stored, so a trim
that fails never costs the tile.

**Tile layers set `crossOrigin: 'anonymous'`.** Leaflet leaves it off by default, which makes
every tile a `no-cors` request and every response opaque, and an opaque response has status 0.
The worker's `response.ok` check then rejected every tile and cached nothing, while the map
still drew offline out of the browser's HTTP cache and hid it. Both providers answer with
`Access-Control-Allow-Origin: *`, so asking for CORS costs nothing and keeps the guarantee
that a rate-limit page is never stored as a tile.

### Registering it

On a real host the worker is on. On a development host - the same list as sandbox mode - it
takes **`?sw`**, because a worker serving a cached `index.html` is the last thing you want
while editing one. An insecure context has no `navigator.serviceWorker` at all, so the app
served over a LAN address never registers one; that is expected, not a fault.

The flag turns it **off** as well as on: a development host loaded without it unregisters
whatever is there and drops the `waypoints-` caches. Otherwise `?sw` would be a one way switch,
and one visit with it would leave localhost serving a cached `index.html` on every later load -
the exact problem the gate exists to avoid, except permanent. It takes effect from the next
load, since unregistering does not release the page already being controlled. Off a development
host this is unreachable, so a deployment can never unregister itself.

`updateViaCache: 'none'`, or the browser serves the worker script itself out of the HTTP cache
and an update can go unnoticed for as long as that lasts.

When a new worker is waiting, a toast offers **Reload**, which posts `skip-waiting` and
reloads on `controllerchange`. **The page never reloads without that click**, and that is
structural: `controllerchange` is only listened for once the button is pressed. Listening from
registration would reload on a first install, since `activate` calls `clients.claim`, and
again whenever another tab took an update. A worker left waiting from a previous session is
offered at boot too, not only one that installs while the page is open.

### The icon

`icons/icon.svg` is a pin drawn from its geometry - a disc with a real hole, closed off by the
two tangent lines that meet at the point below it. `icon-maskable.svg` is the same glyph,
smaller and full bleed, because a launcher masks to its own shape and a corner radius of ours
would leave gaps inside it; iOS takes that one too, for the same reason. The PNGs are rendered
from these with Playwright in the scratchpad and committed.

A rasterised icon cannot read a custom property, so the icons, the manifest and the
`theme-color` metas are the only places outside `tokens.css` that write a colour out in full.
`tests/style/icon.test.js` and `tests/pwa/manifest.test.js` pin every one of them to a token,
so they cannot drift.

A `theme-color` meta understands `media` and nothing else, so the chrome follows the **system**
preference rather than the theme setting. Someone running the app light on a dark system gets
dark chrome over a light header. The alternative is rewriting the metas from script on every
theme change, which trades a cosmetic mismatch for a second source of truth about the theme.

### Offline and install UI

The offline banner lives inside the banner landmark. Its text is written in on every show
rather than once at startup: the region carries `role="status"`, and a live region announces a
change to its **contents**, not a change to its visibility. The state is also read at load,
since a page opened with no connection never fires the `offline` event. Dismissing lasts for
that outage only.

The install button appears in Settings only once `beforeinstallprompt` has fired, which only
Chromium-based browsers do. The event is kept because `prompt()` needs that same object, and
dropped after one use: a prompted event cannot be prompted again, and holding it would leave a
button that silently does nothing. There is deliberately no iOS walkthrough - Safari installs
from its own share sheet, and a panel of instructions about another browser's menus is not a
setting.

---

## Deploying

Static hosting. There is nothing to build: the files in the repository are the files the browser
loads.

`vercel.json` carries the headers, and they are not decoration. The **cache rules are written
not to overlap**, so nothing depends on which rule wins when two match:

| path | Cache-Control |
| --- | --- |
| `/`, `/index.html`, `/sw.js`, `/precache-manifest.js`, `/manifest.webmanifest` | `no-cache` |
| `/src/(.*)` | `public, max-age=300, must-revalidate` |
| `/icons/(.*)` | `public, max-age=31536000, immutable` |

Nothing is fingerprinted, so application code revalidates rather than being pinned; the worker
is what makes that cheap. The entry point, the worker and its file list are never cached,
because an update must never be a cache's decision.

The **CSP** allows jsDelivr for scripts and styles and the tile host for images and connections.
`'unsafe-inline'` appears in `style-src` only, and only because Leaflet positions every pane,
tile and popup through `element.style`. `script-src` has no inline anything - the one classic
script in the head is a file for exactly this reason - and nothing anywhere allows `eval`.

`Referrer-Policy` is `strict-origin-when-cross-origin` rather than `no-referrer`: the tile usage
policy asks for an identifiable referer, and an origin satisfies it without sending paths.

`Permissions-Policy` denies camera, microphone and geolocation. **A file input is not gated by
the camera permission**, so the photo picker still offers the camera on a phone; nothing in the
app asks for the other two.

`.vercelignore` drops the tests, the tooling and the docs, keeping only the export format
specification the export file points people at. A test asserts that nothing in the precache
manifest is excluded by it, since a file the worker is told to cache and the deployment does not
serve would fail the install.

### scripts/serve.mjs

`npm run serve:prod` serves the app with those headers applied, and `npm run test:e2e` runs
against it. **A policy that only exists in production is a policy nobody has tested**, and the
first thing it breaks is the thing you just shipped.

It understands the two `source` forms `vercel.json` actually uses and **throws on anything
else**, rather than treating an unrecognised pattern as a literal and silently dropping a header
in testing that production would apply.

---

## End-to-end Tests

`e2e/`, Playwright, Chromium and WebKit, run with `npm run test:e2e` against `serve:prod`. About
a minute and a half for both engines.

Curated, not exhaustive. The unit suite covers the pure logic; these are the paths that only
break once a real browser, real storage and the production headers are all involved at once.
Each test seeds its own state rather than clicking through setup.

**The fixture in `e2e/fixtures.js` is global, not per-test**, because a fault is a fault wherever
it happens:

- A **console error**, a **page error** or a **CSP violation** fails whichever test it occurs in.
  The violation is reported from inside the page through `securitypolicyviolation`, which carries
  the directive, rather than by pattern-matching a log line that differs between engines.
- **Nominatim is never reached.** A guard route records any request that gets through and fails
  the test naming the url. A test that needs results installs its own route, which Playwright
  matches first because it was added later.
- **Tiles are answered from a local fixture.** Routing is on the **context**, not the page,
  because the service worker makes its own requests and those do not pass through `page.route`.

Two things are skipped on WebKit with the reason recorded where they are skipped: Playwright's
WebKit precaches identically and serves through the worker while online, but will not answer
from the cache once offline emulation is on. Real Safari is an open question, not a known
failure.

When a test needs to choose a memory from the list, **seed it an uncrowded map**. That path flies
the map and opens a popup through the cluster plugin, and with several pins stacked on one city
it occasionally never produced a popup on WebKit under parallel load. The cluster path has its
own scenarios; it is a slow and flaky way in to something else.

CI runs the unit tests first, before the browsers are installed - they need none, they are fast,
and a failure should not wait on a few hundred megabytes of download.

---

## Rendering User Text

**Non-negotiable. User-supplied text is never inserted as HTML.**

- Build content with `document.createElement` and `textContent`
- No `innerHTML`, no `insertAdjacentHTML`, no HTML string templates containing memory
  fields
- Leaflet popups are given an `HTMLElement`, never a string
- Preserve a note's line breaks with `white-space: pre-wrap` in CSS, never by injecting
  `<br>`
- **No markup string anywhere in `src/` interpolates or concatenates a value.** Two fixed
  SVG literals remain - in `map/journey-chevrons.js` and `map/result-marker.js` - and they are
  constants written here, with nothing substituted into them. `map/pin-icon.js` shows the
  better pattern: it builds its pin with `createElementNS` and hands `L.divIcon` an `Element`,
  which Leaflet 1.9 accepts, so even a journey step number goes in through `textContent`. The
  other two are worth converting the next time either is touched.

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

## Branches

**`main` is production.** It is what the live site serves and what real data lives against, so
it only ever moves forward and it is never rewritten.

| Branch | What it is | Pushes to |
| --- | --- | --- |
| `main` | production, and the only thing released | hotfixes only |
| `ui-1.1` | the whole UI and UX run, merged into `main` at the 1.1.0 release | every commit of the run |

- **A production hotfix goes on `main`**, is released from there, and is then merged **into**
  `ui-1.1` so the branch carries the fix too.
- **`ui-1.1` merges into `main` once**, at the release. Never the other way round as a rebase:
  the branch is pushed, so rewriting it would break anyone who has it.
- A merge, not a rebase, in both directions, for the same reason.
- Conflicts between a hotfix and the run are resolved **in favour of the run's token system**.
  A hotfix is written against whatever production has; the branch has moved past that, and the
  branch is where the design decisions live.

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
