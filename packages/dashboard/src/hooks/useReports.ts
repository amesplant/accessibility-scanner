import { useState, useEffect, useCallback } from 'react';
import { ScanReport } from '@accessibility-scanner/shared';
import { apiFetchJson, toApiErrorMessage } from '@/lib/api';

/** List payload from `/api/reports` — metadata + aggregate summary only (no per-page `results`). */
export type ReportListItem = Omit<ScanReport, 'results'>;

export function useReports() {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback((options?: { background?: boolean }) => {
    const blocking = !options?.background;
    if (blocking) setLoading(true);
    apiFetchJson<ReportListItem[]>('/api/reports')
      .then(data => {
        setReports(data);
        setError(null);
      })
      .catch(err => setError(toApiErrorMessage(err, 'Failed to fetch reports')))
      .finally(() => {
        if (blocking) setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  async function renameReport(id: string, pageTitle: string): Promise<void> {
    await apiFetchJson(`/api/reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageTitle }),
    });
    setReports(prev => prev.map(r => r.id === id ? { ...r, pageTitle: pageTitle.trim() || undefined } : r));
  }

  return { reports, loading, error, refresh: fetchReports, renameReport };
}
