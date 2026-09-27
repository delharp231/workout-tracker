export const SCHEMA_VERSION = 2;
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
        // v1's "+ Add set" pushed a blank set and never removed unfilled ones; a set exists
        // only once it's logged (spec §4), so drop sets with nothing in them at all.
        sets: (e.sets || [])
          .map((set) => ({
            weight: set.weight ?? null, reps: set.reps ?? null, rir: set.rir ?? null,
            rpe: set.rpe ?? null, note: set.note ?? '', loggedAt: set.loggedAt ?? null,
          }))
          .filter((set) => !(set.weight == null && set.reps == null && set.rpe == null && !(set.note && set.note.trim()))),
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
