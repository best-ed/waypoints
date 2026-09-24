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
src/js/ui/        everything that touches the DOM
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
- Photos go to IndexedDB, keyed by the ids in `photoIds`. Added later.

### Store

`createMemoryStore({ storage, now, makeId, onListenerError })` takes its dependencies as
arguments so tests can pass fakes. `main.js` passes `localStorage`, `() => new Date()` and
`crypto.randomUUID`.

- `list()` returns memories sorted by date ascending, ties broken by `createdAt`
- `get(id)` returns a copy or `null`
- `add(input)` returns the stored record
- `update(id, changes)` merges a patch, bumps `updatedAt`, throws on an unknown id
- `remove(id)` returns whether the memory existed
- `subscribe(listener)` returns an unsubscribe function, fired after every successful
  mutation and never after a failed one

Every getter returns copies, so callers cannot mutate stored state by accident.

---

## Commit Rules

**Non-negotiable:**

- One logical change per commit. Conventional Commits format (feat, fix, chore, docs,
  style, refactor, test).
- NEVER add a Co-Authored-By trailer, a "Generated with Claude Code" footer, or any AI
  attribution to commit messages. Plain subject line, optional short body, nothing else.
- Stage only the files belonging to that change. Commit as you go, don't batch at the end.
- Do not push until I say so.

The `commit-msg` hook in `.githooks/` enforces the attribution rule mechanically, but the
rule stands on its own. Run `git config core.hooksPath .githooks` after cloning.
