import { ReactNode, useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
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
import { FeatureRequestModal } from '@/components/FeatureRequestModal';
import { useRestoreFocus } from '@/hooks/useRestoreFocus';
import { SeymourLogo } from '@/components/SeymourLogo';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LayoutBreadcrumbProvider, useCurrentLayoutBreadcrumbs } from '@/context/LayoutBreadcrumbContext';

type Props = { children: ReactNode };

// ── Material Symbol icon helper ───────────────────────────────────────────────

function Icon({ name, filled, className }: { name: string; filled?: boolean; className?: string }) {
  return (
    <span
      className={['material-symbols-outlined', className].filter(Boolean).join(' ')}
      style={filled ? { fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({
  to,
  icon,
  label,
  active,
  onClick,
}: {
  to: string;
  icon: string;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={[
        'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150',
        'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[-1px] focus-visible:outline-ring',
        active
          ? 'bg-surface-container-lowest text-primary shadow-sm font-semibold scale-[0.97]'
          : 'text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors',
      ].join(' ')}
    >
      <Icon name={icon} filled={active} />
      <span>{label}</span>
    </Link>
  );
}

// ── Focus trap helper ─────────────────────────────────────────────────────────

const FOCUSABLE_SELECTORS =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
    n => getComputedStyle(n).display !== 'none' && !n.closest('[hidden]'),
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

function LayoutShell({ children }: Props) {
  const { scanning, aborting, scanState, elapsed, abortScan, completedReportId, clearCompletedReport } = useScanContext();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [featureRequestOpen, setFeatureRequestOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  );
  const [progressVisible, setProgressVisible] = useState(false);
  const { handleCloseAutoFocus: handleCompletedScanCloseAutoFocus } = useRestoreFocus(!!completedReportId);

  const navigate = useNavigate();
  const location = useLocation();

  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const featureRequestButtonRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
      if (e.matches) setMobileSidebarOpen(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const isMobileOverlay = !isDesktop && mobileSidebarOpen;

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
    requestAnimationFrame(() => hamburgerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isMobileOverlay) return;
    const id = setTimeout(() => closeButtonRef.current?.focus(), 310);
    return () => clearTimeout(id);
  }, [isMobileOverlay]);

  useEffect(() => {
    if (!isMobileOverlay) return;
    function onTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const container = sidebarRef.current;
      if (!container) return;
      const focusable = getFocusable(container);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onTab);
    return () => document.removeEventListener('keydown', onTab);
  }, [isMobileOverlay]);

  useEffect(() => {
    if (!isMobileOverlay) return;
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); closeMobileSidebar(); }
    }
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [isMobileOverlay, closeMobileSidebar]);

  useEffect(() => {
    document.body.style.overflow = isMobileOverlay ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileOverlay]);

  useEffect(() => {
    if (!scanning) { setProgressVisible(false); return; }
    const el = document.getElementById('scan-progress');
    if (!el) { setProgressVisible(false); return; }
    const observer = new IntersectionObserver(([e]) => setProgressVisible(e.isIntersecting), { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [scanning, location.pathname]);

  const onDashboard = location.pathname === '/';
  const onProjects = location.pathname.startsWith('/projects');
  const projectPageMatch = location.pathname.match(/^\/projects\/([^/]+)$/);
  const currentProjectId = projectPageMatch?.[1] ?? null;
  const breadcrumbItems = useCurrentLayoutBreadcrumbs();

  const progressPercent = scanState.total > 0
    ? Math.round((scanState.scanned / scanState.total) * 100)
    : 0;

  // ── Shared sidebar content ────────────────────────────────────────────────
  function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <>
        {/* Logo / brand */}
        <div className="px-4 py-4">
          <Link
            to="/"
            onClick={onNavigate}
            className="inline-flex rounded-2xl px-2 py-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <SeymourLogo />
          </Link>
        </div>

        <nav aria-label="Main navigation" className="flex-1 px-3 flex flex-col gap-1 overflow-y-auto">
          <NavItem to="/" icon="dashboard" label="Dashboard" active={onDashboard} onClick={onNavigate} />
          <NavItem to="/projects" icon="folder_open" label="Projects" active={onProjects} onClick={onNavigate} />
        </nav>

        <div className="px-4 pb-4 flex flex-col gap-2 shrink-0">
          {!scanning && (
            <button
              onClick={() => {
                onNavigate?.();
                navigate('/', { state: { newScan: true, projectId: currentProjectId } });
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-primary to-primary-container shadow-lg shadow-primary/25 hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Icon name="add" className="text-base" />
              New Scan
            </button>
          )}
          <button
            type="button"
            onClick={e => {
              featureRequestButtonRef.current = e.currentTarget;
              onNavigate?.();
              setFeatureRequestOpen(true);
            }}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[-1px] focus-visible:outline-ring"
          >
            <Icon name="help_outline" />
            Request a Feature
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen flex bg-surface text-on-surface">
      {/* Skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-[60] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-xl focus:outline-none"
      >
        Skip to main content
      </a>

      {/* ── Desktop persistent sidebar ── */}
      <aside
        aria-label="Main navigation"
        className="hidden lg:flex flex-col w-64 shrink-0 bg-surface-container-low min-h-screen sticky top-0 h-screen overflow-y-auto"
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile top bar ── */}
      <header
        className="lg:hidden sticky top-0 z-30 h-14 flex items-center justify-between px-4 bg-surface-container-low/90 backdrop-blur-md shrink-0"
        // @ts-expect-error — inert is a valid HTML boolean attribute (React 19)
        inert={isMobileOverlay ? '' : undefined}
      >
        <button
          ref={hamburgerRef}
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileSidebarOpen}
          aria-controls="mobile-sidebar"
          className="h-10 w-10 flex items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Icon name="menu" />
        </button>
        <span className="text-base font-extrabold text-link tracking-[0.01em]">Seymour</span>
        <div className="w-10" aria-hidden="true" />
      </header>

      {/* ── Mobile backdrop ── */}
      <div
        aria-hidden="true"
        onClick={closeMobileSidebar}
        className={`lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isMobileOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      {/* ── Mobile slide-out sidebar ── */}
      <div
        id="mobile-sidebar"
        ref={sidebarRef}
        role={isMobileOverlay ? 'dialog' : undefined}
        aria-modal={isMobileOverlay ? true : undefined}
        aria-labelledby={isMobileOverlay ? 'mobile-sidebar-title' : undefined}
        className={[
          'lg:hidden fixed top-0 left-0 bottom-0 z-50 w-72 flex flex-col bg-surface-container-low',
          'transform transition-transform duration-300 ease-in-out shadow-2xl',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <h2 id="mobile-sidebar-title" className="sr-only">Navigation menu</h2>
        <div className="flex items-center justify-end px-4 pt-4 shrink-0">
          <button
            ref={closeButtonRef}
            onClick={closeMobileSidebar}
            aria-label="Close navigation menu"
            className="h-9 w-9 flex items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Icon name="close" />
          </button>
        </div>
        <SidebarContent onNavigate={closeMobileSidebar} />
      </div>

      {/* ── Screen reader live region ── */}
      <span className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {aborting ? 'Aborting scan…' : ''}
      </span>

      {/* ── Page content ── */}
      <div
        className="flex-1 flex flex-col min-w-0"
        // @ts-expect-error — inert is a valid HTML boolean attribute (React 19)
        inert={isMobileOverlay ? '' : undefined}
      >
        {/* ── Sticky top header ── */}
        <header className="sticky top-0 z-20 flex items-center justify-between px-8 h-16 bg-white/80 backdrop-blur-md shadow-sm shrink-0">
          <div className="min-w-0 flex items-center gap-2 text-on-surface-variant">
            <span className="text-sm font-semibold text-primary">
              {onDashboard ? 'Audit Dashboard' : onProjects ? 'Projects' : 'Reports'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-on-surface-variant">
              <button
                onClick={() => setFeatureRequestOpen(true)}
                aria-label="Request a feature"
                className="p-2 rounded-full hover:bg-surface-container hover:text-primary transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Icon name="help_outline" />
              </button>
            </div>
            <div className="h-6 w-px bg-outline-variant" aria-hidden="true" />
            {!scanning ? (
              <button
                onClick={() => navigate('/', { state: { newScan: true, projectId: currentProjectId } })}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-container shadow-lg shadow-primary/25 hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Icon name="biotech" className="text-base" />
                Start New Scan
              </button>
            ) : (
              <span className="flex items-center gap-2 text-sm text-on-surface-variant">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                Scanning…
              </span>
            )}
          </div>
        </header>

        {breadcrumbItems.length > 0 && (
          <div className="px-8 pt-4">
            <Breadcrumbs items={breadcrumbItems} className="min-w-0" />
          </div>
        )}

        {/* ── Floating scan progress pill ── */}
        {scanning && (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={[
              'fixed top-20 left-1/2 -translate-x-1/2 z-30',
              'glass-panel flex items-center gap-4 px-5 py-3 rounded-full',
              'shadow-[0px_12px_32px_rgba(0,0,0,0.12)] border border-white/30',
              'transition-all duration-300',
              !progressVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none',
            ].join(' ')}
          >
            {/* Circular progress indicator */}
            <div className="relative w-9 h-9 shrink-0" aria-hidden="true">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle
                  className="text-surface-container-highest"
                  cx="18" cy="18" r="16"
                  fill="transparent"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
                <circle
                  className="text-primary transition-all duration-500"
                  cx="18" cy="18" r="16"
                  fill="transparent"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeDasharray="100.5"
                  strokeDashoffset={100.5 - (progressPercent / 100) * 100.5}
                  strokeLinecap="round"
                />
              </svg>
              {scanState.total > 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-primary">
                  {progressPercent}%
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => { if (onDashboard) window.scrollTo({ top: 0, behavior: 'smooth' }); else navigate('/'); }}
              aria-label="View scan progress details"
              className="flex flex-col text-left hover:opacity-80 transition-opacity"
            >
              <span className="text-xs font-bold text-on-surface">
                {aborting ? 'Aborting…' : 'Scan in Progress'}
              </span>
              <span className="text-[10px] text-on-surface-variant">
                {scanState.phase === 'scanning' && scanState.total > 0
                  ? `${scanState.scanned} / ${scanState.total} pages · ${formatElapsed(elapsed)}`
                  : scanState.phase === 'crawling'
                    ? `Discovering pages · ${formatElapsed(elapsed)}`
                    : `Starting · ${formatElapsed(elapsed)}`}
              </span>
            </button>

            {!onDashboard && (
              <Link to="/" className="text-xs text-primary hover:underline shrink-0 font-medium">
                View
              </Link>
            )}

            {!aborting && (
              <button
                type="button"
                onClick={() => abortScan()}
                aria-label="Abort current scan"
                className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-error-container hover:text-on-error-container transition-colors shrink-0 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Icon name="close" className="text-base" />
              </button>
            )}
          </div>
        )}

        <main id="main-content" className="flex-1" tabIndex={-1}>
          <div className={breadcrumbItems.length > 0 ? 'px-8 pb-8 pt-4' : 'p-8'}>
            {children}
          </div>
        </main>

        <footer className="py-4 px-8 shrink-0">
          <p className="text-xs text-outline">Seymour — powered by axe-core · WCAG 2.2 A/AA/AAA</p>
        </footer>
      </div>

      {/* ── Feature Request modal ── */}
      <FeatureRequestModal
        open={featureRequestOpen}
        onClose={() => setFeatureRequestOpen(false)}
        restoreFocusRef={featureRequestButtonRef}
      />

      {/* ── Scan complete dialog ── */}
      <Dialog open={!!completedReportId} onOpenChange={open => { if (!open) clearCompletedReport(); }}>
        <DialogContent onCloseAutoFocus={handleCompletedScanCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>Scan complete</DialogTitle>
            <DialogDescription>
              Your accessibility scan has finished. View the report to see violations, page results, and manual audit checklists.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={clearCompletedReport}>Dismiss</Button>
            <Button onClick={() => { navigate(`/reports/${completedReportId}`); clearCompletedReport(); }}>
              View Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Layout({ children }: Props) {
  return (
    <LayoutBreadcrumbProvider>
      <LayoutShell>{children}</LayoutShell>
    </LayoutBreadcrumbProvider>
  );
}
