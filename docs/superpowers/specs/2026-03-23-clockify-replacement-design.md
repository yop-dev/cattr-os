# Clockify Replacement — Evaluation Design

**Date:** 2026-03-23
**Status:** Draft
**Goal:** Select and validate an open-source, self-hosted replacement for Clockify for a 10-user team.

---

## Requirements

| Requirement | Detail |
|---|---|
| Users | ~10, single company, one team |
| Hosting | Self-hosted VPS (production), local Docker (evaluation) |
| Screenshot capture | Recurring, for monitoring/accountability, Windows + Mac clients |
| User reporting | Easy for users to log time (start/stop timer) |
| Manager reporting | Per-user and per-project timesheets, CSV/PDF export |

**Note on Mac:** The evaluator only has a Windows machine. Mac screenshot capability cannot be live-tested during evaluation. Mac support will be verified via official docs and GitHub issues. If Mac support cannot be confirmed before VPS deployment, a live Mac test is required as a pre-deployment gate — the winner does not go to production until Mac is confirmed working.

---

## Decision: Approach A — Focused Evaluation (Cattr vs Kimai)

### Why not test all 7 candidates?

Most candidates (Titra, SolidTime, TimeScribe, Invoice Ninja, Super Productivity) are web-only with no native screenshot capability. Testing them would be wasted effort given that screenshot capture is a non-negotiable requirement.

If neither Cattr nor Kimai scores above 3.0, the fallback broader evaluation adds the next two most viable tools: **SolidTime** (most actively maintained, clean Docker support) and **Invoice Ninja** (if invoicing is ever needed). The same rubric and process applies.

### Why Cattr?

Cattr is the only tool on the shortlist with:
- Native cross-platform desktop agents (Windows + Mac)
- Built-in recurring screenshot capture
- Self-hosted Docker support

### Why Kimai as the comparison?

Kimai is the most mature open-source time tracker for teams. It lacks native screenshot support (automatic score of 1/5 on that category — see rubric below), but it sets the benchmark for reporting quality and admin UX. If Cattr's reporting matches Kimai's, the decision is straightforward.

---

## Evaluation Environment

Both stacks run **locally on Windows** via Docker Desktop. No VPS involvement until a production winner is chosen.

```
Windows Machine (local)
├── stack-cattr/    → localhost:8080
│   └── Cattr backend + PostgreSQL + Redis
│       + Cattr desktop agent (installed on Windows)
└── stack-kimai/    → localhost:8081
    └── Kimai + MariaDB
```

---

## Scoring Rubric

Each category scored 1–5. Anchor definitions:

| Score | Meaning |
|---|---|
| 1 | Does not meet the requirement / broken |
| 3 | Meets the requirement with noticeable friction or limitations |
| 5 | Meets the requirement fully, works well, no significant issues |

| Category | Weight | Score anchors |
|---|---|---|
| Screenshot functionality | 35% | 1 = no screenshots; 3 = screenshots work on Windows, Mac doc-confirmed only; 5 = screenshots work on Windows + Mac live-tested, configurable interval, manager can view |
| Reporting quality | 30% | 1 = no useful reports; 3 = basic per-user timesheet, limited export; 5 = per-user + per-project reports, CSV + PDF export, clear manager dashboard |
| User UX | 20% | 1 = confusing or slow to log time; 3 = functional but requires multiple steps; 5 = start/stop timer in one click, project assignment easy |
| Maintenance / ops | 15% | 1 = Docker setup broken or undocumented; 3 = works with manual fixes, update path unclear; 5 = clean docker compose, documented update process, data easily exportable |

**Kimai screenshot score is fixed at 1/5** (no native screenshot support — hard gap).

**Minimum passing score:** 3.0 weighted average. If neither tool passes, proceed to the fallback broader evaluation (SolidTime + Invoice Ninja).

---

## Evaluation Phases

### Phase 1 — Spin up (Day 1)
- Run `docker compose up` for both stacks
- Create 1 manager account + 2 test user accounts on each
- Install Cattr desktop agent on Windows
- **Gate:** both stacks must be accessible before Phase 2/3 begin. If one stack fails to start, debug before proceeding — do not score a broken setup.

### Phase 2 — Screenshot testing on Cattr (Day 1–2)
- Configure screenshot interval: test 5 min and 10 min
- Verify screenshots appear in manager dashboard
- Assess image quality and storage path
- Verify Mac agent availability via Cattr docs/GitHub
- **Phase 2 and Phase 3 can run in parallel on Day 2** once both stacks are up. If only one stack is up, test that stack only; do not wait to start the other.

### Phase 3 — Reporting test on both tools (Day 2–3)
- Log time as a regular user on both tools (start/stop timer, assign to project)
- Pull per-user timesheet report as manager
- Export to CSV and/or PDF
- Score ease-of-use for both user roles

### Phase 4 — Score and decide (Day 3–5)
- Complete scoring rubric for both tools
- Write ADR (fill in the template below)
- **If a clear winner (score ≥ 3.0):** proceed to VPS production deployment design
- **If scores are close (within 0.3 weighted points):** run a short 3-day live usage pilot with 2 real users before deciding
- **If neither passes 3.0:** add SolidTime and Invoice Ninja to the evaluation and repeat from Phase 1

---

## Open Questions for VPS Production Deployment

_(To be resolved before starting production deployment design)_

- What OS is the VPS running?
- What are the VPS resource specs (RAM, CPU, disk)?
- Which reverse proxy is preferred (Nginx, Caddy, Traefik)?
- Is a domain/subdomain already available (e.g., `time.yourcompany.com`)?
- What is the backup strategy (frequency, destination)?
- Who is responsible for ongoing maintenance and updates?

---

## ADR — Architecture Decision Record

_To be completed after evaluation._

**Decision:** [Winner: Cattr / Kimai / Neither]

**Context:** 10-user team replacing Clockify. Must support recurring screenshots for accountability on Windows and Mac, easy time logging for users, and manager-level reporting.

**Options considered:**
1. Cattr — native screenshot support, cross-platform desktop agents, less mature reporting
2. Kimai — mature reporting and admin UX, no native screenshot support (hard gap, fixed score 1/5)
3. Broader evaluation — SolidTime + Invoice Ninja (fallback if neither Cattr nor Kimai passes)

**Scores:**

| Tool | Screenshots (35%) | Reporting (30%) | User UX (20%) | Ops (15%) | Weighted Total |
|---|---|---|---|---|---|
| Cattr | /5 | /5 | /5 | /5 | |
| Kimai | 1/5 (fixed) | /5 | /5 | /5 | |

**Decision rationale:** [Fill in after evaluation]

**Consequences:** [Fill in after evaluation]

---

## Next Step

Once a winner is selected and the ADR is complete: resolve the open VPS questions above, then design production deployment (Docker, reverse proxy, backups, update strategy).
