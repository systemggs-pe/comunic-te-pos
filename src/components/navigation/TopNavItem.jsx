import React from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';

export function TopNavItem({ Icon, label, active, onClick }) {
  const NavIcon = Icon;
  return (
    <button onClick={onClick} className={`flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${active ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
      <NavIcon size={17} /> {label}
    </button>
  );
}

