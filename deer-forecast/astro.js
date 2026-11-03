// Low-precision moon calculations (good to a few minutes, plenty for hunting).
(function () {
  const RAD = Math.PI / 180;
  const norm360 = (x) => ((x % 360) + 360) % 360;
  const norm180 = (x) => { const v = norm360(x); return v > 180 ? v - 360 : v; };

  function julian(unixSec) { return unixSec / 86400 + 2440587.5; }

  // Moon right ascension (deg) for a unix time.
  function moonRA(unixSec) {
    const d = julian(unixSec) - 2451545.0;
    const L = 218.316 + 13.176396 * d;
    const M = 134.963 + 13.064993 * d;
    const F = 93.272 + 13.229350 * d;
    const lon = (L + 6.289 * Math.sin(M * RAD)) * RAD;
    const lat = (5.128 * Math.sin(F * RAD)) * RAD;
    const e = 23.439 * RAD;
    const ra = Math.atan2(Math.sin(lon) * Math.cos(e) - Math.tan(lat) * Math.sin(e), Math.cos(lon));
    return norm360(ra / RAD);
  }

  // Moon hour angle in degrees (-180..180). 0 = overhead (transit), ±180 = underfoot.
  function moonHourAngle(unixSec, lonDeg) {
    const d = julian(unixSec) - 2451545.0;
    const gmst = 280.46061837 + 360.98564736629 * d;
    return norm180(gmst + lonDeg - moonRA(unixSec));
  }

  // Moon phase: age fraction 0..1 (0 = new, 0.5 = full) and illumination 0..1.
  function moonPhase(unixSec) {
    const synodic = 29.530588853;
    const age = (((julian(unixSec) - 2451550.1) / synodic) % 1 + 1) % 1;
    const illum = (1 - Math.cos(2 * Math.PI * age)) / 2;
    let name;
    if (age < 0.03 || age > 0.97) name = 'New moon';
    else if (age < 0.22) name = 'Waxing crescent';
    else if (age < 0.28) name = 'First quarter';
    else if (age < 0.47) name = 'Waxing gibbous';
    else if (age < 0.53) name = 'Full moon';
    else if (age < 0.72) name = 'Waning gibbous';
    else if (age < 0.78) name = 'Last quarter';
    else name = 'Waning crescent';
    return { age, illum, name, days: age * synodic };
  }

  // Find the next overhead / underfoot times after `fromSec` within `spanH` hours.
  function moonEvents(fromSec, lonDeg, spanH) {
    const out = [];
    const step = 600; // 10 min
    let prev = moonHourAngle(fromSec, lonDeg);
    for (let t = fromSec + step; t <= fromSec + spanH * 3600; t += step) {
      const ha = moonHourAngle(t, lonDeg);
      if (prev < 0 && ha >= 0) out.push({ t, type: 'overhead' });
      if (prev > 90 && ha < -90) out.push({ t, type: 'underfoot' });
      prev = ha;
    }
    return out;
  }

  window.Astro = { moonHourAngle, moonPhase, moonEvents };
})();
