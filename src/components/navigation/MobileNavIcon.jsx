import React from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';

const toneStyles = {
  blue: {
    active: 'bg-blue-50 text-blue-700',
    inactive: 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
    icon: '',
  },
  emerald: {
    active: 'bg-emerald-50 text-emerald-700',
    inactive: 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-800',
    icon: 'text-emerald-600',
  },
  amber: {
    active: 'bg-amber-50 text-amber-700',
    inactive: 'text-slate-500 hover:bg-amber-50 hover:text-amber-800',
    icon: 'text-amber-600',
  },
};

export function MobileNavIcon({ Icon, active, onClick, title, showLabel = false, tone = 'blue', className = '' }) {
  const NavIcon = Icon;
  const styles = toneStyles[tone] || toneStyles.blue;
  return (
    <button onClick={onClick} title={title} aria-label={title}
      className={`rounded-md transition-colors ${showLabel ? 'flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 px-1.5 py-1.5 text-[11px] font-semibold leading-tight' : 'p-2'} ${active ? styles.active : styles.inactive} ${className}`}>
      <NavIcon size={showLabel ? 18 : 20} className={styles.icon} />
      {showLabel && <span className="max-w-full truncate leading-tight">{title}</span>}
    </button>
  );
}

