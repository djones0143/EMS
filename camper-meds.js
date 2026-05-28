// KYC Camp Medication Reconciliation Tracker
// Kentucky Church of God - Camp Health Staff Tool

(function () {
    'use strict';

    // ─── Storage Keys ──────────────────────────────────────────────────────────
    const SK = {
        campers: 'kyc_campers_v1',
        medications: 'kyc_medications_v1',
        logs: 'kyc_logs_v1',
        staff: 'kyc_staffName'
    };

    // ─── App State ─────────────────────────────────────────────────────────────
    const state = {
        view: 'dashboard',
        params: {},
        campers: [],
        medications: [],
        logs: [],
        staffName: '',
        scanner: null,
        pendingPhoto: null  // base64 of photo being uploaded in form
    };

    // ─── Storage ───────────────────────────────────────────────────────────────
    function load() {
        state.campers    = parse(localStorage.getItem(SK.campers))    || [];
        state.medications = parse(localStorage.getItem(SK.medications)) || [];
        state.logs       = parse(localStorage.getItem(SK.logs))       || [];
        state.staffName  = localStorage.getItem(SK.staff) || '';
    }

    function parse(s) { try { return JSON.parse(s); } catch(e) { return null; } }
    function saveCampers() { localStorage.setItem(SK.campers,    JSON.stringify(state.campers));    }
    function saveMeds()    { localStorage.setItem(SK.medications, JSON.stringify(state.medications)); }
    function saveLogs()    { localStorage.setItem(SK.logs,       JSON.stringify(state.logs));       }
    function saveStaff()   { localStorage.setItem(SK.staff,      state.staffName);                 }

    // ─── Utilities ─────────────────────────────────────────────────────────────
    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
    function todayStr() { return new Date().toISOString().split('T')[0]; }
    function nowISO() { return new Date().toISOString(); }

    function formatDate(s) {
        if (!s) return '';
        return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatTime(t) {
        if (!t) return '';
        const [h, m] = t.split(':').map(Number);
        return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
    }

    function formatDT(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
               d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    function toMins(t) {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    }

    function currentTimeStr() {
        const d = new Date();
        return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    }

    function calcAge(dob) {
        if (!dob) return null;
        const now = new Date(), birth = new Date(dob + 'T12:00:00');
        let age = now.getFullYear() - birth.getFullYear();
        if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
        return age;
    }

    function esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ─── Photo Handling ────────────────────────────────────────────────────────
    function handlePhotoSelect(input) {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                const MAX = 320;
                let w = img.width, h = img.height;
                if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
                else if (h > MAX)     { w = Math.round(w * MAX / h); h = MAX; }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                state.pendingPhoto = canvas.toDataURL('image/jpeg', 0.78);
                const prev = document.getElementById('photoPrev');
                if (prev) prev.innerHTML = photoPreviewHTML(state.pendingPhoto);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function clearPhoto() {
        state.pendingPhoto = '__clear__';
        const prev = document.getElementById('photoPrev');
        if (prev) prev.innerHTML = `<p class="no-photo-msg">Photo removed</p>`;
        const inp = document.getElementById('photoFileInput');
        if (inp) inp.value = '';
    }

    function photoPreviewHTML(src) {
        return `<img src="${esc(src)}" class="photo-thumb" alt="Camper photo">
            <button type="button" class="photo-remove-btn" onclick="clearPhoto()">Remove</button>`;
    }

    function camperAvatarHTML(camper, cls, size) {
        if (camper.photo) {
            return `<img src="${esc(camper.photo)}" class="${cls} camper-photo-avatar" alt="${esc(camper.firstName)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;">`;
        }
        return `<div class="${cls}" style="width:${size}px;height:${size}px;">${esc(camper.firstName[0])}${esc(camper.lastName[0])}</div>`;
    }

    // ─── Domain Helpers ────────────────────────────────────────────────────────
    function getCamper(id) { return state.campers.find(c => c.id === id); }

    function getCamperMeds(camperId) {
        return state.medications.filter(m => m.camperId === camperId && m.active !== false);
    }

    function defaultTimes(freq) {
        return { once_daily: ['08:00'], twice_daily: ['08:00','20:00'], three_daily: ['08:00','14:00','20:00'], four_daily: ['08:00','12:00','17:00','21:00'] }[freq] || ['08:00'];
    }

    function freqLabel(freq) {
        return { once_daily:'Once Daily', twice_daily:'Twice Daily', three_daily:'Three Times Daily', four_daily:'Four Times Daily', prn:'As Needed (PRN)' }[freq] || freq;
    }

    function freqCount(freq) {
        return { once_daily:1, twice_daily:2, three_daily:3, four_daily:4, prn:0 }[freq] || 1;
    }

    function logKey(medId, date, time) { return `${medId}|${date}|${time}`; }

    function getLog(medId, date, time) {
        return state.logs.find(l => l.key === logKey(medId, date, time));
    }

    function doseStatus(med, time, date) {
        const log = getLog(med.id, date, time);
        if (log) return log.status;

        const curDate = todayStr();
        if (date < curDate) return 'missed';
        if (date > curDate) return 'upcoming';

        const nowMins = toMins(currentTimeStr());
        const schedMins = toMins(time);
        if (nowMins > schedMins + 30) return 'overdue';
        if (nowMins >= schedMins - 30) return 'due';
        return 'upcoming';
    }

    function statusCfg(status) {
        return {
            overdue:  { cls:'s-overdue',  icon:'🔴', label:'OVERDUE' },
            due:      { cls:'s-due',      icon:'🟠', label:'DUE NOW' },
            upcoming: { cls:'s-upcoming', icon:'🔵', label:'UPCOMING' },
            prn:      { cls:'s-prn',      icon:'💊', label:'PRN' },
            given:    { cls:'s-given',    icon:'✅', label:'GIVEN' },
            refused:  { cls:'s-refused',  icon:'❌', label:'REFUSED' },
            held:     { cls:'s-held',     icon:'⏸',  label:'HELD' },
            missed:   { cls:'s-missed',   icon:'⚪', label:'MISSED' }
        }[status] || { cls:'', icon:'', label: status };
    }

    function statusHuman(status) {
        const c = statusCfg(status);
        return `${c.icon} ${c.label}`;
    }

    function getTodaysDoses(dateOverride) {
        const date = dateOverride || todayStr();
        const doses = [];

        state.medications.forEach(med => {
            if (!med.active) return;
            const camper = getCamper(med.camperId);
            if (!camper) return;
            if (med.startDate && med.startDate > date) return;
            if (med.endDate   && med.endDate   < date) return;

            if (med.frequency === 'prn') {
                // Show PRN logs for the day, plus an untouched "available" slot
                const prnLogs = state.logs.filter(l => l.medId === med.id && l.date === date);
                if (prnLogs.length > 0) {
                    prnLogs.forEach(log => doses.push({ med, camper, time: null, status: log.status, date }));
                } else {
                    doses.push({ med, camper, time: null, status: 'prn', date });
                }
                return;
            }

            (med.scheduledTimes || []).forEach(time => {
                doses.push({ med, camper, time, status: doseStatus(med, time, date), date });
            });
        });

        doses.sort((a, b) => {
            if (!a.time && !b.time) return 0;
            if (!a.time) return 1;
            if (!b.time) return -1;
            return toMins(a.time) - toMins(b.time);
        });

        return doses;
    }

    // ─── Navigation ────────────────────────────────────────────────────────────
    function navigate(view, params) {
        if (state.view === 'scanner' && view !== 'scanner') stopScanner();
        if (state.view === 'add-camper' && view !== 'add-camper') state.pendingPhoto = null;
        state.view = view;
        state.params = params || {};
        renderView();
        syncNav();
        window.scrollTo(0, 0);
    }

    function syncNav() {
        const topViews = ['dashboard','campers','scanner','reports'];
        document.querySelectorAll('#bottomNav .nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === state.view);
        });
        document.getElementById('bottomNav').style.display =
            topViews.includes(state.view) ? 'flex' : 'flex';
    }

    // ─── Render Dispatch ───────────────────────────────────────────────────────
    function renderView() {
        const main = document.getElementById('appMain');
        switch (state.view) {
            case 'dashboard':     main.innerHTML = viewDashboard();   break;
            case 'campers':       main.innerHTML = viewCampers();     break;
            case 'camper-detail': main.innerHTML = viewCamperDetail(); break;
            case 'add-camper':    main.innerHTML = viewCamperForm();  break;
            case 'add-med':       main.innerHTML = viewMedForm();     break;
            case 'scanner':       main.innerHTML = viewScanner(); initScanner(); break;
            case 'reports':       main.innerHTML = viewReports();     break;
            default:              main.innerHTML = viewDashboard();
        }
        bindEvents();
    }

    // ─── VIEW: Dashboard ───────────────────────────────────────────────────────
    function viewDashboard() {
        const doses = getTodaysDoses();
        const dateStr = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });

        const overdue  = doses.filter(d => d.status === 'overdue');
        const due      = doses.filter(d => d.status === 'due');
        const upcoming = doses.filter(d => d.status === 'upcoming');
        const prn      = doses.filter(d => d.status === 'prn');
        const done     = doses.filter(d => ['given','refused','held','missed'].includes(d.status));

        const scheduled = doses.filter(d => d.time);
        const given = doses.filter(d => d.status === 'given');
        const pending = overdue.length + due.length + upcoming.length;

        let html = `
            <div class="page-header">
                <h2>Today's Medications</h2>
                <p class="page-date">${dateStr}</p>
            </div>

            <div class="stats-bar">
                <div class="stat">
                    <span class="stat-num">${scheduled.length}</span>
                    <span class="stat-lbl">Scheduled</span>
                </div>
                <div class="stat stat-ok">
                    <span class="stat-num">${given.length}</span>
                    <span class="stat-lbl">Given</span>
                </div>
                <div class="stat ${pending > 0 ? 'stat-warn' : 'stat-ok'}">
                    <span class="stat-num">${pending}</span>
                    <span class="stat-lbl">Pending</span>
                </div>
            </div>
        `;

        if (doses.length === 0) {
            return html + `<div class="empty-state">
                <div class="empty-icon">💊</div>
                <p>No medications on file.</p>
                <p>Add campers and their prescriptions to get started.</p>
                <button class="btn btn-primary mt" onclick="navigate('campers')">Go to Campers</button>
            </div>`;
        }

        if (overdue.length)  html += doseSection('OVERDUE', overdue, 'section-overdue');
        if (due.length)      html += doseSection('DUE NOW', due, 'section-due');
        if (upcoming.length) html += doseSection('UPCOMING', upcoming, 'section-upcoming');
        if (prn.length)      html += doseSection('AS NEEDED (PRN)', prn, 'section-prn');

        if (done.length) {
            html += `<div class="dose-section">
                <div class="section-title-row section-done" onclick="toggleCollapse(this)">
                    <span>COMPLETED / LOGGED (${done.length})</span>
                    <span class="collapse-icon">▼</span>
                </div>
                <div class="collapsible-body">${done.map(doseCard).join('')}</div>
            </div>`;
        }

        return html;
    }

    function doseSection(title, doses, cls) {
        return `<div class="dose-section">
            <div class="section-title-row ${cls}">${title} (${doses.length})</div>
            ${doses.map(doseCard).join('')}
        </div>`;
    }

    function doseCard(dose) {
        const { med, camper, time, status, date } = dose;
        const log = time ? getLog(med.id, date, time) : (state.logs.find(l => l.medId === med.id && l.date === date && !l.time));
        const sc = statusCfg(status);
        const canMark = ['overdue','due','upcoming','prn'].includes(status);
        const timeArg = time ? esc(time) : 'prn';

        return `<div class="dose-card ${sc.cls}">
            <div class="dose-card-time">
                <div class="dc-time">${time ? formatTime(time) : 'PRN'}</div>
                <div class="dc-badge">${sc.icon}</div>
            </div>
            <div class="dose-card-body">
                <div class="dc-camper" onclick="navigate('camper-detail',{camperId:'${esc(camper.id)}'})">
                    ${esc(camper.firstName)} ${esc(camper.lastName)}
                    ${camper.cabin ? `<span class="dc-cabin">${esc(camper.cabin)}</span>` : ''}
                </div>
                <div class="dc-med">${esc(med.name)} <span class="dc-dose">${esc(med.dosage)}</span></div>
                ${med.route && med.route !== 'Oral' ? `<div class="dc-route">${esc(med.route)}</div>` : ''}
                ${med.specialInstructions ? `<div class="dc-note">${esc(med.specialInstructions)}</div>` : ''}
                ${log ? `<div class="dc-logged">By: ${esc(log.staffName)}${log.notes ? ' · '+esc(log.notes) : ''}</div>` : ''}
                ${!med.prescriptionVerified ? `<div class="dc-unverified">⚠️ Rx not verified</div>` : ''}
            </div>
            <div class="dose-card-action">
                ${canMark
                    ? `<button class="btn-mark" onclick="openMarkModal('${esc(med.id)}','${timeArg}','${esc(date)}')">Mark</button>`
                    : `<button class="btn-mark btn-mark-edit" onclick="openMarkModal('${esc(med.id)}','${timeArg}','${esc(date)}')">Edit</button>`
                }
            </div>
        </div>`;
    }

    // ─── VIEW: Campers ─────────────────────────────────────────────────────────
    function viewCampers() {
        const q = (state.params.search || '').toLowerCase();
        let list = state.campers;
        if (q) list = list.filter(c =>
            `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
            (c.cabin || '').toLowerCase().includes(q)
        );

        const todayDoses = getTodaysDoses();

        let html = `
            <div class="page-header">
                <h2>Campers <span class="count-badge">${state.campers.length}</span></h2>
            </div>
            <div class="search-bar-wrap">
                <input id="camperSearch" class="search-bar" type="search"
                    placeholder="Search by name or cabin..."
                    value="${esc(state.params.search || '')}"
                    oninput="handleCamperSearch(this.value)">
            </div>
        `;

        if (state.campers.length === 0) {
            return html + `<div class="empty-state">
                <div class="empty-icon">👥</div>
                <p>No campers registered yet.</p>
                <button class="btn btn-primary mt" onclick="navigate('add-camper')">Add First Camper</button>
            </div><button class="fab" onclick="navigate('add-camper')">+</button>`;
        }

        if (list.length === 0) {
            html += `<div class="empty-state"><p>No campers match your search.</p></div>`;
        } else {
            // Group by cabin
            const cabins = {};
            list.forEach(c => {
                const cabin = c.cabin || 'Unassigned';
                if (!cabins[cabin]) cabins[cabin] = [];
                cabins[cabin].push(c);
            });

            Object.keys(cabins).sort().forEach(cabin => {
                html += `<div class="cabin-group"><div class="cabin-label">${esc(cabin)}</div>`;
                cabins[cabin].forEach(c => {
                    const meds = getCamperMeds(c.id);
                    const camperDoses = todayDoses.filter(d => d.camper.id === c.id);
                    const overdueDue = camperDoses.filter(d => ['overdue','due'].includes(d.status));
                    const pendingCount = camperDoses.filter(d => ['overdue','due','upcoming'].includes(d.status)).length;
                    const age = calcAge(c.dateOfBirth);

                    html += `<div class="camper-row" onclick="navigate('camper-detail',{camperId:'${esc(c.id)}'})">
                        ${camperAvatarHTML(c, 'cr-avatar'+(overdueDue.length>0?' cr-avatar-warn':''), 44)}
                        <div class="cr-body">
                            <div class="cr-name">${esc(c.firstName)} ${esc(c.lastName)}</div>
                            <div class="cr-meta">
                                ${age !== null ? `Age ${age} · ` : ''}${meds.length} med${meds.length !== 1 ? 's' : ''}
                            </div>
                            ${c.allergies ? `<div class="cr-allergy">⚠️ ${esc(c.allergies)}</div>` : ''}
                        </div>
                        <div class="cr-badges">
                            ${overdueDue.length > 0 ? `<span class="badge badge-alert">${overdueDue.length} urgent</span>` : ''}
                            ${pendingCount > 0 && overdueDue.length === 0 ? `<span class="badge badge-pending">${pendingCount} pending</span>` : ''}
                            ${pendingCount === 0 && meds.length > 0 ? `<span class="badge badge-ok">✓</span>` : ''}
                            <span class="cr-chevron">›</span>
                        </div>
                    </div>`;
                });
                html += `</div>`;
            });
        }

        html += `<button class="fab" onclick="navigate('add-camper')">+</button>`;
        return html;
    }

    // ─── VIEW: Camper Detail ───────────────────────────────────────────────────
    function viewCamperDetail() {
        const camper = getCamper(state.params.camperId);
        if (!camper) return `<div class="empty-state"><p>Camper not found.</p>
            <button class="btn btn-outline mt" onclick="navigate('campers')">Back to Campers</button></div>`;

        const meds = getCamperMeds(camper.id);
        const date = todayStr();
        const age = calcAge(camper.dateOfBirth);

        let html = `
            <div class="detail-topbar">
                <button class="back-btn" onclick="navigate('campers')">‹ Campers</button>
                <button class="edit-link" onclick="navigate('add-camper',{camperId:'${esc(camper.id)}'})">Edit</button>
            </div>

            <div class="camper-profile-card">
                ${camperAvatarHTML(camper, 'profile-avatar', 64)}
                <div class="profile-info">
                    <h2>${esc(camper.firstName)} ${esc(camper.lastName)}</h2>
                    <div class="profile-meta-grid">
                        ${camper.cabin ? `<div class="meta-item"><span class="meta-lbl">Cabin</span><span>${esc(camper.cabin)}</span></div>` : ''}
                        ${age !== null ? `<div class="meta-item"><span class="meta-lbl">Age</span><span>${age}</span></div>` : ''}
                        ${camper.dateOfBirth ? `<div class="meta-item"><span class="meta-lbl">DOB</span><span>${formatDate(camper.dateOfBirth)}</span></div>` : ''}
                        ${camper.guardianName ? `<div class="meta-item"><span class="meta-lbl">Guardian</span><span>${esc(camper.guardianName)}</span></div>` : ''}
                        ${camper.guardianPhone ? `<div class="meta-item"><span class="meta-lbl">Phone</span><span><a href="tel:${esc(camper.guardianPhone)}">${esc(camper.guardianPhone)}</a></span></div>` : ''}
                    </div>
                    ${camper.allergies ? `<div class="allergy-banner">⚠️ ALLERGIES: ${esc(camper.allergies)}</div>` : ''}
                    ${camper.notes ? `<div class="profile-notes">${esc(camper.notes)}</div>` : ''}
                </div>
            </div>

            <div class="qr-bar">
                <button class="btn btn-outline btn-sm" onclick="showQR('${esc(camper.id)}')">📷 Show QR Code</button>
                <span class="qr-hint">Print &amp; attach to med bag</span>
            </div>

            <div class="section-header-row">
                <h3>Medications (${meds.length})</h3>
                <button class="btn btn-primary btn-sm" onclick="navigate('add-med',{camperId:'${esc(camper.id)}'})">+ Add Med</button>
            </div>
        `;

        if (meds.length === 0) {
            html += `<div class="empty-state"><p>No medications on file for this camper.</p></div>`;
        } else {
            meds.forEach(med => {
                const times = med.frequency === 'prn' ? [] : (med.scheduledTimes || []);
                const isActiveToday = (!med.startDate || med.startDate <= date) && (!med.endDate || med.endDate >= date);

                html += `<div class="med-card ${!isActiveToday ? 'med-inactive' : ''}">
                    <div class="med-card-header">
                        <div class="med-header-info">
                            <div class="med-name">${esc(med.name)}</div>
                            <div class="med-dosage">${esc(med.dosage)} · ${freqLabel(med.frequency)} · ${esc(med.route || 'Oral')}</div>
                        </div>
                        <div class="med-header-actions">
                            <button class="icon-btn" title="Edit" onclick="navigate('add-med',{camperId:'${esc(camper.id)}',medId:'${esc(med.id)}'})">✏️</button>
                            <button class="icon-btn" title="Delete" onclick="deleteMed('${esc(med.id)}')">🗑️</button>
                        </div>
                    </div>

                    ${med.prescribedBy ? `<div class="med-rx">Rx: Dr. ${esc(med.prescribedBy)}</div>` : ''}
                    ${med.specialInstructions ? `<div class="med-instructions">${esc(med.specialInstructions)}</div>` : ''}
                    ${med.startDate || med.endDate ? `<div class="med-dates">
                        ${med.startDate ? 'From '+formatDate(med.startDate) : ''}
                        ${med.endDate   ? ' through '+formatDate(med.endDate) : ''}
                    </div>` : ''}
                    ${!isActiveToday ? `<div class="med-inactive-label">Not active today</div>` : ''}

                    <div class="rx-verify ${med.prescriptionVerified ? 'rx-verified' : 'rx-unverified'}">
                        ${med.prescriptionVerified
                            ? `✅ Rx verified by ${esc(med.verifiedBy || 'staff')}`
                            : `⚠️ Prescription not yet verified — <button class="inline-btn" onclick="verifyRx('${esc(med.id)}')">Verify Now</button>`}
                    </div>

                    ${isActiveToday && times.length > 0 ? `
                        <div class="today-schedule">
                            <div class="today-schedule-lbl">Today's schedule:</div>
                            ${times.map(t => {
                                const st = doseStatus(med, t, date);
                                const sc = statusCfg(st);
                                const log = getLog(med.id, date, t);
                                const canMark = ['overdue','due','upcoming'].includes(st);
                                return `<div class="sched-row ${sc.cls}">
                                    <span class="sched-time">${formatTime(t)}</span>
                                    <span class="sched-status">${sc.icon} ${sc.label}</span>
                                    ${canMark ? `<button class="btn-mark-sm" onclick="openMarkModal('${esc(med.id)}','${esc(t)}','${date}')">Mark</button>` : ''}
                                    ${log ? `<span class="sched-by">${esc(log.staffName)}</span>` : ''}
                                </div>`;
                            }).join('')}
                        </div>
                    ` : ''}

                    ${isActiveToday && med.frequency === 'prn' ? `
                        <div class="prn-log-row">
                            <button class="btn btn-outline btn-sm" onclick="openMarkModal('${esc(med.id)}','prn','${date}')">Log PRN Dose</button>
                        </div>
                    ` : ''}
                </div>`;
            });
        }

        return html;
    }

    // ─── VIEW: Camper Form ─────────────────────────────────────────────────────
    function viewCamperForm() {
        const camper = state.params.camperId ? getCamper(state.params.camperId) : null;
        const isEdit = !!camper;
        const v = f => esc(camper ? (camper[f] || '') : '');
        const back = isEdit
            ? `navigate('camper-detail',{camperId:'${esc(state.params.camperId)}'})`
            : `navigate('campers')`;

        return `
            <div class="detail-topbar">
                <button class="back-btn" onclick="${back}">‹ Back</button>
                <h2>${isEdit ? 'Edit Camper' : 'Add Camper'}</h2>
            </div>

            <form class="form-card" id="camperForm" onsubmit="submitCamperForm(event,'${esc(state.params.camperId || '')}')">
                <div class="form-row">
                    <div class="form-group">
                        <label>First Name *</label>
                        <input type="text" name="firstName" value="${v('firstName')}" required placeholder="First name" autocomplete="given-name">
                    </div>
                    <div class="form-group">
                        <label>Last Name *</label>
                        <input type="text" name="lastName" value="${v('lastName')}" required placeholder="Last name" autocomplete="family-name">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Date of Birth</label>
                        <input type="date" name="dateOfBirth" value="${v('dateOfBirth')}">
                    </div>
                    <div class="form-group">
                        <label>Cabin / Group</label>
                        <input type="text" name="cabin" value="${v('cabin')}" placeholder="e.g. Eagles, Cabin 3">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Guardian Name</label>
                        <input type="text" name="guardianName" value="${v('guardianName')}" placeholder="Parent or guardian name">
                    </div>
                    <div class="form-group">
                        <label>Guardian Phone</label>
                        <input type="tel" name="guardianPhone" value="${v('guardianPhone')}" placeholder="(555) 555-5555">
                    </div>
                </div>
                <div class="form-group">
                    <label>Known Allergies</label>
                    <input type="text" name="allergies" value="${v('allergies')}" placeholder="e.g. Penicillin, peanuts — leave blank if none">
                </div>
                <div class="form-group">
                    <label>Medical Notes</label>
                    <textarea name="notes" placeholder="Any additional medical notes or special considerations...">${v('notes')}</textarea>
                </div>

                <div class="form-group photo-upload-group">
                    <label>Camper Photo <span class="optional">(for identification)</span></label>
                    <div id="photoPrev" class="photo-prev-box">
                        ${camper && camper.photo
                            ? photoPreviewHTML(camper.photo)
                            : '<p class="no-photo-msg">No photo — tap to add</p>'}
                    </div>
                    <label class="photo-file-label">
                        📷 ${camper && camper.photo ? 'Replace Photo' : 'Add Photo'}
                        <input type="file" id="photoFileInput" accept="image/*" capture="user"
                            onchange="handlePhotoSelect(this)" style="display:none">
                    </label>
                </div>

                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Add Camper'}</button>
                    ${isEdit ? `<button type="button" class="btn btn-danger" onclick="deleteCamper('${esc(state.params.camperId)}')">Delete Camper</button>` : ''}
                </div>
            </form>
        `;
    }

    // ─── VIEW: Medication Form ─────────────────────────────────────────────────
    function viewMedForm() {
        const camper = getCamper(state.params.camperId);
        if (!camper) return `<div class="empty-state"><p>Camper not found.</p></div>`;

        const med = state.params.medId ? state.medications.find(m => m.id === state.params.medId) : null;
        const isEdit = !!med;
        const v = (f, def) => { const val = med ? med[f] : undefined; return val !== undefined ? val : (def !== undefined ? def : ''); };
        const vesc = (f, def) => esc(v(f, def));

        const freq = v('frequency', 'once_daily');
        const times = v('scheduledTimes', defaultTimes('once_daily'));

        return `
            <div class="detail-topbar">
                <button class="back-btn" onclick="navigate('camper-detail',{camperId:'${esc(camper.id)}'})">‹ Back</button>
                <h2>${isEdit ? 'Edit Medication' : 'Add Medication'}</h2>
            </div>

            <div class="context-banner">For: <strong>${esc(camper.firstName)} ${esc(camper.lastName)}</strong></div>

            <form class="form-card" id="medForm" onsubmit="submitMedForm(event,'${esc(camper.id)}','${esc(state.params.medId || '')}')">
                <div class="form-group">
                    <label>Medication Name *</label>
                    <input type="text" name="name" value="${vesc('name')}" required placeholder="e.g. Amoxicillin, Adderall XR">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Dosage *</label>
                        <input type="text" name="dosage" value="${vesc('dosage')}" required placeholder="e.g. 250mg, 1 tablet">
                    </div>
                    <div class="form-group">
                        <label>Route</label>
                        <select name="route">
                            ${['Oral','Topical','Inhaled','Eye drops','Ear drops','Nasal spray','Injection','Other'].map(r =>
                                `<option ${v('route','Oral') === r ? 'selected' : ''}>${r}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Frequency *</label>
                    <select name="frequency" id="freqSelect" onchange="onFreqChange(this.value)">
                        <option value="once_daily"  ${freq==='once_daily'  ?'selected':''}>Once Daily</option>
                        <option value="twice_daily" ${freq==='twice_daily' ?'selected':''}>Twice Daily (BID)</option>
                        <option value="three_daily" ${freq==='three_daily' ?'selected':''}>Three Times Daily (TID)</option>
                        <option value="four_daily"  ${freq==='four_daily'  ?'selected':''}>Four Times Daily (QID)</option>
                        <option value="prn"         ${freq==='prn'         ?'selected':''}>As Needed (PRN)</option>
                    </select>
                </div>

                <div id="timesSection" ${freq === 'prn' ? 'class="hidden"' : ''}>
                    <label class="times-label">Scheduled Times</label>
                    <div id="timeInputs" class="time-inputs-row">
                        ${buildTimeInputs(freq, times)}
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Start Date</label>
                        <input type="date" name="startDate" value="${vesc('startDate', todayStr())}">
                    </div>
                    <div class="form-group">
                        <label>End Date <span class="optional">(leave blank if ongoing)</span></label>
                        <input type="date" name="endDate" value="${vesc('endDate')}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Prescribing Physician</label>
                    <input type="text" name="prescribedBy" value="${vesc('prescribedBy')}" placeholder="Dr. Smith">
                </div>
                <div class="form-group">
                    <label>Special Instructions</label>
                    <textarea name="specialInstructions" placeholder="e.g. Take with food. Do not crush. Avoid sunlight.">${vesc('specialInstructions')}</textarea>
                </div>

                <div class="verify-section">
                    <label class="checkbox-label">
                        <input type="checkbox" name="prescriptionVerified" id="verifiedCb"
                            ${v('prescriptionVerified') ? 'checked' : ''}
                            onchange="document.getElementById('verifierRow').style.display=this.checked?'':'none'">
                        Physical prescription reviewed and verified
                    </label>
                    <div id="verifierRow" style="display:${v('prescriptionVerified') ? '' : 'none'}; margin-top:10px;">
                        <input type="text" name="verifiedBy" value="${vesc('verifiedBy')}" placeholder="Verified by (your name)">
                    </div>
                </div>

                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Add Medication'}</button>
                </div>
            </form>
        `;
    }

    function buildTimeInputs(freq, times) {
        const count = freqCount(freq);
        const defs = defaultTimes(freq);
        let html = '';
        for (let i = 0; i < count; i++) {
            const val = (times && times[i]) || defs[i] || '08:00';
            html += `<div class="time-input-wrap">
                <label class="time-num">${['1st','2nd','3rd','4th'][i]}</label>
                <input type="time" name="time_${i}" value="${esc(val)}" class="time-input">
            </div>`;
        }
        return html;
    }

    // ─── VIEW: Scanner ─────────────────────────────────────────────────────────
    function viewScanner() {
        return `
            <div class="page-header">
                <h2>Scan Camper QR Code</h2>
                <p class="page-date">Point camera at a camper's QR badge</p>
            </div>
            <div id="qrReaderBox" class="qr-reader-container"></div>
            <div id="scanMsg" class="scan-msg"></div>
            <div class="divider-or"><span>or search manually</span></div>
            <div class="manual-search-wrap">
                <input type="search" id="manualInput" class="search-bar"
                    placeholder="Type camper name..."
                    oninput="manualSearch(this.value)">
                <div id="manualResults" class="manual-results"></div>
            </div>
        `;
    }

    // ─── VIEW: Reports ─────────────────────────────────────────────────────────
    function viewReports() {
        const date = state.params.date || todayStr();
        const camperFilter = state.params.camperFilter || '';
        let doses = getTodaysDoses(date);
        if (camperFilter) doses = doses.filter(d => d.camper.id === camperFilter);

        return `
            <div class="page-header">
                <h2>Administration Report</h2>
            </div>
            <div class="report-controls form-card">
                <div class="form-row">
                    <div class="form-group">
                        <label>Date</label>
                        <input type="date" value="${esc(date)}"
                            onchange="navigate('reports',{date:this.value,camperFilter:'${esc(camperFilter)}'})">
                    </div>
                    <div class="form-group">
                        <label>Camper</label>
                        <select onchange="navigate('reports',{date:'${esc(date)}',camperFilter:this.value})">
                            <option value="">All Campers</option>
                            ${state.campers.map(c => `<option value="${esc(c.id)}" ${camperFilter===c.id?'selected':''}>${esc(c.firstName)} ${esc(c.lastName)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <button class="btn btn-outline" onclick="window.print()">🖨️ Print Report</button>
            </div>

            <h3 class="report-date-heading">${formatDate(date)}${camperFilter ? ' — '+esc((getCamper(camperFilter)||{}).firstName||'') : ''}</h3>

            ${doses.length === 0
                ? `<div class="empty-state"><p>No doses scheduled for this date.</p></div>`
                : `<div class="table-wrap">
                    <table class="report-table">
                        <thead><tr>
                            <th>Camper</th><th>Medication</th><th>Dose</th>
                            <th>Scheduled</th><th>Status</th><th>Given By</th><th>Time Given</th><th>Notes</th>
                        </tr></thead>
                        <tbody>
                            ${doses.map(d => {
                                const log = d.time ? getLog(d.med.id, date, d.time) : null;
                                return `<tr class="report-row-${d.status}">
                                    <td>${esc(d.camper.firstName)} ${esc(d.camper.lastName)}</td>
                                    <td>${esc(d.med.name)}</td>
                                    <td>${esc(d.med.dosage)}</td>
                                    <td>${d.time ? formatTime(d.time) : 'PRN'}</td>
                                    <td>${statusHuman(d.status)}</td>
                                    <td>${log ? esc(log.staffName) : ''}</td>
                                    <td>${log ? formatDT(log.administeredAt) : ''}</td>
                                    <td>${log ? esc(log.notes||'') : ''}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`
            }

            <div class="report-summary">
                <strong>Summary:</strong>
                ${['given','refused','held','missed','upcoming','overdue'].map(s =>
                    `${s}: ${doses.filter(d=>d.status===s).length}`
                ).join(' · ')}
            </div>
        `;
    }

    // ─── QR Code ───────────────────────────────────────────────────────────────
    function showQR(camperId) {
        const camper = getCamper(camperId);
        if (!camper) return;

        const payload = JSON.stringify({ type: 'kyc-camper-v1', id: camperId });

        showModal(`
            <div class="qr-modal-inner">
                <h3>Camper QR Code</h3>
                ${camper.photo ? `<img src="${esc(camper.photo)}" class="qr-photo" alt="${esc(camper.firstName)}">` : ''}
                <div class="qr-name">${esc(camper.firstName)} ${esc(camper.lastName)}</div>
                ${camper.cabin ? `<div class="qr-cabin">Cabin: ${esc(camper.cabin)}</div>` : ''}
                <div id="qrCanvas" class="qr-canvas-wrap"></div>
                <p class="qr-tip">Print and attach to medication bag</p>
                <div class="modal-btns">
                    <button class="btn btn-primary" onclick="window.print()">🖨️ Print</button>
                    <button class="btn btn-outline" onclick="closeModal()">Close</button>
                </div>
            </div>
        `);

        setTimeout(() => {
            const container = document.getElementById('qrCanvas');
            if (!container) return;
            if (typeof QRCode !== 'undefined') {
                new QRCode(container, { text: payload, width: 220, height: 220 });
            } else {
                container.innerHTML = `<p class="error-msg">QR library unavailable offline.<br>Camper ID: ${esc(camperId)}</p>`;
            }
        }, 80);
    }

    // ─── Scanner Logic ─────────────────────────────────────────────────────────
    function initScanner() {
        stopScanner();

        if (typeof Html5Qrcode === 'undefined') {
            document.getElementById('scanMsg').innerHTML = `<p class="error-msg">Scanner library not available. Check internet connection.</p>`;
            return;
        }

        const reader = new Html5Qrcode('qrReaderBox');
        state.scanner = reader;

        Html5Qrcode.getCameras()
            .then(cameras => {
                if (!cameras || cameras.length === 0) {
                    document.getElementById('scanMsg').innerHTML = `<p class="error-msg">No camera found on this device.</p>`;
                    return;
                }
                // Prefer rear camera
                const cam = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1];
                return reader.start(cam.id, { fps: 10, qrbox: 250 }, onScanSuccess, null);
            })
            .catch(err => {
                const msg = document.getElementById('scanMsg');
                if (msg) msg.innerHTML = `<p class="error-msg">Camera access denied. Please allow camera permissions and reload.</p>`;
            });
    }

    function onScanSuccess(text) {
        try {
            const data = JSON.parse(text);
            if (data.type === 'kyc-camper-v1' && data.id) {
                stopScanner();
                navigate('camper-detail', { camperId: data.id });
                return;
            }
        } catch (e) { /* not JSON */ }
        const msg = document.getElementById('scanMsg');
        if (msg) msg.innerHTML = `<p class="error-msg">Unrecognized QR code.</p>`;
    }

    function stopScanner() {
        if (state.scanner) {
            state.scanner.stop().catch(() => {});
            state.scanner = null;
        }
    }

    function manualSearch(query) {
        const results = document.getElementById('manualResults');
        if (!results) return;
        if (!query.trim()) { results.innerHTML = ''; return; }
        const q = query.toLowerCase();
        const matches = state.campers.filter(c =>
            `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || (c.cabin||'').toLowerCase().includes(q)
        );
        results.innerHTML = matches.length === 0
            ? `<p class="no-match">No campers found.</p>`
            : matches.map(c => `<div class="manual-result-row" onclick="navigate('camper-detail',{camperId:'${esc(c.id)}'})">
                <span>${esc(c.firstName)} ${esc(c.lastName)}</span>
                ${c.cabin ? `<span class="mr-cabin">${esc(c.cabin)}</span>` : ''}
            </div>`).join('');
    }

    // ─── Mark Modal ────────────────────────────────────────────────────────────
    function openMarkModal(medId, time, date) {
        const med = state.medications.find(m => m.id === medId);
        if (!med) return;
        const camper = getCamper(med.camperId);
        const existingLog = time === 'prn'
            ? state.logs.find(l => l.medId === medId && l.date === date && !l.time)
            : getLog(medId, date, time);

        const staffVal = existingLog ? esc(existingLog.staffName) : esc(state.staffName);
        const selectedStatus = existingLog ? existingLog.status : 'given';
        const notesVal = existingLog ? esc(existingLog.notes || '') : '';

        showModal(`
            <div class="mark-modal-inner">
                <h3>${existingLog ? 'Edit' : 'Mark'} Dose</h3>
                <div class="mark-med-summary">
                    <strong>${esc(med.name)} ${esc(med.dosage)}</strong><br>
                    ${camper ? esc(camper.firstName)+' '+esc(camper.lastName)+'<br>' : ''}
                    ${time !== 'prn' ? formatTime(time)+' · ' : 'PRN · '}${formatDate(date)}
                </div>

                <div class="form-group">
                    <label>Status</label>
                    <div class="status-btn-grid">
                        ${['given','refused','held','missed'].map(s => `
                            <button type="button" class="status-opt ${s==='given'?'sopt-green':s==='refused'?'sopt-red':s==='held'?'sopt-yellow':'sopt-gray'} ${selectedStatus===s?'sopt-selected':''}"
                                onclick="pickStatus(this,'${s}')">
                                ${statusHuman(s)}
                            </button>
                        `).join('')}
                    </div>
                    <input type="hidden" id="markStatusVal" value="${selectedStatus}">
                </div>

                <div class="form-group">
                    <label>Your Name *</label>
                    <input type="text" id="markStaffInput" value="${staffVal}" placeholder="Staff name" autocomplete="name">
                </div>
                <div class="form-group">
                    <label>Notes <span class="optional">(optional)</span></label>
                    <textarea id="markNotesInput" placeholder="e.g. Patient refused, given with milk...">${notesVal}</textarea>
                </div>

                <div class="modal-btns">
                    <button class="btn btn-primary" onclick="saveDoseLog('${esc(medId)}','${esc(time)}','${esc(date)}')">Save</button>
                    <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
                </div>
            </div>
        `);
    }

    function pickStatus(btn, status) {
        document.querySelectorAll('.status-opt').forEach(b => b.classList.remove('sopt-selected'));
        btn.classList.add('sopt-selected');
        document.getElementById('markStatusVal').value = status;
    }

    function saveDoseLog(medId, time, date) {
        const staffName = (document.getElementById('markStaffInput').value || '').trim();
        const status = document.getElementById('markStatusVal').value;
        const notes = (document.getElementById('markNotesInput').value || '').trim();

        if (!staffName) { alert('Please enter your name.'); return; }

        state.staffName = staffName;
        saveStaff();

        const isPrn = time === 'prn';
        const key = isPrn ? null : logKey(medId, date, time);

        if (isPrn) {
            // PRN: always add a new entry (allows multiple PRN doses per day)
            state.logs.push({
                id: uid(), medId, date, time: null, key: null,
                status, staffName, notes, administeredAt: nowISO()
            });
        } else {
            const idx = state.logs.findIndex(l => l.key === key);
            const entry = { id: idx >= 0 ? state.logs[idx].id : uid(), key, medId, date, time, status, staffName, notes, administeredAt: nowISO() };
            if (idx >= 0) state.logs[idx] = entry;
            else state.logs.push(entry);
        }

        saveLogs();
        closeModal();
        showToast(`Marked as ${status}`, 'success');
        renderView();
    }

    // ─── Form Submissions ──────────────────────────────────────────────────────
    function submitCamperForm(e, existingId) {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));

        // Resolve photo: new upload > cleared > existing > none
        let photo;
        if (state.pendingPhoto === '__clear__') {
            photo = '';
        } else if (state.pendingPhoto) {
            photo = state.pendingPhoto;
        } else if (existingId) {
            const existing = getCamper(existingId);
            photo = existing ? (existing.photo || '') : '';
        } else {
            photo = '';
        }
        state.pendingPhoto = null;

        if (existingId) {
            const idx = state.campers.findIndex(c => c.id === existingId);
            if (idx >= 0) state.campers[idx] = { ...state.campers[idx], ...data, photo };
        } else {
            state.campers.push({ id: uid(), ...data, photo, createdAt: nowISO() });
        }
        saveCampers();
        showToast(existingId ? 'Camper updated' : 'Camper added', 'success');
        navigate(existingId ? 'camper-detail' : 'campers', existingId ? { camperId: existingId } : {});
    }

    function submitMedForm(e, camperId, existingMedId) {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));

        const freq = data.frequency;
        const count = freqCount(freq);
        const scheduledTimes = [];
        for (let i = 0; i < count; i++) {
            if (data[`time_${i}`]) scheduledTimes.push(data[`time_${i}`]);
        }

        const medData = {
            camperId,
            name: data.name,
            dosage: data.dosage,
            route: data.route,
            frequency: freq,
            scheduledTimes,
            startDate: data.startDate || '',
            endDate: data.endDate || '',
            prescribedBy: data.prescribedBy || '',
            specialInstructions: data.specialInstructions || '',
            prescriptionVerified: !!data.prescriptionVerified,
            verifiedBy: data.verifiedBy || '',
            active: true
        };

        if (existingMedId) {
            const idx = state.medications.findIndex(m => m.id === existingMedId);
            if (idx >= 0) state.medications[idx] = { ...state.medications[idx], ...medData };
        } else {
            state.medications.push({ id: uid(), ...medData, createdAt: nowISO() });
        }

        saveMeds();
        showToast(existingMedId ? 'Medication updated' : 'Medication added', 'success');
        navigate('camper-detail', { camperId });
    }

    // ─── Delete Actions ────────────────────────────────────────────────────────
    function deleteCamper(id) {
        const camper = getCamper(id);
        if (!camper || !confirm(`Delete ${camper.firstName} ${camper.lastName} and all their medication records? This cannot be undone.`)) return;
        state.campers = state.campers.filter(c => c.id !== id);
        const medIds = state.medications.filter(m => m.camperId === id).map(m => m.id);
        state.medications = state.medications.filter(m => m.camperId !== id);
        state.logs = state.logs.filter(l => !medIds.includes(l.medId));
        saveCampers(); saveMeds(); saveLogs();
        showToast('Camper deleted', 'info');
        navigate('campers');
    }

    function deleteMed(id) {
        const med = state.medications.find(m => m.id === id);
        if (!med || !confirm(`Delete ${med.name}? Administration history will also be removed.`)) return;
        const camperId = med.camperId;
        state.medications = state.medications.filter(m => m.id !== id);
        state.logs = state.logs.filter(l => l.medId !== id);
        saveMeds(); saveLogs();
        showToast('Medication deleted', 'info');
        navigate('camper-detail', { camperId });
    }

    function verifyRx(medId) {
        const name = prompt('Enter your name to confirm prescription verification:');
        if (!name) return;
        const idx = state.medications.findIndex(m => m.id === medId);
        if (idx >= 0) {
            state.medications[idx].prescriptionVerified = true;
            state.medications[idx].verifiedBy = name.trim();
            saveMeds();
            renderView();
            showToast('Prescription verified', 'success');
        }
    }

    // ─── Modal & Toast ─────────────────────────────────────────────────────────
    function showModal(html) {
        document.getElementById('modalBox').innerHTML = html;
        document.getElementById('modalOverlay').classList.add('open');
    }

    function closeModal() {
        document.getElementById('modalOverlay').classList.remove('open');
    }

    function handleOverlayClick(e) {
        if (e.target.id === 'modalOverlay') closeModal();
    }

    let toastTimer;
    function showToast(msg, type) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.className = `toast toast-${type} toast-show`;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('toast-show'), 3000);
    }

    // ─── UI Interactions ───────────────────────────────────────────────────────
    function handleCamperSearch(val) {
        state.params.search = val;
        const main = document.getElementById('appMain');
        main.innerHTML = viewCampers();
        const input = document.getElementById('camperSearch');
        if (input) { input.focus(); input.setSelectionRange(val.length, val.length); }
        bindEvents();
    }

    function onFreqChange(freq) {
        const section = document.getElementById('timesSection');
        const inputs = document.getElementById('timeInputs');
        if (!section || !inputs) return;
        section.classList.toggle('hidden', freq === 'prn');
        inputs.innerHTML = freq !== 'prn' ? buildTimeInputs(freq, defaultTimes(freq)) : '';
    }

    function toggleCollapse(header) {
        const body = header.nextElementSibling;
        const icon = header.querySelector('.collapse-icon');
        const hidden = body.style.display === 'none';
        body.style.display = hidden ? '' : 'none';
        if (icon) icon.textContent = hidden ? '▼' : '▶';
    }

    // ─── Clock ─────────────────────────────────────────────────────────────────
    function updateClock() {
        const el = document.getElementById('headerClock');
        if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
    }

    // ─── Event Binding ─────────────────────────────────────────────────────────
    function bindEvents() {
        document.querySelectorAll('#bottomNav .nav-btn').forEach(btn => {
            btn.addEventListener('click', () => navigate(btn.dataset.view));
        });
    }

    // ─── Expose globals for inline handlers ───────────────────────────────────
    const G = window;
    G.handlePhotoSelect  = handlePhotoSelect;
    G.clearPhoto         = clearPhoto;
    G.navigate           = navigate;
    G.openMarkModal      = openMarkModal;
    G.pickStatus         = pickStatus;
    G.saveDoseLog        = saveDoseLog;
    G.submitCamperForm   = submitCamperForm;
    G.submitMedForm      = submitMedForm;
    G.deleteCamper       = deleteCamper;
    G.deleteMed          = deleteMed;
    G.verifyRx           = verifyRx;
    G.showQR             = showQR;
    G.closeModal         = closeModal;
    G.handleOverlayClick = handleOverlayClick;
    G.handleCamperSearch = handleCamperSearch;
    G.onFreqChange       = onFreqChange;
    G.toggleCollapse     = toggleCollapse;
    G.manualSearch       = manualSearch;

    // ─── Init ──────────────────────────────────────────────────────────────────
    function init() {
        load();
        navigate('dashboard');
        updateClock();
        setInterval(updateClock, 30000);
        setInterval(() => { if (state.view === 'dashboard') renderView(); }, 60000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
