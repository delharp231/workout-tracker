import { getSettings } from './storage.js';
import { el, clear } from './ui.js';
import { numberOrNull, formatShortDate } from './format.js';
import * as wakeLock from './wakelock.js';
import { ITEMS, SECTIONS, TIERS, GET_READY_CHOICES } from './morningData.js';
import {
  loadState, saveState, setCheck, setTier, resetToday, setGetReady, counts, itemDone, rounds, isVisible,
  doseText, tierMinutes, weekDays, addCheck, recentChecks, checkDue,
} from './morningLogic.js';

// The morning routine screen. Everything it saves goes to its own localStorage key (see
// morningLogic.js); the workout log, History, Backup and CSV never see it. The only thing it reads
// from the app's database is the keep-screen-on setting.

const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `${n}` : '0');

export async function renderMorning(root) {
  const settings = await getSettings();
  let state = loadState(localStorage, localDate());
  const boxes = new Map(); // item id -> its check box inputs
  const rows = new Map(); // item id -> its list row
  let timer = null;
  let audio = null;
  let progressRefs = null;

  const wrap = el('div', { class: 'morning stack' });
  root.append(wrap);

  const persist = (next) => { state = next; saveState(localStorage, state); updateProgress(); };

  // Sound and vibration. Audio needs a user gesture to start; the Start timer tap provides it.
  function beep(n, hz) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      for (let i = 0; i < n; i++) {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.frequency.value = hz || 880;
        o.connect(g); g.connect(audio.destination);
        const t0 = audio.currentTime + i * 0.22;
        g.gain.setValueAtTime(0.25, t0);
        o.start(t0); o.stop(t0 + 0.12);
      }
    } catch { /* sound is a convenience */ }
    if (navigator.vibrate) navigator.vibrate(n === 1 ? 150 : n === 2 ? [150, 80, 150] : [200, 80, 200, 80, 200]);
  }

  // Timer sheet: a get-ready lead-in, then one segment per side. Each hold is started by hand.
  const sheet = el('div', { class: 'm-sheet', role: 'dialog', 'aria-label': 'Timer', 'aria-live': 'polite', hidden: true });
  const sName = el('div', { class: 'muted small' });
  const sLabel = el('div', { class: 'm-sheet-label' });
  const sDigits = el('div', { class: 'm-digits' });
  const pauseBtn = el('button', { class: 'primary', text: 'Pause', onclick: () => togglePause() });
  const skipBtn = el('button', { text: 'Skip', onclick: () => { if (timer) nextSegment(); } });
  const closeBtn = el('button', { text: 'Close', onclick: () => stopTimer() });
  sheet.append(sName, sLabel, sDigits, el('div', { class: 'row m-sheet-btns' }, [pauseBtn, skipBtn, closeBtn]));
  wrap.append(sheet);

  function startTimer(it) {
    stopTimer();
    const lead = state.getReady;
    const segs = (lead > 0 ? [{ label: 'Get in position', sec: lead, lead: true }] : []).concat(it.timer);
    timer = { it, segs, i: 0, end: Date.now() + segs[0].sec * 1000, paused: false, left: 0, id: setInterval(tickTimer, 200) };
    sName.textContent = it.name;
    pauseBtn.textContent = 'Pause';
    sheet.hidden = false;
    beep(1, 660);
    tickTimer();
  }
  function stopTimer() {
    if (timer) clearInterval(timer.id);
    timer = null;
    sheet.hidden = true;
  }
  function nextSegment() {
    timer.i++;
    if (timer.i >= timer.segs.length) { finishTimer(); return; }
    timer.end = Date.now() + timer.segs[timer.i].sec * 1000;
    timer.paused = false;
    pauseBtn.textContent = 'Pause';
    const lead = timer.segs[timer.i].lead;
    beep(lead ? 1 : 2, lead ? 660 : 880);
    tickTimer();
  }
  function finishTimer() {
    const it = timer.it;
    beep(3, 988);
    const done = state.done[it.id] || [];
    const n = rounds(it, state.tier);
    for (let i = 0; i < n; i++) {
      if (!done[i]) {
        persist(setCheck(ITEMS, state, it.id, i, true));
        const cb = boxes.get(it.id)?.[i];
        if (cb) cb.checked = true;
        rows.get(it.id)?.classList.toggle('done', itemDone(state, it));
        break;
      }
    }
    stopTimer();
  }
  function togglePause() {
    if (!timer) return;
    if (timer.paused) { timer.end = Date.now() + timer.left * 1000; timer.paused = false; pauseBtn.textContent = 'Pause'; }
    else { timer.left = Math.max(0, Math.ceil((timer.end - Date.now()) / 1000)); timer.paused = true; pauseBtn.textContent = 'Resume'; }
  }
  function tickTimer() {
    if (!timer) return;
    const seg = timer.segs[timer.i];
    const left = timer.paused ? timer.left : Math.max(0, Math.ceil((timer.end - Date.now()) / 1000));
    const hasLead = timer.segs[0].lead === true;
    const pos = timer.i - (hasLead ? 1 : 0) + 1;
    sLabel.textContent = seg.lead ? seg.label : `${seg.label} (${pos} of ${timer.it.timer.length})`;
    sDigits.textContent = String(left);
    skipBtn.textContent = seg.lead ? 'Start now' : 'Skip';
    if (!timer.paused && left <= 0) nextSegment();
  }

  function updateProgress() {
    if (!progressRefs) return;
    const { got, total } = counts(ITEMS, state);
    progressRefs.fill.style.width = `${total ? (100 * got) / total : 0}%`;
    progressRefs.text.textContent = got === total && total ? 'Done for today' : `${got} of ${total} checked`;
    progressRefs.week.textContent = `${weekDays(state, localDate())} of the last 7 days`;
  }

  function itemRow(it) {
    const n = rounds(it, state.tier);
    const li = el('div', { class: `card m-item stack${itemDone(state, it) ? ' done' : ''}`, id: `m-${it.id}` });
    rows.set(it.id, li);
    const inputs = [];
    const checks = el('div', { class: 'm-checks' }, Array.from({ length: n }, (_, i) => {
      const cb = el('input', {
        type: 'checkbox',
        'aria-label': n === 1 ? `Done: ${it.name}` : `${it.name}, round ${i + 1}`,
        onchange: () => {
          persist(setCheck(ITEMS, state, it.id, i, cb.checked));
          li.classList.toggle('done', itemDone(state, it));
        },
      });
      cb.checked = !!(state.done[it.id] || [])[i];
      inputs.push(cb);
      return el('label', { class: 'm-chk' }, [cb, el('span', { text: n === 1 ? 'Done' : `R${i + 1}` })]);
    }));
    boxes.set(it.id, inputs);
    const title = el('div', { class: 'ex-name', text: it.name });
    if (it.floor) title.append(' ', el('span', { class: 'm-badge', text: 'Floor day' }));
    li.append(el('div', { class: 'row' }, [checks, el('div', { class: 'grow' }, [title, el('div', { class: 'm-dose', text: doseText(it, state.tier) })])]));
    if (it.timer) li.append(el('button', { class: 'primary', text: 'Start timer', onclick: () => startTimer(it) }));

    const details = el('details', {}, [el('summary', { text: 'How to, with video' })]);
    const inner = el('div', { class: 'stack' });
    details.append(inner);
    details.addEventListener('toggle', () => {
      if (!details.open || inner.childNodes.length) return;
      const frame = el('iframe', {
        src: `https://www.youtube-nocookie.com/embed/${it.vid}?rel=0`, title: it.title, loading: 'lazy',
        allow: 'accelerometer; encrypted-media; gyroscope; picture-in-picture', allowfullscreen: true,
        referrerpolicy: 'strict-origin-when-cross-origin',
      });
      const link = el('a', { href: `https://www.youtube.com/watch?v=${it.vid}`, target: '_blank', rel: 'noopener', text: 'Watch on YouTube' });
      inner.append(
        el('div', { class: 'm-video' }, [frame]),
        el('p', { class: 'muted small' }, [`${it.ch}. `, link]),
        el('div', { class: 'group-head', text: 'Cues from the video' }),
        el('ul', { class: 'm-cues' }, it.cues.map((c) => el('li', { text: c }))),
        it.note ? el('p', { class: 'm-note', text: it.note }) : null,
      );
    });
    li.append(details);
    return li;
  }

  function checksCard() {
    const card = el('div', { class: 'card stack' });
    const sit = el('input', { type: 'number', inputmode: 'decimal', step: '0.5', min: '0', max: '10', 'aria-label': 'Sit-rise score, 0 to 10', placeholder: 'Sit-rise (0 to 10)' });
    const push = el('input', { type: 'number', inputmode: 'numeric', step: '1', min: '0', max: '300', 'aria-label': 'Max push-ups', placeholder: 'Max push-ups' });
    const error = el('p', { class: 'error', role: 'alert' });
    const save = () => {
      const sitRise = numberOrNull(sit.value);
      const pushUps = numberOrNull(push.value);
      if (sitRise === null || pushUps === null) { error.textContent = 'Enter both numbers.'; return; }
      const res = addCheck(state, { date: localDate(), sitRise, pushUps });
      if (!res.ok) { error.textContent = res.error; return; }
      persist(res.state);
      fill();
    };
    function fill() {
      clear(card);
      card.append(el('div', { class: 'card-title', text: 'Monthly check' }));
      if (checkDue(state, localDate())) {
        card.append(el('p', { class: 'muted', text: state.checks.length ? 'It has been 30 days since the last check.' : 'No check saved yet. Do the floor sit-and-rise and a max push-up set, then save both.' }));
      }
      const list = recentChecks(state);
      for (const c of list) {
        const d = (v) => (v === null ? '' : ` (${signed(v)})`);
        card.append(el('div', { class: 'row m-check-row' }, [
          el('span', { text: formatShortDate(`${c.date}T12:00:00`) }),
          el('span', { class: 'grow', text: `Sit-rise ${c.sitRise}${d(c.sitRiseDelta)}  ·  Push-ups ${c.pushUps}${d(c.pushUpsDelta)}` }),
        ]));
      }
      sit.value = ''; push.value = ''; error.textContent = '';
      card.append(el('div', { class: 'grid-2' }, [sit, push]), el('button', { text: 'Save check', onclick: save }), error);
    }
    fill();
    return card;
  }

  function build() {
    stopTimer();
    boxes.clear(); rows.clear();
    for (const child of [...wrap.children]) if (child !== sheet) child.remove();
    const fill = el('i', { class: 'm-fill' });
    const text = el('span');
    const week = el('span', { class: 'muted' });
    progressRefs = { fill, text, week };
    wrap.insertBefore(el('div', { class: 'card stack' }, [
      el('div', { class: 'm-bar', 'aria-hidden': 'true' }, [fill]),
      el('div', { class: 'row m-progress' }, [text, el('span', { class: 'grow' }), week]),
    ]), sheet);
    wrap.insertBefore(el('div', { class: 'grid-3 m-tiers', role: 'group', 'aria-label': "Today's version" }, TIERS.map((t) => el('button', {
      class: 'm-tier', 'aria-pressed': String(state.tier === t.id),
      onclick: () => { persist(setTier(ITEMS, state, t.id)); build(); },
    }, [el('b', { text: t.name }), el('span', { class: 'muted small', text: `about ${tierMinutes(ITEMS, t.id)} min, ${t.sub}` })]))), sheet);

    for (const sec of SECTIONS) {
      const items = ITEMS.filter((it) => it.sec === sec.name && isVisible(it, state.tier));
      if (!items.length) continue;
      wrap.insertBefore(el('h2', { class: 'm-sec', text: sec.name }), sheet);
      if (sec.sub) wrap.insertBefore(el('p', { class: 'muted small', text: sec.sub }), sheet);
      for (const it of items) wrap.insertBefore(itemRow(it), sheet);
    }
    wrap.insertBefore(checksCard(), sheet);

    const ready = el('select', {
      'aria-label': 'Get ready countdown',
      onchange: (ev) => persist(setGetReady(state, Number(ev.target.value))),
    }, GET_READY_CHOICES.map((s) => el('option', { value: String(s), text: s === 0 ? 'No countdown' : `${s} seconds` })));
    ready.value = String(state.getReady);
    wrap.insertBefore(el('div', { class: 'card stack' }, [
      el('label', { class: 'muted small', for: 'm-ready', text: 'Get-ready countdown before each hold' }),
      Object.assign(ready, { id: 'm-ready' }),
      el('button', { text: 'Reset today', onclick: () => { persist(resetToday(ITEMS, state)); build(); } }),
    ]), sheet);
    wrap.insertBefore(el('p', { class: 'muted small', text: 'Do the stretches after the 5:30 lift, not before. Stop each circuit set with about 2 reps left, and stop any move that causes sharp pain. This is a plan, not medical advice; check it with your trainer. Videos belong to their channels and need a connection. The incline push-up channel\'s credentials are unconfirmed. Minute counts are a rough count, not a timed run. This screen saves to its own storage and never touches your workouts.' }), sheet);
    updateProgress();
  }

  build();
  if (settings.keepScreenOn) wakeLock.acquire();
  return () => {
    stopTimer();
    wakeLock.release();
    try { audio?.close(); } catch { /* already closed */ }
  };
}
