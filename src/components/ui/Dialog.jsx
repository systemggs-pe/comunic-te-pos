import React, {useEffect, useRef} from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const getFocusable = element => Array.from(element.querySelectorAll(FOCUSABLE_SELECTOR))
  .filter(node => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true');

export function Dialog({
  open,
  onClose,
  titleId,
  descriptionId,
  className,
  children,
  closeOnBackdrop = false,
}) {
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const focusable = panel ? getFocusable(panel) : [];
    const firstFocusTarget = focusable[0] || panel;

    const frameId = window.requestAnimationFrame(() => firstFocusTarget?.focus?.());

    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab' || !panel) return;

      const currentFocusable = getFocusable(panel);
      if (currentFocusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const handleBackdropMouseDown = event => {
    if (closeOnBackdrop && event.target === event.currentTarget) onCloseRef.current?.();
  };

  return (
    <div className="saas-modal-backdrop fixed inset-0 z-[260] flex items-center justify-center p-4" onMouseDown={handleBackdropMouseDown}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={className}
        onMouseDown={event => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
