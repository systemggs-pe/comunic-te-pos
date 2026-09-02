import React from 'react';

export function StatusBadge({tone = 'neutral', icon: Icon, children, className = ''}) {
  return (
    <span className={`ui-badge ui-badge--${tone} ${className}`}>
      {Icon && <Icon size={13} aria-hidden="true" />}
      {children}
    </span>
  );
}

