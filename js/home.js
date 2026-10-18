import { getAll, remove } from './storage.js';
import { el, clear } from './ui.js';
import { showScreen } from './app.js';
import { ACTIVE_SESSION } from './keys.js';
import { createWorkout } from './session.js';
import { homeModel, countLoggedSets } from './sessionLogic.js';
import { formatStartedAgo, formatShortDate } from './format.js';

let starting = false; // ignores a double-tap on Start

// Home tab, the screen the app opens on. Nothing resumes by itself: an unfinished workout is a
// card with Resume and Discard, and the start buttons only appear when there is none.
export async function renderHome(root) {
  clear(root);
  const [routines, sessions] = await Promise.all([getAll('routines'), getAll('sessions')]);
  const m = homeModel({ routines, sessions, activeId: localStorage.getItem(ACTIVE_SESSION), nowIso: new Date().toISOString() });

  if (m.active) {
    const { session, setCount, ageSec } = m.active;
    root.append(el('div', { class: 'card upnext stack' }, [
      el('div', { class: 'muted small', text: 'Workout in progress' }),
      el('h2', { text: session.name }),
      el('div', { class: 'muted', text: `Started ${formatStartedAgo(ageSec)} · ${setCount} set${setCount === 1 ? '' : 's'} logged` }),
      el('button', { class: 'primary btn-block', text: 'Resume', 'aria-label': `Resume ${session.name}`, onclick: () => showScreen('log') }),
      el('button', { class: 'btn-block', text: 'Discard', 'aria-label': `Discard ${session.name}`, onclick: () => discard(root, session, setCount) }),
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

async function discard(root, session, setCount) {
  if (setCount > 0 && !confirm(`Discard this workout? ${setCount} logged set${setCount === 1 ? '' : 's'} will be deleted.`)) return;
  await remove('sessions', session.id);
  localStorage.removeItem(ACTIVE_SESSION);
  await renderHome(root);
}
