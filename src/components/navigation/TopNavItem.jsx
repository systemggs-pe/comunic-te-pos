import React from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';

const toneStyles = {
  blue: {
    active: 'border-blue-200 bg-blue-50 text-blue-700',
    inactive: 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    icon: '',
  },
  emerald: {
    active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    inactive: 'border-transparent text-slate-600 hover:bg-emerald-50 hover:text-emerald-800',
    icon: 'text-emerald-600',
  },
  amber: {
    active: 'border-amber-200 bg-amber-50 text-amber-700',
    inactive: 'border-transparent text-slate-600 hover:bg-amber-50 hover:text-amber-800',
    icon: 'text-amber-600',
  },
};

export function TopNavItem({ Icon, label, active, onClick, tone = 'blue', iconOnly = false, className = '' }) {
  const NavIcon = Icon;
  const styles = toneStyles[tone] || toneStyles.blue;
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex items-center whitespace-nowrap rounded-lg border text-sm font-medium transition-colors ${iconOnly ? 'h-9 w-9 justify-center p-0' : 'gap-2 px-3 py-1.5'} ${active ? styles.active : styles.inactive} ${className}`}
    >
      <NavIcon size={18} className={styles.icon} />
      {!iconOnly && label}
    </button>
  );
}

