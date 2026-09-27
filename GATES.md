# GATES — QA checklist before every deploy

Run `node --test` first; it must be green. Then walk this checklist in the preview at a phone
viewport (360–375 px wide; see README for serving it locally). The PWA section can only be
checked on the real Pixel over the deployed HTTPS site.

A deploy is allowed only when the automated tests pass and every box below is checked.

## Automated

- [ ] `node --test` passes with 0 failures (format, catalog, progression, sessionLogic, schema + migration, seed, exporter CSV v2 + backup, importer, service-worker precache guard).

## Upgrade (run before any Phase 3+ deploy)

- [ ] **Migration gate (fixture):** `loadV1Fixture()` from `tests/fixtures/load-v1-db.js`, reload. Then: `meta.schema` is 2; Push/Pull have rep ranges + `origin`; the edited Legs routine is untouched (notes start "EDITED", `origin` null); positions Push 0, Pull 1, Legs 2; "Bench Press" hidden, "Deadlift" and "My Cable Curl" visible; old sets keep RPE with `rir` null; the logged bike is done, the empty erg is not; `starterRoutinesSeeded` removed.
- [ ] **Migration gate (real data):** the user's real v1 JSON backup, saved as `tests/fixtures/real-v1.json` (gitignored), loaded with `loadV1Backup('/tests/fixtures/real-v1.json')`, reload: History shows every past workout, routines have ranges (unless edited), CSV v2 exports.
- [ ] **Atomic write:** `writeAll({ exercises: [{ name: 'no id' }] }, 2)` rejects with `DataError` and the exercise count is unchanged.
- [ ] **Forced upgrade failure:** `loadV1Fixture({ poisonMeta: true })`, reload → the "Update problem" screen shows, the tab bar is hidden (computed `display: none`), a direct `indexedDB.open('workout-tracker')` read shows routines still have `targetReps` and sets have no `rir`, the `meta` store is empty, and Download backup works. Then `loadV1Fixture()` + reload to restore.
- [ ] **Failure screen:** `renderUpgradeFailure(new Error('test'))` shows the alert, a working Download backup button, Reload, and hides the tab bar.
- [ ] **Fresh install:** delete the database, reload → 49 exercises, Push/Pull/Legs (Cycle 1) with ranges, `meta.schema` 2.

## Log

- [ ] Start screen shows **Up next** (the routine after the last one you did, wrapping Push → Pull → Legs), every other routine as a Start button **including the alphabetically first one**, Freestyle, and no `<select>` anywhere.
- [ ] Backup nudge appears when there are workouts and the last JSON backup is >7 days old (or never); tapping it opens Backup.
- [ ] Focus view: "N of M", ticking clock, exercise name, "Target …" line, "Last time <date> · <sets>" (or "First time: pick a starting weight").
- [ ] Pre-fill: set 1 = last time's set 1; later sets copy the previous set this session; with no history, reps = bottom of range and RIR = top of range, weight empty.
- [ ] **A set matching the pre-fill logs in one tap; +5 then Log is two taps.** A short vibration on log (on the phone).
- [ ] Tapping the weight/reps value opens a numeric keypad; typed values stick; blank reps blocks logging with "Enter reps".
- [ ] After the target sets: "Next: <exercise> ›" plus "Log extra set"; on the last exercise "Review & finish ›".
- [ ] Tapping a logged set edits it (Save / Delete / Cancel); Delete shows an Undo toast that restores it.
- [ ] … menu: Swap (same type only; replaces in place with no sets; with sets, asks and continues in a new entry keeping the target) and Remove (with Undo).
- [ ] Cardio: target note, "Track it on your Garmin.", optional minutes, "+ Distance", Mark done → Done ✓ (tap to undo).
- [ ] **Reload mid-workout** lands on the same exercise with every set intact.
- [ ] Overview (≡): each exercise with ✓ / "2 / 3" / "2 sets" / "—"; tapping opens it; + Add exercise uses the picker; Finish workout.
- [ ] Finish: "N sets · M min", "Not logged (will be removed): …", the stale-workout checkbox when the last set is >30 min old (checked by default, changes the duration); lands on that workout's History detail; removed entries aren't stored.
- [ ] Discard (overview …) with sets confirms with the count; with none it goes straight through.
- [ ] Freestyle opens the picker at once; cancelling leaves an empty overview whose Finish offers only Discard / Keep going.
- [ ] Screen stays on during a workout (`isHeld()` true where supported) and is released on leaving the Log tab.
- [ ] **Failed save is visible:** with `IDBObjectStore.prototype.put` stubbed to throw, Log set shows the save-error banner, it stays visible after › and ≡, there is no success vibration, and it disappears after the next successful save.
- [ ] **Double-tap:** two rapid taps on Log set log exactly one set.

## Picker

- [ ] Search + muscle chips + live count; the keyboard does not open on arrival; "No matches · Clear search"; "+ Create "…"" adds a custom exercise and picks it.

## Routines

- [ ] List in position order; Start (switches to Log; blocked with a toast if a workout is running), Edit, Delete (confirms).
- [ ] Editor: Sets, Reps min/max, RIR min/max, Note per item; reversed ranges are swapped on save; ↑/↓ disabled at the ends; + Add exercise via the picker; Cancel asks only if something changed.

## Library

- [ ] Search + muscle chips + count; clearable empty state; "Show hidden" checkbox is normal size on one line; no Import button here.
- [ ] Add/Edit saves in place; Weight step (lb) changes the ± step in the focus view; 0 or negative is refused.
- [ ] Hide/Unhide is a soft delete.

## History

- [ ] Newest first; the in-progress workout isn't listed; cards are buttons (Tab + Enter works).
- [ ] Detail: date · time · duration, "Target …" lines, set lines with RIR (legacy: RPE), cardio Done/Not done + minutes; 0 values show as 0; Delete confirms.

## Backup / Export

- [ ] CSV v2 header exactly: `date,session_id,session_name,session_duration_sec,exercise,exercise_type,muscle_group,set_number,weight_lb,reps,rir,rpe,logged_at,distance,distance_unit,duration_sec,note`.
- [ ] Exporting CSV does **not** change "Last backup"; downloading the JSON backup does.
- [ ] JSON backup → Import → Replace restores identically; a v1 backup is upgraded on import.
- [ ] Exercise-only import reports added / skipped / without-a-name separately.
- [ ] Erase all data needs `ERASE`, then reloads to a fresh install.
- [ ] **Failed erase / restore:** with `IDBObjectStore.prototype.clear` stubbed to throw, Erase shows "Erase failed — nothing was deleted: …" and doesn't reload; a restore whose write fails shows "Restore failed — nothing was changed: …".

## Accessibility and layout

- [ ] No horizontal scroll at 360 px; every control ≥44 px; steppers and the Log/Next button ≥56 px.
- [ ] Active tab shows a top bar + bold, not colour alone; `:focus-visible` rings on Tab.
- [ ] Toasts and notices are `role="status"`; the save error is `role="alert"`.

## PWA / on-device

**Must be tested on the real Pixel, over the deployed HTTPS site. A service worker won't register in the preview.**

- [ ] **Before deploying:** `.vercelignore` exists and excludes `tests/` and `.superpowers/` (so dev fixtures and real backups are never uploaded).
- [ ] **Before installing an update that migrates data: download a JSON backup on the phone.**
- [ ] ⋮ → Install app / Add to Home screen works; the app opens standalone.
- [ ] After a deploy, reopen the app once or twice; `caches.keys()` shows only the new cache name.
- [ ] **Offline gate:** airplane mode → open the app → start a workout, log a set, finish. Everything works.
- [ ] The home-screen icon renders un-clipped.
