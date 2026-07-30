import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function Modal({ title, children, onClose, labelledBy = 'modal-title', className = '' }) {
  const dialogRef = useRef(null);
  const closeTimerRef = useRef(null);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const [closing, setClosing] = useState(false);
  onCloseRef.current = onClose;

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), reduceMotion ? 0 : 180);
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
    const preferredFocus = dialog?.querySelector('[autofocus]');
    (preferredFocus || focusable?.[0])?.focus();

    function handleKeyDown(event) {
      const openDialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (openDialogs[openDialogs.length - 1] !== dialog) return;
      if (event.key === 'Escape') requestClose();
      if (event.key !== 'Tab' || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(closeTimerRef.current);
      previousFocus?.focus();
    };
  }, [requestClose]);

  return (
    <div className={`modal-overlay ${closing ? 'is-closing' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
      <section className={`app-modal ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={dialogRef}>
        <button className="icon-button app-modal__close" type="button" onClick={requestClose} aria-label="Dialog schließen"><X size={21} /></button>
        <h2 id={labelledBy}>{title}</h2>
        {children}
      </section>
    </div>
  );
}
