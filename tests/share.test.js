import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareOrDownload } from '../js/ui.js';

const recorder = () => {
  const saved = [];
  return { saved, save: (...args) => saved.push(args) };
};

test('shares the file when the browser can share files', async () => {
  const { saved, save } = recorder();
  const shared = [];
  const nav = { canShare: () => true, share: async (data) => { shared.push(data); } };
  const how = await shareOrDownload('workouts-2026-11-02.csv', 'a,b\n1,2\n', 'text/csv', { nav, save });
  assert.equal(how, 'shared');
  assert.equal(saved.length, 0);
  const [file] = shared[0].files;
  assert.equal(file.name, 'workouts-2026-11-02.csv');
  assert.equal(file.type, 'text/csv');
  assert.equal(await file.text(), 'a,b\n1,2\n');
});

test('backing out of the share sheet neither shares nor downloads', async () => {
  const { saved, save } = recorder();
  const nav = { canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } };
  assert.equal(await shareOrDownload('f.csv', 'x', 'text/csv', { nav, save }), 'cancelled');
  assert.equal(saved.length, 0);
});

test('a share that fails for another reason falls back to the download', async () => {
  const { saved, save } = recorder();
  const nav = { canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } };
  assert.equal(await shareOrDownload('f.csv', 'x', 'text/csv', { nav, save }), 'downloaded');
  assert.deepEqual(saved, [['f.csv', 'x', 'text/csv']]);
});

test('downloads when the browser cannot share files', async () => {
  for (const nav of [undefined, {}, { canShare: () => false, share: async () => {} }]) {
    const { saved, save } = recorder();
    assert.equal(await shareOrDownload('f.csv', 'x', 'text/csv', { nav, save }), 'downloaded');
    assert.deepEqual(saved, [['f.csv', 'x', 'text/csv']]);
  }
});
