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
