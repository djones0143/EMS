/* Deer Movement Forecast — UI */
(function () {
    'use strict';

    const { buildForecast } = window.DeerForecast;
    const HOUR = 3600 * 1000;
    const STORE = {
        location: 'deerfc.location',
        settings: 'deerfc.settings',
        cache: 'deerfc.cache'
    };

    const $ = (id) => document.getElementById(id);
    const el = (tag, cls, text) => {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    };

    const store = {
        get(key, fallback) {
            try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
        },
        set(key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
        }
    };

    const state = {
        location: store.get(STORE.location, null),
        settings: { rutPeak: '11-12', windDirs: [], ...store.get(STORE.settings, {}) },
        weather: null,
        forecast: null,
        selected: 0
    };

    // ---- Weather codes (WMO) ----------------------------------------------
    const WX = {
        0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
        45: ['🌫️', 'Fog'], 48: ['🌫️', 'Freezing fog'],
        51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Heavy drizzle'],
        56: ['🌧️', 'Freezing drizzle'], 57: ['🌧️', 'Freezing drizzle'],
        61: ['🌦️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
        66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'],
        71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 77: ['🌨️', 'Snow grains'],
        80: ['🌦️', 'Rain showers'], 81: ['🌧️', 'Rain showers'], 82: ['⛈️', 'Violent showers'],
        85: ['🌨️', 'Snow showers'], 86: ['❄️', 'Snow showers'],
        95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm w/ hail'], 99: ['⛈️', 'Thunderstorm w/ hail']
    };
    const wx = (code) => WX[code] || ['', ''];
    const compass = window.DeerForecast.compass;
    const MATCH = {
        good: { mark: '✓', text: 'right wind for your stand' },
        ok: { mark: '~', text: 'close to your stand\'s wind' },
        bad: { mark: '✗', text: 'wrong wind for your stand' },
        calm: { mark: '•', text: 'calm / variable' }
    };

    // ---- Formatting (in the forecast location's time zone) ----------------
    const tzOpt = () => (state.forecast ? { timeZone: state.forecast.timezone } : {});
    const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...tzOpt() });
    const fmtHour = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', ...tzOpt() }).replace(' ', '').toLowerCase();
    const fmtDay = (ms) => new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...tzOpt() });
    const fmtWeekday = (ms) => new Date(ms).toLocaleDateString('en-US', { weekday: 'long', ...tzOpt() });
    const fmtP = (p) => p.toFixed(2);
    const fmtTrend = (d) => (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(2);

    // ---- Status -------------------------------------------------------------
    function showStatus(msg, { error = false, action = null } = {}) {
        const s = $('status');
        s.hidden = false;
        s.className = 'status' + (error ? ' error' : '');
        s.textContent = msg;
        if (action) {
            const b = el('button', 'btn', action.label);
            b.addEventListener('click', action.onClick);
            s.appendChild(el('br'));
            s.appendChild(b);
        }
    }
    const hideStatus = () => { $('status').hidden = true; };

    // ---- Location -----------------------------------------------------------
    function useGps() {
        if (!('geolocation' in navigator)) {
            showStatus('Location is not available in this browser. Search for a place instead.', { error: true });
            openSearch();
            return;
        }
        showStatus('Getting your location…');
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude: lat, longitude: lon } = pos.coords;
            const name = await reverseGeocode(lat, lon);
            setLocation({ lat, lon, name, source: 'gps' });
        }, (err) => {
            const msg = err.code === 1
                ? 'Location permission was denied. Search for your hunting spot by city or ZIP instead.'
                : 'Could not get your location. Search for your hunting spot by city or ZIP instead.';
            showStatus(msg, { error: true });
            openSearch();
        }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 });
    }

    async function reverseGeocode(lat, lon) {
        const fallback = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
        try {
            const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
            const r = await fetch(url);
            if (!r.ok) return fallback;
            const j = await r.json();
            const place = j.city || j.locality;
            const region = j.principalSubdivisionCode ? j.principalSubdivisionCode.split('-').pop() : j.principalSubdivision;
            return place ? [place, region].filter(Boolean).join(', ') : fallback;
        } catch {
            return fallback;
        }
    }

    function setLocation(loc) {
        state.location = loc;
        store.set(STORE.location, loc);
        $('locationName').textContent = loc.name;
        closeSearch();
        loadForecast();
    }

    function openSearch() {
        $('searchPanel').hidden = false;
        $('searchInput').focus();
    }
    function closeSearch() {
        $('searchPanel').hidden = true;
        $('searchResults').replaceChildren();
    }

    async function search(query) {
        const list = $('searchResults');
        list.replaceChildren(el('li', 'muted small', 'Searching…'));
        try {
            const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=en&format=json`;
            const r = await fetch(url);
            const j = await r.json();
            list.replaceChildren();
            if (!j.results || !j.results.length) {
                list.appendChild(el('li', 'muted small', 'No matches. Try a nearby town name.'));
                return;
            }
            for (const res of j.results) {
                const label = [res.name, res.admin1, res.country_code === 'US' ? null : res.country].filter(Boolean).join(', ');
                const li = el('li');
                const b = el('button', null, label);
                b.addEventListener('click', () => setLocation({
                    lat: res.latitude, lon: res.longitude, name: label, source: 'search'
                }));
                li.appendChild(b);
                list.appendChild(li);
            }
        } catch {
            list.replaceChildren(el('li', 'muted small', 'Search failed — check your connection.'));
        }
    }

    // ---- Data ---------------------------------------------------------------
    function weatherUrl(lat, lon) {
        const hourly = [
            'pressure_msl', 'temperature_2m', 'precipitation', 'precipitation_probability', 'cloud_cover',
            'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'weather_code'
        ].join(',');
        const p = new URLSearchParams({
            latitude: lat.toFixed(4), longitude: lon.toFixed(4),
            hourly, daily: 'sunrise,sunset',
            past_days: '2', forecast_days: '5',
            timezone: 'auto', timeformat: 'unixtime',
            temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch'
        });
        return `https://api.open-meteo.com/v1/forecast?${p}`;
    }

    async function loadForecast() {
        if (!state.location) return;
        const btn = $('refreshBtn');
        btn.classList.add('spinning');
        if (!state.forecast) showStatus('Loading forecast…');
        try {
            const r = await fetch(weatherUrl(state.location.lat, state.location.lon));
            if (!r.ok) throw new Error(`Weather service returned ${r.status}`);
            const data = await r.json();
            if (!data.hourly || !data.daily) throw new Error('Unexpected weather data');
            state.weather = data;
            store.set(STORE.cache, { location: state.location, fetchedAt: Date.now(), data });
            compute();
            hideStatus();
        } catch (e) {
            if (state.forecast) {
                showStatus('Offline — showing the last saved forecast.', { error: true });
            } else {
                showStatus(`Could not load the forecast (${e.message}).`, {
                    error: true, action: { label: 'Try again', onClick: loadForecast }
                });
            }
        } finally {
            btn.classList.remove('spinning');
        }
    }

    function compute() {
        if (!state.weather) return;
        state.forecast = buildForecast(state.weather, {
            lat: state.location.lat, lon: state.location.lon,
            rutPeak: state.settings.rutPeak, windDirs: state.settings.windDirs, now: Date.now(), hoursAhead: 72
        });
        state.selected = 0;
        render();
    }

    // ---- Rendering ----------------------------------------------------------
    function render() {
        const f = state.forecast;
        if (!f || !f.hours.length) return;
        $('main').hidden = false;
        renderNow(f);
        renderConditions(f);
        renderBestTimes(f);
        renderChart(f);
        renderTable(f);
        renderDetail();
        renderDaily(f);
        $('updatedAt').textContent = new Date(f.generatedAt).toLocaleString('en-US', {
            weekday: 'short', hour: 'numeric', minute: '2-digit'
        });
    }

    function factorList(target, factors) {
        target.replaceChildren();
        const icon = { up: '▲', down: '▼', neutral: '•' };
        for (const fc of factors) {
            const li = el('li', fc.effect);
            li.appendChild(el('span', 'ico', icon[fc.effect]));
            li.appendChild(el('span', null, fc.label));
            target.appendChild(li);
        }
    }

    function renderNow(f) {
        const h = f.hours[0];
        $('nowScore').textContent = h.score;
        $('nowRating').textContent = h.rating.label;
        const C = 2 * Math.PI * 50;
        const fill = $('gaugeFill');
        fill.style.strokeDasharray = `${C}`;
        fill.style.strokeDashoffset = `${C * (1 - h.score / 100)}`;
        $('nowTime').textContent = `${fmtWeekday(h.time)} ${fmtHour(h.time)} hour` +
            (h.legalLight ? '' : ' · outside shooting light');
        factorList($('nowFactors'), h.factors);
    }

    function renderConditions(f) {
        const c = f.current;
        $('curPressure').textContent = fmtP(c.pressure);
        const t = c.pressureTrend3h;
        const trend = $('curTrend');
        const word = t >= 0.02 ? 'Rising' : t <= -0.02 ? 'Falling' : 'Steady';
        const arrow = t >= 0.02 ? '↗' : t <= -0.02 ? '↘' : '→';
        trend.textContent = `${arrow} ${word} ${fmtTrend(t)} / 3h`;
        trend.className = 'cond-sub ' + (t >= 0.02 ? 'trend-up' : t <= -0.02 ? 'trend-down' : '');
        $('curTemp').textContent = `${Math.round(c.temp)}°F`;
        const [ico, desc] = wx(c.code);
        $('curSky').textContent = `${ico} ${desc}`.trim();
        $('curWind').textContent = `${Math.round(c.wind)} mph`;
        const gust = $('curGust');
        gust.textContent = `From ${compass(c.windDir)}${c.gust ? ` · gusts ${Math.round(c.gust)}` : ''}`;
        if (c.windMatch) {
            gust.appendChild(el('br'));
            gust.appendChild(el('span', `wind-${c.windMatch}`, `${MATCH[c.windMatch].mark} ${MATCH[c.windMatch].text}`));
        }
        $('curMoon').textContent = `${c.moon.icon} ${Math.round(c.moon.fraction * 100)}%`;
        $('curMoonSub').textContent = c.moon.name;
        $('curRut').textContent = c.rut.name;
        const d = c.rut.daysFromPeak;
        $('curRutSub').textContent = (d === 0 ? 'Peak day. ' : d < 0 ? `${-d} days to peak. ` : `${d} days past peak. `) + c.rut.note;
    }

    function renderBestTimes(f) {
        const wrap = $('bestTimes');
        wrap.replaceChildren();
        const days = f.daily.filter((d) => d.windows.length).slice(0, 2);
        if (!days.length) {
            wrap.appendChild(el('p', 'muted', 'No standout windows in shooting light over the next two days.'));
            return;
        }
        days.forEach((d, i) => {
            const block = el('div', 'best-day');
            block.appendChild(el('h3', null, i === 0 && d.dateKey === f.hours[0].dateKey ? `Today · ${fmtDay(d.noon)}` : fmtDay(d.noon)));
            const row = el('div', 'windows');
            for (const w of d.windows) {
                const item = el('div', 'window');
                const sw = el('span', `swatch s-${window.DeerForecast.ratingFor(w.peak).key}`);
                item.appendChild(sw);
                item.appendChild(el('span', null, `${fmtTime(w.start)} – ${fmtTime(w.end)}`));
                item.appendChild(el('strong', null, String(w.peak)));
                if (w.windDir != null) {
                    const m = w.windMatch;
                    const wd = el('span', `win-wind${m ? ` wind-${m}` : ''}`,
                        `${compass(w.windDir)} ${Math.round(w.wind)} mph${m ? ` ${MATCH[m].mark}` : ''}`);
                    if (m) wd.title = MATCH[m].text;
                    item.appendChild(wd);
                }
                row.appendChild(item);
            }
            block.appendChild(row);
            wrap.appendChild(block);
        });
    }

    function renderChart(f) {
        const hours = f.hours;
        const n = hours.length;
        const colW = 14;
        const left = 40;
        const right = 12;
        const W = left + n * colW + right;
        const top = 40;               // day labels + panel title
        const sH = 110;               // score panel
        const gap = 26;
        const pH = 80;                // pressure panel
        const wGap = 22;
        const wH = 24;                // wind direction row
        const axisH = 18;
        const H = top + sH + gap + pH + wGap + wH + axisH;
        const sTop = top;
        const pTop = top + sH + gap;
        const wTop = pTop + pH + wGap;
        const hasPrefs = state.settings.windDirs.length > 0;

        const pMin = Math.min(...hours.map((h) => h.pressure));
        const pMax = Math.max(...hours.map((h) => h.pressure));
        const pad = Math.max(0.05, (pMax - pMin) * 0.15);
        const lo = Math.floor((pMin - pad) * 20) / 20;
        const hi = Math.ceil((pMax + pad) * 20) / 20;
        const py = (p) => pTop + pH - ((p - lo) / (hi - lo)) * pH;
        const sy = (s) => sTop + sH - (s / 100) * sH;
        const x = (i) => left + i * colW;

        const parts = [];
        parts.push(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Movement score and pressure for the next ${n} hours">`);

        // night shading (both panels)
        for (let i = 0; i < n; i++) {
            if (!hours[i].daylight) {
                parts.push(`<rect class="night" x="${x(i)}" y="${sTop}" width="${colW}" height="${sH}"/>`);
                parts.push(`<rect class="night" x="${x(i)}" y="${pTop}" width="${colW}" height="${pH}"/>`);
            }
        }

        // score gridlines + labels
        for (const s of [0, 50, 100]) {
            parts.push(`<line class="grid" x1="${left}" x2="${W - right}" y1="${sy(s)}" y2="${sy(s)}"/>`);
            parts.push(`<text x="${left - 6}" y="${sy(s) + 4}" text-anchor="end">${s}</text>`);
        }
        parts.push(`<text class="panel-title" x="${left}" y="${sTop - 8}">Movement score</text>`);

        // pressure gridlines + labels
        const steps = 3;
        for (let k = 0; k <= steps; k++) {
            const p = lo + (hi - lo) * (k / steps);
            parts.push(`<line class="grid" x1="${left}" x2="${W - right}" y1="${py(p)}" y2="${py(p)}"/>`);
            parts.push(`<text x="${left - 6}" y="${py(p) + 4}" text-anchor="end">${p.toFixed(2)}</text>`);
        }
        parts.push(`<text class="panel-title" x="${left}" y="${pTop - 8}">Pressure (inHg)</text>`);

        // day separators, day + hour labels
        for (let i = 0; i < n; i++) {
            const h = hours[i];
            if (h.hour === 0 || i === 0) {
                if (h.hour === 0) parts.push(`<line class="midnight" x1="${x(i)}" x2="${x(i)}" y1="${sTop - 34}" y2="${wTop + wH}"/>`);
                if (h.hour <= 18) {
                    const label = new Date(h.time).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', timeZone: f.timezone });
                    parts.push(`<text class="day-label" x="${x(i) + 4}" y="${12}">${label}</text>`);
                }
            }
            if (h.hour % 6 === 0) {
                parts.push(`<text x="${x(i) + colW / 2}" y="${H - 4}" text-anchor="middle">${fmtHour(h.time)}</text>`);
            }
        }

        // wind direction arrows (every 2 hours; arrow points where the wind blows TO)
        parts.push(`<text class="panel-title" x="${left}" y="${wTop - 8}">Wind${hasPrefs ? ' — green = your stand\'s wind, red = wrong wind' : ' direction'}</text>`);
        for (let i = 0; i < n; i += 2) {
            const h = hours[i];
            if (h.windDir == null) continue;
            const ax = x(i) + colW;
            const ay = wTop + wH / 2;
            const cls = h.windMatch ? `wind-${h.windMatch}` : 'wind-none';
            const scale = h.wind < 3 ? 0.7 : 1;
            parts.push(`<path class="warrow ${cls}" transform="translate(${ax},${ay}) rotate(${(h.windDir + 180) % 360}) scale(${scale})" d="M0,-9 L6,5 L0,2 L-6,5 Z"/>`);
        }

        // score bars
        for (let i = 0; i < n; i++) {
            const h = hours[i];
            const y = sy(h.score);
            const bh = Math.max(2, sTop + sH - y);
            const bw = colW - 2;
            parts.push(`<path class="bar s-${h.rating.key}" data-i="${i}" d="${roundTopRect(x(i) + 1, sTop + sH - bh, bw, bh, 3)}"/>`);
        }

        // pressure line
        const path = hours.map((h, i) => `${i ? 'L' : 'M'}${(x(i) + colW / 2).toFixed(1)},${py(h.pressure).toFixed(1)}`).join('');
        parts.push(`<path class="pline" d="${path}"/>`);

        // cursor for the selected hour
        const si = state.selected;
        const cx = x(si) + colW / 2;
        parts.push(`<line class="cursor" id="cursorLine" x1="${cx}" x2="${cx}" y1="${sTop}" y2="${wTop + wH}"/>`);
        parts.push(`<circle class="pdot" id="cursorDot" cx="${cx}" cy="${py(hours[si].pressure)}" r="4.5"/>`);

        // hit targets (full column height)
        for (let i = 0; i < n; i++) {
            parts.push(`<rect class="hit" data-i="${i}" x="${x(i)}" y="${sTop - 34}" width="${colW}" height="${H - sTop + 34}"><title>${fmtDay(hours[i].time)} ${fmtHour(hours[i].time)}: score ${hours[i].score}, ${fmtP(hours[i].pressure)} inHg, wind ${compass(hours[i].windDir)} ${Math.round(hours[i].wind)} mph</title></rect>`);
        }
        parts.push('</svg>');
        $('chart').innerHTML = parts.join('');
        state.chartGeom = { x, colW, py };
        highlightBar();
    }

    function roundTopRect(x, y, w, h, r) {
        r = Math.min(r, h, w / 2);
        return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
    }

    function selectHour(i, scrollIntoView) {
        const f = state.forecast;
        if (!f) return;
        state.selected = Math.max(0, Math.min(f.hours.length - 1, i));
        const { x, colW, py } = state.chartGeom;
        const cx = x(state.selected) + colW / 2;
        const line = $('cursorLine'); const dot = $('cursorDot');
        line.setAttribute('x1', cx); line.setAttribute('x2', cx);
        dot.setAttribute('cx', cx); dot.setAttribute('cy', py(f.hours[state.selected].pressure));
        highlightBar();
        renderDetail();
        if (scrollIntoView) {
            const sc = $('chartScroll');
            if (cx < sc.scrollLeft + 40 || cx > sc.scrollLeft + sc.clientWidth - 40) {
                sc.scrollLeft = cx - sc.clientWidth / 2;
            }
        }
    }

    function highlightBar() {
        document.querySelectorAll('#chart .bar').forEach((b) => {
            b.style.opacity = Number(b.dataset.i) === state.selected ? '1' : '0.78';
        });
    }

    function renderDetail() {
        const f = state.forecast;
        const h = f.hours[state.selected];
        const box = $('hourDetail');
        box.replaceChildren();
        const top = el('div', 'hd-top');
        top.appendChild(el('span', 'hd-score', `${h.score}`));
        top.appendChild(el('strong', null, h.rating.label));
        top.appendChild(el('span', 'hd-meta', `${fmtDay(h.time)} · ${fmtHour(h.time)}${h.legalLight ? '' : ' · no shooting light'}`));
        box.appendChild(top);
        const [ico, desc] = wx(h.code);
        box.appendChild(el('div', 'hd-meta',
            `${fmtP(h.pressure)} inHg (${fmtTrend(h.trend3)}/3h) · ${Math.round(h.temp)}°F · ` +
            `${compass(h.windDir)} ${Math.round(h.wind)} mph${h.windMatch ? ` ${MATCH[h.windMatch].mark}` : ''} · ${ico} ${desc}` +
            (h.precipProb ? ` · ${h.precipProb}% rain` : '')));
        const ul = el('ul', 'factors');
        factorList(ul, h.factors);
        box.appendChild(ul);
    }

    function renderTable(f) {
        const t = $('hourTable');
        t.replaceChildren();
        const head = el('tr');
        for (const c of ['Time', 'Score', 'Pressure', '3h Δ', 'Temp', 'Wind', 'From', 'Rain %']) head.appendChild(el('th', null, c));
        const thead = el('thead'); thead.appendChild(head); t.appendChild(thead);
        const tb = el('tbody');
        for (const h of f.hours) {
            const tr = el('tr');
            [
                `${fmtDay(h.time)} ${fmtHour(h.time)}`, `${h.score} ${h.rating.label}`, fmtP(h.pressure),
                fmtTrend(h.trend3), `${Math.round(h.temp)}°`, `${Math.round(h.wind)} mph`,
                `${compass(h.windDir)}${h.windMatch ? ` ${MATCH[h.windMatch].mark}` : ''}`, `${h.precipProb ?? 0}%`
            ].forEach((v) => tr.appendChild(el('td', null, v)));
            tb.appendChild(tr);
        }
        t.appendChild(tb);
    }

    function renderDaily(f) {
        const wrap = $('daily');
        wrap.replaceChildren();
        for (const d of f.daily) {
            if (d.overall == null) continue;
            const card = el('article', 'day-card');
            const hd = el('header');
            hd.appendChild(el('h3', null, fmtDay(d.noon)));
            hd.appendChild(el('span', 'pill', `${d.rating.label} · ${d.overall}`));
            card.appendChild(hd);

            const periods = el('div', 'periods');
            for (const [label, v] of [['Morning', d.am], ['Midday', d.midday], ['Evening', d.pm]]) {
                const p = el('div', 'period');
                p.appendChild(el('div', 'p-label', label));
                p.appendChild(el('div', 'p-val', v == null ? '—' : String(v)));
                if (v != null) {
                    const bar = el('div', `bar-mini s-${window.DeerForecast.ratingFor(v).key}`);
                    bar.style.width = `${Math.max(8, v)}%`;
                    p.appendChild(bar);
                }
                periods.appendChild(p);
            }
            card.appendChild(periods);

            const facts = el('div', 'day-facts');
            const dp = d.pressureEnd - d.pressureStart;
            const pWord = dp >= 0.05 ? 'rising' : dp <= -0.05 ? 'falling' : 'steady';
            facts.appendChild(el('span', null, `🌡️ ${Math.round(d.tempMin)}° – ${Math.round(d.tempMax)}°F`));
            facts.appendChild(el('span', null, `📈 ${fmtP(d.pressureMin)}–${fmtP(d.pressureMax)} inHg, ${pWord}`));
            facts.appendChild(el('span', null, `💨 up to ${Math.round(d.windMax)} mph${d.precipTotal >= 0.01 ? ` · 🌧️ ${d.precipTotal.toFixed(2)}"` : ''}`));
            if (d.sunrise) facts.appendChild(el('span', null, `🌅 ${fmtTime(d.sunrise)} · 🌇 ${fmtTime(d.sunset)}`));
            facts.appendChild(el('span', null, `${d.moon.icon} ${d.moon.name} (${Math.round(d.moon.fraction * 100)}%)`));
            card.appendChild(facts);
            wrap.appendChild(card);
        }
    }

    // ---- Settings -----------------------------------------------------------
    function initSettings() {
        const [m, d] = state.settings.rutPeak.split('-');
        $('rutMonth').value = m;
        $('rutDay').value = Number(d);
        const save = () => {
            const month = $('rutMonth').value;
            const day = Math.max(1, Math.min(31, parseInt($('rutDay').value, 10) || 1));
            state.settings.rutPeak = `${month}-${String(day).padStart(2, '0')}`;
            store.set(STORE.settings, state.settings);
            compute();
        };
        $('rutMonth').addEventListener('change', save);
        $('rutDay').addEventListener('change', save);

        // Preferred stand wind directions (compass rose toggles)
        const rose = $('windRose');
        const syncRose = () => {
            rose.querySelectorAll('[data-dir]').forEach((b) => {
                const on = state.settings.windDirs.includes(b.dataset.dir);
                b.setAttribute('aria-pressed', String(on));
            });
            const dirs = state.settings.windDirs;
            $('windPrefSummary').textContent = dirs.length
                ? `Scoring for ${dirs.join(', ')} wind. Hours with the wrong wind are marked down.`
                : 'No preference — wind direction does not affect the score.';
        };
        rose.addEventListener('click', (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.dir) {
                const dirs = new Set(state.settings.windDirs);
                dirs.has(b.dataset.dir) ? dirs.delete(b.dataset.dir) : dirs.add(b.dataset.dir);
                const order = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
                state.settings.windDirs = order.filter((d) => dirs.has(d));
            } else {
                state.settings.windDirs = [];
            }
            store.set(STORE.settings, state.settings);
            syncRose();
            compute();
        });
        syncRose();
    }

    // ---- Events -------------------------------------------------------------
    function bind() {
        $('gpsBtn').addEventListener('click', useGps);
        $('searchBtn').addEventListener('click', () => ($('searchPanel').hidden ? openSearch() : closeSearch()));
        $('refreshBtn').addEventListener('click', loadForecast);
        $('searchForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const q = $('searchInput').value.trim();
            if (q.length >= 2) search(q);
        });

        const chart = $('chart');
        const pick = (e) => {
            const t = e.target.closest('[data-i]');
            if (t) selectHour(Number(t.dataset.i), false);
        };
        chart.addEventListener('click', pick);
        chart.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') pick(e); });
        $('chartScroll').addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') { selectHour(state.selected + 1, true); e.preventDefault(); }
            if (e.key === 'ArrowLeft') { selectHour(state.selected - 1, true); e.preventDefault(); }
        });

        // Refresh when returning to the app after a while.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible' || !state.forecast) return;
            if (Date.now() - state.forecast.generatedAt > 30 * 60 * 1000) loadForecast();
            else if (state.forecast.hours[0].time + HOUR < Date.now()) compute();
        });
    }

    function init() {
        bind();
        initSettings();

        // Show the last saved forecast immediately (works offline).
        const cached = store.get(STORE.cache, null);
        if (state.location) {
            $('locationName').textContent = state.location.name;
            if (cached && cached.location && cached.location.lat === state.location.lat && cached.location.lon === state.location.lon) {
                state.weather = cached.data;
                try { compute(); } catch { state.forecast = null; }
            }
            loadForecast();
        } else {
            $('locationName').textContent = 'No location yet';
            useGps();
        }

        if ('serviceWorker' in navigator && location.protocol !== 'file:') {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }
    }

    init();
})();
