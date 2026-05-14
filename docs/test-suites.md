# Cattr Test Suites

Manual test checklists for all pending bugs and customisations.

---

## BUG-011 — Desktop timer anchors to server `start_at`

*Requires rebuilt desktop app. Fixes in: `web-sync.js`, `task-tracking.js`, `store.js`, `User.vue`, `Tracker.vue`.*

**Findings (2026-05-14):** Task switching while running was unreliable → removed (see BUG-017). Blank thumbnails observed → logged as BUG-018 (connected to BUG-014).

| # | Steps | Expected | Pass? |
|---|---|---|---|
| 1 | Web: start a task. Wait 30+ seconds. Check desktop tracker card. | Card shows elapsed time matching the web bar (within ~2s) — NOT a small value like `00:00:05`. | |
| 2 | Web: stop. Wait 10s. Web: start the same task again. Check desktop within 2s. | Desktop timer shows correct elapsed time from when web restarted, not from zero. | |
| 3 | Desktop: click ▶ on a task directly (no web involvement). | Timer starts from `00:00:00`. Web bar reflects the start within 2s. | |

---

## BUG-013 — Full duration recorded for web-started sessions stopped from desktop

*Requires rebuilt desktop app. Fix in: `web-sync.js` (gap catch-up, mutex, skip-on-failure).*

*After each test: check Reports → Timecard Export for the task to verify intervals.*

| # | Steps | Expected | Pass? |
|---|---|---|---|
| 1 | Web: start a task. Wait **3+ minutes** without touching the desktop. Desktop: click stop. Check Reports. | 2–3 intervals totaling close to full elapsed time. First interval covers web-start → desktop-detection gap (≥30s). No duplicates, no unsynced entries. | |
| 2 | Web: start a task. Wait 5 minutes. Web: stop (not desktop). Check Reports. | 2–3 intervals from desktop covering the full duration (gap + periodic + tail). Web logs nothing. No double-counting. Total time ≈ actual duration. | |
| 3 | Desktop: start a task. Wait 3 minutes. Desktop: stop. Check Reports. | Interval logged by desktop normally. Web bar reflected the session and cleared on stop. | |
| 4 | Web: start a task. Simulate network loss for ~60s (disable WiFi). Reconnect. Wait 2 more minutes. Desktop: stop. Check Reports. | No duplicate/cascading intervals from the outage. Total time is reasonable. | |

---

## BUG-017 — Hide all play buttons while tracking (task switching removed)

*Requires rebuilt desktop app. Fix in: `Task.vue` (`v-if="!isAnyTracking"`).*

| # | Steps | Expected | Pass? |
|---|---|---|---|
| 1 | Start a task from the desktop. Look at all other task rows. | No ▶ play button visible on any row while the session is running. | |
| 2 | Stop the task via the Tracker card red stop button. | Play buttons reappear on all task rows. | |
| 3 | Start a task from the web. Check desktop task list. | No ▶ play buttons visible on any row while web session is active. | |
| 4 | Stop from the web. | Play buttons reappear on desktop task list. | |

---

## BUG-014 — Blank card for stop interval (investigation first, then fix)

*Run investigation steps before any code change.*

| # | Steps | Expected | Pass? |
|---|---|---|---|
| 1 | Web: start a task. Wait ~5 minutes. Desktop: stop. Navigate to Screenshots page. | Note how many cards appear. The extra short-duration card is the one under investigation. | |
| 2 | DevTools: inspect the blank/extra card element. Find its interval ID (look for `data-interval-id` or similar attribute). | Interval ID noted. | |
| 3 | Terminal: `docker exec cattr-server-app-1 sh -c "find /app/storage/app/public/screenshots/thumbs -name '*.jpg'"` | Lists all thumb files on disk. | |
| 4 | Compute sha256 of the interval ID and check if its thumb exists: `docker exec cattr-server-app-1 sh -c "echo -n '<id>' \| sha256sum"` then match against listing. | **File exists + >0 bytes** → screenshot is real → fix by filtering intervals <60s duration. **File missing or 0 bytes** → fix `has_screenshot` accessor server-side. | |
| 5 | Curl the thumb endpoint: `curl -H "Authorization: Bearer <token>" http://localhost/api/time-intervals/<id>/thumb -o /tmp/thumb.jpg && ls -la /tmp/thumb.jpg` | 404 or 0 bytes → `apiFetchImage` should suppress the card (current fix broken). 200 + valid JPEG → screenshot genuinely exists. | |

---

## BUG-015 — Screenshots page: project filter has no effect

*Fixed 2026-05-14. Client-side filter in `screenshots-grouped.js` — no rebuild required.*

| # | Steps | Expected | Pass? |
|---|---|---|---|
| 1 | Navigate to Screenshots page. Select a project from the project filter. | Only screenshot cards for tasks belonging to that project appear. | ✅ |
| 2 | Clear the project filter (no project selected). | All screenshots visible — no cards hidden. | ✅ |
| 3 | Select two different projects sequentially. | Each time, only cards for the selected project's tasks appear. | |

---

## BUG-016 — Screenshots timestamps display in UTC (intentional)

*Decision 2026-05-14: UTC everywhere to match Dashboard timeline. No further investigation needed.*

| # | Steps | Expected | Pass? |
|---|---|---|---|
| 1 | Navigate to Screenshots page. Note a screenshot timestamp. | Timestamp is in UTC (e.g. 3:00 AM for a screenshot captured at 8 PM PDT the night before). | ✅ |
| 2 | Check the same screenshot event on the Dashboard timeline (green intervals). | Dashboard shows the same UTC time. | ✅ |
| 3 | Timezone picker — confirm it is hidden on the Screenshots page. | No timezone dropdown visible anywhere on the page. | ✅ |

---

## BUG-020 — EAUTH502 rate limiting on tracking routes

*Fixed 2026-05-14. `throttle:600,1` in `api.php` — requires Docker rebuild.*

| # | Steps | Expected | Pass? |
|---|---|---|---|
| 1 | Open browser DevTools Network tab. Start a task from the web bar. Leave it running for 5+ minutes. | No 429 responses on `/api/tracking/current` or any other tracking endpoint. | ✅ |
| 2 | Start a task from desktop. Web bar picks it up. Leave running 5+ minutes. Check desktop logs. | No EAUTH502 errors in desktop app console. | ✅ |
| 3 | During an active session, navigate between pages (triggering other API calls). | No 429 spike from mixed traffic. | |

---

## Timezone selector — hidden globally

*Fixed 2026-05-14. CSS rule in `app.blade.php`.*

| # | Steps | Expected | Pass? |
|---|---|---|---|
| 1 | Navigate to Reports page. | No timezone picker visible anywhere in the filter controls row. | ✅ |
| 2 | Navigate to Screenshots page. | No timezone picker visible. | ✅ |
| 3 | Navigate to Dashboard. | No timezone picker visible. | ✅ |