import { openDb, getAll, bulkPut, put } from './storage.js';
import { newExercise, newRoutine, newRoutineItem } from './schema.js';
import { renderLibrary } from './library.js';
import { renderRoutines } from './routines.js';
import { renderLog } from './session.js';
import { renderHistory } from './history.js';
import { renderBackup } from './backup.js';

const screens = {};
export function registerScreen(name, fn) { screens[name] = fn; }
registerScreen('library', renderLibrary);
registerScreen('routines', renderRoutines);
registerScreen('log', renderLog);
registerScreen('history', renderHistory);
registerScreen('backup', renderBackup);

const titles = { log: 'Log', routines: 'Routines', library: 'Library', history: 'History', backup: 'Backup' };

export function showScreen(name) {
  const root = document.getElementById('screen');
  while (root.firstChild) root.removeChild(root.firstChild);
  document.getElementById('screen-title').textContent = titles[name] ?? name;
  document.querySelectorAll('.tabbar button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.screen === name)));
  (screens[name] ?? screens.log)(root);
}

const norm = (s) => String(s ?? '').trim().toLowerCase();

// Merge the built-in exercise library by name: adds any default exercise the store
// doesn't already have. Idempotent and non-destructive - never clobbers your edits or hides.
async function syncDefaultExercises() {
  const have = new Set((await getAll('exercises')).map((e) => norm(e.name)));
  const res = await fetch('./seed/exercises.default.json');
  const { exercises } = await res.json();
  const toAdd = exercises.filter((e) => !have.has(norm(e.name))).map((e) => newExercise({ ...e, custom: false }));
  if (toAdd.length) await bulkPut('exercises', toAdd);
}

// Seed the starter (Cycle 1) routines once, resolving each item's exercise name to its id.
// Guarded by a localStorage flag so a routine you later delete does not reappear.
async function seedStarterRoutines() {
  try { if (localStorage.getItem('starterRoutinesSeeded')) return; } catch { return; }
  const res = await fetch('./seed/routines.default.json');
  const { routines } = await res.json();
  const idByName = {};
  for (const e of await getAll('exercises')) idByName[norm(e.name)] = e.id;
  const existing = new Set((await getAll('routines')).map((r) => norm(r.name)));
  for (const r of routines) {
    if (existing.has(norm(r.name))) continue;
    const items = (r.items || [])
      .map((it) => {
        const exerciseId = idByName[norm(it.exercise)];
        return exerciseId
          ? newRoutineItem({ exerciseId, targetSets: it.targetSets ?? null, targetReps: it.targetReps ?? null, note: it.note || '' })
          : null;
      })
      .filter(Boolean);
    if (items.length) await put('routines', newRoutine({ name: r.name, items }));
  }
  try { localStorage.setItem('starterRoutinesSeeded', '1'); } catch { /* ignore */ }
}

async function boot() {
  await openDb();
  try { await syncDefaultExercises(); } catch (e) { console.warn('Exercise sync skipped:', e); }
  try { await seedStarterRoutines(); } catch (e) { console.warn('Routine seed skipped:', e); }
  document.querySelectorAll('.tabbar button').forEach((b) =>
    b.addEventListener('click', () => showScreen(b.dataset.screen)));
  showScreen('log');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}
boot();
