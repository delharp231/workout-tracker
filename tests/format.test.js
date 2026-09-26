import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  numberOrNull, intOrNull, parseDuration, formatDuration, formatRange, formatTarget,
  formatSets, formatSetLine, formatShortDate, formatMinutes, formatAgo,
} from '../js/format.js';

test('numberOrNull keeps 0 and rejects junk', () => {
  assert.equal(numberOrNull(''), null);
  assert.equal(numberOrNull(null), null);
  assert.equal(numberOrNull(undefined), null);
  assert.equal(numberOrNull('0'), 0);
  assert.equal(numberOrNull('132.5'), 132.5);
  assert.equal(numberOrNull('abc'), null);
  assert.equal(numberOrNull('Infinity'), null);
});

test('intOrNull rounds to whole numbers', () => {
  assert.equal(intOrNull('8'), 8);
  assert.equal(intOrNull('7.6'), 8);
  assert.equal(intOrNull(''), null);
});

test('parseDuration accepts mm:ss, h:mm:ss and bare seconds', () => {
  assert.equal(parseDuration('20:00'), 1200);
  assert.equal(parseDuration('1:05:30'), 3930);
  assert.equal(parseDuration('90'), 90);
  assert.equal(parseDuration('75:00'), 4500);
  assert.equal(parseDuration(''), null);
});

test('parseDuration rejects malformed input', () => {
  for (const bad of ['1:2:3:4', '-5', '1:-5', 'abc', '1:75', '1:60:00', ':30', '10:']) {
    assert.equal(parseDuration(bad), null, bad);
  }
});

test('formatDuration switches to h:mm:ss from an hour', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3599), '59:59');
  assert.equal(formatDuration(3600), '1:00:00');
  assert.equal(formatDuration(3930), '1:05:30');
  assert.equal(formatDuration(null), '');
});

test('formatRange', () => {
  assert.equal(formatRange(6, 8), '6–8');
  assert.equal(formatRange(15, 15), '15');
  assert.equal(formatRange(null, 8), '8');
  assert.equal(formatRange(null, null), '');
});

test('formatTarget covers every combination', () => {
  assert.equal(formatTarget({ sets: 3, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, note: 'Primary press.' }), '3 × 6–8 @ RIR 2 · Primary press.');
  assert.equal(formatTarget({ sets: 3, repMin: 15, repMax: 15, rirMin: null, rirMax: null, note: '' }), '3 × 15');
  assert.equal(formatTarget({ sets: 2, repMin: 10, repMax: 12, rirMin: 1, rirMax: 2, note: '' }), '2 × 10–12 @ RIR 1–2');
  assert.equal(formatTarget({ sets: null, repMin: 8, repMax: 10, rirMin: null, rirMax: null, note: '' }), '8–10 reps');
  assert.equal(formatTarget({ sets: 3, repMin: null, repMax: null, rirMin: null, rirMax: null, note: '' }), '3 sets');
  assert.equal(formatTarget({ note: 'Do last.' }), 'Do last.');
  assert.equal(formatTarget(null), '');
  assert.equal(formatTarget({}), '');
});

test('formatSets groups a shared weight and handles bodyweight', () => {
  assert.equal(formatSets([{ weight: 135, reps: 8 }, { weight: 135, reps: 8 }, { weight: 135, reps: 7 }]), '135 × 8, 8, 7');
  assert.equal(formatSets([{ weight: 135, reps: 8 }, { weight: 140, reps: 6 }]), '135 × 8, 140 × 6');
  assert.equal(formatSets([{ weight: null, reps: 10 }, { weight: null, reps: 9 }]), 'BW × 10, 9');
  assert.equal(formatSets([]), '');
});

test('formatSetLine shows RIR, or legacy RPE when there is no RIR', () => {
  assert.equal(formatSetLine({ weight: 135, reps: 8, rir: 2, rpe: null }), '135 × 8 · RIR 2');
  assert.equal(formatSetLine({ weight: 135, reps: 8, rir: 4, rpe: null }), '135 × 8 · RIR 4+');
  assert.equal(formatSetLine({ weight: 135, reps: 8, rir: null, rpe: 8 }), '135 × 8 · RPE 8');
  assert.equal(formatSetLine({ weight: 0, reps: 0, rir: 0, rpe: null }), '0 × 0 · RIR 0');
  assert.equal(formatSetLine({ weight: null, reps: 12, rir: null, rpe: null }), 'BW × 12');
});

test('formatShortDate uses local time', () => {
  assert.equal(formatShortDate(new Date(2026, 8, 21, 18, 30).toISOString()), 'Mon Sep 21');
  assert.equal(formatShortDate('nope'), '');
});

test('formatMinutes and formatAgo', () => {
  assert.equal(formatMinutes(2520), '42 min');
  assert.equal(formatMinutes(20), '0 min');
  assert.equal(formatAgo(45 * 60), '45 min');
  assert.equal(formatAgo(2 * 3600), '2 h');
});
