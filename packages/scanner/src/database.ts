import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ScanReport, Project } from '@accessibility-scanner/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');

export type ReportSummary = Omit<ScanReport, 'results'>;

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

  /**
   * One-time migration: if the legacy monolithic reports.json exists and
   * meta.json does not, split every report into its own file and write meta.json.
   * The legacy file is renamed to reports.json.bak when done.
   */
  async migrate(): Promise<void> {
    await this.ensureDirs();

    const metaExists = await fs.access(this.metaFile).then(() => true).catch(() => false);
    if (metaExists) return;

    const legacyExists = await fs.access(this.legacyFile).then(() => true).catch(() => false);

    if (legacyExists) {
      console.log('[db] Migrating monolithic reports.json to per-report files…');
      const raw = await fs.readFile(this.legacyFile, 'utf-8');
      const legacy = JSON.parse(raw) as { reports?: ScanReport[]; projects?: Project[] };
      const reports: ScanReport[] = legacy.reports ?? [];
      const projects: Project[] = legacy.projects ?? [];

      await Promise.all(reports.map(r =>
        fs.writeFile(path.join(this.reportsDir, `${r.id}.json`), JSON.stringify(r))
      ));

      const summaries: ReportSummary[] = reports.map(({ results: _r, ...s }) => s);
      await this.writeMeta({ projects, summaries });

      await fs.rename(this.legacyFile, `${this.legacyFile}.bak`);
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

  private summaryOf(report: ScanReport): ReportSummary {
    const { results: _r, ...summary } = report;
    return summary;
  }

  // ── Reports ──────────────────────────────────────────────────────────────

  async saveReport(report: ScanReport): Promise<void> {
    await this.ensureDirs();
    await fs.writeFile(
      path.join(this.reportsDir, `${report.id}.json`),
      JSON.stringify(report)
    );
    const meta = await this.readMeta();
    const summary = this.summaryOf(report);
    const existingIndex = meta.summaries.findIndex((s) => s.id === report.id);
    if (existingIndex !== -1) {
      meta.summaries[existingIndex] = summary;
    } else {
      meta.summaries.push(summary);
    }
    await this.writeMeta(meta);
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
    try {
      const raw = await fs.readFile(path.join(this.reportsDir, `${id}.json`), 'utf-8');
      return JSON.parse(raw) as ScanReport;
    } catch {
      return undefined;
    }
  }

  async deleteReport(id: string): Promise<boolean> {
    await this.ensureDirs();
    try {
      await fs.unlink(path.join(this.reportsDir, `${id}.json`));
    } catch {
      return false;
    }
    const meta = await this.readMeta();
    const before = meta.summaries.length;
    meta.summaries = meta.summaries.filter(s => s.id !== id);
    if (meta.summaries.length === before) return false;
    await this.writeMeta(meta);
    return true;
  }

  async updateReport(report: ScanReport): Promise<boolean> {
    await this.ensureDirs();
    const filePath = path.join(this.reportsDir, `${report.id}.json`);
    try {
      await fs.access(filePath);
    } catch {
      return false;
    }
    await fs.writeFile(filePath, JSON.stringify(report));
    const meta = await this.readMeta();
    const idx = meta.summaries.findIndex(s => s.id === report.id);
    if (idx !== -1) {
      meta.summaries[idx] = this.summaryOf(report);
      await this.writeMeta(meta);
    }
    return true;
  }

  async clearReports(): Promise<void> {
    await this.ensureDirs();

    // Remove every file in reports directory; this avoids stale meta vs file mismatch.
    const entries = await fs.readdir(this.reportsDir);
    await Promise.all(entries.map((entry) => fs.unlink(path.join(this.reportsDir, entry)).catch(() => { /* ignore */ })));

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
        await fs.writeFile(
          path.join(this.reportsDir, `${report.id}.json`),
          JSON.stringify(report)
        );
      }
    }));

    return true;
  }
}
