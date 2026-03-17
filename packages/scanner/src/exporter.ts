import { ScanReport, AxeViolation, ManualCheckResult, DetectedElement } from '@accessibility-scanner/shared';
import ExcelJS from 'exceljs';

/**
 * Export helpers that produce CSV/Excel payloads matching the layout
 * expected by the customer.  The sheet/CSV is deliberately modeled after
 * the sample that was attached to the original request:
 *
 *   TASKLIST,TASK,DESCRIPTION,ASSIGN TO,START DATE,DUE DATE,PRIORITY,
 *   ESTIMATED TIME,TAGS,STATUS
 *
 * The exporter will produce one row per violation type; each row contains
 * markdown-friendly text in the description column so that callers can
 * import the file into a system that understands markdown (Teamwork, etc.)
 *
 */
export class Reporter {
  /**
   * Return a CSV string that can be written to disk or streamed to the
   * client.  The output is quoted so that fields containing commas or
   * newlines are preserved; description text may contain Markdown and
   * will typically span multiple lines.
   */
  exportToCsv(report: ScanReport, selectedViolations?: string[], tasklistName?: string, selectedLevels?: string[]): string {
    const rows = this.buildRows(report, selectedViolations, tasklistName, selectedLevels);
    const manualRows = this.buildManualAuditRows(report);

    const allRows = manualRows.length > 0 ? [...rows, ...manualRows] : rows;

    return allRows
      .map((row: string[]) =>
        row
          .map((cell: string) =>
            cell.includes(',') || cell.includes('"') || cell.includes('\n')
              ? `"${cell.replace(/"/g, '""')}"`
              : cell
          )
          .join(',')
      )
      .join('\n');
  }

  /**
   * Produce an xlsx workbook buffer suitable for writing to disk or
   * streaming back to an HTTP client.  The sheet uses the same headers
   * as the CSV export and leaves all styling up to the caller (no fancy
   * formatting is performed).
   */
  async exportToExcel(report: ScanReport, selectedViolations?: string[], tasklistName?: string, selectedLevels?: string[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Accessibility');

    const rows = this.buildRows(report, selectedViolations, tasklistName, selectedLevels);
    rows.forEach((row: string[]) => {
      sheet.addRow(row);
    });

    const manualEntries = this.collectManualChecks(report);
    if (manualEntries.length > 0) {
      const manualSheet = workbook.addWorksheet('Manual Audit');
      manualSheet.addRow(['Criterion', 'Level', 'Title', 'Status', 'Notes', 'Impact', 'Last Updated']);
      manualEntries.forEach(({ check: c, failedElements }) => {
        const extraNotes = failedElements.length > 0
          ? `${c.notes ?? ''}\n\nFailed elements (${failedElements.length}):\n${failedElements.map(e => `- ${e.html}${e.auditComment ? ` — ${e.auditComment}` : ''}`).join('\n')}`.trim()
          : (c.notes ?? '');
        manualSheet.addRow([
          c.wcagCriterion ?? '',
          c.level ?? '',
          c.title,
          c.status,
          extraNotes,
          c.impact ?? '',
          c.updatedAt,
        ]);
      });
    }

    // exceljs returns a Uint8Array/Buffer-like object; normalize to Node Buffer
    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf as ArrayBuffer);
  }

  private buildRows(report: ScanReport, selectedViolations?: string[], tasklistName?: string, selectedLevels?: string[]): string[][] {
    const rows: string[][] = [];

    // header row matching sample file
    rows.push([
      'TASKLIST',
      'TASK',
      'DESCRIPTION',
      'ASSIGN TO',
      'START DATE',
      'DUE DATE',
      'PRIORITY',
      'ESTIMATED TIME',
      'TAGS',
      'STATUS'
    ]);

    // metadata row (row 2 in spreadsheet)
    rows.push([
      tasklistName?.trim() || 'Accessibility Updates',
      '',
      'Required Accessibility Updates',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    ]);

    // map violation ID to grouped data including html snippets
    const violationGroups = new Map<
      string,
      { violation: AxeViolation; pageNodes: Array<{ url: string; html: string }>; count: number }
    >();

    report.results.forEach(result => {
      result.violations
        .filter(v => {
            if (selectedViolations && !selectedViolations.includes(v.id)) return false;
            if (selectedLevels && selectedLevels.length > 0) {
              const vLevel = v.level ?? 'best-practice';
              if (!selectedLevels.includes(vLevel)) return false;
            }
            return true;
          })
        .forEach(violation => {
          if (!violationGroups.has(violation.id)) {
            violationGroups.set(violation.id, {
              violation,
              pageNodes: [],
              count: 0
            });
          }
          const group = violationGroups.get(violation.id)!;

          // each node represents a specific HTML snippet on the page
          violation.nodes.forEach(node => {
            group.pageNodes.push({ url: result.url, html: node.html });
            group.count++;
          });
        });
    });

    violationGroups.forEach(({ violation, pageNodes, count }) => {
      // deduplicate by url+html
      const seen = new Set<string>();
      const uniqueEntries = pageNodes.filter(p => {
        const key = `${p.url}||${p.html}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // if there are too many nodes, strip HTML and only keep unique urls
      const pagesForDescription: Array<{ url: string; html: string }> =
        uniqueEntries.length > 100
          ? [...new Set(uniqueEntries.map(p => p.url))].map(url => ({ url, html: '' }))
          : uniqueEntries;

      const firstSnippet = uniqueEntries[0]?.html ?? '';

      const descriptionMarkdown = this.buildDescriptionMarkdown(
        violation,
        pagesForDescription,
        count,
        firstSnippet
      );

      const resolvedTasklist = tasklistName?.trim() || 'Accessibility Updates';
      const wcagTags = this.wcagCriteriaTags(violation.tags);
      const severityTag = this.severityTag(violation.impact);
      const level = violation.level ?? 'best-practice';
      const levelTag = level !== 'best-practice' ? level : 'Best Practice';
      const tags = ['Accessibility', severityTag, levelTag, 'Automated'].join(', ');

      const firstCriterion = wcagTags[0]?.replace('WCAG ', '') ?? '';
      const taskName = firstCriterion
        ? `${firstCriterion} ${violation.help} | ${level !== 'best-practice' ? level : 'BP'}`
        : `${violation.help} | ${level !== 'best-practice' ? level : 'BP'}`;

      const row: string[] = [];
      row[0] = resolvedTasklist;
      row[1] = taskName;
      row[2] = descriptionMarkdown;
      // D-H stay empty (indices 3..7)
      row[8] = tags;    // column I
      row[9] = 'Active'; // column J

      rows.push(row);
    });

    return rows;
  }

  /**
   * Export a Jira-compatible CSV.  Each row is one violation type with the
   * fields Jira's CSV importer expects: Summary, Issue Type, Priority, Labels,
   * Description (Jira wiki markup).
   */
  exportToJiraCsv(report: ScanReport, selectedViolations?: string[], selectedLevels?: string[]): string {
    const rows: string[][] = [];

    rows.push(['Summary', 'Issue Type', 'Priority', 'Labels', 'Description']);

    const violationGroups = new Map<
      string,
      { violation: AxeViolation; pageNodes: Array<{ url: string; html: string }>; count: number }
    >();

    report.results.forEach(result => {
      result.violations
        .filter(v => {
          if (selectedViolations && !selectedViolations.includes(v.id)) return false;
          if (selectedLevels && selectedLevels.length > 0) {
            const vLevel = v.level ?? 'best-practice';
            if (!selectedLevels.includes(vLevel)) return false;
          }
          return true;
        })
        .forEach(violation => {
          if (!violationGroups.has(violation.id)) {
            violationGroups.set(violation.id, { violation, pageNodes: [], count: 0 });
          }
          const group = violationGroups.get(violation.id)!;
          violation.nodes.forEach(node => {
            group.pageNodes.push({ url: result.url, html: node.html });
            group.count++;
          });
        });
    });

    violationGroups.forEach(({ violation, pageNodes, count }) => {
      const seen = new Set<string>();
      const uniqueEntries = pageNodes.filter(p => {
        const key = `${p.url}||${p.html}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const pagesForDescription = uniqueEntries.length > 100
        ? [...new Set(uniqueEntries.map(p => p.url))].map(url => ({ url, html: '' }))
        : uniqueEntries;

      const wcagTags = this.wcagCriteriaTags(violation.tags);
      const firstCriterion = wcagTags[0]?.replace('WCAG ', '') ?? '';
      const level = violation.level ?? 'best-practice';
      const levelLabel = level !== 'best-practice' ? level : 'BP';
      const summary = firstCriterion
        ? `${firstCriterion} ${violation.help} | ${levelLabel}`
        : `${violation.help} | ${levelLabel}`;

      const priority = this.jiraPriority(violation.impact);

      // Labels: space-separated (Jira convention)
      const labelParts = ['Accessibility', 'Automated'];
      if (level !== 'best-practice') labelParts.push(`WCAG-${level}`);
      wcagTags.forEach(t => labelParts.push(t.replace(/\s/g, '-')));
      const labels = labelParts.join(' ');

      const description = this.buildJiraDescription(violation, pagesForDescription, count, uniqueEntries[0]?.html ?? '');

      rows.push([summary, 'Task', priority, labels, description]);
    });

    return rows
      .map(row =>
        row
          .map(cell =>
            cell.includes(',') || cell.includes('"') || cell.includes('\n')
              ? `"${cell.replace(/"/g, '""')}"`
              : cell
          )
          .join(',')
      )
      .join('\n');
  }

  private jiraPriority(impact: AxeViolation['impact']): string {
    const map: Record<AxeViolation['impact'], string> = {
      critical: 'Highest',
      serious:  'High',
      moderate: 'Medium',
      minor:    'Low',
    };
    return map[impact] ?? 'Low';
  }

  private buildJiraDescription(
    violation: AxeViolation,
    pages: Array<{ url: string; html: string }>,
    totalInstances: number,
    firstSnippet: string = ''
  ): string {
    const displayedPages = pages.length > 200 ? pages.slice(0, 200) : pages;
    const moreNote = pages.length > 200 ? '\nPlease see the dashboard for additional URLs.' : '';

    const pageList = displayedPages.map(p =>
      p.html
        ? `* ${p.url}\n{code:html}\n${p.html}\n{code}`
        : `* ${p.url}`
    ).join('\n');

    return `h3. Issue Description

${violation.description}

h3. Code Snippet

{code:html}
${firstSnippet || 'see affected pages below'}
{code}

h3. Affected Pages (${totalInstances})

${pageList}${moreNote}

h3. Remediation

*${violation.help}*

For more information: ${violation.helpUrl}

_Replace this section with the steps required to fix this issue._

h3. Steps to QA

_Replace this section with steps to validate the issue has been resolved._

h3. Recommended Assignment

* [ ] Content
* [ ] Design
* [ ] Engineer
`;
  }

  private collectManualChecks(report: ScanReport): Array<{ check: ManualCheckResult; failedElements: DetectedElement[] }> {
    const result: Array<{ check: ManualCheckResult; failedElements: DetectedElement[] }> = [];
    for (const page of report.results) {
      if (page.manualAudit) {
        for (const check of page.manualAudit.checks) {
          if (check.status !== 'not-tested') {
            const failedElements = check.wcagCriterion
              ? (page.detectedElements?.[check.wcagCriterion] ?? []).filter(e => e.auditStatus === 'fail')
              : [];
            result.push({ check, failedElements });
          }
        }
      }
    }
    return result;
  }

  private buildManualAuditRows(report: ScanReport): string[][] {
    const entries = this.collectManualChecks(report);
    if (entries.length === 0) return [];

    const rows: string[][] = [];
    rows.push(['--- MANUAL AUDIT ---']);
    rows.push(['Criterion', 'Level', 'Title', 'Status', 'Notes', 'Impact']);
    for (const { check, failedElements } of entries) {
      const extraNotes = failedElements.length > 0
        ? `${check.notes ?? ''}\n\nFailed elements (${failedElements.length}):\n${failedElements.map(e => `- ${e.html}${e.auditComment ? ` — ${e.auditComment}` : ''}`).join('\n')}`.trim()
        : (check.notes ?? '');
      rows.push([
        check.wcagCriterion ?? '',
        check.level ?? '',
        check.title,
        check.status,
        extraNotes,
        check.impact ?? '',
      ]);
    }
    return rows;
  }

  private wcagCriteriaTags(tags: string[]): string[] {
    return tags
      .filter(t => /^wcag\d{3,}$/.test(t))
      .map(t => {
        const d = t.replace('wcag', '');
        return `WCAG ${d[0]}.${d[1]}.${d.slice(2)}`;
      });
  }

  private severityTag(impact: AxeViolation['impact']): string {
    const map: Record<AxeViolation['impact'], string> = {
      critical: 'Critical Issue',
      serious:  'Major Issue',
      moderate: 'Medium Issue',
      minor:    'Minor Issue',
    };
    return map[impact] ?? 'Minor Issue';
  }

  private buildDescriptionMarkdown(
    violation: AxeViolation,
    pages: Array<{ url: string; html: string }>,
    totalInstances: number,
    firstSnippet: string = ''
  ): string {
    const moreNote = pages.length > 200
      ? '\n- **Please see dashboard for more URLs**'
      : '';
    const displayedPages = pages.length > 200 ? pages.slice(0, 200) : pages;

    const severity = this.severityTag(violation.impact);

    return `### 1. Describe the Issue

> to be completed by the **Auditor**

**a. Description of Issue**

> ${violation.description}

**b. Level of Severity**

> tag the task with level of severity: **${severity}**
> provide more detail for the level of severity decision

**c. Code Snippet**

> Add a code snippet for the section that is failing, if applicable.
> *Only one example is needed, as long as it conveys the issue appropriately.*

\`\`\`html
${firstSnippet || 'code snippet'}
\`\`\`

**d. Screenshot of Affected Area**

> Take a screenshot of the portion of the page that best demonstrates the issue.
> *Only one example is needed, as long as it conveys the issue appropriately.*

**e. Affected Pages (${totalInstances})**

${displayedPages.map(p => {
      if (!p.html) return `> ${p.url}`;
      return `> ${p.url}\n> \`\`\`html\n> ${p.html}\n> \`\`\``;
    }).join('\n\n')}${moreNote}

---

### 2. Remediation

> This can either be completed by the **Auditor** or the **Remediator**

> **${violation.help}**
>
> For more information: ${violation.helpUrl}
>
> *Replace with the steps it will take to fix this issue*

---

### 3. Steps to QA

> This is typically completed by the **Remediator**

> *Replace with steps on how to validate this issue has been resolved*

---

### 4. Recommend Assigning Remediation To

> *Select one or more*
> - [ ] Content
> - [ ] Design
> - [ ] Engineer
`;
  }

}
