import * as XLSX from 'xlsx';
import type { ManualCheckResult } from '@accessibility-scanner/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FailureExportData {
  notes?: string;
  codeSnippet?: string;
  remediationRecommendation?: string;
  checkContext?: { criterion?: string; title?: string; level?: string; description?: string };
  tasklistName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowsToCsv(rows: string[][]): string {
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

function triggerCsvDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function triggerXlsxDownload(rows: string[][], filename: string) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Issues');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function toSlug(text: string, maxLen = 50): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, maxLen);
}

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function checkSlug(check: ManualCheckResult): string {
  const base = check.wcagCriterion
    ? `${check.wcagCriterion.replace(/\./g, '-')}-${check.title}`
    : check.title;
  return `${toSlug(base)}-${today()}`;
}

function failureSlug(data: FailureExportData): string {
  const ctx = data.checkContext;
  const base = ctx?.criterion
    ? `${ctx.criterion.replace(/\./g, '-')}-${ctx.title ?? 'issue'}`
    : (ctx?.title ?? 'issue');
  return `${toSlug(base)}-${today()}`;
}

// ---------------------------------------------------------------------------
// Teamwork / XLSX — check level
// ---------------------------------------------------------------------------

function buildTeamworkDescription(check: ManualCheckResult): string {
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

  const failuresSection = failureLines ? `\n**d. Failure Instances**\n\n${failureLines}\n` : '';

  const failureRemediation = (check.failures ?? []).map(f => f.remediationRecommendation).filter(Boolean).join('\n\n');
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

export function exportCheckAsTeamworkXlsx(check: ManualCheckResult, tasklistName = 'Accessibility Audit', fileName?: string) {
  const criterion = check.wcagCriterion ?? '';
  const level = check.level ?? '';
  const levelLabel = level || 'Manual';
  const taskName = criterion ? `${criterion} ${check.title} | ${levelLabel}` : `${check.title} | Manual`;

  const tagParts = ['Accessibility', 'Manual'];
  if (level) tagParts.push(level);
  if (check.impact) tagParts.push(check.impact.charAt(0).toUpperCase() + check.impact.slice(1) + ' Issue');

  const priorityMap: Record<string, string> = { critical: 'Urgent', serious: 'High', moderate: 'Medium', minor: 'Low' };
  const priority = check.impact ? (priorityMap[check.impact] ?? '') : '';

  const dataRow: string[] = new Array(10).fill('');
  dataRow[0] = tasklistName;
  dataRow[1] = taskName;
  dataRow[2] = buildTeamworkDescription(check);
  dataRow[6] = priority;
  dataRow[8] = tagParts.join(', ');
  dataRow[9] = 'Active';

  const rows = [
    ['TASKLIST', 'TASK', 'DESCRIPTION', 'ASSIGN TO', 'START DATE', 'DUE DATE', 'PRIORITY', 'ESTIMATED TIME', 'TAGS', 'STATUS'],
    [tasklistName, '', 'Required Accessibility Updates', '', '', '', '', '', '', ''],
    dataRow,
  ];

  triggerXlsxDownload(rows, fileName || checkSlug(check));
}

// ---------------------------------------------------------------------------
// Jira — check level
// ---------------------------------------------------------------------------

function buildJiraDescription(check: ManualCheckResult): string {
  const notes = check.notes || '_No description provided._';
  const codeBlock = check.codeSnippet ? `\nh3. Code Snippet\n\n{code:html}\n${check.codeSnippet}\n{code}\n` : '';

  const failureLines = (check.failures ?? [])
    .map((f, i) => {
      const parts = [`*Instance ${i + 1}*`];
      if (f.notes) parts.push(f.notes);
      if (f.codeSnippet) parts.push(`{code:html}\n${f.codeSnippet}\n{code}`);
      if (f.remediationRecommendation) parts.push(`_Recommendation:_ ${f.remediationRecommendation}`);
      return parts.join('\n');
    })
    .join('\n\n');

  const failuresSection = failureLines ? `\nh3. Failure Instances\n\n${failureLines}\n` : '';
  const failureRemediation = (check.failures ?? []).map(f => f.remediationRecommendation).filter(Boolean).join('\n\n');
  const remediationSection = failureRemediation || '_Replace this section with the steps required to fix this issue._';

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

export function exportCheckAsJiraCsv(check: ManualCheckResult, fileName?: string) {
  const criterion = check.wcagCriterion ?? '';
  const level = check.level ?? '';
  const levelLabel = level || 'Manual';
  const summary = criterion ? `${criterion} ${check.title} | ${levelLabel}` : `${check.title} | Manual`;

  const impactMap: Record<string, string> = { critical: 'Highest', serious: 'High', moderate: 'Medium', minor: 'Low' };
  const priority = check.impact ? (impactMap[check.impact] ?? 'Medium') : 'Medium';

  const labelParts = ['Accessibility', 'Manual'];
  if (level) labelParts.push(`WCAG-${level}`);
  if (criterion) labelParts.push(`WCAG-${criterion.replace(/\./g, '')}`);

  const rows = [
    ['Summary', 'Issue Type', 'Priority', 'Labels', 'Description'],
    [summary, 'Task', priority, labelParts.join(' '), buildJiraDescription(check)],
  ];

  triggerCsvDownload(rowsToCsv(rows), fileName ? `${fileName}-jira` : `${checkSlug(check)}-jira`);
}

// ---------------------------------------------------------------------------
// Teamwork / XLSX — failure instance level
// ---------------------------------------------------------------------------

export function exportFailureAsTeamworkXlsx(data: FailureExportData, fileName?: string) {
  const { notes, codeSnippet, remediationRecommendation, checkContext, tasklistName = 'Accessibility Audit' } = data;
  const criterion = checkContext?.criterion ?? '';
  const level = checkContext?.level ?? '';
  const levelLabel = level || 'Manual';
  const title = checkContext?.title ?? 'Manual Issue';

  const taskName = criterion ? `${criterion} ${title} | ${levelLabel}` : `${title} | Manual`;

  const noteText = notes ?? 'No description provided.';
  const codeBlock = codeSnippet ? `\n**c. Code Snippet**\n\n\`\`\`html\n${codeSnippet}\n\`\`\`\n` : '';
  const remediationText = remediationRecommendation ?? '*Replace with the steps required to fix this issue.*';

  const description = `### 1. Describe the Issue

> to be completed by the **Auditor**

**a. Description of Issue**

> ${noteText}
${codeBlock}
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

  const tagParts = ['Accessibility', 'Manual'];
  if (level) tagParts.push(level);

  const dataRow: string[] = new Array(10).fill('');
  dataRow[0] = tasklistName;
  dataRow[1] = taskName;
  dataRow[2] = description;
  dataRow[8] = tagParts.join(', ');
  dataRow[9] = 'Active';

  const rows = [
    ['TASKLIST', 'TASK', 'DESCRIPTION', 'ASSIGN TO', 'START DATE', 'DUE DATE', 'PRIORITY', 'ESTIMATED TIME', 'TAGS', 'STATUS'],
    [tasklistName, '', 'Required Accessibility Updates', '', '', '', '', '', '', ''],
    dataRow,
  ];

  triggerXlsxDownload(rows, fileName || failureSlug(data));
}

// ---------------------------------------------------------------------------
// Jira — failure instance level
// ---------------------------------------------------------------------------

export function exportFailureAsJiraCsv(data: FailureExportData, fileName?: string) {
  const { notes, codeSnippet, remediationRecommendation, checkContext } = data;
  const criterion = checkContext?.criterion ?? '';
  const level = checkContext?.level ?? '';
  const levelLabel = level || 'Manual';
  const title = checkContext?.title ?? 'Manual Issue';

  const summary = criterion ? `${criterion} ${title} | ${levelLabel}` : `${title} | Manual`;

  const noteText = notes || '_No description provided._';
  const codeBlock = codeSnippet ? `\nh3. Code Snippet\n\n{code:html}\n${codeSnippet}\n{code}\n` : '';
  const remediationSection = remediationRecommendation || '_Replace this section with the steps required to fix this issue._';

  const description = `h3. Issue Description

${noteText}
${codeBlock}
h3. Remediation

${remediationSection}

h3. Steps to QA

_Replace this section with steps to validate the issue has been resolved._

h3. Recommended Assignment

* [ ] Content
* [ ] Design
* [ ] Engineer
`;

  const labelParts = ['Accessibility', 'Manual'];
  if (level) labelParts.push(`WCAG-${level}`);
  if (criterion) labelParts.push(`WCAG-${criterion.replace(/\./g, '')}`);

  const rows = [
    ['Summary', 'Issue Type', 'Priority', 'Labels', 'Description'],
    [summary, 'Task', 'Medium', labelParts.join(' '), description],
  ];

  triggerCsvDownload(rowsToCsv(rows), fileName ? `${fileName}-jira` : `${failureSlug(data)}-jira`);
}
