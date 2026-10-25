import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ITEMS, SECTIONS, TIERS } from '../js/morningData.js';
import {
  KEY, emptyState, normalise, rounds, isVisible, doseText, tierMinutes, itemDone, counts, setCheck,
  setTier, resetToday, setGetReady, weekDays, validateCheck, addCheck, recentChecks, checkDue,
  homeSummary, prune, loadState, saveState, MAX_DAYS,
} from '../js/morningLogic.js';

const T = '2026-10-24';
const fakeStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
};
const tickAll = (state) => {
  let s = state;
  for (const it of ITEMS) {
    if (!isVisible(it, s.tier)) continue;
    for (let i = 0; i < rounds(it, s.tier); i++) s = setCheck(ITEMS, s, it.id, i, true);
  }
  return s;
};

test('data: ids are unique, videos look like YouTube ids, every move has cues and a section', () => {
  const ids = ITEMS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  const sections = new Set(SECTIONS.map((s) => s.name));
  for (const it of ITEMS) {
    assert.match(it.vid, /^[A-Za-z0-9_-]{11}$/, it.id);
    assert.ok(it.cues.length >= 3, it.id);
    assert.ok(sections.has(it.sec), it.id);
    assert.ok(it.mins > 0 && it.rounds >= 1, it.id);
    for (const seg of it.timer || []) assert.ok(seg.sec > 0 && seg.label, it.id);
  }
  assert.deepEqual(ITEMS.filter((i) => i.floor).map((i) => i.id), ['cat-cow', 'sit-to-stand', 'hip-flexor', 'hamstring']);
  assert.deepEqual(TIERS.map((t) => t.id), ['full', 'short', 'floor']);
});

test('rounds and visibility per version', () => {
  const push = ITEMS.find((i) => i.id === 'push-up');
  const sts = ITEMS.find((i) => i.id === 'sit-to-stand');
  assert.equal(rounds(push, 'full'), 2);
  assert.equal(rounds(push, 'short'), 1);
  assert.equal(rounds(sts, 'floor'), 1);
  assert.equal(isVisible(push, 'floor'), false);
  assert.equal(isVisible(sts, 'floor'), true);
  assert.equal(doseText(sts, 'floor'), '6 reps');
  assert.equal(doseText(sts, 'full'), '10 to 15 reps');
});

test('version minutes are close to the stated counts', () => {
  assert.equal(tierMinutes(ITEMS, 'full'), 25);
  assert.ok([19, 20].includes(tierMinutes(ITEMS, 'short')));
  assert.equal(tierMinutes(ITEMS, 'floor'), 6);
});

test('counts: 19 boxes full, 14 short, 4 floor', () => {
  for (const [tier, total] of [['full', 19], ['short', 14], ['floor', 4]]) {
    assert.deepEqual(counts(ITEMS, { ...emptyState(T), tier }), { got: 0, total });
  }
});

test('setCheck records the day when every box is ticked and removes it when one is cleared', () => {
  let s = emptyState(T);
  s = tickAll(s);
  assert.deepEqual(counts(ITEMS, s), { got: 19, total: 19 });
  assert.equal(s.days[T], 'full');
  s = setCheck(ITEMS, s, 'push-up', 1, false);
  assert.equal(s.days[T], undefined);
  assert.equal(itemDone(s, ITEMS.find((i) => i.id === 'push-up')), false);
  s = setCheck(ITEMS, s, 'push-up', 1, true);
  assert.equal(s.days[T], 'full');
});

test('setCheck does not mutate the state it was given', () => {
  const s = emptyState(T);
  const frozen = JSON.stringify(s);
  setCheck(ITEMS, s, 'cat-cow', 0, true);
  assert.equal(JSON.stringify(s), frozen);
});

test('switching version recomputes completion', () => {
  let s = setTier(ITEMS, emptyState(T), 'floor');
  s = tickAll(s);
  assert.equal(s.days[T], 'floor');
  s = setTier(ITEMS, s, 'full');
  assert.equal(s.days[T], undefined);
  assert.equal(setTier(ITEMS, s, 'nonsense').tier, 'full');
});

test('resetToday clears the check marks and the day record', () => {
  const s = resetToday(ITEMS, tickAll(emptyState(T)));
  assert.deepEqual(counts(ITEMS, s), { got: 0, total: 19 });
  assert.equal(s.days[T], undefined);
});

test('normalise: a new day clears marks and version but keeps history and settings', () => {
  const old = { v: 1, date: '2026-10-23', tier: 'floor', done: { 'cat-cow': [true] }, days: { '2026-10-23': 'floor' },
    checks: [{ date: '2026-10-01', sitRise: 7.5, pushUps: 12 }], getReady: 10 };
  const s = normalise(old, T);
  assert.equal(s.date, T);
  assert.equal(s.tier, 'full');
  assert.deepEqual(s.done, {});
  assert.deepEqual(s.days, { '2026-10-23': 'floor' });
  assert.equal(s.checks.length, 1);
  assert.equal(s.getReady, 10);
});

test('normalise: the same day keeps marks and version', () => {
  const s = normalise({ date: T, tier: 'short', done: { 'cat-cow': [true] } }, T);
  assert.equal(s.tier, 'short');
  assert.deepEqual(s.done['cat-cow'], [true]);
});

test('normalise drops malformed data instead of throwing', () => {
  const bad = { date: T, tier: 'wat', done: 5, days: { nope: 'full', '2026-10-01': 'bogus' }, checks: [{ date: 'x' }, null, 4], getReady: 7 };
  const s = normalise(bad, T);
  assert.equal(s.tier, 'full');
  assert.deepEqual(s.done, {});
  assert.deepEqual(s.days, {});
  assert.deepEqual(s.checks, []);
  assert.equal(s.getReady, 5);
  for (const junk of [null, undefined, 'x', 42, []]) assert.equal(normalise(junk, T).date, T);
});

test('get-ready only accepts 0, 5 or 10', () => {
  assert.equal(setGetReady(emptyState(T), 10).getReady, 10);
  assert.equal(setGetReady(emptyState(T), 0).getReady, 0);
  assert.equal(setGetReady(emptyState(T), 7).getReady, 5);
});

test('weekDays counts completed days in the 7 days ending today', () => {
  const s = { ...emptyState(T), days: {
    '2026-10-24': 'full', '2026-10-23': 'short', '2026-10-18': 'floor', '2026-10-17': 'full', '2026-10-25': 'full' } };
  assert.equal(weekDays(s, T), 3); // 24, 23, 18; 17 is 7 days back, 25 is the future
  assert.equal(weekDays(emptyState(T), T), 0);
});

test('validateCheck: half points 0 to 10 and whole push-ups', () => {
  assert.equal(validateCheck({ sitRise: 7.5, pushUps: 12 }), null);
  assert.equal(validateCheck({ sitRise: 0, pushUps: 0 }), null);
  assert.equal(validateCheck({ sitRise: 10, pushUps: 300 }), null);
  assert.ok(validateCheck({ sitRise: 7.3, pushUps: 12 }));
  assert.ok(validateCheck({ sitRise: 11, pushUps: 12 }));
  assert.ok(validateCheck({ sitRise: -1, pushUps: 12 }));
  assert.ok(validateCheck({ sitRise: 5, pushUps: 12.5 }));
  assert.ok(validateCheck({ sitRise: 5, pushUps: 301 }));
  assert.ok(validateCheck({ sitRise: NaN, pushUps: 5 }));
});

test('addCheck sorts by date, replaces the same day, and rejects bad input without changing state', () => {
  let s = emptyState(T);
  s = addCheck(s, { date: '2026-10-24', sitRise: 7, pushUps: 10 }).state;
  s = addCheck(s, { date: '2026-09-24', sitRise: 6, pushUps: 8 }).state;
  assert.deepEqual(s.checks.map((c) => c.date), ['2026-09-24', '2026-10-24']);
  s = addCheck(s, { date: '2026-10-24', sitRise: 8, pushUps: 11 }).state;
  assert.equal(s.checks.length, 2);
  assert.equal(s.checks[1].sitRise, 8);
  const bad = addCheck(s, { date: '2026-10-25', sitRise: 99, pushUps: 1 });
  assert.equal(bad.ok, false);
  assert.equal(bad.state, s);
});

test('recentChecks: newest first with the change from the check before', () => {
  let s = emptyState(T);
  for (const [d, a, b] of [['2026-08-24', 5, 6], ['2026-09-24', 6.5, 9], ['2026-10-24', 6, 12]]) {
    s = addCheck(s, { date: d, sitRise: a, pushUps: b }).state;
  }
  const r = recentChecks(s);
  assert.deepEqual(r.map((c) => c.date), ['2026-10-24', '2026-09-24', '2026-08-24']);
  assert.equal(r[0].sitRiseDelta, -0.5);
  assert.equal(r[0].pushUpsDelta, 3);
  assert.equal(r[2].sitRiseDelta, null);
  assert.equal(recentChecks(s, 2).length, 2);
});

test('checkDue: true with no checks, true after 30 days, false before', () => {
  assert.equal(checkDue(emptyState(T), T), true);
  const s = addCheck(emptyState(T), { date: '2026-09-24', sitRise: 7, pushUps: 10 }).state;
  assert.equal(checkDue(s, '2026-10-23'), false);
  assert.equal(checkDue(s, '2026-10-24'), true);
});

test('homeSummary: not started, partial, done', () => {
  let s = emptyState(T);
  assert.deepEqual(homeSummary(ITEMS, s, T), { line: 'Not started', week: '0 of the last 7 days', due: true });
  s = setCheck(ITEMS, s, 'cat-cow', 0, true);
  assert.equal(homeSummary(ITEMS, s, T).line, '1 of 19 checked');
  s = tickAll(s);
  const h = homeSummary(ITEMS, s, T);
  assert.equal(h.line, 'Done today');
  assert.equal(h.week, '1 of the last 7 days');
});

test('prune keeps the newest MAX_DAYS days', () => {
  const days = {};
  for (let i = 0; i < MAX_DAYS + 10; i++) days[new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)] = 'full';
  const p = prune({ ...emptyState(T), days });
  const keys = Object.keys(p.days).sort();
  assert.equal(keys.length, MAX_DAYS);
  assert.equal(keys[keys.length - 1], Object.keys(days).sort().pop());
});

test('storage: round trip, corrupt JSON and a missing store fall back to a clean state', () => {
  const st = fakeStorage();
  let s = tickAll(emptyState(T));
  saveState(st, s);
  assert.deepEqual(loadState(st, T).days, { [T]: 'full' });
  assert.equal(loadState(fakeStorage({ [KEY]: '{not json' }), T).date, T);
  assert.equal(loadState(undefined, T).date, T);
  assert.doesNotThrow(() => saveState(undefined, s));
  assert.doesNotThrow(() => saveState({ setItem() { throw new Error('quota'); } }, s));
});

test('isolation: the morning modules never touch the workout database', () => {
  for (const f of ['morningData.js', 'morningLogic.js']) {
    const src = readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /from '\.\/storage\.js'|indexedDB|bulkPut|\bput\(|\bremove\(/, f);
  }
  const screen = readFileSync(new URL('../js/morning.js', import.meta.url), 'utf8');
  const imports = [...screen.matchAll(/import \{([^}]*)\} from '\.\/storage\.js'/g)].map((m) => m[1].trim());
  assert.deepEqual(imports, ['getSettings'], 'the screen may read settings and nothing else from storage');
});
