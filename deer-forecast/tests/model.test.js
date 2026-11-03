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
