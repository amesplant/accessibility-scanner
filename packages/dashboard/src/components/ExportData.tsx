import { useId, useState } from 'react';
import { ScanReport } from '@accessibility-scanner/shared';
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
import { useExport, EXPORT_FORMAT_LABELS } from '@/hooks/useExport';

interface ExportDataProps {
  report: ScanReport;
}

const LEVELS = [
  { value: 'A', label: 'WCAG A' },
  { value: 'AA', label: 'WCAG AA' },
  { value: 'AAA', label: 'WCAG AAA' },
  { value: 'best-practice', label: 'Best Practice' },
] as const;

export function ExportData({ report }: ExportDataProps) {
  const id = useId();
  const formatLabelId = `${id}-format`;
  const tasklistId = `${id}-tasklist`;
  const fileNameId = `${id}-filename`;

  const { format, setFormat, tasklistName, setTasklistName, isExporting, doExport } = useExport(report.id);
  const [selectedLevels, setSelectedLevels] = useState<string[]>(['A', 'AA', 'AAA', 'best-practice']);
  const [fileName, setFileName] = useState(`accessibility-issues-${report.id}`);

  function toggleLevel(value: string) {
    setSelectedLevels(prev =>
      prev.includes(value) ? prev.filter(l => l !== value) : [...prev, value]
    );
  }

  const exportBtnClass =
    'inline-flex items-center gap-1.5 hover:bg-primary/20 hover:border-primary';

  return (
    <div className="max-w-2xl p-6 border rounded-lg bg-background">
      <h2 className="text-lg font-semibold mb-4">Export Accessibility Issues</h2>
      <div className="space-y-4">
        <div>
          <Label id={formatLabelId}>Export Format</Label>
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

        <div>
          <Label htmlFor={tasklistId}>Tasklist Name</Label>
          <Input
            id={tasklistId}
            type="text"
            value={tasklistName}
            onChange={e => setTasklistName(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor={fileNameId}>File Name</Label>
          <Input
            id={fileNameId}
            type="text"
            value={fileName}
            onChange={e => setFileName(e.target.value)}
          />
        </div>

        <fieldset>
          <legend className="text-base font-medium mb-2">WCAG Levels to Export</legend>
          <div className="border rounded-md p-4 space-y-2">
            {LEVELS.map(({ value, label }) => (
              <div key={value} className="flex items-center space-x-2">
                <input
                  id={`${id}-level-${value}`}
                  type="checkbox"
                  className="h-4 w-4 appearance-none rounded border-2 border-muted-foreground bg-transparent transition-colors cursor-pointer checked:border-primary checked:bg-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  checked={selectedLevels.includes(value)}
                  onChange={() => toggleLevel(value)}
                />
                <Label htmlFor={`${id}-level-${value}`} className="cursor-pointer">
                  {label}
                </Label>
              </div>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex space-x-4 mt-4">
        <Button
          variant="outline"
          className={exportBtnClass}
          onClick={() => doExport(undefined, fileName)}
          disabled={isExporting}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {isExporting ? 'Exporting…' : 'Export All Levels'}
        </Button>
        <Button
          variant="outline"
          className={exportBtnClass}
          onClick={() => doExport(selectedLevels, fileName)}
          disabled={selectedLevels.length === 0 || isExporting}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {isExporting ? 'Exporting…' : 'Export Selected Levels'}
        </Button>
      </div>
    </div>
  );
}
