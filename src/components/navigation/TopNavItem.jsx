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
};

export function TopNavItem({ Icon, label, active, onClick, tone = 'blue' }) {
  const NavIcon = Icon;
  const styles = toneStyles[tone] || toneStyles.blue;
  return (
    <button onClick={onClick} className={`flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${active ? styles.active : styles.inactive}`}>
      <NavIcon size={17} className={styles.icon} /> {label}
    </button>
  );
}

