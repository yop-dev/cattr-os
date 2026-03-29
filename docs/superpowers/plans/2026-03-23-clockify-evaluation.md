# Clockify Replacement Evaluation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Cattr and Kimai locally on Docker, run structured evaluation tests, and complete a scored decision record to select the Clockify replacement.

**Architecture:** Two isolated Docker Compose stacks run side-by-side on localhost (ports 8080 and 8081). Cattr gets its Windows desktop agent installed for screenshot testing. Both tools are evaluated against a weighted scoring rubric. The winning tool is documented in an ADR before any VPS work begins.

**Tech Stack:** Docker Desktop (Windows), Docker Compose v2, Cattr (Laravel + PostgreSQL + Redis), Kimai (PHP + MySQL), Cattr Desktop Agent (Windows installer)

**Spec:** `docs/superpowers/specs/2026-03-23-clockify-replacement-design.md`

**Out of scope:** If neither tool passes, a fallback evaluation of SolidTime and Invoice Ninja is required — that is a separate plan, not covered here.

---

## File Structure

```
clockify-os/
├── stack-cattr/
│   ├── docker-compose.yml     ← Cattr backend + PostgreSQL + Redis
│   └── .env                   ← Cattr environment variables
├── stack-kimai/
│   ├── docker-compose.yml     ← Kimai + MySQL
│   └── .env                   ← Kimai environment variables
└── docs/
    ├── evaluation/
    │   └── scoring.md         ← Live scoring rubric (fill in during testing)
    └── superpowers/
        └── specs/
            └── 2026-03-23-clockify-replacement-design.md
```

---

## Task 1: Create the Scoring Sheet (Do This First)

Create the scoring sheet before testing begins so you have somewhere to record observations in real time.

**Files:**
- Create: `docs/evaluation/scoring.md`

- [ ] **Step 1: Create `docs/evaluation/scoring.md`**

```markdown
# Evaluation Scoring Sheet

**Date:** 2026-MM-DD
**Evaluator:** [your name]

---

## Score Anchors (global)

| Score | Meaning |
|---|---|
| 1 | Does not meet the requirement / broken |
| 3 | Meets the requirement with noticeable friction or limitations |
| 5 | Meets the requirement fully, works well, no significant issues |

---

## Screenshot Functionality (35% weight)

> NOTE: Mac cannot be live-tested. Maximum achievable score is 3/5 if Windows works and Mac is doc-confirmed.
> Score 5/5 only if you are able to live-test Mac as well (out of scope for this evaluation).

| Item | Cattr | Kimai |
|---|---|---|
| Screenshots captured on Windows | Yes/No | N/A |
| 5-min interval works | Yes/No | N/A |
| 10-min interval works | Yes/No | N/A |
| Manager can view screenshots | Yes/No | N/A |
| Mac agent available and recently updated | Yes/No/Unknown | N/A |
| **Score** | /3 (max 3 — Mac not live-tested) | **1/5 (fixed — no native support)** |

---

## Reporting Quality (30% weight)

| Item | Cattr | Kimai |
|---|---|---|
| Per-user timesheet visible | Yes/No | Yes/No |
| Per-project breakdown visible | Yes/No | Yes/No |
| CSV export works | Yes/No | Yes/No |
| PDF export works | Yes/No | Yes/No |
| Notes | | |
| **Score** | /5 | /5 |

---

## User UX (20% weight)

| Item | Cattr | Kimai |
|---|---|---|
| Clicks to start a timer | # | # |
| Project assignment easy | Yes/No | Yes/No |
| Anything confusing or slow | | |
| **Score** | /5 | /5 |

---

## Maintenance / Ops (15% weight)

| Item | Cattr | Kimai |
|---|---|---|
| Docker compose started cleanly (no manual fixes needed) | Yes/No | Yes/No |
| Time to get running from cold start | mins | mins |
| Errors encountered during setup | | |
| Update process documented (check their docs/GitHub) | Yes/No | Yes/No |
| Data export available (CSV/JSON of all data) | Yes/No | Yes/No |
| **Score** | /5 | /5 |

---

## Weighted Totals

**Cattr:** (screenshots × 0.35) + (reporting × 0.30) + (ux × 0.20) + (ops × 0.15) = ___

**Kimai:** (1 × 0.35) + (reporting × 0.30) + (ux × 0.20) + (ops × 0.15) = ___

---

## Decision

- If winner score ≥ 3.0 and margin > 0.3: **[Winner] selected**
- If scores within 0.3: run 3-day live pilot before deciding
- If neither ≥ 3.0: escalate — write a new plan for SolidTime + Invoice Ninja evaluation

**Decision:** [fill in]

**Rationale:** [2–4 sentences — refer to specific test results]
```

- [ ] **Step 2: Commit the empty scoring sheet**

```bash
git add docs/evaluation/scoring.md
git commit -m "eval: add scoring sheet template"
```

---

## Task 2: Create Cattr Docker Compose Stack

**Files:**
- Create: `stack-cattr/docker-compose.yml`
- Create: `stack-cattr/.env`

- [ ] **Step 1: Check Cattr's official Docker documentation**

Before writing anything, go to `https://cattr.app/docs` or `https://github.com/cattr-app` and find their official self-hosting / Docker guide.

Look for:
- The official `docker-compose.yml` they provide (copy it directly if available — do not invent image names)
- The correct Docker image name and registry (Docker Hub vs GitHub Container Registry)
- Required environment variables, especially how the initial admin account is created

If they provide an official docker-compose file: **use it as-is** and skip Steps 2–4 below. Save it to `stack-cattr/docker-compose.yml`.

- [ ] **Step 2: If no official compose is provided — create `.env`**

```env
APP_KEY=
DB_PASSWORD=cattr_secret
REDIS_PASSWORD=redis_secret
ADMIN_EMAIL=admin@cattr.local
ADMIN_PASSWORD=Admin1234!
```

Generate APP_KEY after the image is pulled:
```bash
docker run --rm <cattr-image-name> php artisan key:generate --show
```
Replace `<cattr-image-name>` with the actual image name from their docs.

- [ ] **Step 3: If no official compose is provided — create `stack-cattr/docker-compose.yml`**

Use the following as a starting template, **but substitute the correct image name** from Cattr's documentation:

```yaml
services:
  app:
    image: <cattr-image-name>    # REPLACE with actual image from Cattr docs
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      APP_ENV: production
      APP_KEY: ${APP_KEY}
      DB_HOST: db
      DB_PORT: 5432
      DB_DATABASE: cattr
      DB_USERNAME: cattr
      DB_PASSWORD: ${DB_PASSWORD}
      REDIS_HOST: redis
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      ADMIN_EMAIL: ${ADMIN_EMAIL}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
    depends_on:
      - db
      - redis

  db:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: cattr
      POSTGRES_USER: cattr
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - cattr_db:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - cattr_redis:/data

volumes:
  cattr_db:
  cattr_redis:
```

- [ ] **Step 4: Verify the compose file is valid**

```bash
cd stack-cattr
docker compose config
```

Expected: Docker prints the resolved config with no errors. If you see "invalid reference format" the image name placeholder was not replaced.

- [ ] **Step 5: Commit**

```bash
git add stack-cattr/
git commit -m "feat: add Cattr docker-compose stack"
```

---

## Task 3: Create Kimai Docker Compose Stack

**Files:**
- Create: `stack-kimai/docker-compose.yml`
- Create: `stack-kimai/.env`

- [ ] **Step 1: Create `stack-kimai/.env`**

```env
KIMAI_DB_PASSWORD=kimai_secret
KIMAI_ADMIN_EMAIL=admin@kimai.local
KIMAI_ADMIN_PASS=Admin1234!
```

- [ ] **Step 2: Create `stack-kimai/docker-compose.yml`**

```yaml
services:
  kimai:
    image: kimai/kimai2:apache
    restart: unless-stopped
    ports:
      - "8081:80"
    environment:
      DATABASE_URL: mysql://kimai:${KIMAI_DB_PASSWORD}@db/kimai
      ADMINMAIL: ${KIMAI_ADMIN_EMAIL}
      ADMINPASS: ${KIMAI_ADMIN_PASS}
    depends_on:
      db:
        condition: service_healthy

  db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: kimai
      MYSQL_USER: kimai
      MYSQL_PASSWORD: ${KIMAI_DB_PASSWORD}
      MYSQL_ROOT_PASSWORD: root_secret
    volumes:
      - kimai_db:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "kimai", "-p${KIMAI_DB_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  kimai_db:
```

- [ ] **Step 3: Verify the compose file is valid**

```bash
cd stack-kimai
docker compose config
```

Expected: Docker prints the resolved config with no errors.

- [ ] **Step 4: Commit**

```bash
git add stack-kimai/
git commit -m "feat: add Kimai docker-compose stack"
```

---

## Task 4: Start Both Stacks and Verify Access

**Gate:** Both stacks must be accessible before proceeding. Do not score a tool that is not running cleanly.

- [ ] **Step 1: Start Cattr**

```bash
cd stack-cattr
docker compose up -d
docker compose logs -f app
```

Wait until the logs show no more startup activity (migrations complete, web server ready). This may take 1–3 minutes on first run.
Press Ctrl+C to stop following logs once it is stable.

- [ ] **Step 2: Verify Cattr is accessible**

Open browser: `http://localhost:8080`

Expected: Cattr login page or first-run wizard loads.

If you see a 502 error: wait 30 more seconds and refresh — the app may still be running database migrations.
If still broken after 2 minutes: run `docker compose logs app` and look for error messages before proceeding.

- [ ] **Step 3: Record Cattr ops observations (for scoring)**

Open `docs/evaluation/scoring.md` and fill in the Maintenance/Ops section for Cattr:
- Did it start cleanly without manual fixes?
- How long did it take from `docker compose up` to the login page loading?
- Any errors encountered?

- [ ] **Step 4: Start Kimai**

```bash
cd stack-kimai
docker compose up -d
docker compose logs -f kimai
```

Wait until logs show Kimai is ready (MySQL health check passes, Kimai web server starts).

- [ ] **Step 5: Verify Kimai is accessible**

Open browser: `http://localhost:8081`

Expected: Kimai login page loads.
Login with: `admin@kimai.local` / `Admin1234!`

- [ ] **Step 6: Record Kimai ops observations (for scoring)**

Fill in the Maintenance/Ops section for Kimai in `docs/evaluation/scoring.md`.

- [ ] **Step 7: Check docs update process for both tools**

For each tool, spend 5 minutes checking their GitHub or documentation:
- Is there a documented upgrade procedure for the Docker setup?
- When was their last release? (check GitHub releases)
- Is there a way to export all data as CSV/JSON backup?

Record findings in the Ops section of `docs/evaluation/scoring.md`.

- [ ] **Step 8: Confirm no port conflicts**

```bash
docker ps
```

Expected: Both `stack-cattr-app-1` and `stack-kimai-kimai-1` containers are listed as `Up`.

---

## Task 5: Create Test Accounts on Both Tools

### Cattr

- [ ] **Step 1: Log in to Cattr at `http://localhost:8080`**

Use the admin credentials from `stack-cattr/.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).
If a first-run wizard appears, follow it to create the admin account — use the same credentials.

- [ ] **Step 2: Create test structure on Cattr**

In the admin panel:
1. Create a project called `Test Project`
2. Create user: `user1@test.com` / `TestPass123!` — role: Employee
3. Create user: `user2@test.com` / `TestPass123!` — role: Employee
4. Assign both users to `Test Project`

### Kimai

- [ ] **Step 3: Log in to Kimai at `http://localhost:8081`**

Credentials: `admin@kimai.local` / `Admin1234!`

- [ ] **Step 4: Create test structure on Kimai**

1. Create a customer: `Test Customer`
2. Create a project: `Test Project` under `Test Customer`
3. Create an activity: `Development` under `Test Project`
4. Create user: `user1@test.com` / `TestPass123!` — role: User
5. Create user: `user2@test.com` / `TestPass123!` — role: User

---

## Task 6: Screenshot Testing on Cattr (Windows)

**Scoring category:** Screenshot functionality (35% weight)
**Max achievable score this evaluation: 3/5** (Mac cannot be live-tested)

- [ ] **Step 1: Download the Cattr desktop agent for Windows**

In the Cattr admin panel, look for a Downloads section.
Alternatively, check `https://cattr.app` or their GitHub releases for the Windows desktop agent (`.exe` installer).
Download and run the installer.

- [ ] **Step 2: Configure the agent**

On first launch, enter:
- Server URL: `http://localhost:8080`
- Login with: `user1@test.com` / `TestPass123!`

- [ ] **Step 3: Enable screenshots in Cattr admin**

Log in as admin → Settings → Screenshots (or Activity/Monitoring settings):
- Enable screenshots: ON
- Interval: 5 minutes

- [ ] **Step 4: Log time with the desktop agent at 5-minute interval**

In the agent:
1. Select `Test Project`
2. Click Start
3. Wait 6–7 minutes (enough for at least one capture)
4. Click Stop

- [ ] **Step 5: Verify screenshots appear in manager view**

Log in as admin → navigate to Screenshots or Reports.
Check that screenshots from user1's session are visible.

Fill in `docs/evaluation/scoring.md`:
- Screenshots captured at 5-min interval: Yes/No
- Manager can view screenshots: Yes/No
- Image quality adequate: Yes/No

- [ ] **Step 6: Test at 10-minute interval**

Change interval to 10 min in admin settings.
Repeat Steps 4–5. Record results.

- [ ] **Step 7: Check Mac agent availability**

Visit Cattr's GitHub releases page or official site.
Record in `docs/evaluation/scoring.md`:
- Is a Mac desktop agent available for download? Yes/No
- When was it last updated? (date)
- Are there open GitHub issues about the Mac agent being broken or unmaintained?

Mac is doc-confirmed if: agent is available AND last updated within the past 12 months AND no open critical issues.

- [ ] **Step 8: Score Cattr on Screenshots**

Using the rubric:
- Max 3/5 (Mac not live-tested)
- 3/5: Windows works, Mac doc-confirmed, interval configurable, manager can view
- 2/5: Windows works but Mac unavailable/risky, or minor issues
- 1/5: Screenshots don't work on Windows

Enter score in `docs/evaluation/scoring.md`.

- [ ] **Step 9: Enter Kimai's fixed screenshot score**

In `docs/evaluation/scoring.md`, enter Kimai screenshot score as **1/5 (fixed)**.
Reason: Kimai has no native screenshot support. This is a hard gap per spec.

---

## Task 7: Reporting Tests on Both Tools

**Scoring categories:** Reporting quality (30%) and User UX (20%)

### Cattr

- [ ] **Step 1: Log time as a user on Cattr (web interface)**

Log in as `user1@test.com` at `http://localhost:8080`.
Start a timer on `Test Project`, let it run 3–5 minutes, stop it. Count how many clicks this requires.
Do this twice to create multiple entries.

- [ ] **Step 2: Pull a manager report on Cattr**

Log in as admin.
Navigate to Reports.
Filter: user1, current week.
Record: per-user view visible? Per-project breakdown visible?

- [ ] **Step 3: Export from Cattr**

Export the filtered report as CSV.
Export as PDF if available.
Note which formats are available and whether the exported data is complete.

### Kimai

- [ ] **Step 4: Log time as a user on Kimai**

Log in as `user1@test.com` at `http://localhost:8081`.
Start a timer on `Test Project → Development`, run 3–5 minutes, stop. Count clicks.
Repeat twice.

- [ ] **Step 5: Pull a manager report on Kimai**

Log in as admin.
Navigate to Reports (admin sidebar).
Filter: user1, current week.
Record: per-user view visible? Per-project breakdown visible?

- [ ] **Step 6: Export from Kimai**

Export as CSV. Export as PDF.
Note quality and completeness.

- [ ] **Step 7: Score both tools on Reporting and User UX**

Fill in `docs/evaluation/scoring.md`:
- Reporting (1–5): based on per-user/per-project visibility and export capability
- User UX (1–5): based on click count, clarity, and friction

---

## Task 8: Calculate Weighted Scores and Make Decision

- [ ] **Step 1: Calculate weighted total for Cattr**

Formula: (screenshots × 0.35) + (reporting × 0.30) + (ux × 0.20) + (ops × 0.15)

Example: scores of 3, 4, 4, 4 → (3×0.35) + (4×0.30) + (4×0.20) + (4×0.15) = 1.05 + 1.20 + 0.80 + 0.60 = 3.65

- [ ] **Step 2: Calculate weighted total for Kimai**

Formula: (1 × 0.35) + (reporting × 0.30) + (ux × 0.20) + (ops × 0.15)

Note: Kimai's screenshot score is always 1 regardless of other results.

- [ ] **Step 3: Apply decision rules**

| Condition | Action |
|---|---|
| Winner score ≥ 3.0 and margin > 0.3 | Proceed with winner |
| Both ≥ 3.0 and margin ≤ 0.3 | Run 3-day live pilot with 2 real users, then re-decide |
| Neither ≥ 3.0 | Stop. Write a new evaluation plan for SolidTime + Invoice Ninja |
| One ≥ 3.0, other < 3.0 | Winner is the one that passes |

- [ ] **Step 4: Record decision in scoring sheet**

Fill in the Decision and Rationale fields in `docs/evaluation/scoring.md`.

- [ ] **Step 5: Commit the completed scoring sheet**

```bash
git add docs/evaluation/scoring.md
git commit -m "eval: complete scoring — [winner/escalation note]"
```

---

## Task 9: Complete the ADR

**Files:**
- Modify: `docs/superpowers/specs/2026-03-23-clockify-replacement-design.md`

- [ ] **Step 1: Open the spec and fill in the ADR section**

Complete:
- **Decision:** winner tool name
- **Scores table:** copy from `docs/evaluation/scoring.md`
- **Decision rationale:** 2–4 sentences — refer to specific test results (e.g., "Cattr scored 3/5 on screenshots — Windows confirmed working at 5 and 10-min intervals, Mac agent confirmed available on GitHub dated YYYY-MM-DD")
- **Consequences:** e.g., "Mac agent must be live-tested before VPS deployment goes live" or "Kimai reporting is stronger but screenshot gap is a blocker"

- [ ] **Step 2: Update the status line**

```markdown
**Status:** Decision Made — [Winner] selected on 2026-MM-DD
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-03-23-clockify-replacement-design.md
git commit -m "docs: complete ADR — [winner] selected as Clockify replacement"
```

---

## Task 10: Tear Down and Clean Up

- [ ] **Step 1: Stop and remove the losing stack (if there is a clear winner)**

```bash
cd stack-[loser]
docker compose down -v
```

The `-v` flag removes named volumes (database data). This is intentional — evaluation data does not need to be kept.

If neither tool passed (escalation case): keep both stacks running for reference, or tear both down — evaluation data is not needed. Run `docker compose down -v` in both stack directories.

- [ ] **Step 2: Verify winning stack is still running (if applicable)**

```bash
docker ps
```

Expected: Only the winning tool's containers are listed as `Up`.

- [ ] **Step 3: Commit cleanup note**

```bash
git add .
git commit -m "chore: tear down evaluation stacks — [winner] retained / both removed for escalation"
```

---

## Done

At this point you have:
- A completed scoring sheet: `docs/evaluation/scoring.md`
- A completed ADR in: `docs/superpowers/specs/2026-03-23-clockify-replacement-design.md`
- A running local Docker stack for the winning tool (or nothing if escalating)

**Next steps:**
- If a winner was selected: answer the 6 open VPS questions in the spec, then design production deployment
- If escalating: write a new evaluation plan for SolidTime and Invoice Ninja using the same rubric and process
