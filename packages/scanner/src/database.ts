import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
  private supabase: SupabaseClient | null = null;
  private useSupabase = false;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.reportsDir = path.join(this.dataDir, 'reports');
    this.metaFile = path.join(this.dataDir, 'meta.json');
    this.legacyFile = path.join(this.dataDir, 'reports.json');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.useSupabase = true;
      console.log('[db] Using Supabase persistence');
    }
  }

  private requireUser(userId?: string) {
    if (this.useSupabase && !userId) {
      throw new Error('userId is required when using Supabase persistence');
    }
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
    if (this.useSupabase) {
      // No local filesystem migration needed in Supabase mode.
      return;
    }

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

      // Write individual report files
      await Promise.all(reports.map(r =>
        fs.writeFile(path.join(this.reportsDir, `${r.id}.json`), JSON.stringify(r))
      ));

      // Write meta with summaries (strip results from each report)
      const summaries: ReportSummary[] = reports.map(({ results: _r, ...s }) => s);
      await this.writeMeta({ projects, summaries });

      // Rename legacy file so we don't re-migrate on next start
      await fs.rename(this.legacyFile, `${this.legacyFile}.bak`);
      console.log(`[db] Migration complete. ${reports.length} reports migrated.`);
    } else {
      // Fresh install — just write an empty meta.json
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
    await fs.writeFile(this.metaFile, JSON.stringify(meta));
  }

  private summaryOf(report: ScanReport): ReportSummary {
    const { results: _r, ...summary } = report;
    return summary;
  }

  private async supabaseFallback<T>(
    operation: (supabase: SupabaseClient) => Promise<T>,
    fallback: () => Promise<T>
  ): Promise<T> {
    if (!this.useSupabase || !this.supabase) {
      return fallback();
    }

    try {
      return await operation(this.supabase);
    } catch (err) {
      console.error('[db] Supabase operation failed; falling back to local JSON:', err);
      this.useSupabase = false;
      return fallback();
    }
  }

  // ── Reports ──────────────────────────────────────────────────────────────

  async saveReport(report: ScanReport, userId?: string): Promise<void> {
    const localSave = async () => {
      await fs.writeFile(
        path.join(this.reportsDir, `${report.id}.json`),
        JSON.stringify(report)
      );
      const meta = await this.readMeta();
      meta.summaries.push(this.summaryOf(report));
      await this.writeMeta(meta);
    };

    if (!this.useSupabase || !this.supabase) {
      return localSave();
    }

    this.requireUser(userId);

    return this.supabaseFallback(async supabase => {
      const { error } = await supabase
        .from('reports')
        .upsert({
          id: report.id,
          user_id: userId,
          project_id: report.projectId ?? null,
          report_data: report,
        }, { onConflict: 'id' });

      if (error) throw error;
    }, localSave);
  }

  /** Returns lightweight summaries (no results array) — use for list views. */
  async getReportSummaries(userId?: string): Promise<ReportSummary[]> {
    const localRead = async () => {
      const meta = await this.readMeta();
      return meta.summaries;
    };

    if (!this.useSupabase || !this.supabase) {
      return localRead();
    }

    this.requireUser(userId);

    return this.supabaseFallback(async supabase => {
      const { data, error } = await supabase
        .from('reports')
        .select('report_data')
        .eq('user_id', userId);

      if (error) throw error;
      return (data ?? []).map((row: any) => this.summaryOf(row.report_data as ScanReport));
    }, localRead);
  }

  async getReport(id: string, userId?: string): Promise<ScanReport | undefined> {
    const localGet = async () => {
      try {
        const raw = await fs.readFile(path.join(this.reportsDir, `${id}.json`), 'utf-8');
        return JSON.parse(raw) as ScanReport;
      } catch {
        return undefined;
      }
    };

    if (!this.useSupabase || !this.supabase) {
      return localGet();
    }

    this.requireUser(userId);

    return this.supabaseFallback(async supabase => {
      const { data, error } = await supabase
        .from('reports')
        .select('report_data')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data?.report_data as ScanReport | undefined;
    }, localGet);
  }

  async deleteReport(id: string, userId?: string): Promise<boolean> {
    if (this.useSupabase) {
      this.requireUser(userId);
      if (!this.supabase) return false;

      const { data, error } = await this.supabase
        .from('reports')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
        .select();

      if (error) throw error;
      return (data ?? []).length > 0;
    }

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

  async updateReport(report: ScanReport, userId?: string): Promise<boolean> {
    if (this.useSupabase) {
      this.requireUser(userId);
      if (!this.supabase) return false;

      const { data, error } = await this.supabase
        .from('reports')
        .update({ report_data: report, project_id: report.projectId ?? null })
        .eq('id', report.id)
        .eq('user_id', userId)
        .select();

      if (error) throw error;
      return (data ?? []).length > 0;
    }

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

  async clearReports(userId?: string): Promise<void> {
    if (this.useSupabase) {
      this.requireUser(userId);
      if (!this.supabase) return;
      await this.supabase
        .from('reports')
        .delete()
        .eq('user_id', userId);
      return;
    }

    const meta = await this.readMeta();
    await Promise.all(
      meta.summaries.map(s =>
        fs.unlink(path.join(this.reportsDir, `${s.id}.json`)).catch(() => { /* ignore */ })
      )
    );
    await this.writeMeta({ ...meta, summaries: [] });
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async saveProject(project: Project, userId?: string): Promise<void> {
    if (this.useSupabase) {
      this.requireUser(userId);
      if (!this.supabase) return;

      const { error } = await this.supabase
        .from('projects')
        .upsert({
          id: project.id,
          user_id: userId,
          name: project.name,
          description: project.description ?? null,
          created_at: project.createdAt,
        }, { onConflict: 'id' });

      if (error) throw error;
      return;
    }

    const meta = await this.readMeta();
    meta.projects.push(project);
    await this.writeMeta(meta);
  }

  async getProjects(userId?: string): Promise<Project[]> {
    if (this.useSupabase) {
      this.requireUser(userId);
      if (!this.supabase) return [];

      const { data, error } = await this.supabase
        .from('projects')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      return (data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? undefined,
        createdAt: p.created_at,
      }));
    }

    const meta = await this.readMeta();
    return meta.projects;
  }

  async getProject(projectId: string, userId?: string): Promise<Project | undefined> {
    if (this.useSupabase) {
      this.requireUser(userId);
      if (!this.supabase) return undefined;

      const { data, error } = await this.supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return undefined;

      return {
        id: data.id,
        name: data.name,
        description: data.description ?? undefined,
        createdAt: data.created_at,
      };
    }

    const meta = await this.readMeta();
    return meta.projects.find(p => p.id === projectId);
  }

  async updateProject(project: Project, userId?: string): Promise<boolean> {
    if (this.useSupabase) {
      this.requireUser(userId);
      if (!this.supabase) return false;

      const { data, error } = await this.supabase
        .from('projects')
        .update({
          name: project.name,
          description: project.description ?? null,
        })
        .eq('id', project.id)
        .eq('user_id', userId)
        .select();

      if (error) throw error;
      return (data ?? []).length > 0;
    }

    const meta = await this.readMeta();
    const idx = meta.projects.findIndex(p => p.id === project.id);
    if (idx === -1) return false;
    meta.projects[idx] = project;
    await this.writeMeta(meta);
    return true;
  }

  async deleteProject(projectId: string, userId?: string): Promise<boolean> {
    if (this.useSupabase) {
      this.requireUser(userId);
      if (!this.supabase) return false;

      await this.supabase
        .from('reports')
        .update({ project_id: null })
        .eq('project_id', projectId)
        .eq('user_id', userId);

      const { data, error } = await this.supabase
        .from('projects')
        .delete()
        .eq('id', projectId)
        .eq('user_id', userId)
        .select();

      if (error) throw error;
      return (data ?? []).length > 0;
    }

    const meta = await this.readMeta();
    const before = meta.projects.length;
    meta.projects = meta.projects.filter(p => p.id !== projectId);
    if (meta.projects.length === before) return false;

    // Unassign all reports belonging to this project
    const affected = meta.summaries.filter(s => s.projectId === projectId);
    meta.summaries = meta.summaries.map(s =>
      s.projectId === projectId ? { ...s, projectId: undefined } : s
    );
    await this.writeMeta(meta);

    // Also update the individual report files
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
