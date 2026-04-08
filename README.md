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
- **Smart element detection** — on-demand per page for 9 WCAG criteria, plus automatic scan-time detection for media elements (1.2.1, 1.2.2); each detected element shows its HTML, computed text alternative, and cropped screenshot
- **Element screenshots** — each detected element gets a cropped screenshot and an annotated full-page context screenshot (element highlighted, surroundings dimmed)
- **Manual audit checklists** scoped per audit type — 13 criteria for Rapid, 20 for Mid-Level, all 52 for All-Inclusive
- **Shared page review workspace** — automated and manual page review now use a consistent workspace shell with breadcrumbs, mode switching, cards/list layout toggles, and per-page issue documentation flows
- **Failure instances** with scope tagging (Global / Common / Page Specific), code snippets, and screenshot capture
- **AI-assisted remediation suggestions** — generate fix recommendations inline from Claude (Anthropic), GPT-4o mini (OpenAI), Gemini Flash (Google), or Llama 3.1 (Groq); any combination of providers can be active simultaneously
- **Custom issues** — add findings that fall outside predefined WCAG criteria
- **Audit coverage tracking** — report overview shows how many pages have been manually audited
- **Background scanning** — scans continue running while you navigate; a floating pill shows progress and lets you abort from anywhere
- **Projects** — group related scans by client or engagement, with inline create, assign, and unassign
- **Export to Teamwork (.xlsx) or Jira (.csv)** — filterable by WCAG level (All / Automated only / Manual only), with structured descriptions, code snippets, and affected page lists; individual issues can be exported directly from the manual audit tab
- **JSON report transfer** — export any report as JSON and import it on another machine
- **Project transfer workflow** — move an entire project by exporting the reports in that project as JSON, importing them, then assigning them to a project on the destination machine
- **Editable report names** — rename any report from the dashboard card or report detail header
- **Local storage** in a simple JSON file — no database required
- **Feature requests** — submit ideas directly as GitHub issues from a persistent sidebar button

---

## Getting Started

### Prerequisites

- Node.js >= 22.12
- npm >= 10

### Installation

```bash
git clone git@github.com:10up/accessibility-scanner.git
cd accessibility-scanner
npm install
npm run build
```

### Run in development

```bash
npm run dev          # starts both API server (port 3003) and dashboard (port 5173)
```

### Run scanner via CLI

Single scan:

```bash
npm run scan -- scan -s https://example.com/sitemap.xml
```

Batched scan (150 pages per chunk):

```bash
npm run scan -- scan -s https://example.com/sitemap.xml --batch-size --batch-index 1
npm run scan -- scan -s https://example.com/sitemap.xml --batch-size --batch-index 2
# ...
```

Or run all batches in one command (auto-chunks + auto-merge):

```bash
npm run scan -- scan -s https://example.com/sitemap.xml --batch-size
```

This will scan all batches and then merge the chunks into one report automatically.

Merge partial reports (by ID or JSON path):

```bash
npm run scan -- merge -i <id1> <id2> <id3> -o packages/scanner/data/reports/merged.json
```

Clear all scans via CLI:

```bash
npm run scan -- clear
```

The scanner CLI is in `packages/scanner/src/index.ts` and supports options:
- `-s, --sitemap <url|path>` (required)
- `-c, --concurrent <number>` (default `8`)
- `--headless` (default `true`)
- `--batch-size` (enable batching in fixed groups of 150 pages)
- `--batch-index <number>` (1-based, required when batch-size is set for selective chunk runs)
- `--output <path>` (write report JSON to file instead of database; supports relative paths)

---

### Environment variables

Create `packages/scanner/.env` (copy from `.env.example` if present):

```bash
# Server
FRONTEND_ORIGIN=http://localhost:5173   # dashboard origin for CORS (default)
PORT=3003                               # API server port (default)

# AI providers — add any combination; the dashboard only shows providers with a key set
# ANTHROPIC_API_KEY=sk-ant-api03-...   # console.anthropic.com
# OPENAI_API_KEY=sk-proj-...           # platform.openai.com
# GEMINI_API_KEY=AIza...               # aistudio.google.com (free tier available)
# GROQ_API_KEY=gsk_...                 # console.groq.com (free tier available)

# Feature requests — creates GitHub issues from the in-app "Request a Feature" button
# GITHUB_TOKEN=ghp_...                 # github.com/settings/tokens — Issues: Read and write on this repo
```

At least one AI provider key is required to use the **Generate with AI** feature for remediation suggestions. If no keys are configured the feature is hidden. Multiple keys can be active simultaneously — auditors choose the provider from a dropdown.

To enable the **Request a Feature** button, add a `GITHUB_TOKEN` with **Issues: Read and write** permission on this repo. Create one at [github.com/settings/tokens](https://github.com/settings/tokens). If the token is not configured, the modal will display setup instructions.

### Report storage

Scan reports and project metadata are stored on disk under `packages/scanner/data/`: each full report is `reports/<report-id>.json`, with a `meta.json` index for listings and projects. There is no sign-in and no remote database in this build.

---

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

## Page Review Workspace

Each scanned page now opens in a shared review workspace with two coordinated modes:

- **Automated Issues** — review scanner output by `Violations`, `Passed`, or `Incomplete`, switch between `Cards` and `List` layouts, and create issues from individual detected instances instead of promoting an entire rule at once.
- **Manual Audit** — review WCAG criteria in the desktop workspace or list view, document failure instances, and track completion for the current page.

The page header uses breadcrumbs for navigation, keeps the page title separate from the raw URL, and keeps global scan actions in the main application header instead of duplicating them inside each page.

### Automated Review

The automated review workspace is designed to mirror the manual audit flow where it makes sense:

- Individual detected automated instances can be turned into issues with the same detailed issue editor used by manual audit failure instances.
- `Add failure instance` remains available at the rule level for issues the scanner did not detect directly.
- `Cards` mode uses larger surfaced cards for scanning and triage, while `List` mode stays denser for faster review across many rules.
- Expanded violation instances support screenshots, remediation notes, related WCAG criteria, assignees, and pass/fail overrides.

### Smart Element Detection

Several criteria surface a list of detected elements directly in the audit checklist, so auditors have a concrete starting point rather than hunting manually.

**Automatic detection (runs at scan time):**

- **WCAG 1.2.1 Audio-only and Video-only** — detects `<audio>` and silent `<video>` elements that require a transcript or audio description.
- **WCAG 1.2.2 Captions** — detects `<video>` elements with audio that require synchronized captions.

**On-demand detection (triggered per page via "Detect elements on page"):**

- **WCAG 1.1.1 Non-text Content** — images, SVGs, icon buttons, canvas, video, and other non-text elements, each shown with its computed text alternative (or a "no text alternative" indicator) and what a screen reader would announce.
- **WCAG 1.3.1 Info and Relationships** — detects form fields, tables, and headings to verify that structure conveyed visually is also expressed in markup.
- **WCAG 1.4.3 Contrast (Minimum)** — scans text elements against their computed background color in both light and dark modes and flags those failing the 4.5:1 / 3:1 ratio thresholds.
- **WCAG 2.1.1 Keyboard** — scans for non-interactive elements (divs, spans, list items, etc.) that have JS mouse/drag event listeners, inline `onclick`/`ondragstart` attributes, a `cursor: pointer` style, or CSS `:hover` rules that show or hide content — all patterns that suggest mouse-only interactions with no keyboard equivalent. Each flagged element is a suspect, not a guaranteed failure.
- **WCAG 2.1.2 No Keyboard Trap** — navigates through all focusable elements via keyboard simulation and flags any point where focus cannot escape.
- **WCAG 2.4.3 Focus Order** — renders the page at mobile, tablet, and desktop viewports and captures an annotated screenshot of the tab sequence so auditors can verify the order is logical.
- **WCAG 2.4.4 Link Purpose (In Context)** — detects links whose accessible name is ambiguous out of context (e.g. "Read more", "Click here").
- **WCAG 2.4.7 Focus Visible** — scans for interactive elements whose focus indicator is absent or overridden by CSS, flagging elements that may be invisible to keyboard users.
- **WCAG 3.2.1 On Focus** — intercepts JS `focus`/`focusin` event listeners and collects elements that could trigger a context change on focus.

If detection fails (browser error, page unreachable, timeout), the report is left unchanged and an error message is shown in the panel. Once elements are detected, a **Re-detect elements on page** button remains available below the panel title to re-run detection at any time.

All detected elements include a cropped screenshot, the element's HTML, and Pass / Fail / Not Reviewed status that auditors set inline.

### Failure Instances

Each failed criterion can have one or more recorded instances with:

- Scope tagging — Global, Common, or Page Specific
- Description, code snippet, and screenshot
- Remediation recommendation — written manually or generated with AI (see below)
- Direct export to Teamwork or Jira from the instance card

### AI-Assisted Remediation

Within any failure instance, the **Generate with AI** dropdown calls the configured AI provider to produce a concise, code-specific remediation suggestion. The suggestion is pre-filled into the remediation field and can be edited before saving.

Supported providers (configure in `packages/scanner/.env`):

| Provider | Model | Key variable | Free tier |
|----------|-------|-------------|-----------|
| Anthropic | claude-haiku-4-5 | `ANTHROPIC_API_KEY` | No |
| OpenAI | gpt-4o-mini | `OPENAI_API_KEY` | No |
| Google | gemini-1.5-flash | `GEMINI_API_KEY` | Yes (60 req/min) |
| Groq | llama-3.1-8b-instant | `GROQ_API_KEY` | Yes |

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

### Import / Export Projects as JSON

Seymour currently transfers project data through report JSON files.

1. On the source machine, open the project and export each report as JSON.
2. On the destination machine, use **Import JSON** on the dashboard to upload those files.
3. Create a project and assign imported reports to it.

Direct single-file project bundle import/export endpoints are not available yet.

---

## Exporting Results

Every report has an **Export** button on the dashboard card and in the report detail header. Individual manual audit checks and failure instances also have per-issue export buttons.

| Format | Description |
|--------|-------------|
| **Teamwork .xlsx** | Excel file with task columns for Teamwork import |
| **Jira .csv** | Jira wiki markup with `{code:html}` blocks and structured labels |
| **Report JSON** | Full report backup for cross-machine import |

Export options:
- **Tasklist name** — defaults to `Accessibility Audit YEAR | Report Name`
- **Filename** — defaults to a slug of the report name with year
- **Scope** — All issues, Automated only, or Manual only
- **WCAG level filter** — A, AA, AAA, Best Practice (hidden for manual-only exports)

Each exported issue includes a description, severity, code snippet, affected pages, remediation guidance, and QA steps placeholder.

### Importing Report JSON

Use **Import JSON** in the dashboard header to upload one or more report JSON files exported from Seymour.

- Imported reports are added to your local report list.
- If a report ID already exists locally, Seymour assigns a new ID to avoid collisions.
- Imported reports are not auto-assigned to a project; assign them after import.

---

## API Reference

### Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/reports` | List all reports |
| `GET` | `/api/reports/:id` | Get a single report |
| `PATCH` | `/api/reports/:id` | Update report metadata (`pageTitle`) |
| `DELETE` | `/api/reports/:id` | Delete a report |
| `PATCH` | `/api/reports/:id/project` | Assign or unassign a report (`projectId` or `null`) |
| `POST` | `/api/reports/:id/export/excel` | Export as Teamwork Excel |
| `POST` | `/api/reports/:id/export/jira` | Export as Jira CSV |
| `GET` | `/api/reports/:id/export/json` | Export one report as JSON |
| `POST` | `/api/reports/import` | Import one or more reports from JSON payload |

### Scanning

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/scan` | Start a scan |
| `GET` | `/api/scan/:jobId/events` | SSE stream for scan progress |
| `DELETE` | `/api/scan/:jobId` | Abort a running scan |

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
| `POST` | `/api/reports/:id/pages/:pageId/elements/1.1.1/detect` | On-demand: detect non-text elements (images, SVGs, icon buttons, canvas, video) |
| `POST` | `/api/reports/:id/pages/:pageId/elements/1.3.1/detect` | On-demand: detect form fields, tables, and headings |
| `POST` | `/api/reports/:id/pages/:pageId/elements/1.4.3/detect` | On-demand: detect contrast failures (light + dark mode) |
| `POST` | `/api/reports/:id/pages/:pageId/elements/2.1.1/detect` | On-demand: detect mouse-only interactions (JS listeners, inline handlers, CSS hover) |
| `POST` | `/api/reports/:id/pages/:pageId/elements/2.1.2/detect` | On-demand: detect keyboard trap risks |
| `POST` | `/api/reports/:id/pages/:pageId/elements/2.4.3/detect` | On-demand: detect focus order (mobile / tablet / desktop screenshots) |
| `POST` | `/api/reports/:id/pages/:pageId/elements/2.4.4/detect` | On-demand: detect ambiguous links |
| `POST` | `/api/reports/:id/pages/:pageId/elements/2.4.7/detect` | On-demand: detect missing or overridden focus indicators |
| `POST` | `/api/reports/:id/pages/:pageId/elements/3.2.1/detect` | On-demand: detect focus-triggered context changes |

### AI

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/ai/providers` | List configured AI providers |
| `POST` | `/api/ai/remediation-suggestion` | Generate a remediation suggestion |

### Feature Requests

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/feature-request/status` | Check if `GITHUB_TOKEN` is configured |
| `POST` | `/api/feature-request` | Create a GitHub issue from a feature request |

**Generate a suggestion:**

```json
POST /api/ai/remediation-suggestion
{
  "provider": "gemini",
  "criterion": "1.1.1",
  "checkTitle": "Non-text Content",
  "notes": "Icon button has no accessible label",
  "codeSnippet": "<button><svg>...</svg></button>"
}
```

`provider` is optional — omit to use the first configured provider. Valid values: `"anthropic"`, `"openai"`, `"gemini"`, `"groq"`.
