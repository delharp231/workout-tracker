import { getAll, remove } from './storage.js';
import { el, clear } from './ui.js';
import { ACTIVE_SESSION } from './keys.js';
import { formatMinutes, formatShortDate, formatTarget, formatSetLine } from './format.js';
import { exerciseLabel } from './catalog.js';
import { countLoggedSets } from './sessionLogic.js';
import { sessionDurationSec } from './exporter.js';

// History tab. `arg.openId` (from Finish) opens that workout's detail directly.
// The workout in progress is left out; it lives on the Log tab until it's finished.
export async function renderHistory(root, arg) {
  const [sessions, exercises] = await Promise.all([getAll('sessions'), getAll('exercises')]);
  const activeId = localStorage.getItem(ACTIVE_SESSION);
  const past = sessions.filter((s) => s.id !== activeId).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const exIndex = new Map(exercises.map((e) => [e.id, e]));
  const open = arg && arg.openId ? past.find((s) => s.id === arg.openId) : null;
  if (open) renderDetail(root, open, exIndex);
  else renderList(root, past, exIndex);
}

async function refresh(root) {
  clear(root);
  await renderHistory(root);
}

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? '');
  return `${formatShortDate(iso)} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

// "14 sets · 42 min · cardio 8 min"
function summarize(s) {
  const parts = [];
  const n = countLoggedSets(s);
  if (n) parts.push(`${n} set${n === 1 ? '' : 's'}`);
  const dur = sessionDurationSec(s);
  if (dur !== null) parts.push(formatMinutes(dur));
  for (const c of (s.entries || []).filter((e) => e.type === 'cardio' && (e.done || e.durationSec != null || e.distance != null))) {
    parts.push(c.durationSec != null ? `cardio ${formatMinutes(c.durationSec)}` : 'cardio ✓');
  }
  return parts.join(' · ') || 'Nothing logged';
}

function renderList(root, sessions, exIndex) {
  clear(root);
  if (!sessions.length) {
    root.append(el('p', { class: 'muted', text: 'No workouts yet — finish one in Log to see it here.' }));
    return;
  }
  for (const s of sessions) {
    // Spans, not divs: a <button> may only contain phrasing content. CSS makes them block-level.
    root.append(el('button', { class: 'card history-card', onclick: () => renderDetail(root, s, exIndex) }, [
      el('span', { class: 'card-title', text: s.name }),
      el('span', { class: 'muted small', text: formatWhen(s.date) }),
      el('span', { class: 'muted', text: summarize(s) }),
    ]));
  }
}

function renderDetail(root, s, exIndex) {
  clear(root);
  const dur = sessionDurationSec(s);
  const entries = s.entries || [];
  async function deleteSession() {
    if (!confirm(`Delete "${s.name}" (${formatWhen(s.date)})? This can't be undone.`)) return;
    await remove('sessions', s.id);
    await refresh(root);
  }
  root.append(
    el('button', { class: 'link', text: '‹ All workouts', onclick: () => refresh(root) }),
    el('h2', { text: s.name }),
    el('div', { class: 'muted', text: dur !== null ? `${formatWhen(s.date)} · ${formatMinutes(dur)}` : formatWhen(s.date) }),
  );
  if (s.notes) root.append(el('p', { text: s.notes }));
  for (const e of entries) root.append(e.type === 'cardio' ? cardioCard(e, exIndex) : strengthCard(e, exIndex));
  if (!entries.length) root.append(el('p', { class: 'muted', text: 'Nothing logged.' }));
  root.append(el('button', { text: 'Delete workout', onclick: deleteSession }));
}

function strengthCard(e, exIndex) {
  const target = formatTarget(e.target);
  const sets = e.sets || [];
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'card-title', text: exerciseLabel(exIndex.get(e.exerciseId)) }),
    target ? el('div', { class: 'muted small', text: `Target ${target}` }) : null,
    ...(sets.length
      ? sets.flatMap((set, i) => [
        el('div', { text: `${i + 1} · ${formatSetLine(set)}` }),
        set.note ? el('div', { class: 'muted small', text: set.note }) : null,
      ])
      : [el('div', { class: 'muted', text: 'No sets logged.' })]),
  ]);
}

function cardioCard(e, exIndex) {
  const bits = [e.done ? 'Done' : 'Not done'];
  if (e.durationSec != null) bits.push(formatMinutes(e.durationSec));
  if (e.distance != null) bits.push(`${e.distance} ${e.distanceUnit || ''}`.trim());
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'card-title', text: exerciseLabel(exIndex.get(e.exerciseId)) }),
    el('div', { text: bits.join(' · ') }),
    e.note ? el('div', { class: 'muted small', text: e.note }) : null,
  ]);
}
