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
