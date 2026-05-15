(function () {
    'use strict';

    var CONTAINER_ID = 'sc-grouped-container';
    var MODAL_ID     = 'sc-grouped-modal';

    // ── State ──────────────────────────────────────────────────────────────
    var _fetching        = false;
    var currentDate      = null;
    var currentUserIds   = null;
    var currentProjectIds = null;
    var _allIntervals    = [];   // screenshot-bearing intervals for modal nav
    var _modalIdx        = 0;

    // ── Helpers ────────────────────────────────────────────────────────────
    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function getVm() {
        var el = document.getElementById('app');
        return el ? el.__vue__ : null;
    }

    function getCurrentUser() {
        var vm = getVm();
        var store = vm ? vm.$store : null;
        return store ? store.getters['user/user'] : null;
    }

    function getCompanyTimezone() {
        return window.__cattrTz || 'America/Los_Angeles';
    }

    function normTs(s) {
        s = String(s || '').replace(' ', 'T');
        if (!/Z|[+-]\d{2}:\d{2}$/.test(s)) s += 'Z';
        return s;
    }

    // ── Route detection ────────────────────────────────────────────────────
    function isOnScreenshots() {
        return window.location.pathname === '/screenshots';
    }

    // ── Native grid management ─────────────────────────────────────────────
    function hideNativeGrid() {
        // The screenshots page component root is .screenshots
        // Its direct children:
        //   h1.page-title      — keep (page header)
        //   div.controls-row   — keep (filter bar: Calendar, UserSelect, ProjectSelect, TimezonePicker)
        //   div.at-container   — hide (native thumbnail grid)
        //   div.screenshots__pagination — hide (native pagination)
        var page = document.querySelector('.screenshots');
        if (!page) return;
        var children = page.children;
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (child.id === CONTAINER_ID || child.id === MODAL_ID) continue;
            var cls = ' ' + (child.className || '') + ' ';
            if (cls.indexOf(' at-container ') === -1 && cls.indexOf(' screenshots__pagination ') === -1) continue;
            if (!child.dataset.scHidden) {
                child.dataset.scHidden = '1';
                child.style.display = 'none';
            }
        }
    }

    function showNativeGrid() {
        var hidden = document.querySelectorAll('[data-sc-hidden]');
        for (var i = 0; i < hidden.length; i++) {
            hidden[i].style.display = '';
            delete hidden[i].dataset.scHidden;
        }
    }

    // ── Container ──────────────────────────────────────────────────────────
    function injectContainer() {
        var existing = document.getElementById(CONTAINER_ID);
        if (existing) return existing;

        // Find a stable parent: the page's root element via Vue instance
        var parent = null;
        var vm = getVm();
        if (vm && vm.$route) {
            var matched = vm.$route.matched;
            for (var i = matched.length - 1; i >= 0; i--) {
                var inst = matched[i].instances && matched[i].instances.default;
                if (inst && inst.$el) { parent = inst.$el; break; }
            }
        }
        if (!parent) parent = document.querySelector('main, .at-layout__main, #app');
        if (!parent) return null;

        var div = document.createElement('div');
        div.id = CONTAINER_ID;
        parent.appendChild(div);

        // Reset state so next tick triggers a full re-fetch
        currentDate       = null;
        currentUserIds    = null;
        currentProjectIds = null;

        return div;
    }

    // ── Cleanup ────────────────────────────────────────────────────────────
    function revokeBlobUrls(root) {
        if (!root) return;
        var imgs = root.querySelectorAll('img[data-blob-url]');
        for (var i = 0; i < imgs.length; i++) {
            URL.revokeObjectURL(imgs[i].dataset.blobUrl);
        }
    }

    function cleanup() {
        showNativeGrid();
        var c = document.getElementById(CONTAINER_ID);
        if (c) { revokeBlobUrls(c); c.parentNode.removeChild(c); }
        var m = document.getElementById(MODAL_ID);
        if (m) { revokeBlobUrls(m); m.parentNode.removeChild(m); }
        currentDate       = null;
        currentUserIds    = null;
        currentProjectIds = null;
        _fetching         = false;
        _allIntervals     = [];
    }

    // ── CSS ────────────────────────────────────────────────────────────────
    function injectCSS() {
        if (document.getElementById('sc-styles')) return;
        var style = document.createElement('style');
        style.id = 'sc-styles';
        style.textContent = [
            '#' + CONTAINER_ID + ' { padding: 20px; }',
            '.sc-block { margin-bottom: 28px; }',
            '.sc-block__header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }',
            '.sc-block__label { font-size: 14px; font-weight: 600; color: #333; white-space: nowrap; }',
            '.sc-block__count { font-size: 12px; color: #aaa; white-space: nowrap; }',
            '.sc-block__rule { flex: 1; height: 1px; background: #e0e0e8; }',
            '.sc-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }',
            '.sc-card { background: #fff; border: 1px solid #e0e0e8; border-radius: 6px; overflow: hidden; cursor: pointer; transition: box-shadow .15s; }',
            '.sc-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,.12); }',
            '.sc-card--no-shot { opacity: 0.45; cursor: default; }',
            '.sc-card--no-shot:hover { box-shadow: none; }',
            '.sc-card__thumb { height: 80px; overflow: hidden; background: #f0f1f5; }',
            '.sc-card__thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }',
            '.sc-card__no-shot-label { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 11px; color: #bbb; }',
            '.sc-card__caption { padding: 5px 7px; }',
            '.sc-card__task { font-size: 11px; font-weight: 500; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
            '.sc-card__project { font-size: 10px; color: #2e2ef9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 13px; }',
            '.sc-card__time { font-size: 10px; color: #888; margin-top: 1px; }',
            '.sc-loading, .sc-empty, .sc-error { padding: 40px; text-align: center; color: #aaa; font-size: 14px; }',
            '.sc-error { color: #f56c6c; }',
            '.sc-warning { background: #fff8e6; border: 1px solid #f0c040; border-radius: 4px; padding: 8px 12px; font-size: 12px; color: #856404; margin-bottom: 16px; }',
            '#' + MODAL_ID + ' { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.7); z-index: 9999; align-items: center; justify-content: center; }',
            '.sc-modal__panel { background: #fff; border-radius: 8px; max-width: 1400px; width: 95%; display: flex; flex-direction: column; box-shadow: 0 16px 48px rgba(0,0,0,.3); }',
            '.sc-modal__header { padding: 14px 20px; border-bottom: 1px solid #eee; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }',
            '.sc-modal__task { font-weight: 600; color: #333; font-size: 15px; }',
            '.sc-modal__meta { font-size: 12px; color: #888; margin-top: 3px; }',
            '.sc-modal__close { background: none; border: none; font-size: 22px; color: #aaa; cursor: pointer; line-height: 1; padding: 0 4px; flex-shrink: 0; }',
            '.sc-modal__body { overflow: hidden; display: flex; align-items: center; justify-content: center; background: #f5f5f5; min-height: 180px; }',
            '.sc-modal__img { max-width: 100%; max-height: 85vh; object-fit: contain; display: block; }',
            '.sc-modal__footer { padding: 12px 20px; border-top: 1px solid #eee; display: flex; align-items: center; justify-content: space-between; gap: 8px; }',
            '.sc-modal__nav { display: flex; gap: 8px; }',
            '.sc-modal__footer-right { display: flex; align-items: center; gap: 10px; margin-left: auto; }',
            '.sc-modal__btn { background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 6px 14px; cursor: pointer; color: #555; font-size: 13px; }',
            '.sc-modal__btn:disabled { opacity: 0.4; cursor: not-allowed; }',
            '.sc-modal__delete { background: #fff; border: 1px solid #f56c6c; border-radius: 4px; padding: 6px 14px; cursor: pointer; color: #f56c6c; font-size: 13px; }',
            '.sc-modal__err { color: #f56c6c; font-size: 12px; }',
        ].join('\n');
        document.head.appendChild(style);
    }

    // ── API ────────────────────────────────────────────────────────────────
    function apiFetch(path, body) {
        return fetch(path, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('access_token'),
                'Accept':        'application/json',
                'X-Paginate':    'false'
            },
            body: JSON.stringify(body)
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    function fetchCurrentSession() {
        return apiFetch('/api/tracking/current', {})
            .then(function (d) { return (d && d.data) ? d.data : null; })
            .catch(function () { return null; });
    }

    function filterActiveSession(rows, activeSession, currentUserId) {
        if (!activeSession || !activeSession.start_at) return rows;
        var sessionStart = new Date(normTs(activeSession.start_at));
        return rows.filter(function (iv) {
            if (!iv.user || String(iv.user.id) !== String(currentUserId)) return true;
            if (!iv.task || String(iv.task.id) !== String(activeSession.task_id)) return true;
            return new Date(normTs(iv.start_at)) < sessionStart;
        });
    }

    // Fetch an image endpoint that requires Bearer auth; sets img.src to a blob URL.
    // Revokes the previous object URL if one was stored on img.dataset.blobUrl.
    // Optional onError callback fires when the fetch fails (e.g. 404 — no file on disk).
    function apiFetchImage(img, path, onError) {
        fetch(path, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('access_token') }
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.blob();
        }).then(function (blob) {
            if (blob.size < 100) throw new Error('empty blob');
            if (img.dataset.blobUrl) URL.revokeObjectURL(img.dataset.blobUrl);
            var url = URL.createObjectURL(blob);
            img.dataset.blobUrl = url;
            img.src = url;
        }).catch(function () {
            img.style.display = 'none';
            if (onError) onError();
        });
    }

    // ── Filter readers ─────────────────────────────────────────────────────
    function getSelectedDate() {
        var vm = getVm();
        var tz = getCompanyTimezone();
        if (vm && vm.$route) {
            var matched = vm.$route.matched;
            for (var i = matched.length - 1; i >= 0; i--) {
                var inst = matched[i].instances && matched[i].instances.default;
                if (!inst) continue;
                // Screenshots component stores the date as datepickerDateStart (Date object or ISO string)
                var d = inst.datepickerDateStart || inst.date || inst.selectedDate || inst.currentDate || inst.startDate;
                if (d) {
                    if (d instanceof Date) {
                        // AT-UI datepicker may store UTC midnight (new Date('YYYY-MM-DD')).
                        // Formatting UTC midnight with a UTC-offset timezone shifts the date back
                        // one day (e.g. May 13 00:00 UTC → May 12 in PDT). Use toISOString() to
                        // get the UTC date string, which is always correct regardless of storage.
                        return d.toISOString().slice(0, 10);
                    }
                    if (typeof d === 'string' && d.length >= 10) return d.slice(0, 10);
                }
            }
        }
        var picker = document.querySelector('.at-datepicker__input, input[class*="datepicker"]');
        if (picker && picker.value) {
            var parsed = new Date(picker.value);
            if (!isNaN(parsed)) return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(parsed);
        }
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    }

    function getSelectedUserIds() {
        var vm = getVm();
        if (!vm || !vm.$route) return [];
        var matched = vm.$route.matched;
        for (var i = matched.length - 1; i >= 0; i--) {
            var inst = matched[i].instances && matched[i].instances.default;
            if (inst && Array.isArray(inst.userIDs))  return inst.userIDs;
            if (inst && Array.isArray(inst.userIds))  return inst.userIds;
            if (inst && Array.isArray(inst.users))    return inst.users;
        }
        return [];
    }

    function getSelectedProjectIds() {
        var vm = getVm();
        if (!vm || !vm.$route) return [];
        var matched = vm.$route.matched;
        for (var i = matched.length - 1; i >= 0; i--) {
            var inst = matched[i].instances && matched[i].instances.default;
            // Screenshots component stores project IDs as projectsList
            if (inst && Array.isArray(inst.projectsList)) return inst.projectsList;
            if (inst && Array.isArray(inst.projectIDs))   return inst.projectIDs;
            if (inst && Array.isArray(inst.projectIds))   return inst.projectIds;
            if (inst && Array.isArray(inst.projects))     return inst.projects;
        }
        return [];
    }

    // ── Data fetch ─────────────────────────────────────────────────────────
    function fetchIntervals(dateStr, userIds, projectIds) {
        // Use UTC day boundaries (midnight to midnight) to match the Dashboard's
        // native date grouping. Local-timezone conversion shifts the window by the
        // UTC offset, causing late-night intervals (e.g. 11 PM PDT = 06:xx UTC next
        // day) to fall under the wrong date.
        var bounds = [dateStr + ' 00:00:00', dateStr + ' 23:59:59'];

        var where = { start_at: ['between', bounds] };
        if (userIds.length > 0) where.user_id = ['=', userIds];
        // project_id is not a column on time_intervals — filter client-side after fetch

        return apiFetch('/api/time-intervals/list', {
            with:    ['task', 'task.project', 'user'],
            where:   where,
            orderBy: ['start_at', 'asc'],
            perPage: 1000
        }).then(function (data) {
            if (!data || !Array.isArray(data.data)) throw new Error('Unexpected response shape');
            var rows = data.data;
            if (projectIds.length > 0) {
                rows = rows.filter(function (iv) {
                    return iv.task && iv.task.project && projectIds.indexOf(iv.task.project.id) !== -1;
                });
            }
            return rows;
        });
    }

    // ── Time / bucketing helpers ───────────────────────────────────────────
    function toLocalParts(utcStr, tz) {
        var d = new Date(normTs(utcStr));
        // 12-hour time string for display: "9:03 AM"
        var timeStr = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true
        }).format(d);

        // 24-hour hour digit for bucketing (Intl can return "24" for midnight — normalise)
        var h24raw = parseInt(
            new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(d),
            10
        );
        var hour24 = (h24raw === 24) ? 0 : h24raw; // some engines return '24' for midnight

        return { hour24: hour24, timeStr: timeStr };
    }

    function formatHourLabel(hour24) {
        function fmt12(h) {
            var ampm = h < 12 ? 'AM' : 'PM';
            var h12  = h % 12 || 12;
            return h12 + ':00 ' + ampm;
        }
        return fmt12(hour24) + ' – ' + fmt12((hour24 + 1) % 24);
    }

    // ── Grouping ───────────────────────────────────────────────────────────
    function groupByHour(intervals, tz) {
        var buckets = {};  // hour24 → [{interval, localParts}]
        var order   = [];

        intervals.forEach(function (iv) {
            var parts = toLocalParts(iv.end_at, tz);
            var h     = parts.hour24;
            if (!buckets[h]) { buckets[h] = []; order.push(h); }
            buckets[h].push({ interval: iv, localParts: parts });
        });

        order.sort(function (a, b) { return a - b; });
        return order.map(function (h) {
            var items = buckets[h].slice().sort(function (a, b) {
                return a.interval.start_at < b.interval.start_at ? -1 : 1;
            });
            return { hour24: h, items: items };
        });
    }

    // ── DOM builders ───────────────────────────────────────────────────────
    function buildThumbnailCard(iv, localParts) {
        var hasShot     = !!iv.has_screenshot;
        var taskName    = (iv.task && iv.task.task_name)                      || '—';
        var projectName = (iv.task && iv.task.project && iv.task.project.name) || '';

        var card = document.createElement('div');
        card.className         = 'sc-card' + (hasShot ? '' : ' sc-card--no-shot');
        card.dataset.intervalId = String(iv.id);

        var imgWrap = document.createElement('div');
        imgWrap.className = 'sc-card__thumb';

        if (hasShot) {
            var img = document.createElement('img');
            img.alt = taskName;
            imgWrap.appendChild(img);
            apiFetchImage(img, '/api/time-intervals/' + iv.id + '/thumb', function () {
                // File missing on disk despite has_screenshot=true — remove the card entirely.
                if (card.parentNode) card.parentNode.removeChild(card);
                _allIntervals = _allIntervals.filter(function (i) { return i.id !== iv.id; });
            });
            card.addEventListener('click', function () { openModal(iv.id); });
        } else {
            var placeholder = document.createElement('div');
            placeholder.className   = 'sc-card__no-shot-label';
            placeholder.textContent = 'No screenshot';
            imgWrap.appendChild(placeholder);
        }
        card.appendChild(imgWrap);

        var caption = document.createElement('div');
        caption.className = 'sc-card__caption';
        caption.innerHTML =
            '<div class="sc-card__task">'    + escapeHtml(taskName)    + '</div>' +
            '<div class="sc-card__project">' + escapeHtml(projectName) + '</div>' +
            '<div class="sc-card__time">'    + escapeHtml(localParts.timeStr) + '</div>';
        card.appendChild(caption);

        return card;
    }

    function buildHourBlock(hour24, items) {
        var shotCount = items.filter(function (i) { return i.interval.has_screenshot; }).length;

        var block  = document.createElement('div');
        block.className = 'sc-block';

        var header = document.createElement('div');
        header.className = 'sc-block__header';
        header.innerHTML =
            '<span class="sc-block__label">' + formatHourLabel(hour24) + '</span>' +
            '<span class="sc-block__count">' + shotCount + ' screenshot' + (shotCount !== 1 ? 's' : '') + '</span>' +
            '<div class="sc-block__rule"></div>';
        block.appendChild(header);

        var grid = document.createElement('div');
        grid.className = 'sc-grid';
        items.forEach(function (item) {
            grid.appendChild(buildThumbnailCard(item.interval, item.localParts));
        });
        block.appendChild(grid);

        return block;
    }

    // ── Render ─────────────────────────────────────────────────────────────
    function renderGroups(intervals) {
        var container = document.getElementById(CONTAINER_ID);
        if (!container) return;

        var tz     = getCompanyTimezone();
        var groups = groupByHour(intervals, tz);

        container.innerHTML = '';

        if (intervals.length >= 1000) {
            var warn = document.createElement('p');
            warn.className   = 'sc-warning';
            warn.textContent = 'Showing first 1000 intervals. Narrow the date range to see all.';
            container.appendChild(warn);
        }

        if (groups.length === 0) {
            var empty = document.createElement('p');
            empty.className   = 'sc-empty';
            empty.textContent = 'No screenshots found for this date.';
            container.appendChild(empty);
            return;
        }

        groups.forEach(function (group) {
            container.appendChild(buildHourBlock(group.hour24, group.items));
        });

        // Sweep: after thumbnails have had time to load, remove any cards whose
        // thumbnail fetch failed (img hidden or blob URL never set). This catches
        // intervals where has_screenshot=true from the API but the file is missing.
        setTimeout(function () {
            var c = document.getElementById(CONTAINER_ID);
            if (!c) return;
            c.querySelectorAll('.sc-card').forEach(function (card) {
                var img = card.querySelector('img');
                if (img && (!img.dataset.blobUrl || img.style.display === 'none')) {
                    var id = parseInt(card.dataset.intervalId, 10);
                    _allIntervals = _allIntervals.filter(function (i) { return i.id !== id; });
                    if (card.parentNode) card.parentNode.removeChild(card);
                }
            });
            // Remove any hour blocks that are now empty
            c.querySelectorAll('.sc-block').forEach(function (block) {
                if (!block.querySelector('.sc-card') && block.parentNode) {
                    block.parentNode.removeChild(block);
                }
            });
            if (!c.querySelector('.sc-block')) {
                var empty = document.createElement('p');
                empty.className   = 'sc-empty';
                empty.textContent = 'No screenshots found for this date.';
                c.appendChild(empty);
            }
        }, 3000);
    }

    // ── Render / Tick ──────────────────────────────────────────────────────
    function renderScreenshots() {
        if (_fetching) return;

        var dateStr    = getSelectedDate();
        var userIds    = getSelectedUserIds();
        var projectIds = getSelectedProjectIds();
        if (!dateStr) return;

        var dateKey = dateStr;
        var userKey = JSON.stringify((userIds    || []).slice().sort());
        var projKey = JSON.stringify((projectIds || []).slice().sort());

        if (dateKey === currentDate && userKey === currentUserIds && projKey === currentProjectIds) return;

        // Set ALL state before first DOM write (MutationObserver re-entrancy guard)
        _fetching         = true;
        currentDate       = dateKey;
        currentUserIds    = userKey;
        currentProjectIds = projKey;

        var container = injectContainer();
        if (!container) { _fetching = false; return; }
        container.innerHTML = '<p class="sc-loading">Loading…</p>';

        fetchIntervals(dateStr, userIds || [], projectIds || [])
            .then(function (rows) {
                return fetchCurrentSession().then(function (session) {
                    var user = getCurrentUser();
                    return filterActiveSession(rows, session, user ? user.id : null);
                });
            })
            .then(function (intervals) {
                _allIntervals = intervals.filter(function (iv) { return iv.has_screenshot; });
                renderGroups(_allIntervals);
            })
            .catch(function (e) {
                // Reset keys so the same selection retries on the next tick
                currentDate = currentUserIds = currentProjectIds = null;
                var c = document.getElementById(CONTAINER_ID);
                if (c) c.innerHTML = '<p class="sc-error">Failed to load screenshots: ' + escapeHtml(e.message) + '</p>';
            })
            .then(function () { _fetching = false; });
    }

    function tick() {
        if (!isOnScreenshots()) { cleanup(); return; }
        injectCSS();
        hideNativeGrid();
        injectContainer();
        renderScreenshots();
    }

    function init() {
        document.addEventListener('keydown', function (e) {
            var modal = document.getElementById(MODAL_ID);
            if (!modal || modal.style.display === 'none') return;
            if (e.key === 'Escape')      closeModal();
            if (e.key === 'ArrowLeft')   navigateModal(-1);
            if (e.key === 'ArrowRight')  navigateModal(1);
        });
        var observer = new MutationObserver(tick);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ── Modal ──────────────────────────────────────────────────────────────
    function buildModal() {
        if (document.getElementById(MODAL_ID)) return;
        var modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.innerHTML = [
            '<div class="sc-modal__panel">',
              '<div class="sc-modal__header">',
                '<div class="sc-modal__title-wrap">',
                  '<div class="sc-modal__task" id="sc-modal-task"></div>',
                  '<div class="sc-modal__meta"  id="sc-modal-meta"></div>',
                '</div>',
                '<button class="sc-modal__close" id="sc-modal-close">\xd7</button>',
              '</div>',
              '<div class="sc-modal__body">',
                '<img class="sc-modal__img" id="sc-modal-img" src="" alt="">',
              '</div>',
              '<div class="sc-modal__footer">',
                '<div class="sc-modal__nav">',
                  '<button class="sc-modal__btn" id="sc-modal-prev">‹ Prev</button>',
                  '<button class="sc-modal__btn" id="sc-modal-next">Next ›</button>',
                '</div>',
                '<div class="sc-modal__footer-right">',
                  '<span class="sc-modal__err" id="sc-modal-err"></span>',
                  '<button class="sc-modal__delete" id="sc-modal-delete">🗑 Delete interval</button>',
                '</div>',
              '</div>',
            '</div>'
        ].join('');
        document.body.appendChild(modal);

        modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
        document.getElementById('sc-modal-close').addEventListener('click', closeModal);
        document.getElementById('sc-modal-prev').addEventListener('click', function () { navigateModal(-1); });
        document.getElementById('sc-modal-next').addEventListener('click', function () { navigateModal(1);  });
        document.getElementById('sc-modal-delete').addEventListener('click', function () {
            var id = parseInt(modal.dataset.currentId, 10);
            if (id) deleteInterval(id);
        });
    }

    function renderModalContent(idx) {
        var iv = _allIntervals[idx];
        if (!iv) return;

        var modal = document.getElementById(MODAL_ID);
        modal.dataset.currentId = String(iv.id);

        var tz       = getCompanyTimezone();
        var startStr = toLocalParts(iv.start_at, tz).timeStr;
        var endStr   = toLocalParts(iv.end_at,   tz).timeStr;

        document.getElementById('sc-modal-task').textContent = (iv.task && iv.task.task_name) || '—';
        document.getElementById('sc-modal-meta').textContent = [
            iv.task && iv.task.project && iv.task.project.name,
            startStr + ' – ' + endStr,
            iv.user && iv.user.full_name
        ].filter(Boolean).join(' · ');

        var modalImg = document.getElementById('sc-modal-img');
        modalImg.src = '';
        apiFetchImage(modalImg, '/api/time-intervals/' + iv.id + '/screenshot');

        document.getElementById('sc-modal-prev').disabled = (idx <= 0);
        document.getElementById('sc-modal-next').disabled = (idx >= _allIntervals.length - 1);

        // Delete button: admin (0) or manager (1) only
        var user   = getCurrentUser();
        var roleId = user ? parseInt(user.role_id, 10) : -1;
        document.getElementById('sc-modal-delete').style.display = (roleId === 0 || roleId === 1) ? '' : 'none';

        // Clear any previous delete error
        var errEl = document.querySelector('#' + MODAL_ID + ' .sc-modal__err');
        if (errEl) errEl.textContent = '';
    }

    function updateBlockCount(block) {
        var cards   = block.querySelectorAll('.sc-card:not(.sc-card--no-shot)');
        var countEl = block.querySelector('.sc-block__count');
        if (countEl) {
            var n = cards.length;
            countEl.textContent = n + ' screenshot' + (n !== 1 ? 's' : '');
        }
        if (block.querySelectorAll('.sc-card').length === 0) {
            block.parentNode && block.parentNode.removeChild(block);
        }
    }

    function closeModal() {
        var modal = document.getElementById(MODAL_ID);
        if (modal) modal.style.display = 'none';
    }

    function navigateModal(delta) {
        var newIdx = Math.max(0, Math.min(_allIntervals.length - 1, _modalIdx + delta));
        if (newIdx === _modalIdx) return;
        _modalIdx = newIdx;
        renderModalContent(_modalIdx);
    }

    function openModal(intervalId) {
        buildModal();
        _modalIdx = -1;
        for (var i = 0; i < _allIntervals.length; i++) {
            if (_allIntervals[i].id === intervalId) { _modalIdx = i; break; }
        }
        if (_modalIdx < 0) return;
        renderModalContent(_modalIdx);
        document.getElementById(MODAL_ID).style.display = 'flex';
    }

    function deleteInterval(intervalId) {
        if (!window.confirm('Delete this interval and its screenshot?')) return;

        var delBtn = document.getElementById('sc-modal-delete');
        var errEl  = document.getElementById('sc-modal-err');
        if (delBtn) { delBtn.disabled = true; delBtn.textContent = 'Deleting…'; }
        if (errEl)  { errEl.textContent = ''; }

        apiFetch('/api/time-intervals/remove', { intervals: [intervalId] })
            .then(function () {
                // Remove card from grid
                var card = document.querySelector('.sc-card[data-interval-id="' + intervalId + '"]');
                if (card) {
                    var block = card.closest ? card.closest('.sc-block') : card.parentNode.parentNode;
                    card.parentNode.removeChild(card);
                    if (block) updateBlockCount(block);
                }

                // Remove from _allIntervals
                _allIntervals = _allIntervals.filter(function (iv) { return iv.id !== intervalId; });

                if (_allIntervals.length === 0) {
                    closeModal();
                } else {
                    if (_modalIdx >= _allIntervals.length) _modalIdx = _allIntervals.length - 1;
                    renderModalContent(_modalIdx);
                }
            })
            .catch(function (e) {
                if (errEl) errEl.textContent = 'Delete failed: ' + e.message;
                if (delBtn) { delBtn.disabled = false; delBtn.textContent = '🗑 Delete interval'; }
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
