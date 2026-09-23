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
tests/            node --test files
.githooks/        git hooks (commit-msg attribution stripper)
```

Modules are grouped by feature inside `src/js/` (`src/js/map/`, `src/js/storage/`, …),
not by type. A module that only the map uses lives under `map/`.

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
