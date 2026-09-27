import { SCHEMA_VERSION } from './schema.js';

// CSV contract v2 (spec §10.1). Tidy long format: one row per logged set, or per kept cardio entry.
export const CSV_COLUMNS = [
  'date', 'session_id', 'session_name', 'session_duration_sec', 'exercise', 'exercise_type', 'muscle_group',
  'set_number', 'weight_lb', 'reps', 'rir', 'rpe', 'logged_at',
  'distance', 'distance_unit', 'duration_sec', 'note',
];

export function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(cells) {
  return CSV_COLUMNS.map((c) => csvEscape(cells[c])).join(',');
}

// Whole seconds from start to finish; null while unfinished (or for legacy sessions).
export function sessionDurationSec(session) {
  if (!session.finishedAt) return null;
  const d = (Date.parse(session.finishedAt) - Date.parse(session.date)) / 1000;
  return Number.isFinite(d) && d >= 0 ? Math.round(d) : null;
}

const cardioLogged = (e) => !!e.done || e.durationSec != null || e.distance != null;

export function buildCsv(sessions, exerciseIndex) {
  const lines = [CSV_COLUMNS.join(',')];
  const ordered = [...sessions].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const s of ordered) {
    const base = { date: s.date, session_id: s.id, session_name: s.name, session_duration_sec: sessionDurationSec(s) };
    for (const entry of s.entries || []) {
      const ex = exerciseIndex[entry.exerciseId];
      const common = {
        ...base,
        exercise: ex ? ex.name : '(unknown exercise)',
        exercise_type: entry.type === 'cardio' ? 'cardio' : 'strength',
        muscle_group: ex ? ex.muscleGroup ?? '' : '',
      };
      if (entry.type === 'cardio') {
        if (!cardioLogged(entry)) continue;
        lines.push(row({
          ...common, set_number: 1,
          distance: entry.distance, distance_unit: entry.distanceUnit, duration_sec: entry.durationSec, note: entry.note,
        }));
      } else {
        (entry.sets || []).forEach((set, i) => {
          lines.push(row({
            ...common, set_number: i + 1,
            weight_lb: set.weight, reps: set.reps, rir: set.rir, rpe: set.rpe, logged_at: set.loggedAt, note: set.note,
          }));
        });
      }
    }
  }
  return lines.join('\n') + '\n';
}

export function buildBackup({ settings, exercises, routines, sessions, bodyweight } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: settings ?? null,
    exercises: exercises ?? [],
    routines: routines ?? [],
    sessions: sessions ?? [],
    bodyweight: bodyweight ?? [],
  };
}

export function serializeBackup(state) {
  return JSON.stringify(buildBackup(state), null, 2);
}
