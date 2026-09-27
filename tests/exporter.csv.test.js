import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_COLUMNS, csvEscape, buildCsv, sessionDurationSec } from '../js/exporter.js';

const EXPECTED_HEADER =
  'date,session_id,session_name,session_duration_sec,exercise,exercise_type,muscle_group,set_number,weight_lb,reps,rir,rpe,logged_at,distance,distance_unit,duration_sec,note';

const idx = {
  bench: { name: 'Barbell Bench Press', type: 'strength', muscleGroup: 'Chest' },
  bike: { name: 'Stationary Bike', type: 'cardio', muscleGroup: 'Conditioning' },
};
const push = { id: 's1', date: '2026-09-21T18:00:00.000Z', finishedAt: '2026-09-21T18:42:00.000Z', name: 'Push (Cycle 1)', entries: [
  { exerciseId: 'bench', type: 'strength', target: null, sets: [
    { weight: 135, reps: 8, rir: 2, rpe: null, note: '', loggedAt: '2026-09-21T18:05:00.000Z' },
    { weight: 135, reps: 7, rir: 1, rpe: null, note: 'grindy, but ok', loggedAt: '2026-09-21T18:09:00.000Z' },
  ] },
  { exerciseId: 'bike', type: 'cardio', target: null, done: true, durationSec: 480, distance: null, distanceUnit: 'mi', note: '' },
] };
const row = (...cells) => cells.join(',');

test('CSV v2 header matches the contract', () => {
  assert.equal(CSV_COLUMNS.join(','), EXPECTED_HEADER);
});

test('csvEscape quotes only when needed', () => {
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape(135), '135');
  assert.equal(csvEscape(0), '0');
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(undefined), '');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('he said "hi"'), '"he said ""hi"""');
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
});

test('empty sessions yields header only', () => {
  assert.equal(buildCsv([], {}), EXPECTED_HEADER + '\n');
});

test('strength sets: one row each with session id, duration, muscle group, RIR and logged_at', () => {
  const rows = buildCsv([push], idx).trim().split('\n');
  assert.equal(rows[1], row('2026-09-21T18:00:00.000Z', 's1', 'Push (Cycle 1)', '2520', 'Barbell Bench Press', 'strength', 'Chest', '1', '135', '8', '2', '', '2026-09-21T18:05:00.000Z', '', '', '', ''));
  assert.equal(rows[2], row('2026-09-21T18:00:00.000Z', 's1', 'Push (Cycle 1)', '2520', 'Barbell Bench Press', 'strength', 'Chest', '2', '135', '7', '1', '', '2026-09-21T18:09:00.000Z', '', '', '', '"grindy, but ok"'));
});

test('cardio entry: one row, set_number 1, strength columns blank', () => {
  const rows = buildCsv([push], idx).trim().split('\n');
  assert.equal(rows[3], row('2026-09-21T18:00:00.000Z', 's1', 'Push (Cycle 1)', '2520', 'Stationary Bike', 'cardio', 'Conditioning', '1', '', '', '', '', '', '', 'mi', '480', ''));
});

test('an unfinished session has a blank duration', () => {
  const rows = buildCsv([{ ...push, finishedAt: null }], idx).trim().split('\n');
  assert.equal(rows[1].split(',')[3], '');
});

test('legacy rows keep RPE and leave RIR blank', () => {
  const legacy = { id: 's0', date: '2026-09-15T18:00:00.000Z', finishedAt: null, name: 'Leg Day', entries: [
    { exerciseId: 'bench', type: 'strength', target: null, sets: [{ weight: 225, reps: 5, rir: null, rpe: 8, note: '', loggedAt: null }] },
  ] };
  const rows = buildCsv([legacy], idx).trim().split('\n');
  assert.equal(rows[1], row('2026-09-15T18:00:00.000Z', 's0', 'Leg Day', '', 'Barbell Bench Press', 'strength', 'Chest', '1', '225', '5', '', '8', '', '', '', '', ''));
});

test('cardio that was never done is skipped', () => {
  const s = { ...push, entries: [{ exerciseId: 'bike', type: 'cardio', done: false, durationSec: null, distance: null, distanceUnit: 'mi', note: '' }] };
  assert.equal(buildCsv([s], idx), EXPECTED_HEADER + '\n');
});

test('sessions come out oldest first', () => {
  const later = { ...push, id: 's2', date: '2026-09-23T18:00:00.000Z' };
  const rows = buildCsv([later, push], idx).trim().split('\n');
  assert.equal(rows[1].split(',')[1], 's1');
  assert.equal(rows.at(-1).split(',')[1], 's2');
});

test('unknown exercise id → placeholder name, blank muscle group', () => {
  const s = { id: 'x', date: '2026-09-15T00:00:00.000Z', finishedAt: null, name: 'W', entries: [
    { exerciseId: 'gone', type: 'strength', sets: [{ weight: 100, reps: 1, rir: null, rpe: null, note: '', loggedAt: null }] },
  ] };
  const cells = buildCsv([s], {}).trim().split('\n')[1].split(',');
  assert.equal(cells[4], '(unknown exercise)');
  assert.equal(cells[6], '');
});

test('sessionDurationSec', () => {
  assert.equal(sessionDurationSec(push), 2520);
  assert.equal(sessionDurationSec({ ...push, finishedAt: null }), null);
});
