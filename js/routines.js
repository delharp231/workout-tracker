import { getAll, get, put, remove } from './storage.js';
import { newRoutine, newRoutineItem, compareRoutines } from './schema.js';
import { el, clear, field, showToast } from './ui.js';
import { intOrNull } from './format.js';
import { exerciseLabel } from './catalog.js';
import { openPicker } from './picker.js';
import { showScreen } from './app.js';
import { ACTIVE_SESSION } from './keys.js';
import { createWorkout } from './session.js';

export async function renderRoutines(root) {
  const [routines, exercises] = await Promise.all([getAll('routines'), getAll('exercises')]);
  routines.sort(compareRoutines);
  renderList(root, routines, exercises);
}

async function refresh(root) {
  clear(root);
  await renderRoutines(root);
}

function renderList(root, routines, exercises) {
  clear(root);
  root.append(el('button', { class: 'primary', text: '+ New routine', onclick: () => openEditor(root, null, exercises, routines) }));
  if (!routines.length) root.append(el('p', { class: 'muted', text: 'No routines yet.' }));
  for (const r of routines) root.append(routineCard(root, r, exercises, routines));
}

function routineCard(root, r, exercises, routines) {
  const count = r.items.length;
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'card-title', text: r.name }),
    el('div', { class: 'muted', text: `${count} exercise${count === 1 ? '' : 's'}` }),
    el('div', { class: 'row' }, [
      el('button', { class: 'primary grow', text: 'Start', 'aria-label': `Start ${r.name}`, onclick: () => startRoutine(r) }),
      el('button', { text: 'Edit', 'aria-label': `Edit ${r.name}`, onclick: () => openEditor(root, r, exercises, routines) }),
      el('button', { text: 'Delete', 'aria-label': `Delete ${r.name}`, onclick: () => deleteRoutine(root, r) }),
    ]),
  ]);
}

// Starts the routine and switches to Log, unless a workout is already running.
async function startRoutine(r) {
  const activeId = localStorage.getItem(ACTIVE_SESSION);
  if (activeId && await get('sessions', activeId)) {
    showScreen('log');
    showToast('Finish or discard the current workout first.');
    return;
  }
  await createWorkout(r);
  showScreen('log');
}

async function deleteRoutine(root, r) {
  if (!confirm(`Delete routine "${r.name}"? Past workouts are kept.`)) return;
  await remove('routines', r.id);
  await refresh(root);
}

function nextPosition(routines) {
  return routines.reduce((max, r) => (Number.isFinite(r.position) ? Math.max(max, r.position + 1) : max), 0);
}

const blankItem = (exerciseId) => ({ exerciseId, targetSets: null, repMin: null, repMax: null, rirMin: null, rirMax: null, note: '' });

// Add/Edit share this editor. Nothing touches storage until Save; `initial` lets Cancel ask
// "Discard changes?" only when something actually changed.
function openEditor(root, existing, exercises, routines) {
  const state = { name: existing?.name ?? '', items: existing ? existing.items.map((it) => ({ ...it })) : [] };
  renderEditor(root, { existing, exercises, routines, state, initial: JSON.stringify(state) });
}

function renderEditor(root, ed) {
  const { existing, exercises, state } = ed;
  clear(root);
  const rerender = () => renderEditor(root, ed);
  const error = el('p', { class: 'error', role: 'alert' });
  const nameInput = el('input', { value: state.name, placeholder: 'Routine name', oninput: (ev) => { state.name = ev.target.value; } });

  const numInput = (item, key, label, idx) => field(label, `item-${idx}-${key}`, el('input', {
    type: 'number', inputmode: 'numeric', min: '0', step: '1', value: item[key] ?? '',
    oninput: (ev) => { item[key] = intOrNull(ev.target.value); },
  }));
  const move = (idx, dir) => {
    const j = idx + dir;
    [state.items[idx], state.items[j]] = [state.items[j], state.items[idx]];
    rerender();
  };

  const itemsList = el('div', { class: 'stack' });
  state.items.forEach((item, idx) => {
    const name = exerciseLabel(exercises.find((x) => x.id === item.exerciseId));
    itemsList.append(el('div', { class: 'card stack' }, [
      el('div', { class: 'row' }, [
        el('div', { class: 'grow card-title', text: name }),
        el('button', { class: 'icon-btn', 'aria-label': `Move ${name} up`, text: '↑', disabled: idx === 0, onclick: () => move(idx, -1) }),
        el('button', { class: 'icon-btn', 'aria-label': `Move ${name} down`, text: '↓', disabled: idx === state.items.length - 1, onclick: () => move(idx, 1) }),
        el('button', { class: 'icon-btn', 'aria-label': `Remove ${name}`, text: '×', onclick: () => { state.items.splice(idx, 1); rerender(); } }),
      ]),
      el('div', { class: 'grid-3' }, [numInput(item, 'targetSets', 'Sets', idx), numInput(item, 'repMin', 'Reps min', idx), numInput(item, 'repMax', 'Reps max', idx)]),
      el('div', { class: 'grid-3' }, [numInput(item, 'rirMin', 'RIR min', idx), numInput(item, 'rirMax', 'RIR max', idx)]),
      field('Note', `item-${idx}-note`, el('input', { value: item.note ?? '', oninput: (ev) => { item.note = ev.target.value; } })),
    ]));
  });
  if (!state.items.length) itemsList.append(el('p', { class: 'muted', text: 'No exercises yet — add one below.' }));

  const addExercise = () => openPicker(root, {
    title: 'Add to routine', exercises,
    onCancel: rerender,
    onPick: (ex) => { state.items.push(blankItem(ex.id)); rerender(); },
  });

  const save = async () => {
    error.textContent = '';
    try {
      // newRoutineItem normalizes each pair: a missing side copies the other, reversed values swap.
      const r = newRoutine({
        name: state.name,
        items: state.items.map((it) => newRoutineItem(it)),
        position: existing && Number.isFinite(existing.position) ? existing.position : nextPosition(ed.routines),
        origin: existing?.origin ?? null,
      });
      if (existing) { r.id = existing.id; r.createdAt = existing.createdAt; }
      await put('routines', r);
      await refresh(root);
    } catch (err) {
      error.textContent = (err && err.message) || String(err);
    }
  };
  const cancel = async () => {
    if (JSON.stringify(state) !== ed.initial && !confirm('Discard changes?')) return;
    await refresh(root);
  };

  root.append(
    el('h2', { text: existing ? 'Edit routine' : 'New routine' }),
    el('div', { class: 'card' }, [field('Name', 'routine-name', nameInput)]),
    itemsList,
    el('button', { text: '+ Add exercise', onclick: addExercise }),
    el('div', { class: 'row' }, [
      el('button', { class: 'primary grow', text: existing ? 'Save changes' : 'Save routine', onclick: save }),
      el('button', { class: 'grow', text: 'Cancel', onclick: cancel }),
    ]),
    error,
  );
}
