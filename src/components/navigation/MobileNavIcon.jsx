import React from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';

export function MobileNavIcon({ Icon, active, onClick, title, showLabel = false }) {
  const NavIcon = Icon;
  return (
    <button onClick={onClick} title={title} aria-label={title}
      className={`rounded-lg transition-colors ${showLabel ? 'flex min-w-[72px] flex-col items-center gap-1 px-3 py-2 text-[11px] font-medium' : 'p-2'} ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
      <NavIcon size={20} />
      {showLabel && <span className="leading-none">{title}</span>}
    </button>
  );
}

