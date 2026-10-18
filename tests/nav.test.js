import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navAction } from '../js/nav.js';

test('opening a screen from Home pushes one history entry', () => {
  assert.equal(navAction(0, 'log'), 'push');
  assert.equal(navAction(0, 'routines'), 'push');
});

test('moving between non-Home screens replaces the entry, so back still goes Home', () => {
  assert.equal(navAction(1, 'history'), 'replace');
  assert.equal(navAction(1, 'log'), 'replace');
});

test('Home from another screen goes back; Home from Home does nothing to the stack', () => {
  assert.equal(navAction(1, 'home'), 'back');
  assert.equal(navAction(0, 'home'), 'none');
});
