# SPEC — Workout Tracker

A workout logger you **own** and run from your phone. Build workouts, log the sets,
export clean data for review somewhere else. No ads, no subscription, no account,
and your training data never leaves the device.

The hard part of this project is **not** the features. It is staying disciplined about
*ownership and longevity*: no build step, no framework, no dependency that can rot, and
no cloud that holds your data. If it still opens and works untouched in five years, the
spec did its job.

Two phases, decided up front:

- **Phase 1 (this spec):** the app basics — **build**, **log**, **export**. On-device only.
- **Phase 2 (separate spec, later):** a research base (`dataset.py → build.py`, your codex
  pattern) that curates an evidence-backed exercise library and a workout plan built from
  research + your goals. Phase 1 only has to expose the *import seam* Phase 2 fills.

---

## 1. Goal and principles

One user (you), one Google Pixel, logging at the gym — often with no signal.

Non-negotiable principles, in priority order:

1. **You own it.** Your data lives on your phone (IndexedDB). The only thing hosted is the
   app *code* (static files on Vercel); the host never sees a single set you logged.
2. **Works offline, always.** A gym dead zone must never block logging a set. Installable to
   the home screen; runs fully from cache.
3. **Ownable, not clever.** Zero-build vanilla HTML/CSS/JS. No framework, no npm, no
   toolchain. You can read the entire codebase and understand it.
4. **Export is a first-class feature, not an afterthought.** Review happens *outside* the app,
   in your spreadsheet. The app's job is to capture clean data and hand it over.
5. **The exercise library is complete and yours.** The original complaint. Everything is
   editable; nothing is locked; the list can be replaced/extended by import.

If a proposed feature fights principle 1, 2, or 3, it loses.

---

## 2. Scope

### In scope (Phase 1)

- **Build** reusable workout *routines* (an ordered list of exercises with optional target
  sets/reps).
- **Log** a training session — freestyle or started from a routine — recording:
  - **Strength:** per set → weight (lb), reps, optional RPE, optional note.
  - **Cardio/conditioning:** per entry → duration, distance (+ unit), optional note.
- **Exercise library** — hybrid: a small built-in placeholder seed so the app is usable on
  day one, fully editable (add / rename / edit / hide), and replaceable via JSON import.
- **History** — browse past sessions.
- **Export** — CSV (tidy, one row per set) for spreadsheet review + JSON (full backup/restore).
- **Import** — JSON restore, and JSON exercise-seed merge (the Phase 2 seam).
- **Install + offline** — PWA manifest + service worker.

### Out of scope (Phase 1) — deliberately

- No in-app charts, analytics, PRs, or progress graphs. **Review happens in the spreadsheet.**
- No accounts, login, cloud sync, or server.
- No live rest timer (Phase 2). *Schema keeps an optional `restSec` field for forward-compat,
  but v1 ships no timer and does not prompt for rest.*
- No research content, plan generation, or exercise science (Phase 2).
- No social, sharing, or multi-user anything.

### The Phase 1 → Phase 2 seam

Phase 2's research build outputs an `exercises.seed.json`. Phase 1's **JSON exercise import**
merges that file into the library (match on name, don't clobber your edits). That single
import path is the only coupling between the phases — nothing else in Phase 1 depends on
research existing.

---

## 3. Architecture and stack

**Zero-build vanilla-JS Progressive Web App.**

| Concern | Choice | Why |
|---|---|---|
| UI | Hand-written HTML/CSS/JS, ES modules | No build, no deps, fully ownable |
| Storage | IndexedDB (thin hand-rolled wrapper, no library) | Structured, unbounded, offline; survives years of logs |
| Offline/install | `manifest.webmanifest` + `service-worker.js` (precache app shell, cache-first) | Home-screen install + full offline on Android Chrome |
| IDs | `crypto.randomUUID()` | Built-in, collision-free, no dep |
| Hosting | Static files on Vercel (like `sff-canon`) | HTTPS (required for service workers), free, you already use it |
| Data export/import | CSV + JSON via Blob download / file input | Plain, portable, spreadsheet-friendly |

No bundler. Modules loaded with native `<script type="module">`. The service worker requires
HTTPS or `localhost`, which is why the code is hosted (Vercel) even though the data is local.

**Ownership note to keep honest:** hosting the *code* on Vercel does not weaken ownership —
it is your repo, free tier, static, movable to GitHub Pages in minutes. The property that
matters — your workout data — is 100% on the Pixel, in IndexedDB, exportable at will.

---

## 4. Data model

IndexedDB database `workout-tracker`, object stores below. All records carry a string `id`
from `crypto.randomUUID()` unless noted.

```
meta        { key: "schema", schemaVersion: <int> }          // singleton, migration anchor
settings    { key: "app", units: "lb", ... }                 // singleton

exercises   { id, name, type: "strength" | "cardio",
              muscleGroup: string, equipment: string,
              custom: bool, hidden: bool, createdAt }

routines    { id, name, createdAt, updatedAt,
              items: [ { exerciseId, targetSets?: int, targetReps?: int, note?: string } ] }

sessions    { id, date: ISO-8601, name: string, routineId?: string, notes?: string,
              entries: [
                // strength
                { exerciseId, type: "strength",
                  sets: [ { weight: number, reps: int, rpe?: number, restSec?: int, note?: string } ] }
                // cardio
                { exerciseId, type: "cardio",
                  durationSec?: int, distance?: number, distanceUnit?: "mi"|"km"|"m", note?: string }
              ] }
```

**Versioning & migration.** IndexedDB's native `onupgradeneeded` creates/updates stores.
App-level data shape is stamped with `schemaVersion` in `meta` **and** in every JSON export,
so a future import can detect and upgrade an older backup. Migrations are pure functions
`migrate(data, fromVersion) → data` — unit-tested (see §9).

**Built-in exercise seed (placeholder).** A dozen or so common lifts + a couple of cardio
modalities, shipped in `seed/exercises.default.json`, loaded once on first run. Explicitly a
placeholder for the real research-curated set; every seeded row is editable and deletable.

---

## 5. Screens and flows

Five screens, bottom-tab navigation, thumb-reachable, single-column, dark-friendly.

1. **Log (home / active session).** Start freestyle or pick a routine → add exercises → tap in
   sets (weight × reps, optional RPE/note for strength; duration/distance for cardio) → finish.
   Big touch targets; a running session survives an accidental app close (persisted immediately,
   not on "finish").
2. **Routines.** Create/edit/delete a routine: name it, add exercises from the library, set
   optional target sets/reps. This is "build out workouts."
3. **Library.** The full exercise list, searchable/filterable by muscle group & equipment.
   Add, edit, rename, hide. Import exercises (JSON). The answer to "incomplete lists."
4. **History.** Reverse-chronological list of sessions; tap one to view its entries. Read-only
   detail is fine for v1 (edit-past can come later); deleting a session is allowed.
5. **Backup / Export.** Export CSV, export JSON backup, import JSON (restore or exercise seed).
   Plain, obvious, with a "last exported" reminder since this is the only backup.

Settings (units, data reset) live behind a small control on Backup or a header menu — not a
sixth tab.

**Core flow, end to end:** build a routine once → start a session from it → log sets with
minimal taps → finish → it lands in History → export CSV → review/pivot in your spreadsheet.

---

## 6. Export and import — the data contract

### CSV (review)

One file, **one row per set** (strength) or **per entry** (cardio) — tidy long format that
pivots cleanly in Sheets/Excel. Fixed column order:

```
date, session_name, exercise, exercise_type, set_number,
weight_lb, reps, rpe, rest_sec,
distance, distance_unit, duration_sec, note
```

- Strength set → fills `set_number, weight_lb, reps, rpe, rest_sec, note`; cardio columns blank.
- Cardio entry → fills `distance, distance_unit, duration_sec, note`; `set_number` = 1; strength
  columns blank.
- UTF-8, RFC-4180 quoting (quote fields containing comma/quote/newline). Header row always present.

### JSON (backup / restore / seed)

- **Full backup:** `{ schemaVersion, exportedAt, settings, exercises, routines, sessions }`.
  Round-trips losslessly. This is the user's only backup — the Export screen nudges toward it.
- **Restore:** import a full backup → replace or merge (user chooses). Older `schemaVersion`
  runs through migrations first.
- **Exercise-seed import (Phase 2 seam):** import a file of just `exercises` → **merge by name**,
  case-insensitive. Rule: if the name is **absent**, add it; if it **already exists**, skip it
  (never clobber what's already in your library). Report a summary (added / skipped). Phase 2
  may refine this to update stock rows, but v1's rule is simply add-if-absent.

Both exports download via `Blob` + object URL. Import via a file `<input>`. No network.

---

## 7. Offline and install (PWA)

- `manifest.webmanifest`: name, short_name, standalone display, theme/background colors,
  maskable icons (192/512). Gives the home-screen install prompt on Android Chrome.
- `service-worker.js`: on `install`, precache the app shell (index.html, JS modules, CSS,
  manifest, icons, default seed). Serve **cache-first** so a cold gym has full function.
  Cache name carries a version string; a new deploy bumps it and cleans old caches on `activate`.
- First visit needs signal (to load + install). Every visit after is offline-capable.

---

## 8. Repo layout

Matches the house style (flat, readable, root-level SPEC/README). No `node_modules`.

```
workout-tracker/
  SPEC.md                 # this file
  README.md               # what it is, how to install on the Pixel, how to deploy
  GATES.md                # manual QA checklist (UI + IndexedDB), run before each deploy
  index.html              # app shell
  manifest.webmanifest
  service-worker.js
  css/app.css
  js/
    storage.js            # IndexedDB wrapper (open, get, put, delete, all)
    schema.js             # shapes, ids, schemaVersion, migrate()
    library.js            # exercise CRUD + import/merge
    routines.js           # routine build/edit
    session.js            # active session logging
    history.js            # past sessions
    exporter.js           # CSV + JSON builders (pure)
    importer.js           # JSON restore + seed merge (pure)
    ui.js / screens/      # rendering + navigation
    app.js               # bootstrap, SW registration, routing
  seed/exercises.default.json
  icons/ (192, 512, maskable)
  tests/                  # node:test unit tests for pure modules
  vercel.json             # static hosting config
```

`build.py` / `dataset.py` do **not** appear in Phase 1 — they arrive in Phase 2 to generate
`exercises.seed.json` from the research base.

---

## 9. Testing and gates

**Automated (Node's built-in `node:test`, zero deps)** — for the pure-logic modules where
correctness matters and bugs are silent:

- `exporter.js` — CSV rows/columns/quoting for strength + cardio + mixed sessions; JSON round-trip.
- `importer.js` — restore merge/replace; seed merge-by-name (add new, skip user-edited); bad-input handling.
- `schema.js` — `migrate()` across versions; id uniqueness.
- volume/summary math if any is added.

Run with `node --test`. No IndexedDB/DOM in these — modules take plain data in, return data out.

**Manual (`GATES.md` checklist, run in the browser preview before each deploy)** — for the
UI + IndexedDB + PWA surface that unit tests don't reach:

- Build a routine; start a session from it; log strength sets + a cardio entry; finish; see it in History.
- Kill the tab mid-session → reopen → session still there (persisted immediately).
- Add/edit/hide a library exercise; import an exercise JSON and confirm merge summary.
- Export CSV → opens in Sheets with correct columns; export JSON → re-import restores identically.
- Airplane mode → full app still works (offline gate).
- Install to home screen on the Pixel → launches standalone.

A deploy is allowed only when `node --test` passes and every `GATES.md` item is checked.

---

## 10. Design notes (resolved decisions)

- **Rest field:** kept in schema (`restSec`, optional) for Phase-2 timer forward-compat; not
  surfaced or prompted in v1. (Per redline #3.)
- **Editing past sessions:** v1 allows delete, not edit. Edit-past is a candidate for later, not
  a Phase-1 requirement.
- **Units:** default `lb`, kg switch in settings. (Per redline #2.)
- **Name:** `workout-tracker` (working name; rename cheap, it's a folder + manifest string).
