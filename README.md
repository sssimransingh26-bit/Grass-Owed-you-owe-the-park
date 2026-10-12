# Grass Owed: you owe the park

Screen time becomes outdoor debt. Grass Owed tracks how many minutes outside you owe, finds the best free gap in your day, and nudges you to go with short, funny notifications.

Built for the [Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05) on DEV.

- **Write-up:** https://dev.to/i_am_thor/grass-owed-screen-time-becomes-outdoor-debt-4ecm
- **Demo video:** https://youtu.be/xpw0j1YM93k
- **Status:** working prototype that runs locally. It is not deployed to a public URL.

<img width="497" height="731" alt="ss3" src="https://github.com/user-attachments/assets/16872e31-8cea-4c68-818e-1cf1de8bcd18" />
<img width="632" height="733" alt="ss1" src="https://github.com/user-attachments/assets/d7ca1d97-dd63-4bed-a1bf-aade900d3326" />
<img width="533" height="732" alt="ss2" src="https://github.com/user-attachments/assets/ce136508-20ad-4316-abcf-cd79151e5d84" />

<!-- TODO: save your first screenshot as docs/screenshot-main.png, or delete this line -->

## What it does

- **Debt is the score.** For every 5 minutes on a screen you owe 2 minutes outside. Both numbers are settings. Walking pays it back one minute for one minute, and what you don't pay carries over to the next day.
  <!-- TODO: confirm the default ratio. Your settings screenshot shows 2 per 5, your DEV post says 2 per 10. Make all three agree. -->
- **Gaps come from your calendar.** Load an `.ics` file and the app finds your free windows. Only start and end times are kept, never event titles.
- **Comfort comes from weather.** A TabPFN model trained on historical weather scores each hour of each month, so it will not send you out at 2 PM in a hot month. At 2 PM on a June day in Jaipur (39 °C) it tells you to stay in and go out in the evening.
- **Nudges are written by Gemma and chosen by plain code.** You pick a tone: gentle, funny or cheeky. Code decides *when* and *what*, and Gemma only supplies the wording.

### When it will and won't nudge

- At most 3 nudges a day
- Quiet from 22:00 to 07:00
- 90-minute cooldown between nudges
- Never during a calendar event
- Never for tiny debts

## Quick start

You need Python (only to serve the files) and a modern browser. There is nothing to install.

```bash
git clone https://github.com/sssimransingh26-bit/Grass-Owed-you-owe-the-park.git
cd Grass-Owed-you-owe-the-park/app
python -m http.server 8000
```

Open http://localhost:8000.

**Try a different time of day:** add `?t=2026-06-10T14:00` to the address to see how the app behaves on a very hot afternoon.

**Offline:** after the first load, a service worker caches the app, so it opens with no network.

### Using it

1. Open **Settings** and set your ratio, tone and 3 to 5 nearby green spots (one per line).
2. Optionally choose an `.ics` calendar file. Repeating events are expanded for the next 14 days, so re-import now and then.
3. Press **I'm out** when you go outside and **I'm back** when you return. Your debt drops by the minutes you were out.
4. On a laptop, turn on **laptop auto-tracking** to count screen time automatically. On a phone, use **Start screen session** and **+10 min screen**, because browsers cannot read phone screen time.
5. Press **Show me a nudge** to preview a nudge.

### Run the tests

The app logic (debt ledger, `.ics` parser, gap finder, rules engine) is one pure module with 8 Node tests.

```bash
# TODO: replace with your real command, for example:
node --test
```

## How it works

```
BUILD TIME (Google Colab, run once)
  Open-Meteo hourly weather (Jaipur, 4 years)
        |
        v
  TabPFN vs baseline  ->  data/comfort_table.json  (12 months x 24 hours, ~13 KB)
  Gemma 4 E2B         ->  nudge bank (180 lines, validated by code)

ON YOUR DEVICE (vanilla JavaScript PWA, no backend)
  calendar (.ics) -> gap finder -> rules engine -> notifier
                                      ^
              comfort_table.json + debt ledger + nudge bank
```

There is no server and no model at runtime. The two heavy models run once in Colab and ship two small JSON files.

### Comfort model (TabPFN)

- **Data:** 4 years of hourly apparent temperature and rain for Jaipur from Open-Meteo, in `data/weather_hourly.csv`.
- **Method:** the most recent 12 months are held out. A simple baseline (mean by month and hour) is compared with TabPFN-3.5, trained on a 10,000-row sample.
- **Output:** a 12 x 24 lookup, `data/comfort_table.json`.

| Model | MAE on held-out year (apparent temperature, °C) |
|---|---|
| Baseline (mean by month and hour) | 2.340 |
| TabPFN | 2.303 |

TabPFN beat the baseline by about 0.04 °C (roughly 1.6%). This is one holdout split scored on a 5,000-row sample, so the gap is small enough that it could be noise. Run details are in `data/metrics.json`.

### Nudge bank (Gemma)

- **Model:** `google/gemma-4-E2B-it` (Apache-2.0), run once on a free Colab T4.
- **Output:** 180 lines across 6 situations and 3 tones, 10 per combination. The app started with 36 hand-written placeholder lines.
- **Validation:** plain code checks every line for length, allowed placeholders (such as `{best_time}`), required details and banned words. Of 181 lines returned, 180 passed (99.4%). One was rejected for an invented placeholder.
- **Cost:** about 20 seconds per call, 18 calls, roughly 6 minutes in total.
- **Result:** one small JSON file, so nudges work with no signal.
<!-- TODO: name the nudge file and the notebook or script that generated it, if they are in the repo. -->

## Repo layout

```
app/                            the PWA (HTML, JavaScript, service worker)
notebooks/comfort_table.ipynb   Colab notebook: weather CSV -> TabPFN vs baseline -> comfort_table.json
data/comfort_table.json         comfort lookup by month and hour (Jaipur)
data/metrics.json               baseline vs TabPFN error and run details
data/weather_hourly.csv         raw hourly weather used for the build
NOTICE.md                       credits and licences
```

## Regenerate the comfort table for your town

1. Open `notebooks/comfort_table.ipynb` in Google Colab.
2. Edit `PLACE`, `LAT` and `LON` in the CONFIG cell.
3. Run all cells.

You will need a free Prior Labs account, to accept the TabPFN licence, and a `TABPFN_TOKEN` Colab secret.

## Privacy

Calendar parsing, the debt ledger and check-ins all stay on your device. Only start and end times are read from your calendar. There is no account, no analytics and no server that receives your data.

## Known limitations

- The TabPFN improvement over the baseline is tiny and may be noise.
- Rain probability per hour is noisy (about 120 days per month-and-hour cell), so comfort scores can jump between neighbouring hours.
- Calendar time zones are ignored. Repeating events are only expanded daily and weekly, for 14 days.
- Notifications only fire while the app is open. Reliable delivery to a closed phone app needs a push server, which is not built.
- Laptop auto-tracking uses the browser's Idle Detection API, so it works only in Chrome or Edge on desktop. Reading without touching the keyboard or mouse counts as idle after 60 seconds.
- The comfort table covers Jaipur only until you regenerate it for another town.
- Not deployed to a public URL.

## Open source and why it matters here

The app handles your calendar and your screen habits, which is data you don't want on someone else's server. Open weights let both models run in a free Colab notebook, and their output became two tiny files. There is no cloud API at runtime, no per-request cost, and no personal data leaves the device. Open weather data from Open-Meteo made the training set free to get.

## Challenge categories

- **Best Use of TabPFN:** predicts outdoor comfort by month and hour from historical weather, with the error reported against a simple baseline.
- **Best Use of Gemma:** Gemma 4 E2B wrote the nudge bank, with code validating every line.

## Credits and licences

- Weather data: [Open-Meteo](https://open-meteo.com)
- The comfort table was generated with TabPFN-3.5 by Prior Labs GmbH under the TabPFN-3.5 Non-Commercial License. This is a hackathon project, not a product.
- Gemma 4 by Google DeepMind (Apache-2.0)

See `NOTICE.md` for details.
<!-- TODO: add a LICENSE file for your own code, and mention it here. -->
