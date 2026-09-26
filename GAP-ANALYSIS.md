# Gap analysis and next round: usability, competitors, features

**Date:** 2026-09-25 · **App version audited:** live deploy (SW cache `wt-v2`), 375×812 mobile viewport, plus a read of every screen's source.
**Input to:** the Phase 3 spec. Nothing here is built yet.

## The short version

1. **Three bugs block real use today.** The routine picker can't start the first routine in the alphabet, which is **Legs**. Discard deletes the whole workout in one tap with no confirmation, and it sits right next to Finish. Deleting a routine doesn't ask for confirmation either.
2. **We're behind the competition on the free stuff, not the paid stuff.** Strong's and Hevy's *free* tiers already cover the gym-floor loop: your last session's numbers pre-filled, tap to complete a set, a rest timer. We have none of that. What they charge for (unlimited routines and custom exercises, CSV export, analytics, body measurements) we either have already or can build for nothing.
3. **The app can't run the program it ships with.** Cycle 1 prescribes rep *ranges*, RIR targets, rest times, and double progression. During a workout the app shows none of the targets, doesn't show last session's numbers (which double progression needs), and asks for RPE while the program talks in RIR.
4. **Recommended next round (Phase 3, "gym floor"):** fix the bugs, then make logging program-aware and as fast as Strong/Hevy free. **Phase 4 ("review")** builds the analytics the others paywall, aimed at your goal: bodyweight trend, PRs, weekly volume and cardio minutes, a progression hint. **Phase 5** closes the loop into Cycle 2.

---

## 1. Usability audit

Method: the `ui-heuristic-review` passes. I drove the live app (started a Push session, added and filled sets, finished it, opened History, Library, Routines) and measured elements in the DOM. Severity: **critical** blocks a task, **major** is real friction, **minor** is low-cost, **nit** is polish.

### Pass 1: Nielsen Norman heuristics

| # | What I observed | Violates | Sev | Fix |
|---|---|---|---|---|
| 1 | **Log → "start from a routine" shows "Legs (Cycle 1)" already selected** (`selectedIndex: 1`), because the disabled placeholder option isn't marked `selected`. Picking Legs fires no `change` event, so **Legs can't be started from the picker**. The same bug hits "+ Add exercise…" in the session (shows "Air Bike"; Air Bike can't be added) and in the routine editor. | #5 Error prevention | **critical** | Give the placeholder `selected` as well as `disabled` in all three pickers, and add a regression test. |
| 2 | **Discard** deletes the entire in-progress session with no confirmation and no undo. It's the same size as **Finish** and sits right next to it. | #3 User control, #5 | **critical** | Confirm it ("Discard 14 logged sets?"), or better, soft-delete with a 10-second Undo. Separate it visually from Finish (text-style button, moved away). |
| 3 | **Routines → Delete** removes a routine immediately with no confirmation. History's Delete *does* confirm. | #5, #4 Consistency | major | Use the same confirm as History (or Undo). |
| 4 | **Routine targets are invisible while logging.** Starting Push creates 6 exercise cards that each say "No sets yet". Nothing shows the 3 × 8, the RIR note, or the rest time stored on the routine. Routine item `note` isn't shown anywhere in the UI, not even the routine editor. | #6 Recognition over recall | major | Put a target line under each exercise name ("3 × 6–8 @ RIR 2 · rest 2:00") plus the note. Pre-create the target number of set rows. |
| 5 | **No record of last session's performance.** Double progression ("add reps, then add load") depends on knowing last week's numbers. Right now that means remembering them or leaving the app. | #6 | major | Show "Last time: 135×8, 135×8, 135×7" per exercise and pre-fill new rows from it. |
| 6 | **"+ Add set" makes an empty row.** It doesn't copy the previous set, so every set needs weight and reps typed from scratch (a 15-set Push day is about 30 entries). | #7 Efficiency | major | Copy the previous set's weight/reps into the new row, or last session's matching set if this is the first one. |
| 7 | **You can't remove a set or an exercise** from an active session. A mistaken tap on "+ Add set" leaves an empty set that gets saved. History showed `#2: — × —` after Finish. | #3 | major | Add remove-set (swipe or ×) and remove-exercise controls. |
| 8 | **Finish saves unlogged work silently.** My test session had 5 of 6 exercises untouched, and History summarised it as "6 exercises · 2 sets · cardio". | #5, #1 Visibility | minor | On Finish, strip empty sets and prompt: "5 exercises have no sets. Remove them?" |
| 9 | **No sense of time or progress** during a session: no elapsed clock, no rest timer, no "set done" state, no "7 / 15 sets". The session records only a start timestamp, so duration is lost. | #1 Visibility | major | Add `finishedAt`, a sticky elapsed/rest bar, and a per-set ✓ state. |
| 10 | **The program says RIR and the logger asks RPE.** The Cycle 1 notes say "RIR 2"; the input says "RPE". Translating mid-set (RPE 8 ≈ RIR 2) is a small but constant tax. | #2 Match with the real world | minor | Log RIR (keep `rpe` for old data), or make the effort scale a setting. |
| 11 | **Past sessions are read-only.** A typo is permanent unless you delete the whole session. | #3 | minor | Add an Edit action on the history detail that reuses the active-session editor. |
| 12 | **Routine cards have no Start button.** To run a routine you leave Routines, go to Log, and use the picker. | #6, #7 | minor | Add "Start" on each routine card. |
| 13 | **In-session exercise picker is a flat list of 49**, sorted alphabetically, with no grouping or search. | #7, Hick's law | minor | Use `<optgroup>` by muscle group (cheap), or a searchable bottom sheet (better). |
| 14 | **Import appears twice.** "Import exercises (JSON)" is a top-level Library button and also lives in Backup, where it behaves differently. It's a rare power-user action competing with "+ Add exercise". | #8 Minimalism, #4 | nit | Keep it only in Backup. |

### Pass 2: why the big ones matter

- **Fitts's law and scroll cost.** Each set is its own 123 px card (numbers row plus a full-width Note field). With two sets logged the Push page was already 1,509 px tall. A full 15-set day runs past 2,400 px, so you're scrolling between sets with chalky hands.
- **Jakob's law.** Every competitor uses the same pattern: one-line set rows, a ✓ to complete, last session's numbers shown in grey. That's the pattern your hands expect.

### Pass 3: WCAG 2.2 AA basics

| What | Violates | Sev | Fix |
|---|---|---|---|
| Set inputs have **no labels, only placeholders**. At 83 px wide, "Weight (lb)" doesn't fit, and once a value is typed there's no label at all. | 1.3.1 / 3.3.2 Labels | major | Add one column-header row per exercise ("Set · lb · reps · RIR") and `aria-label`s on the inputs. |
| History session cards are `div`s with click handlers (`tabIndex -1`, no role), so a keyboard or switch user can't reach them. | 2.1.1 Keyboard | minor (you're the only user; cheap fix) | Make them `<button>`s. |
| Input and card borders (`#243040`) measure about **1.4:1** against the input fill, below the 3:1 minimum for non-text UI. Fields are hard to see in a bright gym. | 1.4.11 Non-text contrast | minor | Lighten the border to about `#4a5b70`. |
| The active tab differs from inactive tabs by **hue only**: accent and muted have almost identical luminance (0.33 vs 0.34). | 1.4.1 Use of color | minor | Add a top bar or bold weight to the active tab. |
| The save-error banner and import/export notices aren't announced (no `aria-live`). | 4.1.3 Status messages | nit | Add `role="status"` to notices and `role="alert"` to save-error. |
| No custom focus styles; the browser default is all there is. | 2.4.7 | nit | Add a `:focus-visible` outline in the accent colour. |
| The tab bar has no `env(safe-area-inset-bottom)` padding even though the viewport uses `viewport-fit=cover`. **Not verified on your Pixel.** | Target obscured | nit | Add `padding-bottom: env(safe-area-inset-bottom)`. |

Contrast of body and muted text passes (muted on card is about 6.5:1). Primary button text passes (about 6.8:1).

### Pass 4: Visual polish

| What | Sev | Fix |
|---|---|---|
| **Library "Show hidden" checkbox is stretched 259 px wide**, which squeezes its label into 49 px and wraps it onto two lines. The global `input { width:100% }` rule catches checkboxes. | minor | Scope that rule to `input:not([type=checkbox])`. |
| Exercise names in session cards are the same size and weight as the set text, so there's no hierarchy inside a card. | minor | Make exercise names 600 weight and ~17px; make set text tabular numerals. |
| Cards nest inside cards with an identical background (boxes in boxes). | nit | Render set rows as plain rows inside the exercise card, not cards. |
| The content `h2` (session name, ~24px) is bigger than the top-bar `h1` (20px), which inverts the hierarchy. | nit | Size them down, or make the top bar show the session name during a workout. |
| Finish is 46 px tall and Discard is 48 px, because `.primary` drops the border. | nit | Give `.primary` a matching `1px solid transparent` border. |

### Pass 5: Search and filter (Library)

| What | Sev | Fix |
|---|---|---|
| There's search but no muscle-group or equipment filter, even though every exercise already carries those fields. | minor | Add chips: Push · Pull · Legs · Cardio. |
| No result count; the empty state says only "No matches." with no way out. | nit | Show "12 exercises" and put a Clear button in the empty state. |
| The search field has no label and no clear (×) button. | nit | Use `type="search"` and add an `aria-label`. |

---

## 2. Competitor comparison

Scope: the four apps closest to what you want. **Strong** and **Hevy** are the market leaders. **FitNotes** is the closest in spirit (free, no ads, on-device, CSV). **Liftosaur** is the closest in mechanics (program logic, also a PWA). Provenance: Strong and Hevy tier details come from **third-party 2026 reviews** (their own pricing pages didn't render for me), so check before relying on the exact limits. "—" means I didn't verify it.

| | Strong | Hevy | FitNotes | Liftosaur | **Ours** |
|---|---|---|---|---|---|
| Cost | Free tier; PRO ~$29.99/yr | Free tier; Pro $2.99/mo · $23.99/yr · $74.99 lifetime | Free, no ads; optional supporter purchase | Free (web/PWA, Android, iOS) | Free, yours |
| Free-tier limits | 3 saved templates | 4 routines, 7 custom exercises, 3-month graph history | none noted | — | none |
| Where data lives | cloud account | cloud account | on device, manual CSV | cloud sync | on device, manual export |
| Rest timer | ✓ free | ✓ | — | ✓ | ✗ |
| Last session's numbers pre-filled | ✓ | ✓ | — | ✓ (program-driven) | ✗ |
| 1RM / PRs | ✓ 1RM calc free | ✓ | ✓ PRs highlighted | — | ✗ |
| Progress charts | advanced = PRO | ✓ (3 months free) | ✓ | ✓ | ✗ (CSV only) |
| Bodyweight / measurements | PRO | limited free | ✓ bodyweight | ✓ | ✗ |
| Plate calculator | ✓ | ✓ | — | ✓ | ✗ |
| CSV export | PRO | — | ✓ | — | ✓ |
| Progression logic | ✗ | Pro "Trainer" | ✗ | ✓ scriptable | ✗ (on paper in `cycle-1.md` only) |
| Research-cited program | ✗ | ✗ | ✗ | 50+ built-in programs, not cited | ✓ Cycle 1, every line cited |
| Health Connect / watch | PRO (Health/Watch) | — | ✗ | — | **not possible as a PWA** |

**What the table shows.** The paywalls sit on analytics, body tracking, unlimited routines and custom exercises, export, and health sync. None of that costs us anything, and on routines, custom exercises, export, ads, and accounts we already win. Where we lose is the gym-floor loop that every competitor gives away free. That's the next round.

---

## 3. Feature gaps

Measured two ways: against the competitors, and against what Cycle 1 needs to run and be measured.

| Gap | Competitors have it? | Cycle 1 needs it? | Cost | Round |
|---|---|---|---|---|
| Picker bug, Discard confirm, routine-delete confirm | n/a | **yes** (Legs day) | tiny | **Hotfix** |
| Routine targets shown while logging (rep range, RIR, rest, note) | partly | **yes**: the prescription is the program | small | 3 |
| Last time shown and pre-filled | yes, free | **yes**: double progression | medium | 3 |
| One-line set rows, ✓ to complete, remove set/exercise | yes, free | helps | medium | 3 |
| Rest timer (starts on ✓, vibrates, keeps the screen awake) | yes, free | **yes**: rest ~2–3 min on primaries | medium | 3 |
| Interval timer for the bike finisher (30s/60s × 6) | some | **yes** | small (reuses the timer) | 3 (stretch) |
| Session duration | yes | helps (the 45-min cap) | tiny | 3 |
| Log RIR instead of / as well as RPE | varies | **yes** | small (schema and CSV change) | 3 |
| Grouped or searchable exercise picker | yes | helps | small | 3 |
| Bodyweight log and weekly trend vs 0.5–1%/week | paywalled in Strong | **yes**: it's the fat-loss outcome | small | 4 |
| Per-exercise history, PRs, estimated 1RM chart | paywalled in part | yes | medium | 4 |
| Weekly sets per muscle (6–12) and cardio minutes (vs 150) | paywalled (Hevy Pro, Strong PRO) | **yes**: the program's own targets | medium | 4 |
| Double-progression hint ("hit 8,8,8 @ RIR 2 → +5 lb") | Hevy Pro, Liftosaur | **yes** | medium | 4 |
| Edit past sessions | yes | helps | small–medium | 4 |
| Share CSV to Drive/Sheets (Web Share) instead of download | n/a | helps your review flow | small | 4 |
| Daily steps (8–10k target) | via Health Connect | yes | manual field only (see constraints) | 4 |
| Cycle 2 built from logged CSV; in-app "Cycle 2 available" | no one | **yes** | medium, spans both repos | 5 |
| Supersets, plate calculator, warm-up calculator | yes | no | medium | parked |
| kg units | yes | no | small | parked |
| Social feed, accounts, cloud sync, AI coach, food logging, exercise videos | varies | no | n/a | **out**: against the point of the app |

**Code health to ride along in Phase 3.** Five screens each define their own `field()`, `numberOrNull`, and `formatDuration`; move them to one `ui-helpers.js`. Share the `ACTIVE_KEY` constant between `session.js` and `backup.js`. Make restore atomic. Make `pickFile` resolve on cancel. Reset the `starterRoutinesSeeded` flag on Erase-all so starter routines come back. Hide legacy placeholder exercises that duplicate the research names ("Bench Press" next to "Barbell Bench Press") if they're unused. `restSec` exists in the schema and the CSV, but nothing ever sets it; the rest timer should fill it with actual rest.

---

## 4. Proposed next round

### Hotfix (before Phase 3; about 15 minutes plus deploy)

The picker `selected` bug (all three pickers), a confirm on Discard, a confirm on routine delete, and the checkbox width. Bump the SW cache to `wt-v3`.

### Phase 3: "Gym floor"

Goal: logging a Cycle 1 session is as fast as Strong/Hevy free, and the program's prescription is on screen while you do it.

1. **Program-aware routines.** Routine items gain `repMin`/`repMax`, `targetRir`, `restSec`, and a visible `note`, with a schema migration. Update the seed routines from `cycle-1.md` (6–8, not 8).
2. **Session card redesign.** Exercise name, then a target line, then "Last time", then one-line set rows (`# · lb · reps · RIR · ✓`) under a column header. Pre-create the target number of rows, pre-filled from last time. Notes sit behind a toggle. Sets and exercises can be removed.
3. **Rest timer.** ✓ starts it, using the routine's `restSec` as the default. A sticky bottom bar shows the countdown with +30s and Skip. It vibrates and chimes at zero. The screen stays awake during an active session (Screen Wake Lock). Actual rest time is written to `restSec`. Stretch goal: an interval mode for the bike finisher.
4. **Session lifecycle.** `finishedAt` and duration. Finish cleans up empty sets and exercises. Discard is soft with Undo.
5. **Faster picking.** A grouped or searchable exercise picker, and Start buttons on routine cards.
6. **Effort scale.** RIR logged as a column. The CSV contract gains `rir` (additive; old rows keep `rpe`).
7. **Cheap accessibility and polish** from Passes 3–4, plus the code-health items above.

Out of scope for Phase 3: charts, bodyweight, anything cloud.

### Phase 4: "Review"

The analytics Strong and Hevy charge for, pointed at your goal: a bodyweight log and trend, per-exercise history, PRs and estimated 1RM (inline SVG, no libraries), a weekly dashboard (sets per muscle, cardio minutes, sessions), the double-progression hint, editing past sessions, and Share CSV.

### Phase 5: "Cycle 2"

The research repo reads your exported CSV and builds Cycle 2 with adjusted targets. The app offers "Cycle 2 available, add it?" instead of relying on the one-shot seed flag. Calorie and protein targets come in once you give biometrics.

### Platform limits (researched, not assumed)

- **A rest timer can't alert through a locked screen.** Web apps can't schedule a future notification. Chrome's Notification Triggers API ran two origin trials and was never shipped. The workaround: keep the screen on during a session with Screen Wake Lock (Chrome 84+). It releases automatically if you leave the app, and it can be refused in battery-saver mode. The timer runs off timestamps, so it's still correct when you come back.
- **Health Connect is native-Android only**, so a PWA can't read steps or heart rate or write workouts to it. The options are manual entry for steps, or wrapping the app natively (TWA/Capacitor). The wrapper is a platform decision, not a feature, so it's parked unless step import turns into the bottleneck.

---

## Sources

- Strong: [RepReturn review 2026](https://repreturn.com/strong-app-review/), [GiFit review 2026](https://gifit.io/blog/strong-workout-app-review/), [strong.app](https://www.strong.app/), [Sensai Hevy vs Strong 2026](https://www.sensai.fit/blog/hevy-vs-strong-2026)
- Hevy: [RepReturn Hevy Pro vs Free](https://repreturn.com/hevy-pro-vs-free/), [Sensai Hevy review 2026](https://www.sensai.fit/blog/hevy-review-2026), [hevy.com/pricing](https://hevy.com/pricing) (didn't render)
- FitNotes: [fitnotesapp.com](http://www.fitnotesapp.com/), [WhistleOut review](https://www.whistleout.com/CellPhones/Apps/fitnotes-app-review)
- Liftosaur: [liftosaur.com](https://www.liftosaur.com/), [Liftosaur overview](https://www.liftosaur.com/blog/posts/liftosaur-overview/)
- Platform: [Notification Triggers (Chrome for Developers)](https://developer.chrome.com/docs/web-platform/notification-triggers), [Screen Wake Lock demo](https://whatpwacando.today/wake-lock/), [Health Connect get started (Android Developers)](https://developer.android.com/health-and-fitness/health-connect/get-started)
