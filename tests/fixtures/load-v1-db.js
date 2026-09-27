// Dev tool for the Phase 3 migration gate. Recreates the app's IndexedDB exactly as a v1 build
// left it (IndexedDB version 1, no meta record), so the next page load runs the real boot migration.
//
// Usage, in the preview (http://localhost:5055) via devtools or the browser tool:
//   const m = await import('/tests/fixtures/load-v1-db.js');
//   await m.loadV1Fixture();                                  // synthetic v1 data
//   // or: await m.loadV1Backup('/tests/fixtures/real-v1.json'); // a real v1 JSON backup (gitignored)
//   // or: await m.loadV1Fixture({ poisonMeta: true });        // forces the upgrade's final write
//   //     (meta.put) to fail, to prove the one-transaction rollback
//   location.reload();

const V1_STORES = { exercises: 'id', routines: 'id', sessions: 'id', settings: 'key' };

async function recreateV1(state, { metaKeyPath = 'key' } = {}) {
  await new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase('workout-tracker');
    r.onsuccess = resolve;
    r.onerror = () => reject(r.error);
  });
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('workout-tracker', 1);
    r.onupgradeneeded = () => {
      for (const [store, keyPath] of Object.entries(V1_STORES)) r.result.createObjectStore(store, { keyPath });
      r.result.createObjectStore('meta', { keyPath: metaKeyPath });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  await new Promise((resolve, reject) => {
    const t = db.transaction(['exercises', 'routines', 'sessions', 'settings'], 'readwrite');
    for (const e of state.exercises) t.objectStore('exercises').put(e);
    for (const r of state.routines) t.objectStore('routines').put(r);
    for (const s of state.sessions) t.objectStore('sessions').put(s);
    t.objectStore('settings').put(state.settings ?? { key: 'app', units: 'lb' });
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  db.close();
  localStorage.removeItem('activeSessionId');
  localStorage.setItem('starterRoutinesSeeded', '1');
}

export async function loadV1Backup(url) {
  const b = await (await fetch(url)).json();
  await recreateV1({ settings: b.settings, exercises: b.exercises, routines: b.routines, sessions: b.sessions });
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// Synthetic v1 data: the full exercise seed plus two legacy placeholders and one custom
// exercise; the three starter routines in v1 shape (Legs marked as edited); two finished sessions.
// Returned as a plain state object so it can also be restored as a v1 *backup* (Task 19).
export async function buildV1Fixture() {
  const { exercises: seedEx } = await (await fetch('/seed/exercises.default.json')).json();
  const { routines: seedRt } = await (await fetch('/seed/routines.default.json')).json();
  const T0 = '2026-09-16T12:00:00.000Z';
  const exercises = [
    ...seedEx.map((e) => ({ id: `ex-${slug(e.name)}`, name: e.name, type: e.type, muscleGroup: e.muscleGroup, equipment: e.equipment, custom: false, hidden: false, createdAt: T0 })),
    { id: 'ex-legacy-bench', name: 'Bench Press', type: 'strength', muscleGroup: 'Chest', equipment: 'Barbell', custom: false, hidden: false, createdAt: T0 },
    { id: 'ex-legacy-deadlift', name: 'Deadlift', type: 'strength', muscleGroup: 'Back', equipment: 'Barbell', custom: false, hidden: false, createdAt: T0 },
    { id: 'ex-my-curl', name: 'My Cable Curl', type: 'strength', muscleGroup: 'Arms', equipment: 'Cable', custom: true, hidden: false, createdAt: T0 },
  ];
  const routines = seedRt.map((r) => ({
    id: `rt-${r.key}`, name: r.name, createdAt: T0,
    updatedAt: r.key === 'legs' ? '2026-09-18T09:00:00.000Z' : T0, // Legs was edited → must be left alone
    items: r.items.map((it) => ({
      exerciseId: `ex-${slug(it.exercise)}`, targetSets: it.sets ?? null, targetReps: it.repMax ?? null,
      note: r.key === 'legs' ? `EDITED ${it.note}` : it.note,
    })),
  }));
  const sessions = [
    { id: 'ses-push-1', date: '2026-09-21T17:30:00.000Z', name: 'Push (Cycle 1)', routineId: 'rt-push', notes: '', entries: [
      { exerciseId: 'ex-barbell-bench-press', type: 'strength', sets: [
        { weight: 135, reps: 8, rpe: 8, restSec: null, note: '' },
        { weight: 135, reps: 8, rpe: 8.5, restSec: null, note: '' },
        { weight: 135, reps: 7, rpe: 9, restSec: null, note: 'grindy' },
      ] },
      { exerciseId: 'ex-overhead-press', type: 'strength', sets: [] },
      { exerciseId: 'ex-stationary-bike', type: 'cardio', durationSec: 480, distance: null, distanceUnit: 'mi', note: '' },
    ] },
    { id: 'ses-old-1', date: '2026-09-17T17:30:00.000Z', name: 'Workout', routineId: null, notes: '', entries: [
      { exerciseId: 'ex-legacy-deadlift', type: 'strength', sets: [{ weight: 185, reps: 5, rpe: null, restSec: null, note: '' }] },
      { exerciseId: 'ex-rowing-erg', type: 'cardio', durationSec: null, distance: null, distanceUnit: 'mi', note: '' },
    ] },
  ];
  return { settings: { key: 'app', units: 'lb' }, exercises, routines, sessions };
}

export async function loadV1Fixture({ poisonMeta = false } = {}) {
  await recreateV1(await buildV1Fixture(), { metaKeyPath: poisonMeta ? 'id' : 'key' });
}
