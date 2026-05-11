(function () {
    'use strict';

    var CONTAINER_ID    = 'dn-timecard-container';
    var APPLY_BTN_ID    = 'dn-apply-filter-btn';
    var STYLE_ID        = 'dn-timecard-styles';
    var EDIT_MODAL_ID   = 'dn-edit-modal';
    var currentStart   = null;
    var currentEnd     = null;
    var currentUserIds = null; // JSON string — re-fetch when selection changes
    var _fetching      = false; // guard against MutationObserver re-entrancy
    var _jspdfLoaded  = false;
    var _jspdfLoading = false;
    var _jspdfQueue   = [];

    // ── helpers ────────────────────────────────────────────────────────────

    function isOnTimecardPage() {
        return window.location.pathname === '/report/time-use';
    }

    function getToken() {
        return localStorage.getItem('access_token');
    }

    function isAdmin() {
        try {
            var vm = document.getElementById('app').__vue__;
            var user = vm.$store.getters['user/user'];
            return !!(user && parseInt(user.role_id, 10) === 0);
        } catch (e) { return false; }
    }

    function getCurrentUserId() {
        try {
            var vm = document.getElementById('app').__vue__;
            var user = vm.$store.getters['user/user'];
            return user ? user.id : null;
        } catch (e) { return null; }
    }

    // Read the userIDs the native UserSelect has already set on the TimeuseReport
    // Vue component instance. Vue Router exposes matched component instances via
    // $route.matched[n].instances.default — more reliable than walking $children.
    function getSelectedUserIds() {
        try {
            var vm = document.getElementById('app').__vue__;
            var matched = vm.$route && vm.$route.matched;
            if (!matched) return [];
            // Search deepest → shallowest so the TimeuseReport leaf component
            // is found before any parent route component that may also have userIDs=[].
            for (var i = matched.length - 1; i >= 0; i--) {
                var inst = matched[i].instances && matched[i].instances.default;
                if (inst && Array.isArray(inst.userIDs)) return inst.userIDs;
            }
        } catch (e) {}
        return [];
    }

    function getSessionDates() {
        var re = /^\d{4}-\d{2}-\d{2}$/;
        var start = sessionStorage.getItem('amazingcat.session.storage.timeuse_report.start');
        var end   = sessionStorage.getItem('amazingcat.session.storage.timeuse_report.end');
        return {
            start: (start && re.test(start)) ? start : null,
            end:   (end   && re.test(end))   ? end   : null,
        };
    }

    function apiFetch(url, body) {
        return fetch('/api/' + url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + getToken(),
            },
            body: JSON.stringify(body),
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    // API returns "YYYY-MM-DD HH:MM:SS" (no timezone) — always treat as UTC.
    function normTs(s) {
        s = String(s || '').replace(' ', 'T');
        if (!/Z|[+-]\d{2}:\d{2}$/.test(s)) s += 'Z';
        return s;
    }

    function esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Display timestamps as stored (UTC) without timezone conversion, matching
    // native Cattr's Team page and screenshot modal behaviour. Revisit after
    // the desktop agent is fixed to send real UTC (IDEA-002).
    function toLocalParts(isoUtc) {
        try {
            var d = new Date(normTs(isoUtc));
            var dateParts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'UTC',
                month: '2-digit', day: '2-digit', year: 'numeric',
            }).formatToParts(d);
            var timeParts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'UTC',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
            }).formatToParts(d);
            var dm = {}, tm = {};
            dateParts.forEach(function (p) { dm[p.type] = p.value; });
            timeParts.forEach(function (p) { tm[p.type] = p.value; });
            var ampm = (tm.dayPeriod || '').replace(/\s/g, '');
            return {
                dateStr: dm.month + '/' + dm.day + '/' + dm.year,
                timeStr: tm.hour + ':' + tm.minute + ':' + tm.second + ampm,
            };
        } catch (e) {
            var d2 = new Date(normTs(isoUtc));
            var pad = function (n) { return String(n).padStart(2, '0'); };
            var h = d2.getUTCHours(), ampm2 = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
            return {
                dateStr: pad(d2.getUTCMonth() + 1) + '/' + pad(d2.getUTCDate()) + '/' + d2.getUTCFullYear(),
                timeStr: pad(h12) + ':' + pad(d2.getUTCMinutes()) + ':' + pad(d2.getUTCSeconds()) + ampm2,
            };
        }
    }

    function durationSecs(start_at, end_at) {
        return Math.max(0, Math.round((new Date(normTs(end_at)) - new Date(normTs(start_at))) / 1000));
    }

    function fmtDuration(secs) {
        var h = Math.floor(secs / 3600);
        var m = Math.floor((secs % 3600) / 60);
        var s = secs % 60;
        var p = function (n) { return String(n).padStart(2, '0'); };
        return p(h) + ':' + p(m) + ':' + p(s);
    }

    function closeEditModal() {
        var m = document.getElementById(EDIT_MODAL_ID);
        if (m) m.parentNode.removeChild(m);
    }

    function saveEdit(id, startIso, endIso) {
        return apiFetch('time-intervals/edit', {
            id: id,
            start_at: startIso,
            end_at: endIso,
        });
    }

    function openEditModal(iv) {
        closeEditModal();
        var startVal = normTs(iv.start_at || new Date().toISOString()).slice(0, 16);
        var endVal   = normTs(iv.end_at   || new Date().toISOString()).slice(0, 16);
        var taskName = iv.task ? (iv.task.task_name || '—') : '—';
        var project  = iv.task && iv.task.project ? iv.task.project.name : '';

        var overlay = document.createElement('div');
        overlay.id = EDIT_MODAL_ID;
        overlay.className = 'dn-edit-overlay';
        overlay.innerHTML =
            '<div class="dn-edit-modal">' +
            '<div class="dn-edit-title">Edit Time Entry</div>' +
            '<div class="dn-edit-subtitle">' + esc(taskName) + (project ? ' · ' + esc(project) : '') + '</div>' +
            '<label class="dn-edit-label">Start' +
            '<input class="dn-edit-input" id="dn-edit-start" type="datetime-local" value="' + esc(startVal) + '">' +
            '</label>' +
            '<label class="dn-edit-label">End' +
            '<input class="dn-edit-input" id="dn-edit-end" type="datetime-local" value="' + esc(endVal) + '">' +
            '</label>' +
            '<div class="dn-edit-tz">Times shown in UTC</div>' +
            '<div class="dn-edit-error" id="dn-edit-error" style="display:none"></div>' +
            '<div class="dn-edit-actions">' +
            '<button class="at-btn at-btn--small" id="dn-edit-cancel">Cancel</button>' +
            '<button class="at-btn at-btn--primary at-btn--small" id="dn-edit-save">Save</button>' +
            '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        document.getElementById('dn-edit-cancel').addEventListener('click', closeEditModal);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeEditModal();
        });

        document.getElementById('dn-edit-save').addEventListener('click', function () {
            var startInput = document.getElementById('dn-edit-start').value;
            var endInput   = document.getElementById('dn-edit-end').value;
            var errEl      = document.getElementById('dn-edit-error');
            if (!startInput || !endInput) {
                errEl.textContent = 'Both start and end times are required.';
                errEl.style.display = 'block';
                return;
            }
            if (new Date(endInput).getTime() <= new Date(startInput).getTime()) {
                errEl.textContent = 'End time must be after start time.';
                errEl.style.display = 'block';
                return;
            }
            errEl.style.display = 'none';
            var saveBtn = document.getElementById('dn-edit-save');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving…';

            var startIso = new Date(startInput).toISOString();
            var endIso   = new Date(endInput).toISOString();

            saveEdit(iv.id, startIso, endIso).then(function () {
                closeEditModal();
                currentStart = null;
                renderTimecard();
            }).catch(function (err) {
                errEl.textContent = 'Save failed: ' + (err.message || 'unknown error');
                errEl.style.display = 'block';
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
            });
        });
    }

    // ── fetch ──────────────────────────────────────────────────────────────

    async function fetchIntervals(start, end, userIds) {
        try {
            var where = { 'start_at': ['between', [start + ' 00:00:00', end + ' 23:59:59']] };
            if (userIds && userIds.length) {
                // QueryHelper parses where values as [$operator, $value].
                // Passing the array directly makes the first ID the operator.
                // The correct format for whereIn is ['=', [id1, id2, ...]].
                where['user_id'] = ['=', userIds];
            }
            var resp = await apiFetch('time-intervals/list', {
                'with': ['task', 'task.project', 'user'],
                'where': where,
                'orderBy': ['start_at', 'desc'],
                'perPage': 2000,
            });
            if (!resp || !resp.data) return { rows: [], truncated: false };
            var truncated = resp.total && resp.data.length < resp.total;
            return { rows: resp.data, truncated: !!truncated };
        } catch (e) {
            return { rows: [], truncated: false, error: true };
        }
    }

    // ── PDF export ─────────────────────────────────────────────────────────

    function loadScript(url) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = url;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    function loadAndExportPDF(intervals, dates, btn) {
        if (_jspdfLoading) return; // prevent double-download while CDN is loading
        if (_jspdfLoaded) { doExportPDF(intervals, dates); return; }
        _jspdfLoading = true;
        if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
        loadScript('/jspdf.umd.min.js')
            .then(function () {
                return loadScript('/jspdf.plugin.autotable.min.js');
            })
            .then(function () {
                _jspdfLoaded  = true;
                _jspdfLoading = false;
                if (btn) { btn.disabled = false; btn.textContent = 'Export PDF'; }
                doExportPDF(intervals, dates);
                _jspdfQueue.forEach(function (fn) { fn(); });
                _jspdfQueue = [];
            })
            .catch(function () {
                _jspdfLoading = false;
                if (btn) { btn.disabled = false; btn.textContent = 'Export PDF'; }
                window.print();
            });
    }

    function doExportPDF(intervals, dates) {
        var jsPDF = window.jspdf && window.jspdf.jsPDF;
        if (!jsPDF) { window.print(); return; }
        var total = intervals.reduce(function (s, iv) {
            return s + durationSecs(iv.start_at, iv.end_at);
        }, 0);

        var doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Detailed Report', 40, 50);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 120);
        doc.text(dates.start + ' – ' + dates.end, 40, 68);

        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text('Total: ' + fmtDuration(total), 40, 86);

        var rows = intervals.map(function (iv) {
            var secs     = durationSecs(iv.start_at, iv.end_at);
            var sp       = toLocalParts(iv.start_at);
            var ep       = toLocalParts(iv.end_at);
            var taskName = iv.task ? (iv.task.task_name || '—') : '—';
            var project  = iv.task && iv.task.project ? iv.task.project.name : '';
            var userName = iv.user ? (iv.user.full_name || '') : '';
            return [
                sp.dateStr,
                project ? taskName + '\n' + project : taskName,
                fmtDuration(secs) + '\n' + sp.timeStr + ' - ' + ep.timeStr,
                userName,
            ];
        });

        doc.autoTable({
            startY: 100,
            head: [['Date', 'Description', 'Duration', 'User']],
            body: rows,
            styles: { fontSize: 8, cellPadding: 6 },
            headStyles: { fillColor: [240, 240, 240], textColor: [100, 100, 100], fontStyle: 'normal', fontSize: 7 },
            columnStyles: { 0: { cellWidth: 75 }, 2: { cellWidth: 145 }, 3: { cellWidth: 120 } },
        });

        var filename = 'Cattr_Time_Report_Detailed_' +
            dates.start.replace(/-/g, '_') + '-' +
            dates.end.replace(/-/g, '_') + '.pdf';
        doc.save(filename);
    }

    // ── render ─────────────────────────────────────────────────────────────

    function buildContent(intervals, dates, truncated) {
        var total = intervals.reduce(function (s, iv) {
            return s + durationSecs(iv.start_at, iv.end_at);
        }, 0);

        var wrap = document.createElement('div');
        wrap.className = 'dn-tc-wrap';

        // Export button (screen only — hidden in print via CSS)
        var bar = document.createElement('div');
        bar.className = 'dn-tc-bar';
        var btn = document.createElement('button');
        btn.className = 'at-btn at-btn--primary at-btn--small';
        btn.textContent = 'Export PDF';
        btn.addEventListener('click', function () { loadAndExportPDF(intervals, dates, btn); });
        bar.appendChild(btn);
        wrap.appendChild(bar);

        // Report header
        var hdr = document.createElement('div');
        hdr.className = 'dn-tc-header';
        hdr.innerHTML =
            '<h1 class="dn-tc-title">Detailed report</h1>' +
            '<div class="dn-tc-range">' + esc(dates.start) + ' – ' + esc(dates.end) + '</div>' +
            '<div class="dn-tc-totline">Total: <span class="dn-tc-tot">' + fmtDuration(total) + '</span></div>';
        wrap.appendChild(hdr);

        if (truncated) {
            var warn = document.createElement('p');
            warn.className = 'dn-tc-warning';
            warn.textContent = 'Showing first 2,000 entries only — export covers a partial date range. Narrow the date range to see all data.';
            wrap.appendChild(warn);
        }

        if (!intervals.length) {
            var empty = document.createElement('p');
            empty.className = 'dn-tc-empty';
            empty.textContent = 'No time entries found for this period.';
            wrap.appendChild(empty);
            return wrap;
        }

        // Table
        var tbl = document.createElement('table');
        tbl.className = 'dn-tc-table';

        var thead = document.createElement('thead');
        thead.innerHTML =
            '<tr><th>Date</th><th>Description</th><th>Duration</th><th>User</th>' +
            (isAdmin() ? '<th></th>' : '') +
            '</tr>';
        tbl.appendChild(thead);

        var tbody = document.createElement('tbody');
        intervals.forEach(function (iv) {
            var secs       = durationSecs(iv.start_at, iv.end_at);
            var sp         = toLocalParts(iv.start_at);
            var ep         = toLocalParts(iv.end_at);
            var taskName   = iv.task ? (iv.task.task_name || '—') : '—';
            var project    = iv.task && iv.task.project ? iv.task.project.name : '';
            var userName   = iv.user ? (iv.user.full_name || '') : '';

            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td class="dn-tc-col-date">' + esc(sp.dateStr) + '</td>' +
                '<td class="dn-tc-col-desc">' +
                    '<div class="dn-tc-task">' + esc(taskName) + '</div>' +
                    (project ? '<div class="dn-tc-project">' + esc(project) + '</div>' : '') +
                '</td>' +
                '<td class="dn-tc-col-dur" style="white-space:nowrap;min-width:185px;width:185px">' +
                    '<span style="display:block;font-weight:500;color:#1a1a2e">' + esc(fmtDuration(secs)) + '</span>' +
                    '<span style="display:block;color:#888;font-size:0.82rem;margin-top:3px;white-space:nowrap;word-break:keep-all;overflow-wrap:normal">' + esc(sp.timeStr) + ' - ' + esc(ep.timeStr) + '</span>' +
                '</td>' +
                '<td class="dn-tc-col-user">' + esc(userName) + '</td>';

            if (isAdmin()) {
                var editTd  = document.createElement('td');
                editTd.className = 'dn-tc-col-action';
                if (iv.end_at) {
                    var editBtn = document.createElement('button');
                    editBtn.className = 'dn-tc-edit-btn';
                    editBtn.title = 'Edit times';
                    editBtn.textContent = '✎';
                    (function (interval) {
                        editBtn.addEventListener('click', function () { openEditModal(interval); });
                    }(iv));
                    editTd.appendChild(editBtn);
                }
                tr.appendChild(editTd);
            }

            tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        wrap.appendChild(tbl);

        return wrap;
    }

    // Update currentStart/End and the _fetching flag BEFORE touching the DOM
    // so that MutationObserver re-entrancy can't trigger a second fetch.
    async function renderTimecard() {
        if (_fetching) return;

        var dates   = getSessionDates();
        if (!dates.start || !dates.end) return;
        var userIds = isAdmin()
            ? getSelectedUserIds()
            : (function () { var id = getCurrentUserId(); return id ? [id] : []; }());

        // Snapshot all state BEFORE touching the DOM — prevents MutationObserver
        // re-entrancy from triggering a second fetch while this one is in flight.
        _fetching      = true;
        currentStart   = dates.start;
        currentEnd     = dates.end;
        currentUserIds = JSON.stringify(userIds.slice().sort());

        var container = document.getElementById(CONTAINER_ID);
        if (!container) { _fetching = false; return; }

        container.innerHTML = '<p class="dn-tc-loading">Loading…</p>';

        try {
            var intervals = await fetchIntervals(dates.start, dates.end, userIds);
            container = document.getElementById(CONTAINER_ID);
            if (!container) return; // navigated away during fetch
            container.innerHTML = '';
            container.appendChild(buildContent(intervals.rows, dates, intervals.truncated));
        } finally {
            _fetching = false;
        }
    }

    // ── CSS ────────────────────────────────────────────────────────────────

    function injectCSS() {
        if (document.getElementById(STYLE_ID)) return;
        var s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = [
            // Hide the Vue page-title heading — our table has its own header
            '.time-use-report .page-title { display: none !important; }',
            // Screen
            '.dn-tc-wrap { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; padding: 24px 0 48px; }',
            '.dn-tc-bar { display: flex; justify-content: flex-end; margin-bottom: 20px; }',
            '.dn-tc-header { margin-bottom: 28px; }',
            '.dn-tc-title { font-size: 2.2rem; font-weight: 600; margin: 0 0 6px; color: #111; }',
            '.dn-tc-range { font-size: 0.9rem; color: #777; margin-bottom: 10px; }',
            '.dn-tc-totline { font-size: 1rem; color: #333; }',
            '.dn-tc-tot { font-size: 2.4rem; font-weight: 700; color: #111; vertical-align: middle; }',
            '.dn-tc-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; margin-top: 12px; }',
            '.dn-tc-table thead th { text-align: left; padding: 8px 16px; color: #999; font-weight: 400; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #e0e0e0; }',
            '.dn-tc-table tbody tr { border-bottom: 1px solid #f0f0f0; }',
            '.dn-tc-table td { padding: 14px 16px; vertical-align: top; }',
            '.dn-tc-col-date { color: #555; white-space: nowrap; width: 110px; }',
            '.dn-tc-task { font-weight: 500; color: #1a1a2e; line-height: 1.4; }',
            '.dn-tc-project { color: #888; font-size: 0.82rem; margin-top: 3px; }',
            '.dn-tc-col-dur { min-width: 185px !important; width: 185px !important; }',
            '.dn-tc-dur-val { font-weight: 500; color: #1a1a2e; white-space: nowrap !important; word-break: keep-all !important; overflow-wrap: normal !important; }',
            '.dn-tc-dur-range { color: #888; font-size: 0.82rem; margin-top: 3px; white-space: nowrap !important; word-break: keep-all !important; overflow-wrap: normal !important; }',
            '.dn-tc-col-user { color: #555; white-space: nowrap; }',
            '.dn-tc-empty, .dn-tc-loading { color: #999; padding: 24px 0; }',
            '.dn-tc-warning { color: #b45309; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 4px; padding: 10px 14px; font-size: 0.85rem; margin-bottom: 16px; }',
            // Print
            '@media print {',
            '  .navbar, .at-menu.navbar, #qc-bar-wrapper, .controls-row, .dn-tc-bar, #' + APPLY_BTN_ID + ' { display: none !important; }',
            '  #' + CONTAINER_ID + ' { padding: 0; }',
            '  .dn-tc-wrap { padding: 0; }',
            '  .dn-tc-title { font-size: 22pt; }',
            '  .dn-tc-tot { font-size: 20pt; }',
            '  .dn-tc-table { font-size: 9pt; }',
            '  .dn-tc-table thead th { font-size: 7pt; padding: 6px 10px; border-bottom: 1.5px solid #ccc; }',
            '  .dn-tc-table td { padding: 10px; }',
            '  .dn-tc-table tbody tr { border-bottom: 1px solid #e0e0e0; page-break-inside: avoid; }',
            '  body { font-size: 10pt; color: #000; }',
            '}',
            // Edit button in table
            '.dn-tc-col-action { width: 40px; text-align: center; padding: 14px 8px; }',
            '.dn-tc-edit-btn { background: none; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; padding: 4px 8px; font-size: 0.95rem; color: #666; line-height: 1; }',
            '.dn-tc-edit-btn:hover { background: #f5f5f5; border-color: #aaa; color: #222; }',
            // Edit modal
            '.dn-edit-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 9999; display: flex; align-items: center; justify-content: center; }',
            '.dn-edit-modal { background: #fff; border-radius: 8px; padding: 28px 32px; width: 380px; max-width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.18); }',
            '.dn-edit-title { font-size: 1.15rem; font-weight: 600; color: #111; margin-bottom: 6px; }',
            '.dn-edit-subtitle { font-size: 0.87rem; color: #777; margin-bottom: 20px; }',
            '.dn-edit-label { display: block; font-size: 0.85rem; color: #555; margin-bottom: 14px; font-weight: 500; }',
            '.dn-edit-input { display: block; width: 100%; margin-top: 5px; padding: 7px 10px; border: 1px solid #d0d0d0; border-radius: 4px; font-size: 0.92rem; box-sizing: border-box; font-weight: 400; }',
            '.dn-edit-tz { font-size: 0.78rem; color: #aaa; margin-bottom: 16px; }',
            '.dn-edit-error { color: #dc2626; font-size: 0.85rem; margin-bottom: 14px; padding: 8px 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; }',
            '.dn-edit-actions { display: flex; gap: 10px; justify-content: flex-end; }',
        ].join('\n');
        document.head.appendChild(s);
    }

    // ── User filter dropdown cleanup ───────────────────────────────────────

    function cleanupUserDropdown() {
        // The dropdown is portaled to body — find any open at-select dropdown and
        // strip out UI we don't need: Active/Inactive tabs and the role filter select.
        var dropdowns = document.querySelectorAll('.at-select__dropdown');
        for (var i = 0; i < dropdowns.length; i++) {
            var d = dropdowns[i];

            // Hide Active / Inactive tab labels
            var candidates = d.querySelectorAll('div, span, li');
            for (var j = 0; j < candidates.length; j++) {
                var el = candidates[j];
                var t = el.textContent.trim();
                if (el.childElementCount === 0 && (t === 'Inactive' || t === 'Active')) {
                    var target = el.parentNode && el.parentNode.getAttribute('role') === 'tab'
                        ? el.parentNode : el;
                    target.style.display = 'none';
                }
            }

            // Hide the role filter dropdown (All / Employee / Client)
            var innerSelects = d.querySelectorAll('.at-select');
            for (var k = 0; k < innerSelects.length; k++) {
                innerSelects[k].style.display = 'none';
            }

            // Inject Apply button at the bottom of the dropdown (admin only)
            if (isAdmin() && !d.querySelector('#' + APPLY_BTN_ID)) {
                var btn = document.createElement('button');
                btn.id = APPLY_BTN_ID;
                btn.className = 'at-btn at-btn--primary at-btn--small';
                btn.textContent = 'Apply';
                btn.style.cssText = 'width: calc(100% - 16px); margin: 8px; display: block;';
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (_fetching) return;
                    // Close the dropdown FIRST so Vue commits the new selection
                    // to userIDs, then read it after the next event-loop tick.
                    document.body.click();
                    setTimeout(function () {
                        currentStart = null;
                        renderTimecard();
                    }, 100);
                });
                d.appendChild(btn);
            }
        }
    }

    // ── DOM wiring ─────────────────────────────────────────────────────────

    function injectContainer() {
        if (document.getElementById(CONTAINER_ID)) return;

        // Hide the native Cattr aggregated accordion
        var native = document.querySelector('.time-use-report .at-container');
        if (native) native.style.display = 'none';

        var page = document.querySelector('.time-use-report');
        if (!page) return;

        var div = document.createElement('div');
        div.id = CONTAINER_ID;
        page.appendChild(div);

        // Container was just created or re-created (Vue re-rendered the page after
        // auth state loaded on reload) — reset dates so tick() triggers a fresh fetch.
        currentStart = null;
        currentEnd   = null;
    }

    function cleanup() {
        closeEditModal();
        _fetching      = false;
        currentStart   = null;
        currentEnd     = null;
        currentUserIds = null;
        _jspdfQueue  = []; // discard any queued exports — page navigated away
        var c = document.getElementById(CONTAINER_ID);
        if (c) c.parentNode.removeChild(c);
        var native = document.querySelector('.time-use-report .at-container');
        if (native) native.style.display = '';
    }

    // ── tick ───────────────────────────────────────────────────────────────

    function tick() {
        if (!isOnTimecardPage()) {
            cleanup();
            return;
        }

        injectCSS();
        injectContainer();
        cleanupUserDropdown();

        if (_fetching) return; // already mid-fetch — do nothing

        var dates = getSessionDates();
        if (!dates.start || !dates.end) return;

        var userIds    = isAdmin()
            ? getSelectedUserIds()
            : (function () { var id = getCurrentUserId(); return id ? [id] : []; }());
        var userIdsKey = JSON.stringify(userIds.slice().sort());

        if (dates.start !== currentStart || dates.end !== currentEnd || userIdsKey !== currentUserIds) {
            renderTimecard();
        }
    }

    var observer = new MutationObserver(tick);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    } else {
        observer.observe(document.body, { childList: true, subtree: true });
    }
})();
