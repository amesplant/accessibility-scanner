import { useState, useEffect, useCallback } from 'react';
import { ScanReport } from '@accessibility-scanner/shared';
import { apiFetchJson } from '@/lib/api';

export function useReports() {
  const [reports, setReports] = useState<ScanReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(() => {
    setLoading(true);
    apiFetchJson<ScanReport[]>('/api/reports')
      .then(setReports)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  return { reports, loading, error, refresh: fetchReports };
}
