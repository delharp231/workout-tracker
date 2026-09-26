import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBackup, parseExerciseSeed } from '../js/importer.js';
import { SCHEMA_VERSION } from '../js/schema.js';

test('parseBackup accepts a well-formed backup', () => {
  const text = JSON.stringify({ schemaVersion: SCHEMA_VERSION, exercises: [], routines: [], sessions: [], settings: null });
  const r = parseBackup(text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.sessions, []);
});

test('parseBackup rejects malformed JSON', () => {
  const r = parseBackup('{not json');
  assert.equal(r.ok, false);
  assert.match(r.error, /parse|json/i);
});

test('parseBackup rejects a newer schema version', () => {
  const text = JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, exercises: [], routines: [], sessions: [] });
  const r = parseBackup(text);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'VERSION');
  assert.match(r.error, /newer/i);
});

test('parseBackup rejects wrong shape (missing arrays)', () => {
  const r = parseBackup(JSON.stringify({ schemaVersion: SCHEMA_VERSION, exercises: 'nope' }));
  assert.equal(r.ok, false);
});

test('parseExerciseSeed accepts a bare array or an {exercises:[]} wrapper', () => {
  assert.deepEqual(parseExerciseSeed('[{"name":"Squat"}]').exercises, [{ name: 'Squat' }]);
  assert.deepEqual(parseExerciseSeed('{"exercises":[{"name":"Bench"}]}').exercises, [{ name: 'Bench' }]);
  assert.equal(parseExerciseSeed('{}').ok, false);
});

test('parseExerciseSeed rejects a null / primitive payload without throwing', () => {
  assert.equal(parseExerciseSeed('null').ok, false);
  assert.equal(parseExerciseSeed('42').ok, false);
});

test('parseBackup migrates a v1 backup to the v2 shape', () => {
  const v1 = { schemaVersion: 1, settings: null, exercises: [], sessions: [], routines: [
    { id: 'r', name: 'Arms', createdAt: 'T', updatedAt: 'U', items: [{ exerciseId: 'e', targetSets: 2, targetReps: 12, note: '' }] },
  ] };
  const r = parseBackup(JSON.stringify(v1));
  assert.equal(r.ok, true);
  assert.equal(r.data.schemaVersion, 2);
  assert.equal(r.data.routines[0].items[0].repMax, 12);
  assert.deepEqual(r.data.bodyweight, []);
});
