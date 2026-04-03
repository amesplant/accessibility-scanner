import { useState, useEffect } from 'react';
import { ScanReport } from '@accessibility-scanner/shared';
import { apiFetch } from '@/lib/api';

export type ReportSummary = Omit<ScanReport, 'results'> & {
  summary: ScanReport['summary'] & {
    manualFailCount?: number;
    auditedPages?: number;
  };
};

export function useReport(id: string | undefined) {
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    apiFetch(`/api/reports/${id}/summary`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch report');
        return res.json();
      })
      .then(setReport)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  return { report, loading, error };
}
