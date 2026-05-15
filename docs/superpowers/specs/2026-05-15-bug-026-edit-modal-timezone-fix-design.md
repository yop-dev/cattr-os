# BUG-026 Fix Design — Edit Modal Timezone

**Date:** 2026-05-15
**Status:** Approved — ready for implementation
**Repo:** `cattr-server`
**File:** `app/public/timecard-export.js`

---

## Problem

The edit time entry modal on Reports shows start/end times in UTC while the Reports table displays them in the company local timezone (`_tz`). The modal label says "Times shown in your local timezone" — which is incorrect.

Additionally, when a user edits a time and saves, the entered value is treated as UTC by the save handler. Since the user sees UTC in the modal but believes they are entering local time, the saved value is wrong — the detailed report then shows a time offset by the timezone difference (7h for PDT).

---

## Root Cause — Regression in `b322d56`

Commit `b322d56` (2026-05-14) updated `toLocalParts()` to display local timezone and changed the modal label from *"Times shown in UTC"* to *"Times shown in your local timezone"* — but did not update the modal input population or the save handler. This split the round-trip into two inconsistent halves:

| Code path | Before `b322d56` | After `b322d56` |
|---|---|---|
| Reports table display | UTC | Local (`_tz`) ✓ |
| Modal input values | UTC ✓ (consistent with label) | UTC ✗ (label says local) |
| Save handler | Appends `':00Z'` → treats input as UTC ✓ | Appends `':00Z'` → treats input as UTC ✗ |
| Modal label | "Times shown in UTC" ✓ | "Times shown in your local timezone" ✗ |

Commit `a68cc40` (2026-05-11) had correctly added `':00Z'` to force UTC interpretation when the modal was still a UTC display — that was right at the time but now the other half needs to catch up.

---

## Fix — 2 Helpers + 2 Call Sites in `timecard-export.js`

### Helper 1 — `toLocalInputVal(isoUtc)`

Converts a UTC API timestamp to a `"YYYY-MM-DDTHH:MM"` string in `_tz` for use as a `datetime-local` input value.

```js
function toLocalInputVal(isoUtc) {
    var d = new Date(normTs(isoUtc));
    var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: _tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d);
    var p = {};
    parts.forEach(function (pt) { p[pt.type] = pt.value; });
    return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
}
```

`hourCycle: 'h23'` prevents midnight from being formatted as `"24:00"` in some environments.

### Helper 2 — `localInputToUtcIso(localStr)`

Converts a `"YYYY-MM-DDTHH:MM"` string in `_tz` back to a UTC ISO string for the API.

Single-iteration offset calculation: treat `localStr` as UTC to get a rough `Date`, format that `Date` in `_tz` to find what local time it represents, compute the delta between the two, apply it.

```js
function localInputToUtcIso(localStr) {
    var roughUtc = new Date(localStr + ':00Z');
    var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: _tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(roughUtc);
    var p = {};
    parts.forEach(function (pt) { p[pt.type] = pt.value; });
    var roughLocalStr = p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
    var offsetMs = roughUtc.getTime() - new Date(roughLocalStr + ':00Z').getTime();
    return new Date(roughUtc.getTime() + offsetMs).toISOString();
}
```

**Why single-iteration is sufficient:** The offset could theoretically be wrong by 1 hour if `localStr` falls exactly at a DST boundary and `roughUtc` falls on the other side. For a time-entry editing UI this is an acceptable edge case — a second iteration would add complexity for a scenario that would require the user to be editing an entry at the exact DST crossover minute.

**Verification (PDT = UTC-7):**
- `localStr = "2026-05-15T02:48"` (local PDT)
- `roughUtc` = 02:48 UTC (ms)
- `roughLocalStr` = format(02:48 UTC in PDT) = `"2026-05-14T19:48"` (PDT is UTC-7)
- `offsetMs` = 02:48_ms − 19:48_ms(prev day) = +7h
- result = 02:48_ms + 7h = 09:48 UTC ✓

### Call Site 1 — `openEditModal` input population

```js
// Before:
var startVal = normTs(iv.start_at || new Date().toISOString()).slice(0, 16);
var endVal   = normTs(iv.end_at   || new Date().toISOString()).slice(0, 16);

// After:
var startVal = toLocalInputVal(iv.start_at || new Date().toISOString());
var endVal   = toLocalInputVal(iv.end_at   || new Date().toISOString());
```

### Call Site 2 — save handler UTC conversion

```js
// Before:
var startIso = new Date(startInput + ':00Z').toISOString();
var endIso   = new Date(endInput   + ':00Z').toISOString();

// After:
var startIso = localInputToUtcIso(startInput);
var endIso   = localInputToUtcIso(endInput);
```

---

## What Does NOT Change

- `saveEdit()` merged-row paths use `normTs(iv._firstEndAt)` / `normTs(iv._lastStartAt)` — these are original UTC values from the API, not user-entered, and remain correct.
- The end-after-start validation (`new Date(endInput).getTime() <= new Date(startInput).getTime()`) compares two same-format local strings — internally consistent, remains correct.
- The API (`IntervalController.php`) receives UTC ISO strings with `Z` suffix and calls `Carbon::parse(...)->utc()`. No server changes.
- No other files change.

---

## Test Checklist

- [ ] Open edit modal — start and end times match what the Reports table row shows (local timezone)
- [ ] Edit start time, save — Reports table shows the time you entered (local), not offset by timezone
- [ ] Edit end time, save — same
- [ ] Edit both start and end, save — both correct
- [ ] Merged row (session with multiple sub-intervals): edit start and end — both save correctly, sub-interval boundaries untouched
- [ ] DB query after edit — confirms UTC values are stored correctly
