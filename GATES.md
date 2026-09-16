# GATES — QA checklist before every deploy

Run `node --test` (or `npm test`) first — it must be green. Then walk this
checklist end to end in the mobile preview (see README for how to serve it
locally). The PWA section at the bottom can only be verified on the real
Pixel, over the deployed HTTPS site — do that pass before/after a deploy, not
instead of it.

A deploy is allowed only when the automated tests pass and every box below is checked.

## Automated

- [ ] `node --test` passes — 29/29 (schema.js, exporter.js CSV + JSON backup, importer.js restore + seed merge).

## Library

- [ ] Fresh load seeds the library from `seed/exercises.default.json`, and the list renders it sorted by name with muscle-group · equipment subtitles.
- [ ] Search filters the list by exercise name **and** by equipment/muscle group, case-insensitive, as you type.
- [ ] "Show hidden" checkbox brings hidden exercises back into view; unchecked, they stay out of the default list.
- [ ] + Add exercise persists a new row (name, type, muscle group, equipment) and it shows up in the list right away, marked custom.
- [ ] Edit saves changes to an existing exercise in place — same id afterward, no duplicate row.
- [ ] Hide is a soft-delete: the exercise drops out of the default list but still exists (visible again with "Show hidden" checked); Unhide restores it to the default list.
- [ ] Import exercises (JSON) on a seed-shaped file (`{"exercises":[...]}` or a bare array) merges by name, case-insensitive: new names get added, names already in the library are skipped — never overwritten — and the banner reports an added/skipped count.

## Routines

- [ ] + New routine: name it, add exercises from the (non-hidden) library picker, set optional target sets/reps per exercise.
- [ ] ↑ / ↓ reorders items, and target sets/reps stay attached to the correct exercise through the reorder (no values swapped between rows).
- [ ] Save persists the routine, and the routines list shows it with the correct "N exercises" count.
- [ ] Edit an existing routine preserves its id (no duplicate created) and saves the updated name/items/order.
- [ ] Delete removes the routine from the list.

## Log (core)

- [ ] Start freestyle opens an empty active session immediately — no routine required.
- [ ] Start from routine pre-adds one entry per routine item, correctly split into a strength or cardio card based on the exercise's type.
- [ ] Add set appends a new row under an exercise, and weight/reps/RPE/note each write back to that exact row (not a neighboring one).
- [ ] A weight, reps, or RPE of exactly 0 is kept as 0 — not blanked — after leaving the field, after the screen redraws (e.g. adding another exercise), and after a reload.
- [ ] Cardio entries accept duration as `mm:ss` (e.g. `20:00`) or a bare seconds count, plus distance, a unit (mi/km/m), and a note — all persist.
- [ ] **Reload mid-session (the critical gate):** log a few sets and a cardio entry, then reload the page (or close/reopen the tab) without hitting Finish. The active session, every entry, and every field value — including any 0s — must come back exactly as left.
- [ ] Finish clears the active-session pointer and lands on History; the session itself remains in storage (findable there afterward).
- [ ] Discard deletes the in-progress session entirely and returns to the Start view — it does not reappear anywhere afterward.

## History

- [ ] Sessions list newest-first by date.
- [ ] Each card summarizes its session (exercise count, set count, cardio duration/distance where present) without needing to open it.
- [ ] Tapping a session opens a read-only detail view (no editable fields) where a set logged with weight/reps/RPE of exactly 0 still displays that 0, not blank.
- [ ] Delete (behind a confirm) removes the session and returns to the list.

## Backup / Export

- [ ] Export CSV downloads a file that opens cleanly in a spreadsheet with the exact SPEC §6 columns, in order: `date, session_name, exercise, exercise_type, set_number, weight_lb, reps, rpe, rest_sec, distance, distance_unit, duration_sec, note` — one row per set (strength) or per entry (cardio).
- [ ] Export JSON backup, then Import JSON… → Replace on that same file restores the library/routines/sessions identically (round-trip, including any 0 values).
- [ ] Import JSON… on an exercises-only file merges it into the library by name (add-if-absent) — the Phase 2 seam, same merge rule as Library's import.
- [ ] After an export, the "Last exported" reminder updates (e.g. to "just now").
- [ ] Erase all data refuses to run until you type `ERASE` exactly, then clears everything (exercises, routines, sessions, active-session pointer, last-exported stamp).

## PWA / on-device

**Must be tested on the real Pixel, over the deployed HTTPS site — a service worker will not register in the local/preview browser, so none of this is verifiable there.**

- [ ] Chrome's ⋮ menu → Add to Home screen installs the app; opening it from the home-screen icon launches standalone (no browser address bar/chrome).
- [ ] **Offline gate:** with the phone in airplane mode, open the installed app and log a set — it loads fully from cache and the set saves.
- [ ] The home-screen icon renders un-clipped (the maskable icon has safe-zone padding, not a glyph cropped to a hard edge).
