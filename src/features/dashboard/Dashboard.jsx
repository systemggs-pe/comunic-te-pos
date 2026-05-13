import React from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';

export function Dashboard({ stats, setCurrentView, user }) {
  const nombre = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Usuario';
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="min-h-full flex flex-col">
      {/* Hero saludo */}
      <div className="text-center py-10 px-4">
        <p className="text-sm text-gray-400 uppercase tracking-widest mb-1">{saludo}</p>
        <h1 className="text-4xl font-bold text-gray-800 mb-2">{nombre}</h1>
        <p className="text-gray-400 text-sm">Selecciona un módulo para comenzar</p>
      </div>

      {/* Tarjetas de módulos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-2 pb-8">

        {/* Ventas */}
        <div onClick={() => setCurrentView('ventas_list')}
          className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-purple-200 transition-all duration-200 cursor-pointer overflow-hidden">
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center mb-5 group-hover:bg-purple-100 transition-colors">
              <ShoppingCart size={28} className="text-purple-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 mb-1">Ventas (Tienda)</h2>
            <p className="text-sm text-gray-400 mb-6">Punto de venta, accesorios y tickets.</p>
            <div className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
              Ingresar
            </div>
          </div>
          <div className="border-t border-gray-50 px-8 py-3 bg-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-400">Total registradas</span>
            <span className="text-sm font-bold text-gray-700">{stats.ventas}</span>
          </div>
        </div>

        {/* Registros — destacado */}
        <div onClick={() => setCurrentView('registros_list')}
          className="group bg-blue-600 rounded-2xl shadow-md hover:shadow-lg hover:bg-blue-700 transition-all duration-200 cursor-pointer overflow-hidden">
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-5 group-hover:bg-white/30 transition-colors">
              <ClipboardList size={28} className="text-white" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1">Registros (Equipos)</h2>
            <p className="text-sm text-blue-100 mb-6">Gestión de IMEIs y constancias.</p>
            <div className="w-full bg-white text-blue-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-50 transition-colors">
              Ingresar
            </div>
          </div>
          <div className="border-t border-white/10 px-8 py-3 bg-blue-700/40 flex items-center justify-between">
            <span className="text-xs text-blue-200">Total registrados</span>
            <span className="text-sm font-bold text-white">{stats.registros}</span>
          </div>
        </div>

        {/* Clientes */}
        <div onClick={() => setCurrentView('clientes_list')}
          className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-green-200 transition-all duration-200 cursor-pointer overflow-hidden">
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-5 group-hover:bg-green-100 transition-colors">
              <Users size={28} className="text-green-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 mb-1">Directorio Clientes</h2>
            <p className="text-sm text-gray-400 mb-6">Historial unificado y base de datos.</p>
            <div className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
              Ver Clientes
            </div>
          </div>
          <div className="border-t border-gray-50 px-8 py-3 bg-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-400">Total clientes</span>
            <span className="text-sm font-bold text-gray-700">{stats.clientes}</span>
          </div>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="flex justify-center gap-4 pb-10">
        <button onClick={() => setCurrentView('registros_new')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-blue-200 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors">
          <Plus size={16} /> Nuevo Registro
        </button>
        <button onClick={() => setCurrentView('ventas_new')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-purple-200 text-purple-600 text-sm font-medium hover:bg-purple-50 transition-colors">
          <Plus size={16} /> Nueva Venta
        </button>
      </div>

      {/* Footer */}
      <div className="mt-auto text-center pb-6">
        <p className="text-xs text-gray-300 font-medium">v3.0.0 · Creado por Brand Daniel Peralta Rodriguez</p>
        <p className="text-xs text-gray-300">SOPORTE +51 946 007 646 · <span className="text-blue-400">brand050103@gmail.com</span></p>
      </div>
    </div>
  );
}

