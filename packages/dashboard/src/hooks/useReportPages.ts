import { useEffect, useState } from 'react';
import { ScanReport } from '@accessibility-scanner/shared';
import { apiFetch, readApiError, toApiErrorMessage } from '@/lib/api';

type ReportPage = ScanReport['results'][number];

export function useReportPages(reportId: string | undefined, pageSize = 25) {
  const [pages, setPages] = useState<ReportPage[]>([]);
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
    apiFetch(`/api/reports/${reportId}/pages?offset=${offset}&limit=${pageSize}`)
      .then(async (res) => {
        if (!res.ok) throw await readApiError(res, 'Failed to fetch pages');
        return res.json();
      })
      .then(data => {
        setPages(data.items ?? []);
        setTotal(data.total ?? 0);
        setError(null);
      })
      .catch(err => setError(toApiErrorMessage(err, 'Failed to fetch pages')))
      .finally(() => setLoading(false));
  }, [reportId, pageSize, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return { pages, total, loading, error, page, setPage, pageSize, totalPages };
}
