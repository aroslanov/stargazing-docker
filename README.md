# Stargazing Calendar — Docker Compose

A self-contained static web app that shows a 30-day stargazing calendar:
moon phase (% illumination, computed locally), real overnight cloud-cover
forecast (live Open-Meteo, no API key), sunrise/sunset times, the **hours each
night the Milky Way core is visible + its peak altitude** (computed locally),
and a score from 0–100.

**Rating model**
- **Perfect** = the documented criteria, shared by both calendars:
  moon illumination ≤ `maxMoonPct` **and** cloud cover known (≠ null) and
  ≤ `maxCloudPct`. Unknown-weather days are **never** Perfect.
- The **score** is gated by cloud cover (100% overcast = 0; cloud is a
  multiplier, not a summed term), and the moon matters in proportion to how
  much of the night it's actually **up** × its brightness — a moon below the
  horizon hurts nothing. A small Milky-Way bonus (weight `weightMW`) tops it off.
- Dates outside the forecast are scored as **“clear-sky potential”** (labelled
  as such), never as an ordinary forecast score, and are never colored Perfect.
- Everything is **location-timezone aware** (`weather.timezone` via the
  Intl API), so “today”, calendar days, moon/Milky-Way observing windows, and
  rise/set labels all use the coordinates' timezone, not the browser's.
- The final forecast night is incomplete (no full sunset↔sunrise span) and is
  returned as `null` / labelled “incomplete”, never counted as clear or Perfect.
- Moon phase uses Open-Meteo's `daily.moon_phase` where available; a local
  synodic approximation covers dates beyond the API range.

Use the **◀ −30 d / +30 d ▶ / Today** pager to page back and forward. At the
bottom, a **year-at-a-glance mini calendar** (same color coding) maps the next
12 months; click any day to jump the main calendar to it.

## Requirements
- Docker with Docker Compose (v2).

## Files
- `stargazing.html`  – the app. **Edit `SETTINGS` at the top** for your
  coordinates (default is Joshua Tree, CA).
- `Dockerfile`       – nginx serving the file.
- `docker-compose.yml` – port mapping + live file mount.
- `tests/run-tests.js` – deterministic Node tests of the scoring / astronomy /
  timezone logic (no network).
- `package.json`    – `npm test` shorthand for the tests.

## Run
```bash
docker compose up -d --build
```
Then open http://localhost:8080/ in a browser.

Edit `./stargazing.html` on your host at any time and just refresh the
page — no rebuild needed.

## Tests
```bash
node tests/run-tests.js     # or: npm test
```
The harness extracts the app's inline script, runs its pure core in a Node VM
(no DOM), and asserts: Perfect at/beyond the moon & cloud thresholds;
unknown/100% cloud is never Perfect; a full moon below the horizon is not
Perfect under the illumination rule; scores stay in 0–100; weights
(`weightMoon`/`weightMW`) are read and normalized; missing rise/set values
don't crash; a 16-day response yields 15 complete nights (final = null);
phase/illumination consistency; and timezone handling for Tokyo, Auckland, LA
DST transitions (23 h / 25 h days) and the International Date Line.

## Stop
```bash
docker compose down
```

## Change port
Edit `8080:80` in docker-compose.yml to e.g. `9000:80`, then
`docker compose up -d`.

## Notes
- Weather forecast covers ~16 days (Open-Meteo limit); days beyond the forecast
  show "—" for cloud and a "clear-sky potential" score.
- Requires an internet connection to fetch Open-Meteo data.
- All dates/times use the selected coordinates' timezone (from Open-Meteo).
