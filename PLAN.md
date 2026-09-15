# Workout Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a phone-installable, offline-first, on-device workout logger — build routines, log sets, export clean data — as a zero-build vanilla-JS PWA.

**Architecture:** Static HTML/CSS/ES-module JS served over HTTPS (Vercel). All data in IndexedDB on the device. Pure logic (schema, CSV/JSON export, import/merge) lives in dependency-free ES modules that run identically in the browser and in Node's test runner; the browser-only layer (IndexedDB wrapper, UI screens, service worker) is built and verified in the live preview against a `GATES.md` checklist.

**Tech Stack:** Vanilla JavaScript (ES modules), HTML, CSS. IndexedDB for storage. `node:test` + `node:assert` for unit tests (zero npm dependencies). Service worker + web manifest for install/offline. Vercel static hosting.

**Spec:** `workout-tracker/SPEC.md` (read it alongside this plan — the plan implements it section by section).

## Global Constraints

- **Zero runtime dependencies, zero build step.** No framework, no bundler, no npm packages shipped or imported. Native `<script type="module">` in the browser; `node --test` in Node. (SPEC §1.3, §3)
- **Node ≥ 20** for running tests (uses global `crypto.randomUUID()` and `node:test`). Single `package.json` with `"type": "module"` and a `test` script; **no `dependencies` and no `devDependencies`.**
- **Data is on-device only.** No network calls for user data. The only network use is loading the static app files and (later) the service worker cache. (SPEC §1.1, §3)
- **Units default `lb`.** Weight is always stored/exported in pounds in v1. (SPEC §10)
- **No rest timer in v1.** `restSec` exists in the schema and as a CSV column, but nothing writes it and no UI prompts for it. (SPEC §2, §10)
- **No in-app analytics/charts.** Review happens in the exported spreadsheet. (SPEC §2)
- **Pure modules stay pure.** `schema.js`, `exporter.js`, `importer.js` must not reference `window`, `document`, `Blob`, `indexedDB`, or `fetch` at import time or in their exported functions. They take plain data in and return plain data/strings out. This is what makes them Node-testable.
- **CSV column order is a fixed contract** (SPEC §6): `date, session_name, exercise, exercise_type, set_number, weight_lb, reps, rpe, rest_sec, distance, distance_unit, duration_sec, note`.
- **IndexedDB is not unit-tested** (adding a fake-IndexedDB dependency would violate the zero-dep principle). Storage, UI, and PWA tasks are verified in the browser preview with the exact steps each task lists, and logged in `GATES.md`. Commit after each task.

---

## File Structure

```
workout-tracker/
  SPEC.md                     # done
  PLAN.md                     # this file
  README.md                   # Task 14 — what it is, install-on-Pixel, deploy
  GATES.md                    # Task 1 (created), appended by later tasks — manual QA checklist
  package.json                # Task 1 — {"type":"module","scripts":{"test":"node --test"}}, no deps
  .gitignore                  # Task 1
  vercel.json                 # Task 14 — static hosting

  index.html                  # Task 6 — app shell, 5 tabs
  css/app.css                 # Task 6 — layout + dark-friendly styles

  js/
    schema.js                 # Task 1 — shapes, ids, SCHEMA_VERSION, migrate()   [PURE]
    exporter.js               # Tasks 2-3 — buildCsv(), buildBackup()             [PURE]
    importer.js               # Tasks 4-5 — parseBackup(), mergeExercises(), applyRestore()  [PURE]
    storage.js                # Task 5b — IndexedDB wrapper                        [BROWSER]
    app.js                    # Task 6 — bootstrap, router, SW registration, first-run seed
    ui.js                     # Task 6 — tiny DOM helpers (el(), clear(), download(), pickFile())
    library.js                # Task 7 — exercise list screen + CRUD + import
    routines.js               # Task 8 — routine builder screen
    session.js                # Task 9 — active logging screen
    history.js                # Task 10 — past sessions screen
    backup.js                 # Task 11 — export/import screen

  seed/exercises.default.json # Task 6 — small placeholder exercise set (editable)
  icons/                      # Task 13 — 192, 512, maskable PNGs
  manifest.webmanifest        # Task 13
  service-worker.js           # Task 13

  tests/
    schema.test.js            # Task 1
    exporter.csv.test.js      # Task 2
    exporter.backup.test.js   # Task 3
    importer.parse.test.js    # Task 4
    importer.merge.test.js    # Task 5
```

**Interface summary (locked here so tasks stay consistent):**

```
schema.js
  SCHEMA_VERSION = 1
  VALID_TYPES = ['strength','cardio']
  newId() -> string
  newExercise({name, type='strength', muscleGroup='', equipment='', custom=true}) -> Exercise   // throws on bad name/type
  newRoutine({name, items=[]}) -> Routine
  newRoutineItem({exerciseId, targetSets=null, targetReps=null, note=''}) -> Item
  newSession({name, routineId=null, date=<now ISO>}) -> Session
  newStrengthEntry(exerciseId) -> {exerciseId, type:'strength', sets:[]}
  newCardioEntry(exerciseId) -> {exerciseId, type:'cardio', durationSec:null, distance:null, distanceUnit:'mi', note:''}
  newSet({weight=null, reps=null, rpe=null, restSec=null, note=''}) -> Set
  migrate(data) -> data          // identity at v1; throws if data.schemaVersion > SCHEMA_VERSION

exporter.js
  CSV_COLUMNS -> string[]
  csvEscape(value) -> string
  buildCsv(sessions, exerciseIndex) -> string        // exerciseIndex: {[id]: {name, type}}
  buildBackup({settings, exercises, routines, sessions}) -> BackupObject
  serializeBackup(state) -> string

importer.js
  parseBackup(text) -> {ok:true, data} | {ok:false, error}
  parseExerciseSeed(text) -> {ok:true, exercises} | {ok:false, error}
  mergeExercises(existing, incoming) -> {merged, added, skipped}
  applyRestore(existing, incoming, mode) -> newState   // mode: 'replace' | 'merge'

storage.js  (async, browser-only)
  openDb() -> Promise<IDBDatabase>
  getAll(store) / get(store,id) / put(store,rec) / remove(store,id) / bulkPut(store,recs)
  getSingleton(store,key) / putSingleton(store,rec)
  exportState() -> Promise<{settings,exercises,routines,sessions}>
  importState(state, mode) -> Promise<void>
  clearAll() -> Promise<void>
```

---

## Task 1: Project scaffold + schema module

Sets up the dependency-free test harness and builds the central data-shape module that every other module imports.

**Files:**
- Create: `workout-tracker/package.json`, `workout-tracker/.gitignore`, `workout-tracker/GATES.md`
- Create: `workout-tracker/js/schema.js`
- Test: `workout-tracker/tests/schema.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: everything under `schema.js` in the interface summary above.

- [ ] **Step 1: Initialize repo + scaffold files**

```bash
cd "C:/Users/Willi/Claude Code/workout-tracker"
git init
```

Create `package.json`:
```json
{
  "name": "workout-tracker",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test" }
}
```

Create `.gitignore`:
```
.DS_Store
Thumbs.db
node_modules/
*.log
```

Create `GATES.md`:
```markdown
# GATES — manual QA before every deploy

Run `npm test` (node --test) first; it must pass. Then walk this checklist in the
browser preview (mobile viewport). A deploy is allowed only when every box is checked.

## Automated
- [ ] `node --test` passes (schema, exporter, importer).

## Storage & first run
- [ ] (Task 5b) Fresh load creates the DB; second load reuses it (data persists).

## (checklist items are appended by later tasks)
```

- [ ] **Step 2: Write the failing test** — `tests/schema.test.js`

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION, VALID_TYPES, newId, newExercise, newRoutine,
  newSession, newStrengthEntry, newCardioEntry, newSet, migrate,
} from '../js/schema.js';

test('newId returns unique strings', () => {
  const a = newId(), b = newId();
  assert.equal(typeof a, 'string');
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
});

test('newExercise applies defaults and keeps required fields', () => {
  const ex = newExercise({ name: 'Back Squat' });
  assert.equal(ex.name, 'Back Squat');
  assert.equal(ex.type, 'strength');
  assert.equal(ex.custom, true);
  assert.equal(ex.hidden, false);
  assert.equal(ex.muscleGroup, '');
  assert.ok(ex.id && ex.createdAt);
});

test('newExercise rejects empty name and bad type', () => {
  assert.throws(() => newExercise({ name: '' }));
  assert.throws(() => newExercise({ name: 'X', type: 'yoga' }));
});

test('VALID_TYPES is strength + cardio', () => {
  assert.deepEqual([...VALID_TYPES].sort(), ['cardio', 'strength']);
});

test('newSession starts empty with an ISO date', () => {
  const s = newSession({ name: 'Push A' });
  assert.equal(s.name, 'Push A');
  assert.deepEqual(s.entries, []);
  assert.equal(s.routineId, null);
  assert.ok(!Number.isNaN(Date.parse(s.date)));
});

test('newStrengthEntry / newCardioEntry shapes', () => {
  const se = newStrengthEntry('ex1');
  assert.deepEqual(se, { exerciseId: 'ex1', type: 'strength', sets: [] });
  const ce = newCardioEntry('ex2');
  assert.equal(ce.type, 'cardio');
  assert.equal(ce.distanceUnit, 'mi');
  assert.equal(ce.durationSec, null);
});

test('newSet defaults nulls', () => {
  const set = newSet({ weight: 135, reps: 5 });
  assert.equal(set.weight, 135);
  assert.equal(set.reps, 5);
  assert.equal(set.rpe, null);
  assert.equal(set.restSec, null);
  assert.equal(set.note, '');
});

test('migrate is identity at current version and rejects newer', () => {
  const data = { schemaVersion: SCHEMA_VERSION, exercises: [] };
  assert.deepEqual(migrate(data), data);
  assert.throws(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 }));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot import from `../js/schema.js` (module/exports missing).

- [ ] **Step 4: Write minimal implementation** — `js/schema.js`

```javascript
export const SCHEMA_VERSION = 1;
export const VALID_TYPES = ['strength', 'cardio'];

export function newId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

export function newExercise({ name, type = 'strength', muscleGroup = '', equipment = '', custom = true } = {}) {
  if (!name || !String(name).trim()) throw new Error('Exercise name is required');
  if (!VALID_TYPES.includes(type)) throw new Error(`Invalid exercise type: ${type}`);
  return {
    id: newId(),
    name: String(name).trim(),
    type,
    muscleGroup,
    equipment,
    custom,
    hidden: false,
    createdAt: nowIso(),
  };
}

export function newRoutineItem({ exerciseId, targetSets = null, targetReps = null, note = '' } = {}) {
  if (!exerciseId) throw new Error('routine item needs an exerciseId');
  return { exerciseId, targetSets, targetReps, note };
}

export function newRoutine({ name, items = [] } = {}) {
  if (!name || !String(name).trim()) throw new Error('Routine name is required');
  const ts = nowIso();
  return { id: newId(), name: String(name).trim(), items, createdAt: ts, updatedAt: ts };
}

export function newSession({ name, routineId = null, date = nowIso() } = {}) {
  return { id: newId(), date, name: name ? String(name).trim() : 'Workout', routineId, notes: '', entries: [] };
}

export function newStrengthEntry(exerciseId) {
  return { exerciseId, type: 'strength', sets: [] };
}

export function newCardioEntry(exerciseId) {
  return { exerciseId, type: 'cardio', durationSec: null, distance: null, distanceUnit: 'mi', note: '' };
}

export function newSet({ weight = null, reps = null, rpe = null, restSec = null, note = '' } = {}) {
  return { weight, reps, rpe, restSec, note };
}

export function migrate(data) {
  const v = data?.schemaVersion ?? SCHEMA_VERSION;
  if (v > SCHEMA_VERSION) throw new Error(`Backup is from a newer version (${v}); update the app first`);
  // v === SCHEMA_VERSION: nothing to do yet. Future migrations chain here.
  return data;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore GATES.md js/schema.js tests/schema.test.js
git commit -m "feat: project scaffold + schema module with tests"
```

---

## Task 2: CSV export builder

The spreadsheet-review contract. One tidy row per strength set / per cardio entry, fixed columns, RFC-4180 quoting.

**Files:**
- Create: `workout-tracker/js/exporter.js`
- Test: `workout-tracker/tests/exporter.csv.test.js`

**Interfaces:**
- Consumes: nothing from other modules (takes plain data).
- Produces: `CSV_COLUMNS`, `csvEscape(value)`, `buildCsv(sessions, exerciseIndex)`.

- [ ] **Step 1: Write the failing test** — `tests/exporter.csv.test.js`

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_COLUMNS, csvEscape, buildCsv } from '../js/exporter.js';

const EXPECTED_HEADER =
  'date,session_name,exercise,exercise_type,set_number,weight_lb,reps,rpe,rest_sec,distance,distance_unit,duration_sec,note';

test('CSV header matches the fixed contract', () => {
  assert.equal(CSV_COLUMNS.join(','), EXPECTED_HEADER);
});

test('csvEscape quotes only when needed', () => {
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape(135), '135');
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(undefined), '');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('he said "hi"'), '"he said ""hi"""');
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
});

test('empty sessions yields header only', () => {
  assert.equal(buildCsv([], {}), EXPECTED_HEADER + '\n');
});

test('strength session emits one row per set', () => {
  const idx = { ex1: { name: 'Back Squat', type: 'strength' } };
  const sessions = [{
    date: '2026-09-15T18:00:00.000Z', name: 'Leg Day', routineId: null, entries: [
      { exerciseId: 'ex1', type: 'strength', sets: [
        { weight: 225, reps: 5, rpe: 8, restSec: null, note: '' },
        { weight: 225, reps: 5, rpe: 9, restSec: null, note: 'grindy' },
      ] },
    ],
  }];
  const rows = buildCsv(sessions, idx).trim().split('\n');
  assert.equal(rows.length, 3); // header + 2 sets
  assert.equal(rows[1], '2026-09-15T18:00:00.000Z,Leg Day,Back Squat,strength,1,225,5,8,,,,,');
  assert.equal(rows[2], '2026-09-15T18:00:00.000Z,Leg Day,Back Squat,strength,2,225,5,9,,,,,grindy');
});

test('cardio entry emits one row with cardio columns filled', () => {
  const idx = { ex2: { name: 'Treadmill Run', type: 'cardio' } };
  const sessions = [{
    date: '2026-09-15T12:00:00.000Z', name: 'Cardio', routineId: null, entries: [
      { exerciseId: 'ex2', type: 'cardio', durationSec: 1800, distance: 3.1, distanceUnit: 'mi', note: 'easy' },
    ],
  }];
  const rows = buildCsv(sessions, idx).trim().split('\n');
  assert.equal(rows[1], '2026-09-15T12:00:00.000Z,Cardio,Treadmill Run,cardio,1,,,,,3.1,mi,1800,easy');
});

test('unknown exercise id falls back to a placeholder name', () => {
  const sessions = [{
    date: '2026-09-15', name: 'W', routineId: null, entries: [
      { exerciseId: 'gone', type: 'strength', sets: [{ weight: 100, reps: 1, rpe: null, restSec: null, note: '' }] },
    ],
  }];
  assert.ok(buildCsv(sessions, {}).includes('(unknown exercise)'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../js/exporter.js` has no such exports.

- [ ] **Step 3: Write minimal implementation** — `js/exporter.js` (CSV portion)

```javascript
export const CSV_COLUMNS = [
  'date', 'session_name', 'exercise', 'exercise_type', 'set_number',
  'weight_lb', 'reps', 'rpe', 'rest_sec',
  'distance', 'distance_unit', 'duration_sec', 'note',
];

export function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(cells) {
  return CSV_COLUMNS.map((c) => csvEscape(cells[c])).join(',');
}

export function buildCsv(sessions, exerciseIndex) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const s of sessions) {
    for (const entry of s.entries || []) {
      const ex = exerciseIndex[entry.exerciseId];
      const name = ex ? ex.name : '(unknown exercise)';
      if (entry.type === 'cardio') {
        lines.push(row({
          date: s.date, session_name: s.name, exercise: name, exercise_type: 'cardio', set_number: 1,
          distance: entry.distance, distance_unit: entry.distanceUnit, duration_sec: entry.durationSec, note: entry.note,
        }));
      } else {
        (entry.sets || []).forEach((set, i) => {
          lines.push(row({
            date: s.date, session_name: s.name, exercise: name, exercise_type: 'strength', set_number: i + 1,
            weight_lb: set.weight, reps: set.reps, rpe: set.rpe, rest_sec: set.restSec, note: set.note,
          }));
        });
      }
    }
  }
  return lines.join('\n') + '\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/exporter.js tests/exporter.csv.test.js
git commit -m "feat: CSV export builder"
```

---

## Task 3: JSON backup builder

Full, lossless, version-stamped backup — the user's only backup path.

**Files:**
- Modify: `workout-tracker/js/exporter.js` (add `buildBackup`, `serializeBackup`)
- Test: `workout-tracker/tests/exporter.backup.test.js`

**Interfaces:**
- Consumes: `SCHEMA_VERSION` from `schema.js`.
- Produces: `buildBackup(state)`, `serializeBackup(state)`.

- [ ] **Step 1: Write the failing test** — `tests/exporter.backup.test.js`

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, serializeBackup } from '../js/exporter.js';
import { SCHEMA_VERSION } from '../js/schema.js';

const state = {
  settings: { key: 'app', units: 'lb' },
  exercises: [{ id: 'e1', name: 'Squat' }],
  routines: [{ id: 'r1', name: 'Legs' }],
  sessions: [{ id: 's1', date: '2026-09-15', name: 'W', entries: [] }],
};

test('buildBackup stamps version + timestamp and carries all stores', () => {
  const b = buildBackup(state);
  assert.equal(b.schemaVersion, SCHEMA_VERSION);
  assert.ok(!Number.isNaN(Date.parse(b.exportedAt)));
  assert.deepEqual(b.exercises, state.exercises);
  assert.deepEqual(b.routines, state.routines);
  assert.deepEqual(b.sessions, state.sessions);
  assert.deepEqual(b.settings, state.settings);
});

test('serializeBackup round-trips through JSON', () => {
  const parsed = JSON.parse(serializeBackup(state));
  assert.equal(parsed.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(parsed.sessions, state.sessions);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `buildBackup`/`serializeBackup` not exported.

- [ ] **Step 3: Write minimal implementation** — append to `js/exporter.js`

```javascript
import { SCHEMA_VERSION } from './schema.js';

export function buildBackup({ settings, exercises, routines, sessions } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: settings ?? null,
    exercises: exercises ?? [],
    routines: routines ?? [],
    sessions: sessions ?? [],
  };
}

export function serializeBackup(state) {
  return JSON.stringify(buildBackup(state), null, 2);
}
```

(Place the `import` line at the top of the file with the other module-level code.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/exporter.js tests/exporter.backup.test.js
git commit -m "feat: JSON backup builder"
```

---

## Task 4: Backup parse + validate

Reads a backup file back in safely: valid JSON, known version (migrated), sane shape.

**Files:**
- Create: `workout-tracker/js/importer.js`
- Test: `workout-tracker/tests/importer.parse.test.js`

**Interfaces:**
- Consumes: `migrate`, `SCHEMA_VERSION` from `schema.js`.
- Produces: `parseBackup(text)`, `parseExerciseSeed(text)`.

- [ ] **Step 1: Write the failing test** — `tests/importer.parse.test.js`

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBackup, parseExerciseSeed } from '../js/importer.js';
import { SCHEMA_VERSION } from '../js/schema.js';

test('parseBackup accepts a well-formed backup', () => {
  const text = JSON.stringify({ schemaVersion: SCHEMA_VERSION, exercises: [], routines: [], sessions: [], settings: null });
  const r = parseBackup(text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.sessions, []);
});

test('parseBackup rejects malformed JSON', () => {
  const r = parseBackup('{not json');
  assert.equal(r.ok, false);
  assert.match(r.error, /parse|json/i);
});

test('parseBackup rejects a newer schema version', () => {
  const text = JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, exercises: [] });
  const r = parseBackup(text);
  assert.equal(r.ok, false);
  assert.match(r.error, /newer/i);
});

test('parseBackup rejects wrong shape (missing arrays)', () => {
  const r = parseBackup(JSON.stringify({ schemaVersion: SCHEMA_VERSION, exercises: 'nope' }));
  assert.equal(r.ok, false);
});

test('parseExerciseSeed accepts a bare array or an {exercises:[]} wrapper', () => {
  assert.deepEqual(parseExerciseSeed('[{"name":"Squat"}]').exercises, [{ name: 'Squat' }]);
  assert.deepEqual(parseExerciseSeed('{"exercises":[{"name":"Bench"}]}').exercises, [{ name: 'Bench' }]);
  assert.equal(parseExerciseSeed('{}').ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../js/importer.js` missing.

- [ ] **Step 3: Write minimal implementation** — `js/importer.js` (parse portion)

```javascript
import { migrate } from './schema.js';

export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Could not parse JSON — is this a backup file?' };
  }
  try {
    const data = migrate(obj);
    for (const k of ['exercises', 'routines', 'sessions']) {
      if (!Array.isArray(data[k])) return { ok: false, error: `Backup is missing a valid "${k}" list` };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function parseExerciseSeed(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Could not parse JSON' };
  }
  const list = Array.isArray(obj) ? obj : obj.exercises;
  if (!Array.isArray(list)) return { ok: false, error: 'Expected an array of exercises or {"exercises":[...]}' };
  return { ok: true, exercises: list };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/importer.js tests/importer.parse.test.js
git commit -m "feat: backup parse + validate"
```

---

## Task 5: Merge logic (restore + exercise seed) — the Phase-2 seam

Add-if-name-absent exercise merge (never clobbers your edits) and replace-vs-merge restore.

**Files:**
- Modify: `workout-tracker/js/importer.js` (add `mergeExercises`, `applyRestore`)
- Test: `workout-tracker/tests/importer.merge.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `mergeExercises(existing, incoming)`, `applyRestore(existing, incoming, mode)`.

- [ ] **Step 1: Write the failing test** — `tests/importer.merge.test.js`

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeExercises, applyRestore } from '../js/importer.js';

test('mergeExercises adds new names, skips existing (case-insensitive)', () => {
  const existing = [{ id: 'a', name: 'Back Squat' }];
  const incoming = [{ id: 'x', name: 'back squat' }, { id: 'y', name: 'Bench Press' }];
  const { merged, added, skipped } = mergeExercises(existing, incoming);
  assert.equal(added, 1);
  assert.equal(skipped, 1);
  assert.equal(merged.length, 2);
  assert.ok(merged.find((e) => e.name === 'Bench Press'));
  assert.equal(merged.find((e) => e.name === 'Back Squat').id, 'a'); // original untouched
});

test('applyRestore replace mode returns the incoming state', () => {
  const existing = { settings: { units: 'lb' }, exercises: [{ id: 'a', name: 'A' }], routines: [], sessions: [{ id: 's' }] };
  const incoming = { settings: { units: 'kg' }, exercises: [{ id: 'b', name: 'B' }], routines: [], sessions: [] };
  const out = applyRestore(existing, incoming, 'replace');
  assert.deepEqual(out.exercises, incoming.exercises);
  assert.deepEqual(out.sessions, []);
  assert.equal(out.settings.units, 'kg');
});

test('applyRestore merge mode unions sessions/routines by id and merges exercises by name', () => {
  const existing = { settings: { units: 'lb' }, exercises: [{ id: 'a', name: 'Squat' }], routines: [{ id: 'r1' }], sessions: [{ id: 's1' }] };
  const incoming = { settings: { units: 'kg' }, exercises: [{ id: 'z', name: 'Squat' }, { id: 'w', name: 'Row' }], routines: [{ id: 'r1' }, { id: 'r2' }], sessions: [{ id: 's2' }] };
  const out = applyRestore(existing, incoming, 'merge');
  assert.equal(out.exercises.length, 2);            // Squat skipped, Row added
  assert.deepEqual(out.sessions.map((s) => s.id).sort(), ['s1', 's2']);
  assert.deepEqual(out.routines.map((r) => r.id).sort(), ['r1', 'r2']);
  assert.equal(out.settings.units, 'lb');           // merge keeps existing settings
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `mergeExercises`/`applyRestore` not exported.

- [ ] **Step 3: Write minimal implementation** — append to `js/importer.js`

```javascript
export function mergeExercises(existing, incoming) {
  const seen = new Set(existing.map((e) => e.name.trim().toLowerCase()));
  const merged = [...existing];
  let added = 0, skipped = 0;
  for (const ex of incoming) {
    const key = String(ex.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) { skipped++; continue; }
    seen.add(key);
    merged.push(ex);
    added++;
  }
  return { merged, added, skipped };
}

function unionById(a, b) {
  const byId = new Map();
  for (const r of [...a, ...b]) byId.set(r.id, byId.get(r.id) ?? r); // existing wins on id clash
  return [...byId.values()];
}

export function applyRestore(existing, incoming, mode) {
  if (mode === 'replace') {
    return {
      settings: incoming.settings ?? existing.settings,
      exercises: incoming.exercises ?? [],
      routines: incoming.routines ?? [],
      sessions: incoming.sessions ?? [],
    };
  }
  // merge
  return {
    settings: existing.settings,
    exercises: mergeExercises(existing.exercises, incoming.exercises ?? []).merged,
    routines: unionById(existing.routines, incoming.routines ?? []),
    sessions: unionById(existing.sessions, incoming.sessions ?? []),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all five test files green).

- [ ] **Step 5: Commit**

```bash
git add js/importer.js tests/importer.merge.test.js
git commit -m "feat: exercise merge + restore logic (phase-2 import seam)"
```

---

## Task 5b: IndexedDB storage wrapper

The single async gateway to on-device data. Browser-only; verified live (not node-tested — see Global Constraints).

**Files:**
- Create: `workout-tracker/js/storage.js`
- Modify: `workout-tracker/GATES.md` (add the storage smoke item)

**Interfaces:**
- Consumes: nothing (uses `indexedDB`).
- Produces: the full `storage.js` async API from the interface summary.

- [ ] **Step 1: Implement `js/storage.js`**

```javascript
const DB_NAME = 'workout-tracker';
const DB_VERSION = 1;
const KEYED = { exercises: 'id', routines: 'id', sessions: 'id', settings: 'key', meta: 'key' };

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [store, keyPath] of Object.entries(KEYED)) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    let result;
    Promise.resolve(fn(os)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const getAll = (store) => tx(store, 'readonly', (os) => reqP(os.getAll()));
export const get = (store, id) => tx(store, 'readonly', (os) => reqP(os.get(id)));
export const put = (store, rec) => tx(store, 'readwrite', (os) => reqP(os.put(rec)).then(() => rec));
export const remove = (store, id) => tx(store, 'readwrite', (os) => reqP(os.delete(id)));
export const bulkPut = (store, recs) => tx(store, 'readwrite', (os) => { for (const r of recs) os.put(r); });
export const getSingleton = (store, key) => get(store, key);
export const putSingleton = (store, rec) => put(store, rec);
export const clearAll = () => Promise.all(Object.keys(KEYED).map((s) => tx(s, 'readwrite', (os) => reqP(os.clear()))));

export async function exportState() {
  const [exercises, routines, sessions, settings] = await Promise.all([
    getAll('exercises'), getAll('routines'), getAll('sessions'), getSingleton('settings', 'app'),
  ]);
  return { settings: settings ?? { key: 'app', units: 'lb' }, exercises, routines, sessions };
}

export async function importState(state, mode) {
  if (mode === 'replace') await clearAll();
  if (state.settings) await putSingleton('settings', { key: 'app', units: 'lb', ...state.settings });
  await bulkPut('exercises', state.exercises ?? []);
  await bulkPut('routines', state.routines ?? []);
  await bulkPut('sessions', state.sessions ?? []);
}
```

- [ ] **Step 2: Add the storage smoke check to `GATES.md`**

Append under "Storage & first run":
```markdown
- [ ] In the preview console: `import('./js/storage.js').then(async s => { await s.put('exercises',{id:'t',name:'Test'}); console.log(await s.getAll('exercises')); })` returns the record; reload the page and it is still there.
```

- [ ] **Step 3: Verify live** (after Task 6 gives us a served page, run the console smoke check above). For now, commit.

- [ ] **Step 4: Commit**

```bash
git add js/storage.js GATES.md
git commit -m "feat: IndexedDB storage wrapper"
```

---

## Task 6: App shell, navigation, bootstrap + first-run seed

The served page: 5 tabs, a router, service-worker registration hook, and one-time seed load. First point where we run the preview.

**Files:**
- Create: `workout-tracker/index.html`, `workout-tracker/css/app.css`, `workout-tracker/js/app.js`, `workout-tracker/js/ui.js`, `workout-tracker/seed/exercises.default.json`
- Create: `workout-tracker/.claude/launch.json` (so the preview can serve the folder)

**Interfaces:**
- Consumes: `storage.openDb/getAll/bulkPut`, screen render functions (stubbed until their tasks land).
- Produces: `ui.el`, `ui.clear`, `ui.download`, `ui.pickFile`; `app` boots and calls `showScreen(name)`.

- [ ] **Step 1: Seed data** — `seed/exercises.default.json` (placeholder; replaced by research in Phase 2)

```json
{ "exercises": [
  { "name": "Back Squat", "type": "strength", "muscleGroup": "Legs", "equipment": "Barbell" },
  { "name": "Deadlift", "type": "strength", "muscleGroup": "Posterior chain", "equipment": "Barbell" },
  { "name": "Bench Press", "type": "strength", "muscleGroup": "Chest", "equipment": "Barbell" },
  { "name": "Overhead Press", "type": "strength", "muscleGroup": "Shoulders", "equipment": "Barbell" },
  { "name": "Barbell Row", "type": "strength", "muscleGroup": "Back", "equipment": "Barbell" },
  { "name": "Pull-up", "type": "strength", "muscleGroup": "Back", "equipment": "Bodyweight" },
  { "name": "Dumbbell Curl", "type": "strength", "muscleGroup": "Arms", "equipment": "Dumbbell" },
  { "name": "Treadmill Run", "type": "cardio", "muscleGroup": "Conditioning", "equipment": "Treadmill" },
  { "name": "Rowing Erg", "type": "cardio", "muscleGroup": "Conditioning", "equipment": "Rower" }
] }
```

- [ ] **Step 2: `js/ui.js`** — tiny DOM + file helpers

```javascript
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c.nodeType ? c : document.createTextNode(c));
  return node;
}
export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

export function download(filename, text, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function pickFile(accept = 'application/json') {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept });
    input.addEventListener('change', () => {
      const f = input.files[0];
      if (!f) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ name: f.name, text: reader.result });
      reader.readAsText(f);
    });
    input.click();
  });
}
```

- [ ] **Step 3: `index.html`** — shell with a header, a `<main id="screen">`, and a bottom tab bar

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0b0f14" />
  <link rel="manifest" href="./manifest.webmanifest" />
  <link rel="stylesheet" href="./css/app.css" />
  <title>Workout Tracker</title>
</head>
<body>
  <header class="topbar"><h1 id="screen-title">Log</h1></header>
  <main id="screen"></main>
  <nav class="tabbar">
    <button data-screen="log">Log</button>
    <button data-screen="routines">Routines</button>
    <button data-screen="library">Library</button>
    <button data-screen="history">History</button>
    <button data-screen="backup">Backup</button>
  </nav>
  <script type="module" src="./js/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: `css/app.css`** — mobile-first, dark, big tap targets (single-column; sticky bottom tabs)

```css
:root { --bg:#0b0f14; --card:#151b23; --ink:#e8eef5; --muted:#8ea0b5; --accent:#3aa0ff; --line:#243040; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.4 system-ui,sans-serif; padding-bottom:64px; }
.topbar { position:sticky; top:0; background:var(--bg); padding:14px 16px; border-bottom:1px solid var(--line); }
.topbar h1 { margin:0; font-size:20px; }
#screen { padding:16px; display:flex; flex-direction:column; gap:12px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px; }
button { font:inherit; color:var(--ink); background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 14px; min-height:44px; }
button.primary { background:var(--accent); color:#06121f; border:none; font-weight:600; }
input, select { font:inherit; color:var(--ink); background:#0e141b; border:1px solid var(--line); border-radius:10px; padding:12px; min-height:44px; width:100%; }
.row { display:flex; gap:8px; align-items:center; }
.tabbar { position:fixed; bottom:0; left:0; right:0; display:grid; grid-template-columns:repeat(5,1fr); background:var(--card); border-top:1px solid var(--line); }
.tabbar button { border:none; border-radius:0; min-height:56px; font-size:13px; color:var(--muted); }
.tabbar button[aria-current="true"] { color:var(--accent); }
.muted { color:var(--muted); }
```

- [ ] **Step 5: `js/app.js`** — bootstrap, router, seed, SW registration

```javascript
import { openDb, getAll, bulkPut } from './storage.js';
import { newExercise } from './schema.js';

// Screen renderers are attached by their modules; stubbed here until their tasks land.
const screens = {
  log: (root) => root.append(Object.assign(document.createElement('p'), { textContent: 'Log — coming in Task 9' })),
  routines: (root) => root.append(Object.assign(document.createElement('p'), { textContent: 'Routines — Task 8' })),
  library: (root) => root.append(Object.assign(document.createElement('p'), { textContent: 'Library — Task 7' })),
  history: (root) => root.append(Object.assign(document.createElement('p'), { textContent: 'History — Task 10' })),
  backup: (root) => root.append(Object.assign(document.createElement('p'), { textContent: 'Backup — Task 11' })),
};
export function registerScreen(name, fn) { screens[name] = fn; }

const titles = { log: 'Log', routines: 'Routines', library: 'Library', history: 'History', backup: 'Backup' };

export function showScreen(name) {
  const root = document.getElementById('screen');
  while (root.firstChild) root.removeChild(root.firstChild);
  document.getElementById('screen-title').textContent = titles[name] ?? name;
  document.querySelectorAll('.tabbar button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.screen === name)));
  (screens[name] ?? screens.log)(root);
}

async function seedIfEmpty() {
  const existing = await getAll('exercises');
  if (existing.length) return;
  const res = await fetch('./seed/exercises.default.json');
  const { exercises } = await res.json();
  await bulkPut('exercises', exercises.map((e) => newExercise({ ...e, custom: false })));
}

async function boot() {
  await openDb();
  await seedIfEmpty();
  document.querySelectorAll('.tabbar button').forEach((b) =>
    b.addEventListener('click', () => showScreen(b.dataset.screen)));
  showScreen('log');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}
boot();
```

- [ ] **Step 6: `.claude/launch.json`** so the preview can serve static files

```json
{ "version": "0.0.1", "configurations": [
  { "name": "workout-tracker", "runtimeExecutable": "python", "runtimeArgs": ["-m", "http.server", "5055"], "port": 5055 }
] }
```
(Python's built-in server — no npm fetch, keeps the zero-dep promise. Serves the folder over `localhost`, which satisfies the service worker's secure-context requirement for local testing.)

- [ ] **Step 7: Verify live in the preview**

Start the preview (`workout-tracker` config). Confirm: five tabs render and switch; the active tab highlights; no console errors; then run the Task 5b storage smoke check and confirm the 9 seed exercises persist across a reload (`getAll('exercises')` returns 9). Fix any issue in source and re-check.

- [ ] **Step 8: Commit**

```bash
git add index.html css/app.css js/app.js js/ui.js seed/exercises.default.json .claude/launch.json
git commit -m "feat: app shell, router, bootstrap + first-run seed"
```

---

## Task 7: Library screen (list, search, CRUD, import)

Directly answers the "incomplete list" complaint: complete, searchable, fully editable, importable.

**Files:**
- Create: `workout-tracker/js/library.js`
- Modify: `workout-tracker/js/app.js` (import library, `registerScreen('library', renderLibrary)`)
- Modify: `workout-tracker/GATES.md`

**Interfaces:**
- Consumes: `storage.getAll/put/remove`, `schema.newExercise`, `importer.parseExerciseSeed/mergeExercises`, `ui.el/clear/pickFile`, `app.registerScreen`.
- Produces: `renderLibrary(root)`.

- [ ] **Step 1: Implement `js/library.js`**

Behavior: load exercises (`getAll('exercises')`), sorted by name, hidden ones shown only when a "show hidden" toggle is on. A search box filters by name/muscle/equipment (case-insensitive substring). Each row: name + muscle/equipment subtitle + Edit and Hide/Unhide. "Add exercise" opens an inline form (name required, type select strength/cardio, muscle, equipment) → `newExercise({...})` → `put('exercises', ex)` → re-render. Edit reuses the form. "Import exercises (JSON)" → `pickFile()` → `parseExerciseSeed(text)` → `mergeExercises(current, incoming.exercises.map(normalize))` → `bulkPut` the added ones → show a `"Added N, skipped M"` line. Represent each incoming exercise through `newExercise` so shapes are valid before storing.

Key sketch:
```javascript
import { getAll, put, remove, bulkPut } from './storage.js';
import { newExercise } from './schema.js';
import { parseExerciseSeed, mergeExercises } from './importer.js';
import { el, clear, pickFile } from './ui.js';

export async function renderLibrary(root) {
  const all = (await getAll('exercises')).sort((a, b) => a.name.localeCompare(b.name));
  const state = { q: '', showHidden: false };
  const list = el('div');
  const draw = () => {
    clear(list);
    const rows = all.filter((e) => (state.showHidden || !e.hidden) &&
      [e.name, e.muscleGroup, e.equipment].join(' ').toLowerCase().includes(state.q));
    for (const e of rows) list.append(exerciseRow(e, root));
    if (!rows.length) list.append(el('p', { class: 'muted', text: 'No matches.' }));
  };
  const search = el('input', { placeholder: 'Search exercises', oninput: (ev) => { state.q = ev.target.value.toLowerCase(); draw(); } });
  root.append(
    el('button', { class: 'primary', text: '+ Add exercise', onclick: () => openForm(root) }),
    el('button', { text: 'Import exercises (JSON)', onclick: () => importSeed(root) }),
    search, list,
  );
  draw();
}
// exerciseRow(), openForm(), importSeed() implemented here — each re-renders via renderLibrary(root) after a storage write.
```
(Implement `exerciseRow`, `openForm`, `importSeed` in this file; on any change, `clear(root)` then `renderLibrary(root)`.)

- [ ] **Step 2: Wire into `app.js`**
```javascript
import { renderLibrary } from './library.js';
registerScreen('library', renderLibrary);
```

- [ ] **Step 3: Verify live** — Library tab lists the 9 seeds; search filters; add "Face Pull" and it persists across reload; edit it; hide it (disappears unless "show hidden"); import a 2-exercise JSON (one dup name, one new) → shows "Added 1, skipped 1". Fix + re-check.

- [ ] **Step 4: Add GATES items** (library add/edit/hide/import) and **commit**
```bash
git add js/library.js js/app.js GATES.md
git commit -m "feat: exercise library screen (CRUD + import)"
```

---

## Task 8: Routines screen (build workouts)

**Files:**
- Create: `workout-tracker/js/routines.js`
- Modify: `js/app.js`, `GATES.md`

**Interfaces:**
- Consumes: `storage.getAll/put/remove`, `schema.newRoutine/newRoutineItem`, `ui.*`, `app.registerScreen`.
- Produces: `renderRoutines(root)`.

- [ ] **Step 1: Implement `js/routines.js`** — list routines (name + item count) with Edit/Delete and a "+ New routine" button. The editor: routine name field; an "Add exercise" picker (dropdown of non-hidden library exercises) that appends a `newRoutineItem({exerciseId})`; each item shows the exercise name + optional target sets/reps number inputs + a remove (×) and simple up/down reorder. Save → `newRoutine` (or update existing, bump `updatedAt`) → `put('routines', r)` → back to list. Delete → `remove('routines', id)`.

Signature contract:
```javascript
export async function renderRoutines(root) { /* ... */ }
```

- [ ] **Step 2: Wire into `app.js`** (`import { renderRoutines }`, `registerScreen('routines', renderRoutines)`).

- [ ] **Step 3: Verify live** — create "Push A" with 3 exercises + target sets/reps; save; reload; it's still there with items intact; edit to add a 4th; delete a throwaway routine. Fix + re-check.

- [ ] **Step 4: GATES items + commit**
```bash
git add js/routines.js js/app.js GATES.md
git commit -m "feat: routine builder screen"
```

---

## Task 9: Log screen (active session — the core)

**Files:**
- Create: `workout-tracker/js/session.js`
- Modify: `js/app.js`, `GATES.md`

**Interfaces:**
- Consumes: `storage.getAll/get/put`, `schema.newSession/newStrengthEntry/newCardioEntry/newSet`, `ui.*`, `app.registerScreen/showScreen`.
- Produces: `renderLog(root)`.

- [ ] **Step 1: Implement `js/session.js`**

Behavior:
- **Start:** if no active session, show "Start freestyle" + a dropdown of routines ("Start from routine"). Starting from a routine creates a `newSession({name, routineId})` and pre-adds a `newStrengthEntry`/`newCardioEntry` per routine item (by the item's exercise type). **Persist immediately** with `put('sessions', session)` so a crash/close loses nothing. Track the active session id in `localStorage` (`activeSessionId`).
- **Log:** for each entry, show the exercise name and its sets. Strength: an "Add set" button appends a `newSet`; each set row has weight + reps + optional RPE + note inputs that write back to the set object; changing any input persists the session (`put`). Cardio: duration (mm:ss or seconds) + distance + unit + note, persisted on change. An "Add exercise" button appends an entry via the library picker.
- **Finish:** clears `activeSessionId`; the session stays in `sessions`; navigate to History (`showScreen('history')`).
- **Discard:** deletes the in-progress session (`remove`) and clears `activeSessionId`.

Persistence rule (state-safety): every mutation calls a single `save()` that does `put('sessions', session)` — no batching, so closing the tab mid-set is safe (SPEC §5).

Signature:
```javascript
export async function renderLog(root) { /* reads localStorage.activeSessionId, else shows the start screen */ }
```

- [ ] **Step 2: Wire into `app.js`** (replace the log stub with `registerScreen('log', renderLog)`).

- [ ] **Step 3: Verify live** — start from "Push A"; log 3 sets on the first lift (135×5, 155×5 @8, 155×5 @9 note "last one hard"); add an off-plan exercise; add a cardio finisher (Treadmill 20:00, 2.0 mi); **reload mid-session → everything is still there**; Finish → lands in History. Discard path also works. Fix + re-check.

- [ ] **Step 4: GATES items (incl. the reload-mid-session persistence gate) + commit**
```bash
git add js/session.js js/app.js GATES.md
git commit -m "feat: active session logging"
```

---

## Task 10: History screen

**Files:**
- Create: `workout-tracker/js/history.js`
- Modify: `js/app.js`, `GATES.md`

**Interfaces:**
- Consumes: `storage.getAll/get/remove`, `ui.*`, `app.registerScreen`.
- Produces: `renderHistory(root)`.

- [ ] **Step 1: Implement `js/history.js`** — sessions sorted by `date` descending; each card shows date, name, and a one-line summary (e.g., "5 exercises · 18 sets" for strength, distance/time for cardio). Tap a card → read-only detail listing each exercise and its sets. A Delete button on the detail (`remove('sessions', id)` after a confirm) returns to the list. (Editing a past session is out of scope — SPEC §10.)

Signature: `export async function renderHistory(root) { /* ... */ }`

- [ ] **Step 2: Wire into `app.js`.**

- [ ] **Step 3: Verify live** — the session from Task 9 shows with a correct summary; detail lists the sets accurately; delete removes it. Fix + re-check.

- [ ] **Step 4: GATES items + commit**
```bash
git add js/history.js js/app.js GATES.md
git commit -m "feat: history screen"
```

---

## Task 11: Backup / Export screen (wires the pure modules to the device)

**Files:**
- Create: `workout-tracker/js/backup.js`
- Modify: `js/app.js`, `GATES.md`

**Interfaces:**
- Consumes: `storage.exportState/importState/getAll`, `exporter.buildCsv/serializeBackup`, `importer.parseBackup/parseExerciseSeed/mergeExercises`, `ui.download/pickFile`, `app.registerScreen`.
- Produces: `renderBackup(root)`.

- [ ] **Step 1: Implement `js/backup.js`**

Behavior:
- **Export CSV:** `state = await exportState()`; build `exerciseIndex` from `state.exercises` (`{[id]:{name,type}}`); `download('workouts-YYYY-MM-DD.csv', buildCsv(state.sessions, index), 'text/csv')`; stamp `localStorage.lastExport = now` and show "Last exported: …".
- **Export JSON backup:** `download('workout-backup-YYYY-MM-DD.json', serializeBackup(state), 'application/json')`; update the reminder.
- **Import JSON:** `pickFile()`; try `parseBackup(text)` — if ok, ask replace-vs-merge, then `importState(data, mode)` and re-render; if not a full backup, try `parseExerciseSeed` and merge into the library, reporting added/skipped.
- **Reminder line:** because this is the only backup, show days since last export prominently.
- **(Settings)** a small "Units: lb ▸" (read-only in v1, kg toggle stored in settings) and a "Erase all data" behind a typed confirm.

Filename helper:
```javascript
const today = () => new Date().toISOString().slice(0, 10);
```

- [ ] **Step 2: Wire into `app.js`.**

- [ ] **Step 3: Verify live** — Export CSV → open the file, confirm the header row equals the SPEC §6 contract and the Task-9 sets appear one row per set with cardio on its own row; Export JSON → re-import in "replace" mode → data identical; import a seed-only JSON → library merges. Fix + re-check.

- [ ] **Step 4: GATES items (CSV columns, JSON round-trip, seed import) + commit**
```bash
git add js/backup.js js/app.js GATES.md
git commit -m "feat: backup/export screen wiring exporters + importers"
```

---

## Task 12: Service worker + web manifest + icons (install & offline)

**Files:**
- Create: `workout-tracker/manifest.webmanifest`, `workout-tracker/service-worker.js`, `workout-tracker/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
- Modify: `GATES.md`

**Interfaces:**
- Consumes: nothing (registration already wired in `app.js` Task 6).
- Produces: an installable, offline-capable app.

- [ ] **Step 1: `manifest.webmanifest`**
```json
{
  "name": "Workout Tracker", "short_name": "Workouts",
  "start_url": "./", "scope": "./", "display": "standalone",
  "background_color": "#0b0f14", "theme_color": "#0b0f14",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 2: Generate icons** — a simple flat dumbbell/kettlebell glyph on the `#0b0f14` ground at 192 and 512, plus a maskable 512 with safe-zone padding. (Author an SVG and rasterize to PNG, or hand-place; keep it plain.)

- [ ] **Step 3: `service-worker.js`** — precache the shell, cache-first, version-busted
```javascript
const CACHE = 'wt-v1';
const SHELL = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/app.js', './js/ui.js', './js/storage.js', './js/schema.js',
  './js/exporter.js', './js/importer.js', './js/library.js', './js/routines.js',
  './js/session.js', './js/history.js', './js/backup.js',
  './seed/exercises.default.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
```
(When a later deploy changes files, bump `CACHE` to `wt-v2` so clients refresh.)

- [ ] **Step 4: Verify live** — reload so the SW installs; in DevTools/preview, confirm registration and that the shell is cached; **turn on airplane mode / offline and confirm the full app still loads and logs a set**; confirm the install prompt/standalone launch works. Fix + re-check.

- [ ] **Step 5: GATES items (offline gate, install gate) + commit**
```bash
git add manifest.webmanifest service-worker.js icons/ GATES.md
git commit -m "feat: PWA manifest + service worker (install + offline)"
```

---

## Task 13: Vercel config, README, finalize GATES

**Files:**
- Create: `workout-tracker/vercel.json`, `workout-tracker/README.md`
- Modify: `GATES.md` (final pass)

**Interfaces:**
- Consumes: nothing.
- Produces: deploy-ready repo. Actual GitHub+Vercel wiring is handed to the `project-deploy-setup` / `vercel-deploy` skills at deploy time (do not hand-roll it here).

- [ ] **Step 1: `vercel.json`** — static, no build, don't cache the SW
```json
{
  "cleanUrls": true,
  "headers": [
    { "source": "/service-worker.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
  ]
}
```

- [ ] **Step 2: `README.md`** — what it is; run tests (`npm test`); preview locally; **install on the Pixel** (open the Vercel URL in Chrome → ⋮ → Add to Home screen); back up regularly via Export; the Phase-2 seam (import `exercises.seed.json`). Note data is on-device and clearing Chrome site data erases it — export is the backup.

- [ ] **Step 3: Final GATES pass** — walk the entire `GATES.md` end to end in the mobile preview; confirm `npm test` green.

- [ ] **Step 4: Commit** (deploy itself is a separate, user-driven step via the deploy skills)
```bash
git add vercel.json README.md GATES.md
git commit -m "docs: vercel config + README + final QA checklist"
```

---

## Self-Review (completed against SPEC)

**Spec coverage:**
- §2 build/log/export → Tasks 8 (routines/build), 9 (log), 11 (export). ✓
- §2 exercise library hybrid + editable + importable → Tasks 6 (seed), 7 (CRUD+import), 5 (merge). ✓
- §2 Phase-2 seam (import exercises) → Tasks 4/5 (pure) + 7/11 (UI). ✓
- §4 data model (5 stores, strength/cardio shapes, versioning) → Tasks 1 (shapes+migrate), 5b (stores). ✓
- §5 five screens + immediate-persist session → Tasks 6–11 (Task 9 persistence rule). ✓
- §6 CSV contract + JSON backup/restore + seed merge → Tasks 2, 3, 4, 5, 11. ✓
- §7 PWA install + offline → Task 12. ✓
- §8 repo layout → matches File Structure above. ✓
- §9 node:test for pure logic + GATES for browser → Tasks 1–5 automated; 5b–13 GATES. ✓
- §10 no rest timer (restSec present, unused), lb default, delete-not-edit history → honored in Tasks 1, 9, 10, 11. ✓

**Placeholder scan:** No TBD/TODO in steps. UI tasks (7–11) give interface + behavior + a code sketch + exact verification rather than every DOM handler line — deliberate per the spec's manual-verification decision; each still ends in an independently testable deliverable. Seed data is intentionally a labeled placeholder (SPEC §4), replaced in Phase 2.

**Type consistency:** `buildCsv(sessions, exerciseIndex)` where `exerciseIndex` = `{[id]:{name,type}}` used in Tasks 2 and 11. `applyRestore(existing, incoming, mode)` / `importState(state, mode)` share the `'replace'|'merge'` mode string across Tasks 5, 5b, 11. `newExercise({...custom})` used consistently in Tasks 1, 6, 7. `registerScreen(name, fn)` / `showScreen(name)` from Task 6 used by Tasks 7–11. `restSec` spelled identically in schema, CSV, and set shape.

---

## Notes for Phase 2 (not part of this plan)

`dataset.py` (research-curated, evidence-tagged exercises + a plan model) → `build.py` → `exercises.seed.json` + human-readable research deliverables (`.md`/`.html`/`.xlsx`, your codex pattern). The app already imports that JSON via Task 5/Task 11. Phase 2 gets its own SPEC + PLAN.
