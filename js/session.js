import { getAll, get, put, remove } from './storage.js';
import { newSession, newStrengthEntry, newCardioEntry, newSet } from './schema.js';
import { el, clear } from './ui.js';
import { showScreen } from './app.js';

const ACTIVE_KEY = 'activeSessionId';

export async function renderLog(root) {
  const activeId = localStorage.getItem(ACTIVE_KEY);
  if (activeId) {
    const session = await get('sessions', activeId);
    if (session) {
      await renderActive(root, session);
      return;
    }
    // Stale pointer (session was discarded/removed, or a backup was restored
    // over it) — drop it and fall through to the Start view.
    localStorage.removeItem(ACTIVE_KEY);
  }
  await renderStart(root);
}

// Full-screen reload, matching the Library/Routines "storage changed" pattern.
// Used at the two view-level transitions (Start -> Active, Active -> Start);
// in-place field edits never call this (see renderActive).
async function refresh(root) {
  clear(root);
  await renderLog(root);
}

function field(labelText, id, inputEl) {
  inputEl.id = id;
  return el('div', {}, [el('label', { for: id, class: 'muted', text: labelText }), inputEl]);
}

// Explicit-parse numeric reader: '' -> null, otherwise Number(...) or null if
// not a number. Deliberately no `||` fallback — that would turn a real 0
// (weight/reps/rpe entered as 0) into null.
function numberOrNull(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

// Accepts "mm:ss", "h:mm:ss", or a bare number of seconds.
function parseDuration(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (s.includes(':')) {
    const parts = s.split(':').map((p) => Number(p.trim()));
    if (parts.length < 2 || parts.length > 3 || parts.some(Number.isNaN)) return null;
    const [h, m, sec] = parts.length === 3 ? parts : [0, ...parts];
    return Math.round(h * 3600 + m * 60 + sec);
  }
  const n = Number(s);
  return Number.isNaN(n) ? null : Math.round(n);
}

function formatDuration(sec) {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return '';
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------- Start view (no active session) ----------

async function renderStart(root) {
  clear(root);
  const [routines, exercises] = await Promise.all([getAll('routines'), getAll('exercises')]);
  routines.sort((a, b) => a.name.localeCompare(b.name));

  const picker = el('select', {}, [
    el('option', { value: '', text: 'Start from routine…', disabled: true }),
    ...routines.map((r) => el('option', { value: r.id, text: r.name })),
  ]);
  picker.addEventListener('change', () => {
    if (!picker.value) return;
    const routine = routines.find((r) => r.id === picker.value);
    startSession(root, routine, exercises);
  });

  root.append(
    el('div', { class: 'card' }, [
      el('button', {
        class: 'primary', text: 'Start freestyle',
        onclick: () => startSession(root, null, exercises),
      }),
    ]),
    routines.length
      ? el('div', { class: 'card' }, [field('Or start from a routine', 'log-start-routine', picker)])
      : el('p', { class: 'muted', text: 'No routines yet — start freestyle, or build one in Routines.' }),
  );
}

// Creates the session, pre-adds one entry per routine item (if any), persists
// it immediately, and marks it active — per the state-safety rule, a session
// exists in storage from the moment it's started, not from "Finish".
async function startSession(root, routine, exercises) {
  const session = newSession({
    name: routine ? routine.name : undefined,
    routineId: routine ? routine.id : null,
  });
  if (routine) {
    for (const item of routine.items) {
      const ex = exercises.find((e) => e.id === item.exerciseId);
      session.entries.push(
        ex && ex.type === 'cardio' ? newCardioEntry(item.exerciseId) : newStrengthEntry(item.exerciseId),
      );
    }
  }
  await put('sessions', session);
  localStorage.setItem(ACTIVE_KEY, session.id);
  await refresh(root);
}

// ---------- Active session view ----------

async function renderActive(root, session) {
  clear(root);
  const exercises = await getAll('exercises');
  const exIndex = new Map(exercises.map((e) => [e.id, e]));
  const pickable = exercises.filter((e) => !e.hidden).sort((a, b) => a.name.localeCompare(b.name));

  // Prominent, persistent warning if a save ever fails (storage quota,
  // transaction abort) — shown once and left visible; the "persisted
  // immediately" guarantee must never fail silently.
  const saveError = el('div', {
    class: 'save-error',
    text: "⚠ Couldn't save your last change — check device storage.",
  });
  saveError.hidden = true;
  function showSaveError() { saveError.hidden = false; }

  // The single persistence chokepoint: every mutation below (add entry, add
  // set, any field edit) calls this — never a direct `put` of its own — so
  // closing the tab mid-set can't lose anything (no batching, no save-on-finish).
  const save = () => put('sessions', session).catch(() => showSaveError());

  function exerciseLabel(exerciseId) {
    const e = exIndex.get(exerciseId);
    if (!e) return '(removed exercise)';
    return e.hidden ? `${e.name} (hidden)` : e.name;
  }

  const entriesList = el('div');
  const drawEntries = () => {
    clear(entriesList);
    session.entries.forEach((entry) => entriesList.append(entryCard(entry)));
    if (!session.entries.length) {
      entriesList.append(el('p', { class: 'muted', text: 'No exercises yet — add one below.' }));
    }
  };

  function entryCard(entry) {
    return entry.type === 'cardio' ? cardioCard(entry) : strengthCard(entry);
  }

  // Each set row closes over the actual `set` object (an element of
  // entry.sets), never a re-derived `entry.sets[i]` lookup, so a handler
  // always writes back to the exact set it was built for even if the list
  // is rebuilt or re-ordered later. Rows are always rebuilt fresh from
  // entry.sets on every drawSets() call (never patched in place).
  function strengthCard(entry) {
    const setsBody = el('div');
    const drawSets = () => {
      clear(setsBody);
      entry.sets.forEach((set, i) => setsBody.append(setRow(set, i)));
      if (!entry.sets.length) setsBody.append(el('p', { class: 'muted', text: 'No sets yet.' }));
    };

    function setRow(set, i) {
      const weightInput = el('input', {
        type: 'number', inputmode: 'decimal', step: 'any', placeholder: 'Weight (lb)',
        value: set.weight ?? '',
        oninput: (ev) => { set.weight = numberOrNull(ev.target.value); save(); },
      });
      const repsInput = el('input', {
        type: 'number', inputmode: 'numeric', step: '1', placeholder: 'Reps',
        value: set.reps ?? '',
        oninput: (ev) => { set.reps = numberOrNull(ev.target.value); save(); },
      });
      const rpeInput = el('input', {
        type: 'number', inputmode: 'decimal', step: 'any', min: '0', max: '10', placeholder: 'RPE',
        value: set.rpe ?? '',
        oninput: (ev) => { set.rpe = numberOrNull(ev.target.value); save(); },
      });
      const noteInput = el('input', {
        placeholder: 'Note', value: set.note ?? '',
        oninput: (ev) => { set.note = ev.target.value; save(); },
      });
      return el('div', { class: 'card' }, [
        el('div', { class: 'row' }, [
          el('span', { class: 'muted', text: `#${i + 1}` }),
          weightInput, repsInput, rpeInput,
        ]),
        noteInput,
      ]);
    }

    drawSets();
    return el('div', { class: 'card' }, [
      el('div', { text: exerciseLabel(entry.exerciseId) }),
      setsBody,
      el('button', {
        text: '+ Add set',
        onclick: async () => { entry.sets.push(newSet()); await save(); drawSets(); },
      }),
    ]);
  }

  // Cardio fields mutate the captured `entry` object directly, same rule as
  // the strength set rows above.
  function cardioCard(entry) {
    const durationInput = el('input', {
      placeholder: 'Duration (mm:ss or sec)', value: formatDuration(entry.durationSec),
      oninput: (ev) => { entry.durationSec = parseDuration(ev.target.value); save(); },
    });
    const distanceInput = el('input', {
      type: 'number', inputmode: 'decimal', step: 'any', min: '0', placeholder: 'Distance',
      value: entry.distance ?? '',
      oninput: (ev) => { entry.distance = numberOrNull(ev.target.value); save(); },
    });
    const unitSelect = el('select', {}, [
      el('option', { value: 'mi', text: 'mi' }),
      el('option', { value: 'km', text: 'km' }),
      el('option', { value: 'm', text: 'm' }),
    ]);
    unitSelect.value = entry.distanceUnit ?? 'mi';
    unitSelect.addEventListener('change', () => { entry.distanceUnit = unitSelect.value; save(); });
    const noteInput = el('input', {
      placeholder: 'Note', value: entry.note ?? '',
      oninput: (ev) => { entry.note = ev.target.value; save(); },
    });
    return el('div', { class: 'card' }, [
      el('div', { text: exerciseLabel(entry.exerciseId) }),
      el('div', { class: 'row' }, [durationInput, distanceInput, unitSelect]),
      noteInput,
    ]);
  }

  const addExercisePicker = el('select', {}, [
    el('option', { value: '', text: '+ Add exercise…', disabled: true }),
    ...pickable.map((e) => el('option', { value: e.id, text: e.name })),
  ]);
  addExercisePicker.addEventListener('change', async () => {
    if (!addExercisePicker.value) return;
    const ex = exIndex.get(addExercisePicker.value);
    session.entries.push(ex.type === 'cardio' ? newCardioEntry(ex.id) : newStrengthEntry(ex.id));
    await save();
    addExercisePicker.value = '';
    drawEntries();
  });

  async function finish() {
    try {
      await put('sessions', session);
    } catch {
      showSaveError();
      return;
    }
    localStorage.removeItem(ACTIVE_KEY);
    showScreen('history');
  }

  async function discard() {
    await remove('sessions', session.id);
    localStorage.removeItem(ACTIVE_KEY);
    await refresh(root);
  }

  root.append(
    el('h2', { text: session.name }),
    el('div', { class: 'muted', text: new Date(session.date).toLocaleString() }),
    saveError,
    entriesList,
    field('Add exercise', 'log-add-exercise', addExercisePicker),
    el('div', { class: 'row' }, [
      el('button', { class: 'primary', text: 'Finish', onclick: finish }),
      el('button', { text: 'Discard', onclick: discard }),
    ]),
  );
  drawEntries();
}
