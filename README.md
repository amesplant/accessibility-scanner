# Accessibility Scanner

A comprehensive TypeScript tool for automated and manual accessibility testing using axe-core and Puppeteer. Supports three audit tiers — Rapid, Mid-Level, and All-Inclusive — with a React dashboard for viewing results and exporting data as .csv or .xlsx.

## Features

- 🎯 Three audit types: **Rapid** (up to 5 pages), **Mid-Level** (any number of pages), and **All-Inclusive** (full site via sitemap or crawl)
- 🔍 Automated website scanning via sitemap URL, XML file upload, or site crawl
- ♿ Powered by axe-core for WCAG compliance testing
- 📋 Manual audit checklist scoped to each audit type — 13 criteria for Rapid (Quick Assess), 20 for Mid-Level, all 52 for All-Inclusive
- 🗂️ Multiple failure instances per criterion with scope tagging (Global / Common / Page Specific) and evidence capture (code snippet + screenshot)
- ✅ Audit completion tracking with coverage percentage displayed in the report overview
- 📊 React dashboard for visualizing results with WCAG criteria and level details
- 📁 Export functionality (CSV / Excel) formatted for task‑tracking tools (Teamwork, etc.)
- ⚡ Concurrent page scanning for performance
- 💾 Local storage in a simple JSON file (`data/reports.json`)
- 📈 Detailed reports with violation tracking, impact, WCAG level, and criteria
- 🛑 Abort a running scan at any time
- 🏷️ Page titles displayed throughout the dashboard in place of raw URLs

## Getting Started

### Prerequisites

- Node.js >= 20.19+ or 22.12+
- npm >= 10

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/accessibility-scanner.git
cd accessibility-scanner

# Install dependencies
npm install
```

### Build all packages

```bash
npm run build
```

## Usage

### Dashboard

Start both API server and dashboard in development mode:

```bash
npm run dev
```

Or start them individually:

```bash
npm run dev:server    # API server on port 3003
npm run dev:dashboard # Dashboard on port 5173
```

### Starting a Scan

#### Choosing an Audit Type

Select the audit tier that best fits your engagement before starting a scan:

| Audit Type | Pages | Input Method | Manual Checklist |
|------------|-------|-------------|-----------------|
| **Rapid Audit** | Up to 5 | Manual URL list | 13 key Quick Assess criteria |
| **Mid-Level** | Any number | Manual URL list | 20 WCAG 2.2 AA criteria |
| **All-Inclusive** | Full site | Sitemap URL, XML upload, or crawl | All 52 criteria |

**Rapid Audit** — A focused evaluation targeting the most critical accessibility issues: color contrast, heading structure, alt text, and keyboard accessibility. Ideal for a fast assessment of core pages (~15 hours).

**Mid-Level** — A thorough assessment across a representative set of pages covering both major and minor issues using automated, manual, and screen reader testing.

**All-Inclusive** — A comprehensive evaluation of every page on your site against the highest accessibility standards using automated scanning.

#### All-Inclusive scan input modes

| Mode | Description |
|------|-------------|
| **Sitemap URL** | Provide a URL to an XML sitemap (e.g. `https://example.com/sitemap.xml`) or a local file path |
| **Upload XML** | Upload a sitemap XML file directly from your machine |
| **Crawl Site** | Provide a starting URL — the scanner follows internal links downward from that path |

#### Crawl mode tips

- The crawler only follows links **at or below** the starting path — e.g. starting at `https://example.com/blog/` will not crawl `/about/` or the homepage.
- Default max pages: **200** (~5–10 min at default concurrency).
- Max pages cap: **500** — larger crawls can take 30+ min and use significantly more memory.
- A scan in progress can be **aborted** at any time using the Abort button; no partial data is saved.
- The crawler uses a full Puppeteer browser to render JavaScript before extracting links, ensuring pages loaded dynamically (infinite scroll, client-side routing, etc.) are discovered correctly.

### Managing Reports

- Reports are listed on the dashboard home page, showing the **page title** of the scanned site as the heading with the URL as a subtitle.
- The **Reports** nav dropdown also displays page titles for quick identification.
- Each report can be **removed** individually via the Remove button on its card.
- When a scan is running the **New Scan** button in the nav is disabled until it completes or is aborted.

### Report Detail

Each report includes:

- **Overview** — violations by impact, violations by WCAG level, top violation types, and manual audit coverage percentage
- **Violations** — accordion cards grouped by violation type, filterable by impact and WCAG level, with affected pages linked
- **Pages** — per-page results filterable by status (audited / not yet audited), with a detail panel for each page
- **Export** — download a formatted task list (see below)

#### Page Detail

Each page has two tabs:

- **Automated Issues** — axe-core violations with impact and WCAG level filters, expandable instances showing element selectors and HTML
- **Manual Audit** — full manual checklist (see below)

Individual violation cards show:

- WCAG success criterion number (e.g. `2.4.2`) prepended to the violation name
- **Level** badge — conformance level (A, AA, AAA, or best-practice)
- **WCAG Criteria** badges — individual criterion references (e.g. `2.4.2`)
- Clickable impact and level badges to filter inline

### Manual Audit

The manual audit tab on each page detail covers WCAG criteria that axe-core cannot fully verify automatically. The checklist is scoped to the audit type selected at scan time:

| Audit Type | Criteria shown | Scope |
|------------|---------------|-------|
| Rapid Audit | 13 | Quick Assess criteria (keyboard, focus, links, images, headings, contrast, reflow, bypass blocks) |
| Mid-Level | 20 | Core WCAG 2.2 AA criteria including color, landmarks, forms, tables, audio/video, and keyboard |
| All-Inclusive | 52 | Full predefined checklist covering WCAG A, AA, and AAA |

#### Checklist

- Each check includes a description and "How to test" guidance questions
- Checks are grouped and can be viewed by **WCAG Level**, **Category**, **Priority**, or **Status**
- Level and category filter controls let you focus on a subset of checks
- Each group shows a collapsed summary of pass/fail/n/a/not-tested counts

#### Statuses

Each check has one of four statuses:

| Status | Meaning |
|--------|---------|
| ✓ Pass | Criterion is met |
| ✗ Fail | Criterion is not met (add failure instances) |
| — N/A | Criterion is not applicable to this page |
| ? Not Tested | Not yet reviewed (default) |

#### Failure Instances

When a criterion fails, you can record one or more individual failure instances — each with:

- **Scope tag** — **Global** (affects the whole site), **Common** (appears on many pages), or **Page Specific**
- **Description** — free-text note describing what failed
- **Code snippet** — paste or type the relevant HTML
- **Screenshot** — upload an image or paste from clipboard

Instances are added via "Add failure instance" on any check row. Deleting the last instance automatically resets the check status back to Not Tested.

#### Custom Issues

Use **Add Custom Issue** to record findings that don't map to a predefined WCAG criterion. Custom issues support a title, description, impact level, status, and notes.

#### Auditor Notes & Completion

- **Auditor Notes** — a free-text field for overall page-level observations
- **Mark Audit Complete** — locks in the audit; shows a completion timestamp and "Audited" badge on the pages list
- **Re-open** — reverts completion to allow further edits; focus management ensures keyboard users stay oriented after each action

#### Manual Audit Coverage

The report **Overview** tab shows a **Manual Audit Coverage** card with a progress bar indicating how many pages have been marked complete.

### Exporting Results

The **Export** tab on any report lets you download a formatted task list for import into Teamwork or similar tools.

**Export options:**

- **Format** — Teamwork `.xlsx` or `.csv`
- **Tasklist Name** — name for the task group in your project management tool
- **File Name** — custom filename for the downloaded file (defaults to `accessibility-issues-{reportId}`)
- **Select Violations** — export all violation types or a single selected type

**Each exported task includes:**

- **Task name** — formatted as `2.4.2 Documents must have <title> element | AA`
- **Tags** — `Accessibility`, severity level (e.g. `Major Issue`), and WCAG conformance level (e.g. `AA`)
- **Description** — structured Markdown template with:
  1. Description of issue (pre-filled)
  2. Level of severity (pre-filled with impact label)
  3. WCAG criteria (pre-filled)
  4. Code snippet placeholder
  5. Screenshot placeholder
  6. Affected pages list
  7. Remediation section (pre-filled with axe help text and link)
  8. Steps to QA placeholder
  9. Recommended assignee checklist (Content / Design / Engineer)

Both formats can also be obtained via the API:

```bash
# CSV export
curl -X POST http://localhost:3003/api/reports/{reportId}/export/csv \
  -H "Content-Type: application/json" \
  -d '{"tasklistName":"Accessibility Updates"}' > report.csv

# Excel export
curl -X POST http://localhost:3003/api/reports/{reportId}/export/excel \
  -H "Content-Type: application/json" \
  -d '{"tasklistName":"Accessibility Updates"}' > report.xlsx
```

## API Reference

### Reports & Scanning

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/reports` | List all reports |
| `GET` | `/api/reports/:id` | Get a single report |
| `DELETE` | `/api/reports/:id` | Delete a report |
| `POST` | `/api/scan` | Start a new scan job (body: `auditType`, plus one of `urls[]`, `sitemap`, `xmlContent`, or `crawlUrl`) |
| `GET` | `/api/scan/:jobId/events` | SSE stream for scan progress |
| `DELETE` | `/api/scan/:jobId` | Abort a running scan |
| `POST` | `/api/reports/:id/export/csv` | Export report as CSV |
| `POST` | `/api/reports/:id/export/excel` | Export report as Excel |

### Manual Audit

| Method | Endpoint | Description |
|--------|----------|-------------|
| `PATCH` | `/api/reports/:id/pages/:pageId/manual-audit` | Update page-level auditor notes |
| `PATCH` | `/api/reports/:id/pages/:pageId/manual-audit/complete` | Mark or unmark audit as complete |
| `PATCH` | `/api/reports/:id/pages/:pageId/manual-audit/checks/:checkId` | Update a check's status or notes |
| `POST` | `/api/reports/:id/pages/:pageId/manual-audit/checks` | Add a custom check |
| `DELETE` | `/api/reports/:id/pages/:pageId/manual-audit/checks/:checkId` | Delete a custom check |
| `POST` | `/api/reports/:id/pages/:pageId/manual-audit/checks/:checkId/failures` | Add a failure instance |
| `PATCH` | `/api/reports/:id/pages/:pageId/manual-audit/checks/:checkId/failures/:failureId` | Update a failure instance |
| `DELETE` | `/api/reports/:id/pages/:pageId/manual-audit/checks/:checkId/failures/:failureId` | Delete a failure instance |
