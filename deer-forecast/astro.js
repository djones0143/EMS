/*
 * Moon calculations for solunar periods.
 * Formulas follow the low-precision algorithms popularised by SunCalc
 * (Vladimir Agafonkin, BSD-2-Clause) and Astronomy Answers.
 */
(function (root) {
    'use strict';

    const PI = Math.PI;
    const rad = PI / 180;
    const dayMs = 864e5;
    const J1970 = 2440588;
    const J2000 = 2451545;
    const e = rad * 23.4397; // obliquity of the Earth

    const toJulian = (ms) => ms / dayMs - 0.5 + J1970;
    const toDays = (ms) => toJulian(ms) - J2000;

    const rightAscension = (l, b) =>
        Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
    const declination = (l, b) =>
        Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
    const altitude = (H, phi, dec) =>
        Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
    const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

    function sunCoords(d) {
        const M = rad * (357.5291 + 0.98560028 * d);
        const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
        const L = M + C + rad * 102.9372 + PI;
        return { dec: declination(L, 0), ra: rightAscension(L, 0) };
    }

    function moonCoords(d) {
        const L = rad * (218.316 + 13.176396 * d);
        const M = rad * (134.963 + 13.064993 * d);
        const F = rad * (93.272 + 13.22935 * d);
        const l = L + rad * 6.289 * Math.sin(M);
        const b = rad * 5.128 * Math.sin(F);
        const dist = 385001 - 20905 * Math.cos(M);
        return { ra: rightAscension(l, b), dec: declination(l, b), dist };
    }

    /** Moon altitude in degrees at a given time (ms) and location. */
    function moonAltitude(ms, lat, lon) {
        const lw = rad * -lon;
        const phi = rad * lat;
        const d = toDays(ms);
        const c = moonCoords(d);
        const H = siderealTime(d, lw) - c.ra;
        return altitude(H, phi, c.dec) / rad;
    }

    /** Fraction illuminated (0..1) and phase (0 new, 0.25 first qtr, 0.5 full, 0.75 last qtr). */
    function moonIllumination(ms) {
        const d = toDays(ms);
        const s = sunCoords(d);
        const m = moonCoords(d);
        const sdist = 149598000;
        const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) +
            Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
        const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
        const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra),
            Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
        return {
            fraction: (1 + Math.cos(inc)) / 2,
            phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / PI
        };
    }

    function moonPhaseName(phase) {
        const names = [
            ['New Moon', '🌑'], ['Waxing Crescent', '🌒'], ['First Quarter', '🌓'], ['Waxing Gibbous', '🌔'],
            ['Full Moon', '🌕'], ['Waning Gibbous', '🌖'], ['Last Quarter', '🌗'], ['Waning Crescent', '🌘']
        ];
        const idx = Math.round(phase * 8) % 8;
        return { name: names[idx][0], icon: names[idx][1] };
    }

    /**
     * Solunar events between startMs and endMs: moonrise, moonset (minor periods)
     * and moon overhead / underfoot (major periods). Sampled every 5 minutes.
     */
    function solunarEvents(startMs, endMs, lat, lon) {
        const step = 5 * 60 * 1000;
        const events = [];
        const pad = 2 * 3600 * 1000;
        let t0 = startMs - pad;
        let a0 = moonAltitude(t0, lat, lon);
        let t1 = t0 + step;
        let a1 = moonAltitude(t1, lat, lon);
        for (let t2 = t1 + step; t2 <= endMs + pad; t2 += step) {
            const a2 = moonAltitude(t2, lat, lon);
            if (a0 < 0 && a1 >= 0) events.push({ type: 'rise', time: interp(t0, a0, t1, a1) });
            if (a0 >= 0 && a1 < 0) events.push({ type: 'set', time: interp(t0, a0, t1, a1) });
            if (a1 > a0 && a1 >= a2) events.push({ type: 'overhead', time: t1 });
            if (a1 < a0 && a1 <= a2) events.push({ type: 'underfoot', time: t1 });
            t0 = t1; a0 = a1; t1 = t2; a1 = a2;
        }
        return events.map((ev) => ({
            ...ev,
            major: ev.type === 'overhead' || ev.type === 'underfoot'
        }));
    }

    function interp(t0, a0, t1, a1) {
        return Math.round(t0 + (t1 - t0) * (0 - a0) / (a1 - a0));
    }

    const Astro = { moonAltitude, moonIllumination, moonPhaseName, solunarEvents };
    root.Astro = Astro;
    if (typeof module !== 'undefined' && module.exports) module.exports = Astro;
})(typeof globalThis !== 'undefined' ? globalThis : this);
