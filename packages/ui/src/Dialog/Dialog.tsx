import { useEffect, useRef, type ReactNode } from 'react';
import './Dialog.css';

export interface DialogProps {
  children: ReactNode;
  isOpen: boolean;
  label: string;
  onClose: () => void;
  variant?: 'modal' | 'inspector';
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  children,
  isOpen,
  label,
  onClose,
  variant = 'modal',
}: DialogProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const first = dialog.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? dialog.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      returnFocus.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || dialog.current === null) return;
    const focusable = Array.from(
      dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.current.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="studio-dialog"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-label={label}
        aria-modal="true"
        className={`studio-dialog__panel studio-dialog__panel--${variant}`}
        onKeyDown={onKeyDown}
        ref={dialog}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
