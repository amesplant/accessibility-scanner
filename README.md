# Seymour — Accessibility Scanner

**Seymour is our internal accessibility audit platform** — a purpose-built tool for the Fueled team to deliver thorough, consistent, and well-documented accessibility audits at every stage of a project.

Whether you're running a quick check on a staging build before launch, conducting a deep WCAG 2.2 audit mid-engagement, or validating a live production site post-delivery, Seymour gives you a single place to scan, review, document findings, and hand off actionable issues directly to your project management workflow.

**Three audit tiers match where you are in the project:**

- **Rapid** — 5-page spot check, ideal for pre-launch gut checks or scoping conversations
- **Mid-Level** — focused WCAG 2.2 AA review on any set of pages, great for mid-engagement checkpoints
- **All-Inclusive** — full-site automated + manual audit covering all 52 WCAG criteria, the standard for final deliverables

All findings live in a persistent dashboard organized by project and client engagement, with one-click export to Teamwork or Jira so issues land directly in your team's workflow.

---

## Features

- **Three audit types** — Rapid (up to 5 pages), Mid-Level (any page count), and All-Inclusive (full site via sitemap or crawl)
- **Automated scanning** via sitemap URL, XML file upload, or site crawl — powered by axe-core for WCAG 2.2 A/AA/AAA
- **Smart element detection** — during a scan, non-text elements (images, SVGs, icon buttons, canvas, video, etc.) are extracted with their computed text alternatives and screenshots for WCAG 1.1.1 review
- **Element screenshots** — each detected element gets a cropped screenshot and an annotated full-page context screenshot (element highlighted, surroundings dimmed)
- **Manual audit checklists** scoped per audit type — 13 criteria for Rapid, 20 for Mid-Level, all 52 for All-Inclusive
- **Failure instances** with scope tagging (Global / Common / Page Specific), code snippets, and screenshot capture
- **Custom issues** — add findings that fall outside predefined WCAG criteria
- **Audit coverage tracking** — report overview shows how many pages have been manually audited
- **Background scanning** — scans continue running while you navigate; a floating pill shows progress and lets you abort from anywhere
- **Projects** — group related scans by client or engagement, with inline create, assign, and unassign
- **Export to Teamwork (.xlsx / .csv) or Jira (.csv)** — filterable by WCAG level, with structured descriptions, code snippets, and affected page lists
- **Local storage** in a simple JSON file — no database required

---

## Getting Started

### Prerequisites

- Node.js >= 22.12
- npm >= 10

### Installation

```bash
git clone git clone git@github.com:10up/accessibility-scanner.git
cd accessibility-scanner
npm install
npm run build
```

### Run in development

```bash
npm run dev          # starts both API server (port 3003) and dashboard (port 5173)
```

### Environment variables

Create a `.env` file in the repository root (or set env vars in your launch environment) to configure auth, SSO, and optional Supabase persistence:

- `FRONTEND_ORIGIN` (optional): dashboard URL, default `http://localhost:5173`
- `AUTH_COOKIE_NAME` (optional): auth session cookie name, default `fueled_access_session`
- `AUTH_JWT_SECRET` (optional): JWT signing secret; change in production (default `please-change-this-in-production`)
- `AUTH_CALLBACK_URL` (optional): callback URL after SSO, default `http://localhost:3003/auth/callback`
- `SSO_PROXY_URL` (required for SSO in production): Fueled SSO proxy endpoint (e.g. `https://ssoproxy.example.com/wp-login.php`)
- `SUPABASE_URL` (optional): Supabase project URL (enables Supabase-backed persistence when paired with `SUPABASE_KEY`)
- `SUPABASE_KEY` (optional): **Publishable (anon)** API key for the scanner server
- `SUPABASE_SECRET_KEY` (optional): **Secret** API key (`sb_secret_…`), server-only. When set with `SUPABASE_URL` and `SUPABASE_KEY`, after SSO the server creates a **real Supabase Auth session** (access + refresh token), stores it in the cookie, and sends the **access token** on each database request so **RLS** policies using `auth.uid()` apply. Tokens are **ES256** and verified against your project’s [JWKS](https://supabase.com/docs/guides/auth/jwts) (`/auth/v1/.well-known/jwks.json`), not a legacy shared JWT secret. If this secret is unset, the app uses a single shared Supabase client and `AUTH_JWT_SECRET` for the session cookie (RLS with `auth.uid()` is not applied via the API).

### Supabase + Vercel deployment (Option B)

This project supports storing user-specific reports/projects in Supabase when `SUPABASE_URL` and `SUPABASE_KEY` are set. With **`SUPABASE_SECRET_KEY`** also set, each request uses a Supabase Auth **access token** so RLS can enforce ownership (`user_id` must match `auth.uid()` / JWT `sub`).

**RLS user ids:** In RLS mode, `user_id` must be the user’s **`auth.users.id`** (the `sub` claim on the access token). On first SSO login, Supabase creates or reuses that Auth user; new `projects` / `reports` rows must use that id. Older rows keyed by email or a custom UUID need a one-time migration or reset.

1. Create or use an existing Supabase project.
2. Create database tables (SQL for `psql` / Supabase SQL editor):

```sql
create table reports (
  id text primary key,
  user_id text not null,
  project_id text null,
  report_data jsonb not null,
  created_at timestamptz not null default now()
);

create table projects (
  id text primary key,
  user_id text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
```

3. Set `SUPABASE_URL`, `SUPABASE_KEY`, and (for RLS) `SUPABASE_SECRET_KEY` in `.env` locally and in Vercel dashboard (Environment variables).
4. Start local dev:

```bash
npm run dev
```

5. Deploy to Vercel as a monorepo app:
   - Set root project path to `/packages/scanner` for server, and `/packages/dashboard` for UI.
   - Add environment variables in Vercel:
     - `SUPABASE_URL`
     - `SUPABASE_KEY` (publishable/anon)
     - `SUPABASE_SECRET_KEY` (if using RLS + Supabase Auth sessions)
     - `AUTH_JWT_SECRET` (when the RLS env trio is incomplete)
     - `FRONTEND_ORIGIN` (e.g. `https://your-app.vercel.app`)
     - `AUTH_CALLBACK_URL` (e.g. `https://your-api-url.vercel.app/auth/callback`)
     - `SSO_PROXY_URL`

6. Confirm security: the API scopes data by user id; with RLS enabled, use **publishable + secret** keys as above so PostgREST runs as the signed-in user. Add indexes on `reports(user_id)` and `projects(user_id)` for policy performance.

### Login behavior (new)

When visiting `/` and not authenticated, the dashboard now forces a login UI at `/login` with a prominent “Sign in with Fueled SSO” button. 

The button starts the existing SSO flow via `/auth/login`, and after successful callback the user is returned to the original page.

## Audit Types

| Audit Type | Pages | Input | Manual Checklist |
|------------|-------|-------|-----------------|
| **Rapid** | Up to 5 | Manual URL list | 13 Quick Assess criteria |
| **Mid-Level** | Any | Manual URL list | 20 WCAG 2.2 AA criteria |
| **All-Inclusive** | Full site | Sitemap URL, XML upload, or crawl | All 52 criteria |

### All-Inclusive Input Modes

| Mode | Description |
|------|-------------|
| **Sitemap URL** | URL to an XML sitemap (e.g. `https://example.com/sitemap.xml`) |
| **Upload XML** | Upload a sitemap XML file from your machine |
| **Crawl** | Starting URL — the scanner follows internal links from that path downward |

Crawl defaults: max **200 pages** (~5–10 min). Cap: **500 pages**. The crawler renders JavaScript with Puppeteer before extracting links.

---

## Manual Audit

Each scanned page has a manual audit tab covering WCAG criteria that automated tools cannot fully verify.

### Smart Element Detection (WCAG 1.1.1)

For the Non-text Content criterion, the scanner automatically detects images, SVGs, icon buttons, canvas elements, and other non-text content on each page. Each element is shown with:

- Its computed text alternative (or a "no text alternative" indicator)
- What a screen reader would announce
- A screenshot of the element and an annotated full-page context screenshot
- Pass / Fail / Not Reviewed status that auditors can set inline

### Failure Instances

Each failed criterion can have one or more recorded instances with scope (Global / Common / Page Specific), a description, a code snippet, and a screenshot.

### Custom Issues

Add findings outside predefined criteria with a title, description, impact level, and notes.

### Completion

Mark a page audit complete to flag it in the coverage tracker. The report overview shows a progress bar of completed vs. total pages.

---

## Projects

Group related scans together for a client or engagement.

- Create a project from the scan form or the Projects page
- Assign a scan to a project at scan time or from the dashboard card afterward
- Project detail page lists all reports with View, Export, and Remove actions
- Deleting a project unassigns its reports — nothing is deleted

---

## Exporting Results

Every report has an **Export** button on the dashboard card and in the report detail header.

| Format | Description |
|--------|-------------|
| **Teamwork .xlsx** | Excel file with task columns for Teamwork import |
| **Teamwork .csv** | CSV equivalent |
| **Jira .csv** | Jira wiki markup with `{code:html}` blocks and structured labels |

Export options: tasklist name, filename, and WCAG level filter (A, AA, AAA, Best Practice).

Each exported issue includes a description, severity, code snippet, affected pages, remediation guidance, and QA steps placeholder.

---

## API Reference

### Scanning & Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/reports` | List all reports |
| `GET` | `/api/reports/:id` | Get a single report |
| `DELETE` | `/api/reports/:id` | Delete a report |
| `POST` | `/api/scan` | Start a scan |
| `GET` | `/api/scan/:jobId/events` | SSE stream for scan progress |
| `DELETE` | `/api/scan/:jobId` | Abort a running scan |
| `POST` | `/api/reports/:id/export/csv` | Export as Teamwork CSV |
| `POST` | `/api/reports/:id/export/excel` | Export as Teamwork Excel |
| `POST` | `/api/reports/:id/export/jira` | Export as Jira CSV |

**Start a scan:**

```json
POST /api/scan
{
  "auditType": "all-inclusive",
  "sitemap": "https://example.com/sitemap.xml",
  "projectId": "proj_abc123"
}
```

`auditType` options: `"rapid"`, `"mid-level"`, `"all-inclusive"`. Provide one of `urls[]`, `sitemap`, `xmlContent`, or `crawlUrl` depending on audit type.

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create a project |
| `GET` | `/api/projects/:id` | Get a project and its reports |
| `PATCH` | `/api/projects/:id` | Update name or description |
| `DELETE` | `/api/projects/:id` | Delete a project |
| `PATCH` | `/api/reports/:id/project` | Assign or unassign a report (`projectId` or `null`) |

### Manual Audit

| Method | Endpoint | Description |
|--------|----------|-------------|
| `PATCH` | `/api/reports/:id/pages/:pageId/manual-audit` | Update auditor notes |
| `PATCH` | `/api/reports/:id/pages/:pageId/manual-audit/complete` | Mark or unmark audit complete |
| `PATCH` | `/api/reports/:id/pages/:pageId/manual-audit/checks/:checkId` | Update a check status or notes |
| `POST` | `/api/reports/:id/pages/:pageId/manual-audit/checks` | Add a custom check |
| `DELETE` | `/api/reports/:id/pages/:pageId/manual-audit/checks/:checkId` | Delete a custom check |
| `POST` | `/api/reports/:id/pages/:pageId/manual-audit/checks/:checkId/failures` | Add a failure instance |
| `PATCH` | `/api/reports/:id/pages/:pageId/manual-audit/checks/:checkId/failures/:failureId` | Update a failure instance |
| `DELETE` | `/api/reports/:id/pages/:pageId/manual-audit/checks/:checkId/failures/:failureId` | Delete a failure instance |
| `PATCH` | `/api/reports/:id/pages/:pageId/elements/:criterionId/:elementId` | Update a detected element audit status |
