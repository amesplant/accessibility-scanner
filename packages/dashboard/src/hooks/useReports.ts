import { useState, useEffect, useCallback } from 'react';
import { ScanReport } from '@accessibility-scanner/shared';
import { apiFetchJson } from '@/lib/api';

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
      .catch(err => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => {
        if (blocking) setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  return { reports, loading, error, refresh: fetchReports };
}
