# SPEC: Phases 3 and 4, gym floor and review

**Status:** design approved section by section on 2026-09-26. The implementation plans aren't written yet.
**Builds on:** [`SPEC.md`](SPEC.md) (Phase 1) and the research codex in `workout-research` (Phase 2, Cycle 1).
**Input:** [`GAP-ANALYSIS.md`](GAP-ANALYSIS.md), which covers the usability audit, the competitor comparison and the feature gaps.

In its first week of real use the app logged workouts, but the logging screen was slow and fiddly. It also couldn't run the program it ships with. Phase 3 fixes the gym floor: logging a Cycle 1 set is one tap, and the prescription sits on screen while you lift. Phase 4 adds the review features that Strong and Hevy charge for, pointed at your goal: a bodyweight trend, personal records, weekly volume and a progression suggestion.

This is one spec with **two implementation plans**. Phase 3 ships and gets used for at least a week before the Phase 4 plan is finalized, so real use can reorder Phase 4.

---

## 1. Decisions this spec rests on

These were made with you and aren't reopened here.

| # | Decision | Why |
|---|---|---|
| D1 | **The logging screen is a focus view, one exercise at a time** (layout "B"), with an overview list one tap away. | The old screen was "poor" in real use. A focus view with steppers pre-filled from last time makes a normal set one tap, with big targets and no keyboard. |
| D2 | **Garmin measures, the app lifts.** Your Garmin owns rest timing, cardio detail, heart rate, calories, steps, intensity minutes and VO2 max. The app owns sets, load, reps, RIR, program adherence, progression and bodyweight. | You already use the watch for all of that. Web apps can't read Garmin or Health Connect data, and rebuilding Garmin's cardio analytics would add nothing. Garmin and app data get joined later, on a computer, when Cycle 2 is built (Phase 5). |
| D3 | **RIR replaces RPE** for new sets, and the CSV contract changes to v2. | The program is written in RIR, and you said the contract change is fine. Old RPE values are kept. |
| D4 | **No rest countdown and no alerts.** | The watch does it. It also sidesteps a platform limit: web apps can't schedule an alert through a locked screen. |
| D5 | **Phases 3 and 4 are both specced in depth.** | Your call. The ordering (Phase 3 ships first) keeps Phase 4 honest to real use. |

Principles from `SPEC.md` §1 still hold: you own the data, offline always works, there's no build step and no dependencies, and export is first-class. A feature that fights them loses.

---

## 2. Success criteria

**Phase 3 is done when:**

1. Every routine can be started, including the one that comes first alphabetically.
2. Logging a set that matches the pre-fill takes **one tap**. Changing one value (for example +5 lb) and logging takes **two taps**.
3. After the first time you've logged an exercise, a full Cycle 1 session can be logged **without opening the keyboard**.
4. Reloading or closing the app mid-workout loses nothing. It reopens on the same exercise with every logged set intact.
5. Discarding a workout, deleting a routine, and removing a set or exercise each need either a confirmation or an Undo.
6. Every tappable control is at least 44×44 px. The steppers and the Log button are at least 56 px tall. Nothing scrolls sideways at 360 px wide.
7. `node --test` passes, including the new tests in §12.

**Phase 4 is done when:**

1. The weekly card, the bodyweight trend, the PR detection and the progression suggestion all match hand-computed fixtures in unit tests.
2. You can log a weigh-in from the Log start screen in two taps plus typing the number.
3. "Share CSV" opens Android's share menu on the Pixel, and falls back to a download where sharing isn't supported.
4. Editing a past workout never touches the workout in progress.

---

## 3. Scope

### Phase 3: gym floor

- Hotfix items, if they aren't already shipped separately (§11.1).
- Data model v2 and its migration (§4, §5), including the seeded Cycle 1 prescriptions (§6).
- Log start screen with "Up next" (§7.1).
- Focus view (§7.2), overview (§7.3), finish and discard (§7.4).
- Searchable exercise picker with quick-add (§7.5).
- Routines, Library and History updates (§7.6–7.8).
- Backup nudge, and a fix so "last backup" only counts real backups (§7.9).
- Accessibility and visual fixes (§7.10) and code cleanup (§7.11).
- CSV v2 (§10.1).

### Phase 4: review

- Navigation becomes Log · Routines · Progress · History · More (§8.1).
- Bodyweight log (§8.2).
- Progress screen: this week, cycle counter, bodyweight chart, exercise history and PRs (§8.3).
- Progression suggestion (§8.4) and PR badges (§8.5).
- Editing past workouts (§8.6).
- Share-first export and a bodyweight CSV (§8.7).
- Settings screen (§8.8).

### Out of scope, deliberately

- Rest countdown, interval timer, heart rate, calories and steps (D2, D4).
- Garmin or Health Connect import. The Garmin join happens on a computer in Phase 5.
- Supersets, plate calculator, warm-up calculator and kg units. These are parked, not rejected.
- Accounts, cloud sync, social features, an AI coach, food logging and exercise videos. These go against the point of the app.
- Reordering routines by hand. The rotation order comes from `position` (§4), which isn't editable in this round.

### Phase 5 seams (not built, but not blocked)

- `routine.origin` identifies seeded program routines, so a later "Cycle 2 available, add it?" offer knows what to replace.
- CSV v2 carries `session_id`, `logged_at` and `muscle_group`, so a computer-side script can join the app's export with Garmin's activity export by date and time.

---

## 4. Data model v2

IndexedDB `workout-tracker`, **`DB_VERSION` 2**. The upgrade adds the `bodyweight` store; existing stores are untouched at the IndexedDB level. `SCHEMA_VERSION` becomes **2**. New fields are marked `+`.

```
meta        { key: "schema", version: 2 }                           // + now actually used

settings    { key: "app", units: "lb",
              + sessionsPerWeek: 3,
              + weeklySetBand: [6, 12],          // Cycle 1's per-muscle target
              + bodyweightRateBand: [0.5, 1.0],  // % loss per week (fat-deficit principle)
              + defaultWeightStep: 5,            // lb
              + keepScreenOn: true }

exercises   { id, name, type: "strength"|"cardio", muscleGroup, equipment,
              custom, hidden, createdAt,
              + weightStep: number|null }        // null → settings.defaultWeightStep

routines    { id, name, createdAt, updatedAt,
              + position: int,                   // list order + rotation order
              + origin: { cycle: "cycle-1", key: "push"|"pull"|"legs" } | null,
              items: [ { exerciseId,
                         targetSets: int|null,
                         + repMin: int|null, + repMax: int|null,   // replaces targetReps
                         + rirMin: int|null, + rirMax: int|null,
                         note: string } ] }

sessions    { id, date /* start, ISO */, name, routineId|null, notes,
              + finishedAt: ISO|null,             // null = in progress, or legacy
              + cursor: int,                      // focus-view position, for resume
              entries: [
                { exerciseId, type: "strength",
                  + target: Target|null,          // snapshot at start
                  sets: [ { weight: number|null, reps: int|null,
                            + rir: int|null,       // 0–4; 4 means "4+"
                            rpe: number|null,      // legacy, read-only
                            note: string,
                            + loggedAt: ISO|null } ] },
                { exerciseId, type: "cardio",
                  + target: { note }|null,
                  + done: bool,
                  durationSec: int|null, distance: number|null, distanceUnit, note }
              ] }

+ bodyweight { date: "YYYY-MM-DD" /* key, local date */, weightLb: number, loggedAt: ISO }   // Phase 4 uses it; created in Phase 3's upgrade

Target = { sets: int|null, repMin: int|null, repMax: int|null,
           rirMin: int|null, rirMax: int|null, note: string }
```

**Rules that always hold:**

- At most one session is in progress: the one named by `localStorage.activeSessionId`.
- A strength set exists only once it's logged. The app never creates empty sets.
- `repMin <= repMax` and `rirMin <= rirMax` whenever both are set. The routine editor enforces this by swapping reversed values on save.
- If only one of a min/max pair is given, the other is set to match (an "8" means 8–8).
- `rir` is an integer from 0 to 4. The UI shows 4 as "4+".
- `restSec` is removed from new sets. The CSV never filled it (§10.1).

**Why `bodyweight` is created in Phase 3:** the `DB_VERSION` bump and the data migration happen once. Phase 4 then needs no second upgrade.

---

## 5. Migration v1 → v2

### 5.1 The pure migration

`migrateV1toV2(state, { seedRoutines, seedExerciseNames }) → state` lives in `schema.js` and is chained from `migrate()`. It has no I/O and is unit-tested. Steps:

1. **Routines.**
   - For each item: `repMin = repMax = targetReps ?? null`; drop `targetReps`; set `rirMin = rirMax = null`; keep `note`.
   - Assign `position`: known Cycle 1 names first, in seed order (Push, Pull, Legs), then everything else alphabetically.
   - Set `origin = null`.
2. **Starter refresh.** Take each routine whose name matches a seed routine (case-insensitive) and that **has never been edited** (`updatedAt === createdAt`). Replace its items with the v2 seed items (§6), resolving exercises by name. Set `origin` to the seed's `{cycle, key}`. Keep its `id`. Routines you've edited are left alone.
3. **Sessions.**
   - Set `finishedAt = null` and `cursor = 0`.
   - Each entry gets `target = null`.
   - Strength sets gain `rir = null` and `loggedAt = null`; their `rpe` is kept and `restSec` is dropped.
   - Cardio entries gain `done = true`, since legacy cardio was deliberately logged.
4. **Exercises.**
   - Every exercise gains `weightStep = null`.
   - **Legacy default cleanup:** an exercise is set `hidden = true` when all three hold: `custom === false`, its name isn't in `seedExerciseNames`, and no routine item or session entry references its id. It's hidden, never deleted, so "Show hidden" brings it back.
5. **Settings.** Missing keys get the defaults from §4.
6. **Bodyweight.** Starts as `[]` if absent.

Running it again on v2 data changes nothing (it's idempotent).

### 5.2 On launch

1. `openDb()` at `DB_VERSION` 2. `onupgradeneeded` creates any missing stores, including `bodyweight`.
2. Read `meta.schema`.
   - **Missing and `exercises` empty:** this is a fresh install. Seed the v2 exercises and routines, then write `meta.schema = 2`.
   - **Missing and `exercises` not empty:** this is v1 data. Read every store, run `migrateV1toV2`, then write every store **and** `meta.schema = 2` in **one** multi-store transaction.
   - **2:** nothing to do.
3. `syncDefaultExercises()` (add-if-absent by name, unchanged).
4. Render.

**If the migration fails:** because it's a single transaction, nothing is written. The app shows a blocking screen: "The update couldn't upgrade your data. Nothing was changed. Download a backup, then reload." It has a button that downloads the raw stores as a v1 JSON backup. No v2 screen ever runs on v1 data.

### 5.3 Old backups

Restoring a v1 JSON backup runs the same `migrate()` chain before replace or merge. A backup newer than the app is still refused with the existing `VERSION` error.

---

## 6. Seeded Cycle 1 prescriptions (v2)

`seed/routines.default.json` moves to v2. The values are transcribed from `workout-research/cycle-1.md` and keep exercise names identical to the exercise seed.

```json
{ "routines": [
  { "key": "push", "cycle": "cycle-1", "name": "Push (Cycle 1)", "items": [
    { "exercise": "Barbell Bench Press", "sets": 3, "repMin": 6, "repMax": 8, "rirMin": 2, "rirMax": 2, "note": "Primary press. Rest ~2 min." }
  ] } ] }
```

The snippet shows the shape with one item. The table below holds every value. The seed's `sets` maps to the routine item's `targetSets`. Cardio items leave `sets`, reps and RIR null.

| Routine | Exercise | Sets | Reps | RIR | Note |
|---|---|---|---|---|---|
| Push | Barbell Bench Press | 3 | 6–8 | 2 | Primary press. Rest ~2 min. |
| Push | Overhead Press | 3 | 8–10 | 2 | |
| Push | Incline Dumbbell Press | 2 | 10–12 | 1–2 | |
| Push | Cable Lateral Raise | 3 | 12–15 | 0–1 | |
| Push | Triceps Pushdown | 3 | 10–12 | 1 | |
| Push | Stationary Bike | – | – | – | Do last. ~8 min: 30 s hard / 60 s easy × 5–6. Track it on your Garmin. |
| Pull | Lat Pulldown | 3 | 8–10 | 2 | Primary vertical pull. Swap: Pull-up. |
| Pull | Chest-Supported Row | 3 | 8–10 | 2 | Spares the low back. |
| Pull | Seated Cable Row | 2 | 10–12 | 1–2 | |
| Pull | Face Pull | 3 | 15–15 | – | Rear delts, shoulder health. |
| Pull | Dumbbell Curl | 3 | 10–12 | 1 | |
| Pull | Rowing Erg | – | – | – | Do last. ~8 min: 30 s hard / 60 s easy × 5–6 (or bike). Track it on your Garmin. |
| Legs | Back Squat | 3 | 6–8 | 2–3 | Primary squat. Rest ~2–3 min. Swap: Hack Squat. |
| Legs | Romanian Deadlift | 3 | 8–10 | 2 | Hip hinge, hamstrings. |
| Legs | Leg Press | 2 | 12–15 | 1 | |
| Legs | Seated Leg Curl | 3 | 10–12 | 1 | |
| Legs | Standing Calf Raise | 3 | 12–15 | – | |
| Legs | Stationary Bike | – | – | – | EASY Zone 2 cool-down, ~6–8 min. Not intervals on leg day. |

Fresh installs seed these with `origin` and `position` 0, 1, 2. Existing installs get them through the starter refresh (§5.1 step 2). "Pull-up" and "Hack Squat" are already in the exercise seed, so Swap (§7.2) can reach them.

**Known and accurate:** as written, Cycle 1 gives Chest 5 sets a week. The other groups get Shoulders 9, Back 8, Legs 8, Arms 6 and Posterior chain 6. The Phase 4 weekly card will show Chest below the 6–12 band. That's the program as designed, not a bug, and it's an input for Cycle 2.

---

## 7. Phase 3: screens and behaviour

### 7.1 Log start screen (no workout in progress)

Top to bottom:

1. **Backup nudge.** Shown only if at least one finished session exists and the last *JSON backup* was more than 7 days ago, or never: "Last backup 12 days ago · Back up ›". Tapping it opens Backup.
2. **Up next card.** "Up next · Legs (Cycle 1) · 6 exercises" with a large primary **Start** button.
   - **Rotation rule:** find the most recent session whose `routineId` still exists. Up next is the routine with the next `position` after it, wrapping round.
   - With no routine session yet, Up next is the routine with the lowest `position`.
   - With no routines at all, the card is replaced by "No routines yet · Build one in Routines ›".
3. **Other routines.** One secondary button per remaining routine, in `position` order. Tapping one starts it.
4. **Freestyle.** A secondary button.
5. *(Phase 4)* The weigh-in card (§8.2).

No `<select>` elements. This removes the placeholder bug for good.

**Starting a workout:**
- Create the session with `date = now`, `cursor = 0`, `finishedAt = null`.
- Add one entry per routine item, with `target` copied from the item (strength) or `{note}` (cardio).
- Save, set `activeSessionId`, and open the focus view on entry 0.
- Freestyle opens the picker (§7.5) straight away. Picking an exercise adds it and opens the focus view. Cancelling leaves an empty workout on the overview.

### 7.2 Focus view (strength)

The layout, top to bottom:

```
‹  2 of 6  ›                         12:04   [≡ overview]
Barbell Bench Press
Target 3 × 6–8 @ RIR 2 · Primary press. Rest ~2 min.
Last time Mon Sep 21 · 135 × 8, 8, 7
(Phase 4) → Try 140 lb for 6+           [or: Stay at 135, beat 8, 8, 7]
──────────────────────────────
Set 1 · 135 × 8 · RIR 2        ✓      ← tap to edit
Set 2 · 135 × 8 · RIR 2        ✓
──────────────────────────────
Weight (lb)   [ −5 ]   135   [ +5 ]    ← tap 135 to type
Reps          [ −1 ]    8    [ +1 ]    ← tap 8 to type
RIR           ( 0 )( 1 )(•2 )( 3 )( 4+ )
+ Add note
[        Log set 3 of 3        ]       ← primary, full width, ≥56 px
```

**Header.**
- ‹ and › move to the previous and next entry, and write `session.cursor`.
- The clock is elapsed time since `session.date`, shown as m:ss (h:mm:ss after an hour), ticking every second.
- ≡ opens the overview.

**Target line.** Rendered from `entry.target`:
- Sets and reps: "3 × 6–8" when min and max differ, "3 × 15" when they're equal. Sets are omitted if null.
- " @ RIR 2" or " @ RIR 1–2", omitted if null.
- Then the note.
- If the whole target is null, the line is left out.

**Last time line.** Taken from `lastPerformance(sessions, exerciseId, excludeSessionId)` (§9.1).
- Format: "Mon Sep 21 · 135 × 8, 8, 7" when every set used the same weight; otherwise "135 × 8, 140 × 6".
- A set with no weight shows as "BW × 10".
- With no history the line reads "First time: pick a starting weight".

**Steppers.**
- **Weight:** −/+ by `exercise.weightStep ?? settings.defaultWeightStep`, with a floor of 0. From blank, + starts at one step and − does nothing. Tapping the value opens an `inputmode="decimal"` field. Blank means bodyweight, or no added weight.
- **Reps:** −/+ 1, with a floor of 0. Tapping the value opens `inputmode="numeric"`.
- **RIR:** a radio group of chips for 0–4+. Tapping the selected chip clears it (null).
- **Size:** every control is at least 56 px tall, and the − and + buttons are at least 56 px wide.

**Pre-fill.** The steppers are loaded by `prefillSet()` (§9.1). The order of precedence:
1. The previous set **logged this session** for this entry.
2. Otherwise **last time's matching set** (by index, falling back to last time's final set).
3. Otherwise the target: reps = `repMin`, RIR = `rirMax`, weight empty.

In Phase 4, when a suggestion exists (§8.4), it overrides set 1's pre-fill.

**Log set.**
- The button is labelled "Log set N of M" when a target exists, otherwise "Log set N".
- Tapping it appends `{weight, reps, rir, note, loggedAt: now}`, saves (through the existing persist-every-change chokepoint), calls `navigator.vibrate?.(30)`, clears the note, and re-runs pre-fill for the next set.
- If reps are empty, logging is blocked with an inline "Enter reps" message. Weight may be empty.
- Once the logged sets reach the target: the primary button becomes **"Next: Overhead Press ›"**, and a secondary **"Log extra set"** appears. On the last entry, the primary button becomes **"Review & finish ›"**, which opens the overview.

**Editing a logged set.**
- Tapping a logged set loads its values into the steppers. The primary button becomes "Save set 2", with secondary **Delete set** and **Cancel**.
- Delete removes the set straight away and shows an Undo toast for 5 s (§7.11 toast).
- Cancel returns to new-set mode.

**Menu (… in the header):**
- **Swap exercise.** Opens the picker filtered to the same type.
  - If the entry has no sets, its `exerciseId` is replaced and the target kept.
  - If it has sets, a confirmation asks: "Keep the 2 logged sets under Lat Pulldown and continue with Pull-up?" Yes inserts a new entry after the current one, with the same target, and moves to it.
- **Remove exercise.** Removes the entry and its sets, with an Undo toast.

**Keep screen on.** While the focus view or overview is showing and `settings.keepScreenOn` is true:
- Request a screen wake lock. Request it again on `visibilitychange` → visible.
- Release it when leaving the Log tab, finishing or discarding.
- Failures are ignored silently.

### 7.2a Focus view (cardio)

- **Header:** the same as strength.
- **Target line:** `target.note`, then a muted "Track it on your Garmin."
- **Controls:** an optional **minutes** stepper (−/+ 1, tap to type), stored as `durationSec = minutes × 60`. Distance and unit sit behind "+ Distance". Then a primary **Mark done** button.
- **After Mark done:** the entry gets `done = true`, and the button becomes "Next ›" or "Review & finish ›". Tapping "Done ✓" again sets `done = false`.

### 7.3 Overview

- **Header:** the session name, the elapsed clock, and a … menu with **Discard workout**.
- **Rows:** one per entry, showing the exercise name and progress: "2 / 3", or "2 sets" with no target, or ✓ when target met or cardio done, or "—" when not started. Tapping a row opens the focus view at that entry.
- **+ Add exercise:** opens the picker. The pick is appended with `target = null` and opened in the focus view.
- **Finish workout:** the primary button, which opens the finish summary (§7.4).
- **Landing:** Log shows the overview only when you navigate to it. Returning to the Log tab mid-workout reopens the focus view at `session.cursor`.

### 7.4 Finish and discard

**Finish summary** (an in-flow panel, not a modal):
- It shows "Finish Push (Cycle 1)? **14 sets · 42 min**", then "Not logged (will be removed): Triceps Pushdown".
- Buttons: **Finish** (primary) and **Keep going**.
- **Stale workout:** if more than 30 minutes have passed since the last `loggedAt`, it adds a line: "Last set was 2 h ago. Use that as the finish time?" This is a checkbox, **on by default**, and it sets `finishedAt` to the last set's `loggedAt` + 60 s.
- **Nothing logged:** if nothing has been logged at all, it shows "Nothing logged yet" with **Discard** as the only way out, alongside Keep going.

**Finish:**
- Remove strength entries with no sets, and cardio entries that aren't done and have no duration or distance.
- Set `finishedAt` and save. If the save fails, stay put and show the existing save-error banner.
- Clear `activeSessionId`, release the wake lock, and open **that session's History detail**.

**Discard** (from the overview menu): `confirm("Discard this workout? 14 logged sets will be deleted.")`. There's no confirmation when zero sets are logged. It deletes the session, clears `activeSessionId` and returns to the Log start screen.

### 7.5 Exercise picker (`picker.js`)

`openPicker(root, { title, type?, onPick(exercise), onCancel })` is one in-flow full-screen view, used by: Freestyle start, Add exercise, Swap, and the routine editor.

**Layout:**
- A back ‹ button and the title.
- A search field (`type="search"` with an `aria-label`). It isn't auto-focused, so the keyboard stays down until you tap it.
- Muscle-group chips: All, then the groups present, in the order Chest, Shoulders, Back, Arms, Legs, Posterior chain, Conditioning, then any others alphabetically.
- The list, grouped under muscle-group headings. Hidden exercises are excluded. When `type` is given, it filters to that type.

**Matching:** case-insensitive substring match on the name, muscle group and equipment. Changing search or chip updates the list live and shows a count ("12 exercises").

**Quick-add:** when the search has text, the last row is **"+ Create ‘{search text}’"**.
- It creates a custom exercise with `type = type ?? "strength"` and `muscleGroup` = the active chip, or "" when the chip is All.
- It then calls `onPick` with the new exercise.
- If an exercise of that name already exists (case-insensitive), the row isn't shown.

**Empty state:** "No matches · Clear search".

### 7.6 Routines

- **List:** sorted by `position`. Each card shows the name and "6 exercises", with buttons **Start** (primary), **Edit** and **Delete**.
- **Delete:** `confirm("Delete routine ‘Push (Cycle 1)’? Past workouts are kept.")`.
- **New routines:** get `position = max + 1`.
- **Editor:**
  - The name.
  - An item per exercise: name, ↑ ↓ ×, then Sets | Reps min | Reps max | RIR min | RIR max (numeric), then Note (text).
  - "+ Add exercise" opens the picker.
  - **Save** normalizes the min/max pairs (§4 rules), keeps `origin`, and updates `updatedAt`.
  - **Cancel** asks "Discard changes?" when anything changed.

### 7.7 Library

- A search field (`type="search"` with an `aria-label`), muscle-group chips (the same order as the picker), a result count, and an empty state with **Clear**.
- **Show hidden:** the checkbox is sized normally (§7.10).
- **Exercise form:** adds **Weight step (lb)** (optional number > 0; blank uses the default).
- **Import:** removed from Library, since it lives in Backup only.

### 7.8 History

- **List:** session cards become `<button>`s showing the name, date and "14 sets · 42 min". Duration is left out when `finishedAt` is null.
- **Detail:** per entry:
  - The exercise name.
  - "Target 3 × 6–8 @ RIR 2" when a target exists.
  - Sets: "1 · 135 × 8 · RIR 2". Legacy sets show "RPE 8" when `rir` is null and `rpe` is set.
  - Cardio: "Done · 8 min", plus any note.
- **Delete** keeps its confirmation.
- *(Phase 4)* adds Edit and PR badges.

### 7.9 Backup

- `lastExport` is stamped **only by the JSON backup**, because the CSV can't restore anything. The label reads "Last backup: …".
- Import stays here, and only here.
- The CSV export uses v2 (§10.1).

### 7.10 Accessibility and visual fixes

| Fix | Detail |
|---|---|
| Checkbox width | `input:not([type=checkbox]):not([type=radio]), select { width:100% }`, and checkboxes get their native size. |
| Control borders | `--line` for inputs and cards is lightened so a control's edge is at least 3:1 against its fill (about `#4a5b70`). |
| Active tab | Add a 3 px accent top bar and a 600 weight to `[aria-current="true"]`, not colour alone. |
| Focus | `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`. |
| Safe area | `.tabbar { padding-bottom: env(safe-area-inset-bottom) }`, with body padding adjusted to match. |
| Headings | The top-bar `h1` stays the largest text; content headings step down. |
| Labels | Every stepper button has an `aria-label` ("Increase weight by 5 lb"). Values are `<output aria-live="polite">`. RIR chips are a `role="radiogroup"`. |
| Status | Notices and toasts get `role="status"`; the save-error banner gets `role="alert"`. |
| Primary buttons | `.primary` gets `border:1px solid transparent` so primary and secondary buttons are the same height. |
| Done state | Shown with a ✓ icon and text as well as colour. |

### 7.11 Code cleanup (rides along with Phase 3)

- **`js/format.js`** (pure): `numberOrNull`, `parseDuration` (rejects `1:2:3:4`, negatives and non-numbers), `formatDuration` (h:mm:ss past an hour), `formatSets`, `formatTarget`. The five copy-pasted versions are deleted.
- **`js/keys.js`:** the localStorage key constants `ACTIVE_SESSION` (`"activeSessionId"`) and `LAST_BACKUP` (`"lastExport"`). The stored strings don't change, so existing values survive the update.
- **The v1 `starterRoutinesSeeded` flag is retired.** Starter routines are seeded only on a fresh install (§5.2), so a routine you delete never comes back.
- **`ui.js`:**
  - `field()` moves here.
  - `showToast(text, {actionLabel, onAction, ms = 5000})` is added.
  - `pickFile` resolves `null` on the input's `cancel` event.
- **Screen lifecycle:** a renderer may return a cleanup function. `showScreen` calls the previous screen's cleanup before switching. The elapsed-clock interval and the wake lock rely on this.
- **Atomic restore:** `importState` writes every store, and `meta`, in **one** multi-store transaction.
- **Erase all:** clears every store, including `meta`, and removes the old `starterRoutinesSeeded` key. The next launch is then a fresh install, so starter routines and exercises re-seed.
- **Duplicate-name import banner:** it reports duplicates and invalid rows separately.

---

## 8. Phase 4: screens and behaviour

### 8.1 Navigation

- **Tabs:** Log · Routines · Progress · History · More.
- **More:** a list with Library, Backup & export, and Settings. Each sub-screen has "‹ More" and sets the top-bar title.
- **Erase all data:** moves from Backup to Settings.

### 8.2 Bodyweight

**Weigh-in card** on the Log start screen (not shown during a workout):
- It shows "Weigh-in · Today 201.4 lb · Edit", or **Log weight** when there's no entry for today.
- Tapping opens an inline `inputmode="decimal"` field, pre-filled with the most recent weight, plus **Save**.
- **Validation:** 50–700 lb, one decimal place. Otherwise the error "Enter a weight between 50 and 700 lb".
- **Storage:** one record per local date (`YYYY-MM-DD`). Saving again the same day overwrites that record.

**List:** Progress → Weigh-ins shows the newest 30 with Edit and Delete (Delete confirms), plus **Show all**.

### 8.3 Progress screen

Top to bottom:

1. **This week.** The week runs Monday to Sunday in local time.
   - **Workouts:** "2 of 3" (`settings.sessionsPerWeek`), counting sessions with `finishedAt` in the week.
   - **Sets per muscle group:** one horizontal bar per group, counting logged strength sets in the week's finished sessions. Conditioning and cardio are excluded. The band `settings.weeklySetBand` is drawn as a shaded range, with a text status of "below", "in range" or "above". The caption reads "Program target 6–12 (Cycle 1)", since that band is Cycle 1's stated target, not a study optimum.
   - **Bodyweight:** "7-day avg 201.2 lb · −0.7%/wk". `avgNow` is the mean of weigh-ins over the last 7 days (today plus the 6 days before); `avgPrev` is the mean over the 7 days before that; `ratePct = (avgNow − avgPrev) / avgPrev × 100`. The status is judged against `bodyweightRateBand` as a loss:
     - **In range** when −1.0 ≤ rate ≤ −0.5.
     - **"Faster than 1%/wk: risks muscle"** when rate < −1.0.
     - **"Slower than 0.5%/wk"** when rate > −0.5.
     - If either window has no weigh-in: "Need a weigh-in in each of the last two weeks".
     - The caption cites the fat-deficit principle with a link: ISSN position stand, [10.1186/s12970-017-0174-y](https://pmc.ncbi.nlm.nih.gov/articles/PMC5470183/).
   - **A line pointing to Garmin:** "Cardio minutes, steps, heart rate, VO2 max: Garmin Connect."
2. **Cycle counter.** "Cycle 1 · week 4".
   - The week number is `floor((today − first finished session of any routine with origin.cycle "cycle-1") / 7 days) + 1`.
   - From week 6 on it adds: "Weeks 6–8: plan a deload week (lighter loads, fewer sets), per the program."
   - It's hidden with no Cycle 1 sessions.
3. **Bodyweight chart.** The last 84 days, as an inline SVG, full width, 160 px tall.
   - One dot per weigh-in, plus a line through the rolling 7-day mean, drawn on each day that has a weigh-in.
   - The y axis runs from the minimum to the maximum weight, each rounded out to 5 lb, with 3 labels. X labels mark every other Monday.
   - With fewer than 2 weigh-ins it shows "Log a few weigh-ins to see a trend".
4. **Exercises.** Every exercise with at least one logged set, most recently used first. Each row shows the name and "Best est. 1RM 184 lb". Tapping a row opens the **exercise detail**:
   - Best set: "145 × 8 · Sep 21".
   - The estimated 1RM record.
   - A chart of the best estimated 1RM per session over all history.
   - A list of past sessions (date plus sets, formatted as in §7.2).

### 8.4 Progression suggestion

`suggestNext(target, lastSets, step) → Suggestion|null` (§9.1). It's shown in the focus view under "Last time", and it sets **set 1's** pre-fill. Later sets pre-fill from the previous set logged this session, as usual.

**Returns null (no suggestion shown)** when the target is null, `repMax` is null, there are no `lastSets`, or any last set has a null weight.

**The rule:**
- `workWeight` = the heaviest weight in `lastSets`; `workSets` = the sets at `workWeight`.
- **Increase** when all of these hold:
  - `workSets.length >= (target.sets ?? 1)`, and
  - every work set has `reps >= repMax`, and
  - every work set has `rir == null || target.rirMin == null || rir >= target.rirMin`.
- An increase returns `{ action: "increase", weight: workWeight + step, reps: target.repMin ?? target.repMax }` and displays **"→ Try 140 lb for 6+"**.
- **Otherwise:** `{ action: "hold", weight: workWeight, reps: workSets[0].reps }`, displayed as **"→ Stay at 135, beat 8, 8, 7"**.

This is **double progression as written in `cycle-1.md`**, which says to add reps to the top of the range at the target RIR, then add load. It's labelled in the app's detail text as the program's rule, not a study finding. The RIR clause is conservative: a set that went closer to failure than prescribed doesn't earn a load increase.

### 8.5 Personal records

- `e1rm(weight, reps) = weight × (1 + reps / 30)` (Epley).
- It's defined only for weight > 0 and reps from 1 to 15; otherwise null. When reps is 1, the result is just the weight.
- **A set is a PR** when its e1RM is strictly greater than every earlier e1RM for that exercise (earlier sets across all sessions, plus earlier sets this session), **and** at least one earlier qualifying set exists. The very first set ever isn't a PR.
- PRs are computed, not stored.
- **In the focus view:** a "PR" badge on the logged set, plus the toast "New PR · est. 1RM 184 lb".
- **In History detail:** a "PR" badge on the set.
- The label everywhere is "est. 1RM", never "1RM".

### 8.6 Editing past workouts

- **Entry point:** History detail → **Edit** opens the overview and focus view in **edit mode** on a deep copy.
- **Differences from a live workout:**
  - The header reads "Editing · Mon Sep 21". There's no elapsed clock and no wake lock, and `activeSessionId` isn't touched.
  - Every set action works (log, edit, delete, add or remove exercise, swap). There's also a name field on the overview.
  - The overview's primary button is **Save changes**. **Cancel** asks "Discard changes?" when anything changed.
- **What Save does not change:** `date`, `finishedAt` or `id`.
- **If the app closes mid-edit,** the working copy is lost. That's acceptable and stated in the UI ("Unsaved edits are lost if you leave").
- **Starting a new workout** is blocked while in edit mode ("Finish editing first").
- **Implementation:** the session editor takes `mode: "active" | "edit"`. Active mode persists every change; edit mode persists on Save.

### 8.7 Export

The Backup & export screen:

| Button | File | Behaviour |
|---|---|---|
| Share workouts CSV | `workouts-YYYY-MM-DD.csv` (§10.1) | Share first, with download as the fallback |
| Share bodyweight CSV | `bodyweight-YYYY-MM-DD.csv` (§10.2) | Share first, with download as the fallback |
| Download JSON backup | `workout-backup-YYYY-MM-DD.json` (v2) | Download. Stamps "Last backup" |

- **Share first:** build a `File` and call `navigator.share({ files: [file] })` if `navigator.canShare?.({ files: [file] })` returns true. Otherwise download.
- **Cancelling** the share menu (`AbortError`) does nothing. Any other error falls back to download.
- **Why the JSON backup is download-only:** Chrome restricts which file types can be shared, and the fallback covers it. Keeping backup as a plain download also makes its behaviour predictable.

### 8.8 Settings

Settings has these fields: sessions per week; weekly sets band (min, max); bodyweight rate band (min %, max %); default weight step (lb); a keep-screen-on toggle; units (lb, read-only); and **Erase all data…** (the existing type-ERASE flow).

- Each field saves on change.
- Invalid values (min > max, or non-positive numbers) show an inline error and aren't saved.

---

## 9. Module map and pure-logic contracts

### 9.1 New and changed modules

| File | Kind | Phase | Responsibility |
|---|---|---|---|
| `js/format.js` | pure | 3 | Number and duration parsing and formatting, `formatSets`, `formatTarget` |
| `js/keys.js` | const | 3 | localStorage keys |
| `js/progression.js` | pure | 3 (+4) | `lastPerformance`, `prefillSet`, `nextRoutine`, and in Phase 4 `suggestNext` |
| `js/stats.js` | pure | 4 | `e1rm`, `markPrs`, `weeklySetsByMuscle`, `bodyweightRate`, `rolling7`, `cycleWeek`, `weekBounds` |
| `js/chart.js` | pure | 4 | `scale`, `ticks`, `linePath(points)` → SVG path data. Numbers only, no DOM |
| `js/schema.js` | pure | 3 | v2 constructors, `defaultSettings`, `migrateV1toV2`, `migrate` chain |
| `js/exporter.js` | pure | 3 (+4) | CSV v2, bodyweight CSV, backup v2 |
| `js/importer.js` | pure | 3 | Restore through migrate; bodyweight merge (union by date, existing wins) |
| `js/storage.js` | I/O | 3 | `DB_VERSION` 2, `bodyweight` store, multi-store `transact()`, atomic `importState`, meta read/write |
| `js/app.js` | I/O | 3 (+4) | Boot sequence (§5.2), screen lifecycle, tabs (Phase 4: More) |
| `js/session.js` | UI | 3 | Log start screen, session lifecycle, overview, finish and discard; `mode: active\|edit` (Phase 4) |
| `js/focus.js` | UI | 3 | Focus view (strength and cardio), steppers, set edit, swap and remove, wake lock |
| `js/picker.js` | UI | 3 | Exercise picker with quick-add |
| `js/routines.js`, `js/library.js`, `js/history.js`, `js/backup.js` | UI | 3 (+4) | Updates in §7.6–7.9 and §8 |
| `js/progress.js` | UI | 4 | Progress screen, exercise detail, weigh-in list |
| `js/more.js`, `js/settings.js` | UI | 4 | More menu, Settings |
| `service-worker.js` | — | 3, 4 | `SHELL` includes every file above; `CACHE` bumped on every deploy |

### 9.2 Pure function contracts

All take plain data and return plain data. No DOM, no IndexedDB, no `Date.now()` inside: "now" is always passed in. Week and day boundaries use local time. Tests build dates with local constructors (`new Date(2026, 8, 21)`) so they pass in any time zone.

```js
// progression.js
lastPerformance(sessions, exerciseId, { excludeId, before })
  // → { date, sets } | null. Most recent session dated before `before`, other than
  //   excludeId, with a strength entry for exerciseId holding ≥1 set. Live workout:
  //   excludeId = its id, before = now. Edit mode: excludeId = the edited session's id,
  //   before = its date, so "last time" means last time *before that workout*.
prefillSet({ loggedThisSession, lastSets, target, suggestion })
  // → { weight, reps, rir }. Precedence per §7.2, then suggestion overrides set 1 (Phase 4).
nextRoutine(routines, sessions)
  // → routine | null. Rotation rule per §7.1.
suggestNext(target, lastSets, step)
  // → { action: "increase"|"hold", weight, reps } | null. Rule per §8.4.

// stats.js
e1rm(weight, reps)                                 // → number | null   (§8.5)
markPrs(orderedSets)                               // → boolean[]  (orderedSets chronological, one exercise)
weekBounds(nowIso)                                 // → { start, end } local Monday 00:00 → next Monday
weeklySetsByMuscle(sessions, exercisesById, bounds) // → { [muscleGroup]: count }
rolling7(entries, dayIso)                          // → mean | null
bodyweightRate(entries, todayIso)                  // → { avg, ratePct } | { avg, ratePct: null }
cycleWeek(sessions, routinesById, cycle, todayIso) // → int | null

// chart.js
ticks(min, max, count, step)                       // → number[] rounded to step
scale(domain, range)                               // → (v) => px
linePath(points, xScale, yScale)                   // → "M x y L x y ..."
```

---

## 10. Data contracts

### 10.1 Workouts CSV, v2

One row per logged strength set, or per kept cardio entry. The column order is fixed:

```
date, session_id, session_name, session_duration_sec, exercise, exercise_type, muscle_group,
set_number, weight_lb, reps, rir, rpe, logged_at,
distance, distance_unit, duration_sec, note
```

**Changes from v1:**
- Added: `session_id`, `session_duration_sec`, `muscle_group`, `rir` and `logged_at`.
- Removed: `rest_sec`, which v1 never filled.
- `rpe` stays, filled only on legacy rows.

**Field rules:**
- `session_duration_sec` = `finishedAt − date` in seconds, blank when `finishedAt` is null.
- Cardio rows have `set_number = 1`, and the strength columns are blank.
- Encoding is UTF-8 with RFC-4180 quoting, as in v1.

### 10.2 Bodyweight CSV

```
date, weight_lb
```

One row per weigh-in, oldest first.

### 10.3 JSON backup, v2

`{ schemaVersion: 2, exportedAt, settings, exercises, routines, sessions, bodyweight }`.

- A v1 backup restores through `migrate()` (§5.3).
- **Merge mode:** `bodyweight` is combined by `date`, and existing records win.
- **Replace mode:** it's replaced wholesale, like the other stores.

---

## 11. Delivery

### 11.1 Order

1. **Hotfix** (optional, before Phase 3, on its own branch):
   - Set `selected` on the placeholder option in the three `<select>` pickers.
   - `confirm()` on Discard and on routine Delete.
   - Fix the checkbox width.
   - Bump `CACHE`, then deploy.
   - Phase 3 replaces the pickers anyway, so this is purely to unblock the workouts before Phase 3 ships.
2. **Phase 3:**
   - Branch `phase-3` and write the implementation plan `PLAN-PHASE-3.md`.
   - Build, test, then walk through GATES, including the migration gate on a copy of real v1 data.
   - Deploy.
3. **Use it** for at least one week (3 sessions). Collect friction notes.
4. **Phase 4:**
   - Revise the Phase 4 plan (`PLAN-PHASE-4.md`) with those notes; the spec changes only if a decision changes.
   - Build, test, walk through GATES.
   - Deploy.

### 11.2 Deploy mechanics (unchanged)

`vercel --prod` from the project directory, with `CACHE` bumped in `service-worker.js` on every deploy. Your installed app updates on its next launch or two.

---

## 12. Testing and gates

### 12.1 Automated (`node --test`, zero dependencies)

The existing 29 tests stay green. New tests:

| Module | Cases |
|---|---|
| `schema` | `migrateV1toV2`: targetReps → min/max; the starter refresh applies only to unedited routines; edited routines are untouched; legacy defaults are hidden only when unreferenced; cardio `done = true`; the RPE kept; it's idempotent; settings get defaults. `migrate` chain: v1 → v2; v2 unchanged; v3 rejected. |
| `format` | `parseDuration` accepts `mm:ss`, `h:mm:ss` and bare seconds, and rejects `1:2:3:4`, negatives and letters. `formatDuration` crosses an hour. `formatTarget` covers every null combination. `formatSets` covers equal and mixed weights and bodyweight. |
| `progression` | `lastPerformance` skips the in-progress session and sessions without that exercise, and picks the most recent. `prefillSet` follows the precedence in order. `nextRoutine` wraps, skips deleted routines, and handles no history. `suggestNext` covers increase, hold on a missed rep, hold on too-low RIR, hold on too few sets, null cases, and mixed weights using the heaviest. |
| `stats` | `e1rm` bounds. `markPrs` never marks the first set and needs strictly greater. `weekBounds` over a Sunday → Monday boundary. `weeklySetsByMuscle` excludes Conditioning, cardio and unfinished sessions. `bodyweightRate` returns null with an empty window and gets the sign right. `cycleWeek`. |
| `chart` | `ticks` rounding; `linePath` on 0, 1 and n points. |
| `exporter` | CSV v2 header order, cardio rows, blank duration when unfinished, legacy RPE rows, bodyweight CSV, backup v2 shape. |
| `importer` | A v1 backup restores into v2 shape; bodyweight merge by date with existing winning. |
| **Service worker** | New: every file under `js/` and `seed/` appears in `SHELL`. This prevents a missing module from breaking offline use. |

### 12.2 GATES.md additions (browser preview at 360 × 800, plus the Pixel for the PWA items)

**Phase 3:**
- Up next starts the correct routine. Each other routine button starts its routine, **including the one that's alphabetically first**.
- Focus view:
  - A set matching the pre-fill logs in one tap; +5 then Log takes two.
  - The pre-fill follows the precedence.
  - Editing, deleting (with Undo) and swapping work, both with and without logged sets.
  - Cardio Mark done works.
- Reloading mid-workout lands on the same exercise with every set intact.
- Finish:
  - The summary counts are right, and empty entries are removed.
  - The stale-workout checkbox sets the finish time.
  - It lands on the History detail.
- Discard confirms with the right count. Routine delete confirms.
- Picker: search, chips, count and quick-add work, and the keyboard doesn't open on arrival.
- **Migration gate:**
  - Load a v1 database (made by the current production build) into the preview, then load the v2 build.
  - Routines have their ranges, and edited routines are untouched.
  - History is intact, the CSV v2 exports, and `meta.schema = 2`.
  - Force a transaction failure and check the blocking screen and raw backup download.
- The wake lock is held during a workout and released after Finish (checked in devtools).
- The accessibility fixes in §7.10 can be seen and tabbed through. Nothing scrolls sideways at 360 px.

**Phase 4:**
- Weigh-in: save, re-save the same day to overwrite, validation, the list, and editing and deleting.
- Progress: the week card, bars and band, the rate status for each branch, the cycle counter, the deload line from week 6, the chart with 0, 1 and many weigh-ins, and exercise detail.
- The suggestion appears and pre-fills set 1. A PR badge and toast show on a real PR, and not on the first set ever.
- Edit mode:
  - Edits save, and Cancel discards.
  - The workout in progress is untouched.
  - A new workout can't start mid-edit.
- Share CSV on the Pixel opens the share menu. The desktop falls back to download. JSON download stamps "Last backup".
- Settings: invalid values are rejected, and changes show up on Progress.

A deploy is allowed only when `node --test` passes and every item in GATES is checked, as in Phase 1.

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| The migration corrupts real history | Pure, tested migration; a single transaction; a blocking screen with a raw backup on failure; the migration gate runs on a copy of real v1 data before deploy. **Also: export a JSON backup from your phone before installing Phase 3.** |
| Stepper increments don't match the gym (for example 2.5 lb plates, or machines in 10s) | Per-exercise `weightStep` in Library; tap to type as the escape hatch. |
| Too-aggressive progression suggestions | The RIR clause blocks increases after sets harder than prescribed; the suggestion only sets the pre-fill, and one −5 tap overrides it. |
| Wake lock drains the battery | A setting; released whenever you leave the Log tab. |
| Coarse muscle groups ("Arms", "Legs") make the weekly bars rough | Accepted for now. They match the seed's groups. Finer groups are a Cycle 2 data change, not an app change. |
| The e1RM formula misleads at high reps | Capped at 15 reps and labelled "est." everywhere. |
