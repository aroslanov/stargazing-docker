# Serve the stargazing calendar as a static site.
# The HTML fetches weather + moon data directly from Open-Meteo in the
# browser, so the container only needs to serve the one file over HTTP.
FROM nginx:1.27-alpine

# App is served at "/" (index.html) — copy it in so the image works even
# without the volume mount.
COPY stargazing.html /usr/share/nginx/html/index.html

EXPOSE 80
