import { ReactNode, useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useScanContext, formatElapsed } from '@/context/ScanContext';
import { SeymourLogo } from '@/components/SeymourLogo';
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

// ── Icons ─────────────────────────────────────────────────────────────────────

const IconHamburger = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" width="20" height="20" aria-hidden="true">
    <path d="M3 5h14M3 10h14M3 15h14" />
  </svg>
);
const IconClose = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" width="20" height="20" aria-hidden="true">
    <path d="M4 4l12 12M16 4L4 16" />
  </svg>
);
const IconDashboard = () => (
  <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
    <rect x="1" y="1" width="7" height="7" rx="1.5" /><rect x="10" y="1" width="7" height="7" rx="1.5" />
    <rect x="1" y="10" width="7" height="7" rx="1.5" /><rect x="10" y="10" width="7" height="7" rx="1.5" />
  </svg>
);
const IconProjects = () => (
  <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
    <path d="M1.5 5a1.5 1.5 0 0 1 1.5-1.5h3.879a1.5 1.5 0 0 1 1.06.44L9 5h7.5A1.5 1.5 0 0 1 18 6.5V14A1.5 1.5 0 0 1 16.5 15.5h-15A1.5 1.5 0 0 1 0 14V6.5A1.5 1.5 0 0 1 1.5 5z" />
  </svg>
);
const IconScan = () => (
  <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
    <circle cx="9" cy="9" r="3.5" />
    <path d="M9 1v2.5M9 14.5V17M1 9h2.5M14.5 9H17M3.2 3.2l1.8 1.8M13 13l1.8 1.8M14.8 3.2L13 5M5 13l-1.8 1.8" />
  </svg>
);

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({
  to,
  icon,
  label,
  active,
  onClick,
}: {
  to: string;
  icon: ReactNode;
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
        'flex items-center gap-3.5 pr-4 pl-3 py-2.5 rounded-lg text-base font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[-1px] focus-visible:outline-ring',
        active
          ? 'border-l-4 border-primary bg-white/10 text-white'
          : 'border-l-4 border-transparent text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
      ].join(' ')}
    >
      {icon}
      {label}
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

export function Layout({ children }: Props) {
  const { scanning, aborting, scanState, elapsed, abortScan, completedReportId, clearCompletedReport } = useScanContext();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  );
  const [progressVisible, setProgressVisible] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // ── Respond to viewport changes ───────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
      if (e.matches) setMobileSidebarOpen(false); // auto-close if resized to desktop
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // isMobileOverlay: sidebar is acting as a modal overlay
  const isMobileOverlay = !isDesktop && mobileSidebarOpen;

  // ── Centralized close ─────────────────────────────────────────────────────
  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
    requestAnimationFrame(() => hamburgerRef.current?.focus());
  }, []);

  // ── Focus close button after slide-in animation ───────────────────────────
  useEffect(() => {
    if (!isMobileOverlay) return;
    const id = setTimeout(() => closeButtonRef.current?.focus(), 310);
    return () => clearTimeout(id);
  }, [isMobileOverlay]);

  // ── Focus trap (mobile overlay only) ─────────────────────────────────────
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

  // ── Escape key (mobile overlay only) ─────────────────────────────────────
  useEffect(() => {
    if (!isMobileOverlay) return;
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); closeMobileSidebar(); }
    }
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [isMobileOverlay, closeMobileSidebar]);

  // ── Body scroll lock (mobile overlay only) ───────────────────────────────
  useEffect(() => {
    document.body.style.overflow = isMobileOverlay ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileOverlay]);

  // ── Scan progress visibility ──────────────────────────────────────────────
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

  // ── Shared sidebar content ────────────────────────────────────────────────
  function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <>
        <nav aria-label="Main navigation" className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
          <NavItem to="/" icon={<IconDashboard />} label="Dashboard" active={onDashboard} onClick={onNavigate} />
          <NavItem to="/projects" icon={<IconProjects />} label="Projects" active={onProjects} onClick={onNavigate} />
          {!scanning && (
            <div className="mt-4 px-1">
              <button
                onClick={() => {
                  onNavigate?.();
                  navigate('/', { state: { newScan: true, projectId: currentProjectId } });
                }}
                className="flex items-center gap-3.5 w-full px-4 py-2.5 rounded-lg text-base font-medium bg-primary text-white hover:bg-primary/85 transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <IconScan />
                New Scan
              </button>
            </div>
          )}
        </nav>

      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background text-foreground">
      {/* Skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-[60] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded focus:outline-none"
      >
        Skip to main content
      </a>

      {/* ── Desktop persistent sidebar (lg+) ── */}
      <aside
        aria-label="Main navigation"
        className="hidden lg:flex flex-col w-64 shrink-0 bg-card border-r border-border min-h-screen"
      >
        <div className="h-14 px-5 flex items-center border-b border-border shrink-0">
          <Link to="/" className="focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm">
            <SeymourLogo />
          </Link>
        </div>
        <SidebarContent />
      </aside>

      {/* ── Mobile top bar (hidden on lg+) ── */}
      <header
        className="lg:hidden sticky top-0 z-30 h-12 flex items-center justify-between px-4 bg-card border-b border-border shrink-0"
        // @ts-expect-error — inert is a valid HTML boolean attribute (React 19)
        inert={isMobileOverlay ? '' : undefined}
      >
        <button
          ref={hamburgerRef}
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileSidebarOpen}
          aria-controls="mobile-sidebar"
          className="h-9 w-9 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-white/8 transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <IconHamburger />
        </button>
        <div className="w-8" aria-hidden="true" />
      </header>

      {/* ── Mobile backdrop (hidden on lg+) ── */}
      <div
        aria-hidden="true"
        onClick={closeMobileSidebar}
        className={`lg:hidden fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${isMobileOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      {/* ── Mobile slide-out sidebar dialog (hidden on lg+) ── */}
      <div
        id="mobile-sidebar"
        ref={sidebarRef}
        role={isMobileOverlay ? 'dialog' : undefined}
        aria-modal={isMobileOverlay ? true : undefined}
        aria-labelledby={isMobileOverlay ? 'mobile-sidebar-title' : undefined}
        className={[
          'lg:hidden fixed top-0 left-0 bottom-0 z-50 w-72 flex flex-col bg-card border-r border-border',
          'transform transition-transform duration-300 ease-in-out',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <h2 id="mobile-sidebar-title" className="sr-only">Navigation menu</h2>

        <div className="h-14 px-5 flex items-center justify-between border-b border-border shrink-0">
          <Link to="/" onClick={closeMobileSidebar} className="focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm">
            <SeymourLogo />
          </Link>
          <button
            ref={closeButtonRef}
            onClick={closeMobileSidebar}
            aria-label="Close navigation menu"
            className="h-8 w-8 flex items-center justify-center rounded-md text-zinc-500 hover:text-white hover:bg-white/8 transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <IconClose />
          </button>
        </div>

        <SidebarContent onNavigate={closeMobileSidebar} />
      </div>

      {/* ── Screen reader live region ── */}
      <span className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {aborting ? 'Aborting scan…' : ''}
      </span>

      {/* ── Page content (inert on mobile while sidebar overlay is open) ── */}
      <div
        className="flex-1 flex flex-col min-w-0"
        // @ts-expect-error — inert is a valid HTML boolean attribute (React 19)
        inert={isMobileOverlay ? '' : undefined}
      >
        {/* Floating scan progress pill */}
        {scanning && (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={[
              'fixed top-14 lg:top-4 left-1/2 -translate-x-1/2 z-20',
              'flex items-center gap-1 rounded-full',
              'bg-background/70 backdrop-blur-md border border-primary/30 shadow-lg shadow-black/20',
              'transition-all duration-300 ease-out',
              !progressVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none',
            ].join(' ')}
          >
            <button
              type="button"
              onClick={() => { if (onDashboard) window.scrollTo({ top: 0, behavior: 'smooth' }); else navigate('/'); }}
              aria-label="View scan progress details"
              className="flex items-center gap-3 px-4 py-2.5 rounded-full hover:bg-primary/10 transition-colors"
            >
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" aria-hidden="true" />
              <span className="text-base text-foreground whitespace-nowrap">
                {aborting ? 'Aborting…' : (
                  <>
                    {scanState.phase === 'crawling' && 'Discovering pages…'}
                    {scanState.phase === 'scanning' && scanState.total > 0 && `Scanning ${scanState.scanned} / ${scanState.total}`}
                    {scanState.phase === 'scanning' && scanState.total === 0 && 'Scanning…'}
                    {!scanState.phase && 'Starting scan…'}
                  </>
                )}
              </span>
              <span className="text-xs text-muted-foreground font-mono shrink-0">{formatElapsed(elapsed)}</span>
            </button>
            {!onDashboard && <Link to="/" className="text-xs text-link hover:underline shrink-0">View</Link>}
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

        <main id="main-content" className="flex-1" tabIndex={-1}>
          {/* Content header with New Scan action */}
          <div className="sticky top-0 lg:top-0 z-10 flex items-center justify-end px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm">
            {!scanning ? (
              <button
                onClick={() => navigate('/', { state: { newScan: true, projectId: currentProjectId } })}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-base font-medium bg-primary text-white hover:bg-primary/85 transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <IconScan />
                New Scan
              </button>
            ) : (
              <span className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                Scan in progress
              </span>
            )}
          </div>
          <div className="p-6">
            {children}
          </div>
        </main>

        <footer className="border-t border-border py-3 px-6 shrink-0">
          <p className="text-xs text-muted-foreground">Seymour — powered by axe-core</p>
        </footer>
      </div>

      {/* ── Scan complete dialog ── */}
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
            <Button onClick={() => { navigate(`/reports/${completedReportId}`); clearCompletedReport(); }}>
              View Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
