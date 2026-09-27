import { openDb, getAll, bulkPut, getMeta, readAll, writeAll } from './storage.js';
import { SCHEMA_VERSION, newExercise, buildStarterRoutines, migrateV1toV2 } from './schema.js';
import { LEGACY_STARTER_SEEDED } from './keys.js';
import { el, clear, download } from './ui.js';
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

let screenCleanup = null;
let screenToken = 0;

// Switches the main view. A renderer is called as (root, arg) and may return (or resolve to) a
// cleanup function; it runs before the next screen renders, so timers and the wake lock never
// outlive their screen. The token drops a cleanup that resolves after the user already moved on.
export function showScreen(name, arg) {
  if (screenCleanup) {
    try { screenCleanup(); } catch (e) { console.warn('Screen cleanup failed:', e); }
    screenCleanup = null;
  }
  const token = ++screenToken;
  const root = document.getElementById('screen');
  clear(root);
  document.getElementById('screen-title').textContent = titles[name] ?? name;
  document.querySelectorAll('.tabbar button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.screen === name)));
  Promise.resolve((screens[name] ?? screens.log)(root, arg)).then((fn) => {
    if (typeof fn !== 'function') return;
    if (token === screenToken) screenCleanup = fn;
    else fn();
  });
}

const norm = (s) => String(s ?? '').trim().toLowerCase();

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status})`);
  return res.json();
}

// Brings the database to SCHEMA_VERSION (spec §5.2): a fresh install is seeded, v1 data is
// migrated. Either way it's one writeAll transaction, so a failure leaves v1 data untouched.
async function ensureSchema() {
  const version = await getMeta();
  if (version === SCHEMA_VERSION) return;
  if (version !== null && version > SCHEMA_VERSION) throw new Error(`This data is from a newer app version (v${version}).`);
  const [exSeed, rtSeed] = await Promise.all([
    fetchJson('./seed/exercises.default.json'),
    fetchJson('./seed/routines.default.json'),
  ]);
  const state = await readAll();
  if (version === null && state.exercises.length === 0) {
    const exercises = exSeed.exercises.map((e) => newExercise({ ...e, custom: false }));
    await writeAll({ ...state, exercises, routines: buildStarterRoutines(rtSeed, exercises) }, SCHEMA_VERSION);
    return;
  }
  const migrated = migrateV1toV2(state, {
    seedRoutines: rtSeed.routines,
    seedExerciseNames: exSeed.exercises.map((e) => e.name),
  });
  await writeAll(migrated, SCHEMA_VERSION);
}

// Adds any default exercise the library doesn't have yet (by name). Never edits or un-hides.
async function syncDefaultExercises() {
  const have = new Set((await getAll('exercises')).map((e) => norm(e.name)));
  const { exercises } = await fetchJson('./seed/exercises.default.json');
  const toAdd = exercises.filter((e) => !have.has(norm(e.name))).map((e) => newExercise({ ...e, custom: false }));
  if (toAdd.length) await bulkPut('exercises', toAdd);
}

// Blocking screen shown when the upgrade fails. Nothing was written, so a raw download is the
// user's safety net before anything else is tried.
export function renderUpgradeFailure(err) {
  const root = document.getElementById('screen');
  clear(root);
  document.getElementById('screen-title').textContent = 'Update problem';
  document.querySelector('.tabbar').hidden = true;
  root.append(
    el('div', { class: 'save-error', role: 'alert', text: "The update couldn't upgrade your data. Nothing was changed. Download a backup, then reload." }),
    el('p', { class: 'muted small', text: String((err && err.message) || err) }),
    el('button', { class: 'primary btn-block', text: 'Download backup', onclick: () => downloadRawBackup(root) }),
    el('button', { class: 'btn-block', text: 'Reload', onclick: () => location.reload() }),
  );
}

async function downloadRawBackup(root) {
  try {
    const raw = await readAll();
    const payload = {
      schemaVersion: 1, exportedAt: new Date().toISOString(),
      settings: raw.settings, exercises: raw.exercises, routines: raw.routines, sessions: raw.sessions,
    };
    download(`workout-backup-raw-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
  } catch (e) {
    root.append(el('p', { class: 'error', role: 'alert', text: `Couldn't read the data either: ${(e && e.message) || e}` }));
  }
}

async function boot() {
  // Register first, so a fixed release can still reach a phone that's stuck on the failure screen.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  try {
    await openDb();
    await ensureSchema();
    try { localStorage.removeItem(LEGACY_STARTER_SEEDED); } catch { /* ignore */ }
  } catch (e) {
    console.error('Upgrade failed:', e);
    renderUpgradeFailure(e);
    return;
  }
  try { await syncDefaultExercises(); } catch (e) { console.warn('Exercise sync skipped:', e); }
  document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => showScreen(b.dataset.screen)));
  showScreen('log');
}
boot();
