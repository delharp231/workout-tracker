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
