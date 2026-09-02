import React from 'react';

export function PageHeader({eyebrow, title, description, meta, actions, icon: Icon, className = ''}) {
  return (
    <header className={`ui-page-header ${className}`}>
      <div className="ui-page-header__identity">
        {Icon && <span className="ui-page-header__icon" aria-hidden="true"><Icon size={19} /></span>}
        <div className="min-w-0">
          {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}
          <div className="ui-page-header__title-row">
            <h1 className="ui-page-title">{title}</h1>
            {meta && <span className="ui-page-header__meta">{meta}</span>}
          </div>
          {description && <p className="ui-page-description">{description}</p>}
        </div>
      </div>
      {actions && <div className="ui-page-actions">{actions}</div>}
    </header>
  );
}

export function SearchField({label = 'Buscar', className = '', inputClassName = '', ...props}) {
  return (
    <label className={`ui-search-field ${className}`}>
      <span className="sr-only">{label}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="ui-search-field__icon">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input aria-label={label} className={`ui-search-field__input ${inputClassName}`} {...props} />
    </label>
  );
}

