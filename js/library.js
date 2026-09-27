import { getAll, put } from './storage.js';
import { newExercise } from './schema.js';
import { el, clear, field } from './ui.js';
import { numberOrNull } from './format.js';
import { filterExercises, groupsPresent } from './catalog.js';

export async function renderLibrary(root) {
  const all = await getAll('exercises');
  const state = { q: '', group: null, showHidden: false };
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by muscle group' });
  const count = el('p', { class: 'muted small', role: 'status' });
  const list = el('div', { class: 'stack' });
  const search = el('input', {
    type: 'search', placeholder: 'Search exercises', 'aria-label': 'Search exercises',
    oninput: (ev) => { state.q = ev.target.value; draw(); },
  });
  const hiddenToggle = el('input', {
    type: 'checkbox', id: 'lib-show-hidden',
    onchange: (ev) => { state.showHidden = ev.target.checked; draw(); },
  });

  function draw() {
    const pool = all.filter((e) => state.showHidden || !e.hidden);
    const groups = groupsPresent(pool);
    if (state.group && !groups.includes(state.group)) state.group = null;
    clear(chips);
    for (const g of [null, ...groups]) {
      chips.append(el('button', {
        class: 'chip', 'aria-pressed': String(state.group === g), text: g ?? 'All',
        onclick: () => { state.group = g; draw(); },
      }));
    }
    const rows = filterExercises(pool, { q: state.q, group: state.group });
    count.textContent = `${rows.length} exercise${rows.length === 1 ? '' : 's'}`;
    clear(list);
    for (const e of rows) list.append(exerciseRow(e, root));
    if (!rows.length) {
      list.append(el('div', { class: 'empty' }, [
        el('p', { class: 'muted', text: 'No matches.' }),
        el('button', { text: 'Clear', onclick: () => { state.q = ''; state.group = null; search.value = ''; draw(); } }),
      ]));
    }
  }

  root.append(
    el('button', { class: 'primary', text: '+ Add exercise', onclick: () => openForm(root) }),
    search,
    chips,
    el('label', { class: 'row', for: 'lib-show-hidden' }, [hiddenToggle, el('span', { text: 'Show hidden' })]),
    count,
    list,
  );
  draw();
}

// Shared "storage changed, reload the whole screen" step.
async function refresh(root) {
  clear(root);
  await renderLibrary(root);
}

function exerciseRow(e, root) {
  const subtitle = [e.muscleGroup, e.equipment].filter(Boolean).join(' · ') || '—';
  return el('div', { class: 'card row' }, [
    el('div', { class: 'grow' }, [el('div', { text: e.name }), el('div', { class: 'muted small', text: subtitle })]),
    el('button', { text: 'Edit', 'aria-label': `Edit ${e.name}`, onclick: () => openForm(root, e) }),
    el('button', { text: e.hidden ? 'Unhide' : 'Hide', 'aria-label': `${e.hidden ? 'Unhide' : 'Hide'} ${e.name}`, onclick: () => toggleHidden(root, e) }),
  ]);
}

async function toggleHidden(root, e) {
  await put('exercises', { ...e, hidden: !e.hidden });
  await refresh(root);
}

// Add/Edit share this form. `existing` is null for Add, the exercise record for Edit.
function openForm(root, existing = null) {
  clear(root);
  const isEdit = !!existing;
  const nameInput = el('input', { value: existing?.name ?? '' });
  const typeSelect = el('select', {}, [
    el('option', { value: 'strength', text: 'Strength' }),
    el('option', { value: 'cardio', text: 'Cardio' }),
  ]);
  typeSelect.value = existing?.type ?? 'strength';
  const muscleInput = el('input', { value: existing?.muscleGroup ?? '' });
  const equipmentInput = el('input', { value: existing?.equipment ?? '' });
  const stepInput = el('input', {
    type: 'number', inputmode: 'decimal', step: 'any', min: '0', placeholder: 'Blank = default',
    value: existing?.weightStep ?? '',
  });
  const error = el('p', { class: 'error', role: 'alert' });

  const save = async () => {
    error.textContent = '';
    const step = numberOrNull(stepInput.value);
    if (step !== null && step <= 0) {
      error.textContent = 'Weight step must be more than 0, or blank for the default.';
      return;
    }
    try {
      const ex = newExercise({
        name: nameInput.value,
        type: typeSelect.value,
        muscleGroup: muscleInput.value.trim(),
        equipment: equipmentInput.value.trim(),
        custom: existing?.custom ?? true,
        weightStep: step,
      });
      if (existing) {
        // Edit in place: keep identity/origin/hide-state, only the form fields change.
        ex.id = existing.id;
        ex.hidden = existing.hidden;
        ex.createdAt = existing.createdAt;
      }
      await put('exercises', ex);
      await refresh(root);
    } catch (err) {
      error.textContent = (err && err.message) || String(err);
    }
  };

  root.append(
    el('h2', { text: isEdit ? 'Edit exercise' : 'Add exercise' }),
    el('div', { class: 'card stack' }, [
      field('Name', 'ex-name', nameInput),
      field('Type', 'ex-type', typeSelect),
      field('Muscle group', 'ex-muscle', muscleInput),
      field('Equipment', 'ex-equipment', equipmentInput),
      field('Weight step for ± buttons (lb)', 'ex-step', stepInput),
      el('div', { class: 'row' }, [
        el('button', { class: 'primary grow', text: isEdit ? 'Save changes' : 'Add exercise', onclick: save }),
        el('button', { class: 'grow', text: 'Cancel', onclick: () => refresh(root) }),
      ]),
      error,
    ]),
  );
  if (!isEdit) nameInput.focus();
}
