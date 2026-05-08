# C-017 — Screenshots Page: Grouped View Design

**Date:** 2026-05-08  
**Status:** Approved  
**Implementation:** New file `app/public/screenshots-grouped.js`, injected via `app.blade.php` + `Dockerfile`

---

## What We're Building

Replace the native Cattr screenshots grid (flat, ungrouped thumbnails) with a Clockify-style view that groups screenshots into labeled hour blocks. The native filter controls (date, user, project, timezone) are kept and stay functional. Clicking a thumbnail opens a lightbox modal with the full image and a delete button for admins/managers.

---

## Architecture

Same pattern as `timecard-export.js`:

- Standalone IIFE (`screenshots-grouped.js`) injected into the app shell via `app.blade.php`
- `MutationObserver` on `document.body` detects route changes
- Activates only on `/screenshots`
- On activation: hides the native grid, injects custom container
- On deactivation (navigation away): removes container, restores native grid

No server-side changes. All data via existing API.

---

## Data Fetching

**Endpoint:** `POST /api/time-intervals/list`

**Request payload:**
```javascript
{
    with: ['task', 'task.project', 'user'],
    where: {
        start_at: ['between', [startOfDayUtc, endOfDayUtc]],
        // user_id filter added when users are selected: user_id: ['=', [1,2,...]]
        // project_id filter added when projects are selected: project_id: ['=', [1,2,...]]
    },
    orderBy: ['start_at', 'asc'],   // ascending — oldest first within each block
    perPage: 1000
}
```

**Auth:** Bearer token from `localStorage.access_token` (same as `timecard-export.js`).

**Timestamp normalization:** All API timestamps passed through `normTs()` before `new Date()` — same helper as `timecard-export.js` (replace space with `T`, append `Z` if no timezone marker).

**Thumbnail URL:** `/api/time-intervals/{id}/thumbnail` — used as `<img src>` directly. Only rendered for intervals where `has_screenshot === true`.

**Full screenshot URL:** `/api/time-intervals/{id}/screenshot` — loaded in lightbox `<img src>` on open.

**Delete:** `POST /api/time-intervals/remove` with `{ intervals: [id] }` — same endpoint as the existing trash button (confirmed working in C-001).

---

## Reading Native Filters

The native Cattr screenshots page (`ScreenshotsReport` Vue component) controls are read via the Vue instance. Use the same `vm.$route.matched` deepest-to-shallowest pattern as `timecard-export.js`:

| Filter | How to read |
|---|---|
| Selected date | Read the date shown in the native date picker via `vm.$route.matched[n].instances.default` — property name TBD during implementation (inspect `startDate` or similar). Fallback: parse from the displayed text in `.at-date-picker input` |
| Selected user IDs | `vm.$route.matched[n].instances.default.userIDs` (same as timecard-export.js) |
| Selected project IDs | `vm.$route.matched[n].instances.default.projectIDs` — inspect during implementation |
| Timezone | `window.__cattrTz` (already PHP-injected by `app.blade.php`) |

**Re-fetch triggers:** MutationObserver fires on every DOM change. Re-fetch only when the selected date or filter values actually change (track `currentDate`, `currentUserIds`, `currentProjectIds` state variables, same guard pattern as `timecard-export.js`).

---

## Grouping Logic

Group intervals into 1-hour buckets by their `start_at` timestamp (in company timezone):

```javascript
// bucket key = "HH:00" of start_at in company tz
// e.g. an interval at 9:47 AM goes into the "9:00 AM – 10:00 AM" bucket
var hour = localParts.hour;  // 0–23
var bucketKey = hour;        // integer, sort ascending
```

**Bucket label:** `"9:00 AM – 10:00 AM"` — formatted using `Intl.DateTimeFormat` with company timezone.

**Within each bucket:** intervals already sorted ascending from the API (`orderBy: start_at asc`) — no re-sort needed.

**Empty buckets:** not shown. Only hours that have at least one interval are rendered.

**Intervals without screenshot:** included in the grid at reduced opacity (0.45). No thumbnail image — show a placeholder div with "No screenshot" text. Still show task/project/time caption. Not clickable (no modal).

---

## UI Components

### Page Container

Injected below the native filter controls bar. The native `.crud__table` or equivalent grid wrapper is hidden via `display:none`.

### Hour Block

```
[9:00 AM – 10:00 AM]  6 screenshots  ————————————————
[ thumb ] [ thumb ] [ thumb ] [ thumb ] [ thumb ] [ thumb ]
```

- Header: bold time range label + screenshot count + horizontal rule to fill width
- Grid: CSS grid, `grid-template-columns: repeat(6, 1fr)`, gap 10px
- 6 columns matches native Cattr density (vs Clockify's 4)

### Thumbnail Card

```
┌─────────────────┐
│   <img> or      │
│   placeholder   │
├─────────────────┤
│ Task name       │  ← 11px, semibold, truncated
│ Project name    │  ← 10px, Cattr blue #2e2ef9, truncated
│ 9:03 AM         │  ← 10px, #888
└─────────────────┘
```

- White card, 1px `#e0e0e8` border, 6px radius
- Thumbnail image: `height: 80px`, `object-fit: cover`, `width: 100%`
- Hover: `box-shadow: 0 2px 8px rgba(0,0,0,.12)`, cursor pointer
- No-screenshot variant: same card, `opacity: 0.45`, placeholder div instead of `<img>`, not clickable

### Lightbox Modal

Triggered by clicking a screenshot-bearing thumbnail. Built as a custom overlay — no dependency on the native Cattr Vue modal.

**Structure:**
- Backdrop: `position:fixed`, full viewport, `rgba(0,0,0,0.7)`, click outside to close
- Modal panel: white, `max-width: 700px`, `border-radius: 8px`
- **Header:** task name (bold) + `project · date · start–end time · user full name` (secondary)
- **Body:** `<img>` loaded from `/api/time-intervals/{id}/screenshot`, max-height 70vh, object-fit contain
- **Footer:**
  - Left: Prev / Next buttons (navigate between screenshots in current filtered set)
  - Right: Delete button (visible only for admin role_id=0 and manager role_id=1) — styled with red border, calls `POST /api/time-intervals/remove`

**Delete flow:**
1. Click Delete
2. Confirm with `window.confirm('Delete this interval and its screenshot?')`
3. Call `POST /api/time-intervals/remove` with `{ intervals: [id] }`
4. On success: close modal, remove the card from the grid, update screenshot count in block header
5. On error: show inline error text in modal footer

**Keyboard:** `Escape` closes modal; `←` / `→` navigate Prev/Next.

---

## State Variables

```javascript
var _fetching = false;
var currentDate = null;       // date string, e.g. "2026-05-07"
var currentUserIds = null;    // JSON string of sorted IDs for comparison
var currentProjectIds = null; // JSON string of sorted IDs
var _allIntervals = [];       // full fetched set, used for modal Prev/Next navigation
```

Same MutationObserver re-entrancy guard pattern as `timecard-export.js`: set all state variables **before** any DOM write.

---

## Files Changed

| File | Change |
|---|---|
| `app/public/screenshots-grouped.js` | New file — all C-017 logic |
| `app/resources/views/app.blade.php` | Add `<script src="/screenshots-grouped.js?v=..."></script>` with filemtime cache-busting |
| `Dockerfile` | Add `COPY app/public/screenshots-grouped.js /app/public/screenshots-grouped.js` |

---

## Test Checklist

- [ ] Navigate to Screenshots → custom grouped view renders, native grid hidden
- [ ] Screenshots appear in hour blocks with correct labels (e.g. "9:00 AM – 10:00 AM")
- [ ] Within each block, screenshots in ascending time order (oldest first)
- [ ] Thumbnail shows task name, project name (blue), timestamp
- [ ] Intervals with no screenshot shown dimmed, not clickable
- [ ] Change date → view re-fetches and re-renders
- [ ] Filter by user → only that user's screenshots shown
- [ ] Click thumbnail → lightbox opens with full image, header info, Prev/Next, Delete
- [ ] Prev/Next navigates through full filtered screenshot set
- [ ] Delete → confirm dialog → interval removed → card disappears, count updates
- [ ] Delete button visible for admin and manager, not visible for employee/auditor
- [ ] Escape closes modal; ← / → navigate
- [ ] Navigate away and back → view re-renders cleanly (no stale state)
- [ ] Screenshot timestamps display in correct company timezone (not UTC)
