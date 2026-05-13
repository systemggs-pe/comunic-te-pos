import React from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';

export function MobileNavIcon({ Icon, active, onClick, title }) {
  const NavIcon = Icon;
  return (
    <button onClick={onClick} title={title}
      className={`p-2 rounded-lg transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-slate-800 hover:text-white'}`}>
      <NavIcon size={20} />
    </button>
  );
}

