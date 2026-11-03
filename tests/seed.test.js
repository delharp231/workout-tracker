import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStarterRoutines, newExercise, newRoutine, starterRoutinesToAdd } from '../js/schema.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const exSeed = read('seed/exercises.default.json');
const rtSeed = read('seed/routines.default.json');

test('every seeded routine item names an exercise in the exercise seed', () => {
  const names = new Set(exSeed.exercises.map((e) => e.name));
  const missing = rtSeed.routines.flatMap((r) => r.items.map((it) => it.exercise)).filter((n) => !names.has(n));
  assert.deepEqual(missing, []);
});

test('the starter routines resolve completely: Push, Pull, Legs, Full Body A and B', () => {
  const exercises = exSeed.exercises.map((e) => newExercise({ ...e, custom: false }));
  const routines = buildStarterRoutines(rtSeed, exercises);
  assert.deepEqual(routines.map((r) => [r.name, r.position, r.origin.cycle, r.origin.key, r.items.length]), [
    ['Push (Cycle 1)', 0, 'cycle-1', 'push', 6],
    ['Pull (Cycle 1)', 1, 'cycle-1', 'pull', 6],
    ['Legs (Cycle 1)', 2, 'cycle-1', 'legs', 6],
    ['Full Body A', 3, 'newborn', 'full-body-a', 5],
    ['Full Body B', 4, 'newborn', 'full-body-b', 5],
    ['Full Body Machines A', 5, 'newborn', 'full-body-machines-a', 8],
    ['Full Body Machines B', 6, 'newborn', 'full-body-machines-b', 8],
  ]);
});

test('prescriptions match workout-research/cycle-1.md, plus the newborn full-body routines', () => {
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
    'full-body-a|Leg Press|3|8|12|2|2',
    'full-body-a|Dumbbell Bench Press|3|8|12|2|2',
    'full-body-a|Seated Cable Row|3|8|12|2|2',
    'full-body-a|Romanian Deadlift|3|8|12|2|2',
    'full-body-a|Plank|3|30|45||',
    'full-body-b|Bulgarian Split Squat|3|8|12|2|2',
    'full-body-b|Dumbbell Shoulder Press|3|8|12|2|2',
    'full-body-b|Lat Pulldown|3|8|12|2|2',
    'full-body-b|Hip Thrust|3|8|12|2|2',
    'full-body-b|Dead Bug|3|8|8||',
    'full-body-machines-a|Incline Treadmill Walk|||||',
    'full-body-machines-a|Leg Press|3|10|10|1|2',
    'full-body-machines-a|Machine Chest Press|3|10|10|1|2',
    'full-body-machines-a|Seated Cable Row|3|10|10|1|2',
    'full-body-machines-a|Machine Shoulder Press|3|10|10|1|2',
    'full-body-machines-a|Seated Leg Curl|3|10|10|1|2',
    'full-body-machines-a|Lat Pulldown|3|10|10|1|2',
    'full-body-machines-a|Plank|3|30|30||',
    'full-body-machines-b|Incline Treadmill Walk|||||',
    'full-body-machines-b|Hack Squat|3|10|10|1|2',
    'full-body-machines-b|Pec Deck Fly|3|10|10|1|2',
    'full-body-machines-b|Chest-Supported Row|3|10|10|1|2',
    'full-body-machines-b|Cable Lateral Raise|3|10|10|1|2',
    'full-body-machines-b|Hip Thrust|3|10|10|1|2',
    'full-body-machines-b|Lat Pulldown|3|10|10|1|2',
    'full-body-machines-b|Dead Bug|3|8|8||',
  ]);
});

const exercises = () => exSeed.exercises.map((e) => newExercise({ ...e, custom: false }));
const oldDevice = () => {
  const ex = exercises();
  return { ex, routines: buildStarterRoutines({ routines: rtSeed.routines.filter((r) => !r.sync) }, ex) };
};

test('a device that has only the cycle 1 routines is offered Full Body A, B and Machines A and B after them', () => {
  const { ex, routines } = oldDevice();
  const { toAdd, offered } = starterRoutinesToAdd(rtSeed, ex, routines, []);
  assert.deepEqual(toAdd.map((r) => [r.name, r.position, r.items.length]), [['Full Body A', 3, 5], ['Full Body B', 4, 5], ['Full Body Machines A', 5, 8], ['Full Body Machines B', 6, 8]]);
  assert.deepEqual(offered.sort(), ['newborn/full-body-a', 'newborn/full-body-b', 'newborn/full-body-machines-a', 'newborn/full-body-machines-b']);
});

test('a routine already on the device is not added again', () => {
  const ex = exercises();
  const routines = buildStarterRoutines(rtSeed, ex);
  const { toAdd, offered } = starterRoutinesToAdd(rtSeed, ex, routines, []);
  assert.deepEqual(toAdd, []);
  assert.deepEqual(offered.sort(), ['newborn/full-body-a', 'newborn/full-body-b', 'newborn/full-body-machines-a', 'newborn/full-body-machines-b']);
});

test('a routine you deleted after it was offered does not come back', () => {
  const { ex, routines } = oldDevice();
  const { toAdd } = starterRoutinesToAdd(rtSeed, ex, routines, ['newborn/full-body-a', 'newborn/full-body-b', 'newborn/full-body-machines-a', 'newborn/full-body-machines-b']);
  assert.deepEqual(toAdd, []);
});

test('a device that has the first Full Body Machines routine gets Machines A and B after it, and keeps the old one', () => {
  const ex = exercises();
  const first = { key: 'full-body-machines', cycle: 'newborn', name: 'Full Body Machines', sync: true, items: [{ exercise: 'Leg Press', sets: 2, repMin: 10, repMax: 10 }] };
  const before = rtSeed.routines.filter((r) => !r.key.startsWith('full-body-machines-'));
  const routines = buildStarterRoutines({ routines: [...before, first] }, ex);
  const offered = ['newborn/full-body-a', 'newborn/full-body-b', 'newborn/full-body-machines'];
  const res = starterRoutinesToAdd(rtSeed, ex, routines, offered);
  assert.deepEqual(res.toAdd.map((r) => [r.name, r.position, r.items.length]), [['Full Body Machines A', 6, 8], ['Full Body Machines B', 7, 8]]);
  assert.ok(res.offered.includes('newborn/full-body-machines'));
});

test('only seed routines marked sync are added, and the cycle 1 routines never are', () => {
  const { ex } = oldDevice();
  const { toAdd } = starterRoutinesToAdd(rtSeed, ex, [], []);
  assert.deepEqual(toAdd.map((r) => r.name), ['Full Body A', 'Full Body B', 'Full Body Machines A', 'Full Body Machines B']);
});

test('new routines sort after existing ones even when positions have gaps or are missing', () => {
  const { ex } = oldDevice();
  const mine = [newRoutine({ name: 'Mine', position: 9 }), { ...newRoutine({ name: 'Loose' }), position: undefined }];
  const { toAdd } = starterRoutinesToAdd(rtSeed, ex, mine, []);
  assert.deepEqual(toAdd.map((r) => r.position), [10, 11, 12, 13]);
});

test('a seed routine whose exercises are all unknown is skipped and not marked offered', () => {
  const seed = { routines: [{ key: 'x', cycle: 'c', name: 'X', sync: true, items: [{ exercise: 'Nope', sets: 3 }] }] };
  const { toAdd, offered } = starterRoutinesToAdd(seed, exercises(), [], []);
  assert.deepEqual(toAdd, []);
  assert.deepEqual(offered, []);
});
