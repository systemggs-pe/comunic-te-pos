import React, { useEffect } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';

export function TicketRegistroImpresion({ data, onClose }) {
  useEffect(() => { window.print(); }, []);
  return (
    <div className="fixed inset-0 bg-white z-[100] flex justify-center items-start overflow-auto p-4 md:p-10 print:p-0 print:bg-transparent">
      <button onClick={onClose} className="absolute top-4 right-4 bg-gray-200 p-2 rounded-full print:hidden"><X size={24} /></button>
      <div className="w-[181px] bg-white text-black font-mono text-[10px] leading-tight mx-auto print:m-0 print:absolute print:top-0 print:left-0">
        <div className="text-center mb-2"><p className="font-bold text-[12px]">TICKET DE REGISTRO</p><p>NUMERO = {data.nRegistro}</p></div>
        <p className="text-center">------------------------</p>
        <div className="mb-2"><p>NOMBRE: {data.nombreCliente}</p><p>DNI: {data.dniCliente}</p><p>IMEI: {data.imeiEquipo}</p></div>
        <p className="text-center">------------------------</p>
        <div className="text-center mb-2"><p>{new Date(data.fecha).toLocaleDateString()}</p></div>
        <div className="h-8"></div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `@media print { body > *:not(.fixed) { display: none !important; } .print\\:hidden { display: none !important; } @page { margin: 0; size: 48mm auto; } }`}} />
    </div>
  );
}

