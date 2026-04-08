import type { ScanReport } from '@accessibility-scanner/shared';

type ReportWithIntegrity = Pick<ScanReport, 'integrity'>;

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`.trim()} aria-hidden="true">
      {name}
    </span>
  );
}

export function isCorruptedReport(report: ReportWithIntegrity | null | undefined): boolean {
  return report?.integrity?.status === 'corrupted';
}

export function isRecoveredReport(report: ReportWithIntegrity | null | undefined): boolean {
  return report?.integrity?.status === 'recovered';
}

export function getReportIntegrityMessage(report: ReportWithIntegrity | null | undefined): string {
  return report?.integrity?.message?.trim() || 'This report payload could not be read.';
}

export function ReportIntegrityNotice({
  report,
  className = '',
  showRecovered = true,
}: {
  report: ReportWithIntegrity | null | undefined;
  className?: string;
  showRecovered?: boolean;
}) {
  if (!report?.integrity) return null;

  const corrupted = report.integrity.status === 'corrupted';
  if (!corrupted && !showRecovered) return null;

  return (
    <div
      className={[
        'mt-3 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm',
        corrupted
          ? 'border-error/25 bg-error-container/40 text-error'
          : 'border-emerald-200 bg-emerald-50 text-emerald-900',
        className,
      ].filter(Boolean).join(' ')}
    >
      <Icon
        name={corrupted ? 'error' : 'inventory'}
        className={corrupted ? 'text-[18px] text-error' : 'text-[18px] text-emerald-700'}
      />
      <div className="min-w-0">
        <p className="font-semibold">
          {corrupted ? 'Corrupted report data' : 'Recovered report data'}
        </p>
        <p className={corrupted ? 'text-error/90' : 'text-emerald-900/80'}>
          {getReportIntegrityMessage(report)}
        </p>
      </div>
    </div>
  );
}