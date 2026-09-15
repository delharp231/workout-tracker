import { getAll, put, bulkPut } from './storage.js';
import { newExercise } from './schema.js';
import { parseExerciseSeed, mergeExercises } from './importer.js';
import { el, clear, pickFile } from './ui.js';

export async function renderLibrary(root) {
  const all = (await getAll('exercises')).sort((a, b) => a.name.localeCompare(b.name));
  const state = { q: '', showHidden: false };
  const list = el('div');
  const draw = () => {
    clear(list);
    const rows = all.filter((e) => (state.showHidden || !e.hidden) &&
      [e.name, e.muscleGroup, e.equipment].join(' ').toLowerCase().includes(state.q));
    for (const e of rows) list.append(exerciseRow(e, root));
    if (!rows.length) list.append(el('p', { class: 'muted', text: 'No matches.' }));
  };
  const search = el('input', {
    placeholder: 'Search exercises',
    oninput: (ev) => { state.q = ev.target.value.toLowerCase(); draw(); },
  });
  const hiddenToggle = el('input', {
    type: 'checkbox',
    onchange: (ev) => { state.showHidden = ev.target.checked; draw(); },
  });
  root.append(
    el('div', { class: 'row' }, [
      el('button', { class: 'primary', text: '+ Add exercise', onclick: () => openForm(root) }),
      el('button', { text: 'Import exercises (JSON)', onclick: () => importSeed(root) }),
    ]),
    search,
    el('label', { class: 'row' }, [hiddenToggle, 'Show hidden']),
    list,
  );
  draw();
}

// Shared "storage changed, reload the whole screen" step per the brief.
async function refresh(root) {
  clear(root);
  await renderLibrary(root);
}

// Transient one-line status/error banner pinned above the screen content.
function showNotice(root, text) {
  const prev = root.querySelector('[data-notice="true"]');
  if (prev) prev.remove();
  root.prepend(el('p', { 'data-notice': 'true', text }));
}

function exerciseRow(e, root) {
  const subtitle = [e.muscleGroup, e.equipment].filter(Boolean).join(' · ') || '—';
  const info = el('div', { style: 'flex:1;min-width:0' }, [
    el('div', { text: e.name }),
    el('div', { class: 'muted', text: subtitle }),
  ]);
  return el('div', { class: 'card row' }, [
    info,
    el('button', { text: 'Edit', onclick: () => openForm(root, e) }),
    el('button', { text: e.hidden ? 'Unhide' : 'Hide', onclick: () => toggleHidden(root, e) }),
  ]);
}

async function toggleHidden(root, e) {
  await put('exercises', { ...e, hidden: !e.hidden });
  await refresh(root);
}

function field(labelText, id, inputEl) {
  inputEl.id = id;
  return el('div', {}, [el('label', { for: id, class: 'muted', text: labelText }), inputEl]);
}

// Add/Edit share this form. `existing` is null for Add, the exercise record for Edit.
function openForm(root, existing = null) {
  clear(root);
  const isEdit = !!existing;
  const nameInput = el('input', { placeholder: 'Name', value: existing?.name ?? '' });
  const typeSelect = el('select', {}, [
    el('option', { value: 'strength', text: 'Strength' }),
    el('option', { value: 'cardio', text: 'Cardio' }),
  ]);
  typeSelect.value = existing?.type ?? 'strength';
  const muscleInput = el('input', { placeholder: 'Muscle group', value: existing?.muscleGroup ?? '' });
  const equipmentInput = el('input', { placeholder: 'Equipment', value: existing?.equipment ?? '' });
  const error = el('p', {});

  const save = async () => {
    error.textContent = '';
    try {
      const ex = newExercise({
        name: nameInput.value,
        type: typeSelect.value,
        muscleGroup: muscleInput.value.trim(),
        equipment: equipmentInput.value.trim(),
        custom: existing?.custom ?? true,
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
    el('div', { class: 'card' }, [
      field('Name', 'ex-name', nameInput),
      field('Type', 'ex-type', typeSelect),
      field('Muscle group', 'ex-muscle', muscleInput),
      field('Equipment', 'ex-equipment', equipmentInput),
      el('div', { class: 'row' }, [
        el('button', { class: 'primary', text: isEdit ? 'Save changes' : 'Add exercise', onclick: save }),
        el('button', { text: 'Cancel', onclick: () => refresh(root) }),
      ]),
      error,
    ]),
  );
  nameInput.focus();
}

async function importSeed(root) {
  const file = await pickFile('application/json');
  if (!file) return;
  const parsed = parseExerciseSeed(file.text);
  if (!parsed.ok) {
    showNotice(root, parsed.error);
    return;
  }
  // Normalize every incoming row through newExercise so it has a valid id/shape
  // before merging. A row that fails validation (e.g. blank name) is dropped
  // rather than aborting the whole import; it's folded into the "skipped" count.
  let invalid = 0;
  const normalized = [];
  for (const row of parsed.exercises) {
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
