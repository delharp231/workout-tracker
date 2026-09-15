import { openDb, getAll, bulkPut } from './storage.js';
import { newExercise } from './schema.js';
import { renderLibrary } from './library.js';

// Screen renderers are attached by their modules; stubbed here until their tasks land.
const screens = {
  log: (root) => root.append(Object.assign(document.createElement('p'), { textContent: 'Log — coming in Task 9' })),
  routines: (root) => root.append(Object.assign(document.createElement('p'), { textContent: 'Routines — Task 8' })),
  library: (root) => root.append(Object.assign(document.createElement('p'), { textContent: 'Library — Task 7' })),
  history: (root) => root.append(Object.assign(document.createElement('p'), { textContent: 'History — Task 10' })),
  backup: (root) => root.append(Object.assign(document.createElement('p'), { textContent: 'Backup — Task 11' })),
};
export function registerScreen(name, fn) { screens[name] = fn; }
registerScreen('library', renderLibrary);

const titles = { log: 'Log', routines: 'Routines', library: 'Library', history: 'History', backup: 'Backup' };

export function showScreen(name) {
  const root = document.getElementById('screen');
  while (root.firstChild) root.removeChild(root.firstChild);
  document.getElementById('screen-title').textContent = titles[name] ?? name;
  document.querySelectorAll('.tabbar button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.screen === name)));
  (screens[name] ?? screens.log)(root);
}

async function seedIfEmpty() {
  const existing = await getAll('exercises');
  if (existing.length) return;
  const res = await fetch('./seed/exercises.default.json');
  const { exercises } = await res.json();
  await bulkPut('exercises', exercises.map((e) => newExercise({ ...e, custom: false })));
}

async function boot() {
  await openDb();
  await seedIfEmpty();
  document.querySelectorAll('.tabbar button').forEach((b) =>
    b.addEventListener('click', () => showScreen(b.dataset.screen)));
  showScreen('log');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}
boot();
