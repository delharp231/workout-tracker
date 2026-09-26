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
