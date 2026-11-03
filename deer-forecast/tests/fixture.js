// Synthetic Open-Meteo response: a cold front passes ~30 h after `now`.
// Used by the unit tests and for previewing the UI without network access.
function makeWeather(nowMs, { lat = 38.25, lon = -85.76, utcOffsetHours = -5 } = {}) {
    const HOUR = 3600 * 1000;
    const offset = utcOffsetHours * 3600; // -5 EST (Nov), -4 EDT (Apr) for America/New_York
    const localMidnight = (ms) => Math.floor((ms / 1000 + offset) / 86400) * 86400 - offset;
    const start = localMidnight(nowMs) - 2 * 86400;
    const days = 7;
    const n = days * 24;
    const time = []; const pressure = []; const temp = []; const precip = []; const prob = [];
    const cloud = []; const wind = []; const gust = []; const dir = []; const code = [];
    const frontAt = (nowMs / 1000) + 30 * 3600;
    for (let i = 0; i < n; i++) {
        const t = start + i * 3600;
        const hrsToFront = (t - frontAt) / 3600;
        const localHour = ((t + offset) / 3600) % 24;
        const diurnal = -Math.cos(((localHour - 3) / 24) * 2 * Math.PI) * 9;
        // pressure (hPa): falling into the front, sharp rise after
        let p = 1018;
        if (hrsToFront < 0 && hrsToFront > -24) p = 1018 + hrsToFront * 0.55;
        if (hrsToFront >= 0) p = 1004.8 + Math.min(hrsToFront, 20) * 0.95;
        const pre = hrsToFront < 0;
        time.push(t);
        pressure.push(+p.toFixed(1));
        temp.push(+((pre ? 58 : 38) + diurnal).toFixed(1));
        const raining = hrsToFront > -4 && hrsToFront < 2;
        precip.push(raining ? 0.12 : 0);
        prob.push(raining ? 90 : hrsToFront > -10 && hrsToFront < 3 ? 65 : 5);
        cloud.push(raining ? 100 : pre ? 60 : 15);
        wind.push(raining ? 18 : pre ? 9 : 6);
        gust.push(raining ? 32 : 14);
        dir.push(pre ? 200 : 320);
        code.push(raining ? 63 : pre ? 2 : 0);
    }
    const daily = { time: [], sunrise: [], sunset: [] };
    for (let d = 0; d < days; d++) {
        const mid = start + d * 86400;
        daily.time.push(mid);
        daily.sunrise.push(mid + Math.round(7.2 * 3600));
        daily.sunset.push(mid + Math.round(17.75 * 3600));
    }
    return {
        latitude: lat, longitude: lon, timezone: 'America/New_York', utc_offset_seconds: offset,
        hourly: {
            time, pressure_msl: pressure, temperature_2m: temp, precipitation: precip,
            precipitation_probability: prob, cloud_cover: cloud, wind_speed_10m: wind,
            wind_gusts_10m: gust, wind_direction_10m: dir, weather_code: code
        },
        daily
    };
}

if (typeof module !== 'undefined') module.exports = { makeWeather };
if (typeof window !== 'undefined') window.makeWeather = makeWeather;
