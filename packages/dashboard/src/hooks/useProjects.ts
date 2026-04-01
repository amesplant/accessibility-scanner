import { useCallback, useEffect, useState } from 'react';
import { Project } from '@accessibility-scanner/shared';
import { apiFetch } from '@/lib/api';

export interface ProjectWithCount extends Project {
  reportCount: number;
}

export function useProjects() {
  const [projects, setProjects] = useState<ProjectWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
    await refresh({ background: true });
  }

  async function updateProject(id: string, name: string, description?: string): Promise<void> {
    await apiFetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    await refresh({ background: true });
  }

  return { projects, loading, error, refresh, createProject, deleteProject, updateProject };
}
