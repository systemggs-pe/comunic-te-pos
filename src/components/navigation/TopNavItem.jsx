import React from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';

export function TopNavItem({ Icon, label, active, onClick }) {
  const NavIcon = Icon;
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-slate-800 hover:text-white'}`}>
      <NavIcon size={17} /> {label}
    </button>
  );
}

