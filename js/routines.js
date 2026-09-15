import { getAll, put, remove } from './storage.js';
import { newRoutine, newRoutineItem } from './schema.js';
import { el, clear } from './ui.js';

export async function renderRoutines(root) {
  const [routines, exercises] = await Promise.all([getAll('routines'), getAll('exercises')]);
  routines.sort((a, b) => a.name.localeCompare(b.name));
  renderList(root, routines, exercises);
}

// Shared "storage changed, reload the whole screen" step, matching the Library screen.
async function refresh(root) {
  clear(root);
  await renderRoutines(root);
}

function renderList(root, routines, exercises) {
  const list = el('div');
  for (const r of routines) list.append(routineCard(root, r, exercises));
  if (!routines.length) list.append(el('p', { class: 'muted', text: 'No routines yet.' }));

  root.append(
    el('div', { class: 'row' }, [
      el('button', { class: 'primary', text: '+ New routine', onclick: () => openEditor(root, null, exercises) }),
    ]),
    list,
  );
}

function routineCard(root, r, exercises) {
  const count = r.items.length;
  const info = el('div', { style: 'flex:1;min-width:0' }, [
    el('div', { text: r.name }),
    el('div', { class: 'muted', text: `${count} exercise${count === 1 ? '' : 's'}` }),
  ]);
  return el('div', { class: 'card row' }, [
    info,
    el('button', { text: 'Edit', onclick: () => openEditor(root, r, exercises) }),
    el('button', { text: 'Delete', onclick: () => deleteRoutine(root, r.id) }),
  ]);
}

async function deleteRoutine(root, id) {
  await remove('routines', id);
  await refresh(root);
}

function field(labelText, id, inputEl) {
  inputEl.id = id;
  return el('div', {}, [el('label', { for: id, class: 'muted', text: labelText }), inputEl]);
}

// Resolve an item's exerciseId to a display name. `exercises` is the full loaded
// list (hidden ones included) so a hidden exercise still shows its real name,
// flagged as hidden; only a truly missing/removed exercise falls back to a placeholder.
function exerciseLabel(exercises, exerciseId) {
  const e = exercises.find((x) => x.id === exerciseId);
  if (!e) return '(removed exercise)';
  return e.hidden ? `${e.name} (hidden)` : e.name;
}

// Add/Edit share this editor. `existing` is null for a new routine, the routine
// record for editing. `exercises` is the full library list loaded once by the caller.
function openEditor(root, existing, exercises) {
  clear(root);
  const isEdit = !!existing;
  const pickable = exercises.filter((e) => !e.hidden).sort((a, b) => a.name.localeCompare(b.name));
  // Local working copy of items; nothing touches storage until Save.
  const items = existing ? existing.items.map((it) => ({ ...it })) : [];

  const nameInput = el('input', { placeholder: 'Routine name', value: existing?.name ?? '' });
  const itemsList = el('div');
  const error = el('p', {});

  const drawItems = () => {
    clear(itemsList);
    items.forEach((item, idx) => itemsList.append(itemRow(item, idx)));
    if (!items.length) itemsList.append(el('p', { class: 'muted', text: 'No exercises yet — add one below.' }));
  };

  function itemRow(item, idx) {
    const setsInput = el('input', {
      type: 'number', min: '0', placeholder: 'Sets', value: item.targetSets ?? '',
      oninput: (ev) => { item.targetSets = numberOrNull(ev.target.value); },
    });
    const repsInput = el('input', {
      type: 'number', min: '0', placeholder: 'Reps', value: item.targetReps ?? '',
      oninput: (ev) => { item.targetReps = numberOrNull(ev.target.value); },
    });
    const upAttrs = { text: '↑', onclick: () => moveItem(idx, -1) };
    if (idx === 0) upAttrs.disabled = true;
    const downAttrs = { text: '↓', onclick: () => moveItem(idx, 1) };
    if (idx === items.length - 1) downAttrs.disabled = true;

    return el('div', { class: 'card' }, [
      el('div', { class: 'row' }, [
        el('div', { style: 'flex:1;min-width:0', text: exerciseLabel(exercises, item.exerciseId) }),
        el('button', upAttrs),
        el('button', downAttrs),
        el('button', { text: '×', onclick: () => removeItem(idx) }),
      ]),
      el('div', { class: 'row' }, [
        field('Target sets', `item-${idx}-sets`, setsInput),
        field('Target reps', `item-${idx}-reps`, repsInput),
      ]),
    ]);
  }

  function moveItem(idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    [items[idx], items[j]] = [items[j], items[idx]];
    drawItems();
  }

  function removeItem(idx) {
    items.splice(idx, 1);
    drawItems();
  }

  const picker = el('select', {}, [
    el('option', { value: '', text: '+ Add exercise…', disabled: true }),
    ...pickable.map((e) => el('option', { value: e.id, text: e.name })),
  ]);
  picker.addEventListener('change', () => {
    if (!picker.value) return;
    items.push(newRoutineItem({ exerciseId: picker.value }));
    picker.value = '';
    drawItems();
  });

  const save = async () => {
    error.textContent = '';
    try {
      const r = newRoutine({ name: nameInput.value, items });
      if (isEdit) {
        // Edit in place: keep identity/origin, only name/items/updatedAt change.
        r.id = existing.id;
        r.createdAt = existing.createdAt;
      }
      await put('routines', r);
      await refresh(root);
    } catch (err) {
      error.textContent = (err && err.message) || String(err);
    }
  };

  root.append(
    el('h2', { text: isEdit ? 'Edit routine' : 'New routine' }),
    el('div', { class: 'card' }, [field('Name', 'routine-name', nameInput)]),
    field('Add exercise', 'routine-add-exercise', picker),
    itemsList,
    el('div', { class: 'row' }, [
      el('button', { class: 'primary', text: isEdit ? 'Save changes' : 'Save routine', onclick: save }),
      el('button', { text: 'Cancel', onclick: () => refresh(root) }),
    ]),
    error,
  );
  drawItems();
  nameInput.focus();
}

function numberOrNull(value) {
  if (value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}
