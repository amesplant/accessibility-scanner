import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { AuditType, ScanReport, Project, AxeViolation } from '../../shared/dist/index.js';

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

type JsonReadResult<T> = {
  value: T;
  recovered: boolean;
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

  private async writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tempFilePath = `${filePath}.${randomUUID()}.tmp`;
    await fs.writeFile(tempFilePath, JSON.stringify(value));
    await fs.rename(tempFilePath, filePath);
  }

  private buildCorruptedIntegrity(message: string): NonNullable<ScanReport['integrity']> {
    return {
      status: 'corrupted',
      message,
    };
  }

  private buildRecoveredIntegrity(message: string): NonNullable<ScanReport['integrity']> {
    return {
      status: 'recovered',
      message,
      recoveredAt: new Date().toISOString(),
    };
  }

  private sameIntegrity(
    left: ScanReport['integrity'] | undefined,
    right: ScanReport['integrity'] | undefined,
  ): boolean {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }

  private formatStoredDataError(filePath: string, error: unknown): string {
    const base = `Stored data is unreadable for ${path.basename(filePath)}`;
    if (error instanceof Error && error.message.trim()) {
      return `${base}: ${error.message}`;
    }
    return base;
  }

  private extractRecoverableJsonDocument(raw: string): string | undefined {
    const trimmed = raw.trimStart();
    const start = raw.length - trimmed.length;
    if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
      return undefined;
    }

    const stack: string[] = [];
    let inString = false;
    let escaping = false;

    for (let index = start; index < raw.length; index += 1) {
      const char = raw[index];

      if (inString) {
        if (escaping) {
          escaping = false;
        } else if (char === '\\') {
          escaping = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{' || char === '[') {
        stack.push(char);
        continue;
      }

      if (char === '}' || char === ']') {
        const last = stack.pop();
        if (!last) return undefined;
        if ((char === '}' && last !== '{') || (char === ']' && last !== '[')) {
          return undefined;
        }

        if (stack.length === 0) {
          const candidate = raw.slice(start, index + 1);
          return raw.slice(index + 1).trim().length > 0 ? candidate : undefined;
        }
      }
    }

    return undefined;
  }

  private async readJsonFileWithRecovery<T>(filePath: string): Promise<JsonReadResult<T> | undefined> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      if (!raw.trim()) {
        throw new Error(`Stored data is empty for ${path.basename(filePath)}`);
      }

      try {
        return { value: JSON.parse(raw) as T, recovered: false };
      } catch (parseError) {
        const candidate = this.extractRecoverableJsonDocument(raw);
        if (!candidate) {
          throw new Error(this.formatStoredDataError(filePath, parseError));
        }

        try {
          const value = JSON.parse(candidate) as T;
          await this.writeJsonFileAtomic(filePath, value);
          return { value, recovered: true };
        } catch {
          throw new Error(this.formatStoredDataError(filePath, parseError));
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  async reportIsBundle(id: string): Promise<boolean> {
    return this.pathExists(this.bundleManifestFile(id));
  }

  async getReportAuditType(reportId: string): Promise<AuditType | undefined> {
    const single = await this.readJsonFile<Pick<ScanReport, 'auditType'>>(this.reportFile(reportId));
    if (single) return single.auditType;
    const bundle = await this.readBundleManifest(reportId);
    return bundle?.auditType;
  }

  async streamReportPages(reportId: string, callback: (page: ScanReport['results'][number]) => Promise<void> | void): Promise<void> {
    return this.iterateReportPages(reportId, callback);
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

      await Promise.all(reports.map((report) => this.writeJsonFileAtomic(this.reportFile(report.id), report)));

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
    await this.writeJsonFileAtomic(this.metaFile, meta);
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

  private async updateStoredSummaryIntegrity(reportId: string, integrity: ScanReport['integrity'] | undefined): Promise<void> {
    const meta = await this.readMeta();
    const index = meta.summaries.findIndex((summary) => summary.id === reportId);
    if (index === -1) return;

    const nextSummary = { ...meta.summaries[index] };
    if (integrity) {
      nextSummary.integrity = integrity;
    } else {
      delete nextSummary.integrity;
    }

    meta.summaries[index] = nextSummary;
    await this.writeMeta(meta);
  }

  private async inspectReportIntegrity(
    reportId: string,
    existingIntegrity?: ScanReport['integrity'],
  ): Promise<ScanReport['integrity'] | undefined> {
    const singlePath = this.reportFile(reportId);
    const bundleManifestPath = this.bundleManifestFile(reportId);
    const singleExists = await this.pathExists(singlePath);
    const bundleExists = await this.pathExists(bundleManifestPath);

    if (!singleExists && !bundleExists) {
      return this.buildCorruptedIntegrity('Report payload is missing from storage.');
    }

    try {
      let recoveredFile: string | null = null;

      if (singleExists) {
        const parsed = await this.readJsonFileWithRecovery<ScanReport>(singlePath);
        if (!parsed) {
          return this.buildCorruptedIntegrity('Report payload is missing from storage.');
        }
        if (parsed.recovered) {
          recoveredFile = path.basename(singlePath);
        }
      } else {
        const manifest = await this.readJsonFileWithRecovery<ReportBundleManifest>(bundleManifestPath);
        if (!manifest) {
          return this.buildCorruptedIntegrity('Bundled report manifest is missing from storage.');
        }
        if (manifest.recovered) {
          recoveredFile = path.basename(bundleManifestPath);
        }

        for (const shard of manifest.value.shards) {
          const shardPath = path.join(this.bundleDir(reportId), shard.file);
          const shardReport = await this.readJsonFileWithRecovery<ScanReport>(shardPath);
          if (!shardReport) {
            return this.buildCorruptedIntegrity(`Bundled report shard is missing: ${shard.file}`);
          }
          if (shardReport.recovered && !recoveredFile) {
            recoveredFile = shard.file;
          }
        }
      }

      if (recoveredFile) {
        return this.buildRecoveredIntegrity(`Recovered malformed report data from ${recoveredFile}.`);
      }

      if (existingIntegrity?.status === 'corrupted') {
        return this.buildRecoveredIntegrity('Report data is readable again.');
      }

      return existingIntegrity?.status === 'recovered' ? existingIntegrity : undefined;
    } catch (error) {
      return this.buildCorruptedIntegrity(
        error instanceof Error ? error.message : 'Report payload could not be read.',
      );
    }
  }

  private async syncSummaryIntegrity(summaries: ReportSummary[]): Promise<ReportSummary[]> {
    if (summaries.length === 0) return summaries;

    const nextSummaries = await Promise.all(summaries.map(async (summary) => {
      const integrity = await this.inspectReportIntegrity(summary.id, summary.integrity);
      if (this.sameIntegrity(summary.integrity, integrity)) {
        return summary;
      }

      const nextSummary = { ...summary };
      if (integrity) {
        nextSummary.integrity = integrity;
      } else {
        delete nextSummary.integrity;
      }
      return nextSummary;
    }));

    const changed = nextSummaries.some((summary, index) => !this.sameIntegrity(summary.integrity, summaries[index]?.integrity));
    if (!changed) {
      return nextSummaries;
    }

    const byId = new Map(nextSummaries.map((summary) => [summary.id, summary]));
    const meta = await this.readMeta();
    meta.summaries = meta.summaries.map((summary) => byId.get(summary.id) ?? summary);
    await this.writeMeta(meta);

    return nextSummaries;
  }

  private recomputeSingleReportSummary(report: ScanReport): void {
    const summary: SummaryAccum = {
      totalPages: report.results.length,
      totalViolations: 0,
      violationsByImpact: {},
      violationsByType: {},
      violationsByLevel: {},
      manualFailCount: 0,
      auditedPages: 0,
    };

    for (const page of report.results) {
      if (page.manualAudit?.completed) summary.auditedPages += 1;
      summary.manualFailCount += page.manualAudit?.checks.filter((check) => check.status === 'fail').length ?? 0;

      for (const violation of page.violations ?? []) {
        summary.totalViolations += 1;
        summary.violationsByImpact[violation.impact] = (summary.violationsByImpact[violation.impact] ?? 0) + 1;
        summary.violationsByType[violation.id] = (summary.violationsByType[violation.id] ?? 0) + 1;
        const level = violation.level ?? 'best-practice';
        summary.violationsByLevel[level] = (summary.violationsByLevel[level] ?? 0) + 1;
      }
    }

    report.summary = summary;
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

  private violationGroupsFile(id: string): string {
    return path.join(this.reportsDir, `${id}.violations.json`);
  }

  private async readViolationGroups(id: string): Promise<ViolationGroupSummary[] | undefined> {
    return this.readJsonFile<ViolationGroupSummary[]>(this.violationGroupsFile(id));
  }

  private async writeViolationGroups(id: string, groups: ViolationGroupSummary[]): Promise<void> {
    await this.writeJsonFileAtomic(this.violationGroupsFile(id), groups);
  }

  private violationPageIndexFile(id: string): string {
    return path.join(this.reportsDir, `${id}.violation-pages.json`);
  }

  private async readViolationPageIndex(id: string): Promise<Record<string, ViolationPageSlice['items']> | undefined> {
    return this.readJsonFile<Record<string, ViolationPageSlice['items']>>(this.violationPageIndexFile(id));
  }

  private async writeViolationPageIndex(id: string, index: Record<string, ViolationPageSlice['items']>): Promise<void> {
    await this.writeJsonFileAtomic(this.violationPageIndexFile(id), index);
  }

  private buildViolationPagesFromReports(reports: ScanReport[]): Record<string, ViolationPageSlice['items']> {
    const index: Record<string, ViolationPageSlice['items']> = {};
    for (const report of reports) {
      for (const page of report.results) {
        for (const violation of page.violations) {
          const list = index[violation.id] ??= [];
          list.push({ pageId: page.id, url: page.url, violation });
        }
      }
    }
    return index;
  }

  private async buildViolationPageIndex(reportId: string): Promise<Record<string, ViolationPageSlice['items']>> {
    const index: Record<string, ViolationPageSlice['items']> = {};
    await this.iterateReportPages(reportId, (page) => {
      for (const violation of page.violations) {
        const list = index[violation.id] ??= [];
        list.push({ pageId: page.id, url: page.url, violation });
      }
    });
    return index;
  }

  private aggregateViolationGroupsFromPage(
    page: ScanReport['results'][number],
    aggregated: Map<string, ViolationGroupSummary>,
  ): void {
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

  private sortViolationGroups(groups: ViolationGroupSummary[]): ViolationGroupSummary[] {
    const order = { critical: 0, serious: 1, moderate: 2, minor: 3 } as Record<string, number>;
    return groups.sort((a, b) => order[a.impact] - order[b.impact]);
  }

  private buildViolationGroupsFromReports(reports: ScanReport[]): ViolationGroupSummary[] {
    const aggregated = new Map<string, ViolationGroupSummary>();
    for (const report of reports) {
      for (const page of report.results) {
        this.aggregateViolationGroupsFromPage(page, aggregated);
      }
    }
    return this.sortViolationGroups([...aggregated.values()]);
  }

  private async buildViolationGroups(reportId: string): Promise<ViolationGroupSummary[]> {
    const aggregated = new Map<string, ViolationGroupSummary>();
    await this.iterateReportPages(reportId, (page) => this.aggregateViolationGroupsFromPage(page, aggregated));
    return this.sortViolationGroups([...aggregated.values()]);
  }

  private async readJsonFile<T>(filePath: string): Promise<T | undefined> {
    const result = await this.readJsonFileWithRecovery<T>(filePath);
    return result?.value;
  }

  private async readBundleManifest(id: string): Promise<ReportBundleManifest | undefined> {
    return this.readJsonFile<ReportBundleManifest>(this.bundleManifestFile(id));
  }

  private async readBundleReport(id: string): Promise<ScanReport | undefined> {
    const manifest = await this.readBundleManifest(id);
    if (!manifest) return undefined;

    const reports: ScanReport[] = [];
    for (const shard of manifest.shards) {
      const shardReport = await this.readJsonFile<ScanReport>(path.join(this.bundleDir(id), shard.file));
      if (!shardReport) return undefined;
      reports.push(shardReport);
    }

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
      await this.writeJsonFileAtomic(this.reportFile(report.id), report);
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

      await this.writeJsonFileAtomic(path.join(this.bundleDir(report.id), shard.file), shardReport);
    }

    await this.writeBundleManifest(report.id, manifest);
  }

  private async writeBundleManifest(id: string, manifest: ReportBundleManifest): Promise<void> {
    await fs.mkdir(this.bundleDir(id), { recursive: true });
    await fs.mkdir(this.bundleShardsDir(id), { recursive: true });
    await this.writeJsonFileAtomic(this.bundleManifestFile(id), manifest);
  }

  async saveReportBundleShard(bundleId: string, report: ScanReport): Promise<ReportShardRef> {
    await this.ensureDirs();
    await fs.mkdir(this.bundleShardsDir(bundleId), { recursive: true });

    const shard: ReportShardRef = {
      id: report.id,
      file: path.join('shards', `${report.id}.json`),
      count: report.results.length,
    };

    await this.writeJsonFileAtomic(path.join(this.bundleShardsDir(bundleId), `${report.id}.json`), report);
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
    await this.writeJsonFileAtomic(this.reportFile(report.id), report);
    await this.upsertSummary(this.summaryOf(report));
    await this.writeViolationGroups(report.id, this.buildViolationGroupsFromReports([report]));
    await this.writeViolationPageIndex(report.id, this.buildViolationPagesFromReports([report]));
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
    await this.writeViolationGroups(bundleId, this.buildViolationGroupsFromReports(reports));
    await this.writeViolationPageIndex(bundleId, this.buildViolationPagesFromReports(reports));

    return bundleId;
  }

  /** Returns lightweight summaries (no results array) — use for list views. */
  async getReportSummaries(): Promise<ReportSummary[]> {
    const meta = await this.readMeta();
    return this.syncSummaryIntegrity(meta.summaries);
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
    return this.syncSummaryIntegrity(meta.summaries.filter(s => s.projectId === projectId));
  }

  async getReport(id: string): Promise<ScanReport | undefined> {
    const single = await this.readJsonFile<ScanReport>(this.reportFile(id));
    if (single) return single;
    return this.readBundleReport(id);
  }

  async getReportSummary(id: string): Promise<ReportSummary | undefined> {
    const meta = await this.readMeta();
    const summary = meta.summaries.find((item) => item.id === id);
    if (!summary) return undefined;
    const [synced] = await this.syncSummaryIntegrity([summary]);
    return synced;
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

  private summaryFromManifest(manifest: ReportBundleManifest): ReportSummary {
    const { kind: _kind, shards: _shards, ...summary } = manifest;
    return summary;
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

  async updateReportPage<T>(
    reportId: string,
    pageId: string,
    patch: (page: ScanReport['results'][number]) => T | Promise<T>,
  ): Promise<T | undefined> {
    await this.ensureDirs();

    const single = await this.readJsonFile<ScanReport>(this.reportFile(reportId));
    if (single) {
      const page = single.results.find((p) => p.id === pageId);
      if (!page) return undefined;
      const result = await patch(page);
      this.recomputeSingleReportSummary(single);
      await this.writeJsonFileAtomic(this.reportFile(reportId), single);
      await this.upsertSummary(this.summaryOf(single));
      await this.writeViolationGroups(reportId, await this.buildViolationGroups(reportId));
      await this.writeViolationPageIndex(reportId, await this.buildViolationPageIndex(reportId));
      return result;
    }

    const manifest = await this.readBundleManifest(reportId);
    if (!manifest) return undefined;

    for (const shard of manifest.shards) {
      const shardPath = path.join(this.bundleDir(reportId), shard.file);
      const shardReport = await this.readJsonFile<ScanReport>(shardPath);
      if (!shardReport) continue;

      const page = shardReport.results.find((p) => p.id === pageId);
      if (!page) continue;

      const result = await patch(page);
      await this.writeJsonFileAtomic(shardPath, shardReport);

      const reports: ScanReport[] = [];
      for (const manifestShard of manifest.shards) {
        const manifestShardPath = path.join(this.bundleDir(reportId), manifestShard.file);
        const report = manifestShard.file === shard.file
          ? shardReport
          : await this.readJsonFile<ScanReport>(manifestShardPath);
        if (report) reports.push(report);
      }

      if (reports.length > 0) {
        const summary = this.aggregateSummaryFromReports(reportId, reports, {
          sitemap: manifest.sitemap,
          pageTitle: manifest.pageTitle,
          projectId: manifest.projectId,
        });
        manifest.startTime = summary.startTime;
        manifest.endTime = summary.endTime;
        manifest.auditType = summary.auditType;
        manifest.wcagLevel = summary.wcagLevel;
        manifest.includeBestPractices = summary.includeBestPractices;
        manifest.summary = summary.summary;
        await this.writeJsonFileAtomic(this.bundleManifestFile(reportId), manifest);
        await this.upsertSummary(summary);
      }

      await this.writeViolationGroups(reportId, await this.buildViolationGroups(reportId));
      await this.writeViolationPageIndex(reportId, await this.buildViolationPageIndex(reportId));

      return result;
    }

    return undefined;
  }

  private async iterateReportPages(
    reportId: string,
    callback: (page: ScanReport['results'][number]) => Promise<void> | void,
  ): Promise<void> {
    const single = await this.readJsonFile<ScanReport>(this.reportFile(reportId));
    if (single) {
      for (const page of single.results) {
        await callback(page);
      }
      return;
    }

    const manifest = await this.readBundleManifest(reportId);
    if (!manifest) return;

    for (const shard of manifest.shards) {
      const shardReport = await this.readJsonFile<ScanReport>(path.join(this.bundleDir(reportId), shard.file));
      if (!shardReport) continue;
      for (const page of shardReport.results) {
        await callback(page);
      }
    }
  }

  async listViolationGroups(reportId: string): Promise<ViolationGroupSummary[]> {
    const persisted = await this.readViolationGroups(reportId);
    if (persisted) return persisted;

    const groups = await this.buildViolationGroups(reportId);
    await this.writeViolationGroups(reportId, groups);
    return groups;
  }

  async getViolationGroup(reportId: string, violationId: string): Promise<ViolationGroupSummary | undefined> {
    const groups = await this.listViolationGroups(reportId);
    return groups.find((group) => group.kind === 'automated' && group.violation?.id === violationId);
  }

  async listViolationPages(reportId: string, violationId: string, offset = 0, limit = 50): Promise<ViolationPageSlice> {
    const persisted = await this.readViolationPageIndex(reportId);
    if (persisted) {
      const items = persisted[violationId] ?? [];
      return {
        items: items.slice(offset, offset + limit),
        total: items.length,
        offset,
        limit,
      };
    }

    const matches: ViolationPageSlice['items'] = [];
    let total = 0;

    await this.iterateReportPages(reportId, (page) => {
      for (const violation of page.violations) {
        if (violation.id === violationId) {
          if (total >= offset && matches.length < limit) {
            matches.push({ pageId: page.id, url: page.url, violation });
          }
          total += 1;
        }
      }
    });

    const index = await this.buildViolationPageIndex(reportId);
    await this.writeViolationPageIndex(reportId, index);

    return {
      items: matches,
      total,
      offset,
      limit,
    };
  }

  async deleteReport(id: string): Promise<boolean> {
    await this.ensureDirs();

    const singleExists = await this.pathExists(this.reportFile(id));
    const bundleExists = await this.pathExists(this.bundleManifestFile(id));
    let removedPayload = false;

    if (singleExists) {
      await fs.unlink(this.reportFile(id));
      removedPayload = true;
    }

    if (bundleExists) {
      await fs.rm(this.bundleDir(id), { recursive: true, force: true });
      removedPayload = true;
    }

    if (await this.pathExists(this.violationGroupsFile(id))) {
      await fs.unlink(this.violationGroupsFile(id));
      removedPayload = true;
    }
    if (await this.pathExists(this.violationPageIndexFile(id))) {
      await fs.unlink(this.violationPageIndexFile(id));
      removedPayload = true;
    }

    const removedSummary = await this.removeSummary(id);
    return removedPayload || removedSummary;
  }

  async markReportCorrupted(reportId: string, message: string): Promise<void> {
    await this.updateStoredSummaryIntegrity(reportId, this.buildCorruptedIntegrity(message));
  }

  async updateReport(report: ScanReport): Promise<boolean> {
    await this.ensureDirs();

    if (await this.pathExists(this.reportFile(report.id))) {
      await this.writeJsonFileAtomic(this.reportFile(report.id), report);
      await this.upsertSummary(this.summaryOf(report));
      await this.writeViolationGroups(report.id, this.buildViolationGroupsFromReports([report]));
      await this.writeViolationPageIndex(report.id, this.buildViolationPagesFromReports([report]));
      return true;
    }

    if (await this.pathExists(this.bundleManifestFile(report.id))) {
      await this.splitReportIntoBundle(report);
      await this.upsertSummary(this.summaryOf(report));
      await this.writeViolationGroups(report.id, this.buildViolationGroupsFromReports([report]));
      await this.writeViolationPageIndex(report.id, this.buildViolationPagesFromReports([report]));
      return true;
    }

    return false;
  }

  async updateReportMetadata(reportId: string, metadata: { projectId?: string; pageTitle?: string }): Promise<ReportSummary | undefined> {
    await this.ensureDirs();

    const single = await this.readJsonFile<ScanReport>(this.reportFile(reportId));
    if (single) {
      if (metadata.projectId !== undefined) single.projectId = metadata.projectId;
      if (metadata.pageTitle !== undefined) single.pageTitle = metadata.pageTitle;
      await this.writeJsonFileAtomic(this.reportFile(reportId), single);
      const summary = this.summaryOf(single);
      await this.upsertSummary(summary);
      return summary;
    }

    const manifest = await this.readBundleManifest(reportId);
    if (!manifest) return undefined;

    if (metadata.projectId !== undefined) manifest.projectId = metadata.projectId;
    if (metadata.pageTitle !== undefined) manifest.pageTitle = metadata.pageTitle;
    await this.writeJsonFileAtomic(this.bundleManifestFile(reportId), manifest);
    const summary = this.summaryFromManifest(manifest);
    await this.upsertSummary(summary);
    return summary;
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
      await this.updateReportMetadata(s.id, { projectId: undefined });
    }));

    return true;
  }
}