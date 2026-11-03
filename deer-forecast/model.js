// Whitetail movement scoring model.
// Each hour starts at a base score; factors add or subtract points; rut phase
// multiplies; hours outside legal light are discounted. Result is clamped 0..100.
(function () {
  const BASE = 30;

  // Trapezoid: 0 at a, ramps to 1 by b, holds to c, back to 0 at d.
  function trap(x, a, b, c, d) {
    if (x <= a || x >= d) return 0;
    if (x < b) return (x - a) / (b - a);
    if (x <= c) return 1;
    return (d - x) / (d - c);
  }

  // Rut phase from days relative to the local peak-breeding date.
  function rutPhase(unixSec, peakMMDD, offsetSec) {
    const local = new Date((unixSec + offsetSec) * 1000);
    const y = local.getUTCFullYear();
    const [m, dd] = peakMMDD.split('-').map(Number);
    let best = Infinity;
    for (const yr of [y - 1, y, y + 1]) {
      const peak = Date.UTC(yr, m - 1, dd);
      const diff = (Date.UTC(y, local.getUTCMonth(), local.getUTCDate()) - peak) / 86400000;
      if (Math.abs(diff) < Math.abs(best)) best = diff;
    }
    const d = best;
    if (d >= -45 && d < -28) return { name: 'Pre-rut', note: 'Rubs & scrapes showing up', mult: 1.03, cruise: false, d };
    if (d >= -28 && d < -14) return { name: 'Seeking', note: 'Bucks start cruising for does', mult: 1.08, cruise: true, d };
    if (d >= -14 && d < -3) return { name: 'Chasing', note: 'Peak daylight buck movement', mult: 1.15, cruise: true, d };
    if (d >= -3 && d <= 7) return { name: 'Breeding / lockdown', note: 'Bucks tied up with does; sightings can dip', mult: 1.04, cruise: true, d };
    if (d > 7 && d <= 25) return { name: 'Post-rut', note: 'Bucks recovering, feeding hard', mult: 1.03, cruise: false, d };
    if (d > 25 && d <= 38) return { name: 'Second rut', note: 'Late does coming into heat', mult: 1.06, cruise: true, d };
    return { name: 'Off-season pattern', note: 'Food and cover drive movement', mult: 1.0, cruise: false, d };
  }

  // h: array of hour objects; i: index; ctx: {lon, offset, rutPeak}
  function scoreHour(h, i, ctx) {
    const x = h[i];
    const mid = x.t + 1800; // middle of the hour
    const f = [];
    const add = (label, pts) => { if (Math.abs(pts) >= 0.5) f.push({ label, pts: Math.round(pts) }); };

    // --- Light (biggest driver) ---
    const mSunrise = (mid - x.sunrise) / 60;
    const mSunset = (mid - x.sunset) / 60;
    const dawn = trap(mSunrise, -60, -15, 75, 150);
    const dusk = trap(mSunset, -150, -75, 20, 60);
    const legal = mSunrise >= -30 && mSunset <= 30;
    if (dawn > 0 || dusk > 0) add(dawn >= dusk ? 'Dawn movement window' : 'Dusk movement window', 28 * Math.max(dawn, dusk));
    else if (legal) add('Midday', -6);

    const rut = rutPhase(x.t, ctx.rutPeak, ctx.offset);
    const localHour = new Date((mid + ctx.offset) * 1000).getUTCHours() + new Date((mid + ctx.offset) * 1000).getUTCMinutes() / 60;
    if (rut.cruise && legal && localHour >= 10.5 && localHour <= 14) add('Midday rut cruising', 8);

    // --- Barometric pressure ---
    const p = x.p;
    if (p >= 30.1 && p <= 30.4) add('High, stable-range barometer', 10);
    else if (p > 30.4) add('Very high barometer', 6);
    else if (p >= 29.8) add('Mid-range barometer', 3);
    else add('Low barometer (stormy)', -8);

    if (i >= 3) {
      const d3 = p - h[i - 3].p;
      if (d3 >= 0.1) add('Pressure rising fast (front clearing)', 9);
      else if (d3 >= 0.02) add('Pressure rising', 12);
      else if (d3 > -0.02) add('Pressure steady', 4);
      else if (d3 > -0.06) add('Pressure falling slowly (pre-front feeding)', 8);
      else add('Pressure falling fast (storm moving in)', -12);
    }
    if (i >= 24) {
      const d24 = p - h[i - 24].p;
      const t24 = x.temp - h[i - 24].temp;
      if (d24 >= 0.15 && t24 <= -5) add('Post-cold-front day', 10);
    }

    // --- Temperature ---
    if (i >= 24) {
      const t24 = x.temp - h[i - 24].temp;
      if (t24 <= -10) add(`Much colder than yesterday (${Math.round(t24)}°)`, 10);
      else if (t24 <= -5) add(`Cooler than yesterday (${Math.round(t24)}°)`, 5);
      else if (t24 >= 10) add(`Much warmer than yesterday (+${Math.round(t24)}°)`, -7);
    }
    if (x.temp >= 75) add('Hot', -12);
    else if (x.temp >= 65) add('Warm', -6);
    else if (x.temp <= 15) add('Bitter cold', -3);

    // --- Wind ---
    if (x.wind <= 4) add('Calm wind', 3);
    else if (x.wind <= 12) add('Light breeze', 5);
    else if (x.wind <= 18) add('Breezy', -5);
    else add('Strong wind', -14);

    // --- Precipitation ---
    const rainPrev = (i >= 3) ? h[i - 1].precip + h[i - 2].precip + h[i - 3].precip : 0;
    if (x.precip >= 0.1) add('Heavy rain', -12);
    else if (x.precip >= 0.02) add('Steady rain', -5);
    else if (x.precip > 0) add('Light drizzle', 2);
    else if (rainPrev >= 0.1) add('Right after a soaking rain', 8);

    // --- Moon position (minor) ---
    const ha = Math.abs(Astro.moonHourAngle(mid, ctx.lon));
    if (ha <= 15) add('Moon overhead (minor bump)', 5);
    else if (ha >= 165) add('Moon underfoot (minor bump)', 5);

    let raw = BASE + f.reduce((s, a) => s + a.pts, 0);
    raw *= rut.mult;
    if (!legal) raw *= 0.8;
    const score = Math.max(0, Math.min(100, Math.round(raw)));
    f.sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
    return { score, factors: f, legal, rut };
  }

  function rating(s) {
    if (s >= 80) return { label: 'Excellent', cls: 'r-ex' };
    if (s >= 65) return { label: 'Good', cls: 'r-good' };
    if (s >= 45) return { label: 'Fair', cls: 'r-fair' };
    return { label: 'Slow', cls: 'r-slow' };
  }

  window.DeerModel = { scoreHour, rutPhase, rating };
})();
