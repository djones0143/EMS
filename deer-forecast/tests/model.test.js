// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const Astro = require('../astro.js');
const DF = require('../forecast.js');
const { makeWeather } = require('./fixture.js');

const NOW = Date.UTC(2026, 10, 3, 15, 20); // Nov 3 2026, 10:20 EST

test('moon phase matches a known full moon', () => {
    // Full moon: 2026-10-26 ~04:12 UTC
    const ill = Astro.moonIllumination(Date.UTC(2026, 9, 26, 4, 12));
    assert.ok(ill.fraction > 0.98, `fraction ${ill.fraction}`);
    assert.strictEqual(Astro.moonPhaseName(ill.phase).name, 'Full Moon');
});

test('solunar events include rise/set and overhead/underfoot each day', () => {
    const ev = Astro.solunarEvents(NOW, NOW + 3 * 864e5, 38.25, -85.76);
    for (const type of ['rise', 'set', 'overhead', 'underfoot']) {
        const count = ev.filter((e) => e.type === type).length;
        assert.ok(count >= 2 && count <= 5, `${type}: ${count}`);
    }
});

test('rut phase from configurable peak date', () => {
    const parts = { year: 2026, month: 11, day: 3 };
    assert.strictEqual(DF.daysFromRutPeak(parts, '11-12'), -9);
    assert.strictEqual(DF.rutPhase(-9).key, 'seeking');
    assert.strictEqual(DF.rutPhase(0).key, 'peak');
    assert.strictEqual(DF.daysFromRutPeak({ year: 2027, month: 1, day: 2 }, '12-28'), 5);
    assert.strictEqual(DF.rutPhase(-120).key, 'none');
});

test('forecast shape and score bounds', () => {
    const f = DF.buildForecast(makeWeather(NOW), { rutPeak: '11-12', now: NOW });
    assert.strictEqual(f.hours.length, 72);
    assert.ok(f.hours[0].time <= NOW && f.hours[0].time + 3600e3 > NOW, 'first hour contains now');
    for (const h of f.hours) {
        assert.ok(h.score >= 0 && h.score <= 100);
        assert.ok(h.factors.length >= 3);
    }
    assert.ok(f.daily.length >= 3);
    assert.ok(Math.abs(f.current.pressure - 30.06) < 0.05, `pressure ${f.current.pressure}`);
});

test('dawn and dusk beat midday on a normal day', () => {
    const f = DF.buildForecast(makeWeather(NOW), { rutPeak: '06-01', now: NOW }); // no rut influence
    const day = f.daily[0];
    assert.ok(day.pm > day.midday + 15, `pm ${day.pm} vs midday ${day.midday}`);
});

test('post-front rising pressure and cold boosts movement', () => {
    const f = DF.buildForecast(makeWeather(NOW), { rutPeak: '06-01', now: NOW });
    const [d0, , d2] = f.daily; // d2 is the morning after the front
    assert.ok(d2.am > d0.pm - 5, `post-front am ${d2.am} vs pre-front pm ${d0.pm}`);
    const front = f.hours.find((h) => h.factors.some((x) => /front has passed/.test(x.label)));
    assert.ok(front, 'front passage factor present');
    const storm = f.hours.find((h) => h.precip >= 0.1);
    assert.ok(storm.factors.some((x) => /rain/i.test(x.label) && x.effect === 'down'));
});

test('peak rut lifts midday', () => {
    const w = makeWeather(NOW);
    const none = DF.buildForecast(w, { rutPeak: '06-01', now: NOW });
    const peak = DF.buildForecast(w, { rutPeak: '11-04', now: NOW });
    assert.ok(peak.daily[1].midday > none.daily[1].midday + 15);
});

test('best windows fall within legal shooting light', () => {
    const f = DF.buildForecast(makeWeather(NOW), { rutPeak: '11-12', now: NOW });
    for (const d of f.daily) {
        for (const w of d.windows) {
            assert.ok(w.start >= d.sunrise - 1.5 * 3600e3 && w.end <= d.sunset + 1.5 * 3600e3);
        }
    }
});

test('wind direction matching against preferred stand winds', () => {
    assert.strictEqual(DF.windMatch(320, 8, ['NW']), 'good');     // 5° off
    assert.strictEqual(DF.windMatch(350, 8, ['NW']), 'ok');       // 35° off
    assert.strictEqual(DF.windMatch(200, 8, ['NW']), 'bad');
    assert.strictEqual(DF.windMatch(10, 8, ['NW', 'N']), 'good'); // any preferred direction counts
    assert.strictEqual(DF.windMatch(355, 8, ['N']), 'good');      // wraps around north
    assert.strictEqual(DF.windMatch(200, 2, ['NW']), 'calm');
    assert.strictEqual(DF.windMatch(200, 8, []), null);
    assert.strictEqual(DF.compass(320), 'NW');
});

test('preferred wind direction raises right-wind hours and lowers wrong-wind hours', () => {
    const w = makeWeather(NOW); // SSW wind before the front, NW after
    const base = DF.buildForecast(w, { rutPeak: '11-12', now: NOW });
    const nw = DF.buildForecast(w, { rutPeak: '11-12', now: NOW, windDirs: ['NW'] });
    const pre = nw.hours.findIndex((h) => h.windDir === 200);
    const post = nw.hours.findIndex((h) => h.windDir === 320 && h.wind >= 3);
    assert.strictEqual(nw.hours[pre].windMatch, 'bad');
    assert.strictEqual(nw.hours[post].windMatch, 'good');
    assert.ok(nw.hours[pre].score < base.hours[pre].score);
    assert.ok(nw.hours[post].score > base.hours[post].score);
    assert.ok(nw.hours[post].factors.some((f) => /right wind/.test(f.label)));
    assert.strictEqual(base.hours[pre].windMatch, null);
    const win = nw.daily.flatMap((d) => d.windows).find((x) => x.windMatch);
    assert.ok(win && win.windDir != null);
});

// ---- Species ---------------------------------------------------------------

const APRIL = Date.UTC(2026, 3, 25, 13, 20); // Apr 25 2026, 9:20 EDT
const springWx = () => makeWeather(APRIL, { utcOffsetHours: -4 });

test('turkey: roosted at night, peak after sunrise, legal light ends at sunset', () => {
    const f = DF.buildForecast(springWx(), { species: 'turkey', now: APRIL });
    assert.strictEqual(f.species.id, 'turkey');
    const night = f.hours.filter((h) => h.hour === 2);
    assert.ok(night.every((h) => h.score < 15 && /roost/i.test(h.factors[0].label)));
    const day = f.daily[1];
    assert.ok(day.am > day.pm, `am ${day.am} vs pm ${day.pm}`);
    const afterSunset = f.hours.find((h) => h.time >= day.sunset && h.dateKey === day.dateKey);
    assert.strictEqual(afterSunset.legalLight, false);
    for (const w of day.windows) assert.ok(w.end <= day.sunset, "turkey window ends by sunset");
});

test('turkey: nesting phase and spring wind/rain sensitivity', () => {
    const f = DF.buildForecast(springWx(), { species: 'turkey', now: APRIL, seasonPeak: '04-20' });
    assert.strictEqual(f.current.season.key, 'nesting');
    const rainy = f.hours.find((h) => h.precip >= 0.1 && h.legalLight);
    assert.ok(rainy.factors.some((x) => /rain/i.test(x.label) && x.effect === 'down'));
    assert.ok(rainy.factors.some((x) => /wind|breezy/i.test(x.label) && x.effect === 'down'));
    assert.strictEqual(DF.turkeyPhase(-130, { month: 10 }).key, 'fall');
    assert.strictEqual(DF.turkeyPhase(-5, { month: 4 }).key, 'breeding');
});

test('turkey ignores stand wind direction and solunar periods', () => {
    const f = DF.buildForecast(springWx(), { species: 'turkey', now: APRIL, windDirs: ['NW'] });
    assert.ok(f.hours.every((h) => h.windMatch === null));
    assert.ok(f.hours.every((h) => !h.factors.some((x) => /solunar|stand/i.test(x.label))));
    assert.strictEqual(f.species.usesWindDir, false);
});

test('elk: heat suppresses movement more than deer; bugle phase from peak date', () => {
    const w = makeWeather(NOW);
    const hot = JSON.parse(JSON.stringify(w));
    hot.hourly.temperature_2m = hot.hourly.temperature_2m.map((t) => t + 30);
    const deer = DF.buildForecast(hot, { species: 'deer', seasonPeak: '06-01', now: NOW });
    const elk = DF.buildForecast(hot, { species: 'elk', seasonPeak: '06-01', now: NOW });
    const i = deer.hours.findIndex((h) => h.daylight && h.temp >= 75);
    assert.ok(elk.hours[i].factors.some((x) => /timber/.test(x.label)));
    const ratio = (f) => f.hours[i].score;
    assert.ok(ratio(elk) < ratio(deer), `elk ${ratio(elk)} vs deer ${ratio(deer)}`);
    assert.strictEqual(DF.elkPhase(0).key, 'peak');
    assert.strictEqual(DF.elkPhase(-15).key, 'pre');
    const sep = Date.UTC(2026, 8, 25, 15);
    const e2 = DF.buildForecast(makeWeather(sep, { utcOffsetHours: -4 }), { species: 'elk', now: sep });
    assert.strictEqual(e2.current.season.key, 'peak');
});

test('elk punishes a wrong wind harder than deer', () => {
    const w = makeWeather(NOW);
    const opts = { seasonPeak: '06-01', now: NOW, windDirs: ['NW'] };
    const d0 = DF.buildForecast(w, { ...opts, species: 'deer', windDirs: [] });
    const d1 = DF.buildForecast(w, { ...opts, species: 'deer' });
    const e0 = DF.buildForecast(w, { ...opts, species: 'elk', windDirs: [] });
    const e1 = DF.buildForecast(w, { ...opts, species: 'elk' });
    const i = d1.hours.findIndex((h) => h.windMatch === 'bad' && h.daylight);
    assert.ok(e1.hours[i].score / e0.hours[i].score < d1.hours[i].score / d0.hours[i].score);
});
