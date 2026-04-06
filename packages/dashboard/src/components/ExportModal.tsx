import { useEffect, useId, useState } from 'react';
import type { ReportListItem } from '@/hooks/useReports';
import type { ManualCheckResult } from '@accessibility-scanner/shared';
import type { FailureExportData } from '@/lib/manualExport';
import {
  exportCheckAsTeamworkXlsx,
  exportCheckAsJiraCsv,
  exportFailureAsTeamworkXlsx,
  exportFailureAsJiraCsv,
} from '@/lib/manualExport';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useExport, EXPORT_FORMAT_LABELS } from '@/hooks/useExport';
import { useCurrentReport } from '@/context/CurrentReportContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SingleIssueData =
  | { kind: 'check'; check: ManualCheckResult }
  | { kind: 'failure'; data: FailureExportData };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEVELS = [
  { value: 'A', label: 'Level A' },
  { value: 'AA', label: 'Level AA' },
  { value: 'AAA', label: 'Level AAA' },
  { value: 'best-practice', label: 'Best Practice' },
] as const;


const SCOPE_OPTIONS: { value: 'all' | 'automated' | 'manual'; label: string; description: string }[] = [
  { value: 'all',       label: 'All issues',      description: 'Automated violations + manual audit checks' },
  { value: 'automated', label: 'Automated only',   description: 'Only axe-detected violations' },
  { value: 'manual',    label: 'Manual only',      description: 'Only manually added checks' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reportDisplayName(report: ReportListItem | null): string {
  return report?.pageTitle || report?.sitemap?.replace(/https?:\/\//, '') || 'Report';
}

function makeDefaultTasklistName(report: ReportListItem | null): string {
  const year = new Date().getFullYear();
  return `Accessibility Audit ${year} | ${reportDisplayName(report)}`;
}

function makeDefaultFileName(report: ReportListItem | null): string {
  const year = new Date().getFullYear();
  const name = reportDisplayName(report);
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `accessibility-audit-${year}-${slug}`;
}

function makeSingleIssueFileName(singleIssue: SingleIssueData): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  if (singleIssue.kind === 'check') {
    const { check } = singleIssue;
    const criterion = check.wcagCriterion?.replace(/\./g, '-') ?? '';
    const titleSlug = check.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return criterion ? `${criterion}-${titleSlug}-${today}` : `${titleSlug}-${today}`;
  } else {
    const ctx = singleIssue.data.checkContext;
    const criterion = ctx?.criterion?.replace(/\./g, '-') ?? '';
    const titleSlug = (ctx?.title ?? 'issue').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return criterion ? `${criterion}-${titleSlug}-${today}` : `${titleSlug}-${today}`;
  }
}

function singleIssueDescription(singleIssue: SingleIssueData): string {
  if (singleIssue.kind === 'check') {
    const { check } = singleIssue;
    return check.wcagCriterion ? `${check.wcagCriterion} ${check.title}` : check.title;
  }
  const ctx = singleIssue.data.checkContext;
  return ctx?.criterion ? `${ctx.criterion} ${ctx.title ?? 'Failure instance'}` : (ctx?.title ?? 'Failure instance');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ExportModalProps {
  report: ReportListItem | null;
  onClose: () => void;
  /** When set the modal exports a single issue; hides scope + WCAG level controls */
  singleIssue?: SingleIssueData;
}

export function ExportModal({ report, onClose, singleIssue }: ExportModalProps) {
  const id = useId();
  const formatLabelId = `${id}-format`;
  const scopeId = `${id}-scope`;
  const tasklistId = `${id}-tasklist`;
  const fileNameId = `${id}-filename`;

  const { format, setFormat, tasklistName, setTasklistName, isExporting, doExport } = useExport(report?.id ?? '');
  const { reportLabel } = useCurrentReport();
  const [selectedLevels, setSelectedLevels] = useState<string[]>(['A', 'AA', 'AAA', 'best-practice']);
  const [exportScope, setExportScope] = useState<'all' | 'automated' | 'manual'>('all');
  const [fileName, setFileName] = useState('');

  const isSingleIssue = !!singleIssue;

  // Reset fields when modal opens
  useEffect(() => {
    if (report && !singleIssue) {
      setFileName(makeDefaultFileName(report));
      setTasklistName(makeDefaultTasklistName(report));
      setFormat('excel');
      setSelectedLevels(['A', 'AA', 'AAA', 'best-practice']);
      setExportScope('all');
    }
  }, [report?.id]);

  useEffect(() => {
    if (singleIssue) {
      setFileName(makeSingleIssueFileName(singleIssue));
      setFormat('excel');
      const year = new Date().getFullYear();
      const name = report ? reportDisplayName(report) : (reportLabel ?? null);
      setTasklistName(name ? `Accessibility Audit ${year} | ${name}` : `Accessibility Audit ${year}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!singleIssue]);

  function toggleLevel(value: string) {
    setSelectedLevels(prev =>
      prev.includes(value) ? prev.filter(l => l !== value) : [...prev, value]
    );
  }

  function handleSingleIssueExport() {
    if (!singleIssue) return;
    if (singleIssue.kind === 'check') {
      if (format === 'jira') {
        exportCheckAsJiraCsv(singleIssue.check, fileName);
      } else {
        exportCheckAsTeamworkXlsx(singleIssue.check, tasklistName, fileName);
      }
    } else {
      if (format === 'jira') {
        exportFailureAsJiraCsv(singleIssue.data, fileName);
      } else {
        exportFailureAsTeamworkXlsx({ ...singleIssue.data, tasklistName }, fileName);
      }
    }
    onClose();
  }

  const isOpen = isSingleIssue ? true : !!report;
  const dialogTitle = isSingleIssue ? 'Export Issue' : 'Export Report';
  const dialogDesc = isSingleIssue
    ? singleIssueDescription(singleIssue!)
    : (report?.pageTitle || report?.sitemap || 'This report');

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
      {/* p-0 + overflow-hidden so the scrollbar stays inside the rounded border */}
      <DialogContent className="text-foreground flex flex-col max-h-[90dvh] overflow-hidden p-0">
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDesc}</DialogDescription>
          </DialogHeader>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label id={formatLabelId}>Format</Label>
              <Select value={format} onValueChange={v => setFormat(v as 'excel' | 'jira')}>
                <SelectTrigger aria-labelledby={formatLabelId}>
                  <SelectValue>{EXPORT_FORMAT_LABELS[format]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excel">{EXPORT_FORMAT_LABELS.excel}</SelectItem>
                  <SelectItem value="jira">{EXPORT_FORMAT_LABELS.jira}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* What to export — hidden for single-issue exports */}
            {!isSingleIssue && (
              <fieldset className="flex flex-col gap-1.5">
                <legend id={scopeId} className="text-base font-medium mb-2">What to export</legend>
                <div className="border rounded-md p-3 space-y-2">
                  {SCOPE_OPTIONS.map(opt => (
                    <div key={opt.value} className="flex items-start gap-2">
                      <input
                        id={`${id}-scope-${opt.value}`}
                        type="radio"
                        name={`${id}-scope`}
                        value={opt.value}
                        checked={exportScope === opt.value}
                        onChange={() => setExportScope(opt.value)}
                        className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                      />
                      <div>
                        <Label htmlFor={`${id}-scope-${opt.value}`} className="cursor-pointer font-normal leading-tight">
                          {opt.label}
                        </Label>
                        <p className="text-xs text-muted-foreground">{opt.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>
            )}

            {format !== 'jira' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={tasklistId}>Tasklist Name</Label>
                <Input
                  id={tasklistId}
                  value={tasklistName}
                  onChange={e => setTasklistName(e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={fileNameId}>File Name</Label>
              <Input
                id={fileNameId}
                value={fileName}
                onChange={e => setFileName(e.target.value)}
              />
            </div>

            {/* WCAG levels — hidden for single-issue exports and manual-only scope */}
            {!isSingleIssue && exportScope !== 'manual' && (
              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-base font-medium mb-2">WCAG Levels to Export</legend>
                <div className="border rounded-md p-3 space-y-2">
                  {LEVELS.map(({ value, label }) => (
                    <div key={value} className="flex items-center gap-2">
                      <input
                        id={`${id}-level-${value}`}
                        type="checkbox"
                        className="h-4 w-4 appearance-none rounded border-2 border-muted-foreground bg-transparent transition-colors cursor-pointer checked:border-primary checked:bg-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        checked={selectedLevels.includes(value)}
                        onChange={() => toggleLevel(value)}
                      />
                      <Label htmlFor={`${id}-level-${value}`} className="cursor-pointer font-normal">
                        {label}
                      </Label>
                    </div>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border">
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="button"
              disabled={!isSingleIssue && (isExporting || (exportScope !== 'manual' && selectedLevels.length === 0))}
              onClick={isSingleIssue
                ? handleSingleIssueExport
                : () => doExport(exportScope !== 'manual' ? selectedLevels : undefined, fileName, exportScope)
              }
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {!isSingleIssue && isExporting ? 'Exporting…' : 'Export'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
