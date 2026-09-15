import { exportState, importState, getAll, bulkPut, clearAll } from './storage.js';
import { buildCsv, serializeBackup } from './exporter.js';
import { parseBackup, parseExerciseSeed, mergeExercises } from './importer.js';
import { newExercise } from './schema.js';
import { el, clear, download, pickFile } from './ui.js';

const LAST_EXPORT_KEY = 'lastExport';
const ACTIVE_SESSION_KEY = 'activeSessionId';

const today = () => new Date().toISOString().slice(0, 10);

export async function renderBackup(root) {
  const state = await exportState();
  root.append(
    reminderCard(),
    exportCard(root),
    importCard(root),
    settingsCard(root, state.settings),
  );
}

// Shared "storage changed, reload the whole screen" step, matching the other screens.
async function refresh(root) {
  clear(root);
  await renderBackup(root);
}

// Transient one-line status/error banner pinned above the screen content, matching Library.
function showNotice(root, text) {
  const prev = root.querySelector('[data-notice="true"]');
  if (prev) prev.remove();
  root.prepend(el('p', { 'data-notice': 'true', text }));
}

function field(labelText, id, inputEl) {
  inputEl.id = id;
  return el('div', {}, [el('label', { for: id, class: 'muted', text: labelText }), inputEl]);
}

// ---------- "Last exported" reminder ----------

// Coarse, human relative time (minutes/hours/days/months/years). Export is the
// only backup this app has, so this line is meant to be read at a glance —
// exact timestamps aren't the point, staleness is.
function relativeTime(iso) {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

function reminderCard() {
  const last = localStorage.getItem(LAST_EXPORT_KEY);
  return el('div', { class: 'card' }, [
    el('div', { style: 'font-weight:600', text: `Last exported: ${relativeTime(last)}` }),
    el('div', { class: 'muted', text: 'Export is the only backup — a lost or reset device loses everything since your last export.' }),
  ]);
}

// ---------- Export ----------

function stampExport() {
  localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
}

async function exportCsv(root) {
  const state = await exportState();
  const exerciseIndex = Object.fromEntries(state.exercises.map((e) => [e.id, { name: e.name, type: e.type }]));
  const filename = `workouts-${today()}.csv`;
  download(filename, buildCsv(state.sessions, exerciseIndex), 'text/csv');
  stampExport();
  await refresh(root);
  showNotice(root, `Exported ${filename}`);
}

async function exportJson(root) {
  const state = await exportState();
  const filename = `workout-backup-${today()}.json`;
  download(filename, serializeBackup(state), 'application/json');
  stampExport();
  await refresh(root);
  showNotice(root, `Exported ${filename}`);
}

function exportCard(root) {
  return el('div', { class: 'card' }, [
    el('div', { class: 'muted', text: 'Export' }),
    el('div', { class: 'row' }, [
      el('button', { class: 'primary', text: 'Export CSV', onclick: () => exportCsv(root) }),
      el('button', { text: 'Export JSON backup', onclick: () => exportJson(root) }),
    ]),
    el('p', { class: 'muted', text: 'CSV is for reviewing in a spreadsheet. JSON is the full backup — keep it somewhere safe.' }),
  ]);
}

// ---------- Import ----------

async function importJson(root) {
  const picked = await pickFile('application/json');
  if (!picked) return;

  const backupResult = parseBackup(picked.text);
  if (backupResult.ok) {
    await importBackupFlow(root, picked.name, backupResult.data);
    return;
  }

  const seedResult = parseExerciseSeed(picked.text);
  if (seedResult.ok) {
    await importSeedFlow(root, seedResult.exercises);
    return;
  }

  // Neither a full backup nor an exercise list — surface the backup parser's
  // error since a full backup is the primary/expected import shape.
  showNotice(root, backupResult.error);
}

// Modal-ish sub-view (mirrors the Library/Routines "Edit" convention of
// clearing root for a focused step) so nothing else on the screen is
// clickable mid-decision. Resolves 'replace' | 'merge' | null (cancelled).
function chooseImportMode(root, filename) {
  return new Promise((resolve) => {
    clear(root);
    root.append(
      el('h2', { text: 'Restore backup' }),
      el('div', { class: 'card' }, [
        el('div', { text: filename }),
        el('p', { class: 'muted', text: 'Replace erases everything on this device and loads the backup exactly as exported.' }),
        el('p', { class: 'muted', text: "Merge keeps what's already here and adds anything new from the backup (existing data wins on a conflict)." }),
        el('div', { class: 'row' }, [
          el('button', { class: 'primary', text: 'Replace all data', onclick: () => resolve('replace') }),
          el('button', { text: 'Merge', onclick: () => resolve('merge') }),
          el('button', { text: 'Cancel', onclick: () => resolve(null) }),
        ]),
      ]),
    );
  });
}

async function importBackupFlow(root, filename, data) {
  const mode = await chooseImportMode(root, filename);
  if (!mode) { await refresh(root); return; }
  await importState(data, mode);
  await refresh(root);
  showNotice(root, `Restored "${filename}" (${mode} mode).`);
}

async function importSeedFlow(root, exercises) {
  // Normalize every incoming row through newExercise so it has a valid id/shape
  // before merging, matching Library's import-seed flow. A row that fails
  // validation (e.g. blank name) is dropped rather than aborting the whole
  // import; it's folded into the "skipped" count.
  let invalid = 0;
  const normalized = [];
  for (const row of exercises) {
    try {
      normalized.push(newExercise({
        name: row.name,
        type: row.type || 'strength',
        muscleGroup: row.muscleGroup || '',
        equipment: row.equipment || '',
        custom: true,
      }));
    } catch {
      invalid++;
    }
  }
  const current = await getAll('exercises');
  const { merged, added, skipped } = mergeExercises(current, normalized);
  await bulkPut('exercises', merged);
  await refresh(root);
  showNotice(root, `Added ${added}, skipped ${skipped + invalid}`);
}

function importCard(root) {
  return el('div', { class: 'card' }, [
    el('div', { class: 'muted', text: 'Import' }),
    el('button', { text: 'Import JSON…', onclick: () => importJson(root) }),
    el('p', { class: 'muted', text: 'Accepts a full backup (choose replace or merge) or an exercise-only list (merged into your library by name).' }),
  ]);
}

// ---------- Settings ----------

// v1: units are read-only display (weights are always stored/logged in lb —
// see session.js). A future version can turn this into a real kg toggle
// backed by settings.units; wiring that up now would be a control with no
// effect anywhere else in the app.
function settingsCard(root, settings) {
  return el('div', { class: 'card' }, [
    el('div', { class: 'muted', text: 'Settings' }),
    el('div', { class: 'row' }, [
      el('span', { class: 'muted', text: 'Units' }),
      el('span', { text: settings.units === 'kg' ? 'kg' : 'lb' }),
    ]),
    el('button', { text: 'Erase all data…', onclick: () => openErasePanel(root) }),
  ]);
}

function openErasePanel(root) {
  clear(root);
  const input = el('input', { placeholder: 'ERASE' });
  const error = el('p', {});

  const doErase = async () => {
    error.textContent = '';
    if (input.value.trim() !== 'ERASE') {
      error.textContent = 'Type ERASE (all caps) to confirm.';
      return;
    }
    await clearAll();
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    localStorage.removeItem(LAST_EXPORT_KEY);
    await refresh(root);
    showNotice(root, 'All data erased.');
  };

  root.append(
    el('h2', { text: 'Erase all data' }),
    el('div', { class: 'card' }, [
      el('p', { text: "This permanently deletes every exercise, routine, and session on this device. Export a backup first if you want to keep any of it — this can't be undone." }),
      field('Type ERASE to confirm', 'erase-confirm', input),
      el('div', { class: 'row' }, [
        el('button', { class: 'primary', text: 'Erase all data', onclick: doErase }),
        el('button', { text: 'Cancel', onclick: () => refresh(root) }),
      ]),
      error,
    ]),
  );
  input.focus();
}
