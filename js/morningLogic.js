// Pure logic for the morning routine screen, plus a small storage wrapper. The routine's data is kept
// apart from the workout log on purpose: one localStorage key, nothing in IndexedDB, nothing in
// Backup or CSV. State shape:
//   { v, date, tier, done: { [itemId]: [bool, ...] }, days: { 'YYYY-MM-DD': tierId },
//     checks: [{ date, sitRise, pushUps }], getReady }
import { GET_READY_CHOICES, DEFAULT_GET_READY } from './morningData.js';

export const KEY = 'morning-routine-v1';
export const TIER_IDS = ['full', 'short', 'floor'];
export const MAX_DAYS = 400;
export const MAX_CHECKS = 120;
export const CHECK_DUE_DAYS = 30;

export function emptyState(today) {
  return { v: 1, date: today, tier: 'full', done: {}, days: {}, checks: [], getReady: DEFAULT_GET_READY };
}

const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// Turns whatever was stored into a valid state for `today`. History and settings survive; the day's
// check marks and chosen version reset when the date changes. Anything malformed is dropped.
export function normalise(raw, today) {
  const s = emptyState(today);
  if (!isObj(raw)) return s;
  if (GET_READY_CHOICES.includes(raw.getReady)) s.getReady = raw.getReady;
  if (isObj(raw.days)) {
    for (const [d, t] of Object.entries(raw.days)) if (isDay(d) && TIER_IDS.includes(t)) s.days[d] = t;
  }
  if (Array.isArray(raw.checks)) {
    s.checks = raw.checks
      .filter((c) => isObj(c) && isDay(c.date) && Number.isFinite(c.sitRise) && Number.isFinite(c.pushUps))
      .map((c) => ({ date: c.date, sitRise: c.sitRise, pushUps: c.pushUps }))
      .slice(-MAX_CHECKS);
  }
  if (raw.date === today) {
    if (TIER_IDS.includes(raw.tier)) s.tier = raw.tier;
    if (isObj(raw.done)) {
      for (const [id, arr] of Object.entries(raw.done)) if (Array.isArray(arr)) s.done[id] = arr.map(Boolean);
    }
  }
  return s;
}

export function rounds(item, tier) {
  if (tier === 'floor') return item.floorRounds || item.rounds;
  if (tier === 'short') return 1;
  return item.rounds;
}
export const isVisible = (item, tier) => tier !== 'floor' || !!item.floor;
export const doseText = (item, tier) => (tier === 'floor' && item.floorDose ? item.floorDose : item.dose);

// Rough minutes for a version, from each move's full-dose minutes scaled by its rounds.
export function tierMinutes(items, tier) {
  let m = 0;
  for (const it of items) if (isVisible(it, tier)) m += (it.mins * rounds(it, tier)) / it.rounds;
  return Math.round(m);
}

export function itemDone(state, item) {
  const c = state.done[item.id] || [];
  for (let i = 0; i < rounds(item, state.tier); i++) if (!c[i]) return false;
  return true;
}

export function counts(items, state) {
  let total = 0;
  let got = 0;
  for (const it of items) {
    if (!isVisible(it, state.tier)) continue;
    const n = rounds(it, state.tier);
    const c = state.done[it.id] || [];
    total += n;
    for (let i = 0; i < n; i++) if (c[i]) got++;
  }
  return { got, total };
}

// Sets or clears one check box. Returns a new state with today's completion recorded in the history
// when every box for the chosen version is ticked, and removed when one is cleared.
export function setCheck(items, state, itemId, index, value) {
  const done = { ...state.done, [itemId]: [...(state.done[itemId] || [])] };
  done[itemId][index] = !!value;
  return syncDay(items, { ...state, done });
}

export function syncDay(items, state) {
  const { got, total } = counts(items, state);
  const days = { ...state.days };
  if (total > 0 && got === total) days[state.date] = state.tier;
  else delete days[state.date];
  return { ...state, days };
}

export const setTier = (items, state, tier) => (TIER_IDS.includes(tier) ? syncDay(items, { ...state, tier }) : state);
export const resetToday = (items, state) => syncDay(items, { ...state, done: {} });
export const setGetReady = (state, sec) => (GET_READY_CHOICES.includes(sec) ? { ...state, getReady: sec } : state);

const toUtc = (day) => Date.parse(`${day}T00:00:00Z`);

// Days completed in the 7 days ending on `today` (today included).
export function weekDays(state, today) {
  const end = toUtc(today);
  let n = 0;
  for (const d of Object.keys(state.days)) {
    const diff = (end - toUtc(d)) / 86_400_000;
    if (diff >= 0 && diff < 7) n++;
  }
  return n;
}

// Sit-rise score 0 to 10 in half points; push-ups a whole number from 0 to 300.
export function validateCheck({ sitRise, pushUps }) {
  if (!Number.isFinite(sitRise) || sitRise < 0 || sitRise > 10 || Math.round(sitRise * 2) !== sitRise * 2) {
    return 'Sit-rise score is 0 to 10, in half points.';
  }
  if (!Number.isInteger(pushUps) || pushUps < 0 || pushUps > 300) return 'Push-ups is a whole number from 0 to 300.';
  return null;
}

// One check per day; saving again the same day replaces it.
export function addCheck(state, { date, sitRise, pushUps }) {
  const error = validateCheck({ sitRise, pushUps });
  if (error) return { ok: false, error, state };
  const checks = state.checks.filter((c) => c.date !== date).concat({ date, sitRise, pushUps });
  checks.sort((a, b) => a.date.localeCompare(b.date));
  return { ok: true, error: null, state: { ...state, checks: checks.slice(-MAX_CHECKS) } };
}

// Newest first, each with the change from the check before it (null for the oldest).
export function recentChecks(state, n = 6) {
  const list = state.checks;
  return list
    .map((c, i) => ({
      ...c,
      sitRiseDelta: i > 0 ? c.sitRise - list[i - 1].sitRise : null,
      pushUpsDelta: i > 0 ? c.pushUps - list[i - 1].pushUps : null,
    }))
    .reverse()
    .slice(0, n);
}

export function checkDue(state, today, days = CHECK_DUE_DAYS) {
  if (!state.checks.length) return true;
  const last = state.checks[state.checks.length - 1].date;
  return (toUtc(today) - toUtc(last)) / 86_400_000 >= days;
}

// What the Home card shows.
export function homeSummary(items, state, today) {
  const { got, total } = counts(items, state);
  const line = total > 0 && got === total ? 'Done today' : got === 0 ? 'Not started' : `${got} of ${total} checked`;
  return { line, week: `${weekDays(state, today)} of the last 7 days`, due: checkDue(state, today) };
}

// Keeps the stored history from growing without bound.
export function prune(state) {
  const keys = Object.keys(state.days).sort();
  if (keys.length <= MAX_DAYS) return state;
  const days = {};
  for (const k of keys.slice(-MAX_DAYS)) days[k] = state.days[k];
  return { ...state, days };
}

export function loadState(storage, today) {
  let raw = null;
  try { raw = JSON.parse(storage?.getItem(KEY)); } catch { raw = null; }
  return normalise(raw, today);
}

export function saveState(storage, state) {
  try { storage?.setItem(KEY, JSON.stringify(prune(state))); } catch { /* storage full or blocked: progress just won't persist */ }
}
