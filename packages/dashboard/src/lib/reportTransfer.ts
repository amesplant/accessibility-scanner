import { apiFetch, apiFetchJson } from '@/lib/api';

export interface ImportReportsResult {
  importedCount: number;
  skippedCount: number;
  importedIds: string[];
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const encodedMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) return decodeURIComponent(encodedMatch[1]);

  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? null;
}

export async function downloadReportJson(reportId: string, fallbackName = 'accessibility-report.json') {
  const res = await apiFetch(`/api/reports/${reportId}/export/json`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to export report JSON');
  }

  const filename = parseContentDispositionFilename(res.headers.get('content-disposition')) ?? fallbackName;
  triggerDownload(await res.blob(), filename);
}

export async function importReportJsonPayload(payload: unknown): Promise<ImportReportsResult> {
  return apiFetchJson<ImportReportsResult>('/api/reports/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
