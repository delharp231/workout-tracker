import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// The service worker only works offline for files it precaches. A module missing from SHELL
// breaks the installed app at the gym, silently. This guard makes that a test failure instead.
const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const shell = new Set([...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]));

for (const dir of ['js', 'seed', 'css']) {
  test(`service worker precaches every file in ${dir}/`, () => {
    const files = readdirSync(new URL(`../${dir}/`, import.meta.url));
    const missing = files.filter((f) => !shell.has(`${dir}/${f}`));
    assert.deepEqual(missing, [], `add to SHELL in service-worker.js: ${missing.join(', ')}`);
  });
}
