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
import { AuditType, createDefaultChecks, ManualAudit, ManualAuditStatus, ManualCheckResult, ManualFailureInstance, Project } from '@accessibility-scanner/shared';

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

app.post('/api/reports/:id/export/csv', async (req, res) => {
  try {
    const report = await db.getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const { selectedViolations, tasklistName, selectedLevels } = req.body;
    const exporter = new Reporter();
    const csvData = exporter.exportToCsv(report, selectedViolations, tasklistName, selectedLevels);
    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', `attachment; filename="accessibility-export-${req.params.id}.csv"`);
    return res.send(csvData);
  } catch (error) {
    console.error('CSV export error:', error);
    return res.status(500).json({ error: 'CSV export failed' });
  }
});

app.post('/api/reports/:id/export/excel', async (req, res) => {
  try {
    const report = await db.getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const { selectedViolations, tasklistName, selectedLevels } = req.body;
    const exporter = new Reporter();
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.header('Content-Disposition', `attachment; filename="accessibility-export-${req.params.id}.xlsx"`);
    res.flushHeaders();
    await exporter.streamToExcel(report, res, selectedViolations, tasklistName, selectedLevels);
    return;
  } catch (error) {
    console.error('Excel export error:', error);
    return res.status(500).json({ error: 'Excel export failed' });
  }
});

app.post('/api/reports/:id/export/jira', async (req, res) => {
  try {
    const report = await db.getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const { selectedViolations, selectedLevels } = req.body;
    const exporter = new Reporter();
    const csvData = exporter.exportToJiraCsv(report, selectedViolations, selectedLevels);
    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', `attachment; filename="jira-export-${req.params.id}.csv"`);
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
    const report = await db.getReport(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const page = report.results.find((r: { id: string }) => r.id === req.params.pageId);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const violation = page.violations.find((v: { id: string }) => v.id === req.params.violationId);
    if (!violation) return res.status(404).json({ error: 'Violation not found' });

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

    await db.updateReport(report);
    return res.json({ violations: page.violations });
  } catch (err) {
    console.error('Violation override error:', err);
    return res.status(500).json({ error: 'Failed to update violation' });
  }
});

// PATCH /api/reports/:reportId/pages/:pageId/violations/:violationId/nodes/:nodeIndex
app.patch('/api/reports/:reportId/pages/:pageId/violations/:violationId/nodes/:nodeIndex', async (req, res) => {
  try {
    const report = await db.getReport(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const page = report.results.find((r: { id: string }) => r.id === req.params.pageId);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const violation = page.violations.find((v: { id: string }) => v.id === req.params.violationId);
    if (!violation) return res.status(404).json({ error: 'Violation not found' });

    const nodeIndex = parseInt(req.params.nodeIndex, 10);
    const node = violation.nodes[nodeIndex];
    if (!node) return res.status(404).json({ error: 'Node not found' });

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

    // Auto-derive violation-level status from node statuses (unless violation is N/A)
    if (violation.overrideStatus !== 'na') {
      const allPass = violation.nodes.every(n => n.overrideStatus === 'pass');
      if (allPass) {
        violation.overrideStatus = 'pass';
      } else {
        delete violation.overrideStatus;
      }
    }

    await db.updateReport(report);
    return res.json({ violations: page.violations });
  } catch (err) {
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

// PATCH /api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId
app.patch('/api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId', async (req, res) => {
  try {
    const report = await db.getReport(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const page = report.results.find(r => r.id === req.params.pageId);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    if (!page.manualAudit) page.manualAudit = initManualAudit(report.auditType);

    const { status, notes, codeSnippet, screenshotDataUrl } = req.body as {
      status: ManualAuditStatus;
      notes?: string;
      codeSnippet?: string;
      screenshotDataUrl?: string;
    };
    const check = page.manualAudit.checks.find(c => c.id === req.params.checkId);
    if (check) {
      check.status = status;
      if (notes !== undefined) check.notes = notes;
      if (codeSnippet !== undefined) check.codeSnippet = codeSnippet;
      if (screenshotDataUrl !== undefined) check.screenshotDataUrl = screenshotDataUrl;
      check.updatedAt = new Date().toISOString();
    }
    page.manualAudit.lastUpdated = new Date().toISOString();

    await db.updateReport(report);
    return res.json({ manualAudit: page.manualAudit });
  } catch (err) {
    console.error('Manual audit update error:', err);
    return res.status(500).json({ error: 'Failed to update check' });
  }
});

// POST /api/reports/:reportId/pages/:pageId/manual-audit/checks
app.post('/api/reports/:reportId/pages/:pageId/manual-audit/checks', async (req, res) => {
  try {
    const report = await db.getReport(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const page = report.results.find(r => r.id === req.params.pageId);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    if (!page.manualAudit) page.manualAudit = initManualAudit(report.auditType);

    const { title, description, impact, status, notes } = req.body as Partial<ManualCheckResult>;
    if (!title) return res.status(400).json({ error: 'title is required' });

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

    await db.updateReport(report);
    return res.status(201).json({ manualAudit: page.manualAudit });
  } catch (err) {
    console.error('Add custom check error:', err);
    return res.status(500).json({ error: 'Failed to add custom check' });
  }
});

// DELETE /api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId
app.delete('/api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId', async (req, res) => {
  try {
    const report = await db.getReport(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const page = report.results.find(r => r.id === req.params.pageId);
    if (!page || !page.manualAudit) return res.status(404).json({ error: 'Page or audit not found' });

    const check = page.manualAudit.checks.find(c => c.id === req.params.checkId);
    if (!check) return res.status(404).json({ error: 'Check not found' });
    if (check.type !== 'custom') return res.status(400).json({ error: 'Only custom checks can be deleted' });

    page.manualAudit.checks = page.manualAudit.checks.filter(c => c.id !== req.params.checkId);
    page.manualAudit.lastUpdated = new Date().toISOString();

    await db.updateReport(report);
    return res.sendStatus(204);
  } catch (err) {
    console.error('Delete custom check error:', err);
    return res.status(500).json({ error: 'Failed to delete check' });
  }
});

// PATCH /api/reports/:reportId/pages/:pageId/manual-audit/complete
app.patch('/api/reports/:reportId/pages/:pageId/manual-audit/complete', async (req, res) => {
  try {
    const report = await db.getReport(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const page = report.results.find(r => r.id === req.params.pageId);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    if (!page.manualAudit) page.manualAudit = initManualAudit(report.auditType);

    const { completed } = req.body as { completed: boolean };
    page.manualAudit.completed = completed;
    page.manualAudit.completedAt = completed ? new Date().toISOString() : undefined;
    page.manualAudit.lastUpdated = new Date().toISOString();

    await db.updateReport(report);
    return res.json({ manualAudit: page.manualAudit });
  } catch (err) {
    console.error('Audit complete toggle error:', err);
    return res.status(500).json({ error: 'Failed to update audit completion' });
  }
});

// PATCH /api/reports/:reportId/pages/:pageId/manual-audit
app.patch('/api/reports/:reportId/pages/:pageId/manual-audit', async (req, res) => {
  try {
    const report = await db.getReport(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const page = report.results.find(r => r.id === req.params.pageId);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    if (!page.manualAudit) page.manualAudit = initManualAudit(report.auditType);

    const { auditorNotes } = req.body as { auditorNotes?: string };
    page.manualAudit.auditorNotes = auditorNotes;
    page.manualAudit.lastUpdated = new Date().toISOString();

    await db.updateReport(report);
    return res.json({ manualAudit: page.manualAudit });
  } catch (err) {
    console.error('Auditor notes update error:', err);
    return res.status(500).json({ error: 'Failed to update auditor notes' });
  }
});

// POST /api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId/failures
app.post('/api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId/failures', async (req, res) => {
  try {
    const report = await db.getReport(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const page = report.results.find(r => r.id === req.params.pageId);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    if (!page.manualAudit) page.manualAudit = initManualAudit(report.auditType);

    const check = page.manualAudit.checks.find(c => c.id === req.params.checkId);
    if (!check) return res.status(404).json({ error: 'Check not found' });

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

    await db.updateReport(report);
    return res.status(201).json({ manualAudit: page.manualAudit });
  } catch (err) {
    console.error('Add failure instance error:', err);
    return res.status(500).json({ error: 'Failed to add failure instance' });
  }
});

// PATCH /api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId/failures/:failureId
app.patch('/api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId/failures/:failureId', async (req, res) => {
  try {
    const report = await db.getReport(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const page = report.results.find(r => r.id === req.params.pageId);
    if (!page || !page.manualAudit) return res.status(404).json({ error: 'Page or audit not found' });

    const check = page.manualAudit.checks.find(c => c.id === req.params.checkId);
    if (!check) return res.status(404).json({ error: 'Check not found' });

    const failure = (check.failures ?? []).find(f => f.id === req.params.failureId);
    if (!failure) return res.status(404).json({ error: 'Failure instance not found' });

    const { scope, notes, codeSnippet, screenshotDataUrl, status } = req.body;
    if (scope !== undefined) failure.scope = scope;
    if (notes !== undefined) failure.notes = notes;
    if (codeSnippet !== undefined) failure.codeSnippet = codeSnippet;
    if (screenshotDataUrl !== undefined) failure.screenshotDataUrl = screenshotDataUrl;
    if (status !== undefined) failure.status = status;

    // Auto-derive check status from instance statuses
    const allFailures = check.failures ?? [];
    if (allFailures.length > 0) {
      check.status = allFailures.every(f => f.status === 'pass') ? 'pass' : 'fail';
    }

    check.updatedAt = new Date().toISOString();
    page.manualAudit.lastUpdated = new Date().toISOString();

    await db.updateReport(report);
    return res.json({ manualAudit: page.manualAudit });
  } catch (err) {
    console.error('Update failure instance error:', err);
    return res.status(500).json({ error: 'Failed to update failure instance' });
  }
});

// DELETE /api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId/failures/:failureId
app.delete('/api/reports/:reportId/pages/:pageId/manual-audit/checks/:checkId/failures/:failureId', async (req, res) => {
  try {
    const report = await db.getReport(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const page = report.results.find(r => r.id === req.params.pageId);
    if (!page || !page.manualAudit) return res.status(404).json({ error: 'Page or audit not found' });

    const check = page.manualAudit.checks.find(c => c.id === req.params.checkId);
    if (!check) return res.status(404).json({ error: 'Check not found' });

    check.failures = (check.failures ?? []).filter(f => f.id !== req.params.failureId);
    if (check.failures.length === 0) check.status = 'not-tested';
    check.updatedAt = new Date().toISOString();
    page.manualAudit.lastUpdated = new Date().toISOString();

    await db.updateReport(report);
    return res.sendStatus(204);
  } catch (err) {
    console.error('Delete failure instance error:', err);
    return res.status(500).json({ error: 'Failed to delete failure instance' });
  }
});

// ---------------------------------------------------------------------------
// Detected Elements (WCAG criterion-level element audit)
// ---------------------------------------------------------------------------

// PATCH /api/reports/:reportId/pages/:pageId/elements/:criterionId/:elementId
app.patch('/api/reports/:reportId/pages/:pageId/elements/:criterionId/:elementId', async (req, res) => {
  try {
    const report = await db.getReport(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const page = report.results.find(r => r.id === req.params.pageId);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const elements = page.detectedElements?.[req.params.criterionId];
    if (!elements) return res.status(404).json({ error: 'No detected elements for this criterion' });

    const element = elements.find(e => e.id === req.params.elementId);
    if (!element) return res.status(404).json({ error: 'Element not found' });

    const { auditStatus, auditComment } = req.body as { auditStatus?: 'pass' | 'fail' | 'not-reviewed'; auditComment?: string };
    if (auditStatus) element.auditStatus = auditStatus;
    if (auditComment !== undefined) element.auditComment = auditComment || undefined;

    await db.updateReport(report);
    return res.json({ detectedElements: page.detectedElements });
  } catch (err) {
    console.error('Element update error:', err);
    return res.status(500).json({ error: 'Failed to update element' });
  }
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

app.patch('/api/reports/:id/project', async (req, res) => {
  try {
    const report = await db.getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const { projectId } = req.body;
    if (projectId !== null && projectId !== undefined) {
      const project = await db.getProject(projectId);
      if (!project) return res.status(404).json({ error: 'Project not found' });
    }
    report.projectId = projectId ?? undefined;
    await db.updateReport(report);
    return res.json(report);
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

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
