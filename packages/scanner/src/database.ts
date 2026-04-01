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

/** PostgREST: pull list fields only; avoids downloading every page’s `results` blob. */
const REPORT_SUMMARY_SELECT = `
  id,
  project_id,
  sitemap:report_data->sitemap,
  pageTitle:report_data->pageTitle,
  startTime:report_data->startTime,
  endTime:report_data->endTime,
  auditType:report_data->auditType,
  wcagLevel:report_data->wcagLevel,
  includeBestPractices:report_data->includeBestPractices,
  jsonProjectId:report_data->projectId,
  summary:report_data->summary
`.replace(/\s+/g, ' ').trim();

const EMPTY_AGG_SUMMARY: ScanReport['summary'] = {
  totalPages: 0,
  totalViolations: 0,
  violationsByImpact: {},
  violationsByType: {},
  violationsByLevel: {},
};

export class DatabaseService {
  private dataDir: string;
  private reportsDir: string;
  private metaFile: string;
  /** Path to the legacy monolithic file, used only for one-time migration */
  private legacyFile: string;
  private supabase: SupabaseClient | null = null;
  private supabaseUrl: string | null = null;
  private supabaseKey: string | null = null;
  /** Publishable key + user access token per request (RLS auth.uid()). Requires service role only to mint sessions in auth/callback. */
  private useUserJwt = false;
  private useSupabase = false;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.reportsDir = path.join(this.dataDir, 'reports');
    this.metaFile = path.join(this.dataDir, 'meta.json');
    this.legacyFile = path.join(this.dataDir, 'reports.json');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY;

    this.supabaseUrl = supabaseUrl ?? null;
    this.supabaseKey = supabaseKey ?? null;
    this.useUserJwt = !!(supabaseUrl && supabaseKey && supabaseSecretKey);
    this.useSupabase = !!(supabaseUrl && supabaseKey);

    if (supabaseUrl && supabaseKey) {
      if (this.useUserJwt) {
        console.log('[db] Using Supabase persistence with RLS (session JWT per request)');
      } else {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        console.log('[db] Using Supabase persistence (shared key; API role may bypass RLS)');
      }
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

  private parseSlimSummaryRows(rows: Record<string, unknown>[]): ReportSummary[] {
    return rows.map(row => {
      const mergedSummary = {
        ...EMPTY_AGG_SUMMARY,
        ...(typeof row.summary === 'object' && row.summary !== null
          ? (row.summary as Record<string, unknown>)
          : {}),
      } as ScanReport['summary'];
      const projectId =
        (row.project_id as string | null | undefined) ??
        (row.jsonProjectId as string | null | undefined) ??
        undefined;
      return {
        id: row.id as string,
        sitemap: (row.sitemap as string) ?? '',
        pageTitle: (row.pageTitle as string | undefined) || undefined,
        startTime: row.startTime as ScanReport['startTime'],
        endTime: row.endTime as ScanReport['endTime'],
        auditType: row.auditType as ScanReport['auditType'] | undefined,
        wcagLevel: row.wcagLevel as ScanReport['wcagLevel'] | undefined,
        includeBestPractices: row.includeBestPractices as boolean | undefined,
        projectId: projectId || undefined,
        summary: mergedSummary,
      };
    });
  }

  private localFallbackOk(accessToken?: string): boolean {
    return this.useSupabase && this.useUserJwt && !accessToken;
  }

  private async supabaseFallback<T>(
    accessToken: string | undefined,
    operation: (supabase: SupabaseClient) => Promise<T>,
    fallback: () => Promise<T>
  ): Promise<T> {
    if (!this.useSupabase) {
      return fallback();
    }

    if (this.useUserJwt && !accessToken) {
      return fallback();
    }

    try {
      const client = this.getClientForDb(this.useUserJwt ? accessToken : undefined);
      return await operation(client);
    } catch (err) {
      if (this.useUserJwt) {
        console.error('[db] Supabase RLS operation failed:', err);
        throw err;
      }
      console.error('[db] Supabase operation failed; falling back to local JSON:', err);
      this.useSupabase = false;
      this.supabase = null;
      return fallback();
    }
  }

  private getClientForDb(accessToken?: string): SupabaseClient {
    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('Supabase is not configured');
    }
    if (this.useUserJwt) {
      if (!accessToken) {
        throw new Error('Session JWT is required for Supabase RLS');
      }
      return createClient(this.supabaseUrl, this.supabaseKey, {
        accessToken: async () => accessToken,
      });
    }
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }
    return this.supabase;
  }

  // ── Reports ──────────────────────────────────────────────────────────────

  async saveReport(report: ScanReport, userId?: string, accessToken?: string): Promise<void> {
    const localSave = async () => {
      await fs.writeFile(
        path.join(this.reportsDir, `${report.id}.json`),
        JSON.stringify(report)
      );
      const meta = await this.readMeta();
      meta.summaries.push(this.summaryOf(report));
      await this.writeMeta(meta);
    };

    if (!this.useSupabase || this.localFallbackOk(accessToken)) {
      return localSave();
    }

    this.requireUser(userId);

    return this.supabaseFallback(
      accessToken,
      async supabase => {
        const { error } = await supabase
          .from('reports')
          .upsert({
            id: report.id,
            user_id: userId,
            project_id: report.projectId ?? null,
            report_data: report,
          }, { onConflict: 'id' });

        if (error) throw error;
      },
      localSave
    );
  }

  /** Returns lightweight summaries (no results array) — use for list views. */
  async getReportSummaries(userId?: string, accessToken?: string): Promise<ReportSummary[]> {
    const localRead = async () => {
      const meta = await this.readMeta();
      return meta.summaries;
    };

    if (!this.useSupabase || this.localFallbackOk(accessToken)) {
      return localRead();
    }

    this.requireUser(userId);

    return this.supabaseFallback(
      accessToken,
      async supabase => {
        const { data, error } = await supabase
          .from('reports')
          .select(REPORT_SUMMARY_SELECT)
          .eq('user_id', userId);

        if (error) throw error;
        return this.parseSlimSummaryRows((data ?? []) as unknown as Record<string, unknown>[]);
      },
      localRead
    );
  }

  /** Assignments only — small payload for project list report counts. */
  async getReportProjectCounts(userId?: string, accessToken?: string): Promise<Record<string, number>> {
    const localRead = async () => {
      const meta = await this.readMeta();
      const acc: Record<string, number> = {};
      for (const s of meta.summaries) {
        if (s.projectId) acc[s.projectId] = (acc[s.projectId] ?? 0) + 1;
      }
      return acc;
    };

    if (!this.useSupabase || this.localFallbackOk(accessToken)) {
      return localRead();
    }

    this.requireUser(userId);

    return this.supabaseFallback(
      accessToken,
      async supabase => {
        const { data, error } = await supabase
          .from('reports')
          .select('project_id')
          .eq('user_id', userId)
          .not('project_id', 'is', null);

        if (error) throw error;
        const acc: Record<string, number> = {};
        for (const row of data ?? []) {
          const pid = (row as { project_id?: string }).project_id;
          if (pid) acc[pid] = (acc[pid] ?? 0) + 1;
        }
        return acc;
      },
      localRead
    );
  }

  async getReportSummariesForProject(
    projectId: string,
    userId?: string,
    accessToken?: string,
  ): Promise<ReportSummary[]> {
    const localRead = async () => {
      const meta = await this.readMeta();
      return meta.summaries.filter(s => s.projectId === projectId);
    };

    if (!this.useSupabase || this.localFallbackOk(accessToken)) {
      return localRead();
    }

    this.requireUser(userId);

    return this.supabaseFallback(
      accessToken,
      async supabase => {
        const { data, error } = await supabase
          .from('reports')
          .select(REPORT_SUMMARY_SELECT)
          .eq('user_id', userId)
          .eq('project_id', projectId);

        if (error) throw error;
        return this.parseSlimSummaryRows((data ?? []) as unknown as Record<string, unknown>[]);
      },
      localRead
    );
  }

  async getReport(id: string, userId?: string, accessToken?: string): Promise<ScanReport | undefined> {
    const localGet = async () => {
      try {
        const raw = await fs.readFile(path.join(this.reportsDir, `${id}.json`), 'utf-8');
        return JSON.parse(raw) as ScanReport;
      } catch {
        return undefined;
      }
    };

    if (!this.useSupabase || this.localFallbackOk(accessToken)) {
      return localGet();
    }

    this.requireUser(userId);

    return this.supabaseFallback(
      accessToken,
      async supabase => {
        const { data, error } = await supabase
          .from('reports')
          .select('report_data')
          .eq('id', id)
          .eq('user_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data?.report_data as ScanReport | undefined;
      },
      localGet
    );
  }

  async deleteReport(id: string, userId?: string, accessToken?: string): Promise<boolean> {
    if (this.useSupabase && !this.localFallbackOk(accessToken)) {
      this.requireUser(userId);
      const client = this.getClientForDb(this.useUserJwt ? accessToken : undefined);

      const { data, error } = await client
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

  async updateReport(report: ScanReport, userId?: string, accessToken?: string): Promise<boolean> {
    if (this.useSupabase && !this.localFallbackOk(accessToken)) {
      this.requireUser(userId);
      const client = this.getClientForDb(this.useUserJwt ? accessToken : undefined);

      const { data, error } = await client
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

  async clearReports(userId?: string, accessToken?: string): Promise<void> {
    if (this.useSupabase && !this.localFallbackOk(accessToken)) {
      this.requireUser(userId);
      const client = this.getClientForDb(this.useUserJwt ? accessToken : undefined);
      await client.from('reports').delete().eq('user_id', userId);
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

  async saveProject(project: Project, userId?: string, accessToken?: string): Promise<void> {
    if (this.useSupabase && !this.localFallbackOk(accessToken)) {
      this.requireUser(userId);
      const client = this.getClientForDb(this.useUserJwt ? accessToken : undefined);

      const { error } = await client
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

  async getProjects(userId?: string, accessToken?: string): Promise<Project[]> {
    if (this.useSupabase && !this.localFallbackOk(accessToken)) {
      this.requireUser(userId);
      const client = this.getClientForDb(this.useUserJwt ? accessToken : undefined);

      const { data, error } = await client.from('projects').select('*').eq('user_id', userId);

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

  async getProject(projectId: string, userId?: string, accessToken?: string): Promise<Project | undefined> {
    if (this.useSupabase && !this.localFallbackOk(accessToken)) {
      this.requireUser(userId);
      const client = this.getClientForDb(this.useUserJwt ? accessToken : undefined);

      const { data, error } = await client
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

  async updateProject(project: Project, userId?: string, accessToken?: string): Promise<boolean> {
    if (this.useSupabase && !this.localFallbackOk(accessToken)) {
      this.requireUser(userId);
      const client = this.getClientForDb(this.useUserJwt ? accessToken : undefined);

      const { data, error } = await client
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

  async deleteProject(projectId: string, userId?: string, accessToken?: string): Promise<boolean> {
    if (this.useSupabase && !this.localFallbackOk(accessToken)) {
      this.requireUser(userId);
      const client = this.getClientForDb(this.useUserJwt ? accessToken : undefined);

      await client
        .from('reports')
        .update({ project_id: null })
        .eq('project_id', projectId)
        .eq('user_id', userId);

      const { data, error } = await client
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
