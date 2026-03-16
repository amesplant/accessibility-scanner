import { createContext, useContext, useState, ReactNode } from 'react';
import { AuditType } from '@accessibility-scanner/shared';

const STORAGE_KEY = 'accessibility-scanner:last-report';

interface StoredReport { id: string; label: string; auditType?: AuditType }

interface CurrentReportContextValue {
  reportId: string | null;
  reportLabel: string | null;
  auditType: AuditType | null;
  setCurrentReport: (id: string, label: string, auditType?: AuditType) => void;
  clearCurrentReport: () => void;
}

const CurrentReportContext = createContext<CurrentReportContextValue | undefined>(undefined);

function readStored(): StoredReport | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredReport) : null;
  } catch {
    return null;
  }
}

export function CurrentReportProvider({ children }: { children: ReactNode }) {
  const stored = readStored();
  const [reportId, setReportId] = useState<string | null>(stored?.id ?? null);
  const [reportLabel, setReportLabel] = useState<string | null>(stored?.label ?? null);
  const [auditType, setAuditType] = useState<AuditType | null>(stored?.auditType ?? null);

  function setCurrentReport(id: string, label: string, type?: AuditType) {
    setReportId(id);
    setReportLabel(label);
    setAuditType(type ?? null);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, label, auditType: type })); } catch { /* ignore */ }
  }

  function clearCurrentReport() {
    setReportId(null);
    setReportLabel(null);
    setAuditType(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  return (
    <CurrentReportContext.Provider value={{ reportId, reportLabel, auditType, setCurrentReport, clearCurrentReport }}>
      {children}
    </CurrentReportContext.Provider>
  );
}

export function useCurrentReport() {
  const ctx = useContext(CurrentReportContext);
  if (!ctx) throw new Error('useCurrentReport must be used within CurrentReportProvider');
  return ctx;
}
