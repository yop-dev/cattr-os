# Evaluation Scoring Sheet

**Date started:** 2026-03-23
**Evaluator:** Windows machine (local Docker)

---

## Score Anchors (global)

| Score | Meaning |
|---|---|
| 1 | Does not meet the requirement / broken |
| 3 | Meets the requirement with noticeable friction or limitations |
| 5 | Meets the requirement fully, works well, no significant issues |

---

## Screenshot Functionality (35% weight)

> NOTE: Mac cannot be live-tested on the evaluation machine. Cattr max score is 3/5 (Mac doc-confirmed only). Ever Gauzy uses a cross-platform Electron desktop agent and may score higher if Mac is confirmed working.

| Item | Cattr | Kimai | Ever Gauzy | EmpMonitor |
|---|---|---|---|---|
| Screenshots captured on Windows | ✅ Yes | N/A | ⏳ Pending | ⛔ Not tested — login not reachable |
| Dual monitor support | ✅ Yes — both screens captured | N/A | ⏳ Pending | ⛔ Not tested |
| 5-min interval works | ✅ Yes (default) | N/A | ⏳ Pending | ⛔ Not tested |
| Manager can view screenshots | ✅ Yes — visible immediately after session ends | N/A | ⏳ Pending | ⛔ Not tested |
| Mac agent available and recently updated | ⏳ Pending — v3.0.0-RC13 exists (Dec 2024), not live-tested | N/A | ⏳ Pending — Electron, v97.0.4 (2026-03-23) | ⛔ Dropped |
| **Score** | **3/5** (max 3 — Mac not live-tested) | **1/5 (fixed — no native support)** | ⏳ Pending | **⛔ Dropped** |

---

## Reporting Quality (30% weight)

| Item | Cattr | Kimai | Ever Gauzy | EmpMonitor |
|---|---|---|---|---|
| Per-user timesheet visible | ✅ Yes | ⏳ Pending | ⏳ Pending | ⏳ Pending |
| Per-project breakdown visible | ✅ Yes | ⏳ Pending | ⏳ Pending | ⏳ Pending |
| Date range filter | ✅ Yes | ⏳ Pending | ⏳ Pending | ⏳ Pending |
| CSV export works | ✅ Yes | ⏳ Pending | ⏳ Pending | ⏳ Pending |
| PDF export works | ✅ Yes | ⏳ Pending | ⏳ Pending | ⏳ Pending |
| Additional export formats | ✅ XLSX, XLS, ODS, HTML | ⏳ Pending | ⏳ Pending | ⏳ Pending |
| **Score** | **5/5** | ⏳ Pending | ⏳ Pending | ⏳ Pending |

---

## User UX (20% weight)

| Item | Cattr | Kimai | Ever Gauzy | EmpMonitor |
|---|---|---|---|---|
| Clicks to start a timer | Project → Task → Start (3 steps) | ⏳ Pending | ⏳ Pending | ⏳ Pending |
| Project assignment easy | ✅ Yes via admin panel | ⏳ Pending | ⏳ Pending | ⏳ Pending |
| Task creation required before tracking | ⚠️ Yes — extra setup step | ⏳ Pending | ⏳ Pending | ⏳ Pending |
| User management friction | ⚠️ Invite flow requires SMTP; workaround is CLI-only | ⏳ Pending | ⏳ Pending | ⏳ Pending |
| Admin/company settings missing from nav | ⚠️ No nav link — requires knowing direct URL `/company/general` | ⏳ Pending | ⏳ Pending | ⏳ Pending |
| Manual time entry — task search requires typing | ⚠️ Must type 3+ chars; can't browse tasks | ⏳ Pending | ⏳ Pending | ⏳ Pending |
| Web UI login breaks after logout | ✅ Fixed — see docs/bugs.md BUG-001 | ⏳ Pending | ⏳ Pending | ⏳ Pending |
| Platform complexity for 10-user team | ✅ Focused time-tracking tool | ⏳ Pending | ⚠️ Full ERP/HRM — risk of overkill for small team | ⏳ Pending |
| **Score** | **3/5** | ⏳ Pending | ⏳ Pending | ⏳ Pending |

---

## Maintenance / Ops (15% weight)

| Item | Cattr | Kimai | Ever Gauzy | EmpMonitor |
|---|---|---|---|---|
| Docker compose started cleanly | ⚠️ First-start race condition — required `docker compose restart app` | ⏳ Pending | ✅ Yes — clean first start, no manual intervention | ⚠️ No official Docker Compose — custom compose file required |
| Time to running | ~2 minutes | ⏳ Pending | ~2 minutes (API ready in 1m 8s after migrations) | ⏳ Pending |
| Number of containers | 2 (app + db) | ⏳ Pending | 13 running + 1 init (exits after bucket creation) | ⏳ Pending — 4 Node.js microservices + MySQL + MongoDB + Redis + frontend |
| Image source | `registry.git.amazingcat.net` (not Docker Hub) | ⏳ Pending | `ghcr.io/ever-co/` (GitHub Container Registry) | No pre-built images — must build from source |
| Update process documented | ⏳ Pending — not yet checked | ⏳ Pending | ⏳ Pending | ⏳ Pending |
| Data export available | ✅ Multiple formats | ⏳ Pending | CSV only (ZIP archive) | ⏳ Pending |
| SMTP required for user invites | ⚠️ Yes — not configured out of box | ⏳ Pending | ⏳ Pending — to be confirmed during testing | ⏳ Pending |
| Optional heavy dependencies | None required | ⏳ Pending | ⚠️ Full stack required (OpenSearch, Redis, MinIO, Cube, Jitsu) | ⚠️ MySQL + MongoDB + Redis all required |
| **Score** | **3/5** | ⏳ Pending | ⏳ Pending | ⏳ Pending |

---

## Weighted Totals

**Cattr:** (3 × 0.35) + (5 × 0.30) + (3 × 0.20) + (3 × 0.15) = 1.05 + 1.50 + 0.60 + 0.45 = **3.60**

**Kimai:** ⏳ Pending

**Ever Gauzy:** ⏳ Pending

**EmpMonitor:** ⛔ Dropped — ops cost disqualifies; 13 startup fixes, missing committed files, no self-registration, login unreachable without manual DB intervention. Maintenance/ops: 1/5. No full score calculated.

---

## Pending Tests

- [ ] Mac desktop agent — live test required before VPS deployment
- [ ] Kimai — full evaluation (reporting, UX, ops)
- [ ] Ever Gauzy — full evaluation (setup, screenshots, reporting, UX, ops)
- [x] EmpMonitor — ⛔ Dropped 2026-03-25 (see emp-monitor-findings.md)
- [ ] Cattr update/upgrade process
- [ ] SMTP configuration for production invite flow
- [ ] Multi-user concurrent session test

---

## Decision

⏳ Pending — Kimai and Ever Gauzy evaluations not yet complete.

**Cattr current score: 3.60 / 5.00** — passes the 3.0 threshold. Web UI login bug resolved.
