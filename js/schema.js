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
