import React, { useState, useMemo } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';

export function ClientesList({ clientes, equipos, registros }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  // Fuente de verdad: qué IMEIs tienen al menos 1 registro activo
  const imeisRegistrados = useMemo(() => {
    const set = new Set();
    registros.forEach(r => {
      // Solo el IMEI específico que se registró
      if (r.imeiRegistrado) set.add(r.imeiRegistrado);
    });
    return set;
  }, [registros]);

  // Agrupa los documentos de equipos que son el mismo físico:
  // - Si doc A tiene imei2 === idEquipo de doc B, son el mismo equipo → fusionar en uno
  const agruparEquipos = (eqs) => {
    const vistos = new Set();
    const grupos = [];
    for (const eq of eqs) {
      if (vistos.has(eq.idEquipo)) continue;
      // Detectar gemelo por: imei2 cruzado O mismo S/N (mismo equipo físico con 2 docs)
      const gemelo = eqs.find(e =>
        e.idEquipo !== eq.idEquipo &&
        !vistos.has(e.idEquipo) &&
        (
          (eq.imei2 && e.idEquipo === eq.imei2) ||   // el imei2 de eq es el idEquipo del otro
          (e.imei2  && eq.idEquipo === e.imei2)  ||   // el imei2 del otro apunta a eq
          (eq.sn && e.sn && eq.sn === e.sn)           // mismo número de serie → mismo físico
        )
      );
      if (gemelo) {
        // El principal es el que ya tiene imei2, o el de IMEI numéricamente menor
        const principal = eq.imei2 ? eq : gemelo.imei2 ? gemelo : (eq.idEquipo < gemelo.idEquipo ? eq : gemelo);
        const secundario = principal === eq ? gemelo : eq;
        grupos.push({
          ...principal,
          imei2: principal.imei2 || secundario.idEquipo,
          sn: principal.sn || secundario.sn,
          imei1Registrado: principal.imei1Registrado || principal.isRegistrado || false,
          imei2Registrado: secundario.imei2Registrado || secundario.imei1Registrado || secundario.isRegistrado || false,
          isRegistrado: principal.isRegistrado || secundario.isRegistrado,
          isVendido: principal.isVendido || secundario.isVendido,
        });
        vistos.add(principal.idEquipo);
        vistos.add(secundario.idEquipo);
      } else {
        grupos.push(eq);
        vistos.add(eq.idEquipo);
      }
    }
    return grupos;
  };

  const filteredClientes = useMemo(() => {
    return clientes.filter(c => {
      // Solo mostrar clientes que tienen al menos 1 equipo activo
      const tieneEquipos = equipos.some(e => e.idDuenio === c.dni);
      if (!tieneEquipos) return false;
      if (!searchTerm) return true;
      return c.dni.includes(searchTerm) || (c.nombre && c.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
    });
  }, [clientes, equipos, searchTerm]);

  const initials = (nombre) => {
    if (!nombre) return '?';
    const parts = nombre.trim().split(' ').filter(Boolean);
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].slice(0,2).toUpperCase();
  };

  return (
    <div className="min-h-full">
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Directorio de Clientes</h2>
            <p className="text-sm text-gray-400 mt-0.5">{filteredClientes.length} cliente{filteredClientes.length !== 1 ? 's' : ''} con equipos activos</p>
          </div>
          <div className="relative w-full md:w-80">
            <input
              type="text"
              placeholder="Buscar por nombre o DNI..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-300 focus:outline-none bg-white shadow-sm text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          </div>
        </div>

        {filteredClientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Users size={56} strokeWidth={1} className="mb-4 text-gray-200" />
            <p className="text-base font-medium text-gray-400">No se encontraron clientes</p>
            <p className="text-sm text-gray-300 mt-1">Prueba con otro nombre o DNI</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredClientes.map(cliente => {
              const eqsRaw = equipos.filter(e => e.idDuenio === cliente.dni);
              const eqs = agruparEquipos(eqsRaw);
              const isExpanded = expandedId === cliente.dni;
              const totalRegistrados = eqs.filter(eq => imeisRegistrados.has(eq.idEquipo) || (eq.imei2 && imeisRegistrados.has(eq.imei2))).length;
              const totalVendidos = eqs.filter(eq => eq.isVendido).length;

              return (
                <div
                  key={cliente.dni}
                  className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-100 overflow-hidden"
                >
                  <div className="p-5">
                    {/* Avatar + nombre */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm shrink-0 border border-gray-200">
                        {initials(cliente.nombre)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-800 text-sm leading-tight truncate">{cliente.nombre}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">DNI {cliente.dni}</p>
                        {cliente.celular && <p className="text-xs text-gray-400 mt-0.5">{cliente.celular}</p>}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex gap-2 mb-4">
                      <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2 text-center border border-gray-100">
                        <p className="text-base font-bold text-gray-700">{eqs.length}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Equipo{eqs.length !== 1 ? 's' : ''}</p>
                      </div>
                      {totalRegistrados > 0 && (
                        <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2 text-center border border-gray-100">
                          <p className="text-base font-bold text-gray-700">{totalRegistrados}</p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Registrado{totalRegistrados !== 1 ? 's' : ''}</p>
                        </div>
                      )}
                      {totalVendidos > 0 && (
                        <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2 text-center border border-gray-100">
                          <p className="text-base font-bold text-gray-700">{totalVendidos}</p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Vendido{totalVendidos !== 1 ? 's' : ''}</p>
                        </div>
                      )}
                    </div>

                    {/* Botón ver equipos */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : cliente.dni)}
                      className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors duration-150"
                    >
                      <span>{isExpanded ? 'Ocultar equipos' : `Ver ${eqs.length} equipo${eqs.length !== 1 ? 's' : ''}`}</span>
                      <ChevronDown size={15} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Equipos expandidos */}
                    {isExpanded && (
                      <div className="mt-3 space-y-2">
                        {eqs.map(eq => {
                          const imei1Reg = imeisRegistrados.has(eq.idEquipo);
                          const imei2Reg = eq.imei2 && imeisRegistrados.has(eq.imei2);
                          const tieneRegistro = imei1Reg || imei2Reg;
                          return (
                            <div key={eq.idEquipo} className="rounded-xl p-3 border border-gray-100 bg-gray-50">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <p className="font-semibold text-gray-700 text-xs leading-tight">
                                  {eq.marca} {eq.nombreComercial || eq.modelo}
                                </p>
                                <div className="flex gap-1 shrink-0">
                                  {tieneRegistro && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 font-semibold uppercase tracking-wide">Lista Blanca</span>
                                  )}
                                  {eq.isVendido && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 font-semibold uppercase tracking-wide">Vendido</span>
                                  )}
                                </div>
                              </div>
                              {eq.modelo && eq.nombreComercial && (
                                <p className="text-[10px] text-gray-400 mb-1.5">{eq.modelo}</p>
                              )}
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-gray-400 w-12 shrink-0">IMEI 1</span>
                                  <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${imei1Reg ? 'bg-gray-800 text-white font-semibold' : 'text-gray-500'}`}>
                                    {imei1Reg && '✓ '}{eq.idEquipo}
                                  </span>
                                </div>
                                {eq.imei2 && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-gray-400 w-12 shrink-0">IMEI 2</span>
                                    <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${imei2Reg ? 'bg-gray-800 text-white font-semibold' : 'text-gray-500'}`}>
                                      {imei2Reg && '✓ '}{eq.imei2}
                                    </span>
                                  </div>
                                )}
                                {eq.sn && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-gray-400 w-12 shrink-0">S/N</span>
                                    <span className="text-[10px] font-mono text-gray-500">{eq.sn}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

