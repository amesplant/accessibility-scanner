import { useState } from 'react';

export const EXPORT_FORMAT_LABELS: Record<'csv' | 'excel' | 'jira', string> = {
  excel: 'Teamwork (.xlsx)',
  csv: 'CSV (.csv)',
  jira: 'Jira (.csv)',
};

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function useExport(reportId: string) {
  const [format, setFormat] = useState<'csv' | 'excel' | 'jira'>('excel');
  const [tasklistName, setTasklistName] = useState('Accessibility Audit');
  const [isExporting, setIsExporting] = useState(false);

  async function doExport(selectedLevels?: string[], fileName?: string) {
    if (!reportId) return;
    setIsExporting(true);
    const name = fileName?.trim() || `accessibility-issues-${reportId}`;
    const levels = selectedLevels && selectedLevels.length > 0 ? selectedLevels : undefined;
    try {
      if (format === 'jira') {
        const res = await fetch(`/api/reports/${reportId}/export/jira`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedLevels: levels }),
        });
        triggerDownload(new Blob([await res.text()], { type: 'text/csv' }), `${name}-jira.csv`);
      } else if (format === 'csv') {
        const res = await fetch(`/api/reports/${reportId}/export/csv`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tasklistName: tasklistName.trim() || undefined, selectedLevels: levels }),
        });
        triggerDownload(new Blob([await res.text()], { type: 'text/csv' }), `${name}.csv`);
      } else {
        const res = await fetch(`/api/reports/${reportId}/export/excel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tasklistName: tasklistName.trim() || undefined, selectedLevels: levels }),
        });
        triggerDownload(
          new Blob([await res.arrayBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
          `${name}.xlsx`,
        );
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }

  return { format, setFormat, tasklistName, setTasklistName, isExporting, doExport };
}
