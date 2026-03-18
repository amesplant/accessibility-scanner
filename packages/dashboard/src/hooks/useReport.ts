import { useState, useEffect } from 'react';
import { ScanReport } from '@accessibility-scanner/shared';

export function useReport(id: string | undefined) {
  const [report, setReport] = useState<ScanReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    fetch(`/api/reports/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch report');
        return res.json();
      })
      .then(setReport)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  function applyViolationUpdate(pageId: string, violations: ScanReport['results'][0]['violations']) {
    setReport(r =>
      r ? { ...r, results: r.results.map(result => result.id === pageId ? { ...result, violations } : result) } : r,
    );
  }

  async function updateViolationOverride(
    pageId: string,
    violationId: string,
    overrideStatus: 'pass' | 'na' | null,
    overrideNotes?: string,
  ) {
    if (!id) return;
    const res = await fetch(`/api/reports/${id}/pages/${pageId}/violations/${violationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrideStatus, overrideNotes }),
    });
    if (!res.ok) return;
    const { violations } = await res.json();
    applyViolationUpdate(pageId, violations);
  }

  async function updateViolationNode(
    pageId: string,
    violationId: string,
    nodeIndex: number,
    data: { screenshotDataUrl?: string | null; overrideStatus?: 'pass' | 'fail' | null },
  ) {
    if (!id) return;
    const res = await fetch(
      `/api/reports/${id}/pages/${pageId}/violations/${violationId}/nodes/${nodeIndex}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    );
    if (!res.ok) return;
    const { violations } = await res.json();
    applyViolationUpdate(pageId, violations);
  }

  return { report, loading, error, updateViolationOverride, updateViolationNode };
}
