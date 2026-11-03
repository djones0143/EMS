# Game Movement Forecast (Whitetail · Turkey · Elk)

An installable web app that uses your **current location** and **barometric pressure** (plus weather,
moon and season timing) to forecast **whitetail deer**, **wild turkey** and **elk** activity hour by hour for
the next 72 hours. Pick the species with the tabs at the top. Each species has its own model and season date.

## What it shows

- **Movement right now**: a 0–100 score with the reasons behind it (▲ helps, ▼ hurts)
- **Barometer**: current sea-level pressure in inHg and its 3-hour trend (rising / steady / falling)
- **Best times to be in the stand**: the top windows during shooting light today and tomorrow
- **72-hour chart**: the hourly movement score above the pressure curve, with night shaded. Tap an hour for details, or open the table view.
- **Daily outlook**: morning / midday / evening scores, temperature range, pressure trend, wind, rain, sunrise/sunset and moon phase
- **Season phase**: deer rut, elk bugle or turkey breeding/nesting phase, based on a date you set per species
- **Stand wind**: in Settings, tap the wind direction(s) that work for your stand on the compass. Hours with the
  right wind score higher, wrong-wind hours score lower, and the chart, best times and table mark each with ✓ / ✗.
  Used for whitetail and elk; turkeys don't hunt by scent, so it's ignored for turkey

## Species at a glance

| | Whitetail | Turkey | Elk |
|---|---|---|---|
| Daily pattern | Dawn & dusk peaks, low midday, moderate at night | Peak at gobbling/fly-down after sunrise, tapering through the day; on the roost from sunset to pre-dawn | Dawn & dusk peaks, beds early in timber |
| Biggest weather drivers | Fronts, rising pressure, cold snaps | **Wind and rain** (calm, clear mornings = gobbling) | **Heat** (bed early when warm), fronts, cold |
| Season setting (default) | Peak rut — Nov 12 | Hens start nesting — Apr 20 | Peak bugle — Sep 25 |
| Season phases | Pre-rut, seeking, peak rut, post-rut, second rut | Early spring, peak breeding, hens nesting (prime calling), late spring, fall flock | Pre-rut, peak bugle, late rut |
| Legal light used | 30 min before sunrise – 30 min after sunset | 30 min before sunrise – **sunset** | 30 min before sunrise – 30 min after sunset |
| Stand wind direction | Yes | No | Yes (penalized more than deer) |
| Solunar periods | Small weight | Not used | Small weight |

Legal hours vary by state and season, so always check your regulations.

## How the whitetail score works

Each hour starts from a **time-of-day baseline**. Deer are crepuscular, so scores peak around sunrise and sunset, are low at midday, and are moderate at night. During the rut the midday baseline goes up. The baseline is then adjusted by these factors:

| Factor | Helps movement | Hurts movement |
|---|---|---|
| Pressure level | 30.00–30.40 inHg | below 29.80 inHg |
| Pressure trend (3 h) | rising, especially fast after a front; a sharp drop just *before* a storm | falling with no storm coming |
| Cold front passage | pressure rebounding off a low with cooler air | — |
| Temperature vs. 24 h ago | 4–10°F+ colder | much warmer |
| Daytime temperature | cold (≤ 40°F) | warm (≥ 65°F) |
| Wind speed | ≤ 10 mph | > 15 mph, strong gusts |
| Wind direction *(only if you set a stand wind)* | within 22.5° of a chosen direction | more than 45° off (deer may smell you) |
| Precipitation | rain that just ended | steady or heavy rain |
| Sky | overcast days | — |
| Solunar | moon overhead/underfoot (major) or rising/setting (minor), small weight | — |
| Rut | seeking, peak and second rut | — |

Elk use the same factors with stronger heat and wrong-wind penalties. Turkeys use their own pressure, wind, rain,
fog and clear-sky factors (see `SPECIES` in `forecast.js`).

The factors overlap (a front brings pressure, temperature and wind changes together), so their combined
effect is dampened instead of being multiplied straight through. All of the logic is in `forecast.js`, so you can tune it.

> This is a heuristic based on commonly reported deer behavior, not a validated scientific model.
> Food sources, hunting pressure, terrain and wind direction relative to your stand matter more.

## Running it

Browsers only allow location access from `https://` or `localhost`, so serve the folder rather than
double-clicking `index.html`:

```bash
cd deer-forecast
python3 -m http.server 8000
# open http://localhost:8000
```

To use it on your phone, host it on GitHub Pages (or any HTTPS host) and open
`https://<you>.github.io/<repo>/deer-forecast/`. Then use **Share → Add to Home Screen** (iOS) or
**Install app** (Android/Chrome). The app shell works offline and keeps the last forecast.

If you deny location access, use 🔎 to search for your hunting spot by city or ZIP code.

## Data sources

- Weather and pressure: [Open-Meteo](https://open-meteo.com/). Free, no API key. Includes 2 days of history for the trend and front calculations.
- Place search: Open-Meteo Geocoding. Place name for GPS coordinates: BigDataCloud's free client reverse-geocoder.
- Moon phase and solunar times: calculated on the device (`astro.js`).

Phone barometer sensors aren't available to web pages, so the app uses Open-Meteo's sea-level pressure, which is
what weather reports and most hunting barometers show.

## Files

```
deer-forecast/
├── index.html            # Layout
├── styles.css            # Styling (dark/light follows your device)
├── app.js                # UI, location, data fetching, chart
├── forecast.js           # Scoring engine + species profiles (deer, turkey, elk)
├── astro.js              # Moon phase and solunar calculations
├── sw.js, manifest.webmanifest, icon.svg   # Installable/offline app
└── tests/                # node --test tests/*.test.js
```

## Tests

```bash
cd deer-forecast
node --test tests/*.test.js
```

The tests run every species model on a synthetic cold-front scenario (`tests/fixture.js`).

The folder is still named `deer-forecast`, so the app's web address didn't change when turkey and elk were added.
