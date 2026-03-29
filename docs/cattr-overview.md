# Cattr — Feature Overview

**Prepared for:** Team Lead review
**Date:** 2026-03-24
**Version tested:** Latest (Docker, self-hosted)
**Status:** Approved by CEO — moving to production setup

---

## What is Cattr?

Cattr is a free, open-source time tracking tool designed for teams. It can be self-hosted on your own server, meaning your data stays entirely within your infrastructure — no third-party cloud, no per-seat subscription fees.

It consists of two parts:
- A **web dashboard** (admin and user portal, accessed via browser)
- A **desktop agent** (installed on each team member's computer — Windows and Mac)

---

## Core Features

### Time Tracking
- Employees start and stop a timer directly from the desktop app
- They select a **Project** and **Task** before starting — time is always logged against a specific piece of work
- The timer runs in the background while they work
- Sessions are visible to managers in real time on the admin dashboard

### Screenshot Capture
- The desktop agent automatically takes screenshots at a configurable interval during any active tracked session
- **Dual monitor support confirmed** — both screens are captured separately
- Screenshots are immediately visible to admins after a session ends
- Each screenshot includes an **Overall Activity %** showing mouse and keyboard activity during that interval
- Screenshot frequency is configurable per user (default: every 5 minutes)
- Screenshot policy can be set to: **Required**, **Optional**, or **Forbidden** at company or project level

### Activity Monitoring
- Each tracked session shows:
  - Duration
  - Overall activity percentage (mouse + keyboard)
  - Individual screenshots with timestamps
- Useful for managers to verify engagement without watching every screenshot

### Admin Dashboard
- See all currently active users and their running timers in real time
- View completed sessions: who worked on what, for how long, with what activity level
- Access screenshots for any session

### Reporting
- Filter time reports by:
  - **User** — see a specific team member's hours
  - **Project** — see all time logged against a project
  - **Date range** — daily, weekly, monthly, custom
- Export in **6 formats**: CSV, XLSX, PDF, XLS, ODS, HTML
- Reports include duration, activity %, project, and task breakdowns

### User Roles
| Role | What they can do |
|---|---|
| Admin | Full access — manage users, projects, tasks, view/edit/delete all time entries and screenshots |
| Employee | Track their own time via desktop app, view their own sessions — cannot edit or delete time entries or screenshots |

> Employee edit/delete restriction is enforced via a patched `TimeIntervalPolicy` in [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os). The upstream default allows employees to edit/delete their own entries.

### Project & Task Management
- Admins create **Projects** and **Tasks** via the web dashboard
- Employees pick from the available projects and tasks when starting a timer
- Tasks can be assigned to specific team members

---

## Platform Support

| Platform | Status |
|---|---|
| Windows desktop agent | ✅ Confirmed working |
| Mac desktop agent | ⏳ Not yet live-tested (agent exists, v3.0.0-RC13) |
| Web dashboard (browser) | ✅ Works on any browser |

---

## Deployment

- Runs entirely on your own VPS via Docker
- No internet dependency after setup — fully self-contained
- Your screenshots and time data never leave your server
- Requires a domain + reverse proxy (nginx) and optional SMTP for email invites
- Custom image repo: [github.com/yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) — build with `docker compose build`, run with `docker compose up -d`

---

## User Management

- Admins invite team members by email (requires SMTP configuration on the server)
- Role can be set to Admin or Employee
- Users receive an invite link and set their own password
- No per-seat cost — unlimited users

---

## Evaluation Score

| Category | Score | Notes |
|---|---|---|
| Screenshot functionality | 3/5 | Windows confirmed ✅, Mac pending |
| Reporting quality | 5/5 | All filters and 6 export formats confirmed ✅ |
| User experience | 3/5 | Easy to use once set up, minor setup friction |
| Maintenance / ops | 3/5 | Docker setup straightforward, SMTP needed for invites |
| **Overall (weighted)** | **3.60 / 5.00** | Passes minimum threshold of 3.0 |

---

## Things to Know Before Going Live

1. **Mac agent needs a live test** — the Windows agent works well; Mac needs confirmation on a real Mac before committing to production
2. **SMTP must be configured** — without it, user invitations cannot be sent and accounts must be created manually via CLI
3. **Screenshot interval** is currently configurable per user but not per project — all users on a project use their own individual interval setting
4. **VPS deployment** needs: Docker, nginx reverse proxy, SSL certificate, SMTP, and a backup strategy for the database and screenshot storage

---

## Summary

Cattr covers all core requirements: recurring screenshots, cross-platform desktop agent, easy time logging, and strong reporting with multiple export formats. It is a credible self-hosted replacement for Clockify. The main outstanding items before a production deployment decision are Mac agent confirmation and SMTP setup.
