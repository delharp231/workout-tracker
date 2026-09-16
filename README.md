# Workout Tracker

A workout logger you own and run from your phone. Build routines, log sets and
cardio at the gym, export clean data when you want to review it. No accounts,
no ads, no subscription — and your training data never leaves the device.

It's a zero-build, zero-dependency Progressive Web App: plain HTML/CSS/JS,
installed to your home screen, storing everything in IndexedDB on the phone.
The only thing hosted anywhere is the app's code (static files); nobody but
you ever sees a single set you logged. See `SPEC.md` for the full design and
`GATES.md` for the QA checklist.

## Running the tests

```
npm test
```

That's `node --test` under the hood — no install step, this repo has zero
dependencies. It covers the pure logic (schema, CSV export, JSON
import/restore): 29 tests, all green.

## Previewing it locally

Serve the folder with any static file server and open it in a browser. For example:

```
python -m http.server 5055
```

then visit `http://localhost:5055`. A service worker needs HTTPS or
`localhost` to register, so this is enough to test everything except real
offline behavior — for that, see the Pixel/PWA gates in `GATES.md`.

## Installing it on the Pixel

Once the app is deployed (Vercel, over HTTPS — see `vercel.json`):

1. Open the deployed URL in Chrome on the Pixel.
2. Tap the ⋮ menu → **Add to Home screen**.
3. Launch it from the home screen icon. It opens standalone, no browser
   chrome, and works fully offline after that first load.

## Back up your data — this matters

Everything you log lives in IndexedDB on the phone. There is no server copy.
If Chrome's site data gets cleared, or the phone is lost or reset, that data
is gone — there's no other copy anywhere.

**The Backup screen's JSON export is the only backup.** Get in the habit of
exporting it regularly, and keep the file somewhere safe (cloud drive, email
it to yourself, whatever you'll actually keep). A JSON backup re-imports
losslessly, replacing or merging with what's on the device.

Use **Export CSV** separately when you want to review your training in a
spreadsheet — it's one row per set (or cardio entry), plain and pivotable,
but it's for reading, not for restoring the app's state. Treat JSON as the
backup and CSV as the report.

## The Phase 2 seam

Right now the exercise library ships with a small placeholder seed — enough
lifts and cardio modalities to use the app on day one. A later, separate
project will curate a real, evidence-backed exercise library from research
and output it as `exercises.seed.json`. The Backup screen already has the
import path for that file today (**Import JSON…** merges an exercise list
into your library by name, without touching or duplicating anything you've
already added or edited). That import is the entire connection between the
two projects — Phase 1 doesn't otherwise depend on Phase 2 existing.
