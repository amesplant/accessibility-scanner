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

  async function renameReport(pageTitle: string): Promise<void> {
    if (!id) return;
    await apiFetch(`/api/reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageTitle }),
    });
    setReport(r => r ? { ...r, pageTitle: pageTitle.trim() || undefined } : r);
  }

  return { report, loading, error, renameReport };
}
