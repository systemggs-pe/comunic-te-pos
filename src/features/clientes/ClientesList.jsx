import React, { useState, useMemo } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';

export function ClientesList({ clientes, equipos, registros, ventas = [] }) {
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

  const clientesConVentas = useMemo(() => {
    const mapa = new Map(clientes.map(cliente => [cliente.dni, cliente]));
    ventas.forEach(venta => {
      if (!venta.dniCliente || mapa.has(venta.dniCliente)) return;
      mapa.set(venta.dniCliente, {
        id: venta.dniCliente,
        dni: venta.dniCliente,
        nombre: venta.nombreCliente || '',
        celular: venta.celularCliente || '',
      });
    });
    return Array.from(mapa.values());
  }, [clientes, ventas]);

  const equiposDelCliente = (dni) => {
    const porId = new Map(equipos.filter(e => e.idDuenio === dni).map(e => [e.idEquipo, e]));
    ventas
      .filter(v => v.dniCliente === dni && v.imeiEquipo)
      .forEach(v => {
        if (porId.has(v.imeiEquipo)) return;
        porId.set(v.imeiEquipo, {
          idEquipo: v.imeiEquipo,
          idDuenio: dni,
          imei2: v.imei2Equipo || '',
          sn: v.sn || '',
          marca: v.marcaEquipo || '',
          modelo: v.modeloEquipo || '',
          nombreComercial: v.nombreComercial || '',
          memoria: v.memoria || '',
          color: v.color || '',
          isVendido: true,
        });
      });
    return Array.from(porId.values());
  };

  const filteredClientes = useMemo(() => {
    return clientesConVentas.filter(c => {
      const tieneEquipos = equipos.some(e => e.idDuenio === c.dni);
      const tieneVentas = ventas.some(v => v.dniCliente === c.dni);
      if (!tieneEquipos && !tieneVentas) return false;
      if (!searchTerm) return true;
      return c.dni.includes(searchTerm) || (c.nombre && c.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
    });
  }, [clientesConVentas, equipos, ventas, searchTerm]);

  const initials = (nombre) => {
    if (!nombre) return '?';
    const parts = nombre.trim().split(' ').filter(Boolean);
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].slice(0,2).toUpperCase();
  };

  return (
    <div className="saas-clients-page min-h-full">
      <div className="mb-6">
        <div className="saas-page-header rounded-lg mb-6">
          <div>
            <p className="saas-page-kicker">Clientes</p>
            <h2 className="saas-page-title">Directorio de clientes</h2>
            <p className="saas-page-desc">{filteredClientes.length} cliente{filteredClientes.length !== 1 ? 's' : ''} con equipos activos</p>
          </div>
          <div className="saas-searchbox">
            <input
              type="text"
              placeholder="Buscar por nombre o DNI..."
              className="saas-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search size={18} />
          </div>
        </div>

        {filteredClientes.length === 0 ? (
          <div className="saas-empty py-24">
            <Users size={52} strokeWidth={1.4} />
            <p className="text-base font-semibold">No se encontraron clientes</p>
            <p className="text-sm">Prueba con otro nombre o DNI.</p>
          </div>
        ) : (
          <div className="saas-client-grid">
            {filteredClientes.map(cliente => {
              const eqsRaw = equiposDelCliente(cliente.dni);
              const eqs = agruparEquipos(eqsRaw);
              const isExpanded = expandedId === cliente.dni;
              const totalRegistrados = eqs.filter(eq => imeisRegistrados.has(eq.idEquipo) || (eq.imei2 && imeisRegistrados.has(eq.imei2))).length;
              const totalVendidos = eqs.filter(eq => eq.isVendido).length;

              return (
                <div
                  key={cliente.dni}
                  className="saas-client-card"
                >
                  <div className="p-5">
                    {/* Avatar + nombre */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="saas-avatar">
                        {initials(cliente.nombre)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-800 text-sm leading-tight truncate">{cliente.nombre || 'Cliente sin nombre'}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">DNI {cliente.dni}</p>
                        {cliente.celular && <p className="text-xs text-gray-400 mt-0.5">{cliente.celular}</p>}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex gap-2 mb-4">
                      <div className="saas-stat-pill">
                        <p className="text-base font-bold text-gray-700">{eqs.length}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Equipo{eqs.length !== 1 ? 's' : ''}</p>
                      </div>
                      {totalRegistrados > 0 && (
                        <div className="saas-stat-pill">
                          <p className="text-base font-bold text-gray-700">{totalRegistrados}</p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Registrado{totalRegistrados !== 1 ? 's' : ''}</p>
                        </div>
                      )}
                      {totalVendidos > 0 && (
                        <div className="saas-stat-pill">
                          <p className="text-base font-bold text-gray-700">{totalVendidos}</p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Vendido{totalVendidos !== 1 ? 's' : ''}</p>
                        </div>
                      )}
                    </div>

                    {/* Botón ver equipos */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : cliente.dni)}
                      className="saas-secondary w-full justify-between"
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
                            <div key={eq.idEquipo} className="saas-equipment-row">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <p className="font-semibold text-gray-700 text-xs leading-tight">
                                  {eq.marca} {eq.nombreComercial || eq.modelo}
                                </p>
                                <div className="flex gap-1 shrink-0">
                                  {tieneRegistro && (
                                    <span className="saas-chip saas-chip-success text-[9px]">Lista Blanca</span>
                                  )}
                                  {eq.isVendido && (
                                    <span className="saas-chip text-[9px]">Vendido</span>
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

