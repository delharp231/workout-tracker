# GATES — manual QA before every deploy

Run `npm test` (node --test) first; it must pass. Then walk this checklist in the
browser preview (mobile viewport). A deploy is allowed only when every box is checked.

## Automated
- [ ] `node --test` passes (schema, exporter, importer).

## Storage & first run
- [ ] (Task 5b) Fresh load creates the DB; second load reuses it (data persists).
- [ ] (Task 5b) In the preview console: `import('./js/storage.js').then(async s => { await s.put('exercises',{id:'t',name:'Test'}); console.log(await s.getAll('exercises')); })` returns the record; reload the page and it is still there.
- [ ] (Task 5b) Restore a JSON backup (replace mode), then reload — the imported settings/units survive (settings record stays under key 'app').

## Log / active session (Task 9)
- [ ] Start freestyle creates and shows an active session immediately (no routine picked).
- [ ] "Start from routine" (e.g. Push A) pre-adds one entry per routine item, correctly split into strength vs. cardio by the exercise's type.
- [ ] Strength: "Add set" appends a row; entering weight/reps/RPE/note updates that exact row (not a neighboring one) and survives a screen redraw (e.g. after "Add exercise").
- [ ] A weight, reps, or RPE of exactly `0` is kept as `0` after leaving the field / reloading — not blanked to empty.
- [ ] Cardio: duration accepts both `mm:ss` (e.g. `20:00`) and a bare seconds count; distance + unit + note all persist.
- [ ] "Add exercise" appends an entry via the (non-hidden) library picker.
- [ ] **Reload-mid-session persistence gate:** log a few sets and a cardio entry, reload the page (or close/reopen the tab) without hitting Finish — the active session, all its entries, and every field value are exactly as left.
- [ ] Finish clears the active session pointer and lands on History; the session remains in Sessions (verify via storage, since History itself ships in Task 10).
- [ ] Discard deletes the in-progress session and returns to the Start view; it does not appear in storage afterward.
- [ ] Exercise names in the active view resolve correctly, including a hidden exercise (shown with a hidden marker).

## (checklist items are appended by later tasks)
