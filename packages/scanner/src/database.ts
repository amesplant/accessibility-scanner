import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ScanReport, Project } from '@accessibility-scanner/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_PATH = path.join(__dirname, '..', 'data', 'reports.json');

interface Schema {
  reports: ScanReport[];
  projects: Project[];
}

export class DatabaseService {
  private file: string;

  constructor(filePath?: string) {
    this.file = filePath || DEFAULT_DATA_PATH;
  }

  private async ensureFile(): Promise<void> {
    const dir = path.dirname(this.file);
    await fs.mkdir(dir, { recursive: true });

    try {
      await fs.access(this.file);
    } catch {
      await fs.writeFile(this.file, JSON.stringify({ reports: [], projects: [] }, null, 2));
    }
  }

  private async read(): Promise<Schema> {
    await this.ensureFile();
    const raw = await fs.readFile(this.file, 'utf-8');
    const data = JSON.parse(raw) as Partial<Schema>;
    // Migrate existing files that don't have a projects array
    return { reports: data.reports ?? [], projects: data.projects ?? [] };
  }

  private async write(data: Schema): Promise<void> {
    await fs.writeFile(this.file, JSON.stringify(data, null, 2));
  }

  // ── Reports ──────────────────────────────────────────────────────────────

  async saveReport(report: ScanReport): Promise<void> {
    const data = await this.read();
    data.reports.push(report);
    await this.write(data);
  }

  async getReports(): Promise<ScanReport[]> {
    const data = await this.read();
    return data.reports;
  }

  async getReport(id: string): Promise<ScanReport | undefined> {
    const data = await this.read();
    return data.reports.find((r) => r.id === id);
  }

  async deleteReport(id: string): Promise<boolean> {
    const data = await this.read();
    const before = data.reports.length;
    data.reports = data.reports.filter((r) => r.id !== id);
    if (data.reports.length === before) return false;
    await this.write(data);
    return true;
  }

  async updateReport(report: ScanReport): Promise<boolean> {
    const data = await this.read();
    const idx = data.reports.findIndex(r => r.id === report.id);
    if (idx === -1) return false;
    data.reports[idx] = report;
    await this.write(data);
    return true;
  }

  async clearReports(): Promise<void> {
    const data = await this.read();
    await this.write({ ...data, reports: [] });
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async saveProject(project: Project): Promise<void> {
    const data = await this.read();
    data.projects.push(project);
    await this.write(data);
  }

  async getProjects(): Promise<Project[]> {
    const data = await this.read();
    return data.projects;
  }

  async getProject(id: string): Promise<Project | undefined> {
    const data = await this.read();
    return data.projects.find(p => p.id === id);
  }

  async updateProject(project: Project): Promise<boolean> {
    const data = await this.read();
    const idx = data.projects.findIndex(p => p.id === project.id);
    if (idx === -1) return false;
    data.projects[idx] = project;
    await this.write(data);
    return true;
  }

  async deleteProject(id: string): Promise<boolean> {
    const data = await this.read();
    const before = data.projects.length;
    data.projects = data.projects.filter(p => p.id !== id);
    if (data.projects.length === before) return false;
    // Unassign all reports from this project
    data.reports = data.reports.map(r =>
      r.projectId === id ? { ...r, projectId: undefined } : r
    );
    await this.write(data);
    return true;
  }
}
