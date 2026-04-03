import { useEffect, useState } from 'react';
import { AxeViolation } from '@accessibility-scanner/shared';
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

export function useViolationGroups(reportId: string | undefined, pageSize = 25) {
  const [items, setItems] = useState<ViolationGroup[]>([]);
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
    apiFetch(`/api/reports/${reportId}/violations?offset=0&limit=${pageSize}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch violations');
        return res.json();
      })
      .then(data => {
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setOffset(data.items?.length ?? 0);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to fetch violations'))
      .finally(() => setLoading(false));
  }, [reportId, pageSize]);

  async function loadMore() {
    if (!reportId || loadingMore || items.length >= total) return;
    setLoadingMore(true);
    try {
      const res = await apiFetch(`/api/reports/${reportId}/violations?offset=${offset}&limit=${pageSize}`);
      if (!res.ok) throw new Error('Failed to fetch violations');
      const data = await res.json();
      setItems(current => [...current, ...(data.items ?? [])]);
      setOffset(current => current + (data.items?.length ?? 0));
      setTotal(data.total ?? total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch violations');
    } finally {
      setLoadingMore(false);
    }
  }

  return { items, total, loading, loadingMore, error, loadMore, hasMore: items.length < total };
}