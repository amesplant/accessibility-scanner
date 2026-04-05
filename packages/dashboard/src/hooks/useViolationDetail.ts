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
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [reportId, violationId]);

  useEffect(() => {
    if (!reportId || !violationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    apiFetch(`/api/reports/${reportId}/violations/${violationId}`)
      .then(async groupRes => {
        if (!groupRes.ok) throw new Error('Failed to fetch violation details');
        const groupData = await groupRes.json();
        setGroup(groupData);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to fetch violation details'));
  }, [reportId, violationId]);

  useEffect(() => {
    if (!reportId || !violationId) {
      return;
    }

    setLoading(true);
    const offset = (page - 1) * pageSize;
    apiFetch(`/api/reports/${reportId}/violations/${violationId}/pages?offset=${offset}&limit=${pageSize}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch violation pages');
        return res.json();
      })
      .then(data => {
        setPages(data.items ?? []);
        setTotal(data.total ?? 0);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to fetch violation pages'))
      .finally(() => setLoading(false));
  }, [reportId, violationId, pageSize, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return { group, pages, total, loading, error, page, setPage, pageSize, totalPages };
}