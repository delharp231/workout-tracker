import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION, VALID_TYPES, newId, newExercise, newRoutine, newRoutineItem, normalizeRange,
  compareRoutines, targetFromItem, newSession, newStrengthEntry, newCardioEntry, newSet,
  defaultSettings, idsByName, seedItemsFor, buildStarterRoutines, migrate,
} from '../js/schema.js';

test('newId returns unique strings', () => {
  const a = newId(), b = newId();
  assert.equal(typeof a, 'string');
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
});

test('newExercise applies defaults and keeps required fields', () => {
  const ex = newExercise({ name: 'Back Squat' });
  assert.equal(ex.name, 'Back Squat');
  assert.equal(ex.type, 'strength');
  assert.equal(ex.custom, true);
  assert.equal(ex.hidden, false);
  assert.equal(ex.muscleGroup, '');
  assert.equal(ex.weightStep, null);
  assert.ok(ex.id && ex.createdAt);
});

test('newExercise keeps a positive weightStep and drops a bad one', () => {
  assert.equal(newExercise({ name: 'DB Row', weightStep: 2.5 }).weightStep, 2.5);
  assert.equal(newExercise({ name: 'DB Row', weightStep: 0 }).weightStep, null);
  assert.equal(newExercise({ name: 'DB Row', weightStep: -5 }).weightStep, null);
});

test('newExercise rejects empty name and bad type', () => {
  assert.throws(() => newExercise({ name: '' }));
  assert.throws(() => newExercise({ name: 'X', type: 'yoga' }));
});

test('VALID_TYPES is strength + cardio', () => {
  assert.deepEqual([...VALID_TYPES].sort(), ['cardio', 'strength']);
});

test('defaultSettings', () => {
  assert.deepEqual(defaultSettings(), {
    key: 'app', units: 'lb', sessionsPerWeek: 3, weeklySetBand: [6, 12],
    bodyweightRateBand: [0.5, 1.0], defaultWeightStep: 5, keepScreenOn: true,
  });
});

test('normalizeRange copies a missing side and swaps reversed values', () => {
  assert.deepEqual(normalizeRange(6, 8), [6, 8]);
  assert.deepEqual(normalizeRange(8, null), [8, 8]);
  assert.deepEqual(normalizeRange(null, 8), [8, 8]);
  assert.deepEqual(normalizeRange(10, 8), [8, 10]);
  assert.deepEqual(normalizeRange(null, null), [null, null]);
  assert.deepEqual(normalizeRange('6', '8'), [6, 8]);
  assert.deepEqual(normalizeRange('', ''), [null, null]);
});

test('newRoutineItem normalizes ranges and clamps RIR to 0–4', () => {
  const it = newRoutineItem({ exerciseId: 'e1', targetSets: '3', repMin: 8, repMax: 6, rirMin: 2, rirMax: 9, note: 'x' });
  assert.deepEqual(it, { exerciseId: 'e1', targetSets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 4, note: 'x' });
  assert.throws(() => newRoutineItem({}));
});

test('newRoutine carries position and origin', () => {
  const r = newRoutine({ name: ' Push ', items: [], position: 2, origin: { cycle: 'cycle-1', key: 'push' } });
  assert.equal(r.name, 'Push');
  assert.equal(r.position, 2);
  assert.deepEqual(r.origin, { cycle: 'cycle-1', key: 'push' });
  assert.equal(r.createdAt, r.updatedAt);
  assert.throws(() => newRoutine({ name: '' }));
});

test('compareRoutines orders by position, then name; missing positions last', () => {
  const rs = [{ name: 'B' }, { name: 'Legs', position: 2 }, { name: 'Push', position: 0 }, { name: 'A' }, { name: 'Pull', position: 1 }];
  assert.deepEqual(rs.sort(compareRoutines).map((r) => r.name), ['Push', 'Pull', 'Legs', 'A', 'B']);
});

test('targetFromItem snapshots strength and cardio items', () => {
  const item = { exerciseId: 'e', targetSets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: 'n' };
  assert.deepEqual(targetFromItem(item), { sets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: 'n' });
  assert.deepEqual(targetFromItem({ exerciseId: 'b', note: 'Do last.' }, 'cardio'), { note: 'Do last.' });
  assert.equal(targetFromItem({ exerciseId: 'b', note: '' }, 'cardio'), null);
});

test('newSession starts empty, unfinished, at cursor 0', () => {
  const s = newSession({ name: 'Push A' });
  assert.equal(s.name, 'Push A');
  assert.deepEqual(s.entries, []);
  assert.equal(s.routineId, null);
  assert.equal(s.finishedAt, null);
  assert.equal(s.cursor, 0);
  assert.ok(!Number.isNaN(Date.parse(s.date)));
});

test('newStrengthEntry / newCardioEntry shapes', () => {
  assert.deepEqual(newStrengthEntry('ex1'), { exerciseId: 'ex1', type: 'strength', target: null, sets: [] });
  const t = { sets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: '' };
  assert.equal(newStrengthEntry('ex1', t).target, t);
  assert.deepEqual(newCardioEntry('ex2'), {
    exerciseId: 'ex2', type: 'cardio', target: null, done: false, durationSec: null, distance: null, distanceUnit: 'mi', note: '',
  });
});

test('newSet records RIR and loggedAt, clamps RIR, keeps rpe null', () => {
  const s = newSet({ weight: 135, reps: 8, rir: 2, loggedAt: '2026-09-21T18:05:00.000Z' });
  assert.deepEqual(s, { weight: 135, reps: 8, rir: 2, rpe: null, note: '', loggedAt: '2026-09-21T18:05:00.000Z' });
  assert.equal(newSet({ rir: 7 }).rir, 4);
  assert.equal(newSet({ rir: -1 }).rir, 0);
  assert.equal(newSet({}).rir, null);
});

test('seedItemsFor resolves exercise names and skips unknown ones', () => {
  const idByName = idsByName([{ id: 'b1', name: 'Barbell Bench Press' }, { id: 'k1', name: 'Stationary Bike' }]);
  const items = seedItemsFor({ items: [
    { exercise: 'barbell bench press', sets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: 'Primary.' },
    { exercise: 'Nope', sets: 3, repMin: 8, repMax: 10 },
    { exercise: 'Stationary Bike', sets: null, repMin: null, repMax: null, rirMin: null, rirMax: null, note: 'Do last.' },
  ] }, idByName);
  assert.deepEqual(items, [
    { exerciseId: 'b1', targetSets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: 'Primary.' },
    { exerciseId: 'k1', targetSets: null, repMin: null, repMax: null, rirMin: null, rirMax: null, note: 'Do last.' },
  ]);
});

test('buildStarterRoutines keeps seed order as position and stamps origin', () => {
  const exercises = [{ id: 'b1', name: 'Barbell Bench Press' }, { id: 'l1', name: 'Lat Pulldown' }];
  const seed = { routines: [
    { key: 'push', cycle: 'cycle-1', name: 'Push (Cycle 1)', items: [{ exercise: 'Barbell Bench Press', sets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: '' }] },
    { key: 'pull', cycle: 'cycle-1', name: 'Pull (Cycle 1)', items: [{ exercise: 'Lat Pulldown', sets: 3, repMin: 8, repMax: 10, rirMin: 2, rirMax: 2, note: '' }] },
    { key: 'ghost', cycle: 'cycle-1', name: 'Ghost', items: [{ exercise: 'Nope' }] },
  ] };
  const out = buildStarterRoutines(seed, exercises);
  assert.deepEqual(out.map((r) => [r.name, r.position, r.origin.key]), [['Push (Cycle 1)', 0, 'push'], ['Pull (Cycle 1)', 1, 'pull']]);
  assert.equal(out[0].items[0].exerciseId, 'b1');
  assert.equal(out[0].createdAt, out[0].updatedAt);
});

test('migrate is identity at current version and rejects newer', () => {
  const data = { schemaVersion: SCHEMA_VERSION, exercises: [] };
  assert.deepEqual(migrate(data), data);
  assert.throws(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 }));
});
