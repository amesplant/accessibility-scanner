import { useEffect, useState } from 'react';
import { ScanReport } from '@accessibility-scanner/shared';
import { apiFetch } from '@/lib/api';

type ReportPage = ScanReport['results'][number];

export function useReportPages(reportId: string | undefined, pageSize = 25) {
  const [pages, setPages] = useState<ReportPage[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reportId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    apiFetch(`/api/reports/${reportId}/pages?offset=0&limit=${pageSize}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch pages');
        return res.json();
      })
      .then(data => {
        setPages(data.items ?? []);
        setTotal(data.total ?? 0);
        setOffset(data.items?.length ?? 0);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to fetch pages'))
      .finally(() => setLoading(false));
  }, [reportId, pageSize]);

  async function loadMore() {
    if (!reportId || loadingMore || pages.length >= total) return;
    setLoadingMore(true);
    try {
      const res = await apiFetch(`/api/reports/${reportId}/pages?offset=${offset}&limit=${pageSize}`);
      if (!res.ok) throw new Error('Failed to fetch pages');
      const data = await res.json();
      setPages(current => [...current, ...(data.items ?? [])]);
      setOffset(current => current + (data.items?.length ?? 0));
      setTotal(data.total ?? total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch pages');
    } finally {
      setLoadingMore(false);
    }
  }

  return { pages, total, loading, loadingMore, error, loadMore, hasMore: pages.length < total };
}