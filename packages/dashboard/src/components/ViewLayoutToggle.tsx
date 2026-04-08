import { cn } from '@/lib/utils';

export type ViewLayout = 'cards' | 'list';

interface ViewLayoutToggleProps {
  value: ViewLayout;
  onChange: (value: ViewLayout) => void;
  ariaLabel: string;
}

const OPTIONS: Array<{ value: ViewLayout; label: string; icon: string }> = [
  { value: 'cards', label: 'Cards', icon: 'layers' },
  { value: 'list', label: 'List', icon: 'format_align_left' },
];

export function ViewLayoutToggle({ value, onChange, ariaLabel }: ViewLayoutToggleProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-[18px] border border-slate-200 bg-white p-1 shadow-[0px_8px_20px_rgba(24,28,32,0.05)]"
    >
      {OPTIONS.map((option) => {
        const active = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-11 items-center gap-2 rounded-[14px] px-5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2',
              active
                ? 'bg-cyan-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              {option.icon}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}