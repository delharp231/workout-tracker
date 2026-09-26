// Pure parse/format helpers shared by every screen. No DOM, no storage, no clock.

// '' / null / undefined → null; otherwise Number(raw), or null if it isn't a finite number.
// Deliberately no `||` fallback: a real 0 (weight, reps) must stay 0.
export function numberOrNull(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// numberOrNull, rounded to a whole number (reps, sets, RIR).
export function intOrNull(raw) {
  const n = numberOrNull(raw);
  return n === null ? null : Math.round(n);
}

// "mm:ss", "h:mm:ss", or a bare number of seconds → whole seconds; anything malformed → null.
export function parseDuration(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (!s.includes(':')) {
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  const parts = s.split(':');
  if (parts.length > 3) return null;
  const nums = parts.map((p) => (p.trim() === '' ? NaN : Number(p)));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const [h, m, sec] = nums.length === 3 ? nums : [0, ...nums];
  if (sec >= 60 || (nums.length === 3 && m >= 60)) return null;
  return Math.round(h * 3600 + m * 60 + sec);
}

// Seconds → "m:ss", or "h:mm:ss" from an hour up. null/NaN → ''.
export function formatDuration(sec) {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return '';
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// 6, 8 → "6–8"; 15, 15 → "15"; one side missing → the other; both missing → "".
export function formatRange(min, max) {
  if ((min === null || min === undefined) && (max === null || max === undefined)) return '';
  if (min === null || min === undefined || max === null || max === undefined || min === max) return String(min ?? max);
  return `${min}–${max}`;
}

export const formatRir = (rir) => (rir === 4 ? '4+' : String(rir));

// A prescription → "3 × 6–8 @ RIR 2 · Primary press." Any part may be missing; none → "".
export function formatTarget(target) {
  if (!target) return '';
  const reps = formatRange(target.repMin ?? null, target.repMax ?? null);
  const sets = target.sets ?? null;
  let main = '';
  if (sets !== null && reps) main = `${sets} × ${reps}`;
  else if (reps) main = `${reps} reps`;
  else if (sets !== null) main = `${sets} sets`;
  const rir = formatRange(target.rirMin ?? null, target.rirMax ?? null);
  if (rir) main = main ? `${main} @ RIR ${rir}` : `RIR ${rir}`;
  return [main, target.note || ''].filter(Boolean).join(' · ');
}

const weightLabel = (w) => (w === null || w === undefined ? 'BW' : String(w));

// Sets → "135 × 8, 8, 7" when every set used one weight, else "135 × 8, 140 × 6".
export function formatSets(sets) {
  if (!sets || !sets.length) return '';
  const first = sets[0].weight ?? null;
  if (sets.every((s) => (s.weight ?? null) === first)) {
    return `${weightLabel(first)} × ${sets.map((s) => s.reps ?? '—').join(', ')}`;
  }
  return sets.map((s) => `${weightLabel(s.weight)} × ${s.reps ?? '—'}`).join(', ');
}

// One logged set → "135 × 8 · RIR 2". Legacy (v1) sets show "RPE 8" when they have no RIR.
export function formatSetLine(set) {
  let line = `${weightLabel(set.weight)} × ${set.reps ?? '—'}`;
  if (set.rir !== null && set.rir !== undefined) line += ` · RIR ${formatRir(set.rir)}`;
  else if (set.rpe !== null && set.rpe !== undefined) line += ` · RPE ${set.rpe}`;
  return line;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ISO → "Mon Sep 21" in local time; unparseable → ''.
export function formatShortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// Seconds → "42 min".
export function formatMinutes(sec) {
  return `${Math.max(0, Math.round(sec / 60))} min`;
}

// Seconds → "45 min" under an hour, else "2 h" (coarse, for "last set was … ago").
export function formatAgo(sec) {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
}
