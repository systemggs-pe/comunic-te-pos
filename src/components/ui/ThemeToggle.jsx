import React, {useEffect, useState} from 'react';
import {Moon, Sun} from 'lucide-react';
import {IconButton} from './Button.jsx';

const THEME_KEY = 'comunicate_theme';

function initialTheme() {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle({className = '', presentation = 'icon'}) {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  if (presentation === 'menu') {
    return (
      <button type="button" className={`app-more-item ${className}`} onClick={() => setTheme(nextTheme)}>
        <span className="app-more-item__icon" aria-hidden="true">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</span>
        <span className="app-more-item__copy"><span>Apariencia</span><small>Cambiar a modo {nextTheme === 'dark' ? 'oscuro' : 'claro'}</small></span>
        <span className="app-more-item__value">{theme === 'dark' ? 'Oscuro' : 'Claro'}</span>
      </button>
    );
  }
  return (
    <IconButton
      label={`Cambiar a modo ${nextTheme === 'dark' ? 'oscuro' : 'claro'}`}
      className={className}
      onClick={() => setTheme(nextTheme)}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </IconButton>
  );
}
