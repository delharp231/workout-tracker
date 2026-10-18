import { exerciseLabel } from './catalog.js';
import { nextRoutine } from './progression.js';
import { compareRoutines } from './schema.js';

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

// What the home screen shows. An unfinished workout (the one activeId points at) comes first and
// hides the start buttons, so a second workout can't orphan it. Otherwise the start list puts
// "Up next" first and keeps the rest in position order. `last` is the latest finished session.
export function homeModel({ routines, sessions, activeId, nowIso }) {
  const session = activeId ? sessions.find((s) => s.id === activeId) ?? null : null;
  const active = session
    ? { session, setCount: countLoggedSets(session), ageSec: Math.max(0, (Date.parse(nowIso) - Date.parse(session.date)) / 1000) }
    : null;
  const next = active ? null : nextRoutine(routines, sessions);
  const rest = [...routines].sort(compareRoutines).filter((r) => !next || r.id !== next.id);
  let last = null;
  for (const s of sessions) {
    if (s.finishedAt && (!last || s.date > last.date)) last = s;
  }
  return { active, next, rest: active ? [] : rest, last: last ? { name: last.name, date: last.date } : null };
}
