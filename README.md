# Stargazing Calendar — Docker Compose

A self-contained static web app that shows a 30-day stargazing calendar:
moon phase (% illumination, computed locally), real overnight cloud-cover
forecast (live Open-Meteo, no API key), and a "perfect night" finder
(moon ≤ 15% AND cloud ≤ 25%).

## Requirements
- Docker with Docker Compose (v2).

## Files
- `stargazing.html`  – the app. **Edit `SETTINGS` at the top** for your
  coordinates (default is Joshua Tree, CA).
- `Dockerfile`       – nginx serving the file.
- `docker-compose.yml` – port mapping + live file mount.

## Run
```bash
docker compose up -d --build
```
Then open http://localhost:8080/ in a browser.

Edit `./stargazing.html` on your host at any time and just refresh the
page — no rebuild needed.

## Stop
```bash
docker compose down
```

## Change port
Edit `8080:80` in docker-compose.yml to e.g. `9000:80`, then
`docker compose up -d`.

## Notes
- Weather forecast covers ~16 days (Open-Meteo limit); moon phases extend
  the full 30 days. Days beyond the forecast show "—" for cloud.
- Requires an internet connection to fetch Open-Meteo data.
