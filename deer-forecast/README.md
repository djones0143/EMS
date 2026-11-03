# Deer Movement Forecast

A small, no-install web app that uses your **current location** and the **barometric pressure forecast** (plus temperature, wind, rain, sun, moon and rut timing) to forecast whitetail deer movement for the next 3 days.

## Run it locally

Browsers only share your location with pages on `https://` or `http://localhost`, so serve the folder instead of double-clicking the file:

```bash
cd deer-forecast
python3 -m http.server 8000
```

Then open <http://localhost:8000> and tap **Use my location**. You can also search for a town or ZIP code.

No API keys are needed. Weather comes from [Open-Meteo](https://open-meteo.com/) (free). Moon position and rut phase are calculated in the browser.

**On your phone in the field:** location needs https, so host the folder somewhere that serves https. If GitHub Pages is turned on for this repo, the app will be at `https://<user>.github.io/EMS/deer-forecast/`. On iPhone, use "Add to Home Screen" so it opens like an app.

## What you get

- **Right now** score (0–100), with the reasons that pushed it up or down
- **Best times to sit** over the next 3 days, with the single best bet highlighted
- **Morning and evening sit scores** for each day
- **Hourly score chart** with night shading, tap-for-details and a table view
- **Pressure chart**: the past 24 h (observed) and the forecast, with the 30.00–30.40 inHg "sweet spot" shaded
- **Conditions**: barometer and its trend, temperature change since yesterday, wind, moon phase with overhead/underfoot times, rut phase, sunrise/sunset

## How the score works (`model.js`)

Each hour starts at a base of 30, and points are added or taken away:

| Factor | Effect |
|---|---|
| Dawn and dusk windows | up to +28 (the biggest single factor) |
| Barometer level | 30.10–30.40 +10 · mid-range +3 · below 29.80 −8 |
| 3-hour pressure trend | rising +12 · slow fall before a front +8 · steady +4 · fast fall −12 |
| Day after a cold front (pressure up, temperature down over 24 h) | +10 |
| Temperature vs. same hour yesterday | 10° colder +10 · 5° colder +5 · 10° warmer −7; 65°F+ or 75°F+ is a penalty |
| Wind | light breeze +5 · 13–18 mph −5 · over 18 mph −14 |
| Rain | heavy −12 · right after a soaking rain +8 |
| Moon overhead or underfoot | +5 (minor) |
| Rut phase | multiplier from 1.03 to 1.15 (chasing is highest), and +8 for midday cruising during the rut |
| Outside legal light | ×0.8 |

Ratings: **Excellent** 80+, **Good** 65+, **Fair** 45+, **Slow** under 45.

Under **Settings**, set your **local peak-rut (breeding) date**. The default is Nov 12, which fits most of Kentucky. Your state wildlife agency publishes this date. It shifts the rut phases.

These are common hunting rules of thumb, not a scientific model. Tune the numbers in `model.js` to match what you see in your own woods.

## Files

- `index.html`: page layout
- `styles.css`: styles, with light and dark mode
- `app.js`: location, weather fetch, rendering and charts
- `model.js`: the movement scoring rules
- `astro.js`: moon phase and moon overhead/underfoot calculations
