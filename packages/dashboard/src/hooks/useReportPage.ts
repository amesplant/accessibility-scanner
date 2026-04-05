import { useEffect, useState } from 'react';
import { ScanReport } from '@accessibility-scanner/shared';
import { apiFetch } from '@/lib/api';

type ReportPage = ScanReport['results'][number];

export function useReportPage(reportId: string | undefined, pageId: string | undefined) {
  const [page, setPage] = useState<ReportPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reportId || !pageId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    apiFetch(`/api/reports/${reportId}/pages/${pageId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch page');
        return res.json();
      })
      .then(setPage)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to fetch page'))
      .finally(() => setLoading(false));
  }, [reportId, pageId]);

  async function updateViolationOverride(
    _pageId: string,
    violationId: string,
    overrideStatus: 'pass' | 'na' | null,
    overrideNotes?: string,
  ) {
    if (!reportId || !pageId) return;
    const res = await apiFetch(`/api/reports/${reportId}/pages/${pageId}/violations/${violationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrideStatus, overrideNotes }),
    });
    if (!res.ok) return;
    const { violations } = await res.json();
    setPage(current => current ? { ...current, violations } : current);
  }

  async function updateViolationNode(
    _pageId: string,
    violationId: string,
    nodeIndex: number,
    data: { screenshotDataUrl?: string | null; overrideStatus?: 'pass' | 'fail' | null },
  ) {
    if (!reportId || !pageId) return;
    const res = await apiFetch(
      `/api/reports/${reportId}/pages/${pageId}/violations/${violationId}/nodes/${nodeIndex}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    );
    if (!res.ok) return;
    const { violations } = await res.json();
    setPage(current => current ? { ...current, violations } : current);
  }

  return { page, loading, error, updateViolationOverride, updateViolationNode };
}