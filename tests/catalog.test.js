import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupsPresent, filterExercises, groupByMuscle, nameExists, exerciseLabel } from '../js/catalog.js';

const ex = (name, muscleGroup, equipment = '', extra = {}) => ({ id: name, name, type: 'strength', muscleGroup, equipment, hidden: false, ...extra });
const list = [
  ex('Leg Press', 'Legs', 'Machine'),
  ex('Barbell Bench Press', 'Chest', 'Barbell'),
  ex('Face Pull', 'Shoulders', 'Cable'),
  ex('Air Bike', 'Conditioning', 'Bike', { type: 'cardio' }),
  ex('Mystery', '', ''),
  ex('Farmer Carry', 'Grip', 'Dumbbell'),
];

test('groupsPresent follows the fixed muscle order, unknown groups after, Other last', () => {
  assert.deepEqual(groupsPresent(list), ['Chest', 'Shoulders', 'Legs', 'Conditioning', 'Grip', 'Other']);
});

test('filterExercises matches name, muscle group or equipment, case-insensitive, sorted by name', () => {
  assert.deepEqual(filterExercises(list, { q: 'CABLE' }).map((e) => e.name), ['Face Pull']);
  assert.deepEqual(filterExercises(list, { q: 'legs' }).map((e) => e.name), ['Leg Press']);
  assert.deepEqual(filterExercises(list, { group: 'Chest' }).map((e) => e.name), ['Barbell Bench Press']);
  assert.deepEqual(filterExercises(list, { q: 'press', group: 'Legs' }).map((e) => e.name), ['Leg Press']);
  assert.deepEqual(filterExercises(list, { group: 'Other' }).map((e) => e.name), ['Mystery']);
  assert.equal(filterExercises(list).length, 6);
  assert.equal(filterExercises(list)[0].name, 'Air Bike');
});

test('groupByMuscle returns ordered groups with name-sorted items', () => {
  const g = groupByMuscle([ex('Incline Dumbbell Press', 'Chest'), ex('Barbell Bench Press', 'Chest'), ex('Leg Press', 'Legs')]);
  assert.deepEqual(g.map((x) => [x.group, x.items.map((e) => e.name)]), [
    ['Chest', ['Barbell Bench Press', 'Incline Dumbbell Press']], ['Legs', ['Leg Press']],
  ]);
});

test('nameExists is trimmed and case-insensitive', () => {
  assert.equal(nameExists(list, '  leg press '), true);
  assert.equal(nameExists(list, 'Hack Squat'), false);
  assert.equal(nameExists(list, '   '), false);
});

test('exerciseLabel flags hidden and missing exercises', () => {
  assert.equal(exerciseLabel({ name: 'Row', hidden: false }), 'Row');
  assert.equal(exerciseLabel({ name: 'Row', hidden: true }), 'Row (hidden)');
  assert.equal(exerciseLabel(undefined), '(removed exercise)');
});
