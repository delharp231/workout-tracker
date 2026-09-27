# Phase 3 follow-ups (deferred during review)

Phase 3 was built task by task with a review after each task and a final whole-branch review. None of the items below loses data. They were deferred on purpose so they can be triaged into the Phase 4 plan. They're listed roughly by value.

## Worth doing early in Phase 4

- **Merge-restore onto a fresh phone breaks exercise links** (`importer.js` `applyRestore` merge). A new or erased phone re-seeds the starter exercises with new ids. Merge skips backup exercises that share a name but doesn't remap their ids, so restored workouts show "(removed exercise)" and the starter routines are duplicated. The only mitigation so far is the Restore screen's copy, which says to choose Replace on a new phone. Fix: when merging, remap the ids of skipped exercises inside incoming routines and sessions.
- **The upgrade-failure download can stall.** After the "another copy is open" message, **Download backup** waits until the other tab closes, because the blocked open request is still queued. Fix: make the failure screen's first line say "close other copies" for this case.
- **Wake-lock race** (`wakelock.js`). If you leave the Log tab while it's still loading, the lock can stay on until the page is hidden. Fix: track the in-flight request, release it when `!wanted`, and guard the `release` listener.
- **Stale context after a tab switch** (`session.js` / `focus.js`). Re-renders after an `await` ignore `ctx.alive`. `begin()` resolving after a tab switch starts a clock and wake lock with no cleanup. Fix: an `if (!ctx.alive) return` guard at the top of each render, plus a generation counter.
- **Undo refresh gaps.** Undo on the Finish view leaves its summary stale. Removing the only exercise, then Undo, brings the "…" menu back open. There's also a one-save window after Undo where a stale Log tap throws a harmless, swallowed TypeError.
- **Raw backup on the newer-version path** (`app.js` `downloadRawBackup`). It always stamps `schemaVersion: 1` and drops `bodyweight`. Fix this before any future schema bump or the bodyweight UI.

## Small or cosmetic

- `entryProgress` shows ✓ for a target of 0 sets with nothing logged.
- The routine editor accepts 0 and negative numbers, and its RIR row uses a 3-column grid for 2 fields.
- Routines Start/Save have no double-tap guard (an empty workout or a duplicate routine is possible).
- The value stepper's accessible name leaves out the current value. Stepper typed values only reach the draft on blur.
- The picker hides "+ Create" when a *hidden* exercise already has that name, but doesn't list the hidden one either.
- The toast can sit over the Log/Next button: body padding only clears the tab bar.
- `.upnext h2` is the same size as the top-bar title. The weight-step label wording differs from the spec's.
- `showScreen` doesn't catch renderer errors (a blank screen). Its stale-cleanup branch lacks the try/catch the normal path has.
- `readAll` also locks `meta`. The fresh-install check could require every store to be empty, not just exercises.
- A failed Discard isn't surfaced. `refresh()` after a storage failure is itself unguarded.
- The "cardio counts as logged" rule is duplicated ×3 (`sessionLogic`, `exporter`, `history`).
- `numberOrNull('  ')` returns 0. The prefill fallbacks are more defensive than the spec's wording.
- Tests: `sessionDurationSec`'s negative/NaN guard; `seedExerciseNames` passed without `seedRoutines`; 0-valued and note-only sets are kept by the blank-set filter.
- Dev only: `sw.shell` test false positives on stray files; the fixture loader's `deleteDatabase` has no `onblocked`; the fixture builds v1 from the *current* seed; the GATES `.vercelignore` line names only 2 of its 6 patterns.
- An in-progress v1 workout carried across the upgrade has no set timestamps, so there's no stale-finish option and its duration can read as days.
