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
  if (session.reopenedFrom?.finishedAt) return session.reopenedFrom.finishedAt; // an edited past workout
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
  const { reopenedFrom, ...rest } = session; // eslint-disable-line no-unused-vars
  return {
    ...rest,
    entries: (session.entries || []).filter(isLogged),
    finishedAt: finishedAtFor(session, { nowIso, useLastSetTime }),
    cursor: 0,
  };
}

// Editing a past workout: it becomes the active workout again, with a copy of the original kept
// so Discard can put it back unchanged. New object; the original is not mutated.
export function reopenSession(session) {
  return { ...session, finishedAt: null, reopenedFrom: JSON.parse(JSON.stringify(session)) };
}

// Discard on a reopened workout: the original as it was before the edit.
export const originalOf = (session) => session.reopenedFrom ?? null;

// Finished sessions dated in the same Monday-to-Sunday week (local time) as `now`.
export function weekCount(sessions, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return sessions.filter((s) => {
    if (!s.finishedAt) return false;
    const d = new Date(s.date);
    return d >= start && d < end;
  }).length;
}

const dayOf = (iso) => String(iso).slice(0, 10);

// Weigh-in summary for Home. `entries` are { date: 'YYYY-MM-DD', weight } records, one per day.
// latest is the newest entry; avg7 is the mean of entries in the 7 days ending on the newest;
// prevAvg7 is the mean of the 7 days before that. Either average is null with no entries in range.
export function weighInSummary(entries) {
  const list = entries.filter((e) => Number.isFinite(e.weight)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!list.length) return null;
  const latest = list[list.length - 1];
  const t = Date.parse(`${dayOf(latest.date)}T00:00:00Z`);
  const within = (e, from, to) => { const x = Date.parse(`${dayOf(e.date)}T00:00:00Z`); return x > t - to * 86_400_000 && x <= t - from * 86_400_000; };
  const mean = (arr) => (arr.length ? Math.round((arr.reduce((n, e) => n + e.weight, 0) / arr.length) * 10) / 10 : null);
  return { latest, avg7: mean(list.filter((e) => within(e, 0, 7))), prevAvg7: mean(list.filter((e) => within(e, 7, 14))) };
}

// What the home screen shows. An unfinished workout (the one activeId points at) comes first and
// hides the start buttons, so a second workout can't orphan it. Otherwise the start list puts
// "Up next" first and keeps the rest in position order. `last` is the latest finished session.
export function homeModel({ routines, sessions, activeId, nowIso, perWeek = 3 }) {
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
  const week = { done: weekCount(sessions, new Date(nowIso)), target: perWeek };
  return { active, next, rest: active ? [] : rest, last: last ? { name: last.name, date: last.date } : null, week };
}
