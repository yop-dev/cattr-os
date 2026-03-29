# Decision Log — Clockify Replacement Project

This file documents key decisions made during planning and evaluation, and the reasoning behind each.

---

## D-001 — Evaluate Cattr and Kimai only (not all 7 candidates)

**Date:** 2026-03-23
**Status:** Decided

**Decision:** Limit the initial evaluation to two tools: Cattr and Kimai. The other 5 candidates (Titra, SolidTime, TimeScribe, Invoice Ninja, Super Productivity) are excluded from the first round.

**Reason:** The requirement for recurring screenshot capture with cross-platform desktop clients (Windows + Mac) is non-negotiable. Of all 7 candidates, only **Cattr** natively supports this. The other tools are web-only — they have no desktop agent and no screenshot capability. Testing them would require a workaround (e.g., third-party screenshot tools), adding complexity without a clear benefit.

**Kimai** is included as a comparison point because it is the most mature open-source time tracker for teams and sets the benchmark for reporting quality and admin UX. If Cattr's reporting is weak, we need to know how large the gap is before committing.

**Fallback:** If neither tool scores ≥ 3.0 on the weighted rubric, a second evaluation round adds SolidTime and Invoice Ninja using the same process.

---

## D-002 — Evaluate locally on Docker (not on VPS)

**Date:** 2026-03-23
**Status:** Decided

**Decision:** Both Docker stacks run on the evaluator's local Windows machine during testing. The VPS is not used until a winner is confirmed.

**Reason:** Deploying to the VPS before a tool is selected wastes setup effort and risks leaving an unused service running on production infrastructure. Local Docker evaluation is faster, disposable, and has no impact on production.

---

## D-003 — Screenshot score capped at 3/5 during evaluation

**Date:** 2026-03-23
**Status:** Decided

**Decision:** The maximum achievable score for the Screenshot Functionality category (35% weight) is 3/5 during this evaluation, not 5/5.

**Reason:** The evaluator only has a Windows machine. Mac screenshot capability cannot be live-tested. The scoring rubric defines 5/5 as "Windows + Mac live-tested." Since Mac will only be doc-confirmed (checking GitHub releases and open issues), the ceiling is 3/5. A score of 5/5 would be misleading and could produce a false sense of confidence going into production where both Windows and Mac users need to be covered.

**Consequence:** Mac agent must be live-tested as a gate before the winning tool goes to VPS production deployment.

---

## D-004 — Kimai screenshot score fixed at 1/5

**Date:** 2026-03-23
**Status:** Decided

**Decision:** Kimai receives a fixed score of 1/5 on the Screenshot Functionality category regardless of any other factors.

**Reason:** Kimai has no native screenshot or desktop agent support. This is a hard gap against a non-negotiable requirement. No workaround (browser extension, third-party tool) is being credited in the score because any workaround introduces maintenance complexity and is not the same as a supported, integrated solution.

---

## D-005 — Weighted scoring rubric with Screenshot at 35%

**Date:** 2026-03-23
**Status:** Decided

**Decision:** Evaluation uses a weighted rubric: Screenshots 35%, Reporting 30%, User UX 20%, Ops/Maintenance 15%.

**Reason:** Screenshots are the primary reason we are not simply using Kimai — they carry the highest weight. Reporting is the second most important factor since managers need to pull timesheets reliably. User UX matters for adoption (10 users need to log time daily without friction). Ops/maintenance is the lowest weight because both tools use Docker and the team is willing to handle basic maintenance.

---

## D-007 — Kimai will still be evaluated for comparison

**Date:** 2026-03-23
**Status:** Decided

**Decision:** Kimai will be fully evaluated regardless of Cattr's results. Both tools will be scored and compared before a final decision is made.

**Reason:** Even though Cattr scores well, a side-by-side comparison with Kimai gives us confidence in the final choice and surfaces any gaps we may have missed. Kimai is the most mature open-source time tracker for teams and is worth understanding fully before committing to a VPS deployment.

---

## D-008 — User management requires SMTP in production

**Date:** 2026-03-23
**Status:** Decided

**Decision:** Cattr's built-in invite system requires SMTP to be configured before non-technical admins can create users. This must be part of the VPS production deployment setup.

**Reason:** Without SMTP, user creation requires CLI access to the server — not acceptable for day-to-day team management. A local workaround (artisan command + DB role update) works for testing but is not a viable production workflow.

**Consequence:** VPS deployment plan must include SMTP configuration (e.g. sending via Gmail, Mailgun, or a self-hosted mail relay).

---

## D-009 — Add Ever Gauzy as a third evaluation candidate

**Date:** 2026-03-24
**Status:** Decided

**Decision:** Expand the evaluation from two tools (Cattr, Kimai) to three by adding [Ever Gauzy](https://github.com/ever-co/ever-gauzy).

**Reason:** Ever Gauzy was identified after the initial evaluation plan was written. It meets the non-negotiable requirement: it has a native cross-platform desktop agent (Electron-based) with screenshot capture, and supports Windows and Mac. Unlike Cattr (a dedicated time tracker) and Kimai (a time tracker with reporting), Ever Gauzy is a full ERP/HRM platform with time tracking as one module. This breadth could be an advantage (single platform for HR + time tracking) or a disadvantage (complexity for a 10-user team that only needs time tracking). The only way to assess that trade-off is to test it.

**Key facts at time of decision:**
- Version: v97.0.4 (released 2026-03-23 — actively maintained)
- Tech stack: NestJS + Angular + PostgreSQL (+ optional Redis, OpenSearch)
- Docker Compose deployment supported
- Screenshot capability: listed as a feature — pending live test
- Potential screenshot score ceiling: 5/5 (unlike Cattr, Mac can potentially be live-tested since the agent is cross-platform Electron)

**Consequence:** The scoring sheet, evaluation plan, and CLAUDE.md are updated to include Ever Gauzy as a third column. Same rubric applies. The complexity risk (overkill ERP for 10 users) is a UX/ops scoring factor, not a disqualifier.

---

## D-010 — Add EmpMonitor as a fourth evaluation candidate

**Date:** 2026-03-25
**Status:** Decided

**Decision:** Expand the evaluation to four tools by adding [EmpMonitor](https://github.com/EmpCloud/emp-monitor).

**Reason:** EmpMonitor is an open-source workforce monitoring platform with a Qt-based cross-platform desktop agent (Windows, macOS, Linux), screenshot capture, activity monitoring, and time tracking. It meets the non-negotiable screenshot + desktop agent requirement. Despite low community adoption (16 stars, 6 forks at time of review), the feature set warrants a live test before exclusion.

**Key facts at time of decision:**
- License: GPLv3
- Tech stack: Node.js (4 microservices) + MySQL + MongoDB + Redis + React/Vite frontend + Qt desktop agent
- No official Docker Compose — requires manual setup or a custom compose file
- Screenshot capability: listed as a feature — pending live test
- Community: low activity, single visible commit on main branch

**Risk noted:** No Docker support out of the box adds ops overhead for evaluation. A custom `docker-compose.yml` will need to be authored to run it consistently. This complexity is itself a scoring factor in the Maintenance/Ops category.

**Consequence:** Scoring sheet, evaluation plan, and CLAUDE.md updated to include EmpMonitor as a fourth column.

---

## D-006 — ADR to be completed after evaluation, not before

**Date:** 2026-03-23
**Status:** Decided

**Decision:** The Architecture Decision Record (in the spec doc) is a template with placeholders — it is filled in after testing is complete, not pre-populated with an assumed winner.

**Reason:** The purpose of the evaluation is to make an evidence-based decision. Pre-filling the ADR would defeat that purpose. The ADR template exists so that once testing is done, the decision and its rationale are documented immediately while the data is fresh.
