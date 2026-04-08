import { useCallback, useEffect, useState } from 'react';
import { Project } from '@accessibility-scanner/shared';
import { apiFetch, readApiError, toApiErrorMessage } from '@/lib/api';

export interface ProjectWithCount extends Project {
  reportCount: number;
}

export function useProjects() {
  const [projects, setProjects] = useState<ProjectWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const refresh = useCallback(async (options?: { background?: boolean }) => {
    const blocking = !options?.background;
    if (blocking) setLoading(true);
    try {
      const res = await apiFetch('/api/projects');
      if (!res.ok) throw new Error('Failed to fetch projects');
      setProjects(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (blocking) setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!statusMessage) return;
    const timeoutId = window.setTimeout(() => setStatusMessage(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [statusMessage]);

  const activeProjects = projects.filter((project) => !project.archived);
  const archivedProjects = projects.filter((project) => project.archived);

  async function runProjectMutation(
    input: RequestInfo,
    init: RequestInit,
    fallback: string,
    successMessage?: string,
  ): Promise<void> {
    try {
      const res = await apiFetch(input, init);
      if (!res.ok) {
        throw await readApiError(res, fallback);
      }
      setError(null);
      if (successMessage) setStatusMessage(successMessage);
      await refresh({ background: true });
    } catch (err) {
      const message = toApiErrorMessage(err, fallback);
      setError(message);
      throw new Error(message);
    }
  }

  async function createProject(name: string, description?: string): Promise<Project> {
    const res = await apiFetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to create project');
    }
    const project = await res.json();
    await refresh({ background: true });
    return project;
  }

  async function deleteProject(id: string): Promise<void> {
    await runProjectMutation(`/api/projects/${id}`, { method: 'DELETE' }, 'Failed to delete project');
  }

  async function updateProject(id: string, name: string, description?: string): Promise<void> {
    await runProjectMutation(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    }, 'Failed to update project');
  }

  async function archiveProject(id: string): Promise<void> {
    const projectName = projects.find((project) => project.id === id)?.name ?? 'Project';
    await runProjectMutation(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    }, 'Failed to archive project', `${projectName} archived. Moved to Archived Projects.`);
  }

  async function restoreProject(id: string): Promise<void> {
    const projectName = projects.find((project) => project.id === id)?.name ?? 'Project';
    await runProjectMutation(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    }, 'Failed to restore project', `${projectName} restored. Returned to Active Projects.`);
  }

  return {
    projects,
    activeProjects,
    archivedProjects,
    loading,
    error,
    statusMessage,
    refresh,
    createProject,
    deleteProject,
    updateProject,
    archiveProject,
    restoreProject,
    clearStatusMessage: () => setStatusMessage(null),
  };
}
