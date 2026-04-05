import { ScanReport, AxeViolation, ManualCheckResult, DetectedElement } from '../../shared/dist/index.js';
import ExcelJS from 'exceljs';
import type { Stream } from 'stream';

/**
 * Export helpers that produce Excel/CSV payloads matching the Teamwork
 * import format:
 *
 *   TASKLIST,TASK,DESCRIPTION,ASSIGN TO,START DATE,DUE DATE,PRIORITY,
 *   ESTIMATED TIME,TAGS,STATUS
 *
 */
function defaultTasklistName(report: ScanReport): string {
  const year = new Date().getFullYear();
  const name = report.pageTitle || report.sitemap.replace(/https?:\/\//, '') || 'Report';
  return `Accessibility Audit ${year} | ${name}`;
}

export class Reporter {
  /**
   * Produce an xlsx workbook buffer suitable for writing to disk or
   * streaming back to an HTTP client.  The sheet uses the same headers
   * as the CSV export and leaves all styling up to the caller (no fancy
   * formatting is performed).
   */
  async exportToExcel(report: ScanReport, selectedViolations?: string[], tasklistName?: string, selectedLevels?: string[], exportScope: 'all' | 'automated' | 'manual' = 'all'): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    if (exportScope === 'manual') {
      const sheet = workbook.addWorksheet('Accessibility');
      const rows = this.buildManualTeamworkRows(report, tasklistName);
      rows.forEach(row => sheet.addRow(row));
    } else {
      const sheet = workbook.addWorksheet('Accessibility');
      const rows = this.buildRows(report, selectedViolations, tasklistName, selectedLevels);
      rows.forEach((row: string[]) => { sheet.addRow(row); });

      if (exportScope === 'all') {
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
      }
    }

    // exceljs returns a Uint8Array/Buffer-like object; normalize to Node Buffer
    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf as ArrayBuffer);
  }

  async streamToExcel(
    report: ScanReport,
    stream: NodeJS.WritableStream,
    selectedViolations?: string[],
    tasklistName?: string,
    selectedLevels?: string[],
    exportScope: 'all' | 'automated' | 'manual' = 'all',
  ): Promise<void> {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: stream as unknown as Stream,
      useStyles: false,
      useSharedStrings: true,
    });

    if (exportScope === 'manual') {
      const manualSheet = workbook.addWorksheet('Accessibility');
      const rows = this.buildManualTeamworkRows(report, tasklistName);
      rows.forEach(row => manualSheet.addRow(row).commit());
      await workbook.commit();
      return;
    }

    const sheet = workbook.addWorksheet('Accessibility');
    this.writeExcelRows(sheet, report, selectedViolations, tasklistName, selectedLevels);

    if (exportScope === 'all') {
      const manualEntries = this.collectManualChecks(report);
      if (manualEntries.length > 0) {
        const manualSheet = workbook.addWorksheet('Manual Audit');
        manualSheet.addRow(['Criterion', 'Level', 'Title', 'Status', 'Notes', 'Impact', 'Last Updated']).commit();
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
          ]).commit();
        });
      }
    }

    await workbook.commit();
  }

  async streamToExcelFromPages(
    stream: NodeJS.WritableStream,
    pageIterator: (callback: (page: ScanReport['results'][number]) => Promise<void> | void) => Promise<void>,
    selectedViolations?: string[],
    tasklistName?: string,
    selectedLevels?: string[],
    exportScope: 'all' | 'automated' | 'manual' = 'all',
  ): Promise<void> {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: stream as unknown as Stream,
      useStyles: false,
      useSharedStrings: true,
    });

    let sheet: ExcelJS.Worksheet | null = null;
    let manualSheet: ExcelJS.Worksheet | null = null;
    const ensureManualSheet = () => {
      if (!manualSheet) {
        manualSheet = workbook.addWorksheet('Manual Audit');
        manualSheet.addRow(['Criterion', 'Level', 'Title', 'Status', 'Notes', 'Impact', 'Last Updated']).commit();
      }
      return manualSheet;
    };

    if (exportScope !== 'manual') {
      sheet = workbook.addWorksheet('Accessibility');
      sheet.addRow([
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
      ]).commit();

      sheet.addRow([
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
      ]).commit();
    }

    const violationGroups = new Map<
      string,
      { violation: AxeViolation; pageNodes: Array<{ url: string; html: string }>; count: number }
    >();

    await pageIterator(async (page: ScanReport['results'][number]) => {
      if (exportScope !== 'manual') {
        for (const violation of page.violations.filter((v: AxeViolation) => {
          if (selectedViolations && !selectedViolations.includes(v.id)) return false;
          if (selectedLevels && selectedLevels.length > 0) {
            const vLevel = v.level ?? 'best-practice';
            if (!selectedLevels.includes(vLevel)) return false;
          }
          return true;
        })) {
          if (!violationGroups.has(violation.id)) {
            violationGroups.set(violation.id, {
              violation,
              pageNodes: [],
              count: 0
            });
          }
          const group = violationGroups.get(violation.id)!;
          for (const node of violation.nodes) {
            group.pageNodes.push({ url: page.url, html: node.html });
            group.count++;
          }
        }
      }

      if (exportScope !== 'automated' && page.manualAudit) {
        for (const check of page.manualAudit.checks) {
          if (check.status !== 'not-tested') {
            const failedElements = check.wcagCriterion
              ? (page.detectedElements?.[check.wcagCriterion] ?? []).filter((e: DetectedElement) => e.auditStatus === 'fail')
              : [];
            const manualSheetRef = ensureManualSheet();
            const extraNotes = failedElements.length > 0
              ? `${check.notes ?? ''}\n\nFailed elements (${failedElements.length}):\n${failedElements.map((e: DetectedElement) => `- ${e.html}${e.auditComment ? ` — ${e.auditComment}` : ''}`).join('\n')}`.trim()
              : (check.notes ?? '');
            manualSheetRef.addRow([
              check.wcagCriterion ?? '',
              check.level ?? '',
              check.title,
              check.status,
              extraNotes,
              check.impact ?? '',
              check.updatedAt,
            ]).commit();
          }
        }
      }
    });

    if (exportScope !== 'manual') {
      violationGroups.forEach(({ violation, pageNodes, count }) => {
        const seen = new Set<string>();
        const uniqueEntries = pageNodes.filter(p => {
          const key = `${p.url}||${p.html}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

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
        row[8] = tags;
        row[9] = 'Active';

        sheet?.addRow(row).commit();
      });
    }

    if (exportScope === 'manual' && !manualSheet) {
      ensureManualSheet();
    }

    await workbook.commit();
  }

  async streamToJiraCsvFromPages(
    stream: NodeJS.WritableStream,
    pageIterator: (callback: (page: ScanReport['results'][number]) => Promise<void> | void) => Promise<void>,
    selectedViolations?: string[],
    selectedLevels?: string[],
    exportScope: 'all' | 'automated' | 'manual' = 'all',
  ): Promise<void> {
    const violationGroups = new Map<
      string,
      { violation: AxeViolation; pageNodes: Array<{ url: string; html: string }>; count: number }
    >();
    const manualEntries: ManualCheckResult[] = [];

    await pageIterator(async (page: ScanReport['results'][number]) => {
      if (exportScope !== 'manual') {
        for (const violation of page.violations.filter((v: AxeViolation) => {
          if (selectedViolations && !selectedViolations.includes(v.id)) return false;
          if (selectedLevels && selectedLevels.length > 0) {
            const vLevel = v.level ?? 'best-practice';
            if (!selectedLevels.includes(vLevel)) return false;
          }
          return true;
        })) {
          if (!violationGroups.has(violation.id)) {
            violationGroups.set(violation.id, {
              violation,
              pageNodes: [],
              count: 0,
            });
          }

          const group = violationGroups.get(violation.id)!;
          for (const node of violation.nodes) {
            group.pageNodes.push({ url: page.url, html: node.html });
            group.count += 1;
          }
        }
      }

      if (exportScope !== 'automated' && page.manualAudit) {
        for (const check of page.manualAudit.checks) {
          if (check.status !== 'not-tested') {
            manualEntries.push(check);
          }
        }
      }
    });

    const escapeCell = (value: string): string => {
      const escaped = value.replace(/"/g, '""');
      return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')
        ? `"${escaped}"`
        : escaped;
    };

    const writeLine = (row: string[]) => {
      stream.write(row.map(escapeCell).join(',') + '\n');
    };

    writeLine(['Summary', 'Issue Type', 'Priority', 'Labels', 'Description']);

    if (exportScope !== 'manual') {
      violationGroups.forEach(({ violation, pageNodes, count }) => {
        const seen = new Set<string>();
        const uniqueEntries = pageNodes.filter(p => {
          const key = `${p.url}||${p.html}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const pagesForDescription: Array<{ url: string; html: string }> =
          uniqueEntries.length > 100
            ? [...new Set(uniqueEntries.map(p => p.url))].map(url => ({ url, html: '' }))
            : uniqueEntries;

        const descriptionText = this.buildDescriptionMarkdown(
          violation,
          pagesForDescription,
          count,
          uniqueEntries[0]?.html ?? '',
        );

        const wcagTags = this.wcagCriteriaTags(violation.tags);
        const severityTag = this.severityTag(violation.impact);
        const level = violation.level ?? 'best-practice';
        const levelTag = level !== 'best-practice' ? level : 'Best Practice';
        const labels = ['Accessibility', severityTag, levelTag, 'Automated'].join(', ');
        const issueType = 'Task';
        const priority = 'Medium';
        const summary = wcagTags[0]
          ? `${wcagTags[0]} ${violation.help}`
          : violation.help;

        writeLine([summary, issueType, priority, labels, descriptionText]);
      });
    }

    if (exportScope !== 'automated') {
      manualEntries.forEach(check => {
        writeLine(this.buildManualJiraRow(check));
      });
    }

    stream.end();
  }

  private writeExcelRows(sheet: ExcelJS.Worksheet, report: ScanReport, selectedViolations?: string[], tasklistName?: string, selectedLevels?: string[]): void {
    sheet.addRow([
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
    ]).commit();

    sheet.addRow([
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
    ]).commit();

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
      row[8] = tags;
      row[9] = 'Active';

      sheet.addRow(row).commit();
    });
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
      tasklistName?.trim() || defaultTasklistName(report),
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

      const resolvedTasklist = tasklistName?.trim() || defaultTasklistName(report);
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
  exportToJiraCsv(report: ScanReport, selectedViolations?: string[], selectedLevels?: string[], exportScope: 'all' | 'automated' | 'manual' = 'all'): string {
    const rows: string[][] = [];

    rows.push(['Summary', 'Issue Type', 'Priority', 'Labels', 'Description']);

    if (exportScope === 'manual') {
      const manualEntries = this.collectManualChecks(report);
      manualEntries.forEach(({ check }) => {
        rows.push(this.buildManualJiraRow(check));
      });
      return this.rowsToCsv(rows);
    }

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

    if (exportScope === 'all') {
      const manualEntries = this.collectManualChecks(report);
      manualEntries.forEach(({ check }) => {
        rows.push(this.buildManualJiraRow(check));
      });
    }

    return this.rowsToCsv(rows);
  }

  private rowsToCsv(rows: string[][]): string {
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

  /** Format a single ManualCheckResult as a Jira CSV row (no header). */
  buildManualJiraRow(check: ManualCheckResult): string[] {
    const criterion = check.wcagCriterion ?? '';
    const level = check.level ?? '';
    const levelLabel = level || 'Manual';
    const summary = criterion
      ? `${criterion} ${check.title} | ${levelLabel}`
      : `${check.title} | Manual`;

    const impactMap: Record<string, string> = { critical: 'Highest', serious: 'High', moderate: 'Medium', minor: 'Low' };
    const priority = check.impact ? (impactMap[check.impact] ?? 'Medium') : 'Medium';

    const labelParts = ['Accessibility', 'Manual'];
    if (level) labelParts.push(`WCAG-${level}`);
    if (criterion) labelParts.push(`WCAG-${criterion.replace(/\./g, '')}`);
    const labels = labelParts.join(' ');

    const description = this.buildManualJiraDescription(check);
    return [summary, 'Task', priority, labels, description];
  }

  private buildManualJiraDescription(check: ManualCheckResult): string {
    const notes = check.notes ? `${check.notes}` : '_No description provided._';
    const codeBlock = check.codeSnippet
      ? `\nh3. Code Snippet\n\n{code:html}\n${check.codeSnippet}\n{code}\n`
      : '';

    const failureLines = (check.failures ?? [])
      .map((f, i) => {
        const parts = [`*Instance ${i + 1}*`];
        if (f.notes) parts.push(f.notes);
        if (f.codeSnippet) parts.push(`{code:html}\n${f.codeSnippet}\n{code}`);
        if (f.remediationRecommendation) parts.push(`_Recommendation:_ ${f.remediationRecommendation}`);
        return parts.join('\n');
      })
      .join('\n\n');

    const failuresSection = failureLines
      ? `\nh3. Failure Instances\n\n${failureLines}\n`
      : '';

    const failureRemediation2 = (check.failures ?? [])
      .map(f => f.remediationRecommendation).filter(Boolean).join('\n\n');
    const remediationSection = failureRemediation2
      || '_Replace this section with the steps required to fix this issue._';

    return `h3. Issue Description

${notes}
${codeBlock}${failuresSection}
h3. Remediation

${remediationSection}

h3. Steps to QA

_Replace this section with steps to validate the issue has been resolved._

h3. Recommended Assignment

* [ ] Content
* [ ] Design
* [ ] Engineer
`;
  }

  /** Format a single ManualCheckResult as Teamwork-style CSV rows (header + metadata + data). */
  buildManualTeamworkRows(report: ScanReport, tasklistName?: string): string[][] {
    const entries = this.collectManualChecks(report);
    if (entries.length === 0) {
      // Return headers only so the file is still valid
      return [[
        'TASKLIST', 'TASK', 'DESCRIPTION', 'ASSIGN TO', 'START DATE',
        'DUE DATE', 'PRIORITY', 'ESTIMATED TIME', 'TAGS', 'STATUS',
      ]];
    }

    const resolvedTasklist = tasklistName?.trim() || defaultTasklistName(report);
    const rows: string[][] = [
      ['TASKLIST', 'TASK', 'DESCRIPTION', 'ASSIGN TO', 'START DATE', 'DUE DATE', 'PRIORITY', 'ESTIMATED TIME', 'TAGS', 'STATUS'],
      [resolvedTasklist, '', 'Required Accessibility Updates', '', '', '', '', '', '', ''],
    ];

    for (const { check } of entries) {
      rows.push(this.singleManualCheckTeamworkRow(check, resolvedTasklist));
    }
    return rows;
  }

  /** Single-row Teamwork export for one manual check (no headers). */
  singleManualCheckTeamworkRow(check: ManualCheckResult, tasklistName = 'Accessibility Audit'): string[] {
    const criterion = check.wcagCriterion ?? '';
    const level = check.level ?? '';
    const levelLabel = level || 'Manual';
    const taskName = criterion
      ? `${criterion} ${check.title} | ${levelLabel}`
      : `${check.title} | Manual`;

    const description = this.buildManualTeamworkDescription(check);

    const tagParts = ['Accessibility', 'Manual'];
    if (level) tagParts.push(level);
    if (check.impact) tagParts.push(check.impact.charAt(0).toUpperCase() + check.impact.slice(1) + ' Issue');
    const tags = tagParts.join(', ');

    const impactPriorityMap: Record<string, string> = { critical: 'Urgent', serious: 'High', moderate: 'Medium', minor: 'Low' };
    const priority = check.impact ? (impactPriorityMap[check.impact] ?? '') : '';

    const row: string[] = new Array(10).fill('');
    row[0] = tasklistName;
    row[1] = taskName;
    row[2] = description;
    row[6] = priority;
    row[8] = tags;
    row[9] = 'Active';
    return row;
  }

  private buildManualTeamworkDescription(check: ManualCheckResult): string {
    const notes = check.notes ?? 'No description provided.';
    const codeSnippet = check.codeSnippet
      ? `\n**c. Code Snippet**\n\n\`\`\`html\n${check.codeSnippet}\n\`\`\`\n`
      : '';

    const failureLines = (check.failures ?? [])
      .map((f, i) => {
        const parts = [`**Instance ${i + 1}**`];
        if (f.notes) parts.push(`> ${f.notes}`);
        if (f.codeSnippet) parts.push(`\`\`\`html\n${f.codeSnippet}\n\`\`\``);
        if (f.remediationRecommendation) parts.push(`> *Recommendation:* ${f.remediationRecommendation}`);
        return parts.join('\n');
      })
      .join('\n\n');

    const failuresSection = failureLines
      ? `\n**d. Failure Instances**\n\n${failureLines}\n`
      : '';

    const failureRemediation = (check.failures ?? [])
      .map(f => f.remediationRecommendation).filter(Boolean).join('\n\n');
    const remediationText = failureRemediation || '*Replace with the steps required to fix this issue.*';

    return `### 1. Describe the Issue

> to be completed by the **Auditor**

**a. Description of Issue**

> ${notes}
${codeSnippet}${failuresSection}
---

### 2. Remediation

> ${remediationText}

---

### 3. Steps to QA

> *Replace with steps on how to validate this issue has been resolved*

---

### 4. Recommend Assigning Remediation To

> *Select one or more*
> - [ ] Content
> - [ ] Design
> - [ ] Engineer
`;
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
