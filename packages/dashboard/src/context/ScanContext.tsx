import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';

export interface ScanState {
  phase: 'crawling' | 'scanning' | null;
  scanned: number;
  total: number;
}

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

interface ScanContextValue {
  scanning: boolean;
  activeJobId: string | null;
  scanState: ScanState;
  elapsed: number;
  crawlingUrl: string | null;
  scanningUrl: string | null;
  scanError: string | null;
  completedReportId: string | null;
  clearCompletedReport: () => void;
  startScan: (jobId: string, callbacks?: { onComplete?: () => void }) => void;
  abortScan: () => Promise<void>;
  setScanError: (msg: string | null) => void;
}

const ScanContext = createContext<ScanContextValue>({
  scanning: false,
  activeJobId: null,
  scanState: { phase: null, scanned: 0, total: 0 },
  elapsed: 0,
  crawlingUrl: null,
  scanningUrl: null,
  scanError: null,
  completedReportId: null,
  clearCompletedReport: () => {},
  startScan: () => {},
  abortScan: async () => {},
  setScanError: () => {},
});

const SESSION_KEY = 'fueled-access-active-job';

export function ScanProvider({ children }: { children: ReactNode }) {
  const [scanning, setScanning] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanState>({ phase: null, scanned: 0, total: 0 });
  const [elapsed, setElapsed] = useState(0);
  const [crawlingUrl, setCrawlingUrl] = useState<string | null>(null);
  const [scanningUrl, setScanningUrl] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [completedReportId, setCompletedReportId] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const callbackRef = useRef<{ onComplete?: () => void }>({});

  function startTimer() {
    setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function resetScanState() {
    setScanning(false);
    setActiveJobId(null);
    activeJobIdRef.current = null;
    setScanState({ phase: null, scanned: 0, total: 0 });
    setCrawlingUrl(null);
    setScanningUrl(null);
    stopTimer();
    sessionStorage.removeItem(SESSION_KEY);
  }

  function connectToJob(jobId: string) {
    esRef.current?.close();
    const es = new EventSource(`/api/scan/${jobId}/events`);
    esRef.current = es;

    es.addEventListener('crawling', () => {
      setScanState({ phase: 'crawling', scanned: 0, total: 0 });
      setCrawlingUrl(null);
    });

    es.addEventListener('crawl-progress', (e) => {
      const data = JSON.parse(e.data);
      setCrawlingUrl(data.url);
    });

    es.addEventListener('scanning', (e) => {
      const data = JSON.parse(e.data);
      setScanState({ phase: 'scanning', scanned: 0, total: data.total ?? 0 });
      setCrawlingUrl(null);
    });

    es.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setScanState({ phase: 'scanning', scanned: data.scanned, total: data.total });
      setScanningUrl(data.url ?? null);
    });

    es.addEventListener('complete', (e) => {
      es.close();
      resetScanState();
      try {
        const data = JSON.parse((e as MessageEvent).data);
        if (data.reportId) setCompletedReportId(data.reportId);
      } catch { /* no data */ }
      callbackRef.current.onComplete?.();
      callbackRef.current = {};
    });

    es.addEventListener('aborted', () => {
      es.close();
      resetScanState();
      callbackRef.current = {};
    });

    es.addEventListener('error', (e) => {
      es.close();
      resetScanState();
      callbackRef.current = {};
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setScanError(data.message || 'Scan failed');
      } catch {
        setScanError('Scan failed');
      }
    });
  }

  // On mount, reconnect to any active job persisted in sessionStorage
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const savedJobId = sessionStorage.getItem(SESSION_KEY);
    if (savedJobId) {
      setActiveJobId(savedJobId);
      activeJobIdRef.current = savedJobId;
      setScanning(true);
      startTimer();
      connectToJob(savedJobId);
    }
    return () => {
      esRef.current?.close();
      stopTimer();
    };
  }, []);

  function startScan(jobId: string, callbacks?: { onComplete?: () => void }) {
    sessionStorage.setItem(SESSION_KEY, jobId);
    callbackRef.current = callbacks ?? {};
    setActiveJobId(jobId);
    activeJobIdRef.current = jobId;
    setScanning(true);
    setScanError(null);
    startTimer();
    connectToJob(jobId);
  }

  async function abortScan() {
    const jobId = activeJobIdRef.current;
    if (!jobId) return;
    await fetch(`/api/scan/${jobId}`, { method: 'DELETE' });
  }

  function clearCompletedReport() {
    setCompletedReportId(null);
  }

  return (
    <ScanContext.Provider value={{
      scanning,
      activeJobId,
      scanState,
      elapsed,
      crawlingUrl,
      scanningUrl,
      scanError,
      completedReportId,
      clearCompletedReport,
      startScan,
      abortScan,
      setScanError,
    }}>
      {children}
    </ScanContext.Provider>
  );
}

export function useScanContext() {
  return useContext(ScanContext);
}
