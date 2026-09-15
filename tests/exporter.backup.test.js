import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, serializeBackup } from '../js/exporter.js';
import { SCHEMA_VERSION } from '../js/schema.js';

const state = {
  settings: { key: 'app', units: 'lb' },
  exercises: [{ id: 'e1', name: 'Squat' }],
  routines: [{ id: 'r1', name: 'Legs' }],
  sessions: [{ id: 's1', date: '2026-09-15', name: 'W', entries: [] }],
};

test('buildBackup stamps version + timestamp and carries all stores', () => {
  const b = buildBackup(state);
  assert.equal(b.schemaVersion, SCHEMA_VERSION);
  assert.ok(!Number.isNaN(Date.parse(b.exportedAt)));
  assert.deepEqual(b.exercises, state.exercises);
  assert.deepEqual(b.routines, state.routines);
  assert.deepEqual(b.sessions, state.sessions);
  assert.deepEqual(b.settings, state.settings);
});

test('serializeBackup round-trips through JSON', () => {
  const parsed = JSON.parse(serializeBackup(state));
  assert.equal(parsed.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(parsed.sessions, state.sessions);
});

test('buildBackup fills defaults for an empty state', () => {
  const b = buildBackup({});
  assert.equal(b.schemaVersion, SCHEMA_VERSION);
  assert.ok(!Number.isNaN(Date.parse(b.exportedAt)));
  assert.equal(b.settings, null);
  assert.deepEqual(b.exercises, []);
  assert.deepEqual(b.routines, []);
  assert.deepEqual(b.sessions, []);
});
