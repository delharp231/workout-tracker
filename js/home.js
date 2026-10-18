import { getAll, put, getSettings } from './storage.js';
import { el, clear } from './ui.js';
import { showScreen } from './app.js';
import { ACTIVE_SESSION } from './keys.js';
import { createWorkout, backupNudge, discardActive } from './session.js';
import { homeModel, weighInSummary } from './sessionLogic.js';
import { formatStartedAgo, formatShortDate, numberOrNull } from './format.js';

let starting = false; // ignores a double-tap on Start

// Home tab, the screen the app opens on. Nothing resumes by itself: an unfinished workout is a
// card with Resume and Discard, and the start buttons only appear when there is none.
export async function renderHome(root) {
  clear(root);
  const [routines, sessions, bodyweight, settings] = await Promise.all([getAll('routines'), getAll('sessions'), getAll('bodyweight'), getSettings()]);
  const m = homeModel({
    routines, sessions, activeId: localStorage.getItem(ACTIVE_SESSION), nowIso: new Date().toISOString(), perWeek: settings.sessionsPerWeek,
  });
  const nudge = backupNudge(sessions);
  if (nudge) root.append(nudge);

  if (m.active) {
    const { session, setCount, ageSec } = m.active;
    root.append(el('div', { class: 'card upnext stack' }, [
      el('div', { class: 'muted small', text: session.reopenedFrom ? 'Editing a past workout' : 'Workout in progress' }),
      el('h2', { text: session.name }),
      el('div', { class: 'muted', text: `Started ${formatStartedAgo(ageSec)} · ${setCount} set${setCount === 1 ? '' : 's'} logged` }),
      el('button', { class: 'primary btn-block', text: 'Resume', 'aria-label': `Resume ${session.name}`, onclick: () => showScreen('log') }),
      el('button', { class: 'btn-block', text: 'Discard', 'aria-label': `Discard ${session.name}`, onclick: () => discard(root, session) }),
    ]));
  } else if (m.next) {
    const count = m.next.items.length;
    root.append(el('div', { class: 'card upnext stack' }, [
      el('div', { class: 'muted small', text: 'Up next' }),
      el('h2', { text: m.next.name }),
      el('div', { class: 'muted', text: `${count} exercise${count === 1 ? '' : 's'}` }),
      el('button', { class: 'primary btn-block', text: 'Start', 'aria-label': `Start ${m.next.name}`, onclick: () => start(m.next) }),
    ]));
    for (const r of m.rest) root.append(el('button', { class: 'btn-block', text: `Start ${r.name}`, onclick: () => start(r) }));
  } else {
    root.append(el('div', { class: 'card stack' }, [
      el('p', { class: 'muted', text: 'No routines yet.' }),
      el('button', { text: 'Build one in Routines ›', onclick: () => showScreen('routines') }),
    ]));
  }

  root.append(el('p', { class: 'muted', text: `This week: ${m.week.done} of ${m.week.target} workouts` }));
  root.append(weighInCard(root, bodyweight, settings.units === 'kg' ? 'kg' : 'lb'));
  if (m.last) root.append(el('p', { class: 'muted small', text: `Last workout: ${m.last.name}, ${formatShortDate(m.last.date)}` }));
}

async function start(routine) {
  if (starting) return;
  starting = true;
  try {
    await createWorkout(routine);
    showScreen('log');
  } finally {
    starting = false;
  }
}

async function discard(root, session) {
  if (await discardActive(session)) await renderHome(root);
}

const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// One weigh-in a day (the record is keyed by date, so saving again today replaces it). Shows the
// latest weight and the 7-day average against the 7 days before, since a single weigh-in is noisy.
function weighInCard(root, entries, unit) {
  const sum = weighInSummary(entries);
  const input = el('input', { type: 'number', inputmode: 'decimal', step: 'any', min: '0', placeholder: `Today's weight (${unit})`, 'aria-label': `Today's weight in ${unit}` });
  const error = el('p', { class: 'error', role: 'alert' });
  const save = async () => {
    const w = numberOrNull(input.value);
    if (w === null || w <= 0 || w > 1500) { error.textContent = 'Enter a weight.'; return; }
    await put('bodyweight', { date: localDate(), weight: w, unit, loggedAt: new Date().toISOString() });
    await renderHome(root);
  };
  const lines = [];
  if (sum) {
    lines.push(el('div', { text: `Latest ${sum.latest.weight} ${unit} (${formatShortDate(`${sum.latest.date}T12:00:00`)})` }));
    if (sum.avg7 !== null) {
      const diff = sum.prevAvg7 === null ? '' : ` · ${sum.avg7 - sum.prevAvg7 > 0 ? '+' : ''}${Math.round((sum.avg7 - sum.prevAvg7) * 10) / 10} vs the week before`;
      lines.push(el('div', { class: 'muted small', text: `7-day average ${sum.avg7} ${unit}${diff}` }));
    }
  }
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'card-title', text: 'Weigh-in' }),
    ...lines,
    el('div', { class: 'row' }, [input, el('button', { class: 'primary', text: 'Save', onclick: save })]),
    error,
  ]);
}
