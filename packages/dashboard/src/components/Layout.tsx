import { ReactNode, useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useCurrentReport } from '@/context/CurrentReportContext';
import { useReports } from '@/hooks/useReports';
import { useScanContext, formatElapsed } from '@/context/ScanContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Props = { children: ReactNode };


export function Layout({ children }: Props) {
  const { reportId } = useCurrentReport();
  const { reports, refresh: refreshReports } = useReports();
  const { scanning, aborting, scanState, elapsed, abortScan, completedReportId, clearCompletedReport } = useScanContext();
  const [showReports, setShowReports] = useState(false);
  const [progressVisible, setProgressVisible] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!scanning) { setProgressVisible(false); return; }
    const el = document.getElementById('scan-progress');
    if (!el) { setProgressVisible(false); return; }
    const observer = new IntersectionObserver(
      ([entry]) => setProgressVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scanning, location.pathname]);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const reportsButtonRef = useRef<HTMLButtonElement>(null);
  const reportsDropdownRef = useRef<HTMLDivElement>(null);

  const reportPageMatch = location.pathname.match(/^\/reports\/([^/]+)/);
  const onReportPage = Boolean(reportPageMatch);
  const activeReportId = reportPageMatch?.[1] ?? reportId;
  const onDashboard = location.pathname === '/';
  const onProjects = location.pathname.startsWith('/projects');
  const projectPageMatch = location.pathname.match(/^\/projects\/([^/]+)$/);
  const currentProjectId = projectPageMatch?.[1] ?? null;

  const navLink = (active: boolean) =>
    active
      ? 'text-sm font-medium text-foreground border-b-2 border-link pb-0.5 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm'
      : 'text-sm text-muted-foreground hover:text-link focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm';

  // ── Reports dropdown ────────────────────────────────────────────────────────

  function openReportsDropdown() {
    refreshReports();
    setShowReports(true);
  }

  function closeReportsDropdown() {
    setShowReports(false);
    reportsButtonRef.current?.focus();
  }

  // Close on outside click
  useEffect(() => {
    if (!showReports) return;
    function handleDown(e: MouseEvent) {
      if (
        reportsDropdownRef.current &&
        !reportsDropdownRef.current.contains(e.target as Node) &&
        !reportsButtonRef.current?.contains(e.target as Node)
      ) {
        setShowReports(false);
      }
    }
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [showReports]);

  // Escape closes dropdown
  useEffect(() => {
    if (!showReports) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); closeReportsDropdown(); }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showReports]);

  // Focus first item when dropdown opens
  useEffect(() => {
    if (showReports) {
      const first = reportsDropdownRef.current?.querySelector<HTMLElement>('a, button');
      first?.focus();
    }
  }, [showReports]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function reportNavLabel(report: { sitemap: string; pageTitle?: string }) {
    if (report.pageTitle) return report.pageTitle;
    try { return new URL(report.sitemap).hostname; } catch { return report.sitemap; }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded focus:outline-none"
      >
        Skip to main content
      </a>

      <header className="border-b border-border">
        <nav aria-label="Main navigation" className="container mx-auto px-6 py-3 flex items-center gap-6">
          {/* Brand */}
          <Link
            to="/"
            aria-current={onDashboard ? 'page' : undefined}
            className={`font-semibold ${navLink(onDashboard)}`}
          >
            Fueled Access
          </Link>

          {/* Projects link */}
          <Link
            to="/projects"
            aria-current={onProjects ? 'page' : undefined}
            className={navLink(onProjects)}
          >
            Projects
          </Link>

          {/* Reports dropdown */}
          <div className="flex items-center gap-4 flex-1 relative">
            <button
              ref={reportsButtonRef}
              onClick={() => showReports ? closeReportsDropdown() : openReportsDropdown()}
              aria-haspopup="listbox"
              aria-expanded={showReports}
              aria-controls="reports-dropdown"
              className={`flex items-center gap-1 ${navLink(onReportPage)}`}
            >
              Reports
              <svg
                aria-hidden="true"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                className={`transition-transform duration-150 ${showReports ? 'rotate-180' : ''}`}
              >
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {showReports && (
              <div
                id="reports-dropdown"
                ref={reportsDropdownRef}
                role="listbox"
                aria-label="Scanned reports"
                className="absolute top-full left-0 mt-2 w-72 rounded-xl border border-border bg-card text-card-foreground shadow-xl z-40 py-1 max-h-80 overflow-y-auto"
              >
                {reports.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">No reports yet.</p>
                ) : (
                  reports.map(report => {
                    const label = reportNavLabel(report);
                    const isActive = report.id === activeReportId;
                    return (
                      <a
                        key={report.id}
                        href={`/reports/${report.id}`}
                        role="option"
                        aria-selected={isActive}
                        onClick={() => setShowReports(false)}
                        className={`flex items-start justify-between gap-2 px-4 py-2.5 text-sm hover:bg-muted focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[-2px] focus-visible:outline-ring transition-colors ${
                          isActive ? 'bg-primary/10 text-foreground font-medium' : 'text-muted-foreground'
                        }`}
                      >
                        <span className="truncate">{label}</span>
                      </a>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* New Scan */}
          {!scanning && (
            <button
              ref={triggerRef}
              onClick={() => navigate('/', { state: { newScan: true, projectId: currentProjectId } })}
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 py-1.5 hover:bg-primary/90 hover:text-primary-foreground focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring transition-colors"
            >
              New Scan
            </button>
          )}
        </nav>
      </header>

      {/* Assertive region: announces abort immediately regardless of AT speech queue */}
      <span className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {aborting ? 'Aborting scan…' : ''}
      </span>

      {scanning && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={[
            'fixed top-4 left-1/2 -translate-x-1/2 z-50',
            'flex items-center gap-1 rounded-full',
            'bg-background/60 backdrop-blur-md border border-primary/30 shadow-lg shadow-black/10',
            'transition-all duration-300 ease-out',
            scanning && !progressVisible
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-2 pointer-events-none',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={() => {
              if (onDashboard) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              } else {
                navigate('/');
              }
            }}
            aria-label="View scan progress details"
            className="flex items-center gap-3 px-4 py-2.5 rounded-full hover:bg-primary/10 transition-colors"
          >
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" aria-hidden="true" />
            <span className="text-sm text-foreground whitespace-nowrap">
              {aborting ? 'Aborting…' : (
                <>
                  {scanState.phase === 'crawling' && 'Discovering pages…'}
                  {scanState.phase === 'scanning' && scanState.total > 0 && (
                    `Scanning ${scanState.scanned} / ${scanState.total}`
                  )}
                  {scanState.phase === 'scanning' && scanState.total === 0 && 'Scanning…'}
                  {!scanState.phase && 'Starting scan…'}
                </>
              )}
            </span>
            <span className="text-xs text-muted-foreground font-mono shrink-0">
              {formatElapsed(elapsed)}
            </span>
          </button>
          {!onDashboard && (
            <Link to="/" className="text-xs text-link hover:underline shrink-0">
              View
            </Link>
          )}
          {!onDashboard && <div className="w-px h-4 bg-border shrink-0" aria-hidden="true" />}
          {!aborting && (
            <button
              type="button"
              onClick={() => abortScan()}
              aria-label="Abort current scan"
              className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0 pr-4 py-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
            >
              Abort
            </button>
          )}
        </div>
      )}

      <main id="main-content" className="flex-1 p-4" tabIndex={-1}>
        {children}
      </main>

      <footer className="border-t border-border py-4">
        <p className="container mx-auto px-6 text-xs text-muted-foreground">
          Fueled Access — powered by axe-core
        </p>
      </footer>

      <Dialog open={!!completedReportId} onOpenChange={open => { if (!open) clearCompletedReport(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scan complete</DialogTitle>
            <DialogDescription>
              Your accessibility scan has finished. View the report to see violations, page results, and manual audit checklists.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={clearCompletedReport}>Dismiss</Button>
            <Button
              onClick={() => {
                navigate(`/reports/${completedReportId}`);
                clearCompletedReport();
              }}
            >
              View Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
