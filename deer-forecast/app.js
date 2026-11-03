(function () {
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  const state = { loc: store.get('loc', null), rutPeak: store.get('rutPeak', '11-12'), hours: [], offset: 0, nowIdx: 0 };

  // ---------- formatting (all in the location's local time) ----------
  const localDate = (t) => new Date((t + state.offset) * 1000);
  const fmtTime = (t) => localDate(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  const fmtHour = (t) => localDate(t).toLocaleTimeString([], { hour: 'numeric', timeZone: 'UTC' });
  const fmtDay = (t) => localDate(t).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const fmtWeekday = (t) => localDate(t).toLocaleDateString([], { weekday: 'long', timeZone: 'UTC' });
  const dayKey = (t) => localDate(t).toISOString().slice(0, 10);

  function setStatus(msg, isErr) {
    const el = $('#status');
    el.innerHTML = msg;
    el.classList.toggle('err', !!isErr);
    el.hidden = !msg;
  }

  // ---------- location ----------
  function locate() {
    if (!navigator.geolocation) { setStatus('This browser has no location support. Search a town instead.', true); return; }
    setStatus('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const name = await reverseName(lat, lon);
        setLocation({ lat, lon, name });
      },
      (err) => {
        const why = err.code === 1 ? 'Location permission was denied.' : 'Couldn’t get your location.';
        setStatus(`${why} Search a town or ZIP above instead. (Location only works over https:// or http://localhost.)`, true);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 }
    );
  }

  async function reverseName(lat, lon) {
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
      if (r.ok) {
        const j = await r.json();
        const parts = [j.city || j.locality, j.principalSubdivisionCode?.split('-')[1] || j.principalSubdivision].filter(Boolean);
        if (parts.length) return parts.join(', ');
      }
    } catch { /* fall through */ }
    return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  }

  async function search(q) {
    const list = $('#searchResults');
    list.innerHTML = '';
    list.hidden = true;
    const isZip = /^\d{5}$/.test(q.trim());
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.split(',')[0].trim())}&count=8&language=en&format=json${isZip ? '&countryCode=US' : ''}`;
    try {
      const r = await fetch(url);
      const j = await r.json();
      let res = j.results || [];
      const hint = q.split(',')[1]?.trim().toLowerCase();
      if (hint) {
        const m = res.filter((p) => [p.admin1, p.admin1_code, p.country_code].some((v) => v && v.toLowerCase().startsWith(hint)));
        if (m.length) res = m;
      }
      if (!res.length) { setStatus(`No places found for “${q}”.`, true); return; }
      for (const p of res) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        const name = [p.name, p.admin1, p.country_code !== 'US' ? p.country : ''].filter(Boolean).join(', ');
        b.textContent = name;
        b.onclick = () => { list.hidden = true; setLocation({ lat: p.latitude, lon: p.longitude, name }); };
        li.appendChild(b);
        list.appendChild(li);
      }
      list.hidden = false;
    } catch { setStatus('Search failed. Check your connection.', true); }
  }

  function setLocation(loc) {
    state.loc = loc;
    store.set('loc', loc);
    load();
  }

  // ---------- data ----------
  async function load() {
    const { lat, lon, name } = state.loc;
    $('#placeName').textContent = name;
    setStatus('Loading forecast…');
    const params = new URLSearchParams({
      latitude: lat, longitude: lon,
      hourly: 'temperature_2m,pressure_msl,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,precipitation_probability,cloud_cover',
      daily: 'sunrise,sunset',
      temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch',
      timezone: 'auto', timeformat: 'unixtime', past_days: 1, forecast_days: 4,
    });
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      process(data);
      render();
      setStatus('');
      $('#content').hidden = false;
      $('#refreshBtn').hidden = false;
    } catch (e) {
      setStatus(`Couldn’t load weather (${e.message}). Check your connection and tap Refresh.`, true);
      $('#refreshBtn').hidden = false;
    }
  }

  function process(d) {
    state.offset = d.utc_offset_seconds || 0;
    const H = d.hourly, D = d.daily;
    const hours = H.time.map((t, i) => {
      let j = D.time.findIndex((dt, k) => t >= dt && (k === D.time.length - 1 || t < D.time[k + 1]));
      if (j < 0) j = 0;
      return {
        t,
        temp: H.temperature_2m[i],
        p: H.pressure_msl[i] * 0.0295300, // hPa -> inHg
        wind: H.wind_speed_10m[i],
        gust: H.wind_gusts_10m[i],
        dir: H.wind_direction_10m[i],
        precip: H.precipitation[i] || 0,
        pop: H.precipitation_probability[i],
        cloud: H.cloud_cover[i],
        sunrise: D.sunrise[j],
        sunset: D.sunset[j],
      };
    }).filter((h) => h.p != null && !Number.isNaN(h.p) && h.temp != null);
    const ctx = { lon: state.loc.lon, offset: state.offset, rutPeak: state.rutPeak };
    hours.forEach((h, i) => Object.assign(h, DeerModel.scoreHour(hours, i, ctx)));
    state.hours = hours;
    const now = Date.now() / 1000;
    state.nowIdx = Math.max(0, hours.findIndex((h) => now >= h.t && now < h.t + 3600));
    state.updated = new Date();
  }

  // ---------- render ----------
  const compass = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

  function render() {
    const H = state.hours, i = state.nowIdx, now = H[i];
    const rt = DeerModel.rating(now.score);

    $('#nowScore').textContent = now.score;
    const pill = $('#nowRating');
    pill.textContent = rt.label + (now.legal ? '' : ' · after dark');
    pill.className = `pill ${rt.cls}`;
    $('#nowFactors').innerHTML = now.factors.slice(0, 6)
      .map((f) => `<li><span class="pts ${f.pts > 0 ? 'up' : 'down'}">${sign(f.pts)}</span>${f.label}</li>`).join('')
      + (now.rut.mult !== 1 ? `<li><span class="pts up">×${now.rut.mult}</span>${now.rut.name} multiplier</li>` : '');

    // tiles
    const d3 = i >= 3 ? now.p - H[i - 3].p : 0;
    const arrow = d3 >= 0.02 ? '▲ Rising' : d3 <= -0.02 ? '▼ Falling' : '► Steady';
    $('#cPressure').textContent = `${now.p.toFixed(2)}″`;
    $('#cTrend').textContent = `${arrow} (${d3 >= 0 ? '+' : ''}${d3.toFixed(2)} in 3 h)`;
    $('#cTemp').textContent = `${Math.round(now.temp)}°F`;
    $('#cTempSub').textContent = i >= 24 ? `${sign(Math.round(now.temp - H[i - 24].temp))}° vs. this time yesterday` : '';
    $('#cWind').textContent = `${Math.round(now.wind)} mph ${compass(now.dir)}`;
    $('#cWindSub').textContent = `Gusts ${Math.round(now.gust)} mph · from the ${compass(now.dir)}`;
    const mp = Astro.moonPhase(now.t);
    $('#cMoon').textContent = mp.name;
    const ev = Astro.moonEvents(Date.now() / 1000, state.loc.lon, 26).slice(0, 2)
      .map((e) => `${e.type === 'overhead' ? 'Overhead' : 'Underfoot'} ${fmtTime(e.t)}`).join(' · ');
    $('#cMoonSub').textContent = `${Math.round(mp.illum * 100)}% lit · ${ev}`;
    $('#cRut').textContent = now.rut.name;
    const rd = Math.round(now.rut.d);
    $('#cRutSub').textContent = `${now.rut.note} · ${rd === 0 ? 'peak today' : rd < 0 ? `${-rd} days to peak` : `${rd} days past peak`}`;
    $('#cSun').textContent = `${fmtTime(now.sunrise)} – ${fmtTime(now.sunset)}`;
    $('#cSunSub').textContent = `Legal light ~${fmtTime(now.sunrise - 1800)} – ${fmtTime(now.sunset + 1800)} (check your state)`;

    renderBest();
    renderDaily();
    renderHourly();
    renderPressure();
    $('#updated').textContent = `Updated ${state.updated.toLocaleString()}`;
  }

  function future() { return state.hours.slice(state.nowIdx, state.nowIdx + 72); }

  function renderBest() {
    const F = future();
    const wins = [];
    let cur = null;
    for (const h of F) {
      if (h.legal && h.score >= 65) {
        if (!cur) cur = { start: h.t, end: h.t + 3600, hrs: [h] };
        else { cur.end = h.t + 3600; cur.hrs.push(h); }
      } else if (cur) { wins.push(cur); cur = null; }
    }
    if (cur) wins.push(cur);
    let list = wins.map((w) => ({ ...w, avg: w.hrs.reduce((s, h) => s + h.score, 0) / w.hrs.length, peak: w.hrs.reduce((a, b) => (b.score > a.score ? b : a)) }));
    if (!list.length) {
      list = F.filter((h) => h.legal).sort((a, b) => b.score - a.score).slice(0, 3)
        .map((h) => ({ start: h.t, end: h.t + 3600, hrs: [h], avg: h.score, peak: h }));
    }
    list = list.sort((a, b) => b.avg - a.avg).slice(0, 5).sort((a, b) => a.start - b.start);
    const top = Math.max(...list.map((w) => w.avg));
    $('#bestList').innerHTML = list.map((w) => {
      const rt = DeerModel.rating(Math.round(w.avg));
      const why = w.peak.factors.filter((f) => f.pts > 0).slice(0, 3).map((f) => f.label).join(' · ');
      return `<li class="${w.avg === top ? 'top' : ''}">
        <div class="best-when"><strong>${fmtDay(w.start)}</strong><span>${fmtTime(w.start)} – ${fmtTime(w.end)}</span></div>
        <div class="best-score"><span class="pill ${rt.cls}">${rt.label} · ${Math.round(w.avg)}</span>${w.avg === top ? '<span class="star">Best bet</span>' : ''}</div>
        <div class="best-why">${why}</div>
      </li>`;
    }).join('');
  }

  function renderDaily() {
    const days = {};
    for (const h of state.hours.slice(state.nowIdx - (state.nowIdx % 24 === 0 ? 0 : 0))) {
      const k = dayKey(h.t);
      (days[k] ||= []).push(h);
    }
    const today = dayKey(Date.now() / 1000);
    const out = [];
    for (const [k, hs] of Object.entries(days)) {
      if (k < today) continue;
      const sr = hs[0].sunrise, ss = hs[0].sunset;
      const am = hs.filter((h) => h.t + 1800 >= sr - 1800 && h.t + 1800 <= sr + 3 * 3600);
      const pm = hs.filter((h) => h.t + 1800 >= ss - 3 * 3600 && h.t + 1800 <= ss + 1800);
      const avg = (a) => (a.length ? Math.round(a.reduce((s, h) => s + h.score, 0) / a.length) : null);
      const a = avg(am), p = avg(pm);
      if (a == null && p == null) continue;
      const lo = Math.min(...hs.map((h) => h.temp)), hi = Math.max(...hs.map((h) => h.temp));
      const cell = (label, v) => {
        if (v == null) return `<div class="sit"><span class="eyebrow">${label}</span><span class="muted">—</span></div>`;
        const rt = DeerModel.rating(v);
        return `<div class="sit"><span class="eyebrow">${label}</span><span class="sit-val">${v}</span><span class="pill ${rt.cls}">${rt.label}</span></div>`;
      };
      out.push(`<div class="day">
        <div class="day-head"><strong>${k === today ? 'Today' : fmtWeekday(hs[0].t)}</strong><span class="muted">${Math.round(lo)}° / ${Math.round(hi)}°</span></div>
        <div class="sits">${cell('Morning', a)}${cell('Evening', p)}</div>
      </div>`);
    }
    $('#daily').innerHTML = out.slice(0, 4).join('');
  }

  // ---------- charts ----------
  const tip = $('#tooltip');
  function showTip(html, evt) {
    tip.innerHTML = html;
    tip.hidden = false;
    const pad = 12, r = tip.getBoundingClientRect();
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  }
  const hideTip = () => { tip.hidden = true; };
  document.addEventListener('scroll', hideTip, { passive: true });

  function nightBands(hs, x, top, h) {
    let s = '';
    hs.forEach((d, k) => {
      if (!d.legal) s += `<rect class="night" x="${x(k)}" y="${top}" width="${x(k + 1) - x(k) + 0.5}" height="${h}"/>`;
    });
    return s;
  }

  function dayTicks(hs, x, y) {
    let s = '';
    hs.forEach((d, k) => {
      const hr = localDate(d.t).getUTCHours();
      if (hr === 0) s += `<line class="daysep" x1="${x(k)}" x2="${x(k)}" y1="0" y2="${y}"/><text class="lbl day" x="${x(k) + 4}" y="12">${fmtDay(d.t)}</text>`;
      if (hr % 6 === 0) s += `<text class="lbl" x="${x(k)}" y="${y + 16}" text-anchor="middle">${fmtHour(d.t).replace(':00', '').replace(' ', '').toLowerCase()}</text>`;
    });
    return s;
  }

  function hourTip(d) {
    const rt = DeerModel.rating(d.score);
    return `<div class="tt-head">${fmtDay(d.t)} · ${fmtHour(d.t)}</div>
      <div class="tt-score"><strong>${d.score}</strong> <span class="pill ${rt.cls}">${rt.label}</span>${d.legal ? '' : ' <span class="muted">after dark</span>'}</div>
      <div class="tt-row">${d.p.toFixed(2)}″ · ${Math.round(d.temp)}°F · ${Math.round(d.wind)} mph ${compass(d.dir)}${d.pop != null ? ` · ${d.pop}% rain` : ''}</div>
      <ul>${d.factors.slice(0, 5).map((f) => `<li><span class="pts ${f.pts > 0 ? 'up' : 'down'}">${sign(f.pts)}</span>${f.label}</li>`).join('')}</ul>`;
  }

  function renderHourly() {
    const hs = future();
    const W = 960, Hh = 220, top = 18, bottom = 24, left = 30, right = 6;
    const ih = Hh - top - bottom;
    const bw = (W - left - right) / hs.length;
    const x = (k) => left + k * bw;
    const y = (v) => top + ih - (v / 100) * ih;
    let s = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Hourly deer movement score for the next 72 hours">`;
    s += nightBands(hs, x, top, ih);
    for (const g of [25, 50, 75, 100]) s += `<line class="grid" x1="${left}" x2="${W - right}" y1="${y(g)}" y2="${y(g)}"/><text class="lbl" x="${left - 6}" y="${y(g) + 4}" text-anchor="end">${g}</text>`;
    hs.forEach((d, k) => {
      const bx = x(k) + 1, w = Math.max(1, bw - 2), by = y(d.score), bh = top + ih - by;
      const r = Math.min(4, w / 2, bh);
      const cls = d.score >= 65 ? 'bar prime' : 'bar';
      // rounded top only, anchored to baseline
      s += `<path class="${cls}" d="M${bx},${top + ih} V${by + r} Q${bx},${by} ${bx + r},${by} H${bx + w - r} Q${bx + w},${by} ${bx + w},${by + r} V${top + ih} Z"/>`;
    });
    s += `<line class="axis" x1="${left}" x2="${W - right}" y1="${top + ih}" y2="${top + ih}"/>`;
    s += dayTicks(hs, x, top + ih);
    hs.forEach((d, k) => { s += `<rect class="hit" data-k="${k}" x="${x(k)}" y="0" width="${bw}" height="${Hh}"/>`; });
    s += '</svg>';
    const el = $('#hourlyChart');
    el.innerHTML = s;
    el.querySelectorAll('.hit').forEach((r) => {
      const d = hs[+r.dataset.k];
      const on = (e) => { el.querySelectorAll('.hit.on').forEach((n) => n.classList.remove('on')); r.classList.add('on'); showTip(hourTip(d), e); };
      r.addEventListener('pointerenter', on);
      r.addEventListener('pointermove', (e) => showTip(hourTip(d), e));
      r.addEventListener('pointerdown', on);
      r.addEventListener('pointerleave', () => { r.classList.remove('on'); hideTip(); });
    });

    // table view
    $('#hourlyTable').innerHTML = `<table><thead><tr><th>Time</th><th>Score</th><th>Pressure</th><th>Temp</th><th>Wind</th><th>Rain</th><th>Top factor</th></tr></thead><tbody>${
      hs.map((d) => `<tr class="${d.legal ? '' : 'dim'}"><td>${fmtDay(d.t)} ${fmtHour(d.t)}</td><td>${d.score}</td><td>${d.p.toFixed(2)}</td><td>${Math.round(d.temp)}°</td><td>${Math.round(d.wind)} ${compass(d.dir)}</td><td>${d.pop ?? '–'}%</td><td>${d.factors[0]?.label || ''}</td></tr>`).join('')
    }</tbody></table>`;
  }

  function renderPressure() {
    const i0 = Math.max(0, state.nowIdx - 24);
    const hs = state.hours.slice(i0, state.nowIdx + 72);
    const nowK = state.nowIdx - i0;
    const W = 960, Hh = 200, top = 18, bottom = 24, left = 44, right = 8;
    const ih = Hh - top - bottom;
    const ps = hs.map((d) => d.p);
    let lo = Math.min(...ps), hi = Math.max(...ps);
    const mid = (lo + hi) / 2, span = Math.max(0.3, (hi - lo) * 1.2);
    lo = mid - span / 2; hi = mid + span / 2;
    const step = (W - left - right) / (hs.length - 1);
    const x = (k) => left + k * step;
    const y = (v) => top + ih - ((v - lo) / (hi - lo)) * ih;
    let s = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Barometric pressure in inches of mercury">`;
    s += nightBands(hs, (k) => x(k) - step / 2, top, ih);
    const tickStep = span > 0.8 ? 0.2 : span > 0.4 ? 0.1 : 0.05;
    for (let g = Math.ceil(lo / tickStep) * tickStep; g <= hi; g += tickStep) {
      s += `<line class="grid" x1="${left}" x2="${W - right}" y1="${y(g)}" y2="${y(g)}"/><text class="lbl" x="${left - 6}" y="${y(g) + 4}" text-anchor="end">${g.toFixed(2)}</text>`;
    }
    if (30.0 > lo && 30.4 < hi + 1) {
      const y1 = y(Math.min(30.4, hi)), y2 = y(Math.max(30.0, lo));
      if (y2 > y1) s += `<rect class="sweet" x="${left}" y="${y1}" width="${W - left - right}" height="${y2 - y1}"/><text class="lbl" x="${W - right - 4}" y="${y2 - 5}" text-anchor="end">30.00–30.40 sweet spot</text>`;
    }
    const pts = hs.map((d, k) => `${x(k).toFixed(1)},${y(d.p).toFixed(1)}`);
    s += `<polyline class="line past" points="${pts.slice(0, nowK + 1).join(' ')}"/>`;
    s += `<polyline class="line" points="${pts.slice(nowK).join(' ')}"/>`;
    s += `<line class="now" x1="${x(nowK)}" x2="${x(nowK)}" y1="${top}" y2="${top + ih}"/><text class="lbl now-l" x="${x(nowK) + 4}" y="${top + 10}">now</text>`;
    s += `<circle class="dot" cx="${x(nowK)}" cy="${y(hs[nowK].p)}" r="4"/>`;
    s += `<line class="axis" x1="${left}" x2="${W - right}" y1="${top + ih}" y2="${top + ih}"/>`;
    s += dayTicks(hs, x, top + ih);
    s += `<line class="cross" x1="0" x2="0" y1="${top}" y2="${top + ih}" visibility="hidden"/><circle class="cross-dot" r="4" visibility="hidden"/>`;
    s += `<rect class="hit-area" x="${left}" y="0" width="${W - left - right}" height="${Hh}"/></svg>`;
    const el = $('#pressureChart');
    el.innerHTML = s;
    const svg = el.querySelector('svg'), cross = el.querySelector('.cross'), cd = el.querySelector('.cross-dot');
    const move = (e) => {
      const r = svg.getBoundingClientRect();
      const vx = ((e.clientX - r.left) / r.width) * W;
      const k = Math.max(0, Math.min(hs.length - 1, Math.round((vx - left) / step)));
      const d = hs[k];
      cross.setAttribute('x1', x(k)); cross.setAttribute('x2', x(k)); cross.setAttribute('visibility', 'visible');
      cd.setAttribute('cx', x(k)); cd.setAttribute('cy', y(d.p)); cd.setAttribute('visibility', 'visible');
      const d3 = (state.hours[i0 + k - 3]) ? d.p - state.hours[i0 + k - 3].p : 0;
      showTip(`<div class="tt-head">${fmtDay(d.t)} · ${fmtHour(d.t)}${k < nowK ? ' (observed)' : ''}</div>
        <div class="tt-score"><strong>${d.p.toFixed(2)}″</strong> <span class="muted">${d3 >= 0 ? '+' : ''}${d3.toFixed(2)} over 3 h</span></div>
        <div class="tt-row">${Math.round(d.temp)}°F · ${Math.round(d.wind)} mph · score ${d.score}</div>`, e);
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); cd.setAttribute('visibility', 'hidden'); hideTip(); });
  }

  // ---------- wire up ----------
  $('#locateBtn').addEventListener('click', locate);
  $('#refreshBtn').addEventListener('click', () => state.loc && load());
  $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#searchInput').value.trim(); if (q) search(q); });
  $('#tableToggle').addEventListener('click', (e) => {
    const t = $('#hourlyTable'); t.hidden = !t.hidden;
    e.target.textContent = t.hidden ? 'Show table' : 'Hide table';
    e.target.setAttribute('aria-expanded', String(!t.hidden));
  });
  const rutIn = $('#rutInput');
  rutIn.value = `${new Date().getFullYear()}-${state.rutPeak}`;
  rutIn.addEventListener('change', () => {
    if (!rutIn.value) return;
    state.rutPeak = rutIn.value.slice(5);
    store.set('rutPeak', state.rutPeak);
    if (state.loc) load();
  });

  if (state.loc) load();
})();
