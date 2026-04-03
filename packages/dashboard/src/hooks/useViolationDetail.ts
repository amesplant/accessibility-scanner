import { useEffect, useState } from 'react';
import { AxeViolation, ScanReport } from '@accessibility-scanner/shared';
import { apiFetch } from '@/lib/api';

type ViolationGroup =
  | {
      kind: 'automated';
      violation: AxeViolation;
      impact: AxeViolation['impact'];
      firstPageId: string;
      firstPageUrl: string;
      count: number;
      pageCount: number;
    }
  | {
      kind: 'manual';
      checkId: string;
      title: string;
      wcagCriterion?: string;
      level?: string;
      impact: 'critical' | 'serious' | 'moderate' | 'minor';
      firstPageId: string;
      firstPageUrl: string;
      count: number;
      pageCount: number;
    };

type ViolationPage = ScanReport['results'][number] & { pageId: string; url: string };

export function useViolationDetail(reportId: string | undefined, violationId: string | undefined, pageSize = 25) {
  const [group, setGroup] = useState<ViolationGroup | null>(null);
  const [pages, setPages] = useState<ViolationPage[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reportId || !violationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([
      apiFetch(`/api/reports/${reportId}/violations/${violationId}`),
      apiFetch(`/api/reports/${reportId}/violations/${violationId}/pages?offset=0&limit=${pageSize}`),
    ])
      .then(async ([groupRes, pagesRes]) => {
        if (!groupRes.ok || !pagesRes.ok) throw new Error('Failed to fetch violation details');
        const groupData = await groupRes.json();
        const pagesData = await pagesRes.json();
        setGroup(groupData);
        setPages(pagesData.items ?? []);
        setTotal(pagesData.total ?? 0);
        setOffset(pagesData.items?.length ?? 0);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to fetch violation details'))
      .finally(() => setLoading(false));
  }, [reportId, violationId, pageSize]);

  async function loadMore() {
    if (!reportId || !violationId || loadingMore || pages.length >= total) return;
    setLoadingMore(true);
    try {
      const res = await apiFetch(`/api/reports/${reportId}/violations/${violationId}/pages?offset=${offset}&limit=${pageSize}`);
      if (!res.ok) throw new Error('Failed to fetch violation pages');
      const data = await res.json();
      setPages(current => [...current, ...(data.items ?? [])]);
      setOffset(current => current + (data.items?.length ?? 0));
      setTotal(data.total ?? total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch violation pages');
    } finally {
      setLoadingMore(false);
    }
  }

  return { group, pages, total, loading, loadingMore, error, loadMore, hasMore: pages.length < total };
}