# GATES — manual QA before every deploy

Run `npm test` (node --test) first; it must pass. Then walk this checklist in the
browser preview (mobile viewport). A deploy is allowed only when every box is checked.

## Automated
- [ ] `node --test` passes (schema, exporter, importer).

## Storage & first run
- [ ] (Task 5b) Fresh load creates the DB; second load reuses it (data persists).
- [ ] (Task 5b) In the preview console: `import('./js/storage.js').then(async s => { await s.put('exercises',{id:'t',name:'Test'}); console.log(await s.getAll('exercises')); })` returns the record; reload the page and it is still there.
- [ ] (Task 5b) Restore a JSON backup (replace mode), then reload — the imported settings/units survive (settings record stays under key 'app').

## (checklist items are appended by later tasks)
