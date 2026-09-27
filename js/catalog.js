// Pure helpers for browsing the exercise library: group order, search, grouping, labels.

export const MUSCLE_ORDER = ['Chest', 'Shoulders', 'Back', 'Arms', 'Legs', 'Posterior chain', 'Conditioning'];

const norm = (s) => String(s ?? '').trim().toLowerCase();
const byName = (a, b) => a.name.localeCompare(b.name);

export const groupOf = (e) => String(e.muscleGroup ?? '').trim() || 'Other';

// Known groups in MUSCLE_ORDER, then unknown groups alphabetically, then "Other".
function groupRank(g) {
  const i = MUSCLE_ORDER.indexOf(g);
  if (i !== -1) return i;
  return g === 'Other' ? 2000 : 1000;
}

export function compareGroups(a, b) {
  return groupRank(a) - groupRank(b) || a.localeCompare(b);
}

export function groupsPresent(exercises) {
  return [...new Set(exercises.map(groupOf))].sort(compareGroups);
}

// Substring match on name, muscle group or equipment; optional exact group; sorted by name.
export function filterExercises(exercises, { q = '', group = null } = {}) {
  const needle = norm(q);
  return exercises
    .filter((e) => (!group || groupOf(e) === group)
      && (!needle || [e.name, e.muscleGroup, e.equipment].join(' ').toLowerCase().includes(needle)))
    .sort(byName);
}

export function groupByMuscle(exercises) {
  const groups = new Map();
  for (const e of exercises) {
    const g = groupOf(e);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(e);
  }
  return [...groups.keys()].sort(compareGroups).map((group) => ({ group, items: groups.get(group).sort(byName) }));
}

export function nameExists(exercises, name) {
  const n = norm(name);
  return !!n && exercises.some((e) => norm(e.name) === n);
}

// One display rule for every screen: hidden exercises keep their name, flagged; a missing one
// (deleted from the store) shows a placeholder.
export function exerciseLabel(ex) {
  if (!ex) return '(removed exercise)';
  return ex.hidden ? `${ex.name} (hidden)` : ex.name;
}
