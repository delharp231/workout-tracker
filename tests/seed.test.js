import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStarterRoutines, newExercise } from '../js/schema.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const exSeed = read('seed/exercises.default.json');
const rtSeed = read('seed/routines.default.json');

test('every seeded routine item names an exercise in the exercise seed', () => {
  const names = new Set(exSeed.exercises.map((e) => e.name));
  const missing = rtSeed.routines.flatMap((r) => r.items.map((it) => it.exercise)).filter((n) => !names.has(n));
  assert.deepEqual(missing, []);
});

test('the starter routines resolve completely: Push, Pull, Legs with 6 items each', () => {
  const exercises = exSeed.exercises.map((e) => newExercise({ ...e, custom: false }));
  const routines = buildStarterRoutines(rtSeed, exercises);
  assert.deepEqual(routines.map((r) => [r.name, r.position, r.origin.cycle, r.origin.key, r.items.length]), [
    ['Push (Cycle 1)', 0, 'cycle-1', 'push', 6],
    ['Pull (Cycle 1)', 1, 'cycle-1', 'pull', 6],
    ['Legs (Cycle 1)', 2, 'cycle-1', 'legs', 6],
  ]);
});

test('prescriptions match workout-research/cycle-1.md', () => {
  const rows = rtSeed.routines.flatMap((r) => r.items.map((it) => [r.key, it.exercise, it.sets, it.repMin, it.repMax, it.rirMin, it.rirMax].join('|')));
  assert.deepEqual(rows, [
    'push|Barbell Bench Press|3|6|8|2|2',
    'push|Overhead Press|3|8|10|2|2',
    'push|Incline Dumbbell Press|2|10|12|1|2',
    'push|Cable Lateral Raise|3|12|15|0|1',
    'push|Triceps Pushdown|3|10|12|1|1',
    'push|Stationary Bike|||||',
    'pull|Lat Pulldown|3|8|10|2|2',
    'pull|Chest-Supported Row|3|8|10|2|2',
    'pull|Seated Cable Row|2|10|12|1|2',
    'pull|Face Pull|3|15|15||',
    'pull|Dumbbell Curl|3|10|12|1|1',
    'pull|Rowing Erg|||||',
    'legs|Back Squat|3|6|8|2|3',
    'legs|Romanian Deadlift|3|8|10|2|2',
    'legs|Leg Press|2|12|15|1|1',
    'legs|Seated Leg Curl|3|10|12|1|1',
    'legs|Standing Calf Raise|3|12|15||',
    'legs|Stationary Bike|||||',
  ]);
});
