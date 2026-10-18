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

const nameKey = (e) => String(e.name || '').trim().toLowerCase();
const originKey = (r) => (r.origin ? `${r.origin.cycle}/${r.origin.key}` : null);

// A merge onto a phone that already seeded its own starter exercises and routines: the backup's
// exercises that share a name are skipped, so their ids (and the ids of starter routines the
// phone already has) must be rewritten inside the incoming routines and sessions. Pure.
export function remapIncoming(existing, incoming) {
  const exByName = new Map(existing.exercises.map((e) => [nameKey(e), e.id]));
  const exMap = new Map();
  for (const ex of incoming.exercises ?? []) {
    const have = exByName.get(nameKey(ex));
    if (have && have !== ex.id) exMap.set(ex.id, have);
  }
  const rtByOrigin = new Map(existing.routines.filter(originKey).map((r) => [originKey(r), r.id]));
  const rtMap = new Map();
  const routines = [];
  for (const r of incoming.routines ?? []) {
    const have = originKey(r) && rtByOrigin.get(originKey(r));
    if (have && have !== r.id) { rtMap.set(r.id, have); continue; } // the phone already has this starter
    routines.push({ ...r, items: (r.items ?? []).map((it) => (exMap.has(it.exerciseId) ? { ...it, exerciseId: exMap.get(it.exerciseId) } : it)) });
  }
  const sessions = (incoming.sessions ?? []).map((s) => ({
    ...s,
    routineId: rtMap.get(s.routineId) ?? s.routineId,
    entries: (s.entries ?? []).map((e) => (exMap.has(e.exerciseId) ? { ...e, exerciseId: exMap.get(e.exerciseId) } : e)),
  }));
  return { ...incoming, routines, sessions };
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
  const inc = remapIncoming(existing, incoming);
  return {
    settings: existing.settings,
    exercises: mergeExercises(existing.exercises, incoming.exercises ?? []).merged,
    routines: unionBy(existing.routines, inc.routines, 'id'),
    sessions: unionBy(existing.sessions, inc.sessions, 'id'),
    bodyweight: unionBy(existing.bodyweight ?? [], inc.bodyweight ?? [], 'date'),
  };
}
