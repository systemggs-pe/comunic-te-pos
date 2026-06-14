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
};

export function MobileNavIcon({ Icon, active, onClick, title, showLabel = false, tone = 'blue' }) {
  const NavIcon = Icon;
  const styles = toneStyles[tone] || toneStyles.blue;
  return (
    <button onClick={onClick} title={title} aria-label={title}
      className={`rounded-md transition-colors ${showLabel ? 'flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-1 text-[9px] font-semibold' : 'p-2'} ${active ? styles.active : styles.inactive}`}>
      <NavIcon size={showLabel ? 16 : 20} className={styles.icon} />
      {showLabel && <span className="max-w-full truncate leading-none">{title}</span>}
    </button>
  );
}

