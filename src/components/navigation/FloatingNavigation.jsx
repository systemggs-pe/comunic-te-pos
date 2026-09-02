import React, {useEffect, useId, useRef, useState} from 'react';
import {Ellipsis, X} from 'lucide-react';

function NavigationItem({item, onSelect}) {
  return (
    <button
      type="button"
      className="app-floating-nav__item"
      aria-label={item.label}
      aria-current={item.active ? 'page' : undefined}
      onClick={() => onSelect(item)}
    >
      <span className="app-floating-nav__icon" aria-hidden="true">{React.createElement(item.Icon, {size: 20, strokeWidth: 1.85})}</span>
      <span className="app-floating-nav__label">{item.label}</span>
    </button>
  );
}

export function FloatingNavigation({items, moreActive = false, children}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const closeMore = (restoreFocus = false) => {
    setMoreOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!moreOpen) return undefined;
    const panel = panelRef.current;
    const firstControl = panel?.querySelector('button:not([disabled]), a[href]');
    window.requestAnimationFrame(() => firstControl?.focus());
    const handleKeyDown = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMore(true);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [moreOpen]);

  const selectItem = item => {
    item.onSelect?.();
    setMoreOpen(false);
  };

  return (
    <>
      {moreOpen && <button type="button" className="app-more-scrim" aria-label="Cerrar menú Más" onClick={() => closeMore()} />}
      {moreOpen && (
        <section ref={panelRef} id={panelId} className="app-more-panel" role="dialog" aria-modal="false" aria-labelledby={titleId}>
          <header className="app-more-panel__header">
            <div><p className="ui-eyebrow">Navegación</p><h2 id={titleId}>Más</h2></div>
            <button type="button" className="ui-icon-button ui-icon-button--sm" aria-label="Cerrar menú Más" onClick={() => closeMore(true)}><X size={17} /></button>
          </header>
          <div className="app-more-panel__content" onClick={event => {
            if (event.target.closest('button, a')) window.requestAnimationFrame(() => setMoreOpen(false));
          }}>{children}</div>
        </section>
      )}

      <nav className="app-floating-nav" aria-label="Navegación principal">
        {items.map(item => <NavigationItem key={item.id} item={item} onSelect={selectItem} />)}
        <button
          ref={triggerRef}
          type="button"
          className="app-floating-nav__item"
          aria-label="Más opciones"
          aria-expanded={moreOpen}
          aria-controls={panelId}
          aria-current={moreActive ? 'page' : undefined}
          data-expanded={moreOpen}
          onClick={() => setMoreOpen(open => !open)}
        >
          <span className="app-floating-nav__icon" aria-hidden="true"><Ellipsis size={21} strokeWidth={1.9} /></span>
          <span className="app-floating-nav__label">Más</span>
        </button>
      </nav>
    </>
  );
}
