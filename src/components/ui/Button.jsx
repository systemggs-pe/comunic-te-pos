import React from 'react';

const join = (...parts) => parts.filter(Boolean).join(' ');

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  loadingLabel = 'Procesando...',
  className = '',
  disabled,
  children,
  ...props
}) {
  return (
    <button
      type="button"
      className={join('ui-button', `ui-button--${variant}`, `ui-button--${size}`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span className="ui-button__spinner" aria-hidden="true" />}
      {loading ? loadingLabel : children}
    </button>
  );
}

export function IconButton({label, tone = 'neutral', size = 'md', className = '', children, ...props}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={join('ui-icon-button', `ui-icon-button--${tone}`, `ui-icon-button--${size}`, className)}
      {...props}
    >
      {children}
    </button>
  );
}

