# Grass Owed app (PWA)

Static, local-first web app. No build step, no backend needed.

## Run locally

From this `app/` folder:

```
python -m http.server 8000
```

Open http://localhost:8000. Service workers work on localhost and on HTTPS (Render gives you HTTPS).

## Try a specific time

Add `?t=` with a local time to test the rules without waiting:

- http://localhost:8000/?t=2026-06-10T14:00 (hot afternoon, should say wait)
- http://localhost:8000/?t=2026-12-10T11:00 (pleasant, should say go now)

Test mode uses separate storage, so it never touches your real ledger.

## Files

- `core.js`: pure logic (debt ledger, .ics parser, gap finder, rules engine, nudge text). Tested in Node.
- `app.js`, `index.html`, `style.css`: the screen.
- `sw.js`, `manifest.webmanifest`, `icons/`: offline caching and installability.
- `data/comfort_table.json`: copy of `../data/comfort_table.json`. Keep the two in sync when you regenerate it.
- `data/nudge_bank.json`: currently a hand-written placeholder. Replace it with the Gemma-generated bank.
- `sample.ics`: a small timetable for testing the calendar import.

## Tests

From the repo root: `node tests/core.test.js`

## Known limits

- Repeating calendar events are expanded for 14 days from import; only daily and weekly rules are understood.
- Time zones in .ics files are ignored (times are treated as local).
- Notifications fire while the app is open or running; closed-app delivery varies by phone.
