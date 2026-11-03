/*
 * Whitetail deer movement model.
 *
 * Produces an hourly 0-100 "movement score" from:
 *   - time of day relative to sunrise/sunset (deer are crepuscular)
 *   - barometric pressure level and 3-hour trend, plus cold-front passage
 *   - temperature change vs. 24 hours earlier, and unseasonable warmth
 *   - wind, precipitation (and rain that just ended), cloud cover
 *   - solunar major/minor periods (small weight)
 *   - rut phase, based on a user-adjustable peak-rut date
 *
 * This is a heuristic built from commonly reported hunter/biologist
 * observations, not a validated scientific model.
 */
(function (root) {
    'use strict';

    const Astro = root.Astro || (typeof require !== 'undefined' ? require('./astro.js') : null);

    const HPA_TO_INHG = 0.0295300;
    const HOUR = 3600 * 1000;
    const DAY = 24 * HOUR;

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const gauss = (x, mu, sigma) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));

    const fmtCache = {};
    function localParts(ms, tz) {
        const key = tz || 'local';
        if (!fmtCache[key]) {
            fmtCache[key] = new Intl.DateTimeFormat('en-US', {
                timeZone: tz || undefined, hourCycle: 'h23',
                year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
            });
        }
        const parts = {};
        for (const p of fmtCache[key].formatToParts(new Date(ms))) parts[p.type] = p.value;
        return {
            year: +parts.year, month: +parts.month, day: +parts.day,
            hour: +parts.hour, minute: +parts.minute,
            dateKey: `${parts.year}-${parts.month}-${parts.day}`
        };
    }

    // ---- Rut -----------------------------------------------------------------

    /** Days from the peak-rut date ("MM-DD") to the given local date (nearest season). */
    function daysFromRutPeak(parts, rutPeak) {
        const [pm, pd] = (rutPeak || '11-12').split('-').map(Number);
        const today = Date.UTC(parts.year, parts.month - 1, parts.day);
        let best = Infinity;
        for (const y of [parts.year - 1, parts.year, parts.year + 1]) {
            const diff = Math.round((today - Date.UTC(y, pm - 1, pd)) / DAY);
            if (Math.abs(diff) < Math.abs(best)) best = diff;
        }
        return best;
    }

    function rutPhase(daysFromPeak) {
        const d = daysFromPeak;
        if (d >= -35 && d < -21) return { key: 'pre', name: 'Pre-rut', daytime: 0.05, mult: 1.0,
            note: 'Bucks laying down rubs and scrapes; patterns still mostly food-to-bed.' };
        if (d >= -21 && d < -7) return { key: 'seeking', name: 'Seeking phase', daytime: 0.14, mult: 1.04,
            note: 'Bucks cruising and checking scrapes — daytime sightings picking up.' };
        if (d >= -7 && d <= 7) return { key: 'peak', name: 'Peak rut (chasing/breeding)', daytime: 0.26, mult: 1.08,
            note: 'Bucks on their feet any hour of the day — sit all day if you can.' };
        if (d > 7 && d <= 20) return { key: 'post', name: 'Late rut / post-rut', daytime: 0.08, mult: 1.0,
            note: 'Many does bred; worn-down bucks return to food sources.' };
        if (d >= 24 && d <= 34) return { key: 'second', name: 'Second rut', daytime: 0.07, mult: 1.02,
            note: 'Unbred does and doe fawns come into estrus — a short secondary flurry.' };
        return { key: 'none', name: 'Outside the rut', daytime: 0, mult: 1.0,
            note: 'Movement is driven mostly by food, cover and weather.' };
    }

    // ---- Factor helpers ------------------------------------------------------

    function effectOf(mult) {
        if (mult > 1.02) return 'up';
        if (mult < 0.98) return 'down';
        return 'neutral';
    }

    function pressureLevelFactor(p) {
        if (p >= 30.40) return [1.05, 'High pressure — cool, clear and stable'];
        if (p >= 30.00) return [1.10, 'Pressure in the prime 30.00–30.40 inHg band'];
        if (p >= 29.80) return [1.00, 'Pressure about average'];
        if (p >= 29.60) return [0.90, 'Low pressure — unsettled weather'];
        return [0.80, 'Very low pressure — stormy conditions'];
    }

    function pressureTrendFactor(trend3, rainSoon, rainingNow) {
        if (trend3 >= 0.06) return [1.15, 'Pressure rising fast — classic post-front movement'];
        if (trend3 >= 0.02) return [1.10, 'Pressure rising'];
        if (trend3 > -0.02) return [1.00, 'Pressure steady'];
        if (trend3 > -0.06) return [0.93, 'Pressure falling slowly'];
        if (rainSoon && !rainingNow) return [1.10, 'Pressure dropping fast ahead of a front — deer often feed before the storm'];
        return [0.85, 'Pressure falling fast'];
    }

    function tempChangeFactor(dT) {
        if (dT <= -10) return [1.15, `Temperature ${Math.round(-dT)}°F colder than 24 h ago`];
        if (dT <= -4) return [1.07, `Cooler than yesterday (${Math.round(dT)}°F)`];
        if (dT < 4) return [1.00, 'Temperature similar to yesterday'];
        if (dT < 10) return [0.95, `Warmer than yesterday (+${Math.round(dT)}°F)`];
        return [0.88, `Much warmer than yesterday (+${Math.round(dT)}°F)`];
    }

    function tempAbsoluteFactor(t, daylight) {
        if (!daylight) return [1.00, null];
        if (t >= 75) return [0.75, `Hot (${Math.round(t)}°F) — deer bed down in shade`];
        if (t >= 65) return [0.85, `Warm (${Math.round(t)}°F) — daytime movement suppressed`];
        if (t >= 55) return [0.95, `Mild (${Math.round(t)}°F)`];
        if (t <= 5) return [0.92, `Bitter cold (${Math.round(t)}°F) — deer conserve energy`];
        if (t <= 40) return [1.05, `Cold (${Math.round(t)}°F) — deer need to feed`];
        return [1.00, null];
    }

    function windFactor(speed, gust) {
        let f; let label;
        if (speed <= 10) { f = 1.00; label = `Light wind (${Math.round(speed)} mph)`; }
        else if (speed <= 15) { f = 0.92; label = `Breezy (${Math.round(speed)} mph)`; }
        else if (speed <= 20) { f = 0.82; label = `Windy (${Math.round(speed)} mph) — deer hold tight`; }
        else { f = 0.70; label = `Strong wind (${Math.round(speed)} mph) — deer hunker down`; }
        if (gust >= 30) { f *= 0.92; label += `, gusts ${Math.round(gust)}`; }
        return [f, label];
    }

    function precipFactor(now, prev4max) {
        if (now >= 0.15) return [0.65, 'Heavy rain'];
        if (now >= 0.04) return [0.80, 'Steady rain'];
        if (now > 0) return [0.97, 'Light drizzle — little effect'];
        if (prev4max >= 0.04) return [1.12, 'Rain just ended — deer get up to feed'];
        return [1.00, null];
    }

    // ---- Wind direction ------------------------------------------------------

    const COMPASS_8 = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
    const COMPASS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const compass = (deg) => (deg == null ? '' : COMPASS_16[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]);
    const angleDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
    const CALM_MPH = 3;

    /**
     * How well the wind direction (degrees the wind blows FROM) fits the stand's preferred winds.
     * Returns 'good' (within 22.5° of a preferred point), 'ok' (within 45°), 'bad', 'calm' or null (no preference).
     */
    function windMatch(dir, speed, prefs) {
        if (!prefs || !prefs.length || dir == null) return null;
        if (speed < CALM_MPH) return 'calm';
        const diff = Math.min(...prefs.map((p) => angleDiff(dir, COMPASS_8[p] ?? p)));
        if (diff <= 22.5) return 'good';
        if (diff <= 45) return 'ok';
        return 'bad';
    }

    function windDirFactor(match, dir) {
        const from = compass(dir);
        switch (match) {
            case 'good': return [1.10, `${from} wind — right wind for your stand`];
            case 'ok': return [1.03, `${from} wind — close to your stand's wind`];
            case 'bad': return [0.85, `${from} wind — wrong wind for your stand; deer may smell you`];
            case 'calm': return [1.00, 'Calm — wind direction variable, watch thermals'];
            default: return [1.00, null];
        }
    }

    /** Speed-weighted mean wind direction for a set of hours. */
    function meanWindDir(hours) {
        let x = 0; let y = 0;
        for (const h of hours) {
            if (h.windDir == null) continue;
            const w = Math.max(h.wind, 0.5);
            x += Math.cos(h.windDir * Math.PI / 180) * w;
            y += Math.sin(h.windDir * Math.PI / 180) * w;
        }
        if (!x && !y) return null;
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    // ---- Main ----------------------------------------------------------------

    /**
     * @param {object} wx  Open-Meteo forecast response (timeformat=unixtime, imperial units).
     * @param {object} opts { lat, lon, rutPeak: 'MM-DD', windDirs: ['NW', ...], now: ms, hoursAhead: number }
     */
    function buildForecast(wx, opts) {
        const tz = wx.timezone;
        const lat = opts.lat ?? wx.latitude;
        const lon = opts.lon ?? wx.longitude;
        const now = opts.now ?? Date.now();
        const hoursAhead = opts.hoursAhead ?? 72;
        const H = wx.hourly;

        const raw = H.time.map((t, i) => ({
            time: t * 1000,
            pressure: H.pressure_msl[i] != null ? H.pressure_msl[i] * HPA_TO_INHG : null,
            temp: H.temperature_2m[i],
            precip: H.precipitation ? H.precipitation[i] ?? 0 : 0,
            precipProb: H.precipitation_probability ? H.precipitation_probability[i] ?? 0 : 0,
            cloud: H.cloud_cover ? H.cloud_cover[i] ?? 0 : 0,
            wind: H.wind_speed_10m[i] ?? 0,
            gust: H.wind_gusts_10m ? H.wind_gusts_10m[i] ?? 0 : 0,
            windDir: H.wind_direction_10m ? H.wind_direction_10m[i] : null,
            code: H.weather_code ? H.weather_code[i] : null
        }));

        const days = wx.daily.time.map((t, i) => ({
            start: t * 1000,
            sunrise: wx.daily.sunrise[i] * 1000,
            sunset: wx.daily.sunset[i] * 1000
        }));
        const dayFor = (ms) => {
            let d = days[0];
            for (const day of days) if (day.start <= ms) d = day;
            return d;
        };

        const startIdx = Math.max(0, raw.findIndex((h) => h.time + HOUR > now));
        const endIdx = Math.min(raw.length, startIdx + hoursAhead);

        const solunar = Astro.solunarEvents(raw[startIdx].time - DAY, raw[endIdx - 1].time + DAY, lat, lon);

        const hours = [];
        for (let i = startIdx; i < endIdx; i++) {
            const h = raw[i];
            if (h.pressure == null || h.temp == null) continue;
            hours.push(scoreHour(raw, i, dayFor(h.time), solunar, tz, opts));
        }

        const dayKeys = [...new Set(hours.map((h) => h.dateKey))];
        const daily = dayKeys.map((key) => summarizeDay(key, hours, days, raw, tz, opts.windDirs));

        const nowIdx = raw.findIndex((h) => h.time + HOUR > now);
        const cur = raw[Math.max(0, nowIdx)];
        const prev3 = raw[Math.max(0, nowIdx - 3)];
        const moon = Astro.moonIllumination(now);
        const parts = localParts(now, tz);

        return {
            timezone: tz,
            generatedAt: now,
            current: {
                pressure: cur.pressure,
                pressureTrend3h: cur.pressure - prev3.pressure,
                temp: cur.temp,
                wind: cur.wind,
                windDir: cur.windDir,
                windMatch: windMatch(cur.windDir, cur.wind, opts.windDirs),
                gust: cur.gust,
                code: cur.code,
                moon: { ...moon, ...Astro.moonPhaseName(moon.phase) },
                rut: { daysFromPeak: daysFromRutPeak(parts, opts.rutPeak), ...rutPhase(daysFromRutPeak(parts, opts.rutPeak)) }
            },
            hours,
            daily,
            solunar: solunar.filter((e) => e.time >= raw[startIdx].time - HOUR && e.time <= raw[endIdx - 1].time + HOUR)
        };
    }

    function scoreHour(raw, i, day, solunar, tz, opts) {
        const { rutPeak, windDirs } = opts;
        const h = raw[i];
        const parts = localParts(h.time, tz);
        const at = (k) => raw[clamp(i + k, 0, raw.length - 1)];
        const factors = [];
        const add = (group, [mult, label]) => {
            if (label) factors.push({ group, label, mult, effect: effectOf(mult) });
            return mult;
        };

        // --- Time of day baseline ---
        const t = (h.time + HOUR / 2) / HOUR; // middle of the hour
        const sunrise = day.sunrise / HOUR;
        const sunset = day.sunset / HOUR;
        const daylight = t >= sunrise && t <= sunset;
        const legalLight = h.time + HOUR > day.sunrise - 0.5 * HOUR && h.time < day.sunset + 0.5 * HOUR;
        const rut = rutPhase(daysFromRutPeak(parts, rutPeak));
        const floor = daylight ? 0.20 + rut.daytime : 0.35;
        const peak = Math.max(gauss(t, sunrise + 0.4, 1.1), gauss(t, sunset - 0.4, 1.1));
        const base = floor + (0.72 - floor) * peak;

        let timeLabel;
        if (peak > 0.6) timeLabel = t < (sunrise + sunset) / 2 ? 'Prime time — around sunrise' : 'Prime time — around sunset';
        else if (daylight) timeLabel = rut.daytime > 0.1 ? 'Midday — but the rut keeps bucks moving' : 'Midday — deer typically bedded';
        else timeLabel = 'Night — deer active, but outside legal shooting light';
        factors.push({ group: 'time', label: timeLabel, mult: 1, effect: peak > 0.6 ? 'up' : 'neutral' });

        let mult = 1;

        // --- Pressure ---
        const trend3 = h.pressure - at(-3).pressure;
        const rainingNow = h.precip > 0.01;
        let rainSoon = false;
        for (let k = 1; k <= 6; k++) if (at(k).precipProb >= 60 || at(k).precip >= 0.04) rainSoon = true;
        mult *= add('pressure', pressureLevelFactor(h.pressure));
        mult *= add('pressure', pressureTrendFactor(trend3, rainSoon, rainingNow));

        // Front passage: pressure bottomed out in the past 24 h and is now climbing, with cooler air.
        let minP = Infinity;
        for (let k = -24; k <= 0; k++) minP = Math.min(minP, at(k).pressure);
        const dT = h.temp - at(-24).temp;
        if (h.pressure - minP >= 0.12 && trend3 > 0 && dT <= -5) {
            mult *= add('pressure', [1.12, 'Cold front has passed — one of the best triggers for daylight movement']);
        }

        // --- Temperature ---
        mult *= add('temp', tempChangeFactor(dT));
        mult *= add('temp', tempAbsoluteFactor(h.temp, daylight));

        // --- Wind / precipitation / clouds ---
        mult *= add('wind', windFactor(h.wind, h.gust));
        const match = windMatch(h.windDir, h.wind, windDirs);
        mult *= add('wind', windDirFactor(match, h.windDir));
        let prev4 = 0;
        for (let k = -4; k <= -1; k++) prev4 = Math.max(prev4, at(k).precip);
        mult *= add('precip', precipFactor(h.precip, prev4));
        if (daylight && h.cloud >= 80 && !rainingNow) mult *= add('sky', [1.04, 'Overcast — deer more comfortable moving in daylight']);

        // --- Solunar ---
        const mid = h.time + HOUR / 2;
        let sol = null;
        for (const ev of solunar) {
            const dist = Math.abs(ev.time - mid);
            if (ev.major && dist <= 1.5 * HOUR) { sol = ev; break; }
            if (!ev.major && dist <= 1 * HOUR && !sol) sol = ev;
        }
        if (sol) {
            const names = { overhead: 'Moon overhead', underfoot: 'Moon underfoot', rise: 'Moonrise', set: 'Moonset' };
            mult *= add('moon', sol.major
                ? [1.08, `Solunar major period (${names[sol.type]})`]
                : [1.04, `Solunar minor period (${names[sol.type]})`]);
        }

        // --- Rut ---
        if (rut.mult !== 1 || rut.daytime > 0) {
            mult *= add('rut', [rut.mult, rut.name]);
        }

        // Factors overlap (a front brings pressure, temperature and wind changes together),
        // so dampen the combined effect instead of letting them stack linearly.
        const weather = clamp(Math.pow(mult, 0.7), 0.45, 1.4);
        const score = Math.round(clamp(base * weather * 100, 0, 100));
        return {
            time: h.time,
            dateKey: parts.dateKey,
            hour: parts.hour,
            score,
            rating: ratingFor(score),
            daylight,
            legalLight,
            pressure: h.pressure,
            trend3,
            temp: h.temp,
            wind: h.wind,
            gust: h.gust,
            windDir: h.windDir,
            windMatch: match,
            precip: h.precip,
            precipProb: h.precipProb,
            cloud: h.cloud,
            code: h.code,
            factors
        };
    }

    function ratingFor(score) {
        if (score >= 80) return { key: 'excellent', label: 'Excellent' };
        if (score >= 65) return { key: 'verygood', label: 'Very Good' };
        if (score >= 45) return { key: 'good', label: 'Good' };
        if (score >= 25) return { key: 'fair', label: 'Fair' };
        return { key: 'poor', label: 'Poor' };
    }

    /** Contiguous blocks of high-scoring hours during legal shooting light. */
    function bestWindows(dayHours, windDirs) {
        const legal = dayHours.filter((h) => h.legalLight);
        if (!legal.length) return [];
        const max = Math.max(...legal.map((h) => h.score));
        const threshold = Math.max(40, max - 12);
        const windows = [];
        let cur = null;
        for (const h of legal) {
            const contiguous = cur && h.time - cur.hours[cur.hours.length - 1].time === HOUR;
            if (h.score >= threshold) {
                if (!contiguous) { cur = { hours: [] }; windows.push(cur); }
                cur.hours.push(h);
            } else {
                cur = null;
            }
        }
        return windows
            .map((w) => ({
                start: w.hours[0].time,
                end: w.hours[w.hours.length - 1].time + HOUR,
                peak: Math.max(...w.hours.map((h) => h.score)),
                avg: Math.round(w.hours.reduce((s, h) => s + h.score, 0) / w.hours.length),
                ...(() => {
                    const dir = meanWindDir(w.hours);
                    const speed = w.hours.reduce((s, h) => s + h.wind, 0) / w.hours.length;
                    return { windDir: dir, wind: speed, windMatch: windMatch(dir, speed, windDirs) };
                })()
            }))
            .sort((a, b) => b.peak - a.peak || b.avg - a.avg)
            .slice(0, 3)
            .sort((a, b) => a.start - b.start);
    }

    function summarizeDay(key, hours, days, raw, tz, windDirs) {
        const dayHours = hours.filter((h) => h.dateKey === key);
        const dayInfo = days.find((d) => localParts(d.start + 12 * HOUR, tz).dateKey === key) || {};
        const inWindow = (from, to) => dayHours.filter((h) => h.time + HOUR > from && h.time < to);
        // A period needs at least 2 forecast hours left to be rated (avoids a mostly-past morning).
        const maxScore = (arr) => (arr.length >= 2 ? Math.max(...arr.map((h) => h.score)) : null);
        const sr = dayInfo.sunrise; const ss = dayInfo.sunset;
        const am = sr ? maxScore(inWindow(sr - HOUR, sr + 3 * HOUR)) : null;
        const pm = ss ? maxScore(inWindow(ss - 3 * HOUR, ss + HOUR)) : null;
        const middayHours = sr ? inWindow(sr + 3 * HOUR, ss - 3 * HOUR) : [];
        const midday = middayHours.length
            ? Math.round(middayHours.reduce((s, h) => s + h.score, 0) / middayHours.length) : null;

        // Use the whole raw day for pressure/temp ranges (not just remaining hours).
        const fullDay = raw.filter((h) => localParts(h.time, tz).dateKey === key && h.pressure != null);
        const pressures = fullDay.map((h) => h.pressure);
        const temps = fullDay.map((h) => h.temp);
        const winds = fullDay.map((h) => h.wind);
        const precipTotal = fullDay.reduce((s, h) => s + (h.precip || 0), 0);

        // Weighted average of whichever periods are still ahead of us.
        const weighted = [[am, 0.4], [pm, 0.4], [midday, 0.2]].filter(([v]) => v != null);
        const wsum = weighted.reduce((s, [, w]) => s + w, 0);
        const overall = wsum ? Math.round(weighted.reduce((s, [v, w]) => s + v * w, 0) / wsum) : null;

        return {
            dateKey: key,
            noon: (dayInfo.start ?? dayHours[0].time) + 12 * HOUR,
            sunrise: sr,
            sunset: ss,
            am, pm, midday,
            overall,
            rating: overall != null ? ratingFor(overall) : null,
            pressureStart: pressures[0],
            pressureEnd: pressures[pressures.length - 1],
            pressureMin: Math.min(...pressures),
            pressureMax: Math.max(...pressures),
            tempMin: Math.min(...temps),
            tempMax: Math.max(...temps),
            windMax: Math.max(...winds),
            precipTotal,
            windows: bestWindows(dayHours, windDirs),
            moon: (() => {
                const m = Astro.moonIllumination((dayInfo.start ?? dayHours[0].time) + 12 * HOUR);
                return { ...m, ...Astro.moonPhaseName(m.phase) };
            })()
        };
    }

    const DeerForecast = {
        buildForecast, ratingFor, rutPhase, daysFromRutPeak, localParts, windMatch, compass, COMPASS_8, HPA_TO_INHG
    };
    root.DeerForecast = DeerForecast;
    if (typeof module !== 'undefined' && module.exports) module.exports = DeerForecast;
})(typeof globalThis !== 'undefined' ? globalThis : this);
