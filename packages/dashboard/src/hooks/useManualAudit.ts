import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ManualAudit,
  ManualAuditStatus,
  ManualFailureInstance,
  DetectedCriteriaElements,
  createDefaultChecks,
  normalizeRemediationAssignees,
} from '@accessibility-scanner/shared';

function buildInitialAudit(serverAudit: ManualAudit | undefined): ManualAudit {
  if (serverAudit) {
    return {
      ...serverAudit,
      checks: serverAudit.checks.map((check) => ({
        ...check,
        assignedTo: check.assignedTo ? normalizeRemediationAssignees(check.assignedTo) : undefined,
      })),
    };
  }
  return {
    lastUpdated: new Date().toISOString(),
    checks: createDefaultChecks(),
  };
}

export function useManualAudit(
  reportId: string,
  pageId: string,
  initialAudit: ManualAudit | undefined,
  initialDetectedElements: DetectedCriteriaElements | undefined,
) {
  const [audit, setAudit] = useState<ManualAudit>(() => buildInitialAudit(initialAudit));
  const [detectedElements, setDetectedElements] = useState<DetectedCriteriaElements | undefined>(
    initialDetectedElements,
  );

  // Hydrate audit state once when server data arrives (initialAudit starts undefined while loading)
  const auditHydrated = useRef(false);
  useEffect(() => {
    if (!auditHydrated.current && initialAudit) {
      auditHydrated.current = true;
      setAudit(buildInitialAudit(initialAudit));
    }
  }, [initialAudit]);

  // Sync detectedElements whenever the page changes or data loads asynchronously
  useEffect(() => {
    setDetectedElements(initialDetectedElements);
  }, [initialDetectedElements]);

  const updateCheck = useCallback(
    async (checkId: string, status: ManualAuditStatus, notes?: string) => {
      // Optimistic update
      setAudit(prev => ({
        ...prev,
        lastUpdated: new Date().toISOString(),
        checks: prev.checks.map(c =>
          c.id === checkId
            ? { ...c, status, notes: notes !== undefined ? notes : c.notes, updatedAt: new Date().toISOString() }
            : c,
        ),
      }));

      try {
        await fetch(`/api/reports/${reportId}/pages/${pageId}/manual-audit/checks/${checkId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, notes }),
        });
      } catch (err) {
        console.error('Failed to update check:', err);
      }
    },
    [reportId, pageId],
  );

  const updateQuestionStatuses = useCallback(
    async (checkId: string, questionStatuses: ManualAuditStatus[]) => {
      setAudit(prev => ({
        ...prev,
        checks: prev.checks.map(c =>
          c.id === checkId ? { ...c, questionStatuses, updatedAt: new Date().toISOString() } : c,
        ),
      }));

      try {
        const check = audit.checks.find(c => c.id === checkId);
        if (!check) return;
        await fetch(`/api/reports/${reportId}/pages/${pageId}/manual-audit/checks/${checkId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: check.status, questionStatuses }),
        });
      } catch (err) {
        console.error('Failed to update question statuses:', err);
      }
    },
    [reportId, pageId, audit],
  );

  const updateNotes = useCallback(
    async (checkId: string, notes: string) => {
      setAudit(prev => ({
        ...prev,
        checks: prev.checks.map(c =>
          c.id === checkId ? { ...c, notes, updatedAt: new Date().toISOString() } : c,
        ),
      }));

      try {
        const check = audit.checks.find(c => c.id === checkId);
        if (!check) return;
        await fetch(`/api/reports/${reportId}/pages/${pageId}/manual-audit/checks/${checkId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: check.status, notes }),
        });
      } catch (err) {
        console.error('Failed to update notes:', err);
      }
    },
    [reportId, pageId, audit],
  );

  const addCustomCheck = useCallback(
    async (data: {
      title: string;
      description?: string;
      impact?: 'minor' | 'moderate' | 'serious' | 'critical';
      status: ManualAuditStatus;
      notes?: string;
      remediationRecommendation?: string;
      assignedTo?: Array<'content' | 'editor' | 'engineer'>;
    }) => {
      try {
        const res = await fetch(`/api/reports/${reportId}/pages/${pageId}/manual-audit/checks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        if (json.manualAudit) setAudit(json.manualAudit);
      } catch (err) {
        console.error('Failed to add custom check:', err);
      }
    },
    [reportId, pageId],
  );

  const deleteCustomCheck = useCallback(
    async (checkId: string) => {
      // Optimistic update
      setAudit(prev => ({
        ...prev,
        checks: prev.checks.filter(c => c.id !== checkId),
      }));

      try {
        await fetch(`/api/reports/${reportId}/pages/${pageId}/manual-audit/checks/${checkId}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.error('Failed to delete check:', err);
      }
    },
    [reportId, pageId],
  );

  const updateEvidence = useCallback(
    async (checkId: string, codeSnippet: string | undefined, screenshotDataUrl: string | undefined) => {
      setAudit(prev => ({
        ...prev,
        checks: prev.checks.map(c =>
          c.id === checkId
            ? { ...c, codeSnippet, screenshotDataUrl, updatedAt: new Date().toISOString() }
            : c,
        ),
      }));

      try {
        const check = audit.checks.find(c => c.id === checkId);
        if (!check) return;
        await fetch(`/api/reports/${reportId}/pages/${pageId}/manual-audit/checks/${checkId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: check.status, codeSnippet, screenshotDataUrl }),
        });
      } catch (err) {
        console.error('Failed to update evidence:', err);
      }
    },
    [reportId, pageId, audit],
  );

  const updateAuditorNotes = useCallback(
    async (notes: string) => {
      setAudit(prev => ({ ...prev, auditorNotes: notes }));

      try {
        await fetch(`/api/reports/${reportId}/pages/${pageId}/manual-audit`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auditorNotes: notes }),
        });
      } catch (err) {
        console.error('Failed to update auditor notes:', err);
      }
    },
    [reportId, pageId],
  );

  const addFailure = useCallback(
    async (checkId: string) => {
      try {
        const res = await fetch(
          `/api/reports/${reportId}/pages/${pageId}/manual-audit/checks/${checkId}/failures`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
        );
        const json = await res.json();
        if (json.manualAudit) setAudit(json.manualAudit);
      } catch (err) {
        console.error('Failed to add failure:', err);
      }
    },
    [reportId, pageId],
  );

  const updateFailure = useCallback(
    async (checkId: string, failureId: string, data: Partial<Pick<ManualFailureInstance, 'status' | 'scope' | 'notes' | 'codeSnippet' | 'screenshotDataUrl' | 'remediationRecommendation' | 'relatedCriteria' | 'relatedCriteriaNotes'>>) => {
      setAudit(prev => ({
        ...prev,
        checks: prev.checks.map(c => {
          if (c.id !== checkId) return c;
          const failures = (c.failures ?? []).map(f => f.id === failureId ? { ...f, ...data } : f);
          const derivedStatus = failures.length > 0
            ? failures.every(f => f.status === 'pass') ? 'pass' : 'fail'
            : c.status;
          return { ...c, failures, status: derivedStatus };
        }),
      }));
      try {
        await fetch(
          `/api/reports/${reportId}/pages/${pageId}/manual-audit/checks/${checkId}/failures/${failureId}`,
          { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
        );
      } catch (err) {
        console.error('Failed to update failure:', err);
      }
    },
    [reportId, pageId],
  );

  const deleteFailure = useCallback(
    async (checkId: string, failureId: string) => {
      setAudit(prev => ({
        ...prev,
        checks: prev.checks.map(c => {
          if (c.id !== checkId) return c;
          const failures = (c.failures ?? []).filter(f => f.id !== failureId);
          return { ...c, failures, status: failures.length === 0 ? 'not-tested' : c.status };
        }),
      }));
      try {
        await fetch(
          `/api/reports/${reportId}/pages/${pageId}/manual-audit/checks/${checkId}/failures/${failureId}`,
          { method: 'DELETE' },
        );
      } catch (err) {
        console.error('Failed to delete failure:', err);
      }
    },
    [reportId, pageId],
  );

  const addElementFailure = useCallback(
    async (
      criterionId: string,
      elementId: string,
      data?: Partial<Pick<ManualFailureInstance, 'notes' | 'codeSnippet' | 'screenshotDataUrl' | 'remediationRecommendation' | 'relatedCriteria' | 'relatedCriteriaNotes'>>,
    ) => {
      try {
        const res = await fetch(
          `/api/reports/${reportId}/pages/${pageId}/elements/${criterionId}/${elementId}/failures`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) },
        );
        const json = await res.json();
        if (json.detectedElements) setDetectedElements(json.detectedElements);
      } catch (err) {
        console.error('Failed to add element failure:', err);
      }
    },
    [reportId, pageId],
  );

  const updateElementFailure = useCallback(
    async (criterionId: string, elementId: string, failureId: string, data: Partial<Pick<ManualFailureInstance, 'status' | 'scope' | 'notes' | 'codeSnippet' | 'screenshotDataUrl' | 'remediationRecommendation' | 'relatedCriteria' | 'relatedCriteriaNotes'>>) => {
      setDetectedElements(prev => {
        if (!prev?.[criterionId]) return prev;
        return {
          ...prev,
          [criterionId]: prev[criterionId].map(el => {
            if (el.id !== elementId) return el;
            return { ...el, failures: (el.failures ?? []).map(f => f.id === failureId ? { ...f, ...data } : f) };
          }),
        };
      });
      try {
        await fetch(
          `/api/reports/${reportId}/pages/${pageId}/elements/${criterionId}/${elementId}/failures/${failureId}`,
          { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
        );
      } catch (err) {
        console.error('Failed to update element failure:', err);
      }
    },
    [reportId, pageId],
  );

  const deleteElementFailure = useCallback(
    async (criterionId: string, elementId: string, failureId: string) => {
      setDetectedElements(prev => {
        if (!prev?.[criterionId]) return prev;
        return {
          ...prev,
          [criterionId]: prev[criterionId].map(el =>
            el.id === elementId
              ? { ...el, failures: (el.failures ?? []).filter(f => f.id !== failureId) }
              : el,
          ),
        };
      });
      try {
        await fetch(
          `/api/reports/${reportId}/pages/${pageId}/elements/${criterionId}/${elementId}/failures/${failureId}`,
          { method: 'DELETE' },
        );
      } catch (err) {
        console.error('Failed to delete element failure:', err);
      }
    },
    [reportId, pageId],
  );

  const toggleComplete = useCallback(
    async (completed: boolean) => {
      setAudit(prev => ({
        ...prev,
        completed,
        completedAt: completed ? new Date().toISOString() : undefined,
        lastUpdated: new Date().toISOString(),
      }));

      try {
        await fetch(`/api/reports/${reportId}/pages/${pageId}/manual-audit/complete`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed }),
        });
      } catch (err) {
        console.error('Failed to toggle audit completion:', err);
      }
    },
    [reportId, pageId],
  );

  const updateDetectedElement = useCallback(
    async (
      criterionId: string,
      elementId: string,
      auditStatus: 'pass' | 'fail' | 'not-reviewed',
      auditComment?: string,
    ) => {
      // Optimistic update
      setDetectedElements(prev => {
        if (!prev?.[criterionId]) return prev;
        return {
          ...prev,
          [criterionId]: prev[criterionId].map(el =>
            el.id === elementId ? { ...el, auditStatus, auditComment } : el,
          ),
        };
      });

      try {
        await fetch(
          `/api/reports/${reportId}/pages/${pageId}/elements/${criterionId}/${elementId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auditStatus, auditComment }),
          },
        );
      } catch (err) {
        console.error('Failed to update element:', err);
      }
    },
    [reportId, pageId],
  );

  const generateElementScreenshot = useCallback(
    async (criterionId: string, elementId: string) => {
      try {
        const res = await fetch(
          `/api/reports/${reportId}/pages/${pageId}/elements/${criterionId}/${elementId}/screenshot`,
          { method: 'POST' },
        );
        const json = await res.json();
        if (json.element) {
          setDetectedElements(prev => {
            if (!prev?.[criterionId]) return prev;
            return {
              ...prev,
              [criterionId]: prev[criterionId].map(el => el.id === elementId ? { ...el, ...json.element } : el),
            };
          });
        }
      } catch (err) {
        console.error('Failed to generate element screenshot:', err);
      }
    },
    [reportId, pageId],
  );

  const detectFocusTriggers = useCallback(
    async (criterionId: string, onProgress?: (event: { type: 'status'; message: string } | { type: 'element'; element: any }) => void) => {
      const res = await fetch(
        `/api/reports/${reportId}/pages/${pageId}/elements/${criterionId}/detect`,
        { method: 'POST' },
      );

      // Non-streaming response (e.g. 2.4.3 returns JSON; errors return JSON regardless of criterion)
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('text/event-stream')) {
        const json = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (!res.ok) throw new Error((json.error as string) ?? 'Detection failed');
        if (json.detectedElements) setDetectedElements(json.detectedElements as DetectedCriteriaElements);
        return;
      }

      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'done' && event.detectedElements) {
              setDetectedElements(event.detectedElements);
            } else if (event.type === 'element' || event.type === 'status') {
              onProgress?.(event);
            } else if (event.type === 'error') {
              throw new Error((event.message as string) ?? 'Detection failed');
            }
          } catch (parseErr) {
            // Re-throw real errors; skip only malformed chunks
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }
    },
    [reportId, pageId],
  );

  const generateFocusOrderScreenshot = useCallback(
    async (elementId: string, colorScheme: 'light' | 'dark', viewportLabel: string) => {
      try {
        const res = await fetch(
          `/api/reports/${reportId}/pages/${pageId}/elements/2.4.3/${elementId}/focus-order-screenshot`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ colorScheme, viewport: viewportLabel }),
          },
        );
        const json = await res.json();
        if (json.element) {
          setDetectedElements(prev => {
            if (!prev?.['2.4.3']) return prev;
            return {
              ...prev,
              '2.4.3': prev['2.4.3'].map(el => el.id === elementId ? { ...el, ...json.element } : el),
            };
          });
        }
      } catch (err) {
        console.error('Failed to generate focus order screenshot:', err);
      }
    },
    [reportId, pageId],
  );

  return { audit, detectedElements, updateCheck, updateNotes, updateQuestionStatuses, updateEvidence, addCustomCheck, deleteCustomCheck, updateAuditorNotes, toggleComplete, addFailure, updateFailure, deleteFailure, updateDetectedElement, addElementFailure, updateElementFailure, deleteElementFailure, generateFocusOrderScreenshot, detectFocusTriggers, generateElementScreenshot };
}
