(function () {
    'use strict';

    var BAR_ID = 'qc-bar-wrapper';

    // ─── State ───────────────────────────────────────────────────────────────
    var projects        = [];
    var tasks           = [];
    var selectedTask    = null;   // {id, name, projectId, projectName, projectColor} | null
    var isCreateMode    = false;  // true when typing a new task name (not selecting existing)
    var selectedProject = null;   // {id, name, color, isNew} | null  — used in create mode
    var filterText      = '';
    var docListenerAttached = false;
    var defaultPriorityId  = null;
    var defaultStatusId    = null;

    // Running-state tracking
    var isRunning       = false;
    var session         = null;   // last session from server: {task_id, task_name, project_name, start_at, owner}
    var displayTimer    = null;   // setInterval handle for counting timer
    var pollTimer       = null;   // setInterval handle for polling
    var _pollDestroyed  = false;
    var _docClickHandler = null;

    // Desktop heartbeat detection
    var _desktopRunning    = null;  // null=unknown, true=running, false=not running
    var _desktopCheckTimer = null;

    // ─── Utilities ───────────────────────────────────────────────────────────
    function token() { return localStorage.getItem('access_token') || ''; }

    function isOnDashboard() {
        var p = window.location.pathname;
        return p === '/dashboard' || p === '/dashboard/timeline' || p === '/timeline';
    }

    function apiFetch(url, opts) {
        opts = opts || {};
        opts.headers = opts.headers || {};
        opts.headers['Authorization'] = 'Bearer ' + token();
        opts.headers['Content-Type']  = 'application/json';
        opts.headers['Accept']        = 'application/json';
        return fetch(url, opts);
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function safeColor(color) {
        return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(color)) ? color : '#4fa6e0';
    }

    function getCurrentUserId() {
        var el = document.getElementById('app');
        var vm = el && el.__vue__;
        var store = vm ? vm.$store : null;
        if (!store) return null;
        var user = store.getters['user/user'];
        return (user && user.id) ? user.id : null;
    }

    function formatTimer(totalSeconds) {
        var h = Math.floor(totalSeconds / 3600);
        var m = Math.floor((totalSeconds % 3600) / 60);
        var s = totalSeconds % 60;
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    // ─── Data Fetching ────────────────────────────────────────────────────────
    function fetchProjects() {
        return apiFetch('/api/projects/list')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var rows = (data && data.data) ? data.data : [];
                projects = rows.map(function(p) {
                    return { id: p.id, name: p.name, color: p.color || '#4fa6e0' };
                });
            })
            .catch(function() { projects = []; });
    }

    function fetchTasks() {
        var userId = getCurrentUserId();
        var body = { where: { active: 1 } };
        if (userId) body.where['users.id'] = ['=', [userId]];
        return apiFetch('/api/tasks/list', { method: 'POST', body: JSON.stringify(body) })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var rows = (data && data.data) ? data.data : [];
                var projectMap = {};
                projects.forEach(function(p) { projectMap[String(p.id)] = p; });
                tasks = rows.map(function(t) {
                    var proj = projectMap[String(t.project_id)] || null;
                    return {
                        id:           t.id,
                        name:         t.task_name,
                        projectId:    t.project_id,
                        projectName:  proj ? proj.name  : '',
                        projectColor: proj ? safeColor(proj.color) : '#4fa6e0',
                    };
                });
                // If the input is focused while tasks were loading, refresh the dropdown now
                var input = document.getElementById('qc-task-input');
                if (!isRunning && input && document.activeElement === input) {
                    renderSuggestions(input.value);
                }
            })
            .catch(function() { tasks = []; });
    }

    function fetchDefaults() {
        var pFetch = apiFetch('/api/priorities/list')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var rows = (data && data.data) ? data.data : [];
                var normal = rows.filter(function(x) { return x.name && x.name.toLowerCase() === 'normal'; })[0];
                defaultPriorityId = normal ? normal.id : (rows[0] ? rows[0].id : null);
            }).catch(function() {});
        var sFetch = apiFetch('/api/statuses/list')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var rows = (data && data.data) ? data.data : [];
                var open = rows.filter(function(x) { return x.name && x.name.toLowerCase() === 'open'; })[0];
                defaultStatusId = open ? open.id : (rows[0] ? rows[0].id : null);
            }).catch(function() {});
        return Promise.all([pFetch, sFetch]);
    }

    function fetchCurrentSession() {
        return apiFetch('/api/tracking/current', { method: 'POST', body: '{}' })
            .then(function(r) { return r.json(); })
            .then(function(data) { return (data && data.data) ? data.data : null; })
            .catch(function() { return null; });
    }

    // ─── Task Suggestions Dropdown ────────────────────────────────────────────
    function renderSuggestions(query) {
        var dropdown = document.getElementById('qc-suggestions');
        var wrapper  = document.getElementById('qc-suggestions-wrapper');
        if (!dropdown || !wrapper) return;

        var q = query.toLowerCase().trim();
        var matched = q
            ? tasks.filter(function(t) { return t.name.toLowerCase().indexOf(q) !== -1; })
            : tasks.slice(0, 8);

        var html = '';
        matched.slice(0, 8).forEach(function(t) {
            html += '<div class="qc-task-item"'
                + ' data-id="' + escHtml(String(t.id)) + '"'
                + ' data-name="' + escHtml(t.name) + '"'
                + ' data-project-id="' + escHtml(String(t.projectId)) + '"'
                + ' data-project-name="' + escHtml(t.projectName) + '"'
                + ' data-project-color="' + escHtml(t.projectColor) + '"'
                + ' style="padding:8px 12px;display:flex;align-items:center;gap:8px;cursor:pointer;">'
                + '<span style="font-size:13px;color:#222;flex:1;">' + escHtml(t.name) + '</span>'
                + '<span style="font-size:11px;color:#888;">' + escHtml(t.projectName) + '</span>'
                + '</div>';
        });

        var trimmedQuery = query.trim();
        var exactMatch = tasks.some(function(t) { return t.name.toLowerCase() === q; });
        if (trimmedQuery.length > 0 && !exactMatch) {
            html += '<div class="qc-create-task-item"'
                + ' data-name="' + escHtml(trimmedQuery) + '"'
                + ' style="padding:8px 12px;border-top:1px solid #f0f0f0;cursor:pointer;background:#f0f5ff;">'
                + '<span style="font-size:13px;color:#2d6ae0;font-weight:600;">+ Create new task &ldquo;' + escHtml(trimmedQuery) + '&rdquo;</span>'
                + '</div>';
        }

        if (!html) {
            html = '<div style="padding:8px 12px;font-size:12px;color:#bbb;font-style:italic;">No tasks yet — start typing to create one</div>';
        }

        dropdown.innerHTML = html;
        wrapper.style.display = 'block';

        dropdown.querySelectorAll('.qc-task-item').forEach(function(item) {
            item.addEventListener('mouseenter', function() { item.style.background = '#f5f8ff'; });
            item.addEventListener('mouseleave', function() { item.style.background = ''; });
            item.addEventListener('click', function(e) {
                e.stopPropagation();
                selectExistingTask({
                    id:           Number(item.dataset.id),
                    name:         item.dataset.name,
                    projectId:    Number(item.dataset.projectId),
                    projectName:  item.dataset.projectName,
                    projectColor: item.dataset.projectColor,
                });
            });
        });

        var createItem = dropdown.querySelector('.qc-create-task-item');
        if (createItem) {
            createItem.addEventListener('mouseenter', function() { createItem.style.background = '#e8f0ff'; });
            createItem.addEventListener('mouseleave', function() { createItem.style.background = '#f0f5ff'; });
            createItem.addEventListener('click', function(e) {
                e.stopPropagation();
                enterCreateMode(createItem.dataset.name);
            });
        }
    }

    function closeSuggestions() {
        var wrapper = document.getElementById('qc-suggestions-wrapper');
        if (wrapper) wrapper.style.display = 'none';
    }

    function selectExistingTask(task) {
        selectedTask    = task;
        isCreateMode    = false;
        selectedProject = null;
        closeSuggestions();

        var input = document.getElementById('qc-task-input');
        if (input) input.value = task.name;

        showProjectDisplay(task.projectName, task.projectColor, true);
        updateActionButton();
    }

    function enterCreateMode(name) {
        selectedTask    = null;
        isCreateMode    = true;
        selectedProject = null;
        closeSuggestions();

        var input = document.getElementById('qc-task-input');
        if (input) input.value = name;

        showProjectDisplay('', '', false);
        updateActionButton();
    }

    // ─── Project Selector ────────────────────────────────────────────────────
    function projectItemHtml(p) {
        return '<div class="qc-project-item"'
            + ' data-id="' + escHtml(String(p.id)) + '"'
            + ' data-name="' + escHtml(p.name) + '"'
            + ' data-color="' + escHtml(p.color) + '"'
            + ' style="padding:8px 12px;display:flex;align-items:center;gap:8px;cursor:pointer;">'
            + '<span style="width:8px;height:8px;border-radius:50%;background:' + safeColor(p.color) + ';display:inline-block;flex-shrink:0;"></span>'
            + '<span style="font-size:13px;color:#222;">' + escHtml(p.name) + '</span>'
            + '</div>';
    }

    function renderProjectDropdown() {
        var dropdown = document.getElementById('qc-dropdown');
        if (!dropdown) return;
        var filter  = filterText.toLowerCase().trim();
        var matched = projects.filter(function(p) {
            return p.name.toLowerCase().indexOf(filter) !== -1;
        });
        var html = matched.map(projectItemHtml).join('');
        if (filter.length > 0) {
            html += '<div class="qc-create-item"'
                + ' data-name="' + escHtml(filterText.trim()) + '"'
                + ' style="padding:8px 12px;border-top:1px solid #f0f0f0;cursor:pointer;background:#f0f5ff;">'
                + '<span style="font-size:13px;color:#2d6ae0;font-weight:600;">+ Create &ldquo;' + escHtml(filterText.trim()) + '&rdquo;</span>'
                + '</div>';
        }
        if (!html) {
            html = '<div style="padding:8px 12px;font-size:12px;color:#bbb;font-style:italic;">No projects yet</div>';
        }
        dropdown.innerHTML = html;

        dropdown.querySelectorAll('.qc-project-item').forEach(function(item) {
            item.addEventListener('mouseenter', function() { item.style.background = '#f5f8ff'; });
            item.addEventListener('mouseleave', function() { item.style.background = ''; });
            item.addEventListener('click', function(e) {
                e.stopPropagation();
                selectProject({ id: item.dataset.id, name: item.dataset.name, color: item.dataset.color, isNew: false });
            });
        });
        var createItem = dropdown.querySelector('.qc-create-item');
        if (createItem) {
            createItem.addEventListener('mouseenter', function() { createItem.style.background = '#e8f0ff'; });
            createItem.addEventListener('mouseleave', function() { createItem.style.background = '#f0f5ff'; });
            createItem.addEventListener('click', function(e) {
                e.stopPropagation();
                selectProject({ id: null, name: createItem.dataset.name, isNew: true });
            });
        }
    }

    function openProjectDropdown() {
        var wrapper = document.getElementById('qc-dropdown-wrapper');
        var filterInput = document.getElementById('qc-filter-input');
        if (!wrapper) return;
        filterText = '';
        if (filterInput) filterInput.value = '';
        renderProjectDropdown();
        wrapper.style.display = 'block';
        if (filterInput) filterInput.focus();
    }

    function closeProjectDropdown() {
        var wrapper = document.getElementById('qc-dropdown-wrapper');
        if (wrapper) wrapper.style.display = 'none';
    }

    function selectProject(proj) {
        selectedProject = proj;
        filterText      = '';
        closeProjectDropdown();
        var label = document.getElementById('qc-project-label');
        var dot   = document.getElementById('qc-project-dot');
        var sel   = document.getElementById('qc-project-selector');
        if (label) { label.textContent = proj.name; label.style.color = '#222'; }
        if (dot)   { dot.style.background = proj.isNew ? '#bbb' : (proj.color || '#4fa6e0'); dot.style.display = 'inline-block'; }
        if (sel)   sel.style.borderColor = '#2d6ae0';
        updateActionButton();
    }

    function showProjectDisplay(name, color, readOnly) {
        var sel   = document.getElementById('qc-project-selector');
        var label = document.getElementById('qc-project-label');
        var dot   = document.getElementById('qc-project-dot');
        if (!sel) return;
        sel.style.display = name || !readOnly ? 'flex' : 'none';
        if (label) { label.textContent = name || 'Select project'; label.style.color = name ? '#222' : '#aaa'; }
        if (dot)   { dot.style.background = safeColor(color || '#d0d5dd'); dot.style.display = name ? 'inline-block' : 'none'; }
        sel.style.pointerEvents = readOnly ? 'none' : 'auto';
        sel.style.opacity       = readOnly ? '0.7' : '1';
    }

    // ─── Timer Display ────────────────────────────────────────────────────────
    function startTimerDisplay(startAt) {
        stopTimerDisplay();
        var startMs = new Date(startAt).getTime();
        function tick() {
            var el = document.getElementById('qc-timer');
            if (el) el.textContent = formatTimer(Math.floor((Date.now() - startMs) / 1000));
        }
        tick();
        displayTimer = setInterval(tick, 1000);
        var timerEl = document.getElementById('qc-timer');
        if (timerEl) timerEl.style.display = 'inline-block';
    }

    function stopTimerDisplay() {
        if (displayTimer) { clearInterval(displayTimer); displayTimer = null; }
        var timerEl = document.getElementById('qc-timer');
        if (timerEl) { timerEl.style.display = 'none'; timerEl.textContent = '00:00:00'; }
    }

    // ─── Desktop heartbeat check ──────────────────────────────────────────────
    function checkDesktopStatus() {
        apiFetch('/api/tracking/desktop-status', { method: 'POST', body: '{}' })
            .then(function(r) { return r.json(); })
            .then(function(d) {
                var running = !!(d && d.data && d.data.running);
                if (running === _desktopRunning) return; // no change — skip DOM update
                _desktopRunning = running;
                if (!isRunning) updateActionButton();
            })
            .catch(function() {}); // silent — don't block UI on network failure
    }

    function startDesktopCheck() {
        if (_desktopCheckTimer) return;
        checkDesktopStatus();
        _desktopCheckTimer = setInterval(checkDesktopStatus, 5000);
    }

    function stopDesktopCheck() {
        if (_desktopCheckTimer) { clearInterval(_desktopCheckTimer); _desktopCheckTimer = null; }
    }

    // ─── Polling ──────────────────────────────────────────────────────────────
    function startPolling() {
        if (pollTimer) return;
        pollTimer = setInterval(poll, 1000);
    }

    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    function poll() {
        fetchCurrentSession().then(function(srv) {
            if (_pollDestroyed) return;
            if (srv && !isRunning) {
                showRunningState(srv, false);
            } else if (!srv && isRunning) {
                showIdleState();
            } else if (srv && isRunning && session && srv.task_id !== session.task_id) {
                showRunningState(srv, false);
            }
        });
    }

    // ─── State Transitions ────────────────────────────────────────────────────
    function showRunningState(srv, loggedLocally) {
        isRunning = true;
        session   = srv;
        session._loggedLocally = !!loggedLocally;
        window.__cattrCurrentSession = session;

        var input = document.getElementById('qc-task-input');
        if (input) { input.value = srv.task_name; input.readOnly = true; input.style.color = '#222'; }

        showProjectDisplay(srv.project_name || '', '#4fa6e0', true);
        startTimerDisplay(srv.start_at);

        var btn = document.getElementById('qc-action-btn');
        if (btn) {
            btn.disabled    = false;
            btn.textContent = 'Stop';
            btn.style.background = '#e04f4f';
            btn.style.cursor     = 'pointer';
        }

        clearMessage();
    }

    function showIdleState() {
        isRunning = false;
        session   = null;
        window.__cattrCurrentSession = null;

        stopTimerDisplay();

        var input = document.getElementById('qc-task-input');
        if (input) { input.value = ''; input.readOnly = false; input.style.color = '#333'; }
        selectedTask    = null;
        isCreateMode    = false;
        selectedProject = null;

        var sel = document.getElementById('qc-project-selector');
        if (sel) sel.style.display = 'none';

        var btn = document.getElementById('qc-action-btn');
        if (btn) {
            btn.disabled    = true;
            btn.textContent = 'Start';
            btn.style.background = '#d0d5dd';
            btn.style.cursor     = 'not-allowed';
        }

        clearMessage();
        fetchTasks();
    }

    // ─── Action Button State ──────────────────────────────────────────────────
    function updateActionButton() {
        var btn = document.getElementById('qc-action-btn');
        if (!btn || isRunning) return;

        if (_desktopRunning === false) {
            btn.disabled         = true;
            btn.textContent      = 'Start';
            btn.style.background = '#d0d5dd';
            btn.style.cursor     = 'not-allowed';
            showWarning('Open the desktop app to start tracking');
            return;
        }

        clearMessage();
        var ready = false;
        if (selectedTask !== null) {
            ready = true;
            btn.textContent = 'Start';
        } else if (isCreateMode) {
            var input = document.getElementById('qc-task-input');
            var hasName = input && input.value.trim().length > 0;
            ready = hasName && selectedProject !== null;
            btn.textContent = 'Add & Start';
        }
        btn.disabled    = !ready;
        btn.style.background = ready ? '#2d6ae0' : '#d0d5dd';
        btn.style.cursor     = ready ? 'pointer' : 'not-allowed';
    }

    // ─── Messages ─────────────────────────────────────────────────────────────
    function clearMessage() {
        var msg = document.getElementById('qc-message');
        if (msg) msg.style.display = 'none';
    }

    function showError(text) {
        var msg = document.getElementById('qc-message');
        if (!msg) return;
        msg.style.display = 'flex'; msg.style.color = '#e04f4f';
        msg.textContent = text;
    }

    function showWarning(text) {
        var msg = document.getElementById('qc-message');
        if (!msg) return;
        msg.style.display = 'flex'; msg.style.color = '#b45309';
        msg.textContent = text;
    }

    function setLoading(loading) {
        var btn = document.getElementById('qc-action-btn');
        if (!btn) return;
        if (loading) {
            btn.disabled = true; btn.style.cursor = 'not-allowed'; btn.style.background = '#7fa8e8';
        } else {
            updateActionButton();
        }
    }

    // ─── Start Tracking ───────────────────────────────────────────────────────
    function doStart(taskId, taskName, projectName) {
        if (_desktopRunning === false) {
            showWarning('Open the desktop app to start tracking');
            return Promise.resolve();
        }
        var startAt = new Date().toISOString();
        return apiFetch('/api/tracking/start', {
            method: 'POST',
            body: JSON.stringify({ task_id: taskId, start_at: startAt, owner: 'web' }),
        }).then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data || !data.data) throw new Error('Server did not confirm start');
            showRunningState(data.data, true);
        });
    }

    function createProjectThenTask(projectName, taskName) {
        return apiFetch('/api/projects/create', {
            method: 'POST',
            body: JSON.stringify({ name: projectName, description: projectName, screenshots_state: -1 }),
        }).then(function(r) {
            if (!r.ok) throw new Error('Failed to create project');
            return r.json();
        }).then(function(data) {
            var newId = data && data.data && data.data.id;
            if (!newId) throw new Error('Failed to create project');
            fetchProjects();
            return createTask(newId, taskName);
        });
    }

    function createTask(projectId, taskName) {
        var userId = getCurrentUserId();
        var payload = {
            task_name:   taskName,
            project_id:  Number(projectId),
            priority_id: defaultPriorityId,
            status_id:   defaultStatusId,
            description: null,
        };
        if (userId) payload.users = [userId];
        return apiFetch('/api/tasks/create', { method: 'POST', body: JSON.stringify(payload) })
            .then(function(r) {
                if (r.status === 403) throw new Error('No permission to create tasks in this project');
                if (!r.ok) throw new Error('Failed to create task');
                return r.json();
            }).then(function(data) {
                var task = data && data.data;
                if (!task) throw new Error('Failed to create task');
                tasks.push({ id: task.id, name: task.task_name, projectId: task.project_id, projectName: '', projectColor: '#4fa6e0' });
                return task.id;
            });
    }

    function handleStart() {
        clearMessage();
        setLoading(true);

        var promise;

        if (selectedTask !== null) {
            promise = doStart(selectedTask.id, selectedTask.name, selectedTask.projectName);

        } else if (isCreateMode) {
            var input    = document.getElementById('qc-task-input');
            var taskName = input ? input.value.trim() : '';
            var proj     = selectedProject;

            if (proj.isNew) {
                promise = createProjectThenTask(proj.name, taskName)
                    .then(function(taskId) { return doStart(taskId, taskName, proj.name); });
            } else {
                promise = createTask(proj.id, taskName)
                    .then(function(taskId) { return doStart(taskId, taskName, proj.name); });
            }
        } else {
            setLoading(false);
            return;
        }

        promise.catch(function(err) {
            showError(err.message || 'Error starting tracker');
        }).finally(function() {
            setLoading(false);
        });
    }

    // ─── Stop Tracking ────────────────────────────────────────────────────────
    function handleStop() {
        if (!isRunning || !session) return;
        clearMessage();
        setLoading(true);

        var stopAt  = new Date().toISOString();
        var taskId  = session.task_id;
        var startAt = session.start_at;

        // Desktop owns all interval logging (gap + periodic + tail).
        // Web stop only signals the server to clear the session cache.
        apiFetch('/api/tracking/stop', { method: 'POST', body: '{}' }).then(function() {
            showIdleState();
        }).catch(function() {
            showError('Error stopping tracker');
        }).finally(function() {
            setLoading(false);
        });
    }

    // ─── Render ───────────────────────────────────────────────────────────────
    function render() {
        if (document.getElementById(BAR_ID)) return;

        var target = document.querySelector('.content-wrapper');
        if (!target) return;

        var wrapper = document.createElement('div');
        wrapper.id = BAR_ID;
        wrapper.style.cssText = [
            'background:#fff',
            'border-bottom:2px solid #e8f4fd',
            'padding:10px 20px',
            'display:flex',
            'align-items:center',
            'gap:10px',
            'box-shadow:0 2px 6px rgba(0,0,0,0.06)',
            'margin-bottom:20px',
            'position:relative',
            'z-index:100',
        ].join(';');

        wrapper.innerHTML = [
            // Task input + suggestions
            '<div style="flex:1;position:relative;">',
            '  <input id="qc-task-input" type="text" placeholder="What are you working on?" maxlength="255"',
            '    style="width:100%;border:1px solid #d0d5dd;border-radius:6px;padding:9px 14px;font-size:14px;outline:none;color:#333;box-sizing:border-box;" />',
            '  <div id="qc-suggestions-wrapper"',
            '    style="display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:100%;',
            '           background:#fff;border:1px solid #d0d5dd;border-radius:8px;',
            '           box-shadow:0 6px 16px rgba(0,0,0,0.12);z-index:9999;overflow:hidden;">',
            '    <div id="qc-suggestions"></div>',
            '  </div>',
            '</div>',

            // Project selector (hidden until task selected or create mode)
            '<div id="qc-project-selector"',
            '  style="display:none;position:relative;align-items:center;gap:6px;border:1px solid #d0d5dd;',
            '         border-radius:6px;min-width:180px;background:#fff;cursor:pointer;">',
            '  <div id="qc-selector-face" style="display:flex;align-items:center;gap:6px;padding:9px 14px;width:100%;">',
            '    <span id="qc-project-dot" style="width:8px;height:8px;border-radius:50%;background:#d0d5dd;flex-shrink:0;display:none;"></span>',
            '    <span id="qc-project-label" style="font-size:13px;color:#aaa;flex:1;">Select project</span>',
            '    <span style="color:#aaa;font-size:11px;">&#9660;</span>',
            '  </div>',
            '  <div id="qc-dropdown-wrapper"',
            '    style="display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:220px;',
            '           background:#fff;border:1px solid #d0d5dd;border-radius:8px;',
            '           box-shadow:0 6px 16px rgba(0,0,0,0.12);z-index:9999;overflow:hidden;">',
            '    <div style="padding:6px 10px;border-bottom:1px solid #f0f0f0;">',
            '      <input id="qc-filter-input" type="text" placeholder="Type to filter…" maxlength="255"',
            '        style="width:100%;border:none;outline:none;font-size:13px;color:#222;box-sizing:border-box;" />',
            '    </div>',
            '    <div id="qc-dropdown"></div>',
            '  </div>',
            '</div>',

            // Timer (hidden when idle)
            '<span id="qc-timer"',
            '  style="display:none;font-variant-numeric:tabular-nums;font-size:15px;font-weight:600;',
            '         color:#222;min-width:72px;text-align:center;">00:00:00</span>',

            // Start / Stop button
            '<button id="qc-action-btn" disabled',
            '  style="background:#d0d5dd;color:#fff;border:none;border-radius:6px;padding:9px 22px;',
            '         font-size:14px;font-weight:600;cursor:not-allowed;white-space:nowrap;">',
            '  Start',
            '</button>',

            // Message area
            '<div id="qc-message" style="display:none;font-size:13px;font-weight:500;white-space:nowrap;"></div>',
        ].join('');

        target.insertBefore(wrapper, target.firstChild);

        // ── Wire events ──────────────────────────────────────────────────────

        var taskInput = wrapper.querySelector('#qc-task-input');
        taskInput.addEventListener('click', function(e) {
            e.stopPropagation(); // prevent document click from closing suggestions
        });
        taskInput.addEventListener('focus', function() {
            taskInput.style.borderColor = '#2d6ae0';
            if (!isRunning) renderSuggestions(taskInput.value);
        });
        taskInput.addEventListener('blur',  function() {
            if (!taskInput.value.trim()) taskInput.style.borderColor = '#d0d5dd';
            setTimeout(closeSuggestions, 150);
        });
        taskInput.addEventListener('input', function() {
            if (isRunning) return;
            selectedTask    = null;
            isCreateMode    = false;
            selectedProject = null;
            var sel = document.getElementById('qc-project-selector');
            if (sel) sel.style.display = 'none';
            updateActionButton();
            renderSuggestions(taskInput.value);
        });
        taskInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !isRunning) {
                var btn = document.getElementById('qc-action-btn');
                if (btn && !btn.disabled) btn.click();
            }
            if (e.key === 'Escape') closeSuggestions();
        });

        var selectorFace = wrapper.querySelector('#qc-selector-face');
        selectorFace.addEventListener('click', function(e) {
            e.stopPropagation();
            if (isRunning) return;
            var dw = document.getElementById('qc-dropdown-wrapper');
            if (dw && dw.style.display !== 'none') {
                closeProjectDropdown();
            } else {
                openProjectDropdown();
            }
        });
        selectorFace.addEventListener('mouseenter', function() { if (!isRunning) selectorFace.style.background = '#f5f8ff'; });
        selectorFace.addEventListener('mouseleave', function() { selectorFace.style.background = ''; });

        var filterInput = wrapper.querySelector('#qc-filter-input');
        filterInput.addEventListener('input', function() {
            filterText = filterInput.value;
            renderProjectDropdown();
        });
        filterInput.addEventListener('click', function(e) { e.stopPropagation(); });
        filterInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                var ci = document.querySelector('#qc-dropdown .qc-create-item');
                if (ci) ci.click();
            }
            if (e.key === 'Escape') closeProjectDropdown();
        });

        var actionBtn = wrapper.querySelector('#qc-action-btn');
        actionBtn.addEventListener('click', function() {
            if (isRunning) handleStop();
            else           handleStart();
        });

        if (!docListenerAttached) {
            _docClickHandler = function() {
                closeSuggestions();
                closeProjectDropdown();
            };
            document.addEventListener('click', _docClickHandler);
            docListenerAttached = true;
        }

        // ── Initial data + state ─────────────────────────────────────────────
        Promise.all([fetchProjects(), fetchDefaults()])
            .then(function() { return fetchTasks(); })
            .then(function() { return fetchCurrentSession(); })
            .then(function(srv) {
                if (srv) showRunningState(srv, false);
                else     showIdleState();
            });

        _pollDestroyed = false;
        startPolling();
        startDesktopCheck();

    }

    // ─── SPA Route Handling ───────────────────────────────────────────────────
    function cleanup() {
        _pollDestroyed = true;
        stopPolling();
        stopDesktopCheck();
        stopTimerDisplay();
        if (docListenerAttached) {
            if (_docClickHandler) {
                document.removeEventListener('click', _docClickHandler);
                _docClickHandler = null;
            }
            docListenerAttached = false;
        }
        isRunning       = false;
        session         = null;
        selectedTask    = null;
        isCreateMode    = false;
        selectedProject = null;
    }

    function onMutation() {
        if (isOnDashboard()) {
            render();
        } else {
            var existing = document.getElementById(BAR_ID);
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
            cleanup();
        }
    }

    function init() {
        onMutation();
        var observer = new MutationObserver(onMutation);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
