# Grass Ledger

> Tracks how much outdoor time you owe, finds the best free gap in your day, and nudges you to go outside with short, funny notifications.

Built for the **Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass** (DEV).
Project started 7 Oct 2026, inside the challenge window (5-11 Oct 2026). Any commits after the deadline will be listed under "Post-deadline commits" below.

**Status:** work in progress.

## What it is

- **Debt is the score:** a daily outdoor-minutes goal and a balance that carries over.
- **Gaps come from your calendar file (.ics),** so suggestions fit your real day.
- **Comfort comes from a TabPFN model** trained on historical weather, so it will not send you out at 2 PM in a hot month.
- **Tone is your choice** (gentle, funny, cheeky). Gemma writes the words; plain code decides when and what.

## Architecture

1. **Build time (Colab, run once):** TabPFN turns historical weather into `data/comfort_table.json`. Gemma writes a bank of nudge lines.
2. **On your device (local-first PWA):** calendar parsing, debt ledger, rules engine and notifier all run in the browser. No account, no server-side user data.
3. **Cloud (Render):** hosts the static app and an optional thin nudge API that only receives a situation summary (never event titles or location).

## Repo layout

```
notebooks/comfort_table.ipynb   Colab notebook: weather CSV -> TabPFN vs baseline -> comfort_table.json
data/comfort_table.json         comfort lookup by month and hour (Jaipur)
data/metrics.json               baseline vs TabPFN error and run details
data/weather_hourly.csv         raw hourly weather used for the build
app/                            the PWA (coming)
```

## Comfort model results (Jaipur)

Holdout: the most recent 12 months. Metric: MAE on apparent temperature (degrees C).

| Model | MAE |
|---|---|
| Baseline (mean by month and hour) | 2.340 |
| TabPFN | 2.303 |

TabPFN beat the baseline by a small margin (about 0.04 C). This is one holdout split evaluated on a 5,000-row sample, so the gap is small enough that it could be noise.

### Regenerate for your town

Open `notebooks/comfort_table.ipynb` in Colab, edit `PLACE`, `LAT` and `LON` in the CONFIG cell, and run all cells. You will need a free Prior Labs account, to accept the TabPFN licence, and a `TABPFN_TOKEN` Colab secret.

## Privacy

Calendar parsing, the ledger and check-ins stay on the device. Only a situation summary can leave the device, and only on the optional live path, which can be turned off.

## Sponsor technology

To be filled in with only the categories that genuinely end up working.

## Post-deadline commits

None yet.

## Credits

See [NOTICE.md](NOTICE.md).
