import { useEffect, useRef, type RefObject } from 'react';

type ClosableFocusEvent = {
  preventDefault: () => void;
};

export function useRestoreFocus(open: boolean, preferredRestoreRef?: RefObject<HTMLElement | null>) {
  const previousOpenRef = useRef(open);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open && !previousOpenRef.current) {
      const activeElement = document.activeElement;
      openerRef.current = preferredRestoreRef?.current ?? (activeElement instanceof HTMLElement ? activeElement : null);
    }

    previousOpenRef.current = open;
  }, [open, preferredRestoreRef]);

  function restoreFocus() {
    requestAnimationFrame(() => {
      const restoreTarget = preferredRestoreRef?.current ?? openerRef.current;
      if (!restoreTarget?.isConnected) return;
      if ('disabled' in restoreTarget && restoreTarget.disabled) return;
      restoreTarget.focus();
    });
  }

  function handleCloseAutoFocus(event: ClosableFocusEvent) {
    event.preventDefault();
    restoreFocus();
  }

  return { handleCloseAutoFocus, restoreFocus };
}