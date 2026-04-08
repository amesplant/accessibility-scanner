import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BreadcrumbItem } from '@/components/Breadcrumbs';

type LayoutBreadcrumbContextValue = {
  items: BreadcrumbItem[];
  setItems: (items: BreadcrumbItem[]) => void;
};

const LayoutBreadcrumbContext = createContext<LayoutBreadcrumbContextValue | null>(null);

export function LayoutBreadcrumbProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BreadcrumbItem[]>([]);

  const value = useMemo(() => ({ items, setItems }), [items]);

  return (
    <LayoutBreadcrumbContext.Provider value={value}>
      {children}
    </LayoutBreadcrumbContext.Provider>
  );
}

export function useLayoutBreadcrumbs(items: BreadcrumbItem[]) {
  const context = useContext(LayoutBreadcrumbContext);

  useEffect(() => {
    if (!context) return;
    context.setItems(items);
    return () => context.setItems([]);
  }, [context, items]);
}

export function useCurrentLayoutBreadcrumbs() {
  const context = useContext(LayoutBreadcrumbContext);
  return context?.items ?? [];
}