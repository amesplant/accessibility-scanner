import { useEffect, useState } from 'react';
import { ManualFailureInstance, ScanReport } from '@accessibility-scanner/shared';
import { apiFetch, readApiError, toApiErrorMessage } from '@/lib/api';

type ReportPage = ScanReport['results'][number];

export function useReportPage(reportId: string | undefined, pageId: string | undefined) {
  const [page, setPage] = useState<ReportPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);

  useEffect(() => {
    if (!reportId || !pageId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    apiFetch(`/api/reports/${reportId}/pages/${pageId}`)
      .then(async res => {
        if (!res.ok) throw await readApiError(res, 'Failed to fetch page');
        return res.json();
      })
      .then(setPage)
      .catch(err => setError(toApiErrorMessage(err, 'Failed to fetch page')))
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

  async function rescanPage() {
    if (!reportId || !pageId) return null;
    setRescanning(true);
    setError(null);

    try {
      const res = await apiFetch(`/api/reports/${reportId}/pages/${pageId}/rescan`, {
        method: 'POST',
      });
      if (!res.ok) throw await readApiError(res, 'Failed to rescan page');
      const { page: rescannedPage } = await res.json();
      setPage(rescannedPage);
      return rescannedPage as ReportPage;
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to rescan page'));
      return null;
    } finally {
      setRescanning(false);
    }
  }

  async function promoteRuleToViolation(
    source: 'pass' | 'incomplete',
    ruleId: string,
    options?: {
      impact?: 'minor' | 'moderate' | 'serious' | 'critical';
      customNode?: {
        html?: string;
        target?: string[];
        failureSummary?: string;
        status?: ManualFailureInstance['status'];
        scope?: ManualFailureInstance['scope'];
        impact?: ManualFailureInstance['impact'];
        title?: string;
        notes?: string;
        codeSnippet?: string;
        screenshotDataUrl?: string;
        remediationRecommendation?: string;
        assignedTo?: ManualFailureInstance['assignedTo'];
        relatedCriteria?: string[];
        relatedCriteriaNotes?: Record<string, string>;
      };
    },
  ) {
    if (!reportId || !pageId) return null;

    try {
      const res = await apiFetch(`/api/reports/${reportId}/pages/${pageId}/rules/${ruleId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, ...options }),
      });
      if (!res.ok) throw await readApiError(res, 'Failed to promote rule');
      const { page: nextPage } = await res.json();
      setPage(nextPage);
      setError(null);
      return nextPage as ReportPage;
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to promote rule'));
      return null;
    }
  }

  return { page, loading, error, rescanning, updateViolationOverride, updateViolationNode, rescanPage, promoteRuleToViolation };
}