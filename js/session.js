import { getAll, get, put, remove, getSettings } from './storage.js';
import { newSession, newStrengthEntry, newCardioEntry, targetFromItem, compareRoutines } from './schema.js';
import { el, clear, hideToast } from './ui.js';
import { showScreen } from './app.js';
import { ACTIVE_SESSION, LAST_BACKUP } from './keys.js';
import { nextRoutine } from './progression.js';
import { countLoggedSets, entryProgress, finishSummary, finishedAtFor, applyFinish, STALE_SEC } from './sessionLogic.js';
import { formatDuration, formatMinutes, formatAgo } from './format.js';
import { exerciseLabel } from './catalog.js';
import { openPicker } from './picker.js';
import { renderFocus } from './focus.js';
import * as wakeLock from './wakelock.js';

const BACKUP_NUDGE_DAYS = 7;
const VIEWS = { focus: renderFocus, overview: renderOverview, finish: renderFinish, add: renderAdd, swap: renderSwap };

let active = null;      // the live workout context while the Log tab shows a workout
let clockTimer = null;
let starting = false;   // ignores a double-tap on Start

// Log tab entry point: the running workout if there is one, else the start screen.
// Always returns leaveWorkout, so switching tabs stops the clock, the wake lock and any toast.
export async function renderLog(root) {
  const id = localStorage.getItem(ACTIVE_SESSION);
  if (id) {
    const session = await get('sessions', id);
    if (session) {
      await enterWorkout(root, session, 'focus');
      return leaveWorkout;
    }
    // Stale pointer (discarded, or a restore replaced it): drop it, show the start screen.
    localStorage.removeItem(ACTIVE_SESSION);
  }
  await renderStart(root);
  return leaveWorkout;
}

// Creates a workout (optionally from a routine), persists it at once, and marks it active.
// Each entry carries a snapshot of its routine target. Also used by the Routines screen.
export async function createWorkout(routine) {
  const exercises = await getAll('exercises');
  const exIndex = new Map(exercises.map((e) => [e.id, e]));
  const session = newSession({ name: routine ? routine.name : undefined, routineId: routine ? routine.id : null });
  for (const item of routine ? routine.items : []) {
    const ex = exIndex.get(item.exerciseId);
    session.entries.push(ex && ex.type === 'cardio'
      ? newCardioEntry(item.exerciseId, targetFromItem(item, 'cardio'))
      : newStrengthEntry(item.exerciseId, targetFromItem(item)));
  }
  await put('sessions', session);
  localStorage.setItem(ACTIVE_SESSION, session.id);
  return session;
}

// ---------- start screen (spec §7.1) ----------

async function renderStart(root) {
  clear(root);
  const [routines, sessions] = await Promise.all([getAll('routines'), getAll('sessions')]);
  routines.sort(compareRoutines);
  const nudge = backupNudge(sessions);
  if (nudge) root.append(nudge);

  const next = nextRoutine(routines, sessions);
  if (next) {
    const count = next.items.length;
    root.append(el('div', { class: 'card upnext stack' }, [
      el('div', { class: 'muted small', text: 'Up next' }),
      el('h2', { text: next.name }),
      el('div', { class: 'muted', text: `${count} exercise${count === 1 ? '' : 's'}` }),
      el('button', { class: 'primary btn-block', text: 'Start', 'aria-label': `Start ${next.name}`, onclick: () => begin(root, next) }),
    ]));
    for (const r of routines) {
      if (r.id !== next.id) root.append(el('button', { class: 'btn-block', text: `Start ${r.name}`, onclick: () => begin(root, r) }));
    }
  } else {
    root.append(el('div', { class: 'card stack' }, [
      el('p', { class: 'muted', text: 'No routines yet.' }),
      el('button', { text: 'Build one in Routines ›', onclick: () => showScreen('routines') }),
    ]));
  }
  root.append(el('button', { class: 'btn-block', text: 'Freestyle workout', onclick: () => begin(root, null) }));
}

function backupNudge(sessions) {
  if (!sessions.length) return null;
  const last = localStorage.getItem(LAST_BACKUP);
  const ageDays = last ? (Date.now() - Date.parse(last)) / 86_400_000 : Infinity;
  if (ageDays <= BACKUP_NUDGE_DAYS) return null;
  const label = Number.isFinite(ageDays) ? `Last backup ${Math.floor(ageDays)} days ago` : 'No backup yet';
  return el('button', { class: 'nudge', text: `${label} · Back up ›`, onclick: () => showScreen('backup') });
}

async function begin(root, routine) {
  if (starting) return;
  starting = true;
  try {
    const session = await createWorkout(routine);
    await enterWorkout(root, session, session.entries.length ? 'focus' : 'add');
  } finally {
    starting = false;
  }
}

// ---------- the live workout ----------

function stopEffects() {
  clearInterval(clockTimer);
  clockTimer = null;
  wakeLock.release();
}

async function enterWorkout(root, session, view) {
  if (active) active.alive = false;
  stopEffects();
  const [exercises, sessions, settings] = await Promise.all([getAll('exercises'), getAll('sessions'), getSettings()]);
  const ctx = {
    root, session, exercises, settings,
    exIndex: new Map(exercises.map((e) => [e.id, e])),
    history: sessions.filter((s) => s.id !== session.id),
    alive: true, view: null, fs: {}, menuOpen: false, useLastSetTime: undefined,
    saveFailed: false, busy: false,
    // The single persistence chokepoint: every change to the workout is saved through here.
    // Resolves true/false (never rejects) so callers can gate success-only feedback (vibration)
    // and know whether to keep the save-error banner up.
    save: () => put('sessions', session).then(
      () => { ctx.saveFailed = false; root.querySelector('.save-error')?.remove(); return true; },
      () => { ctx.saveFailed = true; showSaveError(root); return false; }),
    // Re-shows the banner after a re-render clears it, as long as the last save is still failed.
    paintSaveError: () => { if (ctx.saveFailed) showSaveError(root); },
    go: (v) => { if (!ctx.alive) return; ctx.view = v; VIEWS[v](ctx); },
    tick: () => tickClock(session),
  };
  active = ctx;
  clockTimer = setInterval(() => tickClock(session), 1000);
  if (settings.keepScreenOn) wakeLock.acquire();
  ctx.go(view);
}

function leaveWorkout() {
  if (active) active.alive = false;
  active = null;
  stopEffects();
  hideToast();
}

function tickClock(session) {
  const text = formatDuration((Date.now() - Date.parse(session.date)) / 1000);
  document.querySelectorAll('[data-clock]').forEach((n) => { n.textContent = text; });
}

function showSaveError(root) {
  if (root.querySelector('.save-error')) return;
  root.prepend(el('div', { class: 'save-error', role: 'alert', text: "⚠ Couldn't save your last change — check device storage." }));
}

// ---------- overview (spec §7.3) ----------

function renderOverview(ctx) {
  const { root, session } = ctx;
  clear(root);
  root.append(el('div', { class: 'focus-head' }, [
    el('h2', { text: session.name }),
    el('span', { class: 'clock muted', 'data-clock': '', 'aria-label': 'Workout time' }),
    el('button', {
      class: 'icon-btn', 'aria-label': 'Workout options', 'aria-expanded': String(!!ctx.menuOpen), text: '…',
      onclick: () => { ctx.menuOpen = !ctx.menuOpen; renderOverview(ctx); },
    }),
  ]));
  if (ctx.menuOpen) {
    root.append(el('div', { class: 'card menu' }, [
      el('button', { text: 'Discard workout', onclick: () => discardWorkout(ctx) }),
      el('button', { text: 'Close', onclick: () => { ctx.menuOpen = false; renderOverview(ctx); } }),
    ]));
  }
  if (session.entries.length) {
    root.append(el('button', { class: 'link', text: '‹ Back to exercise', onclick: () => ctx.go('focus') }));
  } else {
    root.append(el('p', { class: 'muted', text: 'No exercises yet.' }));
  }
  root.append(el('div', { class: 'stack' }, session.entries.map((entry, i) => {
    const p = entryProgress(entry);
    const name = exerciseLabel(ctx.exIndex.get(entry.exerciseId));
    return el('button', {
      class: `list-row${p.done ? ' done' : ''}`, 'aria-label': `${name}, ${p.spoken}`,
      onclick: () => { session.cursor = i; ctx.save(); ctx.go('focus'); },
    }, [el('span', { text: name }), el('span', { class: p.done ? 'ok' : 'muted', text: p.label })]);
  })));
  root.append(
    el('button', { text: '+ Add exercise', onclick: () => ctx.go('add') }),
    el('button', { class: 'primary btn-block', text: 'Finish workout', onclick: () => { ctx.useLastSetTime = undefined; ctx.go('finish'); } }),
  );
  ctx.tick();
  ctx.paintSaveError();
}

// ---------- finish and discard (spec §7.4) ----------

function renderFinish(ctx) {
  const { root, session } = ctx;
  clear(root);
  const nowIso = new Date().toISOString();
  const sum = finishSummary(session, ctx.exIndex, nowIso);
  if (sum.nothingLogged) {
    root.append(
      el('h2', { text: 'Nothing logged yet' }),
      el('p', { class: 'muted', text: 'Log a set or mark cardio done first, or discard this workout.' }),
      el('div', { class: 'row' }, [
        el('button', { class: 'primary grow', text: 'Keep going', onclick: () => ctx.go('overview') }),
        el('button', { class: 'grow', text: 'Discard workout', onclick: () => discardWorkout(ctx) }),
      ]),
    );
    ctx.paintSaveError();
    return;
  }
  const stale = sum.staleSec !== null && sum.staleSec > STALE_SEC;
  if (ctx.useLastSetTime === undefined) ctx.useLastSetTime = stale;
  const useLast = stale && ctx.useLastSetTime;
  const finishedAt = finishedAtFor(session, { nowIso, useLastSetTime: useLast });
  const durationSec = (Date.parse(finishedAt) - Date.parse(session.date)) / 1000;
  root.append(
    el('h2', { text: `Finish ${session.name}?` }),
    el('p', { class: 'summary', text: `${sum.setCount} set${sum.setCount === 1 ? '' : 's'} · ${formatMinutes(durationSec)}` }),
  );
  if (sum.removeNames.length) {
    root.append(el('p', { class: 'muted', text: `Not logged (will be removed): ${sum.removeNames.join(', ')}` }));
  }
  if (stale) {
    const cb = el('input', { type: 'checkbox', id: 'finish-use-last-set' });
    cb.checked = useLast;
    cb.addEventListener('change', () => { ctx.useLastSetTime = cb.checked; renderFinish(ctx); });
    root.append(el('label', { class: 'row', for: 'finish-use-last-set' }, [
      cb, el('span', { text: `Last set was ${formatAgo(sum.staleSec)} ago. Use that as the finish time?` }),
    ]));
  }
  root.append(el('div', { class: 'row' }, [
    el('button', { class: 'primary grow', text: 'Finish', onclick: () => finishWorkout(ctx, useLast) }),
    el('button', { class: 'grow', text: 'Keep going', onclick: () => ctx.go('overview') }),
  ]));
  ctx.paintSaveError();
}

async function finishWorkout(ctx, useLastSetTime) {
  const done = applyFinish(ctx.session, { nowIso: new Date().toISOString(), useLastSetTime });
  try {
    await put('sessions', done);
  } catch {
    ctx.saveFailed = true;
    showSaveError(ctx.root);
    return;
  }
  localStorage.removeItem(ACTIVE_SESSION);
  showScreen('history', { openId: done.id });
}

async function discardWorkout(ctx) {
  const n = countLoggedSets(ctx.session);
  if (n > 0 && !confirm(`Discard this workout? ${n} logged set${n === 1 ? '' : 's'} will be deleted.`)) return;
  await remove('sessions', ctx.session.id);
  localStorage.removeItem(ACTIVE_SESSION);
  const { root } = ctx;
  leaveWorkout();
  await renderStart(root);
}

// ---------- add and swap (spec §7.2 menu, §7.3) ----------

function renderAdd(ctx) {
  openPicker(ctx.root, {
    title: 'Add exercise', exercises: ctx.exercises,
    onCancel: () => ctx.go('overview'),
    onPick: async (ex) => {
      ctx.exIndex.set(ex.id, ex);
      ctx.session.entries.push(ex.type === 'cardio' ? newCardioEntry(ex.id) : newStrengthEntry(ex.id));
      ctx.session.cursor = ctx.session.entries.length - 1;
      await ctx.save();
      ctx.go('focus');
    },
  });
}

function renderSwap(ctx) {
  const { session } = ctx;
  const i = session.cursor;
  const entry = session.entries[i];
  openPicker(ctx.root, {
    title: 'Swap exercise', type: entry.type, exercises: ctx.exercises,
    onCancel: () => ctx.go('focus'),
    onPick: async (ex) => {
      ctx.exIndex.set(ex.id, ex);
      if (ex.id !== entry.exerciseId) {
        const n = entry.type === 'strength' ? entry.sets.length : 0;
        if (n > 0) {
          const oldName = exerciseLabel(ctx.exIndex.get(entry.exerciseId));
          if (!confirm(`Keep the ${n} logged set${n === 1 ? '' : 's'} under ${oldName} and continue with ${ex.name}?`)) {
            ctx.go('focus');
            return;
          }
          session.entries.splice(i + 1, 0, newStrengthEntry(ex.id, entry.target));
          session.cursor = i + 1;
        } else {
          entry.exerciseId = ex.id;
          ctx.fs = {}; // a different exercise: fresh pre-fill and "Last time"
        }
        await ctx.save();
      }
      ctx.go('focus');
    },
  });
}
