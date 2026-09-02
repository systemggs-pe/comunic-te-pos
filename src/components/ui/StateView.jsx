import React from 'react';
import {AlertCircle, Inbox} from 'lucide-react';
import {Button} from './Button.jsx';

export function SkeletonRows({rows = 5, columns = 4, label = 'Cargando contenido'}) {
  return (
    <div className="ui-skeleton-list" role="status" aria-label={label}>
      {Array.from({length: rows}).map((_, row) => (
        <div key={row} className="ui-skeleton-row" style={{'--skeleton-columns': columns}}>
          {Array.from({length: columns}).map((__, column) => <span key={column} />)}
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function StateView({
  tone = 'empty',
  icon: Icon = tone === 'error' ? AlertCircle : Inbox,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <div className={`ui-state-view ui-state-view--${tone} ${className}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="ui-state-view__icon" aria-hidden="true">{React.createElement(Icon, {size: 27})}</span>
      <p className="ui-state-view__title">{title}</p>
      {description && <p className="ui-state-view__description">{description}</p>}
      {actionLabel && onAction && <Button variant="secondary" onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}
