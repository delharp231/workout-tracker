import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION, VALID_TYPES, newId, newExercise, newRoutine,
  newSession, newStrengthEntry, newCardioEntry, newSet, migrate,
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
  assert.ok(ex.id && ex.createdAt);
});

test('newExercise rejects empty name and bad type', () => {
  assert.throws(() => newExercise({ name: '' }));
  assert.throws(() => newExercise({ name: 'X', type: 'yoga' }));
});

test('VALID_TYPES is strength + cardio', () => {
  assert.deepEqual([...VALID_TYPES].sort(), ['cardio', 'strength']);
});

test('newSession starts empty with an ISO date', () => {
  const s = newSession({ name: 'Push A' });
  assert.equal(s.name, 'Push A');
  assert.deepEqual(s.entries, []);
  assert.equal(s.routineId, null);
  assert.ok(!Number.isNaN(Date.parse(s.date)));
});

test('newStrengthEntry / newCardioEntry shapes', () => {
  const se = newStrengthEntry('ex1');
  assert.deepEqual(se, { exerciseId: 'ex1', type: 'strength', sets: [] });
  const ce = newCardioEntry('ex2');
  assert.equal(ce.type, 'cardio');
  assert.equal(ce.distanceUnit, 'mi');
  assert.equal(ce.durationSec, null);
});

test('newSet defaults nulls', () => {
  const set = newSet({ weight: 135, reps: 5 });
  assert.equal(set.weight, 135);
  assert.equal(set.reps, 5);
  assert.equal(set.rpe, null);
  assert.equal(set.restSec, null);
  assert.equal(set.note, '');
});

test('migrate is identity at current version and rejects newer', () => {
  const data = { schemaVersion: SCHEMA_VERSION, exercises: [] };
  assert.deepEqual(migrate(data), data);
  assert.throws(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 }));
});
