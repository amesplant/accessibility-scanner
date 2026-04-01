import { useEffect, useId, useState } from 'react';
import type { ReportListItem } from '@/hooks/useReports';
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

const LEVELS = [
  { value: 'A', label: 'Level A' },
  { value: 'AA', label: 'Level AA' },
  { value: 'AAA', label: 'Level AAA' },
  { value: 'best-practice', label: 'Best Practice' },
] as const;

interface ExportModalProps {
  report: ReportListItem | null;
  onClose: () => void;
}

export function ExportModal({ report, onClose }: ExportModalProps) {
  const id = useId();
  const formatLabelId = `${id}-format`;
  const tasklistId = `${id}-tasklist`;
  const fileNameId = `${id}-filename`;

  const { format, setFormat, tasklistName, setTasklistName, isExporting, doExport } = useExport(report?.id ?? '');
  const [selectedLevels, setSelectedLevels] = useState<string[]>(['A', 'AA', 'AAA', 'best-practice']);
  const [fileName, setFileName] = useState('');

  // Reset fields whenever a new report is opened
  useEffect(() => {
    if (report) {
      setFileName(`accessibility-issues-${report.id}`);
      setTasklistName('Accessibility Audit');
      setFormat('excel');
      setSelectedLevels(['A', 'AA', 'AAA', 'best-practice']);
    }
  }, [report?.id]);

  function toggleLevel(value: string) {
    setSelectedLevels(prev =>
      prev.includes(value) ? prev.filter(l => l !== value) : [...prev, value]
    );
  }

  return (
    <Dialog open={!!report} onOpenChange={open => { if (!open) onClose(); }}>
      {/* p-0 + overflow-hidden so the scrollbar stays inside the rounded border */}
      <DialogContent className="text-foreground flex flex-col max-h-[90dvh] overflow-hidden p-0">
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <DialogHeader>
            <DialogTitle>Export Report</DialogTitle>
            <DialogDescription>
              {report?.pageTitle || report?.sitemap || 'This report'}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Scrollable body — scrollbar is clipped by the outer overflow-hidden */}
        <div className="flex-1 overflow-y-auto px-6 py-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label id={formatLabelId}>Format</Label>
              <Select value={format} onValueChange={v => setFormat(v as 'csv' | 'excel' | 'jira')}>
                <SelectTrigger aria-labelledby={formatLabelId}>
                  <SelectValue>{EXPORT_FORMAT_LABELS[format]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excel">{EXPORT_FORMAT_LABELS.excel}</SelectItem>
                  <SelectItem value="jira">{EXPORT_FORMAT_LABELS.jira}</SelectItem>
                  <SelectItem value="csv">{EXPORT_FORMAT_LABELS.csv}</SelectItem>
                </SelectContent>
              </Select>
            </div>

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

            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium mb-2">WCAG Levels to Export</legend>
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
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border">
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="button"
              disabled={isExporting || selectedLevels.length === 0}
              onClick={() => doExport(selectedLevels, fileName)}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {isExporting ? 'Exporting…' : 'Export Issues'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
