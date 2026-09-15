import { getAll, remove } from './storage.js';
import { el, clear } from './ui.js';

export async function renderHistory(root) {
  const [sessions, exercises] = await Promise.all([getAll('sessions'), getAll('exercises')]);
  sessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  renderList(root, sessions, exercises);
}

// Shared "storage changed, reload the whole screen" step, matching Library/Routines/Log.
async function refresh(root) {
  clear(root);
  await renderHistory(root);
}

// ---------- formatting helpers ----------

function formatDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso ?? '') : d.toLocaleString();
}

function formatDuration(sec) {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return '';
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// true for any present value, including 0 — the falsy-but-valid numbers
// (weight/reps/rpe/duration/distance of exactly 0) must still display.
function hasValue(v) {
  return v !== null && v !== undefined;
}

// Placeholder for a genuinely-missing numeric field inside a composed string.
// (Template-literal interpolation stringifies null/undefined to "null"/
// "undefined" — unlike el()'s `text` -> textContent path, which the DOM
// quietly turns into empty content — so this needs its own guard. A real 0
// passes straight through, since 0 is valid logged data, not "missing".)
function fmtNum(v) {
  return hasValue(v) ? v : '—';
}

// ---------- List view ----------

function renderList(root, sessions, exercises) {
  clear(root);
  const list = el('div');
  for (const session of sessions) list.append(sessionCard(root, session, exercises));
  if (!sessions.length) {
    list.append(el('p', { class: 'muted', text: 'No sessions yet — finish a workout in Log to see it here.' }));
  }
  root.append(list);
}

function sessionCard(root, session, exercises) {
  return el('div', {
    class: 'card',
    style: 'cursor:pointer',
    onclick: () => renderDetail(root, session, exercises),
  }, [
    el('div', { text: formatDate(session.date) }),
    el('div', { text: session.name }),
    el('div', { class: 'muted', text: summarizeSession(session) }),
  ]);
}

// "3 exercises · 5 sets" for a strength session (exact brief example); cardio
// entries count toward "N exercises" and additionally contribute their own
// duration/distance note so a cardio or mixed session still reads sensibly
// on one line.
function summarizeSession(session) {
  const entries = session.entries || [];
  if (!entries.length) return 'No exercises logged';

  const exCount = entries.length;
  const parts = [`${exCount} exercise${exCount === 1 ? '' : 's'}`];

  const setCount = entries
    .filter((e) => e.type === 'strength')
    .reduce((sum, e) => sum + ((e.sets && e.sets.length) || 0), 0);
  if (setCount > 0) parts.push(`${setCount} set${setCount === 1 ? '' : 's'}`);

  const cardioEntries = entries.filter((e) => e.type === 'cardio');
  if (cardioEntries.length) parts.push(cardioEntries.map(cardioSummaryLabel).join(', '));

  return parts.join(' · ');
}

function cardioSummaryLabel(entry) {
  const bits = [];
  if (hasValue(entry.durationSec)) bits.push(formatDuration(entry.durationSec));
  if (hasValue(entry.distance)) bits.push(`${entry.distance}${entry.distanceUnit ? ' ' + entry.distanceUnit : ''}`);
  return bits.length ? bits.join(' / ') : 'cardio';
}

// ---------- Detail view (read-only) ----------

function renderDetail(root, session, exercises) {
  clear(root);
  const exIndex = new Map(exercises.map((e) => [e.id, e]));
  // Same resolution convention as routines.js/session.js: a hidden exercise
  // still shows its real name (flagged hidden); only a truly missing/removed
  // exercise falls back to a placeholder.
  const exerciseLabel = (exerciseId) => {
    const e = exIndex.get(exerciseId);
    if (!e) return '(removed exercise)';
    return e.hidden ? `${e.name} (hidden)` : e.name;
  };

  const entries = session.entries || [];
  const entriesList = el('div');
  for (const entry of entries) {
    entriesList.append(entry.type === 'cardio' ? cardioDetailCard(entry, exerciseLabel) : strengthDetailCard(entry, exerciseLabel));
  }
  if (!entries.length) entriesList.append(el('p', { class: 'muted', text: 'No exercises logged.' }));

  async function deleteSession() {
    const ok = confirm(`Delete "${session.name}" (${formatDate(session.date)})? This can't be undone.`);
    if (!ok) return;
    await remove('sessions', session.id);
    await refresh(root);
  }

  root.append(
    el('div', { class: 'row' }, [el('button', { text: '← Back', onclick: () => refresh(root) })]),
    el('h2', { text: session.name }),
    el('div', { class: 'muted', text: formatDate(session.date) }),
    ...(session.notes ? [el('p', { text: session.notes })] : []),
    entriesList,
    el('div', { class: 'row' }, [el('button', { text: 'Delete', onclick: deleteSession })]),
  );
}

function strengthDetailCard(entry, exerciseLabel) {
  const sets = entry.sets || [];
  const setsBody = el('div');
  sets.forEach((set, i) => {
    const bits = [`${fmtNum(set.weight)} × ${fmtNum(set.reps)}`];
    if (hasValue(set.rpe)) bits.push(`RPE ${set.rpe}`);
    setsBody.append(el('div', { text: `#${i + 1}: ${bits.join(' · ')}` }));
    if (set.note) setsBody.append(el('div', { class: 'muted', text: set.note }));
  });
  if (!sets.length) setsBody.append(el('p', { class: 'muted', text: 'No sets logged.' }));
  return el('div', { class: 'card' }, [
    el('div', { text: exerciseLabel(entry.exerciseId) }),
    setsBody,
  ]);
}

function cardioDetailCard(entry, exerciseLabel) {
  const bits = [];
  if (hasValue(entry.durationSec)) bits.push(`Duration ${formatDuration(entry.durationSec)}`);
  if (hasValue(entry.distance)) bits.push(`Distance ${entry.distance}${entry.distanceUnit ? ' ' + entry.distanceUnit : ''}`);
  const children = [
    el('div', { text: exerciseLabel(entry.exerciseId) }),
    el('div', { text: bits.length ? bits.join(' · ') : 'No duration/distance logged.' }),
  ];
  if (entry.note) children.push(el('div', { class: 'muted', text: entry.note }));
  return el('div', { class: 'card' }, children);
}
