import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_COLUMNS, csvEscape, buildCsv } from '../js/exporter.js';

const EXPECTED_HEADER =
  'date,session_name,exercise,exercise_type,set_number,weight_lb,reps,rpe,rest_sec,distance,distance_unit,duration_sec,note';

test('CSV header matches the fixed contract', () => {
  assert.equal(CSV_COLUMNS.join(','), EXPECTED_HEADER);
});

test('csvEscape quotes only when needed', () => {
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape(135), '135');
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(undefined), '');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('he said "hi"'), '"he said ""hi"""');
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
});

test('empty sessions yields header only', () => {
  assert.equal(buildCsv([], {}), EXPECTED_HEADER + '\n');
});

test('strength session emits one row per set', () => {
  const idx = { ex1: { name: 'Back Squat', type: 'strength' } };
  const sessions = [{
    date: '2026-09-15T18:00:00.000Z', name: 'Leg Day', routineId: null, entries: [
      { exerciseId: 'ex1', type: 'strength', sets: [
        { weight: 225, reps: 5, rpe: 8, restSec: null, note: '' },
        { weight: 225, reps: 5, rpe: 9, restSec: null, note: 'grindy' },
      ] },
    ],
  }];
  const rows = buildCsv(sessions, idx).trim().split('\n');
  assert.equal(rows.length, 3); // header + 2 sets
  assert.equal(rows[1], '2026-09-15T18:00:00.000Z,Leg Day,Back Squat,strength,1,225,5,8,,,,,');
  assert.equal(rows[2], '2026-09-15T18:00:00.000Z,Leg Day,Back Squat,strength,2,225,5,9,,,,,grindy');
});

test('cardio entry emits one row with cardio columns filled', () => {
  const idx = { ex2: { name: 'Treadmill Run', type: 'cardio' } };
  const sessions = [{
    date: '2026-09-15T12:00:00.000Z', name: 'Cardio', routineId: null, entries: [
      { exerciseId: 'ex2', type: 'cardio', durationSec: 1800, distance: 3.1, distanceUnit: 'mi', note: 'easy' },
    ],
  }];
  const rows = buildCsv(sessions, idx).trim().split('\n');
  assert.equal(rows[1], '2026-09-15T12:00:00.000Z,Cardio,Treadmill Run,cardio,1,,,,,3.1,mi,1800,easy');
});

test('unknown exercise id falls back to a placeholder name', () => {
  const sessions = [{
    date: '2026-09-15', name: 'W', routineId: null, entries: [
      { exerciseId: 'gone', type: 'strength', sets: [{ weight: 100, reps: 1, rpe: null, restSec: null, note: '' }] },
    ],
  }];
  assert.ok(buildCsv(sessions, {}).includes('(unknown exercise)'));
});
