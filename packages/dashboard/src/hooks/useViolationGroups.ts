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
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [reportId]);

  useEffect(() => {
    if (!reportId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const offset = (page - 1) * pageSize;
    apiFetch(`/api/reports/${reportId}/violations?offset=${offset}&limit=${pageSize}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch violations');
        return res.json();
      })
      .then(data => {
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to fetch violations'))
      .finally(() => setLoading(false));
  }, [reportId, pageSize, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return { items, total, loading, error, page, setPage, pageSize, totalPages };
}
