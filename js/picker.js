import { el, clear } from './ui.js';
import { put } from './storage.js';
import { newExercise } from './schema.js';
import { filterExercises, groupByMuscle, groupsPresent, nameExists } from './catalog.js';

// Full-screen exercise picker (spec §7.5). Search + muscle-group chips + a grouped list, and
// "+ Create '…'" to add a missing exercise mid-workout. `type` limits the list (Swap keeps the
// same type). The search box is not auto-focused, so the phone keyboard stays down on arrival.
export function openPicker(root, { title = 'Add exercise', type = null, exercises, onPick, onCancel }) {
  const state = { q: '', group: null };
  const visible = () => exercises.filter((e) => !e.hidden && (!type || e.type === type));
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by muscle group' });
  const count = el('p', { class: 'muted small', role: 'status' });
  const list = el('div', { class: 'stack' });
  const search = el('input', {
    type: 'search', placeholder: 'Search exercises', 'aria-label': 'Search exercises',
    oninput: (ev) => { state.q = ev.target.value; draw(); },
  });

  async function quickAdd(name) {
    const ex = newExercise({
      name, type: type ?? 'strength', custom: true,
      muscleGroup: state.group && state.group !== 'Other' ? state.group : '',
    });
    await put('exercises', ex);
    exercises.push(ex);
    onPick(ex);
  }

  function draw() {
    const pool = visible();
    clear(chips);
    for (const g of [null, ...groupsPresent(pool)]) {
      chips.append(el('button', {
        class: 'chip', 'aria-pressed': String(state.group === g), text: g ?? 'All',
        onclick: () => { state.group = g; draw(); },
      }));
    }
    const rows = filterExercises(pool, { q: state.q, group: state.group });
    count.textContent = `${rows.length} exercise${rows.length === 1 ? '' : 's'}`;
    clear(list);
    for (const { group, items } of groupByMuscle(rows)) {
      list.append(el('h3', { class: 'group-head', text: group }));
      for (const ex of items) {
        list.append(el('button', { class: 'pick-row', onclick: () => onPick(ex) }, [
          el('span', { text: ex.name }),
          el('span', { class: 'muted small', text: ex.equipment || '' }),
        ]));
      }
    }
    if (!rows.length) {
      list.append(el('div', { class: 'empty' }, [
        el('p', { class: 'muted', text: 'No matches.' }),
        el('button', { text: 'Clear search', onclick: () => { state.q = ''; state.group = null; search.value = ''; draw(); } }),
      ]));
    }
    const q = state.q.trim();
    if (q && !nameExists(exercises, q)) {
      list.append(el('button', { class: 'pick-row add', text: `+ Create "${q}"`, onclick: () => quickAdd(q) }));
    }
  }

  clear(root);
  root.append(
    el('div', { class: 'row' }, [
      el('button', { class: 'icon-btn', 'aria-label': 'Back', text: '‹', onclick: onCancel }),
      el('h2', { class: 'grow', text: title }),
    ]),
    search, chips, count, list,
  );
  draw();
}
