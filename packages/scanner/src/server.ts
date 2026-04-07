import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { EventEmitter } from 'events';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { DatabaseService } from './database.js';
import { Reporter } from './exporter.js';
import { SitemapScanner } from './scanner.js';
import { crawlSite } from './crawler.js';
import { AuditType, ScanReport, createDefaultChecks, ManualAudit, ManualAuditStatus, ManualCheckResult, ManualFailureInstance, Project } from '../../shared/dist/index.js';
import { captureViewportScreenshot, detectFocusOrder, ViewportLabel } from './detectors/focusOrder.js';
import { detectOnPage } from './detectors/onFocus.js';
import { detectKeyboard } from './detectors/keyboard.js';
import { detectFocusVisible } from './detectors/focusVisible.js';
import { detectKeyboardTrap } from './detectors/keyboardTrap.js';
import { detectLinkPurpose } from './detectors/linkPurpose.js';
import { detectNonTextContent } from './detectors/nonTextElements.js';
import { detectInfoRelationships } from './detectors/infoRelationships.js';
import { detectContrastMinimum } from './detectors/contrastMinimum.js';
import { captureElementScreenshot } from './detectors/captureScreenshots.js';

const app = express();
const db = new DatabaseService();
const port = process.env.PORT || 3003;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Run migration before accepting requests (no-op if already migrated)
await db.migrate();

// ---------------------------------------------------------------------------
// In-memory job store for scan progress tracking
// ---------------------------------------------------------------------------

type JobStatus = 'pending' | 'crawling' | 'scanning' | 'complete' | 'error' | 'aborted';

interface Job {
  emitter: EventEmitter;
  status: JobStatus;
  scanned: number;
  total: number;
  reportId?: string;
  error?: string;
  abortController: AbortController;
}

const jobs = new Map<string, Job>();

function cleanupJob(jobId: string) {
  setTimeout(() => jobs.delete(jobId), 5 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Root redirect for convenience
// ---------------------------------------------------------------------------

app.get('/', (_req, res) => {
  return res.redirect(FRONTEND_ORIGIN + '/');
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

app.get('/api/reports', async (_req, res) => {
  try {
    const reports = await db.getReportSummaries();
    return res.json(reports);
  } catch (err) {
    console.error('Error listing reports:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to list reports',
    });
  }
});

app.get('/api/reports/:id/summary', async (req, res) => {
  const report = await db.getReportSummary(req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  return res.json(report);
});

app.get('/api/reports/:id', async (req, res) => {
  const report = await db.getReport(req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  return res.json(report);
});

app.get('/api/reports/:id/pages', async (req, res) => {
  try {
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25)));
    const slice = await db.listReportPages(req.params.id, offset, limit);
    return res.json(slice);
  } catch (err) {
    console.error('Error listing pages:', err);
    return res.status(500).json({ error: 'Failed to list pages' });
  }
});

app.get('/api/reports/:id/pages/:pageId', async (req, res) => {
  try {
    const page = await db.getReportPage(req.params.id, req.params.pageId);
    if (!page) return res.status(404).json({ error: 'Page not found' });
    return res.json(page);
  } catch (err) {
    console.error('Error fetching page:', err);
    return res.status(500).json({ error: 'Failed to fetch page' });
  }
});

app.get('/api/reports/:id/violations', async (req, res) => {
  try {
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25)));
    const groups = await db.listViolationGroups(req.params.id);
    return res.json({
      items: groups.slice(offset, offset + limit),
      total: groups.length,
      offset,
      limit,
    });
  } catch (err) {
    console.error('Error listing violations:', err);
    return res.status(500).json({ error: 'Failed to list violations' });
  }
});

app.get('/api/reports/:id/violations/:violationId', async (req, res) => {
  try {
    const group = await db.getViolationGroup(req.params.id, req.params.violationId);
    if (!group) return res.status(404).json({ error: 'Violation not found' });
    return res.json(group);
  } catch (err) {
    console.error('Error fetching violation:', err);
    return res.status(500).json({ error: 'Failed to fetch violation' });
  }
});

app.get('/api/reports/:id/violations/:violationId/pages', async (req, res) => {
  try {
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25)));
    const slice = await db.listViolationPages(req.params.id, req.params.violationId, offset, limit);
    return res.json(slice);
  } catch (err) {
    console.error('Error listing violation pages:', err);
    return res.status(500).json({ error: 'Failed to list violation pages' });
  }
});

app.delete('/api/reports/:id', async (req, res) => {
  try {
    const deleted = await db.deleteReport(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Report not found' });
    return res.sendStatus(204);
  } catch (err) {
    console.error('Error deleting report:', err);
    return res.status(500).json({ error: 'Failed to delete report' });
  }
});

app.delete('/api/reports', async (_req, res) => {
  try {
    await db.clearReports();
    return res.sendStatus(204);
  } catch (err) {
    console.error('Error clearing reports:', err);
    return res.status(500).json({ error: 'Failed to clear reports' });
  }
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

app.post('/api/reports/:id/export/excel', async (req, res) => {
  try {
    const { selectedViolations, tasklistName, selectedLevels, exportScope } = req.body;
    const exporter = new Reporter();
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.header('Content-Disposition', `attachment; filename="accessibility-export-${req.params.id}.xlsx"`);
    res.flushHeaders();

    if (await db.reportIsBundle(req.params.id)) {
      await exporter.streamToExcelFromPages(
        res,
        async (page) => db.streamReportPages(req.params.id, page),
        selectedViolations,
        tasklistName,
        selectedLevels,
        exportScope,
      );
      return;
    }

    const report = await db.getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    await exporter.streamToExcel(report, res, selectedViolations, tasklistName, selectedLevels, exportScope);
    return;
  } catch (error) {
    console.error('Excel export error:', error);
    return res.status(500).json({ error: 'Excel export failed' });
  }
});

app.post('/api/reports/:id/export/jira', async (req, res) => {
  try {
    const { selectedViolations, selectedLevels, exportScope } = req.body;
    const exporter = new Reporter();
    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', `attachment; filename="jira-export-${req.params.id}.csv"`);
    res.flushHeaders();

    if (await db.reportIsBundle(req.params.id)) {
      await exporter.streamToJiraCsvFromPages(
        res,
        async (pageCallback) => db.streamReportPages(req.params.id, pageCallback),
        selectedViolations,
        selectedLevels,
        exportScope,
      );
      return;
    }

    const report = await db.getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const csvData = exporter.exportToJiraCsv(report, selectedViolations, selectedLevels, exportScope);
    return res.send(csvData);
  } catch (error) {
    console.error('Jira export error:', error);
    return res.status(500).json({ error: 'Jira export failed' });
  }
});

// ---------------------------------------------------------------------------
// Automated Violation Overrides & Node Screenshots
// ---------------------------------------------------------------------------

// PATCH /api/reports/:reportId/pages/:pageId/violations/:violationId
app.patch('/api/reports/:reportId/pages/:pageId/violations/:violationId', async (req, res) => {
  try {
    const violations = await modifyReportPage(req.params.reportId, req.params.pageId, (page) => {
      const violation = page.violations.find((v: { id: string }) => v.id === req.params.violationId);
      if (!violation) throw new Error('Violation not found');

      const { overrideStatus, overrideNotes } = req.body as {
        overrideStatus?: 'pass' | 'na' | null;
        overrideNotes?: string;
      };
      if (overrideStatus === null) {
        delete violation.overrideStatus;
        delete violation.overrideNotes;
      } else {
        if (overrideStatus !== undefined) violation.overrideStatus = overrideStatus;
        if (overrideNotes !== undefined) violation.overrideNotes = overrideNotes || undefined;
      }

      return page.violations;
    });

    if (!violations) return res.status(404).json({ error: 'Page not found' });
    return res.json({ violations });
  } catch (err) {
    if (err instanceof Error && err.message === 'Violation not found') {
      return res.status(404).json({ error: err.message });
    }
    console.error('Violation override error:', err);
    return res.status(500).json({ error: 'Failed to update violation' });
  }
});

// PATCH /api/reports/:reportId/pages/:pageId/violations/:violationId/nodes/:nodeIndex
app.patch('/api/reports/:reportId/pages/:pageId/violations/:violationId/nodes/:nodeIndex', async (req, res) => {
  try {
    const violations = await modifyReportPage(req.params.reportId, req.params.pageId, (page) => {
      const violation = page.violations.find((v: { id: string }) => v.id === req.params.violationId);
      if (!violation) throw new Error('Violation not found');

      const nodeIndex = parseInt(req.params.nodeIndex, 10);
      const node = violation.nodes[nodeIndex];
      if (!node) throw new Error('Node not found');

      const { screenshotDataUrl, overrideStatus } = req.body as {
        screenshotDataUrl?: string | null;
        overrideStatus?: 'pass' | 'fail' | null;
      };
      if (screenshotDataUrl === null) {
        delete node.screenshotDataUrl;
      } else if (screenshotDataUrl !== undefined) {
        node.screenshotDataUrl = screenshotDataUrl;
      }
      if (overrideStatus === null) {
        delete node.overrideStatus;
      } else if (overrideStatus !== undefined) {
        node.overrideStatus = overrideStatus;
      }

      if (violation.overrideStatus !== 'na') {
        const allPass = violation.nodes.every(n => n.overrideStatus === 'pass');
        if (allPass) {
          violation.overrideStatus = 'pass';
        } else {
          delete violation.overrideStatus;
        }
      }

      return page.violations;
    });

    if (!violations) return res.status(404).json({ error: 'Page not found' });
    return res.json({ violations });
  } catch (err) {
    if (err instanceof Error && err.message === 'Violation not found') {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof Error && err.message === 'Node not found') {
      return res.status(404).json({ error: err.message });
    }
    console.error('Node screenshot error:', err);
    return res.status(500).json({ error: 'Failed to update node screenshot' });
  }
});

// ---------------------------------------------------------------------------
// Manual Audit
// ---------------------------------------------------------------------------

function initManualAudit(auditType?: AuditType): ManualAudit {
  return {
    lastUpdated: new Date().toISOString(),
    checks: createDefaultChecks(auditType),
  };
}

async function modifyReportPage<T>(
  reportId: string,
  pageId: string,
  patch: (page: ScanReport['results'][number], reportContext: { auditType?: AuditType }) => T | Promise<T>,
): Promise<T | undefined> {
  const auditType = await db.getReportAuditType(reportId);
  return db.updateReportPage(reportId, pageId, async (page) => patch(page, { auditType }));
}

// PATCH /api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId
app.patch('/api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId', async (req, res) => {
  try {
    const manualAudit = await modifyReportPage(req.params.reportId, req.params.pageId, (page, { auditType }) => {
      if (!page.manualAudit) page.manualAudit = initManualAudit(auditType);

      const { status, notes, codeSnippet, screenshotDataUrl, questionStatuses } = req.body as {
        status: ManualAuditStatus;
        notes?: string;
        codeSnippet?: string;
        screenshotDataUrl?: string;
        questionStatuses?: ManualAuditStatus[];
      };
      const check = page.manualAudit.checks.find(c => c.id === req.params.checkId);
      if (check) {
        check.status = status;
        if (notes !== undefined) check.notes = notes;
        if (codeSnippet !== undefined) check.codeSnippet = codeSnippet;
        if (screenshotDataUrl !== undefined) check.screenshotDataUrl = screenshotDataUrl;
        if (questionStatuses !== undefined) check.questionStatuses = questionStatuses;
        check.updatedAt = new Date().toISOString();
      }
      page.manualAudit.lastUpdated = new Date().toISOString();
      return page.manualAudit;
    });

    if (!manualAudit) return res.status(404).json({ error: 'Page not found' });
    return res.json({ manualAudit });
  } catch (err) {
    console.error('Manual audit update error:', err);
    return res.status(500).json({ error: 'Failed to update check' });
  }
});

// POST /api/reports/:reportId/pages/:pageId/manual-audit/checks
app.post('/api/reports/:reportId/pages/:pageId/manual-audit/checks', async (req, res) => {
  try {
    const manualAudit = await modifyReportPage(req.params.reportId, req.params.pageId, (page, { auditType }) => {
      if (!page.manualAudit) page.manualAudit = initManualAudit(auditType);

      const { title, description, impact, status, notes } = req.body as Partial<ManualCheckResult>;
      if (!title) throw new Error('title is required');

      const newCheck: ManualCheckResult = {
        id: randomUUID(),
        type: 'custom',
        title,
        description,
        impact,
        status: status ?? 'not-tested',
        notes,
        updatedAt: new Date().toISOString(),
      };
      page.manualAudit.checks.push(newCheck);
      page.manualAudit.lastUpdated = new Date().toISOString();
      return page.manualAudit;
    });

    if (!manualAudit) return res.status(404).json({ error: 'Page not found' });
    return res.status(201).json({ manualAudit });
  } catch (err) {
    if (err instanceof Error && err.message === 'title is required') {
      return res.status(400).json({ error: err.message });
    }
    console.error('Add custom check error:', err);
    return res.status(500).json({ error: 'Failed to add custom check' });
  }
});

// DELETE /api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId
app.delete('/api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId', async (req, res) => {
  try {
    const manualAudit = await modifyReportPage(req.params.reportId, req.params.pageId, (page) => {
      if (!page.manualAudit) throw new Error('Page or audit not found');

      const check = page.manualAudit.checks.find(c => c.id === req.params.checkId);
      if (!check) throw new Error('Check not found');
      if (check.type !== 'custom') throw new Error('Only custom checks can be deleted');

      page.manualAudit.checks = page.manualAudit.checks.filter(c => c.id !== req.params.checkId);
      page.manualAudit.lastUpdated = new Date().toISOString();
      return page.manualAudit;
    });

    if (!manualAudit) return res.status(404).json({ error: 'Page not found' });
    return res.sendStatus(204);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'Page or audit not found' || err.message === 'Check not found') {
        return res.status(404).json({ error: err.message });
      }
      if (err.message === 'Only custom checks can be deleted') {
        return res.status(400).json({ error: err.message });
      }
    }
    console.error('Delete custom check error:', err);
    return res.status(500).json({ error: 'Failed to delete check' });
  }
});

// PATCH /api/reports/:reportId/pages/:pageId/manual-audit/complete
app.patch('/api/reports/:reportId/pages/:pageId/manual-audit/complete', async (req, res) => {
  try {
    const manualAudit = await modifyReportPage(req.params.reportId, req.params.pageId, (page, { auditType }) => {
      if (!page.manualAudit) page.manualAudit = initManualAudit(auditType);

      const { completed } = req.body as { completed: boolean };
      page.manualAudit.completed = completed;
      page.manualAudit.completedAt = completed ? new Date().toISOString() : undefined;
      page.manualAudit.lastUpdated = new Date().toISOString();
      return page.manualAudit;
    });

    if (!manualAudit) return res.status(404).json({ error: 'Page not found' });
    return res.json({ manualAudit });
  } catch (err) {
    console.error('Audit complete toggle error:', err);
    return res.status(500).json({ error: 'Failed to update audit completion' });
  }
});

// PATCH /api/reports/:reportId/pages/:pageId/manual-audit
app.patch('/api/reports/:reportId/pages/:pageId/manual-audit', async (req, res) => {
  try {
    const manualAudit = await modifyReportPage(req.params.reportId, req.params.pageId, (page, { auditType }) => {
      if (!page.manualAudit) page.manualAudit = initManualAudit(auditType);

      const { auditorNotes } = req.body as { auditorNotes?: string };
      page.manualAudit.auditorNotes = auditorNotes;
      page.manualAudit.lastUpdated = new Date().toISOString();
      return page.manualAudit;
    });

    if (!manualAudit) return res.status(404).json({ error: 'Page not found' });
    return res.json({ manualAudit });
  } catch (err) {
    console.error('Auditor notes update error:', err);
    return res.status(500).json({ error: 'Failed to update auditor notes' });
  }
});

// POST /api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId/failures
app.post('/api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId/failures', async (req, res) => {
  try {
    const manualAudit = await modifyReportPage(req.params.reportId, req.params.pageId, (page, { auditType }) => {
      if (!page.manualAudit) page.manualAudit = initManualAudit(auditType);

      const check = page.manualAudit.checks.find(c => c.id === req.params.checkId);
      if (!check) throw new Error('Check not found');

      const failure: ManualFailureInstance = {
        id: randomUUID(),
        notes: req.body.notes,
        codeSnippet: req.body.codeSnippet,
        screenshotDataUrl: req.body.screenshotDataUrl,
        createdAt: new Date().toISOString(),
      };
      if (!check.failures) check.failures = [];
      check.failures.push(failure);
      // Auto-set check status to fail when a failure is recorded
      check.status = 'fail';
      check.updatedAt = new Date().toISOString();
      page.manualAudit.lastUpdated = new Date().toISOString();
      return page.manualAudit;
    });

    if (!manualAudit) return res.status(404).json({ error: 'Page not found' });
    return res.status(201).json({ manualAudit });
  } catch (err) {
    if (err instanceof Error && err.message === 'Check not found') {
      return res.status(404).json({ error: err.message });
    }
    console.error('Add failure instance error:', err);
    return res.status(500).json({ error: 'Failed to add failure instance' });
  }
});

// PATCH /api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId/failures/:failureId
app.patch('/api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId/failures/:failureId', async (req, res) => {
  try {
    const manualAudit = await modifyReportPage(req.params.reportId, req.params.pageId, (page) => {
      if (!page.manualAudit) throw new Error('Page or audit not found');

      const check = page.manualAudit.checks.find(c => c.id === req.params.checkId);
      if (!check) throw new Error('Check not found');

      const failure = (check.failures ?? []).find(f => f.id === req.params.failureId);
      if (!failure) throw new Error('Failure instance not found');

      const { scope, impact, title, notes, codeSnippet, screenshotDataUrl, status, remediationRecommendation } = req.body;
      if (scope !== undefined) failure.scope = scope;
      if (impact !== undefined) failure.impact = impact;
      if (title !== undefined) failure.title = title;
      if (notes !== undefined) failure.notes = notes;
      if (codeSnippet !== undefined) failure.codeSnippet = codeSnippet;
      if (screenshotDataUrl !== undefined) failure.screenshotDataUrl = screenshotDataUrl;
      if (status !== undefined) failure.status = status;
      if (remediationRecommendation !== undefined) failure.remediationRecommendation = remediationRecommendation;

      const allFailures = check.failures ?? [];
      if (allFailures.length > 0) {
        check.status = allFailures.every(f => f.status === 'pass') ? 'pass' : 'fail';
      }

      check.updatedAt = new Date().toISOString();
      page.manualAudit.lastUpdated = new Date().toISOString();
      return page.manualAudit;
    });

    if (!manualAudit) return res.status(404).json({ error: 'Page not found' });
    return res.json({ manualAudit });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'Page or audit not found' || err.message === 'Check not found' || err.message === 'Failure instance not found') {
        return res.status(404).json({ error: err.message });
      }
    }
    console.error('Update failure instance error:', err);
    return res.status(500).json({ error: 'Failed to update failure instance' });
  }
});

// DELETE /api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId/failures/:failureId
app.delete('/api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId/failures/:failureId', async (req, res) => {
  try {
    const manualAudit = await modifyReportPage(req.params.reportId, req.params.pageId, (page) => {
      if (!page.manualAudit) throw new Error('Page or audit not found');

      const check = page.manualAudit.checks.find(c => c.id === req.params.checkId);
      if (!check) throw new Error('Check not found');

      check.failures = (check.failures ?? []).filter(f => f.id !== req.params.failureId);
      if (check.failures.length === 0) check.status = 'not-tested';
      check.updatedAt = new Date().toISOString();
      page.manualAudit.lastUpdated = new Date().toISOString();
      return page.manualAudit;
    });

    if (!manualAudit) return res.status(404).json({ error: 'Page not found' });
    return res.sendStatus(204);
  } catch (err) {
    if (err instanceof Error && (err.message === 'Page or audit not found' || err.message === 'Check not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('Delete failure instance error:', err);
    return res.status(500).json({ error: 'Failed to delete failure instance' });
  }
});

// ---------------------------------------------------------------------------
// AI — remediation suggestion for a manual failure instance
// ---------------------------------------------------------------------------

// GET /api/ai/providers — returns which AI providers are configured
app.get('/api/ai/providers', (_req, res) => {
  const providers: Array<{ id: string; label: string }> = [];
  if (process.env.ANTHROPIC_API_KEY) providers.push({ id: 'anthropic', label: 'Claude (Anthropic)' });
  if (process.env.OPENAI_API_KEY)    providers.push({ id: 'openai',    label: 'GPT-4o mini (OpenAI)' });
  if (process.env.GEMINI_API_KEY)    providers.push({ id: 'gemini',    label: 'Gemini Flash (Google)' });
  if (process.env.GROQ_API_KEY)      providers.push({ id: 'groq',      label: 'Llama 3.1 (Groq)' });
  return res.json({ providers });
});

// Helper: call an OpenAI-compatible chat endpoint (OpenAI, Groq, etc.)
async function callOpenAICompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
): Promise<{ recommendation?: string; error?: string }> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    let detail = '';
    try { detail = (JSON.parse(errText) as { error?: { message?: string } }).error?.message ?? ''; } catch { /* not JSON */ }
    return { error: `API error (${response.status})${detail ? ': ' + detail : ''}` };
  }
  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return { recommendation: data.choices[0]?.message?.content ?? '' };
}

// POST /api/ai/remediation-suggestion
app.post('/api/ai/remediation-suggestion', async (req, res) => {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey    = process.env.OPENAI_API_KEY;
  const geminiKey    = process.env.GEMINI_API_KEY;
  const groqKey      = process.env.GROQ_API_KEY;

  const configuredIds = [
    anthropicKey && 'anthropic',
    openaiKey    && 'openai',
    geminiKey    && 'gemini',
    groqKey      && 'groq',
  ].filter(Boolean) as string[];

  const { criterion, checkTitle, checkDescription, notes, codeSnippet, provider: requestedProvider } = req.body as {
    criterion?: string;
    checkTitle?: string;
    checkDescription?: string;
    notes?: string;
    codeSnippet?: string;
    provider?: string;
  };

  const provider = (requestedProvider && configuredIds.includes(requestedProvider))
    ? requestedProvider
    : configuredIds[0] ?? null;

  if (!provider) {
    return res.status(503).json({ error: 'No AI provider configured. Add ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY to your .env file.' });
  }

  const systemPrompt = 'You are an accessibility expert. Provide concise, practical remediation recommendations for WCAG failures. Be specific about code changes. Do not include preamble or headers — just the recommendation text.';

  const contextParts: string[] = [];
  if (criterion && checkTitle) contextParts.push(`WCAG ${criterion}: ${checkTitle}`);
  else if (checkTitle) contextParts.push(`Check: ${checkTitle}`);
  if (checkDescription) contextParts.push(`Description: ${checkDescription}`);
  if (notes) contextParts.push(`Failure notes: ${notes}`);
  if (codeSnippet) contextParts.push(`Code snippet:\n\`\`\`html\n${codeSnippet}\n\`\`\``);

  const userMessage = contextParts.length
    ? `Given the following accessibility failure, provide a concise, actionable remediation recommendation (2-4 sentences). Focus on the specific code changes or content changes needed to fix the issue.\n\n${contextParts.join('\n\n')}`
    : 'Provide a concise, actionable accessibility remediation recommendation.';

  try {
    let recommendation = '';

    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{ role: 'user', content: userMessage }],
          system: systemPrompt,
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        let detail = '';
        try { detail = (JSON.parse(errText) as { error?: { message?: string } }).error?.message ?? ''; } catch { /* not JSON */ }
        return res.status(502).json({ error: `Anthropic API error (${response.status})${detail ? ': ' + detail : ''}` });
      }
      const data = await response.json() as { content: Array<{ type: string; text: string }> };
      recommendation = data.content.find(b => b.type === 'text')?.text ?? '';

    } else if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: { maxOutputTokens: 512 },
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        let detail = '';
        try { detail = (JSON.parse(errText) as { error?: { message?: string } }).error?.message ?? ''; } catch { /* not JSON */ }
        return res.status(502).json({ error: `Gemini API error (${response.status})${detail ? ': ' + detail : ''}` });
      }
      const data = await response.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
      recommendation = data.candidates[0]?.content?.parts[0]?.text ?? '';

    } else if (provider === 'openai') {
      const result = await callOpenAICompatible('https://api.openai.com/v1/chat/completions', openaiKey!, 'gpt-4o-mini', systemPrompt, userMessage);
      if (result.error) return res.status(502).json({ error: `OpenAI ${result.error}` });
      recommendation = result.recommendation ?? '';

    } else if (provider === 'groq') {
      const result = await callOpenAICompatible('https://api.groq.com/openai/v1/chat/completions', groqKey!, 'llama-3.1-8b-instant', systemPrompt, userMessage);
      if (result.error) return res.status(502).json({ error: `Groq ${result.error}` });
      recommendation = result.recommendation ?? '';
    }

    return res.json({ recommendation });
  } catch (err) {
    console.error('AI remediation suggestion error:', err);
    return res.status(500).json({ error: 'Failed to generate remediation suggestion.' });
  }
});

// ---------------------------------------------------------------------------
// Detected Elements (WCAG criterion-level element audit)
// ---------------------------------------------------------------------------

// POST /api/reports/:reportId/pages/:pageId/elements/:criterionId/:elementId/screenshot
// Must be registered before the PATCH /:elementId route so Express doesn't treat
// "screenshot" as a :failureId param.
app.post('/api/reports/:reportId/pages/:pageId/elements/:criterionId/:elementId/screenshot', async (req, res) => {
  try {
    const element = await modifyReportPage(req.params.reportId, req.params.pageId, async (page) => {
      const elements = page.detectedElements?.[req.params.criterionId];
      if (!elements) throw new Error('No detected elements for this criterion');

      const element = elements.find(e => e.id === req.params.elementId);
      if (!element) throw new Error('Element not found');

      const labelText = element.textAlternative ?? element.elementType;
      const { screenshotDataUrl, contextScreenshotDataUrl } =
        await captureElementScreenshot(page.url, element.selector, labelText);

      if (screenshotDataUrl)        element.screenshotDataUrl        = screenshotDataUrl;
      if (contextScreenshotDataUrl) element.contextScreenshotDataUrl = contextScreenshotDataUrl;
      return element;
    });

    if (!element) return res.status(404).json({ error: 'Page not found' });
    return res.json({ element });
  } catch (err) {
    if (err instanceof Error && (err.message === 'No detected elements for this criterion' || err.message === 'Element not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('Element screenshot error:', err);
    return res.status(500).json({ error: 'Failed to capture element screenshot' });
  }
});

// PATCH /api/reports/:reportId/pages/:pageId/elements/:criterionId/:elementId
app.patch('/api/reports/:reportId/pages/:pageId/elements/:criterionId/:elementId', async (req, res) => {
  try {
    const detectedElements = await modifyReportPage(req.params.reportId, req.params.pageId, (page) => {
      const elements = page.detectedElements?.[req.params.criterionId];
      if (!elements) throw new Error('No detected elements for this criterion');

      const element = elements.find(e => e.id === req.params.elementId);
      if (!element) throw new Error('Element not found');

      const { auditStatus, auditComment, screenshotDataUrl, darkScreenshotDataUrl } = req.body as {
        auditStatus?: 'pass' | 'fail' | 'not-reviewed';
        auditComment?: string;
        screenshotDataUrl?: string | null;
        darkScreenshotDataUrl?: string | null;
      };
      if (auditStatus) element.auditStatus = auditStatus;
      if (auditComment !== undefined) element.auditComment = auditComment || undefined;
      if (screenshotDataUrl === null) delete element.screenshotDataUrl;
      else if (screenshotDataUrl !== undefined) element.screenshotDataUrl = screenshotDataUrl;
      if (darkScreenshotDataUrl === null) delete element.darkScreenshotDataUrl;
      else if (darkScreenshotDataUrl !== undefined) element.darkScreenshotDataUrl = darkScreenshotDataUrl;

      return page.detectedElements;
    });

    if (!detectedElements) return res.status(404).json({ error: 'Page not found' });
    return res.json({ detectedElements });
  } catch (err) {
    if (err instanceof Error && (err.message === 'No detected elements for this criterion' || err.message === 'Element not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('Element update error:', err);
    return res.status(500).json({ error: 'Failed to update element' });
  }
});

// POST /api/reports/:reportId/pages/:pageId/elements/:criterionId/:elementId/failures
app.post('/api/reports/:reportId/pages/:pageId/elements/:criterionId/:elementId/failures', async (req, res) => {
  try {
    const detectedElements = await modifyReportPage(req.params.reportId, req.params.pageId, (page) => {
      const elements = page.detectedElements?.[req.params.criterionId];
      if (!elements) throw new Error('No detected elements for this criterion');

      const element = elements.find(e => e.id === req.params.elementId);
      if (!element) throw new Error('Element not found');
      const { notes, codeSnippet, screenshotDataUrl, remediationRecommendation } = req.body as Partial<Pick<ManualFailureInstance, 'notes' | 'codeSnippet' | 'screenshotDataUrl' | 'remediationRecommendation'>>;
      const failure: ManualFailureInstance = {
        id: `ef_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        notes,
        codeSnippet,
        screenshotDataUrl,
        remediationRecommendation,
        createdAt: new Date().toISOString(),
      };
      element.failures = [...(element.failures ?? []), failure];
      return page.detectedElements;
    });

    if (!detectedElements) return res.status(404).json({ error: 'Page not found' });
    return res.json({ detectedElements });
  } catch (err) {
    if (err instanceof Error && (err.message === 'No detected elements for this criterion' || err.message === 'Element not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('Add element failure error:', err);
    return res.status(500).json({ error: 'Failed to add element failure' });
  }
});

// PATCH /api/reports/:reportId/pages/:pageId/elements/:criterionId/:elementId/failures/:failureId
app.patch('/api/reports/:reportId/pages/:pageId/elements/:criterionId/:elementId/failures/:failureId', async (req, res) => {
  try {
    const detectedElements = await modifyReportPage(req.params.reportId, req.params.pageId, (page) => {
      const elements = page.detectedElements?.[req.params.criterionId];
      if (!elements) throw new Error('No detected elements for this criterion');

      const element = elements.find(e => e.id === req.params.elementId);
      if (!element) throw new Error('Element not found');
      const failure = (element.failures ?? []).find(f => f.id === req.params.failureId);
      if (!failure) throw new Error('Failure not found');

      Object.assign(failure, req.body);
      return page.detectedElements;
    });

    if (!detectedElements) return res.status(404).json({ error: 'Page not found' });
    return res.json({ detectedElements });
  } catch (err) {
    if (err instanceof Error && (err.message === 'No detected elements for this criterion' || err.message === 'Element not found' || err.message === 'Failure not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('Update element failure error:', err);
    return res.status(500).json({ error: 'Failed to update element failure' });
  }
});

// DELETE /api/reports/:reportId/pages/:pageId/elements/:criterionId/:elementId/failures/:failureId
app.delete('/api/reports/:reportId/pages/:pageId/elements/:criterionId/:elementId/failures/:failureId', async (req, res) => {
  try {
    const detectedElements = await modifyReportPage(req.params.reportId, req.params.pageId, (page) => {
      const elements = page.detectedElements?.[req.params.criterionId];
      if (!elements) throw new Error('No detected elements for this criterion');

      const element = elements.find(e => e.id === req.params.elementId);
      if (!element) throw new Error('Element not found');

      element.failures = (element.failures ?? []).filter(f => f.id !== req.params.failureId);
      return page.detectedElements;
    });

    if (!detectedElements) return res.status(404).json({ error: 'Page not found' });
    return res.json({ detectedElements });
  } catch (err) {
    if (err instanceof Error && (err.message === 'No detected elements for this criterion' || err.message === 'Element not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('Delete element failure error:', err);
    return res.status(500).json({ error: 'Failed to delete element failure' });
  }
});

// ---------------------------------------------------------------------------
// Focus Order — on-demand screenshot generation (WCAG 2.4.3)
// ---------------------------------------------------------------------------

// POST /api/reports/:reportId/pages/:pageId/elements/2.4.3/:elementId/focus-order-screenshot
app.post('/api/reports/:reportId/pages/:pageId/elements/2.4.3/:elementId/focus-order-screenshot', async (req, res) => {
  try {
    const result = await modifyReportPage(req.params.reportId, req.params.pageId, async (page) => {
      const elements = page.detectedElements?.['2.4.3'];
      if (!elements) throw new Error('No focus-order elements for this page');

      const element = elements.find(e => e.id === req.params.elementId);
      if (!element) throw new Error('Element not found');

      const { colorScheme, viewport } = req.body as {
        colorScheme: 'light' | 'dark';
        viewport: ViewportLabel;
      };
      if (!colorScheme || !viewport) {
        throw new Error('colorScheme and viewport are required');
      }

      const { screenshotDataUrl, focusableCount } = await captureViewportScreenshot(
        page.url,
        viewport,
        colorScheme,
      );

      if (colorScheme === 'dark') {
        element.darkScreenshotDataUrl = screenshotDataUrl;
      } else {
        element.screenshotDataUrl = screenshotDataUrl;
      }
      element.textAlternative = `${viewport} — ${focusableCount} focusable element${focusableCount !== 1 ? 's' : ''}`;
      return { screenshotDataUrl, focusableCount, element };
    });

    if (!result) return res.status(404).json({ error: 'Page not found' });
    return res.json(result);
  } catch (err) {
    if (err instanceof Error && (err.message === 'No focus-order elements for this page' || err.message === 'Element not found')) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof Error && err.message === 'colorScheme and viewport are required') {
      return res.status(400).json({ error: err.message });
    }
    console.error('Focus order screenshot error:', err);
    return res.status(500).json({ error: 'Failed to capture focus order screenshot' });
  }
});

// ---------------------------------------------------------------------------
// Focus Order — on-demand detection (WCAG 2.4.3)
// ---------------------------------------------------------------------------

// POST /api/reports/:reportId/pages/:pageId/elements/2.4.3/detect
app.post('/api/reports/:reportId/pages/:pageId/elements/2.4.3/detect', async (req, res) => {
  try {
    const detectedElements = await modifyReportPage(req.params.reportId, req.params.pageId, async (page) => {
      const raw = await detectFocusOrder(page.url);
      if (!page.detectedElements) page.detectedElements = {};
      page.detectedElements['2.4.3'] = raw.map(el => ({ ...el, id: randomUUID() }));
      return page.detectedElements;
    });

    if (!detectedElements) return res.status(404).json({ error: 'Page not found' });
    return res.json({ detectedElements });
  } catch (err) {
    console.error('Focus order detection error:', err);
    return res.status(500).json({ error: 'Failed to detect focus order elements' });
  }
});

// ---------------------------------------------------------------------------
// On Focus — on-demand detection (WCAG 3.2.1)
// ---------------------------------------------------------------------------

// POST /api/reports/:reportId/pages/:pageId/elements/3.2.1/detect
app.post('/api/reports/:reportId/pages/:pageId/elements/3.2.1/detect', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  try {
    const allElements: any[] = [];
    const detectedElements = await modifyReportPage(req.params.reportId, req.params.pageId, async (page) => {
      await detectOnPage(page.url, (event) => {
        if (event.type === 'element') {
          const withId = { ...event.element, id: randomUUID() };
          allElements.push(withId);
          send({ type: 'element', element: withId });
        } else {
          send(event);
        }
      });
      if (!page.detectedElements) page.detectedElements = {};
      page.detectedElements['3.2.1'] = allElements;
      return page.detectedElements;
    });
    if (!detectedElements) { send({ type: 'error', message: 'Page not found' }); }
    else { send({ type: 'done', detectedElements }); }
  } catch (err) {
    console.error('On Focus detection error:', err);
    send({ type: 'error', message: 'Failed to detect focus-triggered elements' });
  }
  res.end();
});

// ---------------------------------------------------------------------------
// Keyboard — on-demand detection (WCAG 2.1.1)
// ---------------------------------------------------------------------------

// POST /api/reports/:reportId/pages/:pageId/elements/2.1.1/detect
app.post('/api/reports/:reportId/pages/:pageId/elements/2.1.1/detect', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  try {
    const allElements: any[] = [];
    const detectedElements = await modifyReportPage(req.params.reportId, req.params.pageId, async (page) => {
      await detectKeyboard(page.url, (event) => {
        if (event.type === 'element') {
          const withId = { ...event.element, id: randomUUID() };
          allElements.push(withId);
          send({ type: 'element', element: withId });
        } else {
          send(event);
        }
      });
      if (!page.detectedElements) page.detectedElements = {};
      page.detectedElements['2.1.1'] = allElements;
      return page.detectedElements;
    });
    if (!detectedElements) { send({ type: 'error', message: 'Page not found' }); }
    else { send({ type: 'done', detectedElements }); }
  } catch (err) {
    console.error('Keyboard detection error:', err);
    send({ type: 'error', message: 'Failed to detect keyboard-inaccessible elements' });
  }
  res.end();
});

// ---------------------------------------------------------------------------
// Focus Visible — on-demand detection (WCAG 2.4.7)
// ---------------------------------------------------------------------------

// POST /api/reports/:reportId/pages/:pageId/elements/2.4.7/detect
app.post('/api/reports/:reportId/pages/:pageId/elements/2.4.7/detect', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  try {
    const allElements: any[] = [];
    const detectedElements = await modifyReportPage(req.params.reportId, req.params.pageId, async (page) => {
      await detectFocusVisible(page.url, (event) => {
        if (event.type === 'element') {
          const withId = { ...event.element, id: randomUUID() };
          allElements.push(withId);
          send({ type: 'element', element: withId });
        } else {
          send(event);
        }
      });
      if (!page.detectedElements) page.detectedElements = {};
      page.detectedElements['2.4.7'] = allElements;
      return page.detectedElements;
    });
    if (!detectedElements) { send({ type: 'error', message: 'Page not found' }); }
    else { send({ type: 'done', detectedElements }); }
  } catch (err) {
    console.error('Focus visible detection error:', err);
    send({ type: 'error', message: 'Failed to detect focus-style issues' });
  }
});

// ---------------------------------------------------------------------------
// Link Purpose — on-demand detection (WCAG 2.4.4)
// ---------------------------------------------------------------------------

// POST /api/reports/:reportId/pages/:pageId/elements/2.4.4/detect
app.post('/api/reports/:reportId/pages/:pageId/elements/2.4.4/detect', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  try {
    const allElements: any[] = [];
    const detectedElements = await modifyReportPage(req.params.reportId, req.params.pageId, async (page) => {
      await detectLinkPurpose(page.url, (event) => {
        if (event.type === 'element') {
          const withId = { ...event.element, id: randomUUID() };
          allElements.push(withId);
          send({ type: 'element', element: withId });
        } else {
          send(event);
        }
      });
      if (!page.detectedElements) page.detectedElements = {};
      page.detectedElements['2.4.4'] = allElements;
      return page.detectedElements;
    });
    if (!detectedElements) { send({ type: 'error', message: 'Page not found' }); }
    else { send({ type: 'done', detectedElements }); }
  } catch (err) {
    console.error('Link purpose detection error:', err);
    send({ type: 'error', message: 'Failed to detect ambiguous links' });
  }
  res.end();
});

// ---------------------------------------------------------------------------
// Keyboard Trap — on-demand detection (WCAG 2.1.2)
// ---------------------------------------------------------------------------

// POST /api/reports/:reportId/pages/:pageId/elements/2.1.2/detect
app.post('/api/reports/:reportId/pages/:pageId/elements/2.1.2/detect', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  try {
    const allElements: any[] = [];
    const detectedElements = await modifyReportPage(req.params.reportId, req.params.pageId, async (page) => {
      await detectKeyboardTrap(page.url, (event) => {
        if (event.type === 'element') {
          const withId = { ...event.element, id: randomUUID() };
          allElements.push(withId);
          send({ type: 'element', element: withId });
        } else {
          send(event);
        }
      });
      if (!page.detectedElements) page.detectedElements = {};
      page.detectedElements['2.1.2'] = allElements;
      return page.detectedElements;
    });
    if (!detectedElements) { send({ type: 'error', message: 'Page not found' }); }
    else { send({ type: 'done', detectedElements }); }
  } catch (err) {
    console.error('Keyboard trap detection error:', err);
    send({ type: 'error', message: 'Failed to detect keyboard trap risks' });
  }
  res.end();
});

// ---------------------------------------------------------------------------
// Non-text Content — on-demand detection (WCAG 1.1.1)
// ---------------------------------------------------------------------------

// POST /api/reports/:reportId/pages/:pageId/elements/1.1.1/detect
app.post('/api/reports/:reportId/pages/:pageId/elements/1.1.1/detect', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  try {
    const allElements: any[] = [];
    const detectedElements = await modifyReportPage(req.params.reportId, req.params.pageId, async (page) => {
      await detectNonTextContent(page.url, (event) => {
        if (event.type === 'element') {
          const withId = { ...event.element, id: randomUUID() };
          allElements.push(withId);
          send({ type: 'element', element: withId });
        } else {
          send(event);
        }
      });
      if (!page.detectedElements) page.detectedElements = {};
      page.detectedElements['1.1.1'] = allElements;
      return page.detectedElements;
    });
    if (!detectedElements) { send({ type: 'error', message: 'Page not found' }); }
    else { send({ type: 'done', detectedElements }); }
  } catch (err) {
    console.error('Non-text content detection error:', err);
    send({ type: 'error', message: 'Failed to detect non-text elements' });
  }
  res.end();
});

// ---------------------------------------------------------------------------
// Info and Relationships — on-demand detection (WCAG 1.3.1)
// ---------------------------------------------------------------------------

// POST /api/reports/:reportId/pages/:pageId/elements/1.3.1/detect
app.post('/api/reports/:reportId/pages/:pageId/elements/1.3.1/detect', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  try {
    const allElements: any[] = [];
    const detectedElements = await modifyReportPage(req.params.reportId, req.params.pageId, async (page) => {
      await detectInfoRelationships(page.url, (event) => {
        if (event.type === 'element') {
          const withId = { ...event.element, id: randomUUID() };
          allElements.push(withId);
          send({ type: 'element', element: withId });
        } else {
          send(event);
        }
      });
      if (!page.detectedElements) page.detectedElements = {};
      page.detectedElements['1.3.1'] = allElements;
      return page.detectedElements;
    });
    if (!detectedElements) { send({ type: 'error', message: 'Page not found' }); }
    else { send({ type: 'done', detectedElements }); }
  } catch (err) {
    console.error('Info relationships detection error:', err);
    send({ type: 'error', message: 'Failed to detect info and relationships elements' });
  }
  res.end();
});

// ---------------------------------------------------------------------------
// Contrast Minimum — on-demand detection (WCAG 1.4.3)
// ---------------------------------------------------------------------------

// POST /api/reports/:reportId/pages/:pageId/elements/1.4.3/detect
app.post('/api/reports/:reportId/pages/:pageId/elements/1.4.3/detect', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  try {
    const allElements: any[] = [];
    const detectedElements = await modifyReportPage(req.params.reportId, req.params.pageId, async (page) => {
      await detectContrastMinimum(page.url, (event) => {
        if (event.type === 'element') {
          const withId = { ...event.element, id: randomUUID() };
          allElements.push(withId);
          send({ type: 'element', element: withId });
        } else {
          send(event);
        }
      });
      if (!page.detectedElements) page.detectedElements = {};
      page.detectedElements['1.4.3'] = allElements;
      return page.detectedElements;
    });
    if (!detectedElements) { send({ type: 'error', message: 'Page not found' }); }
    else { send({ type: 'done', detectedElements }); }
  } catch (err) {
    console.error('Contrast detection error:', err);
    send({ type: 'error', message: 'Failed to detect contrast issues' });
  }
  res.end();
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

app.get('/api/projects', async (_req, res) => {
  try {
    const projects = await db.getProjects();
    const countMap = await db.getReportProjectCounts();
    return res.json(projects.map(p => ({ ...p, reportCount: countMap[p.id] ?? 0 })));
  } catch (err) {
    console.error('List projects error:', err);
    return res.status(500).json({ error: 'Failed to list projects' });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Project name is required' });
    const project: Project = {
      id: randomUUID(),
      name: name.trim(),
      description: description?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    await db.saveProject(project);
    return res.status(201).json(project);
  } catch (err) {
    console.error('Create project error:', err);
    return res.status(500).json({ error: 'Failed to create project' });
  }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await db.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const projectReports = await db.getReportSummariesForProject(req.params.id);
    return res.json({ ...project, reports: projectReports });
  } catch (err) {
    console.error('Get project error:', err);
    return res.status(500).json({ error: 'Failed to get project' });
  }
});

app.patch('/api/projects/:id', async (req, res) => {
  try {
    const project = await db.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const { name, description } = req.body;
    if (name !== undefined) project.name = name.trim() || project.name;
    if (description !== undefined) project.description = description?.trim() || undefined;
    await db.updateProject(project);
    return res.json(project);
  } catch (err) {
    console.error('Update project error:', err);
    return res.status(500).json({ error: 'Failed to update project' });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    const deleted = await db.deleteProject(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Project not found' });
    return res.sendStatus(204);
  } catch (err) {
    console.error('Delete project error:', err);
    return res.status(500).json({ error: 'Failed to delete project' });
  }
});

app.patch('/api/reports/:id', async (req, res) => {
  try {
    const { pageTitle } = req.body;
    const updated = await db.updateReportMetadata(req.params.id, {
      pageTitle: typeof pageTitle === 'string' ? pageTitle.trim() || undefined : undefined,
    });
    if (!updated) return res.status(404).json({ error: 'Report not found' });
    return res.json(updated);
  } catch (err) {
    console.error('Update report error:', err);
    return res.status(500).json({ error: 'Failed to update report' });
  }
});

app.patch('/api/reports/:id/project', async (req, res) => {
  try {
    const { projectId } = req.body;
    if (projectId !== null && projectId !== undefined) {
      const project = await db.getProject(projectId);
      if (!project) return res.status(404).json({ error: 'Project not found' });
    }
    const updated = await db.updateReportMetadata(req.params.id, {
      projectId: projectId ?? undefined,
    });
    if (!updated) return res.status(404).json({ error: 'Report not found' });
    return res.json(updated);
  } catch (err) {
    console.error('Assign project error:', err);
    return res.status(500).json({ error: 'Failed to assign project' });
  }
});

// ---------------------------------------------------------------------------
// Scan — start a job and return its ID immediately
// ---------------------------------------------------------------------------

app.post('/api/scan', (req, res) => {
  const { sitemap, xmlContent, filename, crawlUrl, maxPages = 200, auditType = 'all-inclusive', wcagLevel = 'AA', includeBestPractices = false, urls, projectId } = req.body;

  const concurrentRaw = Number(req.body.concurrent);
  let concurrent: number;
  if (!Number.isFinite(concurrentRaw)) {
    concurrent = 8;
  } else {
    const n = Math.floor(concurrentRaw);
    concurrent = [1, 3, 5, 8].includes(n) ? n : 8;
  }

  const hasUrls = Array.isArray(urls) && urls.length > 0;

  if (!sitemap && !xmlContent && !crawlUrl && !hasUrls) {
    return res.status(400).json({ error: 'A sitemap URL, uploaded file, crawl URL, or URL list is required' });
  }

  if (hasUrls) {
    if (auditType === 'rapid' && urls.length > 5) {
      return res.status(400).json({ error: 'Rapid Audit supports a maximum of 5 URLs' });
    }
    for (const u of urls) {
      try { new URL(u); } catch {
        return res.status(400).json({ error: `Invalid URL: ${u}` });
      }
    }
  }

  if (crawlUrl) {
    try { new URL(crawlUrl); } catch {
      return res.status(400).json({ error: 'Invalid crawl URL' });
    }
  }

  const jobId = randomUUID();
  const emitter = new EventEmitter();
  const abortController = new AbortController();
  const job: Job = { emitter, status: 'pending', scanned: 0, total: 0, abortController };
  jobs.set(jobId, job);

  // Respond immediately so the client can open the SSE stream
  res.status(202).json({ jobId });

  // Run the scan asynchronously — intentionally not awaited
  void (async () => {
    let tempFile: string | null = null;

    try {
      let scannerOptions: Record<string, unknown> = {
        concurrent: String(concurrent),
        headless: true,
        auditType: auditType as AuditType,
        wcagLevel: wcagLevel as 'A' | 'AA' | 'AAA',
        includeBestPractices: Boolean(includeBestPractices),
        signal: abortController.signal,
        onProgress: (scanned: number, total: number, url: string) => {
          job.scanned = scanned;
          job.total = total;
          emitter.emit('progress', { scanned, total, url });
        },
      };

      if (hasUrls) {
        job.total = urls.length;
        scannerOptions = { ...scannerOptions, urls, label: urls[0] };
      } else if (crawlUrl) {
        job.status = 'crawling';
        emitter.emit('crawling', {});

        const crawledUrls = await crawlSite(crawlUrl.trim(), {
          maxPages: Number(maxPages),
          concurrency: Number(concurrent),
          onProgress: (url, count) => emitter.emit('crawl-progress', { url, count }),
          signal: abortController.signal,
        });

        if (abortController.signal.aborted) {
          job.status = 'aborted';
          emitter.emit('aborted', {});
          return;
        }

        if (crawledUrls.length === 0) {
          job.status = 'error';
          job.error = 'No pages found when crawling that URL';
          emitter.emit('error', { message: job.error });
          return;
        }

        job.total = crawledUrls.length;
        scannerOptions = { ...scannerOptions, urls: crawledUrls, label: crawlUrl.trim() };
      } else if (xmlContent) {
        const safeName = (filename || 'sitemap').replace(/[^a-z0-9._-]/gi, '_');
        tempFile = join(tmpdir(), `${randomUUID()}-${safeName}`);
        writeFileSync(tempFile, xmlContent, 'utf-8');
        scannerOptions = { ...scannerOptions, sitemap: tempFile };
      } else {
        scannerOptions = { ...scannerOptions, sitemap: sitemap.trim() };
      }

      job.status = 'scanning';
      emitter.emit('scanning', { total: job.total });

      const scanner = new SitemapScanner(scannerOptions);
      const report = await scanner.scan();

      if (abortController.signal.aborted) {
        job.status = 'aborted';
        emitter.emit('aborted', {});
        return;
      }

      if (projectId) report.projectId = projectId;
      await db.saveReport(report);
      job.status = 'complete';
      job.reportId = report.id;
      emitter.emit('complete', { reportId: report.id });
    } catch (err) {
      if (abortController.signal.aborted) {
        job.status = 'aborted';
        emitter.emit('aborted', {});
      } else {
        console.error('Scan error:', err);
        job.status = 'error';
        job.error = err instanceof Error ? err.message : 'Scan failed';
        emitter.emit('error', { message: job.error });
      }
    } finally {
      if (tempFile) try { unlinkSync(tempFile); } catch { /* ignore */ }
      cleanupJob(jobId);
    }
  })();

  return;
});

// ---------------------------------------------------------------------------
// Abort a running job
// ---------------------------------------------------------------------------

app.delete('/api/scan/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  job.abortController.abort();
  return res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// SSE — stream progress events for a running job
// ---------------------------------------------------------------------------

app.get('/api/scan/:jobId/events', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Replay current state for late-connecting clients
  if (job.status === 'crawling') send('crawling', {});
  if (job.status === 'scanning') send('scanning', { total: job.total, scanned: job.scanned });
  if (job.status === 'complete') { send('complete', { reportId: job.reportId }); res.end(); return; }
  if (job.status === 'aborted')  { send('aborted', {});                          res.end(); return; }
  if (job.status === 'error')    { send('error', { message: job.error });         res.end(); return; }

  const onCrawling      = (d: object) => send('crawling', d);
  const onCrawlProgress = (d: object) => send('crawl-progress', d);
  const onScanning      = (d: object) => send('scanning', d);
  const onProgress      = (d: object) => send('progress', d);
  const onComplete      = (d: object) => { send('complete', d); res.end(); };
  const onAborted       = (d: object) => { send('aborted', d);  res.end(); };
  const onError         = (d: object) => { send('error', d);    res.end(); };

  job.emitter.on('crawling',       onCrawling);
  job.emitter.on('crawl-progress', onCrawlProgress);
  job.emitter.on('scanning',       onScanning);
  job.emitter.on('progress',       onProgress);
  job.emitter.on('complete',       onComplete);
  job.emitter.on('aborted',        onAborted);
  job.emitter.on('error',          onError);

  req.on('close', () => {
    job.emitter.off('crawling',       onCrawling);
    job.emitter.off('crawl-progress', onCrawlProgress);
    job.emitter.off('scanning',       onScanning);
    job.emitter.off('progress',       onProgress);
    job.emitter.off('complete',       onComplete);
    job.emitter.off('aborted',        onAborted);
    job.emitter.off('error',          onError);
  });

  return;
});

// ---------------------------------------------------------------------------
// GET /api/feature-request/status — check if GitHub token is configured
// ---------------------------------------------------------------------------

app.get('/api/feature-request/status', (_req, res) => {
  res.json({ configured: !!process.env.GITHUB_TOKEN });
});

// POST /api/feature-request — create GitHub issue
// ---------------------------------------------------------------------------

app.post('/api/feature-request', async (req, res) => {
  try {
    const { name, reportName, request, images } = req.body as {
      name: string;
      reportName?: string;
      request: string;
      images?: { filename: string; dataUrl: string }[];
    };

    if (!name?.trim() || !request?.trim()) {
      return res.status(400).json({ error: 'name and request are required' });
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return res.status(500).json({ error: 'GITHUB_TOKEN is not configured' });
    }

    const reportLine = reportName ? `\n**Report:** ${reportName.trim()}\n` : '';
    const imageLines = (images ?? []).length > 0
      ? `\n---\n_${images!.length} screenshot(s) attached — upload via the GitHub issue editor._\n`
      : '';

    const body = `**Requested by:** ${name.trim()}${reportLine}

---

${request.trim()}${imageLines}`;

    const response = await fetch('https://api.github.com/repos/10up/accessibility-scanner/issues', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title: `Feature Request: ${request.trim().split('\n')[0].slice(0, 80)}`,
        body,
        labels: ['feature request'],
      }),
    });

    if (!response.ok) {
      const json = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(json.message ?? `GitHub API error ${response.status}`);
    }

    const issue = await response.json() as { html_url: string; number: number };
    return res.json({ ok: true, issueUrl: issue.html_url, issueNumber: issue.number });
  } catch (err) {
    console.error('Feature request error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create issue' });
  }
});

// ---------------------------------------------------------------------------

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
