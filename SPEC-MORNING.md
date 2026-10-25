# Morning routine inside the Workout tracker: spec

Status: approved in direction by William, 2026-10-24 ("otherwise solid"). D1 to D3 taken as recommended. Building on a branch; no merge or deploy without his go-ahead.

## Goal

The morning stretch and bodyweight routine lives in the Workout tracker app on his Pixel, one tap from Home. Its data stays completely separate from the workout log.

## Decisions made (William, 2026-10-24)

- It lives in the app.
- The data stays separate: the routine never touches sessions, History, the weekly workout count, "Up next", exports, or Backup.

## Design

**A new screen, `morning`,** registered the same way as the others (`registerScreen` in `js/app.js`). It is not a routine and not a session.

- **Entry:** a "Morning routine" card on Home, under the weigh-in. It shows today's state: "Not started", "9 of 19 checked", or "Done today". No new tab, since the tab bar already has six and the back-gesture rule (nav.js) stays at two levels deep: Home and one screen. Back from the morning screen goes Home.
- **Added from the feature pass (William, 2026-10-24):** a get-ready setting (0, 5 or 10 seconds, default 5, with a Start now skip), a "days done in the last 7" line on the screen and the Home card, and a monthly check form (sit-rise score and max push-ups) with the last six results and the change from the one before. A prompt shows when no check has been saved in 30 days.
- **Content:** what the prototype in `morning-routine/` already does: three versions (Full, Short, Floor day), 14 moves with check boxes (R1 and R2 for the two circuit rounds), hold timers with a 5 second lead-in, beep and vibration, how-to videos that load only when opened, cues from each video's transcript.
- **Style:** the app's dark theme variables and `el()` helpers, not the prototype's own CSS. Styles go in `css/app.css` under a `.morning` scope.
- **Timers and wake lock:** the screen returns a cleanup function, so the timer stops and the wake lock is released when you leave. It reuses `js/wakelock.js` and the existing keep-screen-on setting, so there is no second toggle.
- **Videos:** YouTube embeds, loaded only when a move's "How to" is opened. They need a connection. Offline, the move still checks off and times. Each has a Watch on YouTube link.

**Data, kept apart on purpose**

- One `localStorage` key, `morning-routine-v1`: today's date, the chosen version, and the check marks (a new day starts clean), plus a small history: which days were completed and in which version, and the monthly checks (sit-rise score 0 to 10 in half points, and max push-ups), and the get-ready length.
- Not in IndexedDB, so no schema bump and no migration.
- Not in Backup JSON, CSV export, or restore. Losing it costs one day's check marks, so that is fine.
- No reps or weights are kept. History is limited to days completed (last 400) and monthly checks (last 120).

## Files

| File | What |
| --- | --- |
| `js/morningData.js` | The moves, sections, versions, doses, cues, video ids. Data only. |
| `js/morningLogic.js` | Pure functions and the storage wrapper: rounds and visibility per version, version minutes, progress counts, the day rollover, day completion history, the monthly checks, the Home card summary. |
| `js/morning.js` | The screen, the timer, the video loader. |
| `js/app.js` | Register the screen, add its title. |
| `js/home.js` | The Home card. |
| `css/app.css` | `.morning` styles. |
| `service-worker.js` | Add the three new files to the shell list, bump the cache to `wt-v8`. |
| `tests/morning.test.js` | Logic tests. |

The existing shell test (`sw.shell.test.js`) fails if a new file is missing from the shell list, so that mistake cannot ship.

## Out of scope

- Any change to the workout log, History, weekly count, rotation, Backup, or the Library.
- Auto-advance between stretches. William said no (2026-10-24). Each hold is started by hand.
- Logging reps or weights for the morning moves.
- Logging reps or times. Done or not done only.
- A calendar block or reminder.
- Removing the prototype folder. It stays until the app version works on his Pixel.

## Open decisions for William

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | The spec for the app (D4 in `SPEC-PHASE-3-4.md`) rules out interval timers and alerts, because the watch does that. The morning screen's hold timers would be the first exception. | Allow it on the morning screen only. Without it, the stretches have no timer and you use the watch or count. |
| D2 | Entry from a Home card only, or also a tab. | Card only. |
| D3 | Reuse the app's keep-screen-on setting rather than a separate toggle. | Reuse. |

## Plan, cost, stopping point

1. Make a branch `morning-routine` in the app repo. Port the prototype into the three modules, add the card, the styles and the shell entries. About 35 to 45 tool calls, no paid runs, no new dependencies.
2. Write the logic tests. Run `npm test` and check the existing 107 still pass.
3. Run the app locally in Edge with phone emulation and check: the Home card, the screen, check-offs, version switch, timer, back gesture to Home, a finished lift session leaving the weekly count and Up next unchanged, and the morning screen not appearing in History or exports.
4. **Stop and ask** before merging to `main` and running `vercel --prod`. Download a Backup JSON first, as before.
5. William checks on the Pixel. Open the app twice (the first launch installs the update). Confirm the Home card, the screen, the beep and vibration at each switch, the screen staying on, the back gesture, airplane mode, and that a normal lift session still behaves the same.
6. Time one full run with a clock. Correct the minute estimates in the page and the vault article if they are off.

## Known limits

- Videos belong to their channels and could be removed or set to no embedding later.
- The incline push-up channel's credentials are unconfirmed.
- Minute estimates are a count, not a timed run.
- A daily circuit on top of his programming should be shown to his trainer before the first week of daily use.
- The research behind the doses is in the vault article "Morning stretch and bodyweight routine".
