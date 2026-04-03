import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { ScanReport, Project, AxeViolation } from '../../shared/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');

type SummaryStats = {
  totalPages: number;
  totalViolations: number;
  violationsByImpact: Record<string, number>;
  violationsByType: Record<string, number>;
  violationsByLevel: Record<string, number>;
  manualFailCount?: number;
  auditedPages?: number;
};

type SummaryAccum = SummaryStats & {
  manualFailCount: number;
  auditedPages: number;
};

export type ReportSummary = Omit<ScanReport, 'results'> & {
  summary: SummaryStats;
};

export interface ReportShardRef {
  id: string;
  file: string;
  count: number;
}

export interface ReportBundleManifest extends ReportSummary {
  kind: 'bundle';
  shards: ReportShardRef[];
}

export interface ReportPageSlice {
  items: ScanReport['results'];
  total: number;
  offset: number;
  limit: number;
}

export interface ViolationGroupSummary {
  kind: 'automated' | 'manual';
  violation?: AxeViolation;
  checkId?: string;
  title?: string;
  wcagCriterion?: string;
  level?: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  firstPageId: string;
  firstPageUrl: string;
  count: number;
  pageCount: number;
}

export interface ViolationPageSlice {
  items: Array<{ pageId: string; url: string; violation: AxeViolation }>;
  total: number;
  offset: number;
  limit: number;
}

interface Meta {
  projects: Project[];
  summaries: ReportSummary[];
}

export class DatabaseService {
  private dataDir: string;
  private reportsDir: string;
  private metaFile: string;
  /** Path to the legacy monolithic file, used only for one-time migration */
  private legacyFile: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.reportsDir = path.join(this.dataDir, 'reports');
    this.metaFile = path.join(this.dataDir, 'meta.json');
    this.legacyFile = path.join(this.dataDir, 'reports.json');
  }

  // ── Initialisation / migration ────────────────────────────────────────────

  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.reportsDir, { recursive: true });
  }

  private reportFile(id: string): string {
    return path.join(this.reportsDir, `${id}.json`);
  }

  private bundleDir(id: string): string {
    return path.join(this.reportsDir, id);
  }

  private bundleManifestFile(id: string): string {
    return path.join(this.bundleDir(id), 'manifest.json');
  }

  private bundleShardsDir(id: string): string {
    return path.join(this.bundleDir(id), 'shards');
  }

  private async pathExists(filePath: string): Promise<boolean> {
    return fs.access(filePath).then(() => true).catch(() => false);
  }

  /**
   * One-time migration: if the legacy monolithic reports.json exists and
   * meta.json does not, split every report into its own file and write meta.json.
   * The legacy file is renamed to reports.json.bak when done.
   */
  async migrate(): Promise<void> {
    await this.ensureDirs();

    const metaExists = await this.pathExists(this.metaFile);
    if (metaExists) return;

    const legacyExists = await this.pathExists(this.legacyFile);

    if (legacyExists) {
      // eslint-disable-next-line no-console
      console.log('[db] Migrating monolithic reports.json to per-report files…');
      const raw = await fs.readFile(this.legacyFile, 'utf-8');
      const legacy = JSON.parse(raw) as { reports?: ScanReport[]; projects?: Project[] };
      const reports: ScanReport[] = legacy.reports ?? [];
      const projects: Project[] = legacy.projects ?? [];

      await Promise.all(reports.map(r =>
        fs.writeFile(this.reportFile(r.id), JSON.stringify(r))
      ));

      const summaries: ReportSummary[] = reports.map(({ results: _r, ...s }) => s);
      await this.writeMeta({ projects, summaries });

      await fs.rename(this.legacyFile, `${this.legacyFile}.bak`);
      // eslint-disable-next-line no-console
      console.log(`[db] Migration complete. ${reports.length} reports migrated.`);
    } else {
      await this.writeMeta({ projects: [], summaries: [] });
    }
  }

  // ── Meta helpers ─────────────────────────────────────────────────────────

  private async readMeta(): Promise<Meta> {
    await this.ensureDirs();
    try {
      const raw = await fs.readFile(this.metaFile, 'utf-8');
      const data = JSON.parse(raw) as Partial<Meta>;
      return { projects: data.projects ?? [], summaries: data.summaries ?? [] };
    } catch {
      return { projects: [], summaries: [] };
    }
  }

  private async writeMeta(meta: Meta): Promise<void> {
    await this.ensureDirs();
    await fs.writeFile(this.metaFile, JSON.stringify(meta));
  }

  private async upsertSummary(summary: ReportSummary): Promise<void> {
    const meta = await this.readMeta();
    const existingIndex = meta.summaries.findIndex((item) => item.id === summary.id);
    if (existingIndex !== -1) {
      meta.summaries[existingIndex] = summary;
    } else {
      meta.summaries.push(summary);
    }
    await this.writeMeta(meta);
  }

  private async removeSummary(id: string): Promise<boolean> {
    const meta = await this.readMeta();
    const before = meta.summaries.length;
    meta.summaries = meta.summaries.filter((summary) => summary.id !== id);
    if (meta.summaries.length === before) return false;
    await this.writeMeta(meta);
    return true;
  }

  private summaryOf(report: ScanReport): ReportSummary {
    const { results: _r, ...summary } = report;
    return summary;
  }

  private aggregateSummaryFromReports(
    id: string,
    reports: ScanReport[],
    options: { sitemap?: string; pageTitle?: string; projectId?: string } = {},
  ): ReportSummary {
    const first = reports[0];
    const totals: SummaryAccum = {
      totalPages: 0,
      totalViolations: 0,
      violationsByImpact: {},
      violationsByType: {},
      violationsByLevel: {},
      manualFailCount: 0,
      auditedPages: 0,
    };
    const summary: ReportSummary = {
      id,
      sitemap: options.sitemap ?? first.sitemap,
      pageTitle: options.pageTitle ?? first.pageTitle,
      startTime: first.startTime,
      endTime: first.endTime,
      auditType: first.auditType,
      wcagLevel: first.wcagLevel,
      includeBestPractices: first.includeBestPractices,
      projectId: options.projectId ?? first.projectId,
      summary: totals,
    };

    for (const report of reports) {
      const reportTotals = report.summary as SummaryStats;
      totals.totalPages += report.summary.totalPages;
      totals.totalViolations += report.summary.totalViolations;
      totals.manualFailCount += reportTotals.manualFailCount ?? 0;
      totals.auditedPages += reportTotals.auditedPages ?? 0;

      for (const [impact, count] of Object.entries(report.summary.violationsByImpact)) {
        totals.violationsByImpact[impact] = (totals.violationsByImpact[impact] ?? 0) + count;
      }

      for (const [type, count] of Object.entries(report.summary.violationsByType)) {
        totals.violationsByType[type] = (totals.violationsByType[type] ?? 0) + count;
      }

      for (const [level, count] of Object.entries(report.summary.violationsByLevel)) {
        totals.violationsByLevel[level] = (totals.violationsByLevel[level] ?? 0) + count;
      }

      if (new Date(report.startTime).getTime() < new Date(summary.startTime).getTime()) {
        summary.startTime = report.startTime;
      }
      if (new Date(report.endTime).getTime() > new Date(summary.endTime).getTime()) {
        summary.endTime = report.endTime;
      }
    }

    return summary;
  }

  private bundleManifestFromReports(
    bundleId: string,
    reports: ScanReport[],
    options: { sitemap?: string; pageTitle?: string; projectId?: string } = {},
  ): ReportBundleManifest {
    const summary = this.aggregateSummaryFromReports(bundleId, reports, options);
    return {
      ...summary,
      kind: 'bundle',
      shards: reports.map((report) => ({
        id: report.id,
        file: path.join('shards', `${report.id}.json`),
        count: report.results.length,
      })),
    };
  }

  private async readJsonFile<T>(filePath: string): Promise<T | undefined> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  private async readBundleManifest(id: string): Promise<ReportBundleManifest | undefined> {
    return this.readJsonFile<ReportBundleManifest>(this.bundleManifestFile(id));
  }

  private async readBundleReport(id: string): Promise<ScanReport | undefined> {
    const manifest = await this.readBundleManifest(id);
    if (!manifest) return undefined;

    const shardReports = await Promise.all(
      manifest.shards.map((shard) => this.readJsonFile<ScanReport>(path.join(this.bundleDir(id), shard.file))),
    );

    if (shardReports.some((report) => !report)) {
      return undefined;
    }

    const reports = shardReports as ScanReport[];
    const summary = this.aggregateSummaryFromReports(id, reports, {
      sitemap: manifest.sitemap,
      pageTitle: manifest.pageTitle,
      projectId: manifest.projectId,
    });
    return {
      ...manifest,
      summary: summary.summary,
      results: reports.flatMap((report) => report.results),
    };
  }

  private async splitReportIntoBundle(report: ScanReport): Promise<void> {
    const manifest = await this.readBundleManifest(report.id);
    if (!manifest) {
      throw new Error(`Bundle manifest not found for report ${report.id}`);
    }

    const totalSize = manifest.shards.reduce((sum, shard) => sum + shard.count, 0);
    if (totalSize !== report.results.length) {
      // If the report shape changed unexpectedly, fall back to a single-file report.
      await fs.rm(this.bundleDir(report.id), { recursive: true, force: true });
      await fs.writeFile(this.reportFile(report.id), JSON.stringify(report));
      return;
    }

    await fs.mkdir(this.bundleShardsDir(report.id), { recursive: true });

    let offset = 0;
    for (const shard of manifest.shards) {
      const nextResults = report.results.slice(offset, offset + shard.count);
      offset += shard.count;
      const shardTotals: SummaryAccum = {
        totalPages: nextResults.length,
        totalViolations: nextResults.reduce((sum, page) => sum + page.violations.length, 0),
        violationsByImpact: {},
        violationsByType: {},
        violationsByLevel: {},
        manualFailCount: nextResults.reduce((sum, page) => sum + (page.manualAudit?.checks.filter(c => c.status === 'fail').length ?? 0), 0),
        auditedPages: nextResults.filter(page => page.manualAudit?.completed).length,
      };
      const shardReport: ScanReport = {
        ...report,
        id: shard.id,
        results: nextResults,
        summary: shardTotals,
      };
      const shardSummary = shardTotals;

      for (const page of nextResults) {
        for (const violation of page.violations) {
          shardSummary.violationsByImpact[violation.impact] = (shardSummary.violationsByImpact[violation.impact] ?? 0) + 1;
          shardSummary.violationsByType[violation.id] = (shardSummary.violationsByType[violation.id] ?? 0) + 1;
          const level = violation.level ?? 'best-practice';
          shardSummary.violationsByLevel[level] = (shardSummary.violationsByLevel[level] ?? 0) + 1;
        }
      }

      await fs.writeFile(path.join(this.bundleDir(report.id), shard.file), JSON.stringify(shardReport));
    }

    await this.writeBundleManifest(report.id, manifest);
  }

  private async writeBundleManifest(id: string, manifest: ReportBundleManifest): Promise<void> {
    await fs.mkdir(this.bundleDir(id), { recursive: true });
    await fs.mkdir(this.bundleShardsDir(id), { recursive: true });
    await fs.writeFile(this.bundleManifestFile(id), JSON.stringify(manifest));
  }

  async saveReportBundleShard(bundleId: string, report: ScanReport): Promise<ReportShardRef> {
    await this.ensureDirs();
    await fs.mkdir(this.bundleShardsDir(bundleId), { recursive: true });

    const shard: ReportShardRef = {
      id: report.id,
      file: path.join('shards', `${report.id}.json`),
      count: report.results.length,
    };

    await fs.writeFile(path.join(this.bundleShardsDir(bundleId), `${report.id}.json`), JSON.stringify(report));
    return shard;
  }

  async saveReportBundleManifest(bundleId: string, manifest: ReportBundleManifest): Promise<void> {
    await this.writeBundleManifest(bundleId, manifest);
    const { kind: _kind, shards: _shards, ...summary } = manifest;
    await this.upsertSummary(summary);
  }

  // ── Reports ──────────────────────────────────────────────────────────────

  async saveReport(report: ScanReport): Promise<void> {
    await this.ensureDirs();
    await fs.writeFile(this.reportFile(report.id), JSON.stringify(report));
    await this.upsertSummary(this.summaryOf(report));
  }

  async saveReportBundle(
    reports: ScanReport[],
    options: { id?: string; sitemap?: string; pageTitle?: string; projectId?: string } = {},
  ): Promise<string> {
    if (reports.length === 0) {
      throw new Error('No reports to bundle');
    }

    await this.ensureDirs();

    const bundleId = options.id ?? randomUUID();
    const manifest = this.bundleManifestFromReports(bundleId, reports, options);

    for (const report of reports) {
      await this.saveReportBundleShard(bundleId, report);
    }
    await this.saveReportBundleManifest(bundleId, manifest);

    return bundleId;
  }

  /** Returns lightweight summaries (no results array) — use for list views. */
  async getReportSummaries(): Promise<ReportSummary[]> {
    const meta = await this.readMeta();
    return meta.summaries;
  }

  /** Assignments only — small payload for project list report counts. */
  async getReportProjectCounts(): Promise<Record<string, number>> {
    const meta = await this.readMeta();
    const acc: Record<string, number> = {};
    for (const s of meta.summaries) {
      if (s.projectId) acc[s.projectId] = (acc[s.projectId] ?? 0) + 1;
    }
    return acc;
  }

  async getReportSummariesForProject(projectId: string): Promise<ReportSummary[]> {
    const meta = await this.readMeta();
    return meta.summaries.filter(s => s.projectId === projectId);
  }

  async getReport(id: string): Promise<ScanReport | undefined> {
    const single = await this.readJsonFile<ScanReport>(this.reportFile(id));
    if (single) return single;
    return this.readBundleReport(id);
  }

  async getReportSummary(id: string): Promise<ReportSummary | undefined> {
    const meta = await this.readMeta();
    return meta.summaries.find((summary) => summary.id === id);
  }

  private async readReportPageByIndex(reportId: string, offset: number, limit: number): Promise<ReportPageSlice> {
    const single = await this.readJsonFile<ScanReport>(this.reportFile(reportId));
    if (single) {
      const items = single.results.slice(offset, offset + limit);
      return { items, total: single.results.length, offset, limit };
    }

    const manifest = await this.readBundleManifest(reportId);
    if (!manifest) {
      return { items: [], total: 0, offset, limit };
    }

    const total = manifest.shards.reduce((sum, shard) => sum + shard.count, 0);
    const items: ScanReport['results'] = [];
    let cursor = 0;

    for (const shard of manifest.shards) {
      if (items.length >= limit) break;
      const shardStart = cursor;
      const shardEnd = cursor + shard.count;
      cursor = shardEnd;
      if (offset >= shardEnd) continue;

      const shardReport = await this.readJsonFile<ScanReport>(path.join(this.bundleDir(reportId), shard.file));
      if (!shardReport) continue;

      const startInShard = Math.max(0, offset - shardStart);
      const remaining = limit - items.length;
      items.push(...shardReport.results.slice(startInShard, startInShard + remaining));
    }

    return { items, total, offset, limit };
  }

  async listReportPages(reportId: string, offset = 0, limit = 50): Promise<ReportPageSlice> {
    return this.readReportPageByIndex(reportId, offset, limit);
  }

  async getReportPage(reportId: string, pageId: string): Promise<ScanReport['results'][number] | undefined> {
    const single = await this.readJsonFile<ScanReport>(this.reportFile(reportId));
    if (single) {
      return single.results.find((page) => page.id === pageId);
    }

    const manifest = await this.readBundleManifest(reportId);
    if (!manifest) return undefined;

    for (const shard of manifest.shards) {
      const shardReport = await this.readJsonFile<ScanReport>(path.join(this.bundleDir(reportId), shard.file));
      const page = shardReport?.results.find((entry) => entry.id === pageId);
      if (page) return page;
    }

    return undefined;
  }

  async listViolationGroups(reportId: string): Promise<ViolationGroupSummary[]> {
    const aggregated = new Map<string, ViolationGroupSummary>();
    const pages = await this.listReportPages(reportId, 0, Number.MAX_SAFE_INTEGER);

    for (const page of pages.items) {
      for (const violation of page.violations) {
        const existing = aggregated.get(violation.id);
        if (existing) {
          existing.count += 1;
          existing.pageCount += 1;
          continue;
        }

        aggregated.set(violation.id, {
          kind: 'automated',
          violation,
          firstPageId: page.id,
          firstPageUrl: page.url,
          count: 1,
          pageCount: 1,
          impact: violation.impact,
        });
      }

      const failedChecks = page.manualAudit?.checks.filter((check) => check.status === 'fail') ?? [];
      for (const check of failedChecks) {
        const existing = aggregated.get(`manual:${check.id}`);
        const impact = (check.impact ?? 'moderate') as 'critical' | 'serious' | 'moderate' | 'minor';
        if (existing) {
          existing.count += 1;
          existing.pageCount += 1;
          continue;
        }

        aggregated.set(`manual:${check.id}`, {
          kind: 'manual',
          checkId: check.id,
          title: check.title,
          wcagCriterion: check.wcagCriterion,
          level: check.level,
          impact,
          firstPageId: page.id,
          firstPageUrl: page.url,
          count: 1,
          pageCount: 1,
        });
      }
    }

    return [...aggregated.values()].sort((a, b) => {
      const order = { critical: 0, serious: 1, moderate: 2, minor: 3 } as Record<string, number>;
      return order[a.impact] - order[b.impact];
    });
  }

  async getViolationGroup(reportId: string, violationId: string): Promise<ViolationGroupSummary | undefined> {
    const groups = await this.listViolationGroups(reportId);
    return groups.find((group) => group.kind === 'automated' && group.violation?.id === violationId);
  }

  async listViolationPages(reportId: string, violationId: string, offset = 0, limit = 50): Promise<ViolationPageSlice> {
    const pages = await this.listReportPages(reportId, 0, Number.MAX_SAFE_INTEGER);
    const matches: ViolationPageSlice['items'] = [];

    for (const page of pages.items) {
      for (const violation of page.violations) {
        if (violation.id === violationId) {
          matches.push({ pageId: page.id, url: page.url, violation });
        }
      }
    }

    return {
      items: matches.slice(offset, offset + limit),
      total: matches.length,
      offset,
      limit,
    };
  }

  async deleteReport(id: string): Promise<boolean> {
    await this.ensureDirs();

    const singleExists = await this.pathExists(this.reportFile(id));
    const bundleExists = await this.pathExists(this.bundleManifestFile(id));

    if (!singleExists && !bundleExists) {
      return false;
    }

    if (singleExists) {
      await fs.unlink(this.reportFile(id));
    }

    if (bundleExists) {
      await fs.rm(this.bundleDir(id), { recursive: true, force: true });
    }

    return this.removeSummary(id);
  }

  async updateReport(report: ScanReport): Promise<boolean> {
    await this.ensureDirs();

    if (await this.pathExists(this.reportFile(report.id))) {
      await fs.writeFile(this.reportFile(report.id), JSON.stringify(report));
      await this.upsertSummary(this.summaryOf(report));
      return true;
    }

    if (await this.pathExists(this.bundleManifestFile(report.id))) {
      await this.splitReportIntoBundle(report);
      await this.upsertSummary(this.summaryOf(report));
      return true;
    }

    return false;
  }

  async clearReports(): Promise<void> {
    await this.ensureDirs();

    // Remove every file in reports directory; this avoids stale meta vs file mismatch.
    const entries = await fs.readdir(this.reportsDir, { withFileTypes: true });
    await Promise.all(entries.map((entry) =>
      fs.rm(path.join(this.reportsDir, entry.name), { recursive: true, force: true }).catch(() => { /* ignore */ })
    ));

    // Reset full meta state so dashboard and API return empty results.
    await this.writeMeta({ projects: [], summaries: [] });
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async saveProject(project: Project): Promise<void> {
    const meta = await this.readMeta();
    meta.projects.push(project);
    await this.writeMeta(meta);
  }

  async getProjects(): Promise<Project[]> {
    const meta = await this.readMeta();
    return meta.projects;
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    const meta = await this.readMeta();
    return meta.projects.find(p => p.id === projectId);
  }

  async updateProject(project: Project): Promise<boolean> {
    const meta = await this.readMeta();
    const idx = meta.projects.findIndex(p => p.id === project.id);
    if (idx === -1) return false;
    meta.projects[idx] = project;
    await this.writeMeta(meta);
    return true;
  }

  async deleteProject(projectId: string): Promise<boolean> {
    const meta = await this.readMeta();
    const before = meta.projects.length;
    meta.projects = meta.projects.filter(p => p.id !== projectId);
    if (meta.projects.length === before) return false;

    const affected = meta.summaries.filter(s => s.projectId === projectId);
    meta.summaries = meta.summaries.map(s =>
      s.projectId === projectId ? { ...s, projectId: undefined } : s
    );
    await this.writeMeta(meta);

    await this.ensureDirs();
    await Promise.all(affected.map(async s => {
      const report = await this.getReport(s.id);
      if (report) {
        report.projectId = undefined;
        await this.updateReport(report);
      }
    }));

    return true;
  }
}