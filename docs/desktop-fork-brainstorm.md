# Desktop App Fork — Brainstorm Findings

**Status:** ⏳ Waiting for team go-signal — 2026-05-07
**Goal:** Fork the Cattr Electron desktop app to add task/project creation and bidirectional web ↔ desktop timer sync with screenshot capture.

---

## What We Want to Build

### Feature 1 — Task/Project Creation in Desktop App

Employees and admins can create tasks and projects directly from the desktop app without switching to the browser. Mirrors the quick-create experience we built in C-009/C-012 on the web.

- `+` button inside the task selector opens an Element UI modal
- Fields: task name + project dropdown (same as web quick-create)
- Calls existing `/api/tasks/create` and `/api/projects/create` — no server changes needed
- New task appears in the selector immediately after creation

### Feature 2 — Web ↔ Desktop Timer Sync

User can start/stop the timer from either the website or the desktop app, and both stay in sync. Screenshot capture always follows the desktop app — it starts capturing when a timer is active (regardless of where it was started) and stops when the timer stops.

**Bidirectional:**
- Start on web → desktop detects it → begins screenshot capture
- Stop on web → desktop detects it → stops screenshot capture
- Start on desktop → web shows timer running
- Stop on desktop → web shows timer stopped

**Desktop must be open:** screenshots only happen when the desktop app is running. If the user tries to start a timer on the web and the desktop isn't open, a warning banner appears: *"Open the desktop app to enable screenshot capture."* The user can dismiss and start anyway (timer runs, no screenshots) or cancel.

---

## Agreed Architecture

### Source of Truth
The server's active interval record. Neither client stores sync state — both clients reflect what the server says.

### Sync Mechanism — Polling (chosen over WebSockets and local HTTP)
Both web and desktop poll the server every 3–5 seconds for the current active interval. Whoever starts or stops writes to the server; the other client picks it up on the next poll. Lag is 3–5 seconds — imperceptible for a time tracker. Requires zero server changes beyond what already exists.

**Why not WebSockets:** would require implementing broadcast logic on the server (non-trivial). The benefit (instant sync vs 3–5s) is invisible to users.

**Why not local HTTP server in desktop:** browsers block cross-origin localhost calls; fragile if port is in use.

### Heartbeat — "Is Desktop Open?"
- Desktop app sends `POST /api/desktop/heartbeat` every 30 seconds while running
- Server stores `{user_id, last_seen}` in Laravel cache (TTL: 60 seconds)
- Before the web starts a timer, it checks `GET /api/desktop/heartbeat/status`
- If last heartbeat > 60 seconds old → show warning banner
- User can dismiss warning and start anyway, or cancel

### Web Timer UI
New `timer-sync.js` IIFE injected into `app.blade.php` alongside existing scripts. Renders a Start/Stop timer bar on the dashboard (near the quick-create bar). Shows current task and elapsed time when a timer is active.

### Desktop Changes
- Add polling loop (every 4s) that compares server's active interval with local tracking state
- If server shows active interval and desktop isn't capturing → start capture for that interval
- If server shows no interval and desktop is capturing → stop capture
- Add heartbeat `setInterval` (every 30s)
- Add task/project creation modal to task selector

---

## Technical Stack (Desktop App)

| | |
|---|---|
| **Repo** | [cattr-app/desktop-application](https://github.com/cattr-app/desktop-application) (GitHub mirror of GitLab) |
| **Framework** | Vue 2.7 + Vuex + Vue Router |
| **UI library** | Element UI 2.15 |
| **Electron** | v14.2.9 |
| **Build tool** | Webpack via Laravel Mix + Electron Builder |
| **Core tracking** | `@cattr/node` ^4.0.0-RC5 |
| **Local DB** | SQLite via Sequelize |

Same Vue version as the web app — familiar territory.

---

## Implementation Order

Build as two independent specs in sequence:

| Order | Spec | Why first |
|---|---|---|
| 1 | Desktop task/project creation | Self-contained, no server changes, low risk. Validates the fork + build + distribution pipeline. |
| 2 | Web timer + desktop sync + heartbeat | More complex. Depends on the fork being set up from Spec 1. |

---

## Distribution Plan

- Fork `cattr-app/desktop-application` on GitHub under `yop-dev`
- Modify and build `.exe` (Windows) + `.dmg` (Mac) using Electron Builder
- Distribute via Google Drive for initial rollout
- Windows SmartScreen will show "Windows protected your PC" warning — users click **More info → Run anyway**
- Auto-update (Electron's built-in updater pointing at DigitalOcean Spaces) is a future option if updates become frequent

---

## Open Questions Before Implementation

- [ ] Confirm the API endpoint for current active interval (used by desktop app today for polling)
- [ ] Confirm whether `@cattr/node` exposes a method to start/stop capture for an externally-created interval (vs one the user started in the app)
- [ ] Decide: should the web timer be a full persistent bar (always visible when on dashboard) or a minimal button that expands when active?
- [ ] Confirm: does the team want employees to be able to use the web timer, or admin/manager only?
