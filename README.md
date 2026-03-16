# Fueled Access — Accessibility Scanner

A comprehensive TypeScript tool for automated and manual accessibility testing using axe-core and Puppeteer. Supports three audit tiers — Rapid, Mid-Level, and All-Inclusive — with a React dashboard for viewing results and exporting issues directly into Teamwork or Jira.

<!-- Screenshot: dashboard home with report cards -->
<!-- ![Dashboard](docs/screenshots/dashboard.png) -->

## Features

- **Three audit types** — Rapid (up to 5 pages), Mid-Level (any page count), and All-Inclusive (full site via sitemap or crawl)
- **Automated scanning** via sitemap URL, XML file upload, or site crawl
- **axe-core powered** — WCAG 2.2 A, AA, AAA compliance testing
- **Manual audit checklists** scoped per audit type — 13 criteria for Rapid, 20 for Mid-Level, all 52 for All-Inclusive
- **Failure instances** with scope tagging (Global / Common / Page Specific), code snippets, and screenshot capture
- **Audit coverage tracking** — progress bar in report overview shows how many pages have been manually audited
- **Background scanning** — scans continue running while you navigate to view other reports; a floating progress pill appears whenever the progress details scroll out of view or you leave the dashboard; clicking the pill scrolls back to the details or returns you to the dashboard
- **Export to Teamwork (.xlsx), Teamwork (.csv), or Jira (.csv)** — filtered by WCAG level (A, AA, AAA, Best Practice)
- **Consistent export modal** across the dashboard and report detail pages
- **Concurrent page scanning** for performance
- **Local storage** in a simple JSON file (`data/reports.json`)
- **Detailed reports** with violation tracking, impact, WCAG level, and criteria

---

## Getting Started

### Prerequisites

- Node.js >= 20.19+ or 22.12+
- npm >= 10

### Installation

```bash
git clone https://github.com/yourusername/accessibility-scanner.git
cd accessibility-scanner
npm install
```

### Build all packages

```bash
npm run build
```

---

## Usage

### Starting the Dashboard

Start both the API server and dashboard in development mode:

```bash
npm run dev
```

Or individually:

```bash
npm run dev:server    # API server on port 3003
npm run dev:dashboard # Dashboard on port 5173
```

---

## Starting a Scan

### Choosing an Audit Type

| Audit Type | Pages | Input Method | Manual Checklist |
|------------|-------|-------------|-----------------|
| **Rapid Audit** | Up to 5 | Manual URL list | 13 key Quick Assess criteria |
| **Mid-Level** | Any number | Manual URL list | 20 WCAG 2.2 AA criteria |
| **All-Inclusive** | Full site | Sitemap URL, XML upload, or crawl | All 52 criteria |

**Rapid Audit** — Focused evaluation targeting the most critical issues: color contrast, heading structure, alt text, and keyboard accessibility. Ideal for a fast core-page assessment (~15 hours).

**Mid-Level** — Thorough assessment across a representative page set covering automated, manual, and screen reader testing against 20 WCAG 2.2 AA criteria.

**All-Inclusive** — Comprehensive evaluation of every page against the highest accessibility standards using full automated scanning.

### Assigning a Project

The **Project** field appears directly below the audit type selector. Select an existing project to assign the scan to it immediately, or click **+ New** to create a project inline without leaving the form. You can also assign or reassign any report to a project from the dashboard report card after the scan completes.

### All-Inclusive Input Modes

| Mode | Description |
|------|-------------|
| **Sitemap URL** | Provide a URL to an XML sitemap (e.g. `https://example.com/sitemap.xml`) |
| **Upload XML** | Upload a sitemap XML file directly from your machine |
| **Crawl Site** | Provide a starting URL — the scanner follows internal links downward from that path |

### Crawl Mode Tips

- The crawler only follows links **at or below** the starting path. Starting at `https://example.com/blog/` will not crawl `/about/` or the homepage.
- Default max pages: **200** (~5–10 min at default concurrency).
- Max pages cap: **500** — larger crawls can take 30+ min and use significantly more memory.
- A scan can be **aborted** at any time; no partial data is saved.
- The crawler uses a full Puppeteer browser to render JavaScript before extracting links, so dynamically loaded pages are discovered correctly.

### Background Scanning

Scans run on the server and continue even when you navigate away from the dashboard. A **floating progress pill** appears at the top of the viewport whenever the progress details section scrolls out of view or you leave the dashboard — it hides automatically when the details are visible again. Clicking the pill scrolls back to the progress details (on the dashboard) or navigates you back to the dashboard (from any other page). A **View** link in the pill also takes you directly to the dashboard. You can abort the scan from the pill at any time.

<!-- Screenshot: floating scan progress pill -->
<!-- ![Scan Progress Pill](docs/screenshots/scan-pill.png) -->

---

## Projects

<!-- Screenshot: dashboard with project folder cards -->
<!-- ![Projects on Dashboard](docs/screenshots/dashboard-projects.png) -->

Projects let you group related scans together — useful for tracking an entire site audit across multiple runs or organizing work by client or team.

- **Create a project** from the scan form (select **+ New** in the Project field) or from the **Projects** page (`/projects`).
- **Assign a scan** to a project at scan time using the Project field, or after the fact using the **Project** button on a report card.
- **Dashboard** shows project folder cards above unassigned reports. Reports assigned to a project are hidden from the main list.
- **Project detail** (`/projects/:id`) lists all reports in the project with View, Export, and Remove-from-project actions. The project name and description are editable inline. Removing a report from a project shows a confirmation dialog making clear the report itself is not deleted.
- **Unassigning** a report from a project returns it to the main reports list; it is not deleted.
- **New Scan from a project** — clicking New Scan while viewing a project detail page automatically pre-selects that project in the scan form.
- Deleting a project unassigns all its reports — no reports are deleted.

---

## Managing Reports

<!-- Screenshot: report card with View / Export / Remove actions -->
<!-- ![Report Card](docs/screenshots/report-card.png) -->

- Reports are listed on the dashboard home page with the site's **page title** as the heading and URL as a subtitle.
- Reports assigned to a project are shown on that project's detail page and hidden from the main dashboard list.
- Each card shows **View**, **Project**, **Export**, and **Remove** actions.
- The **Reports** nav dropdown also displays page titles for quick identification.
- When a scan is running, the **New Scan** button is disabled until it completes or is aborted.

---

## Report Detail

<!-- Screenshot: report detail overview tab -->
<!-- ![Report Overview](docs/screenshots/report-overview.png) -->

Each report includes four tabs:

| Tab | Contents |
|-----|----------|
| **Overview** | Violations by impact, violations by WCAG level, top violation types, manual audit coverage |
| **Violations** | Accordion cards grouped by type, filterable by impact and WCAG level, with affected pages linked |
| **Pages** | Per-page results with audited/not-audited filter and a detail panel for each page |
| *(Export button)* | Opens the export modal (see below) |

### Violation Cards

Each card shows:
- WCAG success criterion number (e.g. `2.4.2`) prepended to the violation name
- **Level** badge — A, AA, AAA, or Best Practice
- **WCAG Criteria** badges — individual criterion references
- Clickable impact and level badges to filter inline

---

## Manual Audit

The manual audit tab on each page covers WCAG criteria that axe-core cannot fully verify automatically, scoped to the audit type:

| Audit Type | Criteria | Scope |
|------------|----------|-------|
| Rapid Audit | 13 | Quick Assess (keyboard, focus, links, images, headings, contrast, reflow, bypass blocks) |
| Mid-Level | 20 | Core WCAG 2.2 AA (color, landmarks, forms, tables, audio/video, keyboard) |
| All-Inclusive | 52 | Full predefined checklist covering WCAG A, AA, and AAA |

### Statuses

| Status | Meaning |
|--------|---------|
| ✓ Pass | Criterion is met |
| ✗ Fail | Criterion is not met — record failure instances |
| — N/A | Not applicable to this page |
| ? Not Tested | Not yet reviewed (default) |

### Failure Instances

When a criterion fails, record one or more instances — each with:

- **Scope** — Global, Common, or Page Specific
- **Description** — free-text note
- **Code snippet** — relevant HTML
- **Screenshot** — upload or paste from clipboard

### Custom Issues

Use **Add Custom Issue** to record findings that don't map to a predefined WCAG criterion. Custom issues support a title, description, impact level, status, and notes.

### Auditor Notes & Completion

- **Auditor Notes** — free-text page-level observations
- **Mark Audit Complete** — locks the audit and displays a completion timestamp and "Audited" badge on the pages list
- **Re-open** — reverts completion to allow further edits

### Manual Audit Coverage

The report **Overview** tab shows a **Manual Audit Coverage** progress bar indicating how many pages have been marked complete.

---

## Exporting Results

Every report has an **Export** button (on the dashboard card and in the report detail header) that opens a consistent export modal.

<!-- Screenshot: export modal -->
<!-- ![Export Modal](docs/screenshots/export-modal.png) -->

### Export Options

| Option | Description |
|--------|-------------|
| **Format** | Teamwork `.xlsx`, Jira `.csv`, or Teamwork `.csv` |
| **Tasklist Name** | Name for the task group in your project management tool (Teamwork formats only) |
| **File Name** | Custom filename for the download |
| **WCAG Levels** | Filter by Level A, AA, AAA, and/or Best Practice — all checked by default |

### Teamwork Format (`.xlsx` / `.csv`)

Columns: `TASKLIST`, `TASK`, `DESCRIPTION`, `ASSIGN TO`, `START DATE`, `DUE DATE`, `PRIORITY`, `ESTIMATED TIME`, `TAGS`, `STATUS`

Each task includes:
- **Task name** — `2.4.2 Documents must have <title> element | AA`
- **Tags** — `Accessibility`, severity (e.g. `Major Issue`), WCAG level (e.g. `AA`), `Automated`
- **Description** — structured Markdown template:
  1. Description of issue (pre-filled from axe-core)
  2. Level of severity (pre-filled)
  3. Code snippet (first failing HTML element)
  4. Screenshot placeholder
  5. Affected pages list with inline HTML snippets
  6. Remediation guidance (pre-filled with axe help text and link)
  7. Steps to QA placeholder
  8. Recommended assignee checklist (Content / Design / Engineer)

### Jira Format (`.csv`)

Columns: `Summary`, `Issue Type`, `Priority`, `Labels`, `Description`

| Field | Value |
|-------|-------|
| Issue Type | Task |
| Priority | Highest / High / Medium / Low (mapped from critical / serious / moderate / minor) |
| Labels | Space-separated: `Accessibility Automated WCAG-AA WCAG-2.4.2` |
| Description | Jira wiki markup with `h3.` headings, `{code:html}` blocks, affected page list, and remediation |

### API

```bash
# Teamwork CSV
curl -X POST http://localhost:3003/api/reports/{reportId}/export/csv \
  -H "Content-Type: application/json" \
  -d '{"tasklistName":"Accessibility Audit","selectedLevels":["A","AA"]}' > report.csv

# Teamwork Excel
curl -X POST http://localhost:3003/api/reports/{reportId}/export/excel \
  -H "Content-Type: application/json" \
  -d '{"tasklistName":"Accessibility Audit","selectedLevels":["A","AA"]}' > report.xlsx

# Jira CSV
curl -X POST http://localhost:3003/api/reports/{reportId}/export/jira \
  -H "Content-Type: application/json" \
  -d '{"selectedLevels":["A","AA"]}' > report-jira.csv
```

---

## API Reference

### Reports & Scanning

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/reports` | List all reports |
| `GET` | `/api/reports/:id` | Get a single report |
| `DELETE` | `/api/reports/:id` | Delete a report |
| `POST` | `/api/scan` | Start a scan (body: `auditType`, plus one of `urls[]`, `sitemap`, `xmlContent`, or `crawlUrl`) |
| `GET` | `/api/scan/:jobId/events` | SSE stream for scan progress |
| `DELETE` | `/api/scan/:jobId` | Abort a running scan |
| `POST` | `/api/reports/:id/export/csv` | Export as Teamwork CSV |
| `POST` | `/api/reports/:id/export/excel` | Export as Teamwork Excel |
| `POST` | `/api/reports/:id/export/jira` | Export as Jira CSV |

**Export request body (all formats):**

```json
{
  "tasklistName": "Accessibility Audit",
  "selectedLevels": ["A", "AA", "AAA", "best-practice"]
}
```

`selectedLevels` is optional — omit to export all levels. `tasklistName` applies to Teamwork formats only.

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | List all projects (includes `reportCount`) |
| `POST` | `/api/projects` | Create a project (body: `name`, `description?`) |
| `GET` | `/api/projects/:id` | Get a project and its reports |
| `PATCH` | `/api/projects/:id` | Update project name or description |
| `DELETE` | `/api/projects/:id` | Delete a project (reports are unassigned, not deleted) |
| `PATCH` | `/api/reports/:id/project` | Assign or unassign a report (body: `projectId` or `null`) |

**Scan with project assignment:**

```json
POST /api/scan
{
  "auditType": "all-inclusive",
  "sitemap": "https://example.com/sitemap.xml",
  "projectId": "proj_abc123"
}
```

### Manual Audit

| Method | Endpoint | Description |
|--------|----------|-------------|
| `PATCH` | `/api/reports/:id/pages/:pageId/manual-audit` | Update auditor notes |
| `PATCH` | `/api/reports/:id/pages/:pageId/manual-audit/complete` | Mark or unmark audit as complete |
| `PATCH` | `/api/reports/:id/pages/:pageId/manual-audit/checks/:checkId` | Update a check's status or notes |
| `POST` | `/api/reports/:id/pages/:pageId/manual-audit/checks` | Add a custom check |
| `DELETE` | `/api/reports/:id/pages/:pageId/manual-audit/checks/:checkId` | Delete a custom check |
| `POST` | `/api/reports/:id/pages/:pageId/manual-audit/checks/:checkId/failures` | Add a failure instance |
| `PATCH` | `/api/reports/:id/pages/:pageId/manual-audit/checks/:checkId/failures/:failureId` | Update a failure instance |
| `DELETE` | `/api/reports/:id/pages/:pageId/manual-audit/checks/:checkId/failures/:failureId` | Delete a failure instance |
