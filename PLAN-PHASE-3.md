# Phase 3 "Gym Floor" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild logging around a one-exercise focus view that shows the Cycle 1 prescription and last time's numbers, so a normal set is one tap. Move the data to schema v2 with a safe, atomic migration.

**Architecture:** This is still a zero-build vanilla-JS PWA on IndexedDB. The new logic lives in pure, unit-tested modules (`format`, `catalog`, `progression`, `sessionLogic`, and the schema and migration in `schema`). The UI modules (`picker`, `focus`, `session`, and the other screens) are thin and get verified in the browser preview against `GATES.md`. Storage gains a multi-store transaction, so the migration and restore either fully succeed or change nothing.

**Tech Stack:** HTML/CSS/ES modules, IndexedDB, a service worker, and `node --test` with `node:assert/strict`. No dependencies.

**Spec:** [`SPEC-PHASE-3-4.md`](SPEC-PHASE-3-4.md), Phase 3 sections (§1–§7, §9–§12). Read it alongside this plan. The gap analysis behind it is [`GAP-ANALYSIS.md`](GAP-ANALYSIS.md).

## Global Constraints

- **No build, no dependencies.** No npm packages, no bundler, no transpiling. Tests use only `node:test`, `node:assert/strict` and `node:fs`.
- **Target:** Chrome on Android (Pixel), native ES modules.
- **Data stays on the device** in IndexedDB. The only network requests are the app fetching its own `./seed/*.json` files.
- **Units:** weight is always lb.
- **Pure modules** (`js/format.js`, `js/catalog.js`, `js/progression.js`, `js/sessionLogic.js`, `js/schema.js`, `js/exporter.js`, `js/importer.js`) touch no DOM and no IndexedDB. Their decision logic never reads the clock: "now" is passed in (`nowIso`). The only exceptions are the schema constructors (`newExercise`, `newRoutine`, `newSession`), which stamp creation times, and `buildBackup`'s `exportedAt`.
- **Offline cache:** every file in `js/`, `seed/` and `css/` must be listed in `SHELL` in `service-worker.js`. `tests/sw.shell.test.js` (Task 1) enforces this. Any task that creates a file there also adds it to `SHELL`.
- **Touch targets:** at least 44×44 px everywhere. Steppers and the main Log/Next button are at least 56 px tall.
- **Git:** always `git -C "C:/Users/Willi/Claude Code/workout-tracker" <command>`, one command per call. No `cd … &&`, no environment-variable prefixes. Every commit message ends with a second `-m` of `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Branch:** work on `phase-3` (it already exists and holds the spec). Don't push, and **don't deploy.** Deploying is a separate step that needs the user's approval after Task 20.
- **Tests:** run from the repo root (`C:\Users\Willi\Claude Code\workout-tracker`), for example `node --test tests/format.test.js`. The full suite is `node --test`.
- **Browser checks:** use the preview server named `workout-tracker` (port 5055) from `C:\Users\Willi\Claude Code\.claude\launch.json`, at a mobile viewport (`resize_window` preset `mobile`). The service worker doesn't register in the preview pane, and that's expected.
- **Mid-plan state:** between Tasks 3 and 12 the old boot code still runs against the new schema module. On a *fresh* database it seeds starter routines without rep ranges. That's expected and fixed in Task 12. Don't ship mid-plan.

## File map

| File | Status | Responsibility |
|---|---|---|
| `tests/sw.shell.test.js` | create (T1) | Guard: every `js/`, `seed/` and `css/` file is precached |
| `js/format.js` + `tests/format.test.js` | create (T2) | Number and duration parsing; target, set, date and minute formatting |
| `js/schema.js` + `tests/schema.test.js` | modify (T3) | v2 constructors, `defaultSettings`, `normalizeRange`, `compareRoutines`, `targetFromItem`, seed resolution |
| `js/schema.js` + `tests/schema.migrate.test.js` | modify (T4) | `SCHEMA_VERSION = 2`, `migrateV1toV2`, the `migrate` chain |
| `seed/routines.default.json` + `tests/seed.test.js` | modify (T5) | Cycle 1 prescriptions in v2 format |
| `js/catalog.js` + `tests/catalog.test.js` | create (T6) | Muscle-group order, filtering, grouping, `exerciseLabel` |
| `js/progression.js` + `tests/progression.test.js` | create (T7) | `lastPerformance`, `prefillSet`, `nextRoutine` |
| `js/sessionLogic.js` + `tests/sessionLogic.test.js` | create (T8) | Set counts, entry progress, finish summary and pruning |
| `js/exporter.js`, `js/importer.js` + their tests | modify (T9) | CSV v2, backup v2 (with bodyweight), `parseBackup` migration options, bodyweight restore |
| `js/keys.js`, `js/ui.js`, `js/app.js` | create/modify (T10) | localStorage keys, `field`, toast, `pickFile` cancel, `el` boolean attributes, screen lifecycle |
| `js/storage.js` | modify (T11) | `DB_VERSION` 2, `bodyweight` store, `transact`, `readAll`/`writeAll`, `getMeta`, `getSettings`, atomic restore |
| `js/app.js`, `tests/fixtures/load-v1-db.js`, `.gitignore` | modify/create (T12) | Boot migration, upgrade-failure screen, v1 fixture loader |
| `css/app.css` | rewrite (T13) | New components plus the accessibility and polish fixes |
| `js/picker.js` | create (T14) | Searchable exercise picker with quick-add |
| `js/session.js`, `js/focus.js`, `js/wakelock.js` | rewrite/create (T15) | Log start screen, focus view, overview, finish and discard, wake lock |
| `js/routines.js` | rewrite (T16) | Start button, range and RIR editor, picker, dirty-cancel |
| `js/library.js` | modify (T17) | Chips, count, empty state, weight step, import removed |
| `js/history.js` | rewrite (T18) | Button cards, duration, target lines, RIR/RPE, open by id |
| `js/backup.js` | rewrite (T19) | "Last backup" counts JSON only, migration on import, erase resets to a fresh install |
| `service-worker.js`, `GATES.md`, `README.md` | modify (T20) | Cache bump, Phase 3 gates, docs, full gate run |

---

### Task 1: Offline-cache guard test

**Files:**
- Create: `tests/sw.shell.test.js`

**Interfaces:**
- Consumes: `service-worker.js` (text), `js/`, `seed/`, `css/` directory listings.
- Produces: a failing test whenever a later task adds a file without listing it in `SHELL`.

- [ ] **Step 1: Write the guard test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// The service worker only works offline for files it precaches. A module missing from SHELL
// breaks the installed app at the gym, silently. This guard makes that a test failure instead.
const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const shell = new Set([...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]));

for (const dir of ['js', 'seed', 'css']) {
  test(`service worker precaches every file in ${dir}/`, () => {
    const files = readdirSync(new URL(`../${dir}/`, import.meta.url));
    const missing = files.filter((f) => !shell.has(`${dir}/${f}`));
    assert.deepEqual(missing, [], `add to SHELL in service-worker.js: ${missing.join(', ')}`);
  });
}
```

- [ ] **Step 2: Run it**

Run: `node --test tests/sw.shell.test.js`
Expected: PASS, 3 tests. Every current file is already listed. This is a guard for later tasks, so there's no red phase. To confirm it bites, temporarily delete `'./js/ui.js', ` from `SHELL`, re-run and see `add to SHELL … ui.js`, then restore the line.

- [ ] **Step 3: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add tests/sw.shell.test.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "test: guard that every app file is precached for offline use" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `format.js`, the shared parse and format helpers

**Files:**
- Create: `js/format.js`
- Create: `tests/format.test.js`
- Modify: `service-worker.js` (add `'./js/format.js',` to `SHELL`)

**Interfaces:**
- Produces (exact exports):
  - `numberOrNull(raw) → number|null`
  - `intOrNull(raw) → int|null`
  - `parseDuration(raw) → int|null` (seconds)
  - `formatDuration(sec) → string`
  - `formatRange(min, max) → string`
  - `formatRir(rir) → string`
  - `formatTarget(target) → string`
  - `formatSets(sets) → string`
  - `formatSetLine(set) → string`
  - `formatShortDate(iso) → string`
  - `formatMinutes(sec) → string`
  - `formatAgo(sec) → string`

- [ ] **Step 1: Write the failing tests**

`tests/format.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  numberOrNull, intOrNull, parseDuration, formatDuration, formatRange, formatTarget,
  formatSets, formatSetLine, formatShortDate, formatMinutes, formatAgo,
} from '../js/format.js';

test('numberOrNull keeps 0 and rejects junk', () => {
  assert.equal(numberOrNull(''), null);
  assert.equal(numberOrNull(null), null);
  assert.equal(numberOrNull(undefined), null);
  assert.equal(numberOrNull('0'), 0);
  assert.equal(numberOrNull('132.5'), 132.5);
  assert.equal(numberOrNull('abc'), null);
  assert.equal(numberOrNull('Infinity'), null);
});

test('intOrNull rounds to whole numbers', () => {
  assert.equal(intOrNull('8'), 8);
  assert.equal(intOrNull('7.6'), 8);
  assert.equal(intOrNull(''), null);
});

test('parseDuration accepts mm:ss, h:mm:ss and bare seconds', () => {
  assert.equal(parseDuration('20:00'), 1200);
  assert.equal(parseDuration('1:05:30'), 3930);
  assert.equal(parseDuration('90'), 90);
  assert.equal(parseDuration('75:00'), 4500);
  assert.equal(parseDuration(''), null);
});

test('parseDuration rejects malformed input', () => {
  for (const bad of ['1:2:3:4', '-5', '1:-5', 'abc', '1:75', '1:60:00', ':30', '10:']) {
    assert.equal(parseDuration(bad), null, bad);
  }
});

test('formatDuration switches to h:mm:ss from an hour', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3599), '59:59');
  assert.equal(formatDuration(3600), '1:00:00');
  assert.equal(formatDuration(3930), '1:05:30');
  assert.equal(formatDuration(null), '');
});

test('formatRange', () => {
  assert.equal(formatRange(6, 8), '6–8');
  assert.equal(formatRange(15, 15), '15');
  assert.equal(formatRange(null, 8), '8');
  assert.equal(formatRange(null, null), '');
});

test('formatTarget covers every combination', () => {
  assert.equal(formatTarget({ sets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: 'Primary press.' }), '3 × 6–8 @ RIR 2 · Primary press.');
  assert.equal(formatTarget({ sets: 3, repMin: 15, repMax: 15, rirMin: null, rirMax: null, note: '' }), '3 × 15');
  assert.equal(formatTarget({ sets: 2, repMin: 10, repMax: 12, rirMin: 1, rirMax: 2, note: '' }), '2 × 10–12 @ RIR 1–2');
  assert.equal(formatTarget({ sets: null, repMin: 8, repMax: 10, rirMin: null, rirMax: null, note: '' }), '8–10 reps');
  assert.equal(formatTarget({ sets: 3, repMin: null, repMax: null, rirMin: null, rirMax: null, note: '' }), '3 sets');
  assert.equal(formatTarget({ note: 'Do last.' }), 'Do last.');
  assert.equal(formatTarget(null), '');
  assert.equal(formatTarget({}), '');
});

test('formatSets groups a shared weight and handles bodyweight', () => {
  assert.equal(formatSets([{ weight: 135, reps: 8 }, { weight: 135, reps: 8 }, { weight: 135, reps: 7 }]), '135 × 8, 8, 7');
  assert.equal(formatSets([{ weight: 135, reps: 8 }, { weight: 140, reps: 6 }]), '135 × 8, 140 × 6');
  assert.equal(formatSets([{ weight: null, reps: 10 }, { weight: null, reps: 9 }]), 'BW × 10, 9');
  assert.equal(formatSets([]), '');
});

test('formatSetLine shows RIR, or legacy RPE when there is no RIR', () => {
  assert.equal(formatSetLine({ weight: 135, reps: 8, rir: 2, rpe: null }), '135 × 8 · RIR 2');
  assert.equal(formatSetLine({ weight: 135, reps: 8, rir: 4, rpe: null }), '135 × 8 · RIR 4+');
  assert.equal(formatSetLine({ weight: 135, reps: 8, rir: null, rpe: 8 }), '135 × 8 · RPE 8');
  assert.equal(formatSetLine({ weight: 0, reps: 0, rir: 0, rpe: null }), '0 × 0 · RIR 0');
  assert.equal(formatSetLine({ weight: null, reps: 12, rir: null, rpe: null }), 'BW × 12');
});

test('formatShortDate uses local time', () => {
  assert.equal(formatShortDate(new Date(2026, 8, 21, 18, 30).toISOString()), 'Mon Sep 21');
  assert.equal(formatShortDate('nope'), '');
});

test('formatMinutes and formatAgo', () => {
  assert.equal(formatMinutes(2520), '42 min');
  assert.equal(formatMinutes(20), '0 min');
  assert.equal(formatAgo(45 * 60), '45 min');
  assert.equal(formatAgo(2 * 3600), '2 h');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/format.test.js`
Expected: FAIL with `Cannot find module … js/format.js`.

- [ ] **Step 3: Implement `js/format.js`**

```js
// Pure parse/format helpers shared by every screen. No DOM, no storage, no clock.

// '' / null / undefined → null; otherwise Number(raw), or null if it isn't a finite number.
// Deliberately no `||` fallback: a real 0 (weight, reps) must stay 0.
export function numberOrNull(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// numberOrNull, rounded to a whole number (reps, sets, RIR).
export function intOrNull(raw) {
  const n = numberOrNull(raw);
  return n === null ? null : Math.round(n);
}

// "mm:ss", "h:mm:ss", or a bare number of seconds → whole seconds; anything malformed → null.
export function parseDuration(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (!s.includes(':')) {
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  const parts = s.split(':');
  if (parts.length > 3) return null;
  const nums = parts.map((p) => (p.trim() === '' ? NaN : Number(p)));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const [h, m, sec] = nums.length === 3 ? nums : [0, ...nums];
  if (sec >= 60 || (nums.length === 3 && m >= 60)) return null;
  return Math.round(h * 3600 + m * 60 + sec);
}

// Seconds → "m:ss", or "h:mm:ss" from an hour up. null/NaN → ''.
export function formatDuration(sec) {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return '';
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// 6, 8 → "6–8"; 15, 15 → "15"; one side missing → the other; both missing → "".
export function formatRange(min, max) {
  if ((min === null || min === undefined) && (max === null || max === undefined)) return '';
  if (min === null || min === undefined || max === null || max === undefined || min === max) return String(min ?? max);
  return `${min}–${max}`;
}

export const formatRir = (rir) => (rir === 4 ? '4+' : String(rir));

// A prescription → "3 × 6–8 @ RIR 2 · Primary press." Any part may be missing; none → "".
export function formatTarget(target) {
  if (!target) return '';
  const reps = formatRange(target.repMin ?? null, target.repMax ?? null);
  const sets = target.sets ?? null;
  let main = '';
  if (sets !== null && reps) main = `${sets} × ${reps}`;
  else if (reps) main = `${reps} reps`;
  else if (sets !== null) main = `${sets} sets`;
  const rir = formatRange(target.rirMin ?? null, target.rirMax ?? null);
  if (rir) main = main ? `${main} @ RIR ${rir}` : `RIR ${rir}`;
  return [main, target.note || ''].filter(Boolean).join(' · ');
}

const weightLabel = (w) => (w === null || w === undefined ? 'BW' : String(w));

// Sets → "135 × 8, 8, 7" when every set used one weight, else "135 × 8, 140 × 6".
export function formatSets(sets) {
  if (!sets || !sets.length) return '';
  const first = sets[0].weight ?? null;
  if (sets.every((s) => (s.weight ?? null) === first)) {
    return `${weightLabel(first)} × ${sets.map((s) => s.reps ?? '—').join(', ')}`;
  }
  return sets.map((s) => `${weightLabel(s.weight)} × ${s.reps ?? '—'}`).join(', ');
}

// One logged set → "135 × 8 · RIR 2". Legacy (v1) sets show "RPE 8" when they have no RIR.
export function formatSetLine(set) {
  let line = `${weightLabel(set.weight)} × ${set.reps ?? '—'}`;
  if (set.rir !== null && set.rir !== undefined) line += ` · RIR ${formatRir(set.rir)}`;
  else if (set.rpe !== null && set.rpe !== undefined) line += ` · RPE ${set.rpe}`;
  return line;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ISO → "Mon Sep 21" in local time; unparseable → ''.
export function formatShortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// Seconds → "42 min".
export function formatMinutes(sec) {
  return `${Math.max(0, Math.round(sec / 60))} min`;
}

// Seconds → "45 min" under an hour, else "2 h" (coarse, for "last set was … ago").
export function formatAgo(sec) {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
}
```

- [ ] **Step 4: Add to the offline cache**

In `service-worker.js`, change the line `'./js/session.js', './js/history.js', './js/backup.js',` to:

```js
  './js/session.js', './js/history.js', './js/backup.js',
  './js/format.js',
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/format.test.js tests/sw.shell.test.js`
Expected: PASS (11 + 3).

- [ ] **Step 6: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add js/format.js tests/format.test.js service-worker.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: shared parse/format helpers (format.js)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Schema v2 constructors and seed resolution

**Files:**
- Modify: `js/schema.js` (replace the whole file, keeping `SCHEMA_VERSION = 1` and the old `migrate` for now; Task 4 changes both)
- Modify: `tests/schema.test.js` (replace the whole file)

**Interfaces:**
- Consumes: nothing new.
- Produces (exact exports):
  - `SCHEMA_VERSION`, `VALID_TYPES`, `RIR_MAX = 4`
  - `newId()`
  - `clampRir(v) → int|null`
  - `defaultSettings() → {key,units,sessionsPerWeek,weeklySetBand,bodyweightRateBand,defaultWeightStep,keepScreenOn}`
  - `newExercise({name,type,muscleGroup,equipment,custom,weightStep})`
  - `normalizeRange(min,max) → [min,max]`
  - `newRoutineItem({exerciseId,targetSets,repMin,repMax,rirMin,rirMax,note})`
  - `newRoutine({name,items,position,origin})`
  - `compareRoutines(a,b)`
  - `targetFromItem(item, type='strength') → Target|{note}|null`
  - `newSession({name,routineId,date})`, which includes `finishedAt:null, cursor:0`
  - `newStrengthEntry(exerciseId, target=null)`
  - `newCardioEntry(exerciseId, target=null)`, which includes `done:false`
  - `newSet({weight,reps,rir,note,loggedAt}) → {weight,reps,rir,rpe:null,note,loggedAt}`
  - `idsByName(exercises) → {lowercasedName: id}`
  - `seedItemsFor(seedRoutine, idByName) → items[]`
  - `buildStarterRoutines(seed, exercises) → routines[]`
  - `migrate(data)` (unchanged in this task)

- [ ] **Step 1: Replace `tests/schema.test.js` with the v2 expectations**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION, VALID_TYPES, newId, newExercise, newRoutine, newRoutineItem, normalizeRange,
  compareRoutines, targetFromItem, newSession, newStrengthEntry, newCardioEntry, newSet,
  defaultSettings, idsByName, seedItemsFor, buildStarterRoutines, migrate,
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
  assert.equal(ex.weightStep, null);
  assert.ok(ex.id && ex.createdAt);
});

test('newExercise keeps a positive weightStep and drops a bad one', () => {
  assert.equal(newExercise({ name: 'DB Row', weightStep: 2.5 }).weightStep, 2.5);
  assert.equal(newExercise({ name: 'DB Row', weightStep: 0 }).weightStep, null);
  assert.equal(newExercise({ name: 'DB Row', weightStep: -5 }).weightStep, null);
});

test('newExercise rejects empty name and bad type', () => {
  assert.throws(() => newExercise({ name: '' }));
  assert.throws(() => newExercise({ name: 'X', type: 'yoga' }));
});

test('VALID_TYPES is strength + cardio', () => {
  assert.deepEqual([...VALID_TYPES].sort(), ['cardio', 'strength']);
});

test('defaultSettings', () => {
  assert.deepEqual(defaultSettings(), {
    key: 'app', units: 'lb', sessionsPerWeek: 3, weeklySetBand: [6, 12],
    bodyweightRateBand: [0.5, 1.0], defaultWeightStep: 5, keepScreenOn: true,
  });
});

test('normalizeRange copies a missing side and swaps reversed values', () => {
  assert.deepEqual(normalizeRange(6, 8), [6, 8]);
  assert.deepEqual(normalizeRange(8, null), [8, 8]);
  assert.deepEqual(normalizeRange(null, 8), [8, 8]);
  assert.deepEqual(normalizeRange(10, 8), [8, 10]);
  assert.deepEqual(normalizeRange(null, null), [null, null]);
  assert.deepEqual(normalizeRange('6', '8'), [6, 8]);
  assert.deepEqual(normalizeRange('', ''), [null, null]);
});

test('newRoutineItem normalizes ranges and clamps RIR to 0–4', () => {
  const it = newRoutineItem({ exerciseId: 'e1', targetSets: '3', repMin: 8, repMax: 6, rirMin: 2, rirMax: 9, note: 'x' });
  assert.deepEqual(it, { exerciseId: 'e1', targetSets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 4, note: 'x' });
  assert.throws(() => newRoutineItem({}));
});

test('newRoutine carries position and origin', () => {
  const r = newRoutine({ name: ' Push ', items: [], position: 2, origin: { cycle: 'cycle-1', key: 'push' } });
  assert.equal(r.name, 'Push');
  assert.equal(r.position, 2);
  assert.deepEqual(r.origin, { cycle: 'cycle-1', key: 'push' });
  assert.equal(r.createdAt, r.updatedAt);
  assert.throws(() => newRoutine({ name: '' }));
});

test('compareRoutines orders by position, then name; missing positions last', () => {
  const rs = [{ name: 'B' }, { name: 'Legs', position: 2 }, { name: 'Push', position: 0 }, { name: 'A' }, { name: 'Pull', position: 1 }];
  assert.deepEqual(rs.sort(compareRoutines).map((r) => r.name), ['Push', 'Pull', 'Legs', 'A', 'B']);
});

test('targetFromItem snapshots strength and cardio items', () => {
  const item = { exerciseId: 'e', targetSets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: 'n' };
  assert.deepEqual(targetFromItem(item), { sets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: 'n' });
  assert.deepEqual(targetFromItem({ exerciseId: 'b', note: 'Do last.' }, 'cardio'), { note: 'Do last.' });
  assert.equal(targetFromItem({ exerciseId: 'b', note: '' }, 'cardio'), null);
});

test('newSession starts empty, unfinished, at cursor 0', () => {
  const s = newSession({ name: 'Push A' });
  assert.equal(s.name, 'Push A');
  assert.deepEqual(s.entries, []);
  assert.equal(s.routineId, null);
  assert.equal(s.finishedAt, null);
  assert.equal(s.cursor, 0);
  assert.ok(!Number.isNaN(Date.parse(s.date)));
});

test('newStrengthEntry / newCardioEntry shapes', () => {
  assert.deepEqual(newStrengthEntry('ex1'), { exerciseId: 'ex1', type: 'strength', target: null, sets: [] });
  const t = { sets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: '' };
  assert.equal(newStrengthEntry('ex1', t).target, t);
  assert.deepEqual(newCardioEntry('ex2'), {
    exerciseId: 'ex2', type: 'cardio', target: null, done: false, durationSec: null, distance: null, distanceUnit: 'mi', note: '',
  });
});

test('newSet records RIR and loggedAt, clamps RIR, keeps rpe null', () => {
  const s = newSet({ weight: 135, reps: 8, rir: 2, loggedAt: '2026-09-21T18:05:00.000Z' });
  assert.deepEqual(s, { weight: 135, reps: 8, rir: 2, rpe: null, note: '', loggedAt: '2026-09-21T18:05:00.000Z' });
  assert.equal(newSet({ rir: 7 }).rir, 4);
  assert.equal(newSet({ rir: -1 }).rir, 0);
  assert.equal(newSet({}).rir, null);
});

test('seedItemsFor resolves exercise names and skips unknown ones', () => {
  const idByName = idsByName([{ id: 'b1', name: 'Barbell Bench Press' }, { id: 'k1', name: 'Stationary Bike' }]);
  const items = seedItemsFor({ items: [
    { exercise: 'barbell bench press', sets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: 'Primary.' },
    { exercise: 'Nope', sets: 3, repMin: 8, repMax: 10 },
    { exercise: 'Stationary Bike', sets: null, repMin: null, repMax: null, rirMin: null, rirMax: null, note: 'Do last.' },
  ] }, idByName);
  assert.deepEqual(items, [
    { exerciseId: 'b1', targetSets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: 'Primary.' },
    { exerciseId: 'k1', targetSets: null, repMin: null, repMax: null, rirMin: null, rirMax: null, note: 'Do last.' },
  ]);
});

test('buildStarterRoutines keeps seed order as position and stamps origin', () => {
  const exercises = [{ id: 'b1', name: 'Barbell Bench Press' }, { id: 'l1', name: 'Lat Pulldown' }];
  const seed = { routines: [
    { key: 'push', cycle: 'cycle-1', name: 'Push (Cycle 1)', items: [{ exercise: 'Barbell Bench Press', sets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: '' }] },
    { key: 'pull', cycle: 'cycle-1', name: 'Pull (Cycle 1)', items: [{ exercise: 'Lat Pulldown', sets: 3, repMin: 8, repMax: 10, rirMin: 2, rirMax: 2, note: '' }] },
    { key: 'ghost', cycle: 'cycle-1', name: 'Ghost', items: [{ exercise: 'Nope' }] },
  ] };
  const out = buildStarterRoutines(seed, exercises);
  assert.deepEqual(out.map((r) => [r.name, r.position, r.origin.key]), [['Push (Cycle 1)', 0, 'push'], ['Pull (Cycle 1)', 1, 'pull']]);
  assert.equal(out[0].items[0].exerciseId, 'b1');
  assert.equal(out[0].createdAt, out[0].updatedAt);
});

test('migrate is identity at current version and rejects newer', () => {
  const data = { schemaVersion: SCHEMA_VERSION, exercises: [] };
  assert.deepEqual(migrate(data), data);
  assert.throws(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/schema.test.js`
Expected: FAIL. `normalizeRange` and the other new exports don't exist yet, which surfaces as a `SyntaxError` about a missing export.

- [ ] **Step 3: Replace `js/schema.js`**

```js
export const SCHEMA_VERSION = 1;
export const VALID_TYPES = ['strength', 'cardio'];
export const RIR_MAX = 4;

export function newId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

const norm = (s) => String(s ?? '').trim().toLowerCase();

// '' / null / junk → null; otherwise a whole number.
function toIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Reps in reserve is a whole number from 0 to 4 (4 means "4+").
export function clampRir(v) {
  const n = toIntOrNull(v);
  return n === null ? null : Math.min(RIR_MAX, Math.max(0, n));
}

export function defaultSettings() {
  return {
    key: 'app', units: 'lb', sessionsPerWeek: 3, weeklySetBand: [6, 12],
    bodyweightRateBand: [0.5, 1.0], defaultWeightStep: 5, keepScreenOn: true,
  };
}

export function newExercise({ name, type = 'strength', muscleGroup = '', equipment = '', custom = true, weightStep = null } = {}) {
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
    // null → use settings.defaultWeightStep for the ± buttons.
    weightStep: typeof weightStep === 'number' && weightStep > 0 ? weightStep : null,
    createdAt: nowIso(),
  };
}

// A min/max pair: a missing side copies the other ("8" means 8–8); reversed values swap.
export function normalizeRange(min, max) {
  let a = toIntOrNull(min);
  let b = toIntOrNull(max);
  if (a === null) a = b;
  if (b === null) b = a;
  if (a !== null && a > b) [a, b] = [b, a];
  return [a, b];
}

export function newRoutineItem({ exerciseId, targetSets = null, repMin = null, repMax = null, rirMin = null, rirMax = null, note = '' } = {}) {
  if (!exerciseId) throw new Error('routine item needs an exerciseId');
  const [rMin, rMax] = normalizeRange(repMin, repMax);
  const [iMin, iMax] = normalizeRange(clampRir(rirMin), clampRir(rirMax));
  return { exerciseId, targetSets: toIntOrNull(targetSets), repMin: rMin, repMax: rMax, rirMin: iMin, rirMax: iMax, note: String(note ?? '') };
}

export function newRoutine({ name, items = [], position = 0, origin = null } = {}) {
  if (!name || !String(name).trim()) throw new Error('Routine name is required');
  const ts = nowIso();
  return { id: newId(), name: String(name).trim(), position, origin, items, createdAt: ts, updatedAt: ts };
}

// List order and the Up-next rotation: position first, then name. No position sorts last.
export function compareRoutines(a, b) {
  const pa = Number.isFinite(a.position) ? a.position : Infinity;
  const pb = Number.isFinite(b.position) ? b.position : Infinity;
  if (pa !== pb) return pa < pb ? -1 : 1;
  return String(a.name ?? '').localeCompare(String(b.name ?? ''));
}

// The prescription copied onto a session entry when a workout starts, so History keeps
// showing what was prescribed even after the routine changes.
export function targetFromItem(item, type = 'strength') {
  if (type === 'cardio') return item.note ? { note: item.note } : null;
  return {
    sets: item.targetSets ?? null, repMin: item.repMin ?? null, repMax: item.repMax ?? null,
    rirMin: item.rirMin ?? null, rirMax: item.rirMax ?? null, note: item.note ?? '',
  };
}

export function newSession({ name, routineId = null, date = nowIso() } = {}) {
  return {
    id: newId(), date, name: name ? String(name).trim() : 'Workout', routineId,
    notes: '', finishedAt: null, cursor: 0, entries: [],
  };
}

export function newStrengthEntry(exerciseId, target = null) {
  return { exerciseId, type: 'strength', target, sets: [] };
}

export function newCardioEntry(exerciseId, target = null) {
  return { exerciseId, type: 'cardio', target, done: false, durationSec: null, distance: null, distanceUnit: 'mi', note: '' };
}

// A set exists only once it's logged. `rpe` stays null on new sets (it's read-only legacy data).
export function newSet({ weight = null, reps = null, rir = null, note = '', loggedAt = null } = {}) {
  return { weight, reps, rir: clampRir(rir), rpe: null, note, loggedAt };
}

export function idsByName(exercises) {
  const out = {};
  for (const e of exercises) out[norm(e.name)] = e.id;
  return out;
}

// A v2 seed routine's items → routine items, resolving exercise names; unknown names are skipped.
export function seedItemsFor(seedRoutine, idByName) {
  return (seedRoutine.items || [])
    .map((it) => {
      const exerciseId = idByName[norm(it.exercise)];
      return exerciseId
        ? newRoutineItem({
          exerciseId, targetSets: it.sets ?? null, repMin: it.repMin ?? null, repMax: it.repMax ?? null,
          rirMin: it.rirMin ?? null, rirMax: it.rirMax ?? null, note: it.note || '',
        })
        : null;
    })
    .filter(Boolean);
}

// Fresh-install starter routines from routines.default.json, positioned in seed order.
export function buildStarterRoutines(seed, exercises) {
  const idByName = idsByName(exercises);
  return (seed.routines || [])
    .map((r, i) => {
      const items = seedItemsFor(r, idByName);
      return items.length ? newRoutine({ name: r.name, items, position: i, origin: { cycle: r.cycle, key: r.key } }) : null;
    })
    .filter(Boolean);
}

export function migrate(data) {
  const v = data?.schemaVersion ?? SCHEMA_VERSION;
  if (v > SCHEMA_VERSION) throw new Error(`Backup is from a newer version (${v}); update the app first`);
  return data;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test`
Expected: PASS for the whole suite. The old session and routines screens still call `newSet()`, `newStrengthEntry(id)` and `newRoutineItem({exerciseId})`, and those calls still work.

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add js/schema.js tests/schema.test.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: schema v2 constructors (ranges, RIR, targets, positions) and seed resolution" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Migration v1 → v2

**Files:**
- Modify: `js/schema.js` (bump `SCHEMA_VERSION`; replace `migrate`; add `migrateV1toV2`)
- Create: `tests/schema.migrate.test.js`

**Interfaces:**
- Consumes (Task 3): `newRoutineItem`, `idsByName`, `seedItemsFor`, `defaultSettings`.
- Produces:
  - `SCHEMA_VERSION = 2`
  - `migrateV1toV2(state, { seedRoutines = null, seedExerciseNames = null } = {}) → state`, where the state is `{ settings, exercises, routines, sessions, bodyweight, …any other keys kept }`. It's pure and never mutates its input.
  - `migrate(data, opts = {})`: v1 → `{ ...migrateV1toV2(data, opts), schemaVersion: 2 }`; v2 is returned unchanged; newer versions throw.

- [ ] **Step 1: Write the failing tests**

`tests/schema.migrate.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, migrate, migrateV1toV2 } from '../js/schema.js';

const T1 = '2026-09-16T12:00:00.000Z';
const T2 = '2026-09-18T09:00:00.000Z';

const seedRoutines = [
  { key: 'push', cycle: 'cycle-1', name: 'Push (Cycle 1)', items: [
    { exercise: 'Barbell Bench Press', sets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: 'Primary press.' },
    { exercise: 'Stationary Bike', sets: null, repMin: null, repMax: null, rirMin: null, rirMax: null, note: 'Do last.' },
  ] },
  { key: 'legs', cycle: 'cycle-1', name: 'Legs (Cycle 1)', items: [
    { exercise: 'Back Squat', sets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 3, note: 'Primary squat.' },
  ] },
];
const seedExerciseNames = ['Barbell Bench Press', 'Stationary Bike', 'Back Squat', 'Rowing Erg'];
const opts = { seedRoutines, seedExerciseNames };

function v1State() {
  const ex = (id, name, extra = {}) => ({ id, name, type: 'strength', muscleGroup: '', equipment: '', custom: false, hidden: false, createdAt: T1, ...extra });
  return {
    settings: { key: 'app', units: 'lb' },
    exercises: [
      ex('bench', 'Barbell Bench Press'),
      ex('bike', 'Stationary Bike', { type: 'cardio' }),
      ex('squat', 'Back Squat'),
      ex('erg', 'Rowing Erg', { type: 'cardio' }),
      ex('old-bench', 'Bench Press'),               // legacy default, unreferenced → hidden
      ex('old-dl', 'Deadlift'),                     // legacy default, used by a session → stays
      ex('mine', 'My Cable Curl', { custom: true }), // custom → never touched
    ],
    routines: [
      { id: 'r-arms', name: 'Arms', createdAt: T1, updatedAt: T2, items: [{ exerciseId: 'mine', targetSets: 2, targetReps: 12, note: '' }] },
      { id: 'r-legs', name: 'Legs (Cycle 1)', createdAt: T1, updatedAt: T2, items: [{ exerciseId: 'squat', targetSets: 3, targetReps: 7, note: 'mine now' }] },
      { id: 'r-push', name: 'Push (Cycle 1)', createdAt: T1, updatedAt: T1, items: [{ exerciseId: 'bench', targetSets: 3, targetReps: 8, note: '6-8 @ RIR 2' }] },
    ],
    sessions: [
      { id: 's1', date: '2026-09-21T17:30:00.000Z', name: 'Push (Cycle 1)', routineId: 'r-push', notes: '', entries: [
        { exerciseId: 'bench', type: 'strength', sets: [{ weight: 135, reps: 8, rpe: 8, restSec: null, note: '' }] },
        { exerciseId: 'bike', type: 'cardio', durationSec: 480, distance: null, distanceUnit: 'mi', note: '' },
      ] },
      { id: 's0', date: '2026-09-17T17:30:00.000Z', name: 'Workout', routineId: null, notes: '', entries: [
        { exerciseId: 'old-dl', type: 'strength', sets: [{ weight: 185, reps: 5, rpe: null, restSec: null, note: '' }] },
        { exerciseId: 'erg', type: 'cardio', durationSec: null, distance: null, distanceUnit: 'mi', note: '' },
      ] },
    ],
  };
}

test('SCHEMA_VERSION is 2', () => assert.equal(SCHEMA_VERSION, 2));

test('routine items: targetReps becomes a min/max range, RIR starts empty', () => {
  const arms = migrateV1toV2(v1State(), opts).routines.find((r) => r.id === 'r-arms');
  assert.deepEqual(arms.items, [{ exerciseId: 'mine', targetSets: 2, repMin: 12, repMax: 12, rirMin: null, rirMax: null, note: '' }]);
  assert.equal(arms.origin, null);
});

test('an unedited starter routine gets the seed prescriptions, keeping its id', () => {
  const push = migrateV1toV2(v1State(), opts).routines.find((r) => r.id === 'r-push');
  assert.deepEqual(push.origin, { cycle: 'cycle-1', key: 'push' });
  assert.deepEqual(push.items, [
    { exerciseId: 'bench', targetSets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: 'Primary press.' },
    { exerciseId: 'bike', targetSets: null, repMin: null, repMax: null, rirMin: null, rirMax: null, note: 'Do last.' },
  ]);
});

test('an edited starter routine is left alone (shape upgrade only)', () => {
  const legs = migrateV1toV2(v1State(), opts).routines.find((r) => r.id === 'r-legs');
  assert.equal(legs.origin, null);
  assert.deepEqual(legs.items, [{ exerciseId: 'squat', targetSets: 3, repMin: 7, repMax: 7, rirMin: null, rirMax: null, note: 'mine now' }]);
});

test('positions follow seed order, then everything else by name', () => {
  const out = migrateV1toV2(v1State(), opts);
  assert.deepEqual(Object.fromEntries(out.routines.map((r) => [r.name, r.position])), { 'Push (Cycle 1)': 0, 'Legs (Cycle 1)': 1, Arms: 2 });
});

test('legacy defaults are hidden only when nothing references them', () => {
  const byId = Object.fromEntries(migrateV1toV2(v1State(), opts).exercises.map((e) => [e.id, e]));
  assert.equal(byId['old-bench'].hidden, true);
  assert.equal(byId['old-dl'].hidden, false);
  assert.equal(byId.mine.hidden, false);
  assert.equal(byId.bench.hidden, false);
  assert.equal(byId.bench.weightStep, null);
});

test('sessions: sets gain rir/loggedAt, keep rpe, lose restSec; cardio done = something was logged', () => {
  const out = migrateV1toV2(v1State(), opts);
  const s1 = out.sessions.find((s) => s.id === 's1');
  assert.equal(s1.finishedAt, null);
  assert.equal(s1.cursor, 0);
  assert.equal(s1.entries[0].target, null);
  assert.deepEqual(s1.entries[0].sets, [{ weight: 135, reps: 8, rir: null, rpe: 8, note: '', loggedAt: null }]);
  assert.equal(s1.entries[1].done, true);
  assert.equal(out.sessions.find((s) => s.id === 's0').entries[1].done, false);
});

test('settings get defaults, existing values win; bodyweight starts empty', () => {
  const out = migrateV1toV2({ ...v1State(), settings: { key: 'app', units: 'lb', defaultWeightStep: 10 } }, opts);
  assert.equal(out.settings.defaultWeightStep, 10);
  assert.equal(out.settings.keepScreenOn, true);
  assert.deepEqual(out.bodyweight, []);
});

test('without seed options: no refresh, no hiding', () => {
  const out = migrateV1toV2(v1State());
  assert.equal(out.routines.find((r) => r.id === 'r-push').origin, null);
  assert.equal(out.exercises.find((e) => e.id === 'old-bench').hidden, false);
});

test('migration is idempotent and does not mutate its input', () => {
  const input = v1State();
  const snapshot = JSON.stringify(input);
  const once = migrateV1toV2(input, opts);
  assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(migrateV1toV2(once, opts), once);
});

test('migrate chains v1 backups to v2, leaves v2 alone, rejects newer', () => {
  const out = migrate({ schemaVersion: 1, exportedAt: T1, ...v1State() }, opts);
  assert.equal(out.schemaVersion, 2);
  assert.equal(out.exportedAt, T1);
  assert.equal(out.routines.find((r) => r.id === 'r-push').items[0].repMin, 6);
  const v2 = { schemaVersion: 2, exercises: [] };
  assert.equal(migrate(v2), v2);
  assert.throws(() => migrate({ schemaVersion: 3 }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/schema.migrate.test.js`
Expected: FAIL with a missing `migrateV1toV2` export.

- [ ] **Step 3: Implement it in `js/schema.js`**

Change `export const SCHEMA_VERSION = 1;` to `export const SCHEMA_VERSION = 2;`. Then replace the old `migrate` function at the bottom of the file with:

```js
// v1 → v2 (spec §5.1). Pure: returns a new state, never mutates `state`. Idempotent.
// With `seedRoutines`, unedited starter routines (updatedAt === createdAt) get the seed's
// prescriptions. With `seedExerciseNames`, unused non-custom exercises that aren't in the
// current seed (old placeholders like "Bench Press") are hidden. Hidden, never deleted.
export function migrateV1toV2(state, { seedRoutines = null, seedExerciseNames = null } = {}) {
  const exercisesIn = state.exercises ?? [];

  // 1. Routines: range fields, position (seed order first, then by name), origin.
  const seedOrder = (seedRoutines ?? []).map((r) => norm(r.name));
  const rank = (r) => {
    const i = seedOrder.indexOf(norm(r.name));
    return i === -1 ? seedOrder.length : i;
  };
  const ordered = [...(state.routines ?? [])].sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)));
  let routines = ordered.map((r, i) => ({
    ...r,
    position: Number.isFinite(r.position) ? r.position : i,
    origin: r.origin ?? null,
    items: (r.items || []).filter((it) => it && it.exerciseId).map((it) => newRoutineItem({
      exerciseId: it.exerciseId,
      targetSets: it.targetSets ?? null,
      repMin: it.repMin ?? it.targetReps ?? null,
      repMax: it.repMax ?? it.targetReps ?? null,
      rirMin: it.rirMin ?? null,
      rirMax: it.rirMax ?? null,
      note: it.note ?? '',
    })),
  }));

  // 2. Starter refresh: only routines you never edited.
  if (seedRoutines) {
    const idByName = idsByName(exercisesIn);
    routines = routines.map((r) => {
      const seed = seedRoutines.find((s) => norm(s.name) === norm(r.name));
      if (!seed || r.updatedAt !== r.createdAt) return r;
      const items = seedItemsFor(seed, idByName);
      return items.length ? { ...r, items, origin: { cycle: seed.cycle, key: seed.key } } : r;
    });
  }

  // 3. Sessions.
  const sessions = (state.sessions ?? []).map((s) => ({
    ...s,
    notes: s.notes ?? '',
    finishedAt: s.finishedAt ?? null,
    cursor: Number.isInteger(s.cursor) ? s.cursor : 0,
    entries: (s.entries || []).map((e) => (e.type === 'cardio'
      ? {
        ...e,
        target: e.target ?? null,
        // v1 pre-added cardio from routines whether or not you did it: done = something was logged.
        done: typeof e.done === 'boolean' ? e.done : (e.durationSec != null || e.distance != null),
      }
      : {
        ...e,
        target: e.target ?? null,
        sets: (e.sets || []).map((set) => ({
          weight: set.weight ?? null, reps: set.reps ?? null, rir: set.rir ?? null,
          rpe: set.rpe ?? null, note: set.note ?? '', loggedAt: set.loggedAt ?? null,
        })),
      })),
  }));

  // 4. Exercises: weightStep, and hide unused legacy defaults.
  const referenced = new Set();
  for (const r of routines) for (const it of r.items) referenced.add(it.exerciseId);
  for (const s of sessions) for (const e of s.entries) referenced.add(e.exerciseId);
  const seedNames = seedExerciseNames ? new Set(seedExerciseNames.map(norm)) : null;
  const exercises = exercisesIn.map((e) => {
    const out = { ...e, weightStep: e.weightStep ?? null };
    if (seedNames && e.custom === false && !seedNames.has(norm(e.name)) && !referenced.has(e.id)) out.hidden = true;
    return out;
  });

  return {
    ...state,
    settings: { ...defaultSettings(), ...(state.settings ?? {}), key: 'app' },
    exercises,
    routines,
    sessions,
    bodyweight: state.bodyweight ?? [],
  };
}

// Brings an imported backup up to SCHEMA_VERSION. `opts` is passed to the v1 → v2 step.
export function migrate(data, opts = {}) {
  const v = data?.schemaVersion ?? SCHEMA_VERSION;
  if (v > SCHEMA_VERSION) throw new Error(`Backup is from a newer version (${v}); update the app first`);
  let out = data;
  if (v < 2) out = { ...migrateV1toV2(out, opts), schemaVersion: 2 };
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test`
Expected: PASS, including the older `importer.parse.test.js`. Its fixtures use `SCHEMA_VERSION`, so they're v2 now and pass through unchanged.

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add js/schema.js tests/schema.migrate.test.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: pure, idempotent v1-to-v2 migration (ranges, starter refresh, legacy hide)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Cycle 1 prescriptions in the v2 seed

**Files:**
- Modify: `seed/routines.default.json` (replace the whole file)
- Create: `tests/seed.test.js`

**Interfaces:**
- Consumes: `buildStarterRoutines`, `newExercise` (Task 3).
- Produces: the v2 seed format `{ routines: [{ key, cycle, name, items: [{ exercise, sets, repMin, repMax, rirMin, rirMax, note }] }] }`, used by Task 12's boot.

- [ ] **Step 1: Write the failing test**

`tests/seed.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStarterRoutines, newExercise } from '../js/schema.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const exSeed = read('seed/exercises.default.json');
const rtSeed = read('seed/routines.default.json');

test('every seeded routine item names an exercise in the exercise seed', () => {
  const names = new Set(exSeed.exercises.map((e) => e.name));
  const missing = rtSeed.routines.flatMap((r) => r.items.map((it) => it.exercise)).filter((n) => !names.has(n));
  assert.deepEqual(missing, []);
});

test('the starter routines resolve completely: Push, Pull, Legs with 6 items each', () => {
  const exercises = exSeed.exercises.map((e) => newExercise({ ...e, custom: false }));
  const routines = buildStarterRoutines(rtSeed, exercises);
  assert.deepEqual(routines.map((r) => [r.name, r.position, r.origin.cycle, r.origin.key, r.items.length]), [
    ['Push (Cycle 1)', 0, 'cycle-1', 'push', 6],
    ['Pull (Cycle 1)', 1, 'cycle-1', 'pull', 6],
    ['Legs (Cycle 1)', 2, 'cycle-1', 'legs', 6],
  ]);
});

test('prescriptions match workout-research/cycle-1.md', () => {
  const rows = rtSeed.routines.flatMap((r) => r.items.map((it) => [r.key, it.exercise, it.sets, it.repMin, it.repMax, it.rirMin, it.rirMax].join('|')));
  assert.deepEqual(rows, [
    'push|Barbell Bench Press|3|6|8|2|2',
    'push|Overhead Press|3|8|10|2|2',
    'push|Incline Dumbbell Press|2|10|12|1|2',
    'push|Cable Lateral Raise|3|12|15|0|1',
    'push|Triceps Pushdown|3|10|12|1|1',
    'push|Stationary Bike|||||',
    'pull|Lat Pulldown|3|8|10|2|2',
    'pull|Chest-Supported Row|3|8|10|2|2',
    'pull|Seated Cable Row|2|10|12|1|2',
    'pull|Face Pull|3|15|15||',
    'pull|Dumbbell Curl|3|10|12|1|1',
    'pull|Rowing Erg|||||',
    'legs|Back Squat|3|6|8|2|3',
    'legs|Romanian Deadlift|3|8|10|2|2',
    'legs|Leg Press|2|12|15|1|1',
    'legs|Seated Leg Curl|3|10|12|1|1',
    'legs|Standing Calf Raise|3|12|15||',
    'legs|Stationary Bike|||||',
  ]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/seed.test.js`
Expected: FAIL. The v1 seed has no `key`/`cycle` and uses `targetReps`, so `origin.cycle` is undefined and the rows don't match.

- [ ] **Step 3: Replace `seed/routines.default.json`**

```json
{
  "routines": [
    {
      "key": "push",
      "cycle": "cycle-1",
      "name": "Push (Cycle 1)",
      "items": [
        { "exercise": "Barbell Bench Press", "sets": 3, "repMin": 6, "repMax": 8, "rirMin": 2, "rirMax": 2, "note": "Primary press. Rest ~2 min." },
        { "exercise": "Overhead Press", "sets": 3, "repMin": 8, "repMax": 10, "rirMin": 2, "rirMax": 2, "note": "" },
        { "exercise": "Incline Dumbbell Press", "sets": 2, "repMin": 10, "repMax": 12, "rirMin": 1, "rirMax": 2, "note": "" },
        { "exercise": "Cable Lateral Raise", "sets": 3, "repMin": 12, "repMax": 15, "rirMin": 0, "rirMax": 1, "note": "" },
        { "exercise": "Triceps Pushdown", "sets": 3, "repMin": 10, "repMax": 12, "rirMin": 1, "rirMax": 1, "note": "" },
        { "exercise": "Stationary Bike", "sets": null, "repMin": null, "repMax": null, "rirMin": null, "rirMax": null, "note": "Do last. ~8 min: 30 s hard / 60 s easy × 5–6." }
      ]
    },
    {
      "key": "pull",
      "cycle": "cycle-1",
      "name": "Pull (Cycle 1)",
      "items": [
        { "exercise": "Lat Pulldown", "sets": 3, "repMin": 8, "repMax": 10, "rirMin": 2, "rirMax": 2, "note": "Primary vertical pull. Swap: Pull-up." },
        { "exercise": "Chest-Supported Row", "sets": 3, "repMin": 8, "repMax": 10, "rirMin": 2, "rirMax": 2, "note": "Spares the low back." },
        { "exercise": "Seated Cable Row", "sets": 2, "repMin": 10, "repMax": 12, "rirMin": 1, "rirMax": 2, "note": "" },
        { "exercise": "Face Pull", "sets": 3, "repMin": 15, "repMax": 15, "rirMin": null, "rirMax": null, "note": "Rear delts, shoulder health." },
        { "exercise": "Dumbbell Curl", "sets": 3, "repMin": 10, "repMax": 12, "rirMin": 1, "rirMax": 1, "note": "" },
        { "exercise": "Rowing Erg", "sets": null, "repMin": null, "repMax": null, "rirMin": null, "rirMax": null, "note": "Do last. ~8 min: 30 s hard / 60 s easy × 5–6 (or bike)." }
      ]
    },
    {
      "key": "legs",
      "cycle": "cycle-1",
      "name": "Legs (Cycle 1)",
      "items": [
        { "exercise": "Back Squat", "sets": 3, "repMin": 6, "repMax": 8, "rirMin": 2, "rirMax": 3, "note": "Primary squat. Rest ~2–3 min. Swap: Hack Squat." },
        { "exercise": "Romanian Deadlift", "sets": 3, "repMin": 8, "repMax": 10, "rirMin": 2, "rirMax": 2, "note": "Hip hinge, hamstrings." },
        { "exercise": "Leg Press", "sets": 2, "repMin": 12, "repMax": 15, "rirMin": 1, "rirMax": 1, "note": "" },
        { "exercise": "Seated Leg Curl", "sets": 3, "repMin": 10, "repMax": 12, "rirMin": 1, "rirMax": 1, "note": "" },
        { "exercise": "Standing Calf Raise", "sets": 3, "repMin": 12, "repMax": 15, "rirMin": null, "rirMax": null, "note": "" },
        { "exercise": "Stationary Bike", "sets": null, "repMin": null, "repMax": null, "rirMin": null, "rirMax": null, "note": "EASY Zone 2 cool-down, ~6–8 min. Not intervals on leg day." }
      ]
    }
  ]
}
```

(The cardio notes leave out "Track it on your Garmin". The focus view adds that line for every cardio exercise, per spec §7.2a.)

- [ ] **Step 4: Run the tests**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add seed/routines.default.json tests/seed.test.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: Cycle 1 prescriptions (rep ranges, RIR) in the v2 routine seed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `catalog.js`, grouping and filtering exercises

**Files:**
- Create: `js/catalog.js`
- Create: `tests/catalog.test.js`
- Modify: `service-worker.js` (add `'./js/catalog.js',` after `'./js/format.js',`)

**Interfaces:**
- Produces:
  - `MUSCLE_ORDER`
  - `groupOf(e) → string` (empty → `'Other'`)
  - `compareGroups(a,b)`
  - `groupsPresent(exercises) → string[]`
  - `filterExercises(exercises, { q='', group=null }) → exercises[]` (sorted by name)
  - `groupByMuscle(exercises) → [{ group, items }]`
  - `nameExists(exercises, name) → bool`
  - `exerciseLabel(ex) → string`

- [ ] **Step 1: Write the failing tests**

`tests/catalog.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupsPresent, filterExercises, groupByMuscle, nameExists, exerciseLabel } from '../js/catalog.js';

const ex = (name, muscleGroup, equipment = '', extra = {}) => ({ id: name, name, type: 'strength', muscleGroup, equipment, hidden: false, ...extra });
const list = [
  ex('Leg Press', 'Legs', 'Machine'),
  ex('Barbell Bench Press', 'Chest', 'Barbell'),
  ex('Face Pull', 'Shoulders', 'Cable'),
  ex('Air Bike', 'Conditioning', 'Bike', { type: 'cardio' }),
  ex('Mystery', '', ''),
  ex('Farmer Carry', 'Grip', 'Dumbbell'),
];

test('groupsPresent follows the fixed muscle order, unknown groups after, Other last', () => {
  assert.deepEqual(groupsPresent(list), ['Chest', 'Shoulders', 'Legs', 'Conditioning', 'Grip', 'Other']);
});

test('filterExercises matches name, muscle group or equipment, case-insensitive, sorted by name', () => {
  assert.deepEqual(filterExercises(list, { q: 'CABLE' }).map((e) => e.name), ['Face Pull']);
  assert.deepEqual(filterExercises(list, { q: 'legs' }).map((e) => e.name), ['Leg Press']);
  assert.deepEqual(filterExercises(list, { group: 'Chest' }).map((e) => e.name), ['Barbell Bench Press']);
  assert.deepEqual(filterExercises(list, { q: 'press', group: 'Legs' }).map((e) => e.name), ['Leg Press']);
  assert.deepEqual(filterExercises(list, { group: 'Other' }).map((e) => e.name), ['Mystery']);
  assert.equal(filterExercises(list).length, 6);
  assert.equal(filterExercises(list)[0].name, 'Air Bike');
});

test('groupByMuscle returns ordered groups with name-sorted items', () => {
  const g = groupByMuscle([ex('Incline Dumbbell Press', 'Chest'), ex('Barbell Bench Press', 'Chest'), ex('Leg Press', 'Legs')]);
  assert.deepEqual(g.map((x) => [x.group, x.items.map((e) => e.name)]), [
    ['Chest', ['Barbell Bench Press', 'Incline Dumbbell Press']], ['Legs', ['Leg Press']],
  ]);
});

test('nameExists is trimmed and case-insensitive', () => {
  assert.equal(nameExists(list, '  leg press '), true);
  assert.equal(nameExists(list, 'Hack Squat'), false);
  assert.equal(nameExists(list, '   '), false);
});

test('exerciseLabel flags hidden and missing exercises', () => {
  assert.equal(exerciseLabel({ name: 'Row', hidden: false }), 'Row');
  assert.equal(exerciseLabel({ name: 'Row', hidden: true }), 'Row (hidden)');
  assert.equal(exerciseLabel(undefined), '(removed exercise)');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/catalog.test.js`
Expected: FAIL with `Cannot find module … js/catalog.js`.

- [ ] **Step 3: Implement `js/catalog.js`**

```js
// Pure helpers for browsing the exercise library: group order, search, grouping, labels.

export const MUSCLE_ORDER = ['Chest', 'Shoulders', 'Back', 'Arms', 'Legs', 'Posterior chain', 'Conditioning'];

const norm = (s) => String(s ?? '').trim().toLowerCase();
const byName = (a, b) => a.name.localeCompare(b.name);

export const groupOf = (e) => String(e.muscleGroup ?? '').trim() || 'Other';

// Known groups in MUSCLE_ORDER, then unknown groups alphabetically, then "Other".
function groupRank(g) {
  const i = MUSCLE_ORDER.indexOf(g);
  if (i !== -1) return i;
  return g === 'Other' ? 2000 : 1000;
}

export function compareGroups(a, b) {
  return groupRank(a) - groupRank(b) || a.localeCompare(b);
}

export function groupsPresent(exercises) {
  return [...new Set(exercises.map(groupOf))].sort(compareGroups);
}

// Substring match on name, muscle group or equipment; optional exact group; sorted by name.
export function filterExercises(exercises, { q = '', group = null } = {}) {
  const needle = norm(q);
  return exercises
    .filter((e) => (!group || groupOf(e) === group)
      && (!needle || [e.name, e.muscleGroup, e.equipment].join(' ').toLowerCase().includes(needle)))
    .sort(byName);
}

export function groupByMuscle(exercises) {
  const groups = new Map();
  for (const e of exercises) {
    const g = groupOf(e);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(e);
  }
  return [...groups.keys()].sort(compareGroups).map((group) => ({ group, items: groups.get(group).sort(byName) }));
}

export function nameExists(exercises, name) {
  const n = norm(name);
  return !!n && exercises.some((e) => norm(e.name) === n);
}

// One display rule for every screen: hidden exercises keep their name, flagged; a missing one
// (deleted from the store) shows a placeholder.
export function exerciseLabel(ex) {
  if (!ex) return '(removed exercise)';
  return ex.hidden ? `${ex.name} (hidden)` : ex.name;
}
```

- [ ] **Step 4: Add to the offline cache and run the tests**

In `service-worker.js`, change `'./js/format.js',` to `'./js/format.js', './js/catalog.js',`.

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add js/catalog.js tests/catalog.test.js service-worker.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: catalog helpers for grouping, filtering and labelling exercises" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `progression.js`, last time, pre-fill and Up next

**Files:**
- Create: `js/progression.js`
- Create: `tests/progression.test.js`
- Modify: `service-worker.js` (add `'./js/progression.js',` after `'./js/catalog.js',`)

**Interfaces:**
- Consumes: `compareRoutines` (Task 3).
- Produces:
  - `lastPerformance(sessions, exerciseId, { excludeId = null, before = null } = {}) → { date, sets } | null`
  - `prefillSet({ loggedThisSession = [], lastSets = [], target = null } = {}) → { weight, reps, rir }` (Phase 4 will add a `suggestion` option)
  - `nextRoutine(routines, sessions) → routine | null`

- [ ] **Step 1: Write the failing tests**

`tests/progression.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastPerformance, prefillSet, nextRoutine } from '../js/progression.js';

const set = (weight, reps, rir = null) => ({ weight, reps, rir, rpe: null, note: '', loggedAt: null });
const S = (id, date, entries) => ({ id, date, name: id, routineId: null, entries });
const sessions = [
  S('a', '2026-09-14T17:00:00.000Z', [{ exerciseId: 'bench', type: 'strength', sets: [set(130, 8), set(130, 8)] }]),
  S('b', '2026-09-21T17:00:00.000Z', [{ exerciseId: 'bench', type: 'strength', sets: [set(135, 8, 2), set(135, 8, 2), set(135, 7, 1)] }]),
  S('c', '2026-09-23T17:00:00.000Z', [{ exerciseId: 'bench', type: 'strength', sets: [] }, { exerciseId: 'squat', type: 'strength', sets: [set(185, 6)] }]),
  S('live', '2026-09-25T17:00:00.000Z', [{ exerciseId: 'bench', type: 'strength', sets: [set(140, 6)] }]),
];

test('lastPerformance: most recent other session that actually logged the exercise', () => {
  assert.deepEqual(lastPerformance(sessions, 'bench', { excludeId: 'live' }), { date: '2026-09-21T17:00:00.000Z', sets: sessions[1].entries[0].sets });
  assert.equal(lastPerformance(sessions, 'bench').date, '2026-09-25T17:00:00.000Z');
});

test('lastPerformance: `before` limits to earlier sessions (edit mode)', () => {
  assert.equal(lastPerformance(sessions, 'bench', { excludeId: 'b', before: '2026-09-21T17:00:00.000Z' }).date, '2026-09-14T17:00:00.000Z');
});

test('lastPerformance: null when never logged', () => {
  assert.equal(lastPerformance(sessions, 'deadlift', {}), null);
  assert.equal(lastPerformance([], 'bench'), null);
});

const target = { sets: 3, repMin: 6, repMax: 8, rirMin: 1, rirMax: 2, note: '' };

test('prefill: copies the previous set logged this session exactly', () => {
  assert.deepEqual(prefillSet({ loggedThisSession: [set(135, 8, 2), set(140, 6, null)], lastSets: [set(100, 10, 3)], target }), { weight: 140, reps: 6, rir: null });
});

test('prefill: otherwise last time set 1, falling back to the target RIR for legacy sets', () => {
  assert.deepEqual(prefillSet({ lastSets: [set(135, 8, 1), set(135, 7, 0)], target }), { weight: 135, reps: 8, rir: 1 });
  assert.deepEqual(prefillSet({ lastSets: [{ weight: 135, reps: 8, rir: null, rpe: 8 }], target }), { weight: 135, reps: 8, rir: 2 });
});

test('prefill: otherwise the target (bottom of the rep range, top of the RIR range, weight empty)', () => {
  assert.deepEqual(prefillSet({ target }), { weight: null, reps: 6, rir: 2 });
});

test('prefill: nothing known → all empty', () => {
  assert.deepEqual(prefillSet({}), { weight: null, reps: null, rir: null });
});

const push = { id: 'p', name: 'Push (Cycle 1)', position: 0 };
const pull = { id: 'l', name: 'Pull (Cycle 1)', position: 1 };
const legs = { id: 'g', name: 'Legs (Cycle 1)', position: 2 };

test('nextRoutine: first by position when there is no history', () => {
  assert.equal(nextRoutine([legs, pull, push], []), push);
});

test('nextRoutine: the one after the most recent routine session, wrapping round', () => {
  const hist = [{ id: 1, date: '2026-09-21T17:00:00.000Z', routineId: 'p' }, { id: 2, date: '2026-09-23T17:00:00.000Z', routineId: 'l' }];
  assert.equal(nextRoutine([push, pull, legs], hist), legs);
  assert.equal(nextRoutine([push, pull, legs], [{ id: 3, date: '2026-09-25T17:00:00.000Z', routineId: 'g' }]), push);
});

test('nextRoutine: ignores freestyle sessions and deleted routines', () => {
  const hist = [
    { id: 1, date: '2026-09-21T17:00:00.000Z', routineId: 'p' },
    { id: 2, date: '2026-09-24T17:00:00.000Z', routineId: null },
    { id: 3, date: '2026-09-25T17:00:00.000Z', routineId: 'deleted' },
  ];
  assert.equal(nextRoutine([push, pull, legs], hist), pull);
});

test('nextRoutine: null with no routines', () => {
  assert.equal(nextRoutine([], []), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/progression.test.js`
Expected: FAIL with `Cannot find module … js/progression.js`.

- [ ] **Step 3: Implement `js/progression.js`**

```js
import { compareRoutines } from './schema.js';

// Pure helpers behind the focus view's "Last time" line, the stepper pre-fill, and "Up next".
// Dates are ISO-8601 strings from toISOString(), so string comparison orders them correctly.

// Most recent session (other than excludeId, dated before `before` if given) with at least one
// logged set of this exercise → { date, sets }, or null.
export function lastPerformance(sessions, exerciseId, { excludeId = null, before = null } = {}) {
  let best = null;
  for (const s of sessions) {
    if (s.id === excludeId) continue;
    if (before && !(s.date < before)) continue;
    const entry = (s.entries || []).find((e) => e.type === 'strength' && e.exerciseId === exerciseId && (e.sets || []).length);
    if (!entry) continue;
    if (!best || s.date > best.date) best = { date: s.date, sets: entry.sets };
  }
  return best;
}

const targetRir = (t) => t?.rirMax ?? t?.rirMin ?? null;

// Stepper values for the next set (spec §7.2), in order of precedence:
// 1. the previous set logged this session, copied exactly;
// 2. otherwise last time's set 1 (the set this one lines up with), with the target RIR
//    standing in for legacy sets that only recorded RPE;
// 3. otherwise the target: bottom of the rep range, top of the RIR range, weight left empty.
export function prefillSet({ loggedThisSession = [], lastSets = [], target = null } = {}) {
  if (loggedThisSession.length) {
    const p = loggedThisSession[loggedThisSession.length - 1];
    return { weight: p.weight ?? null, reps: p.reps ?? null, rir: p.rir ?? null };
  }
  if (lastSets.length) {
    const s = lastSets[0];
    return { weight: s.weight ?? null, reps: s.reps ?? null, rir: s.rir ?? targetRir(target) };
  }
  return { weight: null, reps: target?.repMin ?? target?.repMax ?? null, rir: targetRir(target) };
}

// Up next (spec §7.1): the routine after the most recent session whose routine still exists,
// in position order, wrapping round; with no such session, the first routine.
export function nextRoutine(routines, sessions) {
  if (!routines.length) return null;
  const ordered = [...routines].sort(compareRoutines);
  const indexById = new Map(ordered.map((r, i) => [r.id, i]));
  let recent = null;
  for (const s of sessions) {
    if (!s.routineId || !indexById.has(s.routineId)) continue;
    if (!recent || s.date > recent.date) recent = s;
  }
  if (!recent) return ordered[0];
  return ordered[(indexById.get(recent.routineId) + 1) % ordered.length];
}
```

- [ ] **Step 4: Add to the offline cache and run the tests**

In `service-worker.js`, change `'./js/format.js', './js/catalog.js',` to `'./js/format.js', './js/catalog.js', './js/progression.js',`.

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add js/progression.js tests/progression.test.js service-worker.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: last-time lookup, set pre-fill and Up-next rotation (progression.js)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `sessionLogic.js`, progress, finish summary and pruning

**Files:**
- Create: `js/sessionLogic.js`
- Create: `tests/sessionLogic.test.js`
- Modify: `service-worker.js` (add `'./js/sessionLogic.js',` after `'./js/progression.js',`)

**Interfaces:**
- Consumes: `exerciseLabel` (Task 6).
- Produces:
  - `STALE_SEC = 1800`
  - `countLoggedSets(session) → int`
  - `entryProgress(entry) → { done, label, spoken }`
  - `lastLoggedAt(session) → ISO|null`
  - `finishedAtFor(session, { nowIso, useLastSetTime = false }) → ISO`
  - `finishSummary(session, exIndex /* Map id→exercise */, nowIso) → { setCount, removeNames, lastLoggedAt, staleSec, nothingLogged }`
  - `applyFinish(session, { nowIso, useLastSetTime = false }) → session` (new object)

- [ ] **Step 1: Write the failing tests**

`tests/sessionLogic.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STALE_SEC, countLoggedSets, entryProgress, lastLoggedAt, finishedAtFor, finishSummary, applyFinish,
} from '../js/sessionLogic.js';

const set = (reps, loggedAt) => ({ weight: 100, reps, rir: null, rpe: null, note: '', loggedAt });
const exIndex = new Map([
  ['bench', { id: 'bench', name: 'Barbell Bench Press' }],
  ['ohp', { id: 'ohp', name: 'Overhead Press' }],
  ['bike', { id: 'bike', name: 'Stationary Bike', type: 'cardio' }],
  ['row', { id: 'row', name: 'Rowing Erg', type: 'cardio' }],
]);
function session() {
  return { id: 's', date: '2026-09-25T17:00:00.000Z', name: 'Push (Cycle 1)', finishedAt: null, cursor: 3, entries: [
    { exerciseId: 'bench', type: 'strength', target: { sets: 3 }, sets: [set(8, '2026-09-25T17:05:00.000Z'), set(8, '2026-09-25T17:09:00.000Z'), set(7, '2026-09-25T17:13:00.000Z')] },
    { exerciseId: 'ohp', type: 'strength', target: { sets: 3 }, sets: [] },
    { exerciseId: 'bike', type: 'cardio', target: null, done: true, durationSec: null, distance: null },
    { exerciseId: 'row', type: 'cardio', target: null, done: false, durationSec: null, distance: null },
  ] };
}

test('STALE_SEC is 30 minutes', () => assert.equal(STALE_SEC, 1800));

test('countLoggedSets counts strength sets only', () => assert.equal(countLoggedSets(session()), 3));

test('entryProgress labels', () => {
  const s = session();
  assert.deepEqual(entryProgress(s.entries[0]), { done: true, label: '✓', spoken: 'done' });
  assert.deepEqual(entryProgress(s.entries[1]), { done: false, label: '—', spoken: 'not started' });
  assert.deepEqual(entryProgress({ type: 'strength', target: { sets: 3 }, sets: [set(8, null)] }), { done: false, label: '1 / 3', spoken: '1 of 3 sets' });
  assert.deepEqual(entryProgress({ type: 'strength', target: null, sets: [set(8, null), set(8, null)] }), { done: false, label: '2 sets', spoken: '2 sets' });
  assert.deepEqual(entryProgress(s.entries[2]), { done: true, label: '✓', spoken: 'done' });
  assert.deepEqual(entryProgress(s.entries[3]), { done: false, label: '—', spoken: 'not started' });
});

test('lastLoggedAt finds the latest set time', () => {
  assert.equal(lastLoggedAt(session()), '2026-09-25T17:13:00.000Z');
});

test('finishSummary: counts, what gets removed, staleness', () => {
  const sum = finishSummary(session(), exIndex, '2026-09-25T17:43:00.000Z');
  assert.equal(sum.setCount, 3);
  assert.deepEqual(sum.removeNames, ['Overhead Press', 'Rowing Erg']);
  assert.equal(sum.lastLoggedAt, '2026-09-25T17:13:00.000Z');
  assert.equal(sum.staleSec, 1800);
  assert.equal(sum.nothingLogged, false);
});

test('finishSummary: nothing logged', () => {
  const s = session();
  s.entries = [s.entries[1], s.entries[3]];
  assert.equal(finishSummary(s, exIndex, '2026-09-25T18:00:00.000Z').nothingLogged, true);
});

test('cardio with minutes or distance counts as logged even if not marked done', () => {
  const s = session();
  s.entries[3].durationSec = 480;
  assert.deepEqual(finishSummary(s, exIndex, '2026-09-25T18:00:00.000Z').removeNames, ['Overhead Press']);
});

test('applyFinish prunes, stamps finishedAt, resets the cursor, leaves the input alone', () => {
  const s = session();
  const done = applyFinish(s, { nowIso: '2026-09-25T17:43:00.000Z' });
  assert.equal(done.finishedAt, '2026-09-25T17:43:00.000Z');
  assert.equal(done.cursor, 0);
  assert.deepEqual(done.entries.map((e) => e.exerciseId), ['bench', 'bike']);
  assert.equal(s.entries.length, 4);
  assert.equal(s.finishedAt, null);
});

test('applyFinish can use the last set time + 60 s for a stale workout', () => {
  assert.equal(applyFinish(session(), { nowIso: '2026-09-25T20:00:00.000Z', useLastSetTime: true }).finishedAt, '2026-09-25T17:14:00.000Z');
});

test('finishedAtFor falls back to now when there are no timed sets', () => {
  const s = session();
  s.entries = [s.entries[2]];
  assert.equal(finishedAtFor(s, { nowIso: '2026-09-25T18:00:00.000Z', useLastSetTime: true }), '2026-09-25T18:00:00.000Z');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/sessionLogic.test.js`
Expected: FAIL with `Cannot find module … js/sessionLogic.js`.

- [ ] **Step 3: Implement `js/sessionLogic.js`**

```js
import { exerciseLabel } from './catalog.js';

// Pure rules for the workout lifecycle: progress labels, the finish summary, and pruning.

// "Last set was 2 h ago. Use that as the finish time?" appears past this many seconds.
export const STALE_SEC = 30 * 60;

// A strength entry counts once it has a set; cardio once it's done or has minutes/distance.
function isLogged(e) {
  if (e.type === 'cardio') return !!e.done || e.durationSec != null || e.distance != null;
  return (e.sets || []).length > 0;
}

export function countLoggedSets(session) {
  return (session.entries || []).reduce((n, e) => n + (e.type === 'strength' ? (e.sets || []).length : 0), 0);
}

// Overview row status: ✓ when the target is met (or cardio done), "—" before anything is logged.
export function entryProgress(entry) {
  const DONE = { done: true, label: '✓', spoken: 'done' };
  const NOT_STARTED = { done: false, label: '—', spoken: 'not started' };
  if (entry.type === 'cardio') return entry.done ? DONE : NOT_STARTED;
  const n = (entry.sets || []).length;
  const t = entry.target?.sets ?? null;
  if (t !== null && n >= t) return DONE;
  if (n === 0) return NOT_STARTED;
  if (t !== null) return { done: false, label: `${n} / ${t}`, spoken: `${n} of ${t} sets` };
  const plural = `${n} set${n === 1 ? '' : 's'}`;
  return { done: false, label: plural, spoken: plural };
}

export function lastLoggedAt(session) {
  let latest = null;
  for (const e of session.entries || []) {
    for (const s of e.sets || []) if (s.loggedAt && (!latest || s.loggedAt > latest)) latest = s.loggedAt;
  }
  return latest;
}

// The finish time: now, or (for a workout you forgot to finish) the last set's time + 60 s.
export function finishedAtFor(session, { nowIso, useLastSetTime = false }) {
  const last = lastLoggedAt(session);
  if (useLastSetTime && last) return new Date(Date.parse(last) + 60_000).toISOString();
  return nowIso;
}

export function finishSummary(session, exIndex, nowIso) {
  const entries = session.entries || [];
  const last = lastLoggedAt(session);
  return {
    setCount: countLoggedSets(session),
    removeNames: entries.filter((e) => !isLogged(e)).map((e) => exerciseLabel(exIndex.get(e.exerciseId))),
    lastLoggedAt: last,
    staleSec: last ? Math.max(0, (Date.parse(nowIso) - Date.parse(last)) / 1000) : null,
    nothingLogged: !entries.some(isLogged),
  };
}

// The finished session: unlogged entries removed, finishedAt stamped, cursor reset. New object.
export function applyFinish(session, { nowIso, useLastSetTime = false }) {
  return {
    ...session,
    entries: (session.entries || []).filter(isLogged),
    finishedAt: finishedAtFor(session, { nowIso, useLastSetTime }),
    cursor: 0,
  };
}
```

- [ ] **Step 4: Add to the offline cache and run the tests**

In `service-worker.js`, change `'./js/progression.js',` to `'./js/progression.js', './js/sessionLogic.js',`.

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add js/sessionLogic.js tests/sessionLogic.test.js service-worker.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: workout lifecycle rules (progress, finish summary, pruning)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: CSV v2, backup v2 and importer migration

**Files:**
- Modify: `js/exporter.js` (replace the whole file)
- Modify: `js/importer.js` (replace the whole file)
- Modify: `tests/exporter.csv.test.js` (replace the whole file)
- Modify: `tests/exporter.backup.test.js` (replace the whole file)
- Modify: `tests/importer.parse.test.js` (append one test)
- Modify: `tests/importer.merge.test.js` (append two tests)

**Interfaces:**
- Consumes: `SCHEMA_VERSION`, `migrate(data, opts)` (Task 4).
- Produces:
  - `CSV_COLUMNS` (v2 order)
  - `csvEscape(v)`
  - `sessionDurationSec(session) → int|null`
  - `buildCsv(sessions, exerciseIndex /* {id: {name, type, muscleGroup}} */) → string`
  - `buildBackup({settings, exercises, routines, sessions, bodyweight})`
  - `serializeBackup(state)`
  - `parseBackup(text, migrateOpts = {})`
  - `parseExerciseSeed(text)`
  - `mergeExercises(existing, incoming)`
  - `applyRestore(existing, incoming, mode)`, which now also restores `bodyweight`

- [ ] **Step 1: Replace `tests/exporter.csv.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_COLUMNS, csvEscape, buildCsv, sessionDurationSec } from '../js/exporter.js';

const EXPECTED_HEADER =
  'date,session_id,session_name,session_duration_sec,exercise,exercise_type,muscle_group,set_number,weight_lb,reps,rir,rpe,logged_at,distance,distance_unit,duration_sec,note';

const idx = {
  bench: { name: 'Barbell Bench Press', type: 'strength', muscleGroup: 'Chest' },
  bike: { name: 'Stationary Bike', type: 'cardio', muscleGroup: 'Conditioning' },
};
const push = { id: 's1', date: '2026-09-21T18:00:00.000Z', finishedAt: '2026-09-21T18:42:00.000Z', name: 'Push (Cycle 1)', entries: [
  { exerciseId: 'bench', type: 'strength', target: null, sets: [
    { weight: 135, reps: 8, rir: 2, rpe: null, note: '', loggedAt: '2026-09-21T18:05:00.000Z' },
    { weight: 135, reps: 7, rir: 1, rpe: null, note: 'grindy, but ok', loggedAt: '2026-09-21T18:09:00.000Z' },
  ] },
  { exerciseId: 'bike', type: 'cardio', target: null, done: true, durationSec: 480, distance: null, distanceUnit: 'mi', note: '' },
] };
const row = (...cells) => cells.join(',');

test('CSV v2 header matches the contract', () => {
  assert.equal(CSV_COLUMNS.join(','), EXPECTED_HEADER);
});

test('csvEscape quotes only when needed', () => {
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape(135), '135');
  assert.equal(csvEscape(0), '0');
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(undefined), '');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('he said "hi"'), '"he said ""hi"""');
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
});

test('empty sessions yields header only', () => {
  assert.equal(buildCsv([], {}), EXPECTED_HEADER + '\n');
});

test('strength sets: one row each with session id, duration, muscle group, RIR and logged_at', () => {
  const rows = buildCsv([push], idx).trim().split('\n');
  assert.equal(rows[1], row('2026-09-21T18:00:00.000Z', 's1', 'Push (Cycle 1)', '2520', 'Barbell Bench Press', 'strength', 'Chest', '1', '135', '8', '2', '', '2026-09-21T18:05:00.000Z', '', '', '', ''));
  assert.equal(rows[2], row('2026-09-21T18:00:00.000Z', 's1', 'Push (Cycle 1)', '2520', 'Barbell Bench Press', 'strength', 'Chest', '2', '135', '7', '1', '', '2026-09-21T18:09:00.000Z', '', '', '', '"grindy, but ok"'));
});

test('cardio entry: one row, set_number 1, strength columns blank', () => {
  const rows = buildCsv([push], idx).trim().split('\n');
  assert.equal(rows[3], row('2026-09-21T18:00:00.000Z', 's1', 'Push (Cycle 1)', '2520', 'Stationary Bike', 'cardio', 'Conditioning', '1', '', '', '', '', '', '', 'mi', '480', ''));
});

test('an unfinished session has a blank duration', () => {
  const rows = buildCsv([{ ...push, finishedAt: null }], idx).trim().split('\n');
  assert.equal(rows[1].split(',')[3], '');
});

test('legacy rows keep RPE and leave RIR blank', () => {
  const legacy = { id: 's0', date: '2026-09-15T18:00:00.000Z', finishedAt: null, name: 'Leg Day', entries: [
    { exerciseId: 'bench', type: 'strength', target: null, sets: [{ weight: 225, reps: 5, rir: null, rpe: 8, note: '', loggedAt: null }] },
  ] };
  const rows = buildCsv([legacy], idx).trim().split('\n');
  assert.equal(rows[1], row('2026-09-15T18:00:00.000Z', 's0', 'Leg Day', '', 'Barbell Bench Press', 'strength', 'Chest', '1', '225', '5', '', '8', '', '', '', '', ''));
});

test('cardio that was never done is skipped', () => {
  const s = { ...push, entries: [{ exerciseId: 'bike', type: 'cardio', done: false, durationSec: null, distance: null, distanceUnit: 'mi', note: '' }] };
  assert.equal(buildCsv([s], idx), EXPECTED_HEADER + '\n');
});

test('sessions come out oldest first', () => {
  const later = { ...push, id: 's2', date: '2026-09-23T18:00:00.000Z' };
  const rows = buildCsv([later, push], idx).trim().split('\n');
  assert.equal(rows[1].split(',')[1], 's1');
  assert.equal(rows.at(-1).split(',')[1], 's2');
});

test('unknown exercise id → placeholder name, blank muscle group', () => {
  const s = { id: 'x', date: '2026-09-15T00:00:00.000Z', finishedAt: null, name: 'W', entries: [
    { exerciseId: 'gone', type: 'strength', sets: [{ weight: 100, reps: 1, rir: null, rpe: null, note: '', loggedAt: null }] },
  ] };
  const cells = buildCsv([s], {}).trim().split('\n')[1].split(',');
  assert.equal(cells[4], '(unknown exercise)');
  assert.equal(cells[6], '');
});

test('sessionDurationSec', () => {
  assert.equal(sessionDurationSec(push), 2520);
  assert.equal(sessionDurationSec({ ...push, finishedAt: null }), null);
});
```

- [ ] **Step 2: Replace `tests/exporter.backup.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, serializeBackup } from '../js/exporter.js';
import { SCHEMA_VERSION } from '../js/schema.js';

const state = {
  settings: { key: 'app', units: 'lb' },
  exercises: [{ id: 'e1', name: 'Squat' }],
  routines: [{ id: 'r1', name: 'Legs' }],
  sessions: [{ id: 's1', date: '2026-09-15', name: 'W', entries: [] }],
  bodyweight: [{ date: '2026-09-25', weightLb: 201.4, loggedAt: '2026-09-25T13:00:00.000Z' }],
};

test('buildBackup stamps version + timestamp and carries all stores', () => {
  const b = buildBackup(state);
  assert.equal(b.schemaVersion, SCHEMA_VERSION);
  assert.ok(!Number.isNaN(Date.parse(b.exportedAt)));
  assert.deepEqual(b.exercises, state.exercises);
  assert.deepEqual(b.routines, state.routines);
  assert.deepEqual(b.sessions, state.sessions);
  assert.deepEqual(b.bodyweight, state.bodyweight);
  assert.deepEqual(b.settings, state.settings);
});

test('serializeBackup round-trips through JSON', () => {
  const parsed = JSON.parse(serializeBackup(state));
  assert.equal(parsed.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(parsed.sessions, state.sessions);
  assert.deepEqual(parsed.bodyweight, state.bodyweight);
});

test('buildBackup fills defaults for an empty state', () => {
  const b = buildBackup({});
  assert.equal(b.schemaVersion, SCHEMA_VERSION);
  assert.equal(b.settings, null);
  assert.deepEqual(b.exercises, []);
  assert.deepEqual(b.routines, []);
  assert.deepEqual(b.sessions, []);
  assert.deepEqual(b.bodyweight, []);
});
```

- [ ] **Step 3: Append to `tests/importer.parse.test.js`**

```js
test('parseBackup migrates a v1 backup to the v2 shape', () => {
  const v1 = { schemaVersion: 1, settings: null, exercises: [], sessions: [], routines: [
    { id: 'r', name: 'Arms', createdAt: 'T', updatedAt: 'U', items: [{ exerciseId: 'e', targetSets: 2, targetReps: 12, note: '' }] },
  ] };
  const r = parseBackup(JSON.stringify(v1));
  assert.equal(r.ok, true);
  assert.equal(r.data.schemaVersion, 2);
  assert.equal(r.data.routines[0].items[0].repMax, 12);
  assert.deepEqual(r.data.bodyweight, []);
});
```

- [ ] **Step 4: Append to `tests/importer.merge.test.js`**

```js
test('applyRestore replace takes incoming bodyweight (or none)', () => {
  const existing = { settings: {}, exercises: [], routines: [], sessions: [], bodyweight: [{ date: '2026-09-01', weightLb: 205 }] };
  assert.deepEqual(applyRestore(existing, { bodyweight: [{ date: '2026-09-02', weightLb: 204 }] }, 'replace').bodyweight, [{ date: '2026-09-02', weightLb: 204 }]);
  assert.deepEqual(applyRestore(existing, {}, 'replace').bodyweight, []);
});

test('applyRestore merge unions bodyweight by date, existing wins', () => {
  const existing = { settings: {}, exercises: [], routines: [], sessions: [], bodyweight: [{ date: '2026-09-01', weightLb: 205 }] };
  const incoming = { bodyweight: [{ date: '2026-09-01', weightLb: 999 }, { date: '2026-09-02', weightLb: 204 }] };
  const out = applyRestore(existing, incoming, 'merge').bodyweight;
  assert.deepEqual(out.map((b) => [b.date, b.weightLb]), [['2026-09-01', 205], ['2026-09-02', 204]]);
});
```

- [ ] **Step 5: Run to verify they fail**

Run: `node --test tests/exporter.csv.test.js tests/exporter.backup.test.js tests/importer.merge.test.js tests/importer.parse.test.js`
Expected: FAIL. The header mismatches, `sessionDurationSec` isn't exported, `bodyweight` is missing, and the v1 backup isn't migrated.

- [ ] **Step 6: Replace `js/exporter.js`**

```js
import { SCHEMA_VERSION } from './schema.js';

// CSV contract v2 (spec §10.1). Tidy long format: one row per logged set, or per kept cardio entry.
export const CSV_COLUMNS = [
  'date', 'session_id', 'session_name', 'session_duration_sec', 'exercise', 'exercise_type', 'muscle_group',
  'set_number', 'weight_lb', 'reps', 'rir', 'rpe', 'logged_at',
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

// Whole seconds from start to finish; null while unfinished (or for legacy sessions).
export function sessionDurationSec(session) {
  if (!session.finishedAt) return null;
  const d = (Date.parse(session.finishedAt) - Date.parse(session.date)) / 1000;
  return Number.isFinite(d) && d >= 0 ? Math.round(d) : null;
}

const cardioLogged = (e) => !!e.done || e.durationSec != null || e.distance != null;

export function buildCsv(sessions, exerciseIndex) {
  const lines = [CSV_COLUMNS.join(',')];
  const ordered = [...sessions].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const s of ordered) {
    const base = { date: s.date, session_id: s.id, session_name: s.name, session_duration_sec: sessionDurationSec(s) };
    for (const entry of s.entries || []) {
      const ex = exerciseIndex[entry.exerciseId];
      const common = {
        ...base,
        exercise: ex ? ex.name : '(unknown exercise)',
        exercise_type: entry.type === 'cardio' ? 'cardio' : 'strength',
        muscle_group: ex ? ex.muscleGroup ?? '' : '',
      };
      if (entry.type === 'cardio') {
        if (!cardioLogged(entry)) continue;
        lines.push(row({
          ...common, set_number: 1,
          distance: entry.distance, distance_unit: entry.distanceUnit, duration_sec: entry.durationSec, note: entry.note,
        }));
      } else {
        (entry.sets || []).forEach((set, i) => {
          lines.push(row({
            ...common, set_number: i + 1,
            weight_lb: set.weight, reps: set.reps, rir: set.rir, rpe: set.rpe, logged_at: set.loggedAt, note: set.note,
          }));
        });
      }
    }
  }
  return lines.join('\n') + '\n';
}

export function buildBackup({ settings, exercises, routines, sessions, bodyweight } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: settings ?? null,
    exercises: exercises ?? [],
    routines: routines ?? [],
    sessions: sessions ?? [],
    bodyweight: bodyweight ?? [],
  };
}

export function serializeBackup(state) {
  return JSON.stringify(buildBackup(state), null, 2);
}
```

- [ ] **Step 7: Replace `js/importer.js`**

```js
import { migrate, SCHEMA_VERSION } from './schema.js';

// `migrateOpts` ({ seedRoutines, seedExerciseNames }) lets an old v1 backup get the same
// starter refresh and legacy cleanup as an on-device upgrade (spec §5.3).
export function parseBackup(text, migrateOpts = {}) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Could not parse JSON — is this a backup file?' };
  }
  if (obj && typeof obj === 'object' && typeof obj.schemaVersion === 'number' && obj.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, code: 'VERSION', error: `This backup is from a newer app version (v${obj.schemaVersion}); update the app first.` };
  }
  try {
    const data = migrate(obj, migrateOpts);
    for (const k of ['exercises', 'routines', 'sessions']) {
      if (!Array.isArray(data[k])) return { ok: false, error: `Backup is missing a valid "${k}" list` };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

export function parseExerciseSeed(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Could not parse JSON' };
  }
  const list = Array.isArray(obj) ? obj : (obj && typeof obj === 'object' ? obj.exercises : undefined);
  if (!Array.isArray(list)) return { ok: false, error: 'Expected an array of exercises or {"exercises":[...]}' };
  return { ok: true, exercises: list };
}

export function mergeExercises(existing, incoming) {
  const seen = new Set(existing.map((e) => String(e.name || '').trim().toLowerCase()));
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

// Union of two record lists by `key`; on a clash the existing record wins.
function unionBy(existing, incoming, key) {
  const out = new Map();
  for (const r of [...existing, ...incoming]) if (!out.has(r[key])) out.set(r[key], r);
  return [...out.values()];
}

export function applyRestore(existing, incoming, mode) {
  if (mode === 'replace') {
    return {
      settings: incoming.settings ?? existing.settings,
      exercises: incoming.exercises ?? [],
      routines: incoming.routines ?? [],
      sessions: incoming.sessions ?? [],
      bodyweight: incoming.bodyweight ?? [],
    };
  }
  return {
    settings: existing.settings,
    exercises: mergeExercises(existing.exercises, incoming.exercises ?? []).merged,
    routines: unionBy(existing.routines, incoming.routines ?? [], 'id'),
    sessions: unionBy(existing.sessions, incoming.sessions ?? [], 'id'),
    bodyweight: unionBy(existing.bodyweight ?? [], incoming.bodyweight ?? [], 'date'),
  };
}
```

- [ ] **Step 8: Run the tests**

Run: `node --test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add js/exporter.js js/importer.js tests/exporter.csv.test.js tests/exporter.backup.test.js tests/importer.parse.test.js tests/importer.merge.test.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: CSV contract v2, backup v2 with bodyweight, migrate old backups on import" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Keys, UI helpers and the screen lifecycle

**Files:**
- Create: `js/keys.js`
- Modify: `js/ui.js` (replace the whole file)
- Modify: `js/app.js` (replace `showScreen` only)
- Modify: `service-worker.js` (add `'./js/keys.js',` after `'./js/sessionLogic.js',`)

**Interfaces:**
- Produces:
  - `keys.js`: `ACTIVE_SESSION = 'activeSessionId'`, `LAST_BACKUP = 'lastExport'`, `LEGACY_STARTER_SEEDED = 'starterRoutinesSeeded'`.
  - `ui.js`: `el(tag, attrs, children)`, where attributes set to `null`, `undefined` or `false` are omitted and `true` becomes a bare attribute; `clear(node)`; `field(labelText, id, inputEl)`; `download(filename, text, mime)`; `pickFile(accept)`, which resolves `null` on cancel; `showToast(text, { actionLabel, onAction, ms = 5000 })`; `hideToast()`.
  - `app.js`: `showScreen(name, arg)`. The renderer is called as `(root, arg)` and may return or resolve to a cleanup function. That cleanup runs before the next `showScreen`.

- [ ] **Step 1: Create `js/keys.js`**

```js
// localStorage keys. The stored strings are unchanged from v1, so existing values survive updates.
export const ACTIVE_SESSION = 'activeSessionId';
export const LAST_BACKUP = 'lastExport';
// v1 only: marked the starter routines as seeded. Retired in v2 (seeding happens on a fresh
// install); boot and Erase-all remove it.
export const LEGACY_STARTER_SEEDED = 'starterRoutinesSeeded';
```

- [ ] **Step 2: Replace `js/ui.js`**

```js
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    // null/undefined/false leave the attribute off (so `disabled: false` isn't disabled);
    // true becomes a bare boolean attribute. ARIA state must be passed as the strings 'true'/'false'.
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c.nodeType ? c : document.createTextNode(c));
  return node;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

// A visible <label> tied to its control. Every form field uses this, never placeholder-only labels.
export function field(labelText, id, inputEl) {
  inputEl.id = id;
  return el('div', {}, [el('label', { for: id, class: 'muted small', text: labelText }), inputEl]);
}

export function download(filename, text, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Resolves { name, text }, or null if the picker is cancelled.
export function pickFile(accept = 'application/json') {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept });
    input.addEventListener('cancel', () => resolve(null));
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

// One toast at a time, just above the tab bar, announced to screen readers. Optional action (Undo).
let toastNode = null;
let toastTimer = null;

export function hideToast() {
  clearTimeout(toastTimer);
  toastTimer = null;
  if (toastNode) { toastNode.remove(); toastNode = null; }
}

export function showToast(text, { actionLabel = null, onAction = null, ms = 5000 } = {}) {
  hideToast();
  const children = [el('span', { text })];
  if (actionLabel && onAction) {
    children.push(el('button', { text: actionLabel, onclick: () => { hideToast(); onAction(); } }));
  }
  toastNode = el('div', { class: 'toast', role: 'status' }, children);
  document.body.append(toastNode);
  toastTimer = setTimeout(hideToast, ms);
}
```

- [ ] **Step 3: Replace `showScreen` in `js/app.js`**

Replace this block:

```js
export function showScreen(name) {
  const root = document.getElementById('screen');
  while (root.firstChild) root.removeChild(root.firstChild);
  document.getElementById('screen-title').textContent = titles[name] ?? name;
  document.querySelectorAll('.tabbar button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.screen === name)));
  (screens[name] ?? screens.log)(root);
}
```

with:

```js
let screenCleanup = null;
let screenToken = 0;

// Switches the main view. A renderer is called as (root, arg) and may return (or resolve to) a
// cleanup function; it runs before the next screen renders, so timers and the wake lock never
// outlive their screen. The token drops a cleanup that resolves after the user already moved on.
export function showScreen(name, arg) {
  if (screenCleanup) {
    try { screenCleanup(); } catch (e) { console.warn('Screen cleanup failed:', e); }
    screenCleanup = null;
  }
  const token = ++screenToken;
  const root = document.getElementById('screen');
  while (root.firstChild) root.removeChild(root.firstChild);
  document.getElementById('screen-title').textContent = titles[name] ?? name;
  document.querySelectorAll('.tabbar button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.screen === name)));
  Promise.resolve((screens[name] ?? screens.log)(root, arg)).then((fn) => {
    if (typeof fn !== 'function') return;
    if (token === screenToken) screenCleanup = fn;
    else fn();
  });
}
```

- [ ] **Step 4: Add `keys.js` to the offline cache and run the tests**

In `service-worker.js`, change `'./js/sessionLogic.js',` to `'./js/sessionLogic.js', './js/keys.js',`.

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Verify in the browser**

Start the preview server `workout-tracker`, set a mobile viewport, and open `http://localhost:5055/`.
- Tap every tab. Each screen renders, and the console shows no errors (`read_console_messages` with `onlyErrors`).
- Run in the page with `javascript_tool`:

```js
const ui = await import('/js/ui.js');
ui.showToast('Set 2 deleted', { actionLabel: 'Undo', onAction: () => { window.__undo = true; } });
document.querySelector('.toast button').click();
({ undo: window.__undo === true, toastGone: !document.querySelector('.toast'), disabledFalse: ui.el('button', { disabled: false }).hasAttribute('disabled'), disabledTrue: ui.el('button', { disabled: true }).hasAttribute('disabled') })
```

Expected: `{ undo: true, toastGone: true, disabledFalse: false, disabledTrue: true }`.

- [ ] **Step 6: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add js/keys.js js/ui.js js/app.js service-worker.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: storage keys, toast + field helpers, and a screen lifecycle with cleanup" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Storage v2 with atomic multi-store writes

**Files:**
- Modify: `js/storage.js` (replace the whole file)

**Interfaces:**
- Consumes: `defaultSettings`, `SCHEMA_VERSION` (Tasks 3–4); `applyRestore` (Task 9).
- Produces:
  - `openDb()`: version 2, with the `bodyweight` store (keyPath `date`). It closes itself when another tab or tool asks to upgrade or delete.
  - `STORES`
  - `transact(storeNames, mode, fn)`: `fn(storesByName)` runs in one transaction. It resolves with `fn`'s result on commit, and rolls back every write and rejects if `fn` throws or any request fails.
  - `getAll`, `get`, `put`, `remove`, `bulkPut`, `getSingleton`, `putSingleton` (unchanged signatures)
  - `clearAll()`: one transaction over every store, including `meta` and `bodyweight`.
  - `getMeta() → int|null`
  - `getSettings() → settings`, merged over `defaultSettings()`
  - `readAll() → { settings|null, exercises, routines, sessions, bodyweight }`
  - `writeAll(state, schemaVersion)`: replaces every data store and settings, and stamps `meta`, all in one transaction.
  - `exportState()`
  - `importState(state, mode)`: now atomic.

- [ ] **Step 1: Replace `js/storage.js`**

```js
import { applyRestore } from './importer.js';
import { defaultSettings, SCHEMA_VERSION } from './schema.js';

const DB_NAME = 'workout-tracker';
const DB_VERSION = 2;
const KEYED = { exercises: 'id', routines: 'id', sessions: 'id', settings: 'key', meta: 'key', bodyweight: 'date' };
const DATA_STORES = ['exercises', 'routines', 'sessions', 'bodyweight'];
export const STORES = Object.keys(KEYED);

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
    req.onsuccess = () => {
      const db = req.result;
      // Let a newer version (or the dev fixture loader) upgrade/delete the database instead of blocking.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// Runs fn over one or more stores in ONE transaction. Resolves with fn's result once the
// transaction commits; if fn throws (e.g. a put with no key) or any request fails, every write
// in it is rolled back and the promise rejects. fn must only await IndexedDB requests.
export async function transact(storeNames, mode, fn) {
  const db = await openDb();
  const names = [].concat(storeNames);
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((n) => [n, t.objectStore(n)]));
    let result;
    let failed = false;
    const fail = (e) => {
      if (failed) return;
      failed = true;
      try { t.abort(); } catch { /* already finished */ }
      reject(e);
    };
    t.oncomplete = () => { if (!failed) resolve(result); };
    t.onerror = () => fail(t.error);
    t.onabort = () => fail(t.error ?? new Error('Transaction aborted'));
    try {
      Promise.resolve(fn(stores)).then((r) => { result = r; }, fail);
    } catch (e) {
      fail(e);
    }
  });
}

const one = (store, mode, fn) => transact(store, mode, (s) => fn(s[store]));

export const getAll = (store) => one(store, 'readonly', (os) => reqP(os.getAll()));
export const get = (store, id) => one(store, 'readonly', (os) => reqP(os.get(id)));
export const put = (store, rec) => one(store, 'readwrite', (os) => reqP(os.put(rec)).then(() => rec));
export const remove = (store, id) => one(store, 'readwrite', (os) => reqP(os.delete(id)));
export const bulkPut = (store, recs) => one(store, 'readwrite', (os) => { for (const r of recs) os.put(r); });
export const getSingleton = (store, key) => get(store, key);
export const putSingleton = (store, rec) => put(store, rec);
export const clearAll = () => transact(STORES, 'readwrite', (s) => { for (const n of STORES) s[n].clear(); });

export async function getMeta() {
  const m = await get('meta', 'schema');
  return m?.version ?? null;
}

export async function getSettings() {
  return { ...defaultSettings(), ...((await get('settings', 'app')) ?? {}), key: 'app' };
}

export function readAll() {
  return transact(STORES, 'readonly', (s) => Promise.all([
    reqP(s.exercises.getAll()), reqP(s.routines.getAll()), reqP(s.sessions.getAll()),
    reqP(s.bodyweight.getAll()), reqP(s.settings.get('app')),
  ]).then(([exercises, routines, sessions, bodyweight, settings]) => ({
    settings: settings ?? null, exercises, routines, sessions, bodyweight,
  })));
}

// Replaces every data store and the settings singleton, and stamps meta.schema, in one
// transaction. A failure part-way leaves the database exactly as it was (spec §5.2, §7.11).
export function writeAll(state, schemaVersion) {
  return transact(STORES, 'readwrite', (s) => {
    for (const name of DATA_STORES) {
      s[name].clear();
      for (const rec of state[name] ?? []) s[name].put(rec);
    }
    s.settings.put({ ...defaultSettings(), ...(state.settings ?? {}), key: 'app' });
    s.meta.put({ key: 'schema', version: schemaVersion });
  });
}

export async function exportState() {
  const { settings, exercises, routines, sessions, bodyweight } = await readAll();
  return { settings: { ...defaultSettings(), ...(settings ?? {}), key: 'app' }, exercises, routines, sessions, bodyweight };
}

export async function importState(state, mode) {
  const current = await exportState();
  await writeAll(applyRestore(current, state, mode), SCHEMA_VERSION);
}
```

- [ ] **Step 2: Run the tests**

Run: `node --test`
Expected: PASS. None import `storage.js`, but it's a quick sanity check.

- [ ] **Step 3: Verify atomicity in the browser**

Reload `http://localhost:5055/` in the preview. The existing app still boots, and `DB_VERSION` 2 adds the `bodyweight` store. Then run with `javascript_tool`:

```js
const s = await import('/js/storage.js');
const before = (await s.getAll('exercises')).length;
const err = await s.writeAll({ exercises: [{ name: 'no id' }] }, 2).then(() => 'no error', (e) => e.name);
({ err, before, after: (await s.getAll('exercises')).length, stores: Object.keys(await s.readAll()) })
```

Expected: `err` is `"DataError"`, `after === before` (the `clear()` was rolled back), and `stores` includes `bodyweight`.

- [ ] **Step 4: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add js/storage.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: storage v2 with atomic multi-store transactions, bodyweight store, meta" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Boot migration, upgrade-failure screen and the v1 fixture loader

**Files:**
- Modify: `js/app.js` (replace the whole file)
- Create: `tests/fixtures/load-v1-db.js`
- Modify: `.gitignore` (append `tests/fixtures/real-*.json`)

**Interfaces:**
- Consumes: `openDb`, `getAll`, `bulkPut`, `getMeta`, `readAll`, `writeAll` (Task 11); `SCHEMA_VERSION`, `newExercise`, `buildStarterRoutines`, `migrateV1toV2` (Tasks 3–4); `LEGACY_STARTER_SEEDED` (Task 10); `el`, `clear`, `download` (Task 10).
- Produces: `showScreen(name, arg)` (as in Task 10) and `renderUpgradeFailure(err)`, exported so the failure screen can be viewed from the console. `load-v1-db.js` exports `buildV1Fixture() → state`, `loadV1Fixture()` and `loadV1Backup(url)`.

- [ ] **Step 1: Replace `js/app.js`**

```js
import { openDb, getAll, bulkPut, getMeta, readAll, writeAll } from './storage.js';
import { SCHEMA_VERSION, newExercise, buildStarterRoutines, migrateV1toV2 } from './schema.js';
import { LEGACY_STARTER_SEEDED } from './keys.js';
import { el, clear, download } from './ui.js';
import { renderLibrary } from './library.js';
import { renderRoutines } from './routines.js';
import { renderLog } from './session.js';
import { renderHistory } from './history.js';
import { renderBackup } from './backup.js';

const screens = {};
export function registerScreen(name, fn) { screens[name] = fn; }
registerScreen('library', renderLibrary);
registerScreen('routines', renderRoutines);
registerScreen('log', renderLog);
registerScreen('history', renderHistory);
registerScreen('backup', renderBackup);

const titles = { log: 'Log', routines: 'Routines', library: 'Library', history: 'History', backup: 'Backup' };

let screenCleanup = null;
let screenToken = 0;

// Switches the main view. A renderer is called as (root, arg) and may return (or resolve to) a
// cleanup function; it runs before the next screen renders, so timers and the wake lock never
// outlive their screen. The token drops a cleanup that resolves after the user already moved on.
export function showScreen(name, arg) {
  if (screenCleanup) {
    try { screenCleanup(); } catch (e) { console.warn('Screen cleanup failed:', e); }
    screenCleanup = null;
  }
  const token = ++screenToken;
  const root = document.getElementById('screen');
  clear(root);
  document.getElementById('screen-title').textContent = titles[name] ?? name;
  document.querySelectorAll('.tabbar button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.screen === name)));
  Promise.resolve((screens[name] ?? screens.log)(root, arg)).then((fn) => {
    if (typeof fn !== 'function') return;
    if (token === screenToken) screenCleanup = fn;
    else fn();
  });
}

const norm = (s) => String(s ?? '').trim().toLowerCase();

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status})`);
  return res.json();
}

// Brings the database to SCHEMA_VERSION (spec §5.2): a fresh install is seeded, v1 data is
// migrated. Either way it's one writeAll transaction, so a failure leaves v1 data untouched.
async function ensureSchema() {
  const version = await getMeta();
  if (version === SCHEMA_VERSION) return;
  if (version !== null && version > SCHEMA_VERSION) throw new Error(`This data is from a newer app version (v${version}).`);
  const [exSeed, rtSeed] = await Promise.all([
    fetchJson('./seed/exercises.default.json'),
    fetchJson('./seed/routines.default.json'),
  ]);
  const state = await readAll();
  if (version === null && state.exercises.length === 0) {
    const exercises = exSeed.exercises.map((e) => newExercise({ ...e, custom: false }));
    await writeAll({ ...state, exercises, routines: buildStarterRoutines(rtSeed, exercises) }, SCHEMA_VERSION);
    return;
  }
  const migrated = migrateV1toV2(state, {
    seedRoutines: rtSeed.routines,
    seedExerciseNames: exSeed.exercises.map((e) => e.name),
  });
  await writeAll(migrated, SCHEMA_VERSION);
}

// Adds any default exercise the library doesn't have yet (by name). Never edits or un-hides.
async function syncDefaultExercises() {
  const have = new Set((await getAll('exercises')).map((e) => norm(e.name)));
  const { exercises } = await fetchJson('./seed/exercises.default.json');
  const toAdd = exercises.filter((e) => !have.has(norm(e.name))).map((e) => newExercise({ ...e, custom: false }));
  if (toAdd.length) await bulkPut('exercises', toAdd);
}

// Blocking screen shown when the upgrade fails. Nothing was written, so a raw download is the
// user's safety net before anything else is tried.
export function renderUpgradeFailure(err) {
  const root = document.getElementById('screen');
  clear(root);
  document.getElementById('screen-title').textContent = 'Update problem';
  document.querySelector('.tabbar').hidden = true;
  root.append(
    el('div', { class: 'save-error', role: 'alert', text: "The update couldn't upgrade your data. Nothing was changed. Download a backup, then reload." }),
    el('p', { class: 'muted small', text: String((err && err.message) || err) }),
    el('button', { class: 'primary btn-block', text: 'Download backup', onclick: () => downloadRawBackup(root) }),
    el('button', { class: 'btn-block', text: 'Reload', onclick: () => location.reload() }),
  );
}

async function downloadRawBackup(root) {
  try {
    const raw = await readAll();
    const payload = {
      schemaVersion: 1, exportedAt: new Date().toISOString(),
      settings: raw.settings, exercises: raw.exercises, routines: raw.routines, sessions: raw.sessions,
    };
    download(`workout-backup-raw-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
  } catch (e) {
    root.append(el('p', { class: 'error', role: 'alert', text: `Couldn't read the data either: ${(e && e.message) || e}` }));
  }
}

async function boot() {
  // Register first, so a fixed release can still reach a phone that's stuck on the failure screen.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  try {
    await openDb();
    await ensureSchema();
    try { localStorage.removeItem(LEGACY_STARTER_SEEDED); } catch { /* ignore */ }
  } catch (e) {
    console.error('Upgrade failed:', e);
    renderUpgradeFailure(e);
    return;
  }
  try { await syncDefaultExercises(); } catch (e) { console.warn('Exercise sync skipped:', e); }
  document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => showScreen(b.dataset.screen)));
  showScreen('log');
}
boot();
```

- [ ] **Step 2: Create `tests/fixtures/load-v1-db.js`**

```js
// Dev tool for the Phase 3 migration gate. Recreates the app's IndexedDB exactly as a v1 build
// left it (IndexedDB version 1, no meta record), so the next page load runs the real boot migration.
//
// Usage, in the preview (http://localhost:5055) via devtools or the browser tool:
//   const m = await import('/tests/fixtures/load-v1-db.js');
//   await m.loadV1Fixture();                                  // synthetic v1 data
//   // or: await m.loadV1Backup('/tests/fixtures/real-v1.json'); // a real v1 JSON backup (gitignored)
//   location.reload();

const V1_STORES = { exercises: 'id', routines: 'id', sessions: 'id', settings: 'key', meta: 'key' };

async function recreateV1(state) {
  await new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase('workout-tracker');
    r.onsuccess = resolve;
    r.onerror = () => reject(r.error);
  });
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('workout-tracker', 1);
    r.onupgradeneeded = () => {
      for (const [store, keyPath] of Object.entries(V1_STORES)) r.result.createObjectStore(store, { keyPath });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  await new Promise((resolve, reject) => {
    const t = db.transaction(['exercises', 'routines', 'sessions', 'settings'], 'readwrite');
    for (const e of state.exercises) t.objectStore('exercises').put(e);
    for (const r of state.routines) t.objectStore('routines').put(r);
    for (const s of state.sessions) t.objectStore('sessions').put(s);
    t.objectStore('settings').put(state.settings ?? { key: 'app', units: 'lb' });
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  db.close();
  localStorage.removeItem('activeSessionId');
  localStorage.setItem('starterRoutinesSeeded', '1');
}

export async function loadV1Backup(url) {
  const b = await (await fetch(url)).json();
  await recreateV1({ settings: b.settings, exercises: b.exercises, routines: b.routines, sessions: b.sessions });
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// Synthetic v1 data: the full exercise seed plus two legacy placeholders and one custom
// exercise; the three starter routines in v1 shape (Legs marked as edited); two finished sessions.
// Returned as a plain state object so it can also be restored as a v1 *backup* (Task 19).
export async function buildV1Fixture() {
  const { exercises: seedEx } = await (await fetch('/seed/exercises.default.json')).json();
  const { routines: seedRt } = await (await fetch('/seed/routines.default.json')).json();
  const T0 = '2026-09-16T12:00:00.000Z';
  const exercises = [
    ...seedEx.map((e) => ({ id: `ex-${slug(e.name)}`, name: e.name, type: e.type, muscleGroup: e.muscleGroup, equipment: e.equipment, custom: false, hidden: false, createdAt: T0 })),
    { id: 'ex-legacy-bench', name: 'Bench Press', type: 'strength', muscleGroup: 'Chest', equipment: 'Barbell', custom: false, hidden: false, createdAt: T0 },
    { id: 'ex-legacy-deadlift', name: 'Deadlift', type: 'strength', muscleGroup: 'Back', equipment: 'Barbell', custom: false, hidden: false, createdAt: T0 },
    { id: 'ex-my-curl', name: 'My Cable Curl', type: 'strength', muscleGroup: 'Arms', equipment: 'Cable', custom: true, hidden: false, createdAt: T0 },
  ];
  const routines = seedRt.map((r) => ({
    id: `rt-${r.key}`, name: r.name, createdAt: T0,
    updatedAt: r.key === 'legs' ? '2026-09-18T09:00:00.000Z' : T0, // Legs was edited → must be left alone
    items: r.items.map((it) => ({
      exerciseId: `ex-${slug(it.exercise)}`, targetSets: it.sets ?? null, targetReps: it.repMax ?? null,
      note: r.key === 'legs' ? `EDITED ${it.note}` : it.note,
    })),
  }));
  const sessions = [
    { id: 'ses-push-1', date: '2026-09-21T17:30:00.000Z', name: 'Push (Cycle 1)', routineId: 'rt-push', notes: '', entries: [
      { exerciseId: 'ex-barbell-bench-press', type: 'strength', sets: [
        { weight: 135, reps: 8, rpe: 8, restSec: null, note: '' },
        { weight: 135, reps: 8, rpe: 8.5, restSec: null, note: '' },
        { weight: 135, reps: 7, rpe: 9, restSec: null, note: 'grindy' },
      ] },
      { exerciseId: 'ex-overhead-press', type: 'strength', sets: [] },
      { exerciseId: 'ex-stationary-bike', type: 'cardio', durationSec: 480, distance: null, distanceUnit: 'mi', note: '' },
    ] },
    { id: 'ses-old-1', date: '2026-09-17T17:30:00.000Z', name: 'Workout', routineId: null, notes: '', entries: [
      { exerciseId: 'ex-legacy-deadlift', type: 'strength', sets: [{ weight: 185, reps: 5, rpe: null, restSec: null, note: '' }] },
      { exerciseId: 'ex-rowing-erg', type: 'cardio', durationSec: null, distance: null, distanceUnit: 'mi', note: '' },
    ] },
  ];
  return { settings: { key: 'app', units: 'lb' }, exercises, routines, sessions };
}

export async function loadV1Fixture() {
  await recreateV1(await buildV1Fixture());
}
```

- [ ] **Step 3: Keep real backups out of git**

Append this line to `.gitignore`:

```
tests/fixtures/real-*.json
```

- [ ] **Step 4: Run the tests**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Migration gate (preview)**

In the preview tab at `http://localhost:5055/`, run with `javascript_tool`:

```js
const m = await import('/tests/fixtures/load-v1-db.js');
await m.loadV1Fixture();
location.reload();
```

After the reload finishes, run:

```js
const s = await import('/js/storage.js');
const all = await s.readAll();
all.routines.sort((a, b) => a.position - b.position); // getAll returns key (id) order, not position order
const byName = Object.fromEntries(all.routines.map((r) => [r.name, r]));
const ex = Object.fromEntries(all.exercises.map((e) => [e.name, e]));
const push = all.sessions.find((x) => x.id === 'ses-push-1');
const old = all.sessions.find((x) => x.id === 'ses-old-1');
({
  meta: await s.getMeta(),
  pushOrigin: byName['Push (Cycle 1)'].origin,
  pushBench: byName['Push (Cycle 1)'].items[0],
  legsNote: byName['Legs (Cycle 1)'].items[0].note,
  legsOrigin: byName['Legs (Cycle 1)'].origin,
  positions: all.routines.map((r) => [r.name, r.position]),
  legacyBenchHidden: ex['Bench Press'].hidden,
  legacyDeadliftHidden: ex['Deadlift'].hidden,
  customHidden: ex['My Cable Curl'].hidden,
  firstSet: push.entries[0].sets[0],
  bikeDone: push.entries[2].done,
  ergDone: old.entries[1].done,
  flagGone: localStorage.getItem('starterRoutinesSeeded') === null,
})
```

Expected:
- `meta` is 2.
- `pushOrigin` is `{cycle:'cycle-1', key:'push'}`.
- `pushBench` has `repMin: 6, repMax: 8, rirMin: 2, rirMax: 2`.
- `legsNote` starts with `"EDITED "` and `legsOrigin` is `null`.
- `positions` gives Push 0, Pull 1, Legs 2.
- `legacyBenchHidden: true`, `legacyDeadliftHidden: false`, `customHidden: false`.
- `firstSet` is `{weight:135, reps:8, rir:null, rpe:8, note:'', loggedAt:null}`.
- `bikeDone: true`, `ergDone: false`, `flagGone: true`.

- [ ] **Step 6: Failure-screen and fresh-install checks (preview)**

Look at the failure screen:

```js
(await import('/js/app.js')).renderUpgradeFailure(new Error('test'));
document.querySelector('.save-error').textContent
```

Expected: the alert text, a Download backup button, and a hidden tab bar. Tap **Download backup** and confirm it downloads JSON. Then reload.

Fresh install:

```js
await new Promise((r) => { const q = indexedDB.deleteDatabase('workout-tracker'); q.onsuccess = r; q.onblocked = r; });
location.reload();
```

After the reload:

```js
const s = await import('/js/storage.js');
const all = await s.readAll();
({ meta: await s.getMeta(), exercises: all.exercises.length, routines: all.routines.sort((a, b) => a.position - b.position).map((r) => [r.name, r.position, r.items.length, r.items[0].repMin]) })
```

Expected: `meta: 2`, `exercises: 49`, and `routines` of `[["Push (Cycle 1)",0,6,6],["Pull (Cycle 1)",1,6,8],["Legs (Cycle 1)",2,6,6]]`.

- [ ] **Step 7: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add js/app.js tests/fixtures/load-v1-db.js .gitignore
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: boot migrates v1 data or seeds a fresh install in one transaction; failure screen + v1 fixture loader" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Stylesheet for the new components, plus accessibility fixes

**Files:**
- Modify: `css/app.css` (replace the whole file)

**Interfaces:**
- Produces these class names, used by Tasks 14–19: `card`, `card-title`, `stack`, `row`, `grow`, `grid-2`, `grid-3`, `muted`, `small`, `ok`, `error`, `btn-block`, `icon-btn`, `icon-spacer`, `link`, `primary`, `nudge`, `upnext`, `focus-head`, `pos`, `clock`, `ex-name`, `target`, `set-line`, `editing`, `stepper`, `stepper-btn`, `stepper-value`, `stepper-input`, `chips`, `chip`, `rir`, `menu`, `list-row`, `done`, `pick-row`, `add`, `group-head`, `history-card`, `empty`, `summary`, `toast`, `save-error`.

- [ ] **Step 1: Replace `css/app.css`**

```css
:root {
  --bg:#0b0f14; --card:#151b23; --ink:#e8eef5; --muted:#8ea0b5; --accent:#3aa0ff;
  --line:#243040;      /* card borders and dividers (decorative) */
  --control:#5a6d85;   /* control borders: ≥3:1 against the input and card fills (WCAG 1.4.11) */
  --ok:#5fd39a; --danger-bg:#3a1414; --danger-ink:#ffb4b4; --danger-line:#7a3030;
}
* { box-sizing:border-box; }
[hidden] { display:none !important; }
body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.4 system-ui,sans-serif; padding-bottom:calc(72px + env(safe-area-inset-bottom)); }
.topbar { position:sticky; top:0; z-index:5; background:var(--bg); padding:14px 16px; border-bottom:1px solid var(--line); }
.topbar h1 { margin:0; font-size:20px; }
h2 { font-size:18px; margin:0; }
h3 { font-size:15px; margin:0; }
p { margin:0; }
#screen { padding:16px; display:flex; flex-direction:column; gap:12px; }

.card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px; }
.card-title { font-weight:600; }
.stack { display:flex; flex-direction:column; gap:8px; }
.row { display:flex; gap:8px; align-items:center; }
.grow { flex:1; min-width:0; }
.grid-2 { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px; }
.grid-3 { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:8px; }
.muted { color:var(--muted); }
.small { font-size:13px; }
.ok { color:var(--ok); }
.error { color:var(--danger-ink); }
.error:empty { display:none; }

button { font:inherit; color:var(--ink); background:var(--card); border:1px solid var(--control); border-radius:10px; padding:12px 14px; min-height:44px; cursor:pointer; }
button.primary { background:var(--accent); color:#06121f; border:1px solid transparent; font-weight:600; }
button.link { background:none; border:none; color:var(--accent); padding:8px 0; text-align:left; align-self:flex-start; }
button:disabled { opacity:.45; cursor:default; }
input:not([type="checkbox"]):not([type="radio"]), select { font:inherit; color:var(--ink); background:#0e141b; border:1px solid var(--control); border-radius:10px; padding:12px; min-height:44px; width:100%; }
input[type="checkbox"] { width:24px; height:24px; margin:0; flex:none; accent-color:var(--accent); }
label.row { min-height:44px; }
:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }

.btn-block { width:100%; min-height:56px; font-size:17px; }
.icon-btn { min-width:48px; min-height:48px; padding:8px; font-size:20px; line-height:1; }
.icon-spacer { display:inline-block; width:48px; flex:none; }

.tabbar { position:fixed; bottom:0; left:0; right:0; z-index:5; display:grid; grid-template-columns:repeat(5,1fr); background:var(--card); border-top:1px solid var(--line); padding-bottom:env(safe-area-inset-bottom); }
.tabbar button { border:none; border-radius:0; min-height:56px; font-size:13px; color:var(--muted); background:none; }
/* Active tab: colour + weight + a top bar, never colour alone (WCAG 1.4.1). */
.tabbar button[aria-current="true"] { color:var(--accent); font-weight:600; box-shadow:inset 0 3px 0 var(--accent); }

.save-error { background:var(--danger-bg); color:var(--danger-ink); border:1px solid var(--danger-line); border-radius:12px; padding:12px; font-weight:600; }

/* Log start */
.upnext h2 { font-size:20px; }
.nudge { text-align:left; border-color:#8a6d1f; background:#2a2310; }

/* Focus view and overview */
.focus-head { display:flex; align-items:center; gap:4px; }
.focus-head .pos { flex:1; text-align:center; color:var(--muted); }
.focus-head h2 { flex:1; min-width:0; }
.clock { font-variant-numeric:tabular-nums; min-width:56px; text-align:right; }
.ex-name { font-size:19px; }
.set-line { display:flex; justify-content:space-between; align-items:center; width:100%; text-align:left; font-variant-numeric:tabular-nums; }
.set-line.editing { border-color:var(--accent); }
.stepper { display:grid; grid-template-columns:72px minmax(0,1fr) 72px; gap:8px; align-items:center; }
.stepper-btn { min-height:56px; font-size:18px; font-weight:600; }
.stepper-value { min-height:56px; font-size:30px; font-weight:700; background:none; border:1px dashed transparent; font-variant-numeric:tabular-nums; }
.stepper-input { min-height:56px; font-size:26px; text-align:center; }
.chips { display:flex; flex-wrap:wrap; gap:8px; }
.chip { min-height:44px; padding:8px 14px; border-radius:999px; }
.chip[aria-pressed="true"], .chip[aria-checked="true"] { background:var(--accent); color:#06121f; border-color:var(--accent); font-weight:600; }
.chips.rir .chip { flex:1; min-height:52px; padding:8px 0; }
.menu { display:flex; flex-direction:column; gap:8px; }
.summary { font-size:20px; font-weight:600; }

/* Lists */
.list-row, .pick-row { display:flex; justify-content:space-between; align-items:center; gap:12px; width:100%; text-align:left; }
.list-row.done { border-color:#2f6b4f; }
.pick-row.add { color:var(--accent); }
.group-head { color:var(--muted); font-size:13px; font-weight:600; margin-top:8px; }
.history-card { display:block; width:100%; text-align:left; }
.history-card > span { display:block; }
.empty { display:flex; align-items:center; gap:12px; }

/* Toast: above the tab bar, one at a time */
.toast { position:fixed; left:16px; right:16px; bottom:calc(68px + env(safe-area-inset-bottom)); z-index:10; display:flex; align-items:center; justify-content:space-between; gap:12px; background:#223043; border:1px solid var(--control); border-radius:12px; padding:10px 12px; }
.toast button { min-height:40px; }
```

- [ ] **Step 2: Verify in the browser**

Reload the preview at the mobile viewport. Walk every tab. The old Log screen still works, and nothing scrolls sideways:

```js
({ overflow: document.documentElement.scrollWidth > innerWidth, activeTabShadow: getComputedStyle(document.querySelector('.tabbar button[aria-current="true"]')).boxShadow })
```

Expected: `overflow: false`, and `activeTabShadow` contains `inset`. Take a screenshot of Library, where the checkbox is 24 px and "Show hidden" sits on one line.

- [ ] **Step 3: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add css/app.css
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "style: focus-view components, contrast-safe control borders, active-tab bar, focus rings, safe area" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Exercise picker

**Files:**
- Create: `js/picker.js`
- Modify: `service-worker.js` (add `'./js/picker.js',` after `'./js/keys.js',`)

**Interfaces:**
- Consumes: `el`, `clear` (Task 10); `put` (Task 11); `newExercise` (Task 3); `filterExercises`, `groupByMuscle`, `groupsPresent`, `nameExists` (Task 6).
- Produces: `openPicker(root, { title = 'Add exercise', type = null, exercises, onPick, onCancel })`. It renders into `root`, replacing its contents. `exercises` is the caller's live array: quick-add `push`es the new exercise onto it before calling `onPick(exercise)`.

- [ ] **Step 1: Create `js/picker.js`**

```js
import { el, clear } from './ui.js';
import { put } from './storage.js';
import { newExercise } from './schema.js';
import { filterExercises, groupByMuscle, groupsPresent, nameExists } from './catalog.js';

// Full-screen exercise picker (spec §7.5). Search + muscle-group chips + a grouped list, and
// "+ Create '…'" to add a missing exercise mid-workout. `type` limits the list (Swap keeps the
// same type). The search box is not auto-focused, so the phone keyboard stays down on arrival.
export function openPicker(root, { title = 'Add exercise', type = null, exercises, onPick, onCancel }) {
  const state = { q: '', group: null };
  const visible = () => exercises.filter((e) => !e.hidden && (!type || e.type === type));
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by muscle group' });
  const count = el('p', { class: 'muted small', role: 'status' });
  const list = el('div', { class: 'stack' });
  const search = el('input', {
    type: 'search', placeholder: 'Search exercises', 'aria-label': 'Search exercises',
    oninput: (ev) => { state.q = ev.target.value; draw(); },
  });

  async function quickAdd(name) {
    const ex = newExercise({
      name, type: type ?? 'strength', custom: true,
      muscleGroup: state.group && state.group !== 'Other' ? state.group : '',
    });
    await put('exercises', ex);
    exercises.push(ex);
    onPick(ex);
  }

  function draw() {
    const pool = visible();
    clear(chips);
    for (const g of [null, ...groupsPresent(pool)]) {
      chips.append(el('button', {
        class: 'chip', 'aria-pressed': String(state.group === g), text: g ?? 'All',
        onclick: () => { state.group = g; draw(); },
      }));
    }
    const rows = filterExercises(pool, { q: state.q, group: state.group });
    count.textContent = `${rows.length} exercise${rows.length === 1 ? '' : 's'}`;
    clear(list);
    for (const { group, items } of groupByMuscle(rows)) {
      list.append(el('h3', { class: 'group-head', text: group }));
      for (const ex of items) {
        list.append(el('button', { class: 'pick-row', onclick: () => onPick(ex) }, [
          el('span', { text: ex.name }),
          el('span', { class: 'muted small', text: ex.equipment || '' }),
        ]));
      }
    }
    if (!rows.length) {
      list.append(el('div', { class: 'empty' }, [
        el('p', { class: 'muted', text: 'No matches.' }),
        el('button', { text: 'Clear search', onclick: () => { state.q = ''; state.group = null; search.value = ''; draw(); } }),
      ]));
    }
    const q = state.q.trim();
    if (q && !nameExists(exercises, q)) {
      list.append(el('button', { class: 'pick-row add', text: `+ Create "${q}"`, onclick: () => quickAdd(q) }));
    }
  }

  clear(root);
  root.append(
    el('div', { class: 'row' }, [
      el('button', { class: 'icon-btn', 'aria-label': 'Back', text: '‹', onclick: onCancel }),
      el('h2', { class: 'grow', text: title }),
    ]),
    search, chips, count, list,
  );
  draw();
}
```

- [ ] **Step 2: Add to the offline cache and run the tests**

In `service-worker.js`, change `'./js/keys.js',` to `'./js/keys.js', './js/picker.js',`.

Run: `node --test`
Expected: PASS.

- [ ] **Step 3: Verify in the browser**

Open the preview at the mobile viewport and run:

```js
const s = await import('/js/storage.js');
const exercises = await s.getAll('exercises');
window.__picked = null;
(await import('/js/picker.js')).openPicker(document.getElementById('screen'), {
  exercises, onPick: (e) => { window.__picked = e.name; }, onCancel: () => { window.__picked = 'CANCEL'; },
});
({ focused: document.activeElement.tagName, count: document.querySelector('#screen [role=status]').textContent, chips: [...document.querySelectorAll('.chip')].map((c) => c.textContent) })
```

Expected: `focused` is not `INPUT`, `count` equals the number of non-hidden exercises (`exercises.filter((e) => !e.hidden).length`), and the chips start `All, Chest, Shoulders, Back, Arms, Legs, Posterior chain, Conditioning`.

Then type `zzz test lift` into the search field (`computer` type action). It shows "No matches · Clear search" and then `+ Create "zzz test lift"`. Tap Create and check `window.__picked === 'zzz test lift'`. Tap the Legs chip: only Legs exercises show, and the count updates. Tap ‹ and check `window.__picked === 'CANCEL'`. Finally, delete the test exercise:

```js
const s = await import('/js/storage.js');
const t = (await s.getAll('exercises')).find((e) => e.name === 'zzz test lift');
await s.remove('exercises', t.id);
```

- [ ] **Step 4: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add js/picker.js service-worker.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: searchable, grouped exercise picker with quick-add" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: New Log screen (start, focus view, overview, finish, wake lock)

**Files:**
- Create: `js/wakelock.js`
- Create: `js/focus.js`
- Modify: `js/session.js` (replace the whole file)
- Modify: `service-worker.js` (add `'./js/wakelock.js', './js/focus.js',` after `'./js/picker.js',`)

**Interfaces:**
- Consumes: everything from Tasks 2–14. In particular `getAll`, `get`, `put`, `remove`, `getSettings` (storage); `newSession`, `newStrengthEntry`, `newCardioEntry`, `newSet`, `clampRir`, `targetFromItem`, `compareRoutines` (schema); `lastPerformance`, `prefillSet`, `nextRoutine` (progression); `countLoggedSets`, `entryProgress`, `finishSummary`, `finishedAtFor`, `applyFinish`, `STALE_SEC` (sessionLogic); `formatTarget`, `formatSets`, `formatSetLine`, `formatShortDate`, `formatRir`, `formatDuration`, `formatMinutes`, `formatAgo`, `numberOrNull`, `intOrNull` (format); `exerciseLabel` (catalog); `openPicker` (picker); `el`, `clear`, `field`, `showToast`, `hideToast` (ui); `showScreen` (app); `ACTIVE_SESSION`, `LAST_BACKUP` (keys).
- Produces:
  - `session.js`:
    - `renderLog(root) → cleanup`
    - `createWorkout(routine|null) → session`. It persists the workout and sets `ACTIVE_SESSION`. Task 16 uses it.
  - `focus.js`: `renderFocus(ctx)`.
  - `wakelock.js`: `acquire()`, `release()`, `isHeld()`.
  - The **ctx contract** that `session.js` builds and `focus.js` reads:
    - `{ root, session, exercises, exIndex /*Map*/, history /*other sessions*/, settings, alive, view, fs /*focus transient state*/, menuOpen, useLastSetTime,`
    - `save() /*never rejects*/, go(view) /*'focus'|'overview'|'finish'|'add'|'swap'*/, tick() /*paint clocks now*/ }`

- [ ] **Step 1: Create `js/wakelock.js`**

```js
// Keeps the screen on during a workout (spec §7.2, settings.keepScreenOn). The browser drops the
// lock whenever the page is hidden, so it's re-requested on return. Every failure is silent: this
// is a convenience, never a reason to block logging.
let sentinel = null;
let wanted = false;

async function request() {
  if (!wanted || sentinel || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch {
    sentinel = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') request();
});

export async function acquire() {
  wanted = true;
  await request();
}

export async function release() {
  wanted = false;
  const s = sentinel;
  sentinel = null;
  try { await s?.release(); } catch { /* already released */ }
}

export const isHeld = () => !!sentinel;
```

- [ ] **Step 2: Create `js/focus.js`**

```js
import { el, clear, field, showToast } from './ui.js';
import { newSet, clampRir } from './schema.js';
import { numberOrNull, intOrNull, formatTarget, formatSets, formatSetLine, formatShortDate, formatRir } from './format.js';
import { lastPerformance, prefillSet } from './progression.js';
import { exerciseLabel } from './catalog.js';

// The one-exercise-at-a-time logging view (spec §7.2 strength, §7.2a cardio).
// ctx comes from session.js; ctx.fs holds this view's transient state for the current entry
// (draft values, which set is being edited, open menus) and resets when the entry changes.
export function renderFocus(ctx) {
  const { root, session } = ctx;
  const count = session.entries.length;
  if (!count) { ctx.go('overview'); return; }
  const i = Math.min(Math.max(0, session.cursor ?? 0), count - 1);
  session.cursor = i;
  const entry = session.entries[i];
  if (ctx.fs.entry !== entry) ctx.fs = { entry };
  const ex = ctx.exIndex.get(entry.exerciseId);

  clear(root);
  root.append(header(ctx, i, count), el('h2', { class: 'ex-name', text: exerciseLabel(ex) }));
  if (ctx.fs.menuOpen) root.append(menu(ctx, i, ex));
  if (entry.type === 'cardio') renderCardio(ctx, entry, i);
  else renderStrength(ctx, entry, i, ex);
  ctx.tick();
}

function moveTo(ctx, index) {
  ctx.session.cursor = index;
  ctx.save();
  renderFocus(ctx);
}

function header(ctx, i, count) {
  const spacer = () => el('span', { class: 'icon-spacer', 'aria-hidden': 'true' });
  return el('div', { class: 'focus-head' }, [
    i > 0 ? el('button', { class: 'icon-btn', 'aria-label': 'Previous exercise', text: '‹', onclick: () => moveTo(ctx, i - 1) }) : spacer(),
    el('span', { class: 'pos', text: `${i + 1} of ${count}` }),
    i < count - 1 ? el('button', { class: 'icon-btn', 'aria-label': 'Next exercise', text: '›', onclick: () => moveTo(ctx, i + 1) }) : spacer(),
    el('span', { class: 'clock muted', 'data-clock': '', 'aria-label': 'Workout time' }),
    el('button', { class: 'icon-btn', 'aria-label': 'Workout overview', text: '≡', onclick: () => ctx.go('overview') }),
    el('button', {
      class: 'icon-btn', 'aria-label': 'Exercise options', 'aria-expanded': String(!!ctx.fs.menuOpen), text: '…',
      onclick: () => { ctx.fs.menuOpen = !ctx.fs.menuOpen; renderFocus(ctx); },
    }),
  ]);
}

function menu(ctx, i, ex) {
  return el('div', { class: 'card menu' }, [
    el('button', { text: 'Swap exercise', onclick: () => { ctx.fs.menuOpen = false; ctx.go('swap'); } }),
    el('button', { text: 'Remove exercise', onclick: () => removeEntry(ctx, i, ex) }),
    el('button', { text: 'Close', onclick: () => { ctx.fs.menuOpen = false; renderFocus(ctx); } }),
  ]);
}

async function removeEntry(ctx, i, ex) {
  const { session } = ctx;
  const [removed] = session.entries.splice(i, 1);
  session.cursor = Math.max(0, Math.min(i, session.entries.length - 1));
  await ctx.save();
  ctx.go(session.entries.length ? 'focus' : 'overview');
  showToast(`Removed ${exerciseLabel(ex)}`, {
    actionLabel: 'Undo',
    onAction: async () => {
      if (!ctx.alive) return;
      session.entries.splice(i, 0, removed);
      session.cursor = i;
      await ctx.save();
      ctx.go('focus');
    },
  });
}

// "Next: <exercise> ›", or "Review & finish ›" on the last entry.
function nextButton(ctx, i) {
  const { session } = ctx;
  if (i < session.entries.length - 1) {
    const nextEx = ctx.exIndex.get(session.entries[i + 1].exerciseId);
    return el('button', { class: 'primary btn-block', text: `Next: ${exerciseLabel(nextEx)} ›`, onclick: () => moveTo(ctx, i + 1) });
  }
  return el('button', { class: 'primary btn-block', text: 'Review & finish ›', onclick: () => ctx.go('overview') });
}

// ---------- strength ----------

function renderStrength(ctx, entry, i, ex) {
  const { root, session } = ctx;
  const fs = ctx.fs;
  const target = formatTarget(entry.target);
  if (target) root.append(el('p', { class: 'target', text: `Target ${target}` }));
  const last = lastPerformance(ctx.history, entry.exerciseId, { excludeId: session.id });
  root.append(el('p', {
    class: 'muted',
    text: last ? `Last time ${formatShortDate(last.date)} · ${formatSets(last.sets)}` : 'First time: pick a starting weight',
  }));

  if (entry.sets.length) {
    root.append(el('div', { class: 'stack' }, entry.sets.map((s, k) => el('button', {
      class: `set-line${fs.editIdx === k ? ' editing' : ''}`,
      'aria-label': `Edit set ${k + 1}: ${formatSetLine(s)}`,
      onclick: () => {
        Object.assign(fs, {
          editIdx: k, error: null, noteOpen: !!s.note,
          draft: { weight: s.weight ?? null, reps: s.reps ?? null, rir: s.rir ?? null, note: s.note || '' },
        });
        renderFocus(ctx);
      },
    }, [el('span', { text: `Set ${k + 1} · ${formatSetLine(s)}` }), el('span', { class: 'ok', 'aria-hidden': 'true', text: '✓' })]))));
  }

  if (!fs.draft) {
    const p = prefillSet({ loggedThisSession: entry.sets, lastSets: last ? last.sets : [], target: entry.target });
    fs.draft = { ...p, note: '' };
  }
  const d = fs.draft;
  const step = ex?.weightStep ?? ctx.settings.defaultWeightStep ?? 5;
  root.append(
    stepper({ label: 'Weight (lb)', noun: 'weight', unit: 'lb', value: d.weight, step, decimals: true, onChange: (v) => { d.weight = v; } }),
    stepper({ label: 'Reps', noun: 'reps', value: d.reps, step: 1, decimals: false, onChange: (v) => { d.reps = v; } }),
    rirChips(d.rir, (v) => { d.rir = v; }),
  );

  if (fs.noteOpen) {
    root.append(el('input', {
      type: 'text', placeholder: 'Note for this set', 'aria-label': 'Note for this set', value: d.note,
      oninput: (ev) => { d.note = ev.target.value; },
    }));
  } else {
    root.append(el('button', {
      class: 'link', text: '+ Add note',
      onclick: () => {
        fs.noteOpen = true;
        renderFocus(ctx);
        root.querySelector('input[aria-label="Note for this set"]')?.focus();
      },
    }));
  }
  if (fs.error) root.append(el('p', { class: 'error', role: 'alert', text: fs.error }));
  root.append(...actions(ctx, entry, i));
}

function actions(ctx, entry, i) {
  const fs = ctx.fs;
  if (fs.editIdx !== undefined && fs.editIdx !== null) {
    const k = fs.editIdx;
    return [
      el('button', { class: 'primary btn-block', text: `Save set ${k + 1}`, onclick: () => saveEdit(ctx, entry, k) }),
      el('div', { class: 'row' }, [
        el('button', { class: 'grow', text: 'Delete set', onclick: () => deleteSet(ctx, entry, k) }),
        el('button', { class: 'grow', text: 'Cancel', onclick: () => resetDraft(ctx) }),
      ]),
    ];
  }
  const t = entry.target?.sets ?? null;
  const n = entry.sets.length;
  if (t !== null && n >= t) {
    return [nextButton(ctx, i), el('button', { class: 'btn-block', text: 'Log extra set', onclick: () => logSet(ctx, entry) })];
  }
  return [el('button', {
    class: 'primary btn-block', text: t !== null ? `Log set ${n + 1} of ${t}` : `Log set ${n + 1}`,
    onclick: () => logSet(ctx, entry),
  })];
}

function resetDraft(ctx) {
  Object.assign(ctx.fs, { editIdx: null, draft: null, noteOpen: false, error: null });
  renderFocus(ctx);
}

// Reps are required; weight may be blank (bodyweight / no added weight).
function readDraft(ctx) {
  const d = ctx.fs.draft;
  if (d.reps === null || d.reps === undefined) {
    ctx.fs.error = 'Enter reps';
    renderFocus(ctx);
    return null;
  }
  return { weight: d.weight ?? null, reps: d.reps, rir: clampRir(d.rir), note: (d.note || '').trim() };
}

async function logSet(ctx, entry) {
  const v = readDraft(ctx);
  if (!v) return;
  entry.sets.push(newSet({ ...v, loggedAt: new Date().toISOString() }));
  await ctx.save();
  navigator.vibrate?.(30);
  resetDraft(ctx);
}

async function saveEdit(ctx, entry, k) {
  const v = readDraft(ctx);
  if (!v) return;
  entry.sets[k] = { ...entry.sets[k], ...v };
  await ctx.save();
  resetDraft(ctx);
}

async function deleteSet(ctx, entry, k) {
  const [removed] = entry.sets.splice(k, 1);
  await ctx.save();
  resetDraft(ctx);
  showToast(`Set ${k + 1} deleted`, {
    actionLabel: 'Undo',
    onAction: async () => {
      if (!ctx.alive) return;
      entry.sets.splice(k, 0, removed);
      await ctx.save();
      if (ctx.view === 'focus') renderFocus(ctx);
    },
  });
}

// Big −/value/+ control. Tapping the value swaps in a numeric field for typing an exact number.
function stepper({ label, noun, unit = '', value, step, decimals, onChange }) {
  let current = value ?? null;
  const round = (v) => (decimals ? Math.round(v * 100) / 100 : Math.round(v));
  const out = el('button', { class: 'stepper-value', 'aria-label': `${label}, tap to type`, 'aria-live': 'polite' });
  const show = () => { out.textContent = current === null ? '—' : String(current); };
  const set = (v) => { current = v; onChange(v); show(); };
  const suffix = unit ? ` ${unit}` : '';
  const minus = el('button', {
    class: 'stepper-btn', 'aria-label': `Decrease ${noun} by ${step}${suffix}`, text: `−${step}`,
    onclick: () => { if (current !== null) set(Math.max(0, round(current - step))); },
  });
  const plus = el('button', {
    class: 'stepper-btn', 'aria-label': `Increase ${noun} by ${step}${suffix}`, text: `+${step}`,
    onclick: () => set(round((current ?? 0) + step)),
  });
  out.addEventListener('click', () => {
    const input = el('input', {
      type: 'number', inputmode: decimals ? 'decimal' : 'numeric', step: decimals ? 'any' : '1', min: '0',
      class: 'stepper-input', 'aria-label': label, value: current ?? '',
    });
    const commit = () => {
      const v = decimals ? numberOrNull(input.value) : intOrNull(input.value);
      set(v === null ? null : Math.max(0, round(v)));
      input.replaceWith(out);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') input.blur();
      if (ev.key === 'Escape') { input.removeEventListener('blur', commit); input.replaceWith(out); }
    });
    out.replaceWith(input);
    input.focus();
    input.select?.();
  });
  show();
  return el('div', {}, [el('div', { class: 'muted small', text: label }), el('div', { class: 'stepper' }, [minus, out, plus])]);
}

// RIR 0–4+ as a radio group; tapping the selected chip clears it.
function rirChips(value, onChange) {
  let current = value ?? null;
  const group = el('div', { class: 'chips rir', role: 'radiogroup', 'aria-label': 'Reps in reserve' });
  const draw = (focusIdx = null) => {
    clear(group);
    [0, 1, 2, 3, 4].forEach((v, idx) => {
      group.append(el('button', {
        class: 'chip', role: 'radio', 'aria-checked': String(current === v), text: formatRir(v),
        onclick: () => { current = current === v ? null : v; onChange(current); draw(idx); },
      }));
    });
    if (focusIdx !== null) group.children[focusIdx]?.focus();
  };
  draw();
  return el('div', {}, [el('div', { class: 'muted small', text: 'RIR (reps in reserve)' }), group]);
}

// ---------- cardio ----------

function renderCardio(ctx, entry, i) {
  const { root } = ctx;
  if (entry.target?.note) root.append(el('p', { class: 'target', text: entry.target.note }));
  root.append(el('p', { class: 'muted', text: 'Track it on your Garmin.' }));
  root.append(stepper({
    label: 'Minutes (optional)', noun: 'minutes', step: 1, decimals: false,
    value: entry.durationSec == null ? null : Math.round(entry.durationSec / 60),
    onChange: (v) => { entry.durationSec = v === null ? null : v * 60; ctx.save(); },
  }));
  if (ctx.fs.distanceOpen || entry.distance != null) {
    root.append(distanceFields(ctx, entry, i));
  } else {
    root.append(el('button', { class: 'link', text: '+ Distance', onclick: () => { ctx.fs.distanceOpen = true; renderFocus(ctx); } }));
  }
  if (!entry.done) {
    root.append(el('button', {
      class: 'primary btn-block', text: 'Mark done',
      onclick: async () => { entry.done = true; await ctx.save(); navigator.vibrate?.(30); renderFocus(ctx); },
    }));
  } else {
    root.append(nextButton(ctx, i), el('button', {
      class: 'btn-block', 'aria-pressed': 'true', text: 'Done ✓ (tap to undo)',
      onclick: async () => { entry.done = false; await ctx.save(); renderFocus(ctx); },
    }));
  }
}

function distanceFields(ctx, entry, i) {
  const dist = el('input', {
    type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: entry.distance ?? '',
    oninput: (ev) => {
      const v = numberOrNull(ev.target.value);
      entry.distance = v !== null && v >= 0 ? v : null;
      ctx.save();
    },
  });
  const unit = el('select', {}, ['mi', 'km', 'm'].map((u) => el('option', { value: u, text: u })));
  unit.value = entry.distanceUnit ?? 'mi';
  unit.addEventListener('change', () => { entry.distanceUnit = unit.value; ctx.save(); });
  return el('div', { class: 'grid-2' }, [field('Distance', `cardio-${i}-distance`, dist), field('Unit', `cardio-${i}-unit`, unit)]);
}
```

- [ ] **Step 3: Replace `js/session.js`**

```js
import { getAll, get, put, remove, getSettings } from './storage.js';
import { newSession, newStrengthEntry, newCardioEntry, targetFromItem, compareRoutines } from './schema.js';
import { el, clear, hideToast } from './ui.js';
import { showScreen } from './app.js';
import { ACTIVE_SESSION, LAST_BACKUP } from './keys.js';
import { nextRoutine } from './progression.js';
import { countLoggedSets, entryProgress, finishSummary, finishedAtFor, applyFinish, STALE_SEC } from './sessionLogic.js';
import { formatDuration, formatMinutes, formatAgo } from './format.js';
import { exerciseLabel } from './catalog.js';
import { openPicker } from './picker.js';
import { renderFocus } from './focus.js';
import * as wakeLock from './wakelock.js';

const BACKUP_NUDGE_DAYS = 7;
const VIEWS = { focus: renderFocus, overview: renderOverview, finish: renderFinish, add: renderAdd, swap: renderSwap };

let active = null;      // the live workout context while the Log tab shows a workout
let clockTimer = null;
let starting = false;   // ignores a double-tap on Start

// Log tab entry point: the running workout if there is one, else the start screen.
// Always returns leaveWorkout, so switching tabs stops the clock, the wake lock and any toast.
export async function renderLog(root) {
  const id = localStorage.getItem(ACTIVE_SESSION);
  if (id) {
    const session = await get('sessions', id);
    if (session) {
      await enterWorkout(root, session, 'focus');
      return leaveWorkout;
    }
    // Stale pointer (discarded, or a restore replaced it): drop it, show the start screen.
    localStorage.removeItem(ACTIVE_SESSION);
  }
  await renderStart(root);
  return leaveWorkout;
}

// Creates a workout (optionally from a routine), persists it at once, and marks it active.
// Each entry carries a snapshot of its routine target. Also used by the Routines screen.
export async function createWorkout(routine) {
  const exercises = await getAll('exercises');
  const exIndex = new Map(exercises.map((e) => [e.id, e]));
  const session = newSession({ name: routine ? routine.name : undefined, routineId: routine ? routine.id : null });
  for (const item of routine ? routine.items : []) {
    const ex = exIndex.get(item.exerciseId);
    session.entries.push(ex && ex.type === 'cardio'
      ? newCardioEntry(item.exerciseId, targetFromItem(item, 'cardio'))
      : newStrengthEntry(item.exerciseId, targetFromItem(item)));
  }
  await put('sessions', session);
  localStorage.setItem(ACTIVE_SESSION, session.id);
  return session;
}

// ---------- start screen (spec §7.1) ----------

async function renderStart(root) {
  clear(root);
  const [routines, sessions] = await Promise.all([getAll('routines'), getAll('sessions')]);
  routines.sort(compareRoutines);
  const nudge = backupNudge(sessions);
  if (nudge) root.append(nudge);

  const next = nextRoutine(routines, sessions);
  if (next) {
    const count = next.items.length;
    root.append(el('div', { class: 'card upnext stack' }, [
      el('div', { class: 'muted small', text: 'Up next' }),
      el('h2', { text: next.name }),
      el('div', { class: 'muted', text: `${count} exercise${count === 1 ? '' : 's'}` }),
      el('button', { class: 'primary btn-block', text: 'Start', 'aria-label': `Start ${next.name}`, onclick: () => begin(root, next) }),
    ]));
    for (const r of routines) {
      if (r.id !== next.id) root.append(el('button', { class: 'btn-block', text: `Start ${r.name}`, onclick: () => begin(root, r) }));
    }
  } else {
    root.append(el('div', { class: 'card stack' }, [
      el('p', { class: 'muted', text: 'No routines yet.' }),
      el('button', { text: 'Build one in Routines ›', onclick: () => showScreen('routines') }),
    ]));
  }
  root.append(el('button', { class: 'btn-block', text: 'Freestyle workout', onclick: () => begin(root, null) }));
}

function backupNudge(sessions) {
  if (!sessions.length) return null;
  const last = localStorage.getItem(LAST_BACKUP);
  const ageDays = last ? (Date.now() - Date.parse(last)) / 86_400_000 : Infinity;
  if (ageDays <= BACKUP_NUDGE_DAYS) return null;
  const label = Number.isFinite(ageDays) ? `Last backup ${Math.floor(ageDays)} days ago` : 'No backup yet';
  return el('button', { class: 'nudge', text: `${label} · Back up ›`, onclick: () => showScreen('backup') });
}

async function begin(root, routine) {
  if (starting) return;
  starting = true;
  try {
    const session = await createWorkout(routine);
    await enterWorkout(root, session, session.entries.length ? 'focus' : 'add');
  } finally {
    starting = false;
  }
}

// ---------- the live workout ----------

function stopEffects() {
  clearInterval(clockTimer);
  clockTimer = null;
  wakeLock.release();
}

async function enterWorkout(root, session, view) {
  if (active) active.alive = false;
  stopEffects();
  const [exercises, sessions, settings] = await Promise.all([getAll('exercises'), getAll('sessions'), getSettings()]);
  const ctx = {
    root, session, exercises, settings,
    exIndex: new Map(exercises.map((e) => [e.id, e])),
    history: sessions.filter((s) => s.id !== session.id),
    alive: true, view: null, fs: {}, menuOpen: false, useLastSetTime: undefined,
    // The single persistence chokepoint: every change to the workout is saved through here.
    save: () => put('sessions', session).catch(() => showSaveError(root)),
    go: (v) => { if (!ctx.alive) return; ctx.view = v; VIEWS[v](ctx); },
    tick: () => tickClock(session),
  };
  active = ctx;
  clockTimer = setInterval(() => tickClock(session), 1000);
  if (settings.keepScreenOn) wakeLock.acquire();
  ctx.go(view);
}

function leaveWorkout() {
  if (active) active.alive = false;
  active = null;
  stopEffects();
  hideToast();
}

function tickClock(session) {
  const text = formatDuration((Date.now() - Date.parse(session.date)) / 1000);
  document.querySelectorAll('[data-clock]').forEach((n) => { n.textContent = text; });
}

function showSaveError(root) {
  if (root.querySelector('.save-error')) return;
  root.prepend(el('div', { class: 'save-error', role: 'alert', text: "⚠ Couldn't save your last change — check device storage." }));
}

// ---------- overview (spec §7.3) ----------

function renderOverview(ctx) {
  const { root, session } = ctx;
  clear(root);
  root.append(el('div', { class: 'focus-head' }, [
    el('h2', { text: session.name }),
    el('span', { class: 'clock muted', 'data-clock': '', 'aria-label': 'Workout time' }),
    el('button', {
      class: 'icon-btn', 'aria-label': 'Workout options', 'aria-expanded': String(!!ctx.menuOpen), text: '…',
      onclick: () => { ctx.menuOpen = !ctx.menuOpen; renderOverview(ctx); },
    }),
  ]));
  if (ctx.menuOpen) {
    root.append(el('div', { class: 'card menu' }, [
      el('button', { text: 'Discard workout', onclick: () => discardWorkout(ctx) }),
      el('button', { text: 'Close', onclick: () => { ctx.menuOpen = false; renderOverview(ctx); } }),
    ]));
  }
  if (session.entries.length) {
    root.append(el('button', { class: 'link', text: '‹ Back to exercise', onclick: () => ctx.go('focus') }));
  } else {
    root.append(el('p', { class: 'muted', text: 'No exercises yet.' }));
  }
  root.append(el('div', { class: 'stack' }, session.entries.map((entry, i) => {
    const p = entryProgress(entry);
    const name = exerciseLabel(ctx.exIndex.get(entry.exerciseId));
    return el('button', {
      class: `list-row${p.done ? ' done' : ''}`, 'aria-label': `${name}, ${p.spoken}`,
      onclick: () => { session.cursor = i; ctx.save(); ctx.go('focus'); },
    }, [el('span', { text: name }), el('span', { class: p.done ? 'ok' : 'muted', text: p.label })]);
  })));
  root.append(
    el('button', { text: '+ Add exercise', onclick: () => ctx.go('add') }),
    el('button', { class: 'primary btn-block', text: 'Finish workout', onclick: () => { ctx.useLastSetTime = undefined; ctx.go('finish'); } }),
  );
  ctx.tick();
}

// ---------- finish and discard (spec §7.4) ----------

function renderFinish(ctx) {
  const { root, session } = ctx;
  clear(root);
  const nowIso = new Date().toISOString();
  const sum = finishSummary(session, ctx.exIndex, nowIso);
  if (sum.nothingLogged) {
    root.append(
      el('h2', { text: 'Nothing logged yet' }),
      el('p', { class: 'muted', text: 'Log a set or mark cardio done first, or discard this workout.' }),
      el('div', { class: 'row' }, [
        el('button', { class: 'primary grow', text: 'Keep going', onclick: () => ctx.go('overview') }),
        el('button', { class: 'grow', text: 'Discard workout', onclick: () => discardWorkout(ctx) }),
      ]),
    );
    return;
  }
  const stale = sum.staleSec !== null && sum.staleSec > STALE_SEC;
  if (ctx.useLastSetTime === undefined) ctx.useLastSetTime = stale;
  const useLast = stale && ctx.useLastSetTime;
  const finishedAt = finishedAtFor(session, { nowIso, useLastSetTime: useLast });
  const durationSec = (Date.parse(finishedAt) - Date.parse(session.date)) / 1000;
  root.append(
    el('h2', { text: `Finish ${session.name}?` }),
    el('p', { class: 'summary', text: `${sum.setCount} set${sum.setCount === 1 ? '' : 's'} · ${formatMinutes(durationSec)}` }),
  );
  if (sum.removeNames.length) {
    root.append(el('p', { class: 'muted', text: `Not logged (will be removed): ${sum.removeNames.join(', ')}` }));
  }
  if (stale) {
    const cb = el('input', { type: 'checkbox', id: 'finish-use-last-set' });
    cb.checked = useLast;
    cb.addEventListener('change', () => { ctx.useLastSetTime = cb.checked; renderFinish(ctx); });
    root.append(el('label', { class: 'row', for: 'finish-use-last-set' }, [
      cb, el('span', { text: `Last set was ${formatAgo(sum.staleSec)} ago. Use that as the finish time?` }),
    ]));
  }
  root.append(el('div', { class: 'row' }, [
    el('button', { class: 'primary grow', text: 'Finish', onclick: () => finishWorkout(ctx, useLast) }),
    el('button', { class: 'grow', text: 'Keep going', onclick: () => ctx.go('overview') }),
  ]));
}

async function finishWorkout(ctx, useLastSetTime) {
  const done = applyFinish(ctx.session, { nowIso: new Date().toISOString(), useLastSetTime });
  try {
    await put('sessions', done);
  } catch {
    showSaveError(ctx.root);
    return;
  }
  localStorage.removeItem(ACTIVE_SESSION);
  showScreen('history', { openId: done.id });
}

async function discardWorkout(ctx) {
  const n = countLoggedSets(ctx.session);
  if (n > 0 && !confirm(`Discard this workout? ${n} logged set${n === 1 ? '' : 's'} will be deleted.`)) return;
  await remove('sessions', ctx.session.id);
  localStorage.removeItem(ACTIVE_SESSION);
  const { root } = ctx;
  leaveWorkout();
  await renderStart(root);
}

// ---------- add and swap (spec §7.2 menu, §7.3) ----------

function renderAdd(ctx) {
  openPicker(ctx.root, {
    title: 'Add exercise', exercises: ctx.exercises,
    onCancel: () => ctx.go('overview'),
    onPick: async (ex) => {
      ctx.exIndex.set(ex.id, ex);
      ctx.session.entries.push(ex.type === 'cardio' ? newCardioEntry(ex.id) : newStrengthEntry(ex.id));
      ctx.session.cursor = ctx.session.entries.length - 1;
      await ctx.save();
      ctx.go('focus');
    },
  });
}

function renderSwap(ctx) {
  const { session } = ctx;
  const i = session.cursor;
  const entry = session.entries[i];
  openPicker(ctx.root, {
    title: 'Swap exercise', type: entry.type, exercises: ctx.exercises,
    onCancel: () => ctx.go('focus'),
    onPick: async (ex) => {
      ctx.exIndex.set(ex.id, ex);
      if (ex.id !== entry.exerciseId) {
        const n = entry.type === 'strength' ? entry.sets.length : 0;
        if (n > 0) {
          const oldName = exerciseLabel(ctx.exIndex.get(entry.exerciseId));
          if (!confirm(`Keep the ${n} logged set${n === 1 ? '' : 's'} under ${oldName} and continue with ${ex.name}?`)) {
            ctx.go('focus');
            return;
          }
          session.entries.splice(i + 1, 0, newStrengthEntry(ex.id, entry.target));
          session.cursor = i + 1;
        } else {
          entry.exerciseId = ex.id;
          ctx.fs = {}; // a different exercise: fresh pre-fill and "Last time"
        }
        await ctx.save();
      }
      ctx.go('focus');
    },
  });
}
```

- [ ] **Step 4: Add to the offline cache and run the tests**

In `service-worker.js`, change `'./js/picker.js',` to `'./js/picker.js', './js/wakelock.js', './js/focus.js',`.

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Verify in the browser (mobile viewport)**

Reload `http://localhost:5055/`. Start from the Task 12 fixture state (`loadV1Fixture()` + reload) so "Last time" has data. Check each item. Use `read_page`/`find` to get refs and `computer` clicks; check values with `javascript_tool`.

1. **Log start:** "Up next · Pull (Cycle 1)" (the last routine session was Push), then "Start Push (Cycle 1)", "Start Legs (Cycle 1)" and "Freestyle workout". There are no `<select>` elements (`document.querySelectorAll('#screen select').length === 0`).
2. Tap **Start Push (Cycle 1)**. The focus view shows "1 of 6", a ticking clock, "Barbell Bench Press", "Target 3 × 6–8 @ RIR 2 · Primary press. Rest ~2 min." and "Last time Mon Sep 21 · 135 × 8, 8, 7". The steppers read 135 / 8, RIR 2 is selected, and the button says **Log set 1 of 3**. `document.activeElement` is not an input.
3. **One tap:** tap Log set. "Set 1 · 135 × 8 · RIR 2 ✓" appears, and the button now reads "Log set 2 of 3".
4. **Two taps:** tap **+5**, then Log. Set 2 is 140 × 8.
5. Log set 3. The primary button becomes **"Next: Overhead Press ›"**, with **Log extra set** below it.
6. Tap set 2. Its values load, and the buttons are **Save set 2 / Delete set / Cancel**. Delete it: a toast "Set 2 deleted · Undo" appears. Tap Undo and set 2 is back.
7. Clear reps (tap the reps value, empty it, blur) and tap Log. The error "Enter reps" shows and nothing is logged.
8. Reload the page mid-workout. The app reopens on the same exercise with all its sets.
9. Go to the Stationary Bike (›). You see the target note, "Track it on your Garmin." and a Minutes stepper. Tap **Mark done**; the button changes to "Review & finish ›" plus "Done ✓ (tap to undo)".
10. **≡ Overview:** Bench shows ✓, Overhead Press shows "—", Bike shows ✓. Tap a row and it opens that exercise.
11. **… → Swap exercise** on Lat Pulldown (start a Pull workout for this, or add Lat Pulldown). The picker only lists strength exercises. Choose Pull-up: with no sets logged it's replaced in place and the target is kept.
12. **… → Remove exercise,** then Undo. The exercise comes back.
13. **Finish workout:** you see "N sets · M min" and "Not logged (will be removed): …". Tap Finish and you land on History. (The History detail view arrives in Task 18.) The removed entries aren't stored:

    ```js
    const s = await import('/js/storage.js');
    (await s.getAll('sessions')).sort((a, b) => b.date.localeCompare(a.date))[0].entries.map((e) => e.exerciseId)
    ```

14. **Stale finish:** start a workout and log a set. Then back-date that set:

    ```js
    const s = await import('/js/storage.js');
    const id = localStorage.getItem('activeSessionId');
    const w = await s.get('sessions', id);
    w.entries.find((e) => e.sets?.length).sets[0].loggedAt = new Date(Date.now() - 2 * 3600e3).toISOString();
    await s.put('sessions', w);
    location.reload();
    ```

    Now ≡ → Finish workout shows "Last set was 2 h ago. Use that as the finish time?", checked. With it checked, the duration shown is short. Uncheck it and the duration grows.
15. **Discard** (overview …) with sets logged: the confirm dialog names the count. Cancel keeps the workout; OK returns to the start screen.
16. **Freestyle:** the picker opens straight away. Cancel lands on an empty overview; its Finish shows "Nothing logged yet" with Discard.
17. **Wake lock:** during a workout, `(await import('/js/wakelock.js')).isHeld()` is `true` where supported. Switch to the History tab and it's `false`.
18. **Errors:** no console errors (`read_console_messages` with `onlyErrors`), and nothing scrolls sideways at 375 px.

- [ ] **Step 6: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add js/wakelock.js js/focus.js js/session.js service-worker.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: focus-view logging (one-tap sets, targets, last time), overview, finish summary, wake lock" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Routines, with Start and the range/RIR editor

**Files:**
- Modify: `js/routines.js` (replace the whole file)

**Interfaces:**
- Consumes: `getAll`, `get`, `put`, `remove` (storage); `newRoutine`, `newRoutineItem`, `compareRoutines` (schema); `el`, `clear`, `field`, `showToast` (ui); `intOrNull` (format); `exerciseLabel` (catalog); `openPicker` (picker); `showScreen` (app); `ACTIVE_SESSION` (keys); `createWorkout` (session).
- Produces: `renderRoutines(root)` (the same entry point).

- [ ] **Step 1: Replace `js/routines.js`**

```js
import { getAll, get, put, remove } from './storage.js';
import { newRoutine, newRoutineItem, compareRoutines } from './schema.js';
import { el, clear, field, showToast } from './ui.js';
import { intOrNull } from './format.js';
import { exerciseLabel } from './catalog.js';
import { openPicker } from './picker.js';
import { showScreen } from './app.js';
import { ACTIVE_SESSION } from './keys.js';
import { createWorkout } from './session.js';

export async function renderRoutines(root) {
  const [routines, exercises] = await Promise.all([getAll('routines'), getAll('exercises')]);
  routines.sort(compareRoutines);
  renderList(root, routines, exercises);
}

async function refresh(root) {
  clear(root);
  await renderRoutines(root);
}

function renderList(root, routines, exercises) {
  clear(root);
  root.append(el('button', { class: 'primary', text: '+ New routine', onclick: () => openEditor(root, null, exercises, routines) }));
  if (!routines.length) root.append(el('p', { class: 'muted', text: 'No routines yet.' }));
  for (const r of routines) root.append(routineCard(root, r, exercises, routines));
}

function routineCard(root, r, exercises, routines) {
  const count = r.items.length;
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'card-title', text: r.name }),
    el('div', { class: 'muted', text: `${count} exercise${count === 1 ? '' : 's'}` }),
    el('div', { class: 'row' }, [
      el('button', { class: 'primary grow', text: 'Start', 'aria-label': `Start ${r.name}`, onclick: () => startRoutine(r) }),
      el('button', { text: 'Edit', 'aria-label': `Edit ${r.name}`, onclick: () => openEditor(root, r, exercises, routines) }),
      el('button', { text: 'Delete', 'aria-label': `Delete ${r.name}`, onclick: () => deleteRoutine(root, r) }),
    ]),
  ]);
}

// Starts the routine and switches to Log, unless a workout is already running.
async function startRoutine(r) {
  const activeId = localStorage.getItem(ACTIVE_SESSION);
  if (activeId && await get('sessions', activeId)) {
    showScreen('log');
    showToast('Finish or discard the current workout first.');
    return;
  }
  await createWorkout(r);
  showScreen('log');
}

async function deleteRoutine(root, r) {
  if (!confirm(`Delete routine "${r.name}"? Past workouts are kept.`)) return;
  await remove('routines', r.id);
  await refresh(root);
}

function nextPosition(routines) {
  return routines.reduce((max, r) => (Number.isFinite(r.position) ? Math.max(max, r.position + 1) : max), 0);
}

const blankItem = (exerciseId) => ({ exerciseId, targetSets: null, repMin: null, repMax: null, rirMin: null, rirMax: null, note: '' });

// Add/Edit share this editor. Nothing touches storage until Save; `initial` lets Cancel ask
// "Discard changes?" only when something actually changed.
function openEditor(root, existing, exercises, routines) {
  const state = { name: existing?.name ?? '', items: existing ? existing.items.map((it) => ({ ...it })) : [] };
  renderEditor(root, { existing, exercises, routines, state, initial: JSON.stringify(state) });
}

function renderEditor(root, ed) {
  const { existing, exercises, state } = ed;
  clear(root);
  const rerender = () => renderEditor(root, ed);
  const error = el('p', { class: 'error', role: 'alert' });
  const nameInput = el('input', { value: state.name, placeholder: 'Routine name', oninput: (ev) => { state.name = ev.target.value; } });

  const numInput = (item, key, label, idx) => field(label, `item-${idx}-${key}`, el('input', {
    type: 'number', inputmode: 'numeric', min: '0', step: '1', value: item[key] ?? '',
    oninput: (ev) => { item[key] = intOrNull(ev.target.value); },
  }));
  const move = (idx, dir) => {
    const j = idx + dir;
    [state.items[idx], state.items[j]] = [state.items[j], state.items[idx]];
    rerender();
  };

  const itemsList = el('div', { class: 'stack' });
  state.items.forEach((item, idx) => {
    const name = exerciseLabel(exercises.find((x) => x.id === item.exerciseId));
    itemsList.append(el('div', { class: 'card stack' }, [
      el('div', { class: 'row' }, [
        el('div', { class: 'grow card-title', text: name }),
        el('button', { class: 'icon-btn', 'aria-label': `Move ${name} up`, text: '↑', disabled: idx === 0, onclick: () => move(idx, -1) }),
        el('button', { class: 'icon-btn', 'aria-label': `Move ${name} down`, text: '↓', disabled: idx === state.items.length - 1, onclick: () => move(idx, 1) }),
        el('button', { class: 'icon-btn', 'aria-label': `Remove ${name}`, text: '×', onclick: () => { state.items.splice(idx, 1); rerender(); } }),
      ]),
      el('div', { class: 'grid-3' }, [numInput(item, 'targetSets', 'Sets', idx), numInput(item, 'repMin', 'Reps min', idx), numInput(item, 'repMax', 'Reps max', idx)]),
      el('div', { class: 'grid-3' }, [numInput(item, 'rirMin', 'RIR min', idx), numInput(item, 'rirMax', 'RIR max', idx)]),
      field('Note', `item-${idx}-note`, el('input', { value: item.note ?? '', oninput: (ev) => { item.note = ev.target.value; } })),
    ]));
  });
  if (!state.items.length) itemsList.append(el('p', { class: 'muted', text: 'No exercises yet — add one below.' }));

  const addExercise = () => openPicker(root, {
    title: 'Add to routine', exercises,
    onCancel: rerender,
    onPick: (ex) => { state.items.push(blankItem(ex.id)); rerender(); },
  });

  const save = async () => {
    error.textContent = '';
    try {
      // newRoutineItem normalizes each pair: a missing side copies the other, reversed values swap.
      const r = newRoutine({
        name: state.name,
        items: state.items.map((it) => newRoutineItem(it)),
        position: existing && Number.isFinite(existing.position) ? existing.position : nextPosition(ed.routines),
        origin: existing?.origin ?? null,
      });
      if (existing) { r.id = existing.id; r.createdAt = existing.createdAt; }
      await put('routines', r);
      await refresh(root);
    } catch (err) {
      error.textContent = (err && err.message) || String(err);
    }
  };
  const cancel = async () => {
    if (JSON.stringify(state) !== ed.initial && !confirm('Discard changes?')) return;
    await refresh(root);
  };

  root.append(
    el('h2', { text: existing ? 'Edit routine' : 'New routine' }),
    el('div', { class: 'card' }, [field('Name', 'routine-name', nameInput)]),
    itemsList,
    el('button', { text: '+ Add exercise', onclick: addExercise }),
    el('div', { class: 'row' }, [
      el('button', { class: 'primary grow', text: existing ? 'Save changes' : 'Save routine', onclick: save }),
      el('button', { class: 'grow', text: 'Cancel', onclick: cancel }),
    ]),
    error,
  );
}
```

- [ ] **Step 2: Run the tests**

Run: `node --test`
Expected: PASS.

- [ ] **Step 3: Verify in the browser**

1. The Routines list is in position order (Push, Pull, Legs). Each card has Start, Edit and Delete.
2. Start on Pull opens Log in the Pull focus view. With a workout running, Start on Legs switches to Log and shows the toast "Finish or discard the current workout first."
3. Edit Push: Bench shows Sets 3, Reps 6–8, RIR 2–2 and the note. Change Reps max to 5 and Reps min to 9, then Save. When you reopen it, it reads 5–9. Put back 6–8 and Save.
4. Cancel with no changes doesn't ask. Cancel after typing in a field asks "Discard changes?".
5. **+ Add exercise** opens the picker; picking adds a blank item. ↑ is disabled on the first item and ↓ on the last.
6. **+ New routine:** a new routine is saved and appears last in the list.
7. Delete asks for confirmation.

- [ ] **Step 4: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add js/routines.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: routines with Start, rep/RIR ranges, notes, picker and unsaved-change guard" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Library, with chips, count, empty state and weight step

**Files:**
- Modify: `js/library.js` (replace the whole file)

**Interfaces:**
- Consumes: `getAll`, `put` (storage); `newExercise` (schema); `el`, `clear`, `field` (ui); `numberOrNull` (format); `filterExercises`, `groupsPresent` (catalog).
- Produces: `renderLibrary(root)` (the same entry point). Import no longer appears here; it lives on the Backup screen only.

- [ ] **Step 1: Replace `js/library.js`**

```js
import { getAll, put } from './storage.js';
import { newExercise } from './schema.js';
import { el, clear, field } from './ui.js';
import { numberOrNull } from './format.js';
import { filterExercises, groupsPresent } from './catalog.js';

export async function renderLibrary(root) {
  const all = await getAll('exercises');
  const state = { q: '', group: null, showHidden: false };
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by muscle group' });
  const count = el('p', { class: 'muted small', role: 'status' });
  const list = el('div', { class: 'stack' });
  const search = el('input', {
    type: 'search', placeholder: 'Search exercises', 'aria-label': 'Search exercises',
    oninput: (ev) => { state.q = ev.target.value; draw(); },
  });
  const hiddenToggle = el('input', {
    type: 'checkbox', id: 'lib-show-hidden',
    onchange: (ev) => { state.showHidden = ev.target.checked; draw(); },
  });

  function draw() {
    const pool = all.filter((e) => state.showHidden || !e.hidden);
    const groups = groupsPresent(pool);
    if (state.group && !groups.includes(state.group)) state.group = null;
    clear(chips);
    for (const g of [null, ...groups]) {
      chips.append(el('button', {
        class: 'chip', 'aria-pressed': String(state.group === g), text: g ?? 'All',
        onclick: () => { state.group = g; draw(); },
      }));
    }
    const rows = filterExercises(pool, { q: state.q, group: state.group });
    count.textContent = `${rows.length} exercise${rows.length === 1 ? '' : 's'}`;
    clear(list);
    for (const e of rows) list.append(exerciseRow(e, root));
    if (!rows.length) {
      list.append(el('div', { class: 'empty' }, [
        el('p', { class: 'muted', text: 'No matches.' }),
        el('button', { text: 'Clear', onclick: () => { state.q = ''; state.group = null; search.value = ''; draw(); } }),
      ]));
    }
  }

  root.append(
    el('button', { class: 'primary', text: '+ Add exercise', onclick: () => openForm(root) }),
    search,
    chips,
    el('label', { class: 'row', for: 'lib-show-hidden' }, [hiddenToggle, el('span', { text: 'Show hidden' })]),
    count,
    list,
  );
  draw();
}

// Shared "storage changed, reload the whole screen" step.
async function refresh(root) {
  clear(root);
  await renderLibrary(root);
}

function exerciseRow(e, root) {
  const subtitle = [e.muscleGroup, e.equipment].filter(Boolean).join(' · ') || '—';
  return el('div', { class: 'card row' }, [
    el('div', { class: 'grow' }, [el('div', { text: e.name }), el('div', { class: 'muted small', text: subtitle })]),
    el('button', { text: 'Edit', 'aria-label': `Edit ${e.name}`, onclick: () => openForm(root, e) }),
    el('button', { text: e.hidden ? 'Unhide' : 'Hide', 'aria-label': `${e.hidden ? 'Unhide' : 'Hide'} ${e.name}`, onclick: () => toggleHidden(root, e) }),
  ]);
}

async function toggleHidden(root, e) {
  await put('exercises', { ...e, hidden: !e.hidden });
  await refresh(root);
}

// Add/Edit share this form. `existing` is null for Add, the exercise record for Edit.
function openForm(root, existing = null) {
  clear(root);
  const isEdit = !!existing;
  const nameInput = el('input', { value: existing?.name ?? '' });
  const typeSelect = el('select', {}, [
    el('option', { value: 'strength', text: 'Strength' }),
    el('option', { value: 'cardio', text: 'Cardio' }),
  ]);
  typeSelect.value = existing?.type ?? 'strength';
  const muscleInput = el('input', { value: existing?.muscleGroup ?? '' });
  const equipmentInput = el('input', { value: existing?.equipment ?? '' });
  const stepInput = el('input', {
    type: 'number', inputmode: 'decimal', step: 'any', min: '0', placeholder: 'Blank = default',
    value: existing?.weightStep ?? '',
  });
  const error = el('p', { class: 'error', role: 'alert' });

  const save = async () => {
    error.textContent = '';
    const step = numberOrNull(stepInput.value);
    if (step !== null && step <= 0) {
      error.textContent = 'Weight step must be more than 0, or blank for the default.';
      return;
    }
    try {
      const ex = newExercise({
        name: nameInput.value,
        type: typeSelect.value,
        muscleGroup: muscleInput.value.trim(),
        equipment: equipmentInput.value.trim(),
        custom: existing?.custom ?? true,
        weightStep: step,
      });
      if (existing) {
        // Edit in place: keep identity/origin/hide-state, only the form fields change.
        ex.id = existing.id;
        ex.hidden = existing.hidden;
        ex.createdAt = existing.createdAt;
      }
      await put('exercises', ex);
      await refresh(root);
    } catch (err) {
      error.textContent = (err && err.message) || String(err);
    }
  };

  root.append(
    el('h2', { text: isEdit ? 'Edit exercise' : 'Add exercise' }),
    el('div', { class: 'card stack' }, [
      field('Name', 'ex-name', nameInput),
      field('Type', 'ex-type', typeSelect),
      field('Muscle group', 'ex-muscle', muscleInput),
      field('Equipment', 'ex-equipment', equipmentInput),
      field('Weight step for ± buttons (lb)', 'ex-step', stepInput),
      el('div', { class: 'row' }, [
        el('button', { class: 'primary grow', text: isEdit ? 'Save changes' : 'Add exercise', onclick: save }),
        el('button', { class: 'grow', text: 'Cancel', onclick: () => refresh(root) }),
      ]),
      error,
    ]),
  );
  if (!isEdit) nameInput.focus();
}
```

- [ ] **Step 2: Run the tests**

Run: `node --test`
Expected: PASS.

- [ ] **Step 3: Verify in the browser**

1. Library shows search, chips (All, Chest, …), "Show hidden", and a count equal to the number of non-hidden exercises. On the Task 12 fixture that's 51: 49 seed exercises plus "Deadlift" and "My Cable Curl", with "Bench Press" hidden. There's no Import button.
2. Tap the Legs chip: the count drops and only Legs exercises show. Type `zzz`: "No matches · Clear". Tap Clear and the list is restored.
3. Check "Show hidden": hidden exercises such as "Bench Press" on migrated data appear with Unhide.
4. Edit Dumbbell Curl and set Weight step to 2.5, then Save. In a workout with Dumbbell Curl, the weight stepper shows −2.5/+2.5. Then set it back to blank.
5. A weight step of `0` shows the inline error and doesn't save.

- [ ] **Step 4: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add js/library.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: library chips, live count, clearable empty state, per-exercise weight step" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: History, with button cards, duration, targets and open-by-id

**Files:**
- Modify: `js/history.js` (replace the whole file)

**Interfaces:**
- Consumes: `getAll`, `remove` (storage); `el`, `clear` (ui); `ACTIVE_SESSION` (keys); `formatMinutes`, `formatShortDate`, `formatTarget`, `formatSetLine` (format); `exerciseLabel` (catalog); `countLoggedSets` (sessionLogic); `sessionDurationSec` (exporter).
- Produces: `renderHistory(root, arg)`. With `arg.openId` it opens that session's detail straight away (Task 15's Finish uses this).

- [ ] **Step 1: Replace `js/history.js`**

```js
import { getAll, remove } from './storage.js';
import { el, clear } from './ui.js';
import { ACTIVE_SESSION } from './keys.js';
import { formatMinutes, formatShortDate, formatTarget, formatSetLine } from './format.js';
import { exerciseLabel } from './catalog.js';
import { countLoggedSets } from './sessionLogic.js';
import { sessionDurationSec } from './exporter.js';

// History tab. `arg.openId` (from Finish) opens that workout's detail directly.
// The workout in progress is left out; it lives on the Log tab until it's finished.
export async function renderHistory(root, arg) {
  const [sessions, exercises] = await Promise.all([getAll('sessions'), getAll('exercises')]);
  const activeId = localStorage.getItem(ACTIVE_SESSION);
  const past = sessions.filter((s) => s.id !== activeId).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const exIndex = new Map(exercises.map((e) => [e.id, e]));
  const open = arg && arg.openId ? past.find((s) => s.id === arg.openId) : null;
  if (open) renderDetail(root, open, exIndex);
  else renderList(root, past, exIndex);
}

async function refresh(root) {
  clear(root);
  await renderHistory(root);
}

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? '');
  return `${formatShortDate(iso)} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

// "14 sets · 42 min · cardio 8 min"
function summarize(s) {
  const parts = [];
  const n = countLoggedSets(s);
  if (n) parts.push(`${n} set${n === 1 ? '' : 's'}`);
  const dur = sessionDurationSec(s);
  if (dur !== null) parts.push(formatMinutes(dur));
  for (const c of (s.entries || []).filter((e) => e.type === 'cardio' && (e.done || e.durationSec != null || e.distance != null))) {
    parts.push(c.durationSec != null ? `cardio ${formatMinutes(c.durationSec)}` : 'cardio ✓');
  }
  return parts.join(' · ') || 'Nothing logged';
}

function renderList(root, sessions, exIndex) {
  clear(root);
  if (!sessions.length) {
    root.append(el('p', { class: 'muted', text: 'No workouts yet — finish one in Log to see it here.' }));
    return;
  }
  for (const s of sessions) {
    // Spans, not divs: a <button> may only contain phrasing content. CSS makes them block-level.
    root.append(el('button', { class: 'card history-card', onclick: () => renderDetail(root, s, exIndex) }, [
      el('span', { class: 'card-title', text: s.name }),
      el('span', { class: 'muted small', text: formatWhen(s.date) }),
      el('span', { class: 'muted', text: summarize(s) }),
    ]));
  }
}

function renderDetail(root, s, exIndex) {
  clear(root);
  const dur = sessionDurationSec(s);
  const entries = s.entries || [];
  async function deleteSession() {
    if (!confirm(`Delete "${s.name}" (${formatWhen(s.date)})? This can't be undone.`)) return;
    await remove('sessions', s.id);
    await refresh(root);
  }
  root.append(
    el('button', { class: 'link', text: '‹ All workouts', onclick: () => refresh(root) }),
    el('h2', { text: s.name }),
    el('div', { class: 'muted', text: dur !== null ? `${formatWhen(s.date)} · ${formatMinutes(dur)}` : formatWhen(s.date) }),
  );
  if (s.notes) root.append(el('p', { text: s.notes }));
  for (const e of entries) root.append(e.type === 'cardio' ? cardioCard(e, exIndex) : strengthCard(e, exIndex));
  if (!entries.length) root.append(el('p', { class: 'muted', text: 'Nothing logged.' }));
  root.append(el('button', { text: 'Delete workout', onclick: deleteSession }));
}

function strengthCard(e, exIndex) {
  const target = formatTarget(e.target);
  const sets = e.sets || [];
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'card-title', text: exerciseLabel(exIndex.get(e.exerciseId)) }),
    target ? el('div', { class: 'muted small', text: `Target ${target}` }) : null,
    ...(sets.length
      ? sets.flatMap((set, i) => [
        el('div', { text: `${i + 1} · ${formatSetLine(set)}` }),
        set.note ? el('div', { class: 'muted small', text: set.note }) : null,
      ])
      : [el('div', { class: 'muted', text: 'No sets logged.' })]),
  ]);
}

function cardioCard(e, exIndex) {
  const bits = [e.done ? 'Done' : 'Not done'];
  if (e.durationSec != null) bits.push(formatMinutes(e.durationSec));
  if (e.distance != null) bits.push(`${e.distance} ${e.distanceUnit || ''}`.trim());
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'card-title', text: exerciseLabel(exIndex.get(e.exerciseId)) }),
    el('div', { text: bits.join(' · ') }),
    e.note ? el('div', { class: 'muted small', text: e.note }) : null,
  ]);
}
```

- [ ] **Step 2: Run the tests**

Run: `node --test`
Expected: PASS.

- [ ] **Step 3: Verify in the browser**

1. Finish a workout in Log. You land directly on its detail: name, "Mon Sep 28 · 6:05 PM · 42 min", "Target 3 × 6–8 @ RIR 2" under Bench, and set lines like "1 · 135 × 8 · RIR 2".
2. "‹ All workouts" shows the list. Cards are buttons, reachable with Tab and opened with Enter. The in-progress workout isn't listed (start one to check).
3. Migrated legacy sessions show "RPE 8" lines, no duration, and "BW" for sets with no weight.
4. A set logged with weight 0 and reps 0 shows "0 × 0".
5. Delete asks for confirmation.

- [ ] **Step 4: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add js/history.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: history with duration, prescribed targets, RIR/legacy RPE, keyboard-reachable cards" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Backup, with honest "Last backup", migrating imports and a real reset

**Files:**
- Modify: `js/backup.js` (replace the whole file)

**Interfaces:**
- Consumes: `exportState`, `importState`, `getAll`, `bulkPut`, `clearAll` (storage); `buildCsv`, `serializeBackup` (exporter); `parseBackup(text, opts)`, `parseExerciseSeed`, `mergeExercises` (importer); `newExercise` (schema); `el`, `clear`, `field`, `download`, `pickFile` (ui); `ACTIVE_SESSION`, `LAST_BACKUP`, `LEGACY_STARTER_SEEDED` (keys).
- Produces: `renderBackup(root)` (the same entry point).

- [ ] **Step 1: Replace `js/backup.js`**

```js
import { exportState, importState, getAll, bulkPut, clearAll } from './storage.js';
import { buildCsv, serializeBackup } from './exporter.js';
import { parseBackup, parseExerciseSeed, mergeExercises } from './importer.js';
import { newExercise } from './schema.js';
import { el, clear, field, download, pickFile } from './ui.js';
import { ACTIVE_SESSION, LAST_BACKUP, LEGACY_STARTER_SEEDED } from './keys.js';

const today = () => new Date().toISOString().slice(0, 10);

export async function renderBackup(root) {
  const state = await exportState();
  root.append(reminderCard(), exportCard(root), importCard(root), settingsCard(root, state.settings));
}

async function refresh(root) {
  clear(root);
  await renderBackup(root);
}

function showNotice(root, text) {
  const prev = root.querySelector('[data-notice="true"]');
  if (prev) prev.remove();
  root.prepend(el('p', { 'data-notice': 'true', role: 'status', text }));
}

// Coarse, human relative time: staleness is the point, not the exact timestamp.
function relativeTime(iso) {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

// ---------- "Last backup" ----------

function reminderCard() {
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'card-title', text: `Last backup: ${relativeTime(localStorage.getItem(LAST_BACKUP))}` }),
    el('div', { class: 'muted', text: 'The JSON backup is the only backup. A lost or reset phone loses everything since your last one.' }),
  ]);
}

// ---------- Export ----------

async function exportJson(root) {
  const state = await exportState();
  const filename = `workout-backup-${today()}.json`;
  download(filename, serializeBackup(state), 'application/json');
  // Only the JSON backup counts as a backup: a CSV can't restore anything.
  localStorage.setItem(LAST_BACKUP, new Date().toISOString());
  await refresh(root);
  showNotice(root, `Saved ${filename}`);
}

async function exportCsv(root) {
  const state = await exportState();
  const exerciseIndex = Object.fromEntries(state.exercises.map((e) => [e.id, { name: e.name, type: e.type, muscleGroup: e.muscleGroup }]));
  const filename = `workouts-${today()}.csv`;
  download(filename, buildCsv(state.sessions, exerciseIndex), 'text/csv');
  showNotice(root, `Exported ${filename}`);
}

function exportCard(root) {
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'card-title', text: 'Export' }),
    el('button', { class: 'primary', text: 'Download JSON backup', onclick: () => exportJson(root) }),
    el('button', { text: 'Export CSV (for spreadsheets)', onclick: () => exportCsv(root) }),
    el('p', { class: 'muted small', text: "JSON is the full backup — keep it somewhere safe. CSV is for reviewing in a spreadsheet; it can't restore anything." }),
  ]);
}

// ---------- Import ----------

// Seeds for migrating an old v1 backup exactly like an on-device upgrade (spec §5.3).
async function migrateOpts() {
  try {
    const [ex, rt] = await Promise.all([
      fetch('./seed/exercises.default.json').then((r) => r.json()),
      fetch('./seed/routines.default.json').then((r) => r.json()),
    ]);
    return { seedRoutines: rt.routines, seedExerciseNames: ex.exercises.map((e) => e.name) };
  } catch {
    return {};
  }
}

async function importJson(root) {
  const picked = await pickFile('application/json');
  if (!picked) return;

  const backupResult = parseBackup(picked.text, await migrateOpts());
  if (backupResult.ok) {
    await importBackupFlow(root, picked.name, backupResult.data);
    return;
  }
  if (backupResult.code === 'VERSION') {
    showNotice(root, backupResult.error);
    return;
  }
  const seedResult = parseExerciseSeed(picked.text);
  if (seedResult.ok) {
    await importSeedFlow(root, seedResult.exercises);
    return;
  }
  // Neither a full backup nor an exercise list: a full backup is the expected shape.
  showNotice(root, backupResult.error);
}

// A focused sub-view so nothing else is clickable mid-decision. Resolves 'replace' | 'merge' | null.
function chooseImportMode(root, filename) {
  return new Promise((resolve) => {
    clear(root);
    root.append(
      el('h2', { text: 'Restore backup' }),
      el('div', { class: 'card stack' }, [
        el('div', { text: filename }),
        el('p', { class: 'muted', text: 'Replace erases everything on this device and loads the backup exactly as exported.' }),
        el('p', { class: 'muted', text: "Merge keeps what's already here and adds anything new from the backup (existing data wins on a conflict)." }),
        el('div', { class: 'row' }, [
          el('button', { class: 'primary', text: 'Replace all data', onclick: () => resolve('replace') }),
          el('button', { text: 'Merge', onclick: () => resolve('merge') }),
          el('button', { text: 'Cancel', onclick: () => resolve(null) }),
        ]),
      ]),
    );
  });
}

async function importBackupFlow(root, filename, data) {
  const mode = await chooseImportMode(root, filename);
  if (!mode) { await refresh(root); return; }
  await importState(data, mode);
  await refresh(root);
  showNotice(root, `Restored "${filename}" (${mode} mode).`);
}

async function importSeedFlow(root, exercises) {
  // A row that fails validation (e.g. blank name) is dropped, not fatal, and reported separately.
  let invalid = 0;
  const normalized = [];
  for (const row of exercises) {
    try {
      normalized.push(newExercise({
        name: row.name, type: row.type || 'strength', muscleGroup: row.muscleGroup || '',
        equipment: row.equipment || '', custom: true,
      }));
    } catch {
      invalid++;
    }
  }
  const current = await getAll('exercises');
  const { merged, added, skipped } = mergeExercises(current, normalized);
  await bulkPut('exercises', merged);
  await refresh(root);
  showNotice(root, `Added ${added}. Skipped ${skipped} already in your library${invalid ? `, ${invalid} without a name` : ''}.`);
}

function importCard(root) {
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'card-title', text: 'Import' }),
    el('button', { text: 'Import JSON…', onclick: () => importJson(root) }),
    el('p', { class: 'muted small', text: 'Accepts a full backup (choose replace or merge; older backups are upgraded) or an exercise-only list (merged into your library by name).' }),
  ]);
}

// ---------- Settings ----------

function settingsCard(root, settings) {
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'card-title', text: 'Settings' }),
    el('div', { class: 'row' }, [el('span', { class: 'muted grow', text: 'Units' }), el('span', { text: settings.units === 'kg' ? 'kg' : 'lb' })]),
    el('button', { text: 'Erase all data…', onclick: () => openErasePanel(root) }),
  ]);
}

function openErasePanel(root) {
  clear(root);
  const input = el('input', { placeholder: 'ERASE' });
  const error = el('p', { class: 'error', role: 'alert' });

  const doErase = async () => {
    error.textContent = '';
    if (input.value.trim() !== 'ERASE') {
      error.textContent = 'Type ERASE (all caps) to confirm.';
      return;
    }
    await clearAll();
    for (const k of [ACTIVE_SESSION, LAST_BACKUP, LEGACY_STARTER_SEEDED]) localStorage.removeItem(k);
    // With meta cleared, the next launch is a fresh install: starter library and routines re-seed.
    location.reload();
  };

  root.append(
    el('h2', { text: 'Erase all data' }),
    el('div', { class: 'card stack' }, [
      el('p', { text: "This permanently deletes every exercise, routine, workout and weigh-in on this device, then starts over with the starter library and routines. Download a backup first if you want to keep anything — this can't be undone." }),
      field('Type ERASE to confirm', 'erase-confirm', input),
      el('div', { class: 'row' }, [
        el('button', { class: 'primary grow', text: 'Erase all data', onclick: doErase }),
        el('button', { class: 'grow', text: 'Cancel', onclick: () => refresh(root) }),
      ]),
      error,
    ]),
  );
  input.focus();
}
```

- [ ] **Step 2: Run the tests**

Run: `node --test`
Expected: PASS.

- [ ] **Step 3: Verify in the browser**

Browser tools can't drive the operating system's file chooser. So the restore paths below call the same functions the Import button uses (`parseBackup` → `importState`), and the chooser itself is a by-hand check.

1. Export CSV downloads `workouts-YYYY-MM-DD.csv`. Its header matches CSV v2 exactly, and "Last backup" does **not** change.
2. Download JSON backup: "Last backup: just now" appears, and so does the notice.
3. **Round-trip (Replace):**

    ```js
    const s = await import('/js/storage.js');
    const { serializeBackup } = await import('/js/exporter.js');
    const { parseBackup } = await import('/js/importer.js');
    const before = await s.exportState();
    const r = parseBackup(serializeBackup(before));
    await s.importState(r.data, 'replace');
    const after = await s.exportState();
    const key = (x) => JSON.stringify([x.exercises.length, x.routines.length, x.sessions.length, x.sessions.map((q) => q.id).sort()]);
    ({ ok: r.ok, same: key(before) === key(after), meta: await s.getMeta() })
    ```

    Expected: `{ ok: true, same: true, meta: 2 }`.
4. **v1 backup restore (Replace)** upgrades on import:

    ```js
    const m = await import('/tests/fixtures/load-v1-db.js');
    const v1 = { schemaVersion: 1, exportedAt: new Date().toISOString(), ...(await m.buildV1Fixture()) };
    const [ex, rt] = await Promise.all([fetch('/seed/exercises.default.json').then((x) => x.json()), fetch('/seed/routines.default.json').then((x) => x.json())]);
    const { parseBackup } = await import('/js/importer.js');
    const r = parseBackup(JSON.stringify(v1), { seedRoutines: rt.routines, seedExerciseNames: ex.exercises.map((e) => e.name) });
    const s = await import('/js/storage.js');
    await s.importState(r.data, 'replace');
    const all = await s.readAll();
    ({ pushRepMin: all.routines.find((x) => x.name === 'Push (Cycle 1)').items[0].repMin, rpeKept: all.sessions.find((x) => x.id === 'ses-push-1').entries[0].sets[0].rpe })
    ```

    Expected: `{ pushRepMin: 6, rpeKept: 8 }`. Reload afterwards so the screens re-read the data.
5. **By hand** (file chooser): Import JSON… with an exercise-only file containing `[{"name":"Sled Push","type":"strength"},{"name":"Back Squat"},{"name":""}]`. The notice reads "Added 1. Skipped 1 already in your library, 1 without a name." Open Import again and cancel the chooser: the screen stays usable.
6. **Erase all data:** type ERASE. The page reloads to a fresh install: 49 exercises, 3 starter routines, "Last backup: never".

- [ ] **Step 4: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add js/backup.js
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "feat: backup counts only JSON as a backup, upgrades old backups on import, erase resets to a fresh install" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Cache bump, gates, docs and the full gate run

**Files:**
- Modify: `service-worker.js` (`CACHE` → `'wt-v4'`)
- Modify: `GATES.md` (replace the whole file)
- Modify: `README.md` (two edits)

**Interfaces:**
- Consumes: everything above.
- Produces: a green `node --test`, a fully checked `GATES.md` run, and a branch ready for the user's review. **Don't deploy.**

- [ ] **Step 1: Bump the cache**

In `service-worker.js`, change `const CACHE = 'wt-v3';` to `const CACHE = 'wt-v4';`. Then check that `SHELL` lists every `js/` file: `node --test tests/sw.shell.test.js` must pass.

- [ ] **Step 2: Replace `GATES.md`**

```markdown
# GATES — QA checklist before every deploy

Run `node --test` first; it must be green. Then walk this checklist in the preview at a phone
viewport (360–375 px wide; see README for serving it locally). The PWA section can only be
checked on the real Pixel over the deployed HTTPS site.

A deploy is allowed only when the automated tests pass and every box below is checked.

## Automated

- [ ] `node --test` passes with 0 failures (format, catalog, progression, sessionLogic, schema + migration, seed, exporter CSV v2 + backup, importer, service-worker precache guard).

## Upgrade (run before any Phase 3+ deploy)

- [ ] **Migration gate (fixture):** `loadV1Fixture()` from `tests/fixtures/load-v1-db.js`, reload. Then: `meta.schema` is 2; Push/Pull have rep ranges + `origin`; the edited Legs routine is untouched (notes start "EDITED", `origin` null); positions Push 0, Pull 1, Legs 2; "Bench Press" hidden, "Deadlift" and "My Cable Curl" visible; old sets keep RPE with `rir` null; the logged bike is done, the empty erg is not; `starterRoutinesSeeded` removed.
- [ ] **Migration gate (real data):** the user's real v1 JSON backup, saved as `tests/fixtures/real-v1.json` (gitignored), loaded with `loadV1Backup('/tests/fixtures/real-v1.json')`, reload: History shows every past workout, routines have ranges (unless edited), CSV v2 exports.
- [ ] **Atomic write:** `writeAll({ exercises: [{ name: 'no id' }] }, 2)` rejects with `DataError` and the exercise count is unchanged.
- [ ] **Failure screen:** `renderUpgradeFailure(new Error('test'))` shows the alert, a working Download backup button, Reload, and hides the tab bar.
- [ ] **Fresh install:** delete the database, reload → 49 exercises, Push/Pull/Legs (Cycle 1) with ranges, `meta.schema` 2.

## Log

- [ ] Start screen shows **Up next** (the routine after the last one you did, wrapping Push → Pull → Legs), every other routine as a Start button **including the alphabetically first one**, Freestyle, and no `<select>` anywhere.
- [ ] Backup nudge appears when there are workouts and the last JSON backup is >7 days old (or never); tapping it opens Backup.
- [ ] Focus view: "N of M", ticking clock, exercise name, "Target …" line, "Last time <date> · <sets>" (or "First time: pick a starting weight").
- [ ] Pre-fill: set 1 = last time's set 1; later sets copy the previous set this session; with no history, reps = bottom of range and RIR = top of range, weight empty.
- [ ] **A set matching the pre-fill logs in one tap; +5 then Log is two taps.** A short vibration on log (on the phone).
- [ ] Tapping the weight/reps value opens a numeric keypad; typed values stick; blank reps blocks logging with "Enter reps".
- [ ] After the target sets: "Next: <exercise> ›" plus "Log extra set"; on the last exercise "Review & finish ›".
- [ ] Tapping a logged set edits it (Save / Delete / Cancel); Delete shows an Undo toast that restores it.
- [ ] … menu: Swap (same type only; replaces in place with no sets; with sets, asks and continues in a new entry keeping the target) and Remove (with Undo).
- [ ] Cardio: target note, "Track it on your Garmin.", optional minutes, "+ Distance", Mark done → Done ✓ (tap to undo).
- [ ] **Reload mid-workout** lands on the same exercise with every set intact.
- [ ] Overview (≡): each exercise with ✓ / "2 / 3" / "2 sets" / "—"; tapping opens it; + Add exercise uses the picker; Finish workout.
- [ ] Finish: "N sets · M min", "Not logged (will be removed): …", the stale-workout checkbox when the last set is >30 min old (checked by default, changes the duration); lands on that workout's History detail; removed entries aren't stored.
- [ ] Discard (overview …) with sets confirms with the count; with none it goes straight through.
- [ ] Freestyle opens the picker at once; cancelling leaves an empty overview whose Finish offers only Discard / Keep going.
- [ ] Screen stays on during a workout (`isHeld()` true where supported) and is released on leaving the Log tab.

## Picker

- [ ] Search + muscle chips + live count; the keyboard does not open on arrival; "No matches · Clear search"; "+ Create "…"" adds a custom exercise and picks it.

## Routines

- [ ] List in position order; Start (switches to Log; blocked with a toast if a workout is running), Edit, Delete (confirms).
- [ ] Editor: Sets, Reps min/max, RIR min/max, Note per item; reversed ranges are swapped on save; ↑/↓ disabled at the ends; + Add exercise via the picker; Cancel asks only if something changed.

## Library

- [ ] Search + muscle chips + count; clearable empty state; "Show hidden" checkbox is normal size on one line; no Import button here.
- [ ] Add/Edit saves in place; Weight step (lb) changes the ± step in the focus view; 0 or negative is refused.
- [ ] Hide/Unhide is a soft delete.

## History

- [ ] Newest first; the in-progress workout isn't listed; cards are buttons (Tab + Enter works).
- [ ] Detail: date · time · duration, "Target …" lines, set lines with RIR (legacy: RPE), cardio Done/Not done + minutes; 0 values show as 0; Delete confirms.

## Backup / Export

- [ ] CSV v2 header exactly: `date,session_id,session_name,session_duration_sec,exercise,exercise_type,muscle_group,set_number,weight_lb,reps,rir,rpe,logged_at,distance,distance_unit,duration_sec,note`.
- [ ] Exporting CSV does **not** change "Last backup"; downloading the JSON backup does.
- [ ] JSON backup → Import → Replace restores identically; a v1 backup is upgraded on import.
- [ ] Exercise-only import reports added / skipped / without-a-name separately.
- [ ] Erase all data needs `ERASE`, then reloads to a fresh install.

## Accessibility and layout

- [ ] No horizontal scroll at 360 px; every control ≥44 px; steppers and the Log/Next button ≥56 px.
- [ ] Active tab shows a top bar + bold, not colour alone; `:focus-visible` rings on Tab.
- [ ] Toasts and notices are `role="status"`; the save error is `role="alert"`.

## PWA / on-device

**Must be tested on the real Pixel, over the deployed HTTPS site. A service worker won't register in the preview.**

- [ ] **Before installing an update that migrates data: download a JSON backup on the phone.**
- [ ] ⋮ → Install app / Add to Home screen works; the app opens standalone.
- [ ] After a deploy, reopen the app once or twice; `caches.keys()` shows only the new cache name.
- [ ] **Offline gate:** airplane mode → open the app → start a workout, log a set, finish. Everything works.
- [ ] The home-screen icon renders un-clipped.
```

- [ ] **Step 3: Update `README.md`**

Replace the paragraph under `## Running the tests` (starting "That's `node --test` under the hood") with:

```markdown
That's `node --test` under the hood — no install step, this repo has zero
dependencies. It covers the pure logic: formatting, the exercise catalog,
progression (last time, pre-fill, Up next), workout finish rules, the schema
and its v1 → v2 migration, the Cycle 1 seed, CSV/JSON export and import, and a
guard that every app file is cached for offline use.
```

Then insert this section just before `## The Phase 2 seam`:

```markdown
## Updating safely

Some updates change how data is stored (Phase 3 moves from schema v1 to v2).
The app upgrades your data automatically in a single step: either the whole
upgrade succeeds or nothing is changed, and if it ever fails you get a screen
with a **Download backup** button. Still, **download a JSON backup from the
Backup tab before opening a new version** — it's your only copy.

For development, `tests/fixtures/load-v1-db.js` recreates a v1 database in the
local preview (synthetic, or from a real v1 backup saved as
`tests/fixtures/real-v1.json`, which git ignores) so the upgrade can be tested
before it ships. See `GATES.md` → Upgrade.
```

- [ ] **Step 4: Run the full suite and the full gate**

Run: `node --test`
Expected: PASS, 0 failures.

Then walk every item in `GATES.md` except "PWA / on-device" in the preview at the mobile viewport, using the fixture (`loadV1Fixture()`) for the Upgrade section. Tick the boxes in your working notes, not in the committed file. If the user has provided a real v1 backup as `tests/fixtures/real-v1.json`, run the real-data migration gate. Otherwise report it as **not run** in the hand-off.

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/Willi/Claude Code/workout-tracker" add service-worker.js GATES.md README.md
git -C "C:/Users/Willi/Claude Code/workout-tracker" commit -m "docs: Phase 3 gates and upgrade guidance; bump SW cache to wt-v4" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand off. Don't deploy.**

Report to the user: the test count and the result, any GATES items that failed or weren't run (the Pixel/PWA section always needs the device), and the deploy steps once they approve:
1. Download a JSON backup on the phone.
2. `vercel --prod`.
3. Reopen the app on the phone once or twice.
4. Run the PWA gates.

---

## Self-review notes (planner)

- **Spec coverage, Phase 3:**
  - §4 data model → T3, T4, T11
  - §5 migration → T4, T11, T12
  - §6 seed → T5
  - §7.1 start and backup nudge → T15
  - §7.2 / §7.2a focus → T15
  - §7.3 overview → T15
  - §7.4 finish and discard → T8, T15
  - §7.5 picker → T6, T14
  - §7.6 routines → T16
  - §7.7 library → T17
  - §7.8 history → T18
  - §7.9 backup → T19
  - §7.10 accessibility → T13 (CSS) plus labels and roles in T10, T14–T19
  - §7.11 cleanup → T2, T10, T11, T12, T19
  - §10.1 CSV v2 → T9
  - §12 tests and gates → every task, plus T20
  - §11 delivery → T20 (it stops short of deploying)
- **Where this plan refines the spec:**
  - Legacy cardio `done` means something was logged. The spec was updated to match.
  - The control border is `#5a6d85`. The spec's "about `#4a5b70`" measures 2.66:1, and `#5a6d85` measures about 3.5:1.
  - The modules `catalog.js`, `sessionLogic.js` and `wakelock.js` were added to keep logic pure and testable. They're consistent with spec §9.
- **Deferred to the Phase 4 plan:**
  - `prefillSet`'s `suggestion` option.
  - The bodyweight UI and CSV.
  - Progress, Settings and More.
  - Edit mode, which will use `lastPerformance`'s `before` option (already implemented and tested).
