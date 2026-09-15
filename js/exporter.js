import { SCHEMA_VERSION } from './schema.js';

export const CSV_COLUMNS = [
  'date', 'session_name', 'exercise', 'exercise_type', 'set_number',
  'weight_lb', 'reps', 'rpe', 'rest_sec',
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

export function buildCsv(sessions, exerciseIndex) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const s of sessions) {
    for (const entry of s.entries || []) {
      const ex = exerciseIndex[entry.exerciseId];
      const name = ex ? ex.name : '(unknown exercise)';
      if (entry.type === 'cardio') {
        lines.push(row({
          date: s.date, session_name: s.name, exercise: name, exercise_type: 'cardio', set_number: 1,
          distance: entry.distance, distance_unit: entry.distanceUnit, duration_sec: entry.durationSec, note: entry.note,
        }));
      } else {
        (entry.sets || []).forEach((set, i) => {
          lines.push(row({
            date: s.date, session_name: s.name, exercise: name, exercise_type: 'strength', set_number: i + 1,
            weight_lb: set.weight, reps: set.reps, rpe: set.rpe, rest_sec: set.restSec, note: set.note,
          }));
        });
      }
    }
  }
  return lines.join('\n') + '\n';
}

export function buildBackup({ settings, exercises, routines, sessions } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: settings ?? null,
    exercises: exercises ?? [],
    routines: routines ?? [],
    sessions: sessions ?? [],
  };
}

export function serializeBackup(state) {
  return JSON.stringify(buildBackup(state), null, 2);
}
