import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, migrate, migrateV1toV2 } from '../js/schema.js';

const T1 = '2026-09-16T12:00:00.000Z';
const T2 = '2026-09-18T09:00:00.000Z';

const seedRoutines = [
  { key: 'push', cycle: 'cycle-1', name: 'Push (Cycle 1)', items: [
    { exercise: 'Barbell Bench Press', sets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: 'Primary press.' },
    { exercise: 'Stationary Bike', sets: null, repMin: null, repMax: null, rirMin: null, rirMax: null, note: 'Do last.' },
  ] },
  { key: 'legs', cycle: 'cycle-1', name: 'Legs (Cycle 1)', items: [
    { exercise: 'Back Squat', sets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 3, note: 'Primary squat.' },
  ] },
];
const seedExerciseNames = ['Barbell Bench Press', 'Stationary Bike', 'Back Squat', 'Rowing Erg'];
const opts = { seedRoutines, seedExerciseNames };

function v1State() {
  const ex = (id, name, extra = {}) => ({ id, name, type: 'strength', muscleGroup: '', equipment: '', custom: false, hidden: false, createdAt: T1, ...extra });
  return {
    settings: { key: 'app', units: 'lb' },
    exercises: [
      ex('bench', 'Barbell Bench Press'),
      ex('bike', 'Stationary Bike', { type: 'cardio' }),
      ex('squat', 'Back Squat'),
      ex('erg', 'Rowing Erg', { type: 'cardio' }),
      ex('old-bench', 'Bench Press'),               // legacy default, unreferenced → hidden
      ex('old-dl', 'Deadlift'),                     // legacy default, used by a session → stays
      ex('mine', 'My Cable Curl', { custom: true }), // custom → never touched
    ],
    routines: [
      { id: 'r-arms', name: 'Arms', createdAt: T1, updatedAt: T2, items: [{ exerciseId: 'mine', targetSets: 2, targetReps: 12, note: '' }] },
      { id: 'r-legs', name: 'Legs (Cycle 1)', createdAt: T1, updatedAt: T2, items: [{ exerciseId: 'squat', targetSets: 3, targetReps: 7, note: 'mine now' }] },
      { id: 'r-push', name: 'Push (Cycle 1)', createdAt: T1, updatedAt: T1, items: [{ exerciseId: 'bench', targetSets: 3, targetReps: 8, note: '6-8 @ RIR 2' }] },
    ],
    sessions: [
      { id: 's1', date: '2026-09-21T17:30:00.000Z', name: 'Push (Cycle 1)', routineId: 'r-push', notes: '', entries: [
        { exerciseId: 'bench', type: 'strength', sets: [{ weight: 135, reps: 8, rpe: 8, restSec: null, note: '' }] },
        { exerciseId: 'bike', type: 'cardio', durationSec: 480, distance: null, distanceUnit: 'mi', note: '' },
      ] },
      { id: 's0', date: '2026-09-17T17:30:00.000Z', name: 'Workout', routineId: null, notes: '', entries: [
        { exerciseId: 'old-dl', type: 'strength', sets: [{ weight: 185, reps: 5, rpe: null, restSec: null, note: '' }] },
        { exerciseId: 'erg', type: 'cardio', durationSec: null, distance: null, distanceUnit: 'mi', note: '' },
      ] },
    ],
  };
}

test('SCHEMA_VERSION is 2', () => assert.equal(SCHEMA_VERSION, 2));

test('routine items: targetReps becomes a min/max range, RIR starts empty', () => {
  const arms = migrateV1toV2(v1State(), opts).routines.find((r) => r.id === 'r-arms');
  assert.deepEqual(arms.items, [{ exerciseId: 'mine', targetSets: 2, repMin: 12, repMax: 12, rirMin: null, rirMax: null, note: '' }]);
  assert.equal(arms.origin, null);
});

test('an unedited starter routine gets the seed prescriptions, keeping its id', () => {
  const push = migrateV1toV2(v1State(), opts).routines.find((r) => r.id === 'r-push');
  assert.deepEqual(push.origin, { cycle: 'cycle-1', key: 'push' });
  assert.deepEqual(push.items, [
    { exerciseId: 'bench', targetSets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: 'Primary press.' },
    { exerciseId: 'bike', targetSets: null, repMin: null, repMax: null, rirMin: null, rirMax: null, note: 'Do last.' },
  ]);
});

test('an edited starter routine is left alone (shape upgrade only)', () => {
  const legs = migrateV1toV2(v1State(), opts).routines.find((r) => r.id === 'r-legs');
  assert.equal(legs.origin, null);
  assert.deepEqual(legs.items, [{ exerciseId: 'squat', targetSets: 3, repMin: 7, repMax: 7, rirMin: null, rirMax: null, note: 'mine now' }]);
});

test('positions follow seed order, then everything else by name', () => {
  const out = migrateV1toV2(v1State(), opts);
  assert.deepEqual(Object.fromEntries(out.routines.map((r) => [r.name, r.position])), { 'Push (Cycle 1)': 0, 'Legs (Cycle 1)': 1, Arms: 2 });
});

test('legacy defaults are hidden only when nothing references them', () => {
  const byId = Object.fromEntries(migrateV1toV2(v1State(), opts).exercises.map((e) => [e.id, e]));
  assert.equal(byId['old-bench'].hidden, true);
  assert.equal(byId['old-dl'].hidden, false);
  assert.equal(byId.mine.hidden, false);
  assert.equal(byId.bench.hidden, false);
  assert.equal(byId.bench.weightStep, null);
});

test('sessions: sets gain rir/loggedAt, keep rpe, lose restSec; cardio done = something was logged', () => {
  const out = migrateV1toV2(v1State(), opts);
  const s1 = out.sessions.find((s) => s.id === 's1');
  assert.equal(s1.finishedAt, null);
  assert.equal(s1.cursor, 0);
  assert.equal(s1.entries[0].target, null);
  assert.deepEqual(s1.entries[0].sets, [{ weight: 135, reps: 8, rir: null, rpe: 8, note: '', loggedAt: null }]);
  assert.equal(s1.entries[1].done, true);
  assert.equal(out.sessions.find((s) => s.id === 's0').entries[1].done, false);
});

test('settings get defaults, existing values win; bodyweight starts empty', () => {
  const out = migrateV1toV2({ ...v1State(), settings: { key: 'app', units: 'lb', defaultWeightStep: 10 } }, opts);
  assert.equal(out.settings.defaultWeightStep, 10);
  assert.equal(out.settings.keepScreenOn, true);
  assert.deepEqual(out.bodyweight, []);
});

test('without seed options: no refresh, no hiding', () => {
  const out = migrateV1toV2(v1State());
  assert.equal(out.routines.find((r) => r.id === 'r-push').origin, null);
  assert.equal(out.exercises.find((e) => e.id === 'old-bench').hidden, false);
});

test('migration is idempotent and does not mutate its input', () => {
  const input = v1State();
  const snapshot = JSON.stringify(input);
  const once = migrateV1toV2(input, opts);
  assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(migrateV1toV2(once, opts), once);
});

test('blank v1 sets are dropped; partially filled sets are kept', () => {
  const state = {
    ...v1State(),
    sessions: [
      { id: 's2', date: '2026-09-19T17:30:00.000Z', name: 'Workout', routineId: null, notes: '', entries: [
        { exerciseId: 'bench', type: 'strength', sets: [
          { weight: null, reps: null, rpe: null, restSec: null, note: '' },
          { weight: 135, reps: null, rpe: null, restSec: null, note: '' },
        ] },
        { exerciseId: 'squat', type: 'strength', sets: [
          { weight: null, reps: null, rpe: null, restSec: null, note: '' },
          { weight: null, reps: null, rpe: null, restSec: null, note: '   ' },
        ] },
      ] },
    ],
  };
  const out = migrateV1toV2(state, opts);
  const s2 = out.sessions.find((s) => s.id === 's2');
  assert.deepEqual(s2.entries[0].sets, [{ weight: 135, reps: null, rir: null, rpe: null, note: '', loggedAt: null }]);
  assert.deepEqual(s2.entries[1].sets, []);
});

test('migrate chains v1 backups to v2, leaves v2 alone, rejects newer', () => {
  const out = migrate({ schemaVersion: 1, exportedAt: T1, ...v1State() }, opts);
  assert.equal(out.schemaVersion, 2);
  assert.equal(out.exportedAt, T1);
  assert.equal(out.routines.find((r) => r.id === 'r-push').items[0].repMin, 6);
  const v2 = { schemaVersion: 2, exercises: [] };
  assert.equal(migrate(v2), v2);
  assert.throws(() => migrate({ schemaVersion: 3 }));
});
