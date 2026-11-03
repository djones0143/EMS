/*
 * Game movement model for whitetail deer, elk and wild turkey.
 *
 * Each species has a profile (see SPECIES) with its own time-of-day pattern,
 * weather weights, legal hours and season phases. For deer, the hourly
 * 0-100 "movement score" comes from:
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

    // ---- Season phase (rut / bugle / gobbling) -------------------------------

    /** Days from a season peak date ("MM-DD") to the given local date (nearest year). */
    function daysFromPeak(parts, peak) {
        const [pm, pd] = (peak || '11-12').split('-').map(Number);
        const today = Date.UTC(parts.year, parts.month - 1, parts.day);
        let best = Infinity;
        for (const y of [parts.year - 1, parts.year, parts.year + 1]) {
            const diff = Math.round((today - Date.UTC(y, pm - 1, pd)) / DAY);
            if (Math.abs(diff) < Math.abs(best)) best = diff;
        }
        return best;
    }

    function rutPhase(daysFromPeakValue) {
        const d = daysFromPeakValue;
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

    function elkPhase(d) {
        if (d >= -25 && d < -10) return { key: 'pre', name: 'Pre-rut — bugling starts', daytime: 0.05, mult: 1.03,
            note: 'Bulls bugling more each day and starting to gather cows.' };
        if (d >= -10 && d <= 10) return { key: 'peak', name: 'Peak rut (bugling)', daytime: 0.18, mult: 1.08,
            note: 'Bulls herding cows and answering bugles — cool, calm mornings are best and calling works.' };
        if (d > 10 && d <= 25) return { key: 'post', name: 'Late rut', daytime: 0.05, mult: 1.0,
            note: 'Bugling tapers off; satellite bulls still hunting for cows.' };
        return { key: 'none', name: 'Outside the rut', daytime: 0, mult: 1.0,
            note: 'Elk follow food, water and security cover; hunting pressure pushes them into dark timber.' };
    }

    function turkeyPhase(d, parts) {
        if (d >= -40 && d < -15) return { key: 'early', name: 'Early spring — flocks breaking up', daytime: 0, mult: 1.0,
            note: 'Gobblers fired up on the roost while birds split from winter flocks.' };
        if (d >= -15 && d < 0) return { key: 'breeding', name: 'Peak breeding — gobblers henned up', daytime: 0, mult: 0.96,
            note: 'Lots of gobbling at daylight, but hens lead toms away — set up between the roost and strut zones.' };
        if (d >= 0 && d <= 21) return { key: 'nesting', name: 'Hens nesting — prime calling', daytime: 0.15, mult: 1.10,
            note: 'Hens leave gobblers mid-morning; lonely toms answer calls, often 9 am – 1 pm.' };
        if (d > 21 && d <= 40) return { key: 'late', name: 'Late spring', daytime: 0.05, mult: 0.95,
            note: 'Gobbling tapers off — hunt known strut zones quietly and be patient.' };
        if (parts.month >= 9 || parts.month === 1) return { key: 'fall', name: 'Fall flock season', daytime: 0.05, mult: 1.0,
            note: 'Birds travel in family flocks — locate, scatter and call them back together.' };
        return { key: 'none', name: 'Outside turkey season', daytime: 0, mult: 1.0,
            note: 'Birds roost, feed and dust on a daily routine; weather patterns still apply.' };
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

    function pressureTrendFactor(trend3, rainSoon, rainingNow, Noun) {
        if (trend3 >= 0.06) return [1.15, 'Pressure rising fast — classic post-front movement'];
        if (trend3 >= 0.02) return [1.10, 'Pressure rising'];
        if (trend3 > -0.02) return [1.00, 'Pressure steady'];
        if (trend3 > -0.06) return [0.93, 'Pressure falling slowly'];
        if (rainSoon && !rainingNow) return [1.10, `Pressure dropping fast ahead of a front — ${Noun} often feed before the storm`];
        return [0.85, 'Pressure falling fast'];
    }

    function tempChangeFactor(dT) {
        if (dT <= -10) return [1.15, `Temperature ${Math.round(-dT)}°F colder than 24 h ago`];
        if (dT <= -4) return [1.07, `Cooler than yesterday (${Math.round(dT)}°F)`];
        if (dT < 4) return [1.00, 'Temperature similar to yesterday'];
        if (dT < 10) return [0.95, `Warmer than yesterday (+${Math.round(dT)}°F)`];
        return [0.88, `Much warmer than yesterday (+${Math.round(dT)}°F)`];
    }

    function deerTempFactor(t, daylight) {
        if (!daylight) return [1.00, null];
        if (t >= 75) return [0.75, `Hot (${Math.round(t)}°F) — deer bed down in shade`];
        if (t >= 65) return [0.85, `Warm (${Math.round(t)}°F) — daytime movement suppressed`];
        if (t >= 55) return [0.95, `Mild (${Math.round(t)}°F)`];
        if (t <= 5) return [0.92, `Bitter cold (${Math.round(t)}°F) — deer conserve energy`];
        if (t <= 40) return [1.05, `Cold (${Math.round(t)}°F) — deer need to feed`];
        return [1.00, null];
    }

    function elkTempFactor(t, daylight) {
        if (!daylight) return [1.00, null];
        if (t >= 75) return [0.60, `Hot (${Math.round(t)}°F) — elk bed in dark timber early`];
        if (t >= 65) return [0.72, `Warm (${Math.round(t)}°F) — elk overheat easily and bed early`];
        if (t >= 55) return [0.88, `Mild (${Math.round(t)}°F) — expect a short morning window`];
        if (t <= 5) return [0.95, `Bitter cold (${Math.round(t)}°F)`];
        if (t <= 40) return [1.07, `Cold (${Math.round(t)}°F) — elk feed later into the morning`];
        return [1.00, null];
    }

    function windFactor(speed, gust, noun) {
        let f; let label;
        if (speed <= 10) { f = 1.00; label = `Light wind (${Math.round(speed)} mph)`; }
        else if (speed <= 15) { f = 0.92; label = `Breezy (${Math.round(speed)} mph)`; }
        else if (speed <= 20) { f = 0.82; label = `Windy (${Math.round(speed)} mph) — ${noun} hold tight`; }
        else { f = 0.70; label = `Strong wind (${Math.round(speed)} mph) — ${noun} hunker down`; }
        if (gust >= 30) { f *= 0.92; label += `, gusts ${Math.round(gust)}`; }
        return [f, label];
    }

    function precipFactor(now, prev4max, noun) {
        if (now >= 0.15) return [0.65, 'Heavy rain'];
        if (now >= 0.04) return [0.80, 'Steady rain'];
        if (now > 0) return [0.97, 'Light drizzle — little effect'];
        if (prev4max >= 0.04) return [1.12, `Rain just ended — ${noun} get up to feed`];
        return [1.00, null];
    }

    // Turkeys: sight and sound hunters' quarry — wind and rain matter most.
    function turkeyWindFactor(speed, gust) {
        let f; let label;
        const mph = Math.round(speed);
        if (speed <= 5) { f = 1.10; label = `Calm (${mph} mph) — gobbles carry and birds hear your calls`; }
        else if (speed <= 10) { f = 1.00; label = `Light wind (${mph} mph)`; }
        else if (speed <= 15) { f = 0.85; label = `Breezy (${mph} mph) — birds can't hear well and get nervous`; }
        else if (speed <= 20) { f = 0.72; label = `Windy (${mph} mph) — little gobbling, birds in sheltered hollows`; }
        else { f = 0.60; label = `Strong wind (${mph} mph) — birds hunker in sheltered hollows`; }
        if (gust >= 25) { f *= 0.92; label += `, gusts ${Math.round(gust)}`; }
        return [f, label];
    }

    function turkeyPrecipFactor(now, prev4max) {
        if (now >= 0.15) return [0.65, 'Heavy rain — birds hunker down'];
        if (now >= 0.04) return [0.80, 'Rain — birds go quiet and move to open fields'];
        if (now > 0) return [0.92, 'Drizzle — check open fields and pastures'];
        if (prev4max >= 0.04) return [1.10, 'Rain just ended — birds head to fields to dry off and feed'];
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

    function windDirFactor(match, dir, profile) {
        const from = compass(dir);
        const { good, ok, bad } = profile.windDirWeights;
        switch (match) {
            case 'good': return [good, `${from} wind — right wind for your stand`];
            case 'ok': return [ok, `${from} wind — close to your stand's wind`];
            case 'bad': return [bad, `${from} wind — wrong wind for your stand; ${profile.noun} may smell you`];
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

    // ---- Species profiles ----------------------------------------------------
    //
    // baseline(): time-of-day activity (0..~0.75) before weather adjustments.
    // weather():  multiplies in the species' weather factors via add(group, [mult, label]).

    function crepuscularBaseline(ctx, o) {
        const { t, sunrise, sunset, daylight, phase } = ctx;
        const floor = daylight ? o.dayFloor + phase.daytime : o.nightFloor;
        const peak = Math.max(gauss(t, sunrise + o.amShift, o.amSigma), gauss(t, sunset - o.pmShift, o.pmSigma));
        const base = floor + (0.72 - floor) * peak;
        let label;
        if (peak > 0.6) label = t < (sunrise + sunset) / 2 ? 'Prime time — around sunrise' : 'Prime time — around sunset';
        else if (daylight) label = phase.daytime > 0.1 ? o.rutMidday : o.midday;
        else label = `Night — ${o.noun} active, but outside legal shooting light`;
        return { base, label, prime: peak > 0.6 };
    }

    function ungulateWeather(ctx, add, profile, tempFactor) {
        const { h, trend3, rainSoon, rainingNow, minP, dT, prev4, daylight } = ctx;
        let m = 1;
        m *= add('pressure', pressureLevelFactor(h.pressure));
        m *= add('pressure', pressureTrendFactor(trend3, rainSoon, rainingNow, profile.Noun));
        if (h.pressure - minP >= 0.12 && trend3 > 0 && dT <= -5) {
            m *= add('pressure', [1.12, 'Cold front has passed — one of the best triggers for daylight movement']);
        }
        m *= add('temp', tempChangeFactor(dT));
        m *= add('temp', tempFactor(h.temp, daylight));
        m *= add('wind', windFactor(h.wind, h.gust, profile.noun));
        m *= add('precip', precipFactor(h.precip, prev4, profile.noun));
        if (daylight && h.cloud >= 80 && !rainingNow) {
            m *= add('sky', [1.04, `Overcast — ${profile.noun} more comfortable moving in daylight`]);
        }
        return m;
    }

    const SPECIES = {
        deer: {
            id: 'deer', name: 'Whitetail', noun: 'deer', Noun: 'Deer',
            title: 'Whitetail Movement Forecast', scoreLabel: 'Movement',
            seasonLabel: 'Rut phase', peakLabel: 'Peak rut date for your area', defaultPeak: '11-12',
            peakHelp: 'Most of the Midwest, Northeast and Kentucky peak around Nov 5–15. Parts of the Deep South ' +
                'peak in December–January. Check your state wildlife agency\'s breeding-date map.',
            usesWindDir: true, solunar: true,
            windDirWeights: { good: 1.10, ok: 1.03, bad: 0.85 },
            legal: (day) => [day.sunrise - 0.5 * HOUR, day.sunset + 0.5 * HOUR],
            phase: (d) => rutPhase(d),
            baseline: (ctx) => crepuscularBaseline(ctx, {
                dayFloor: 0.20, nightFloor: 0.35, amShift: 0.4, amSigma: 1.1, pmShift: 0.4, pmSigma: 1.1, noun: 'deer',
                midday: 'Midday — deer typically bedded', rutMidday: 'Midday — but the rut keeps bucks moving'
            }),
            weather(ctx, add) { return ungulateWeather(ctx, add, this, deerTempFactor); }
        },

        elk: {
            id: 'elk', name: 'Elk', noun: 'elk', Noun: 'Elk',
            title: 'Elk Movement Forecast', scoreLabel: 'Movement',
            seasonLabel: 'Rut phase', peakLabel: 'Peak bugle (rut) date', defaultPeak: '09-25',
            peakHelp: 'Most elk herds, including Kentucky\'s, peak around Sept 20 – Oct 5. High-country herds can ' +
                'run a week earlier.',
            usesWindDir: true, solunar: true,
            // An elk's nose is less forgiving than a deer's.
            windDirWeights: { good: 1.12, ok: 1.03, bad: 0.80 },
            legal: (day) => [day.sunrise - 0.5 * HOUR, day.sunset + 0.5 * HOUR],
            phase: (d) => elkPhase(d),
            baseline: (ctx) => crepuscularBaseline(ctx, {
                dayFloor: 0.15, nightFloor: 0.38, amShift: 0.3, amSigma: 1.3, pmShift: 0.3, pmSigma: 1.2, noun: 'elk',
                midday: 'Midday — elk bedded in timber', rutMidday: 'Midday — rutting bulls may still bugle'
            }),
            weather(ctx, add) { return ungulateWeather(ctx, add, this, elkTempFactor); }
        },

        turkey: {
            id: 'turkey', name: 'Turkey', noun: 'turkeys', Noun: 'Turkeys',
            title: 'Turkey Activity Forecast', scoreLabel: 'Activity',
            seasonLabel: 'Season phase', peakLabel: 'Date hens start nesting', defaultPeak: '04-20',
            peakHelp: 'In Kentucky and much of the Midwest hens begin nesting around Apr 15–25; the Deep South is ' +
                '2–3 weeks earlier, the North 1–2 weeks later. Fall dates use the flock-season pattern.',
            usesWindDir: false, solunar: false,
            windDirWeights: { good: 1, ok: 1, bad: 1 },
            // Spring turkey hours in most states end at sunset.
            legal: (day) => [day.sunrise - 0.5 * HOUR, day.sunset],
            phase: (d, parts) => turkeyPhase(d, parts),
            baseline(ctx) {
                const { t, sunrise, sunset, phase } = ctx;
                if (t < sunrise - 0.75 || t > sunset) {
                    return { base: 0.05, label: 'On the roost', prime: false };
                }
                const floor = 0.28 + phase.daytime;
                const gm = gauss(t, sunrise + 0.75, 1.2);
                const ge = gauss(t, sunset - 1.5, 1.2) * 0.5;
                const base = floor + (0.75 - floor) * Math.max(gm, ge);
                let label;
                if (gm > 0.6) label = 'Prime time — gobbling and fly-down';
                else if (t < (sunrise + sunset) / 2 + 1) {
                    label = phase.daytime > 0.1 ? 'Late morning — lonely gobblers answer calls' : 'Midday — birds feeding and loafing';
                } else label = 'Afternoon — birds feeding toward the roost';
                return { base, label, prime: gm > 0.6 };
            },
            weather(ctx, add) {
                const { h, trend3, dT, prev4, daylight, morning, phase } = ctx;
                let m = 1;
                if (h.pressure >= 30.0) m *= add('pressure', [1.05, 'High pressure — clear, calm mornings mean more gobbling']);
                else if (h.pressure < 29.8) m *= add('pressure', [0.90, 'Low pressure — birds quieter']);
                else m *= add('pressure', [1.00, 'Pressure about average']);
                if (trend3 >= 0.02) m *= add('pressure', [1.05, 'Pressure rising — clearing weather']);
                else if (trend3 <= -0.06) m *= add('pressure', [0.88, 'Pressure falling fast — birds go quiet ahead of storms']);
                else if (trend3 <= -0.02) m *= add('pressure', [0.95, 'Pressure falling']);
                else m *= add('pressure', [1.00, 'Pressure steady']);

                const spring = phase.key !== 'fall' && phase.key !== 'none';
                if (daylight && h.temp >= 80) m *= add('temp', [0.85, `Hot (${Math.round(h.temp)}°F) — birds loaf in shade`]);
                else if (spring && morning && h.temp < 32) m *= add('temp', [0.90, `Cold morning (${Math.round(h.temp)}°F) — gobbling starts late`]);
                else if (spring && dT <= -10) m *= add('temp', [0.93, 'Sharp cold snap — gobbling slows']);

                m *= add('wind', turkeyWindFactor(h.wind, h.gust));
                m *= add('precip', turkeyPrecipFactor(h.precip, prev4));
                if (morning && (h.code === 45 || h.code === 48)) m *= add('sky', [0.90, 'Fog — birds stay on the roost longer']);
                else if (morning && h.cloud < 30 && h.precip === 0) m *= add('sky', [1.04, 'Clear sky — good gobbling morning']);
                return m;
            }
        }
    };

    // ---- Main ----------------------------------------------------------------

    /**
     * @param {object} wx  Open-Meteo forecast response (timeformat=unixtime, imperial units).
     * @param {object} opts { lat, lon, species: 'deer'|'elk'|'turkey', seasonPeak: 'MM-DD',
     *                        windDirs: ['NW', ...], now: ms, hoursAhead: number }
     *                        (rutPeak is accepted as an alias of seasonPeak)
     */
    function buildForecast(wx, optsIn) {
        const profile = SPECIES[optsIn.species] || SPECIES.deer;
        const opts = {
            ...optsIn,
            profile,
            seasonPeak: optsIn.seasonPeak || optsIn.rutPeak || profile.defaultPeak,
            windDirs: profile.usesWindDir ? optsIn.windDirs : []
        };
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
                season: (() => {
                    const d = daysFromPeak(parts, opts.seasonPeak);
                    return { daysFromPeak: d, ...profile.phase(d, parts) };
                })()
            },
            species: {
                id: profile.id, name: profile.name, noun: profile.noun, title: profile.title,
                scoreLabel: profile.scoreLabel, seasonLabel: profile.seasonLabel, usesWindDir: profile.usesWindDir
            },
            hours,
            daily,
            solunar: solunar.filter((e) => e.time >= raw[startIdx].time - HOUR && e.time <= raw[endIdx - 1].time + HOUR)
        };
    }

    function scoreHour(raw, i, day, solunar, tz, opts) {
        const { profile, seasonPeak, windDirs } = opts;
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
        const [legalStart, legalEnd] = profile.legal(day);
        const legalLight = h.time + HOUR > legalStart && h.time < legalEnd;
        const phase = profile.phase(daysFromPeak(parts, seasonPeak), parts);
        const tod = profile.baseline({ t, sunrise, sunset, daylight, phase });
        factors.push({ group: 'time', label: tod.label, mult: 1, effect: tod.prime ? 'up' : 'neutral' });

        // --- Context shared by the species weather models ---
        const trend3 = h.pressure - at(-3).pressure;
        const rainingNow = h.precip > 0.01;
        let rainSoon = false;
        for (let k = 1; k <= 6; k++) if (at(k).precipProb >= 60 || at(k).precip >= 0.04) rainSoon = true;
        let minP = Infinity;
        for (let k = -24; k <= 0; k++) minP = Math.min(minP, at(k).pressure);
        const dT = h.temp - at(-24).temp;
        let prev4 = 0;
        for (let k = -4; k <= -1; k++) prev4 = Math.max(prev4, at(k).precip);
        const morning = t >= sunrise - 1 && t <= sunrise + 3;

        let mult = profile.weather({ h, trend3, rainSoon, rainingNow, minP, dT, prev4, daylight, morning, phase }, add);

        // --- Stand wind direction ---
        const match = windMatch(h.windDir, h.wind, windDirs);
        mult *= add('wind', windDirFactor(match, h.windDir, profile));

        // --- Solunar ---
        if (profile.solunar) {
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
        }

        // --- Season phase (rut / bugle / gobbling) ---
        if (phase.mult !== 1 || phase.daytime > 0) {
            mult *= add('season', [phase.mult, phase.name]);
        }

        const base = tod.base;
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
            legalStart,
            legalEnd,
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
                // Trim to legal shooting light (e.g. turkey hours end at sunset).
                start: Math.max(w.hours[0].time, w.hours[0].legalStart),
                end: Math.min(w.hours[w.hours.length - 1].time + HOUR, w.hours[w.hours.length - 1].legalEnd),
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
        buildForecast, ratingFor, rutPhase, elkPhase, turkeyPhase, daysFromPeak,
        daysFromRutPeak: daysFromPeak, localParts, windMatch, compass, COMPASS_8, SPECIES, HPA_TO_INHG
    };
    root.DeerForecast = DeerForecast;
    if (typeof module !== 'undefined' && module.exports) module.exports = DeerForecast;
})(typeof globalThis !== 'undefined' ? globalThis : this);
