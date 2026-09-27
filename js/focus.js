import { el, clear, field, showToast } from './ui.js';
import { newSet, clampRir } from './schema.js';
import { numberOrNull, intOrNull, formatTarget, formatSets, formatSetLine, formatShortDate, formatRir } from './format.js';
import { lastPerformance, prefillSet } from './progression.js';
import { exerciseLabel } from './catalog.js';

// The one-exercise-at-a-time logging view (spec §7.2 strength, §7.2a cardio).
// ctx comes from session.js; ctx.fs holds this view's transient state for the current entry
// (draft values, which set is being edited, open menus) and resets when the entry changes.
export function renderFocus(ctx) {
  const { root, session } = ctx;
  const count = session.entries.length;
  if (!count) { ctx.go('overview'); return; }
  const i = Math.min(Math.max(0, session.cursor ?? 0), count - 1);
  session.cursor = i;
  const entry = session.entries[i];
  if (ctx.fs.entry !== entry) ctx.fs = { entry };
  const ex = ctx.exIndex.get(entry.exerciseId);

  clear(root);
  root.append(header(ctx, i, count), el('h2', { class: 'ex-name', text: exerciseLabel(ex) }));
  if (ctx.fs.menuOpen) root.append(menu(ctx, i, ex));
  if (entry.type === 'cardio') renderCardio(ctx, entry, i);
  else renderStrength(ctx, entry, i, ex);
  ctx.tick();
  ctx.paintSaveError();
}

function moveTo(ctx, index) {
  ctx.session.cursor = index;
  ctx.save();
  renderFocus(ctx);
}

function header(ctx, i, count) {
  const spacer = () => el('span', { class: 'icon-spacer', 'aria-hidden': 'true' });
  return el('div', { class: 'focus-head' }, [
    i > 0 ? el('button', { class: 'icon-btn', 'aria-label': 'Previous exercise', text: '‹', onclick: () => moveTo(ctx, i - 1) }) : spacer(),
    el('span', { class: 'pos', text: `${i + 1} of ${count}` }),
    i < count - 1 ? el('button', { class: 'icon-btn', 'aria-label': 'Next exercise', text: '›', onclick: () => moveTo(ctx, i + 1) }) : spacer(),
    el('span', { class: 'clock muted', 'data-clock': '', 'aria-label': 'Workout time' }),
    el('button', { class: 'icon-btn', 'aria-label': 'Workout overview', text: '≡', onclick: () => ctx.go('overview') }),
    el('button', {
      class: 'icon-btn', 'aria-label': 'Exercise options', 'aria-expanded': String(!!ctx.fs.menuOpen), text: '…',
      onclick: () => { ctx.fs.menuOpen = !ctx.fs.menuOpen; renderFocus(ctx); },
    }),
  ]);
}

function menu(ctx, i, ex) {
  return el('div', { class: 'card menu' }, [
    el('button', { text: 'Swap exercise', onclick: () => { ctx.fs.menuOpen = false; ctx.go('swap'); } }),
    el('button', { text: 'Remove exercise', onclick: () => removeEntry(ctx, i, ex) }),
    el('button', { text: 'Close', onclick: () => { ctx.fs.menuOpen = false; renderFocus(ctx); } }),
  ]);
}

async function removeEntry(ctx, i, ex) {
  if (ctx.busy) return;
  ctx.busy = true;
  try {
    const { session } = ctx;
    if (i < 0 || i >= session.entries.length) return;
    const [removed] = session.entries.splice(i, 1);
    session.cursor = Math.max(0, Math.min(i, session.entries.length - 1));
    await ctx.save();
    ctx.go(session.entries.length ? 'focus' : 'overview');
    showToast(`Removed ${exerciseLabel(ex)}`, {
      actionLabel: 'Undo',
      onAction: async () => {
        if (!ctx.alive) return;
        if (!removed) return;
        session.entries.splice(i, 0, removed);
        session.cursor = i;
        await ctx.save();
        ctx.go('focus');
      },
    });
  } finally {
    ctx.busy = false;
  }
}

// "Next: <exercise> ›", or "Review & finish ›" on the last entry.
function nextButton(ctx, i) {
  const { session } = ctx;
  if (i < session.entries.length - 1) {
    const nextEx = ctx.exIndex.get(session.entries[i + 1].exerciseId);
    return el('button', { class: 'primary btn-block', text: `Next: ${exerciseLabel(nextEx)} ›`, onclick: () => moveTo(ctx, i + 1) });
  }
  return el('button', { class: 'primary btn-block', text: 'Review & finish ›', onclick: () => ctx.go('overview') });
}

// ---------- strength ----------

function renderStrength(ctx, entry, i, ex) {
  const { root, session } = ctx;
  const fs = ctx.fs;
  const target = formatTarget(entry.target);
  if (target) root.append(el('p', { class: 'target', text: `Target ${target}` }));
  const last = lastPerformance(ctx.history, entry.exerciseId, { excludeId: session.id });
  root.append(el('p', {
    class: 'muted',
    text: last ? `Last time ${formatShortDate(last.date)} · ${formatSets(last.sets)}` : 'First time: pick a starting weight',
  }));

  if (entry.sets.length) {
    root.append(el('div', { class: 'stack' }, entry.sets.map((s, k) => el('button', {
      class: `set-line${fs.editIdx === k ? ' editing' : ''}`,
      'aria-label': `Edit set ${k + 1}: ${formatSetLine(s)}`,
      onclick: () => {
        Object.assign(fs, {
          editIdx: k, error: null, noteOpen: !!s.note,
          draft: { weight: s.weight ?? null, reps: s.reps ?? null, rir: s.rir ?? null, note: s.note || '' },
        });
        renderFocus(ctx);
      },
    }, [el('span', { text: `Set ${k + 1} · ${formatSetLine(s)}` }), el('span', { class: 'ok', 'aria-hidden': 'true', text: '✓' })]))));
  }

  if (!fs.draft) {
    const p = prefillSet({ loggedThisSession: entry.sets, lastSets: last ? last.sets : [], target: entry.target });
    fs.draft = { ...p, note: '' };
  }
  const d = fs.draft;
  const step = ex?.weightStep ?? ctx.settings.defaultWeightStep ?? 5;
  root.append(
    stepper({ label: 'Weight (lb)', noun: 'weight', unit: 'lb', value: d.weight, step, decimals: true, onChange: (v) => { d.weight = v; } }),
    stepper({ label: 'Reps', noun: 'reps', value: d.reps, step: 1, decimals: false, onChange: (v) => { d.reps = v; } }),
    rirChips(d.rir, (v) => { d.rir = v; }),
  );

  if (fs.noteOpen) {
    root.append(el('input', {
      type: 'text', placeholder: 'Note for this set', 'aria-label': 'Note for this set', value: d.note,
      oninput: (ev) => { d.note = ev.target.value; },
    }));
  } else {
    root.append(el('button', {
      class: 'link', text: '+ Add note',
      onclick: () => {
        fs.noteOpen = true;
        renderFocus(ctx);
        root.querySelector('input[aria-label="Note for this set"]')?.focus();
      },
    }));
  }
  if (fs.error) root.append(el('p', { class: 'error', role: 'alert', text: fs.error }));
  root.append(...actions(ctx, entry, i));
}

function actions(ctx, entry, i) {
  const fs = ctx.fs;
  if (fs.editIdx !== undefined && fs.editIdx !== null) {
    const k = fs.editIdx;
    return [
      el('button', { class: 'primary btn-block', text: `Save set ${k + 1}`, onclick: () => saveEdit(ctx, entry, k) }),
      el('div', { class: 'row' }, [
        el('button', { class: 'grow', text: 'Delete set', onclick: () => deleteSet(ctx, entry, k) }),
        el('button', { class: 'grow', text: 'Cancel', onclick: () => resetDraft(ctx) }),
      ]),
    ];
  }
  const t = entry.target?.sets ?? null;
  const n = entry.sets.length;
  if (t !== null && n >= t) {
    return [nextButton(ctx, i), el('button', { class: 'btn-block', text: 'Log extra set', onclick: () => logSet(ctx, entry) })];
  }
  return [el('button', {
    class: 'primary btn-block', text: t !== null ? `Log set ${n + 1} of ${t}` : `Log set ${n + 1}`,
    onclick: () => logSet(ctx, entry),
  })];
}

function resetDraft(ctx) {
  Object.assign(ctx.fs, { editIdx: null, draft: null, noteOpen: false, error: null });
  renderFocus(ctx);
}

// Reps are required; weight may be blank (bodyweight / no added weight).
function readDraft(ctx) {
  const d = ctx.fs.draft;
  if (d.reps === null || d.reps === undefined) {
    ctx.fs.error = 'Enter reps';
    renderFocus(ctx);
    return null;
  }
  return { weight: d.weight ?? null, reps: d.reps, rir: clampRir(d.rir), note: (d.note || '').trim() };
}

async function logSet(ctx, entry) {
  if (ctx.busy) return;
  ctx.busy = true;
  try {
    const v = readDraft(ctx);
    if (!v) return;
    entry.sets.push(newSet({ ...v, loggedAt: new Date().toISOString() }));
    const ok = await ctx.save();
    if (ok) navigator.vibrate?.(30);
    resetDraft(ctx);
  } finally {
    ctx.busy = false;
  }
}

async function saveEdit(ctx, entry, k) {
  if (ctx.busy) return;
  ctx.busy = true;
  try {
    const v = readDraft(ctx);
    if (!v) return;
    entry.sets[k] = { ...entry.sets[k], ...v };
    await ctx.save();
    resetDraft(ctx);
  } finally {
    ctx.busy = false;
  }
}

async function deleteSet(ctx, entry, k) {
  if (ctx.busy) return;
  ctx.busy = true;
  try {
    if (k < 0 || k >= entry.sets.length) return;
    const [removed] = entry.sets.splice(k, 1);
    await ctx.save();
    resetDraft(ctx);
    showToast(`Set ${k + 1} deleted`, {
      actionLabel: 'Undo',
      onAction: async () => {
        if (!ctx.alive) return;
        if (!removed) return;
        entry.sets.splice(k, 0, removed);
        if (ctx.fs.entry === entry) Object.assign(ctx.fs, { editIdx: null, draft: null, noteOpen: false, error: null });
        await ctx.save();
        if (ctx.view === 'focus') renderFocus(ctx);
        else if (ctx.view === 'overview') ctx.go('overview');
      },
    });
  } finally {
    ctx.busy = false;
  }
}

// Big −/value/+ control. Tapping the value swaps in a numeric field for typing an exact number.
function stepper({ label, noun, unit = '', value, step, decimals, onChange }) {
  let current = value ?? null;
  const round = (v) => (decimals ? Math.round(v * 100) / 100 : Math.round(v));
  const out = el('button', { class: 'stepper-value', 'aria-label': `${label}, tap to type`, 'aria-live': 'polite' });
  const show = () => { out.textContent = current === null ? '—' : String(current); };
  const set = (v) => { current = v; onChange(v); show(); };
  const suffix = unit ? ` ${unit}` : '';
  const minus = el('button', {
    class: 'stepper-btn', 'aria-label': `Decrease ${noun} by ${step}${suffix}`, text: `−${step}`,
    onclick: () => { if (current !== null) set(Math.max(0, round(current - step))); },
  });
  const plus = el('button', {
    class: 'stepper-btn', 'aria-label': `Increase ${noun} by ${step}${suffix}`, text: `+${step}`,
    onclick: () => set(round((current ?? 0) + step)),
  });
  out.addEventListener('click', () => {
    const input = el('input', {
      type: 'number', inputmode: decimals ? 'decimal' : 'numeric', step: decimals ? 'any' : '1', min: '0',
      class: 'stepper-input', 'aria-label': label, value: current ?? '',
    });
    const commit = () => {
      const v = decimals ? numberOrNull(input.value) : intOrNull(input.value);
      set(v === null ? null : Math.max(0, round(v)));
      input.replaceWith(out);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') input.blur();
      if (ev.key === 'Escape') { input.removeEventListener('blur', commit); input.replaceWith(out); }
    });
    out.replaceWith(input);
    input.focus();
    input.select?.();
  });
  show();
  return el('div', {}, [el('div', { class: 'muted small', text: label }), el('div', { class: 'stepper' }, [minus, out, plus])]);
}

// RIR 0–4+ as a radio group; tapping the selected chip clears it.
function rirChips(value, onChange) {
  let current = value ?? null;
  const group = el('div', { class: 'chips rir', role: 'radiogroup', 'aria-label': 'Reps in reserve' });
  const draw = (focusIdx = null) => {
    clear(group);
    [0, 1, 2, 3, 4].forEach((v, idx) => {
      group.append(el('button', {
        class: 'chip', role: 'radio', 'aria-checked': String(current === v), text: formatRir(v),
        onclick: () => { current = current === v ? null : v; onChange(current); draw(idx); },
      }));
    });
    if (focusIdx !== null) group.children[focusIdx]?.focus();
  };
  draw();
  return el('div', {}, [el('div', { class: 'muted small', text: 'RIR (reps in reserve)' }), group]);
}

// ---------- cardio ----------

function renderCardio(ctx, entry, i) {
  const { root } = ctx;
  if (entry.target?.note) root.append(el('p', { class: 'target', text: entry.target.note }));
  root.append(el('p', { class: 'muted', text: 'Track it on your Garmin.' }));
  root.append(stepper({
    label: 'Minutes (optional)', noun: 'minutes', step: 1, decimals: false,
    value: entry.durationSec == null ? null : Math.round(entry.durationSec / 60),
    onChange: (v) => { entry.durationSec = v === null ? null : v * 60; ctx.save(); },
  }));
  if (ctx.fs.distanceOpen || entry.distance != null) {
    root.append(distanceFields(ctx, entry, i));
  } else {
    root.append(el('button', { class: 'link', text: '+ Distance', onclick: () => { ctx.fs.distanceOpen = true; renderFocus(ctx); } }));
  }
  if (!entry.done) {
    root.append(el('button', {
      class: 'primary btn-block', text: 'Mark done',
      onclick: async () => { entry.done = true; const ok = await ctx.save(); if (ok) navigator.vibrate?.(30); renderFocus(ctx); },
    }));
  } else {
    root.append(nextButton(ctx, i), el('button', {
      class: 'btn-block', 'aria-pressed': 'true', text: 'Done ✓ (tap to undo)',
      onclick: async () => { entry.done = false; await ctx.save(); renderFocus(ctx); },
    }));
  }
}

function distanceFields(ctx, entry, i) {
  const dist = el('input', {
    type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: entry.distance ?? '',
    oninput: (ev) => {
      const v = numberOrNull(ev.target.value);
      entry.distance = v !== null && v >= 0 ? v : null;
      ctx.save();
    },
  });
  const unit = el('select', {}, ['mi', 'km', 'm'].map((u) => el('option', { value: u, text: u })));
  unit.value = entry.distanceUnit ?? 'mi';
  unit.addEventListener('change', () => { entry.distanceUnit = unit.value; ctx.save(); });
  return el('div', { class: 'grid-2' }, [field('Distance', `cardio-${i}-distance`, dist), field('Unit', `cardio-${i}-unit`, unit)]);
}
