import { exportState, importState, getAll, bulkPut, clearAll } from './storage.js';
import { buildCsv, serializeBackup } from './exporter.js';
import { parseBackup, parseExerciseSeed, mergeExercises } from './importer.js';
import { newExercise } from './schema.js';
import { el, clear, field, download, pickFile } from './ui.js';
import { ACTIVE_SESSION, LAST_BACKUP, LEGACY_STARTER_SEEDED } from './keys.js';

const today = () => new Date().toISOString().slice(0, 10);

export async function renderBackup(root) {
  const state = await exportState();
  root.append(reminderCard(), exportCard(root), importCard(root), settingsCard(root, state.settings));
}

async function refresh(root) {
  clear(root);
  await renderBackup(root);
}

function showNotice(root, text) {
  const prev = root.querySelector('[data-notice="true"]');
  if (prev) prev.remove();
  root.prepend(el('p', { 'data-notice': 'true', role: 'status', text }));
}

// Coarse, human relative time: staleness is the point, not the exact timestamp.
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

// ---------- "Last backup" ----------

function reminderCard() {
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'card-title', text: `Last backup: ${relativeTime(localStorage.getItem(LAST_BACKUP))}` }),
    el('div', { class: 'muted', text: 'The JSON backup is the only backup. A lost or reset phone loses everything since your last one.' }),
  ]);
}

// ---------- Export ----------

async function exportJson(root) {
  const state = await exportState();
  const filename = `workout-backup-${today()}.json`;
  download(filename, serializeBackup(state), 'application/json');
  // Only the JSON backup counts as a backup: a CSV can't restore anything.
  localStorage.setItem(LAST_BACKUP, new Date().toISOString());
  await refresh(root);
  showNotice(root, `Saved ${filename}`);
}

async function exportCsv(root) {
  const state = await exportState();
  const exerciseIndex = Object.fromEntries(state.exercises.map((e) => [e.id, { name: e.name, type: e.type, muscleGroup: e.muscleGroup }]));
  const filename = `workouts-${today()}.csv`;
  download(filename, buildCsv(state.sessions, exerciseIndex), 'text/csv');
  showNotice(root, `Exported ${filename}`);
}

function exportCard(root) {
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'card-title', text: 'Export' }),
    el('button', { class: 'primary', text: 'Download JSON backup', onclick: () => exportJson(root) }),
    el('button', { text: 'Export CSV (for spreadsheets)', onclick: () => exportCsv(root) }),
    el('p', { class: 'muted small', text: "JSON is the full backup — keep it somewhere safe. CSV is for reviewing in a spreadsheet; it can't restore anything." }),
  ]);
}

// ---------- Import ----------

// Seeds for migrating an old v1 backup exactly like an on-device upgrade (spec §5.3).
// null means the seeds couldn't be fetched — the caller must not silently do a partial
// migration (no starter refresh, no legacy hide) and report it as an unqualified success.
async function migrateOpts() {
  try {
    const [ex, rt] = await Promise.all([
      fetch('./seed/exercises.default.json').then((r) => r.json()),
      fetch('./seed/routines.default.json').then((r) => r.json()),
    ]);
    return { seedRoutines: rt.routines, seedExerciseNames: ex.exercises.map((e) => e.name) };
  } catch {
    return null;
  }
}

async function importJson(root) {
  const picked = await pickFile('application/json');
  if (!picked) return;

  const opts = await migrateOpts();
  let declared = null;
  try { declared = JSON.parse(picked.text)?.schemaVersion ?? null; } catch { /* parseBackup reports bad JSON */ }
  if (opts === null && typeof declared === 'number' && declared < 2) {
    showNotice(root, "Couldn't load the starter data needed to upgrade this older backup. Check your connection and try again — nothing was changed.");
    return;
  }

  const backupResult = parseBackup(picked.text, opts ?? {});
  if (backupResult.ok) {
    await importBackupFlow(root, picked.name, backupResult.data);
    return;
  }
  if (backupResult.code === 'VERSION') {
    showNotice(root, backupResult.error);
    return;
  }
  const seedResult = parseExerciseSeed(picked.text);
  if (seedResult.ok) {
    await importSeedFlow(root, seedResult.exercises);
    return;
  }
  // Neither a full backup nor an exercise list: a full backup is the expected shape.
  showNotice(root, backupResult.error);
}

// A focused sub-view so nothing else is clickable mid-decision. Resolves 'replace' | 'merge' | null.
function chooseImportMode(root, filename) {
  return new Promise((resolve) => {
    clear(root);
    root.append(
      el('h2', { text: 'Restore backup' }),
      el('div', { class: 'card stack' }, [
        el('div', { text: filename }),
        el('p', { class: 'muted', text: 'Replace erases everything on this device and loads the backup exactly as exported.' }),
        el('p', { class: 'muted', text: "Merge keeps what's already here and adds anything new from the backup (existing data wins on a conflict). On a new or freshly erased phone, choose Replace." }),
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
  try {
    await importState(data, mode);
  } catch (e) {
    // writeAll is atomic: a failure here changes nothing.
    await refresh(root);
    showNotice(root, `Restore failed — nothing was changed: ${(e && e.message) || e}`);
    return;
  }
  await refresh(root);
  showNotice(root, `Restored "${filename}" (${mode} mode).`);
}

async function importSeedFlow(root, exercises) {
  // A row that fails validation (e.g. blank name) is dropped, not fatal, and reported separately.
  let invalid = 0;
  const normalized = [];
  for (const row of exercises) {
    try {
      normalized.push(newExercise({
        name: row.name, type: row.type || 'strength', muscleGroup: row.muscleGroup || '',
        equipment: row.equipment || '', custom: true,
      }));
    } catch {
      invalid++;
    }
  }
  const current = await getAll('exercises');
  const { merged, added, skipped } = mergeExercises(current, normalized);
  await bulkPut('exercises', merged);
  await refresh(root);
  showNotice(root, `Added ${added}. Skipped ${skipped} already in your library${invalid ? `, ${invalid} without a name` : ''}.`);
}

function importCard(root) {
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'card-title', text: 'Import' }),
    el('button', { text: 'Import JSON…', onclick: () => importJson(root) }),
    el('p', { class: 'muted small', text: 'Accepts a full backup (choose replace or merge; older backups are upgraded) or an exercise-only list (merged into your library by name).' }),
  ]);
}

// ---------- Settings ----------

function settingsCard(root, settings) {
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'card-title', text: 'Settings' }),
    el('div', { class: 'row' }, [el('span', { class: 'muted grow', text: 'Units' }), el('span', { text: settings.units === 'kg' ? 'kg' : 'lb' })]),
    el('button', { text: 'Erase all data…', onclick: () => openErasePanel(root) }),
  ]);
}

function openErasePanel(root) {
  clear(root);
  const input = el('input', { placeholder: 'ERASE' });
  const error = el('p', { class: 'error', role: 'alert' });

  const doErase = async () => {
    error.textContent = '';
    if (input.value.trim() !== 'ERASE') {
      error.textContent = 'Type ERASE (all caps) to confirm.';
      return;
    }
    try {
      await clearAll();
      for (const k of [ACTIVE_SESSION, LAST_BACKUP, LEGACY_STARTER_SEEDED]) localStorage.removeItem(k);
      // With meta cleared, the next launch is a fresh install: starter library and routines re-seed.
      location.reload();
    } catch (e) {
      // clearAll is one transaction: a failure here changes nothing.
      error.textContent = `Erase failed — nothing was deleted: ${(e && e.message) || e}`;
    }
  };

  root.append(
    el('h2', { text: 'Erase all data' }),
    el('div', { class: 'card stack' }, [
      el('p', { text: "This permanently deletes every exercise, routine, workout and weigh-in on this device, then starts over with the starter library and routines. Download a backup first if you want to keep anything — this can't be undone." }),
      field('Type ERASE to confirm', 'erase-confirm', input),
      el('div', { class: 'row' }, [
        el('button', { class: 'primary grow', text: 'Erase all data', onclick: doErase }),
        el('button', { class: 'grow', text: 'Cancel', onclick: () => refresh(root) }),
      ]),
      error,
    ]),
  );
  input.focus();
}
