import React from 'react';
import {luhn} from '../../utils/imei.js';

export function ClienteEquiposSelector({lookup, selectedImei, isRegistered, onSelect}) {
  const {equipos, loading, error, nextCursor, registrationStatusComplete, loadMore, retry} = lookup;
  return (
    <section aria-label="Equipos del cliente" className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <div>
        <h5 className="text-sm font-semibold text-slate-800">Equipos vinculados a este documento</h5>
        <p className="mt-1 text-xs text-slate-600">Ventas y registros anteriores. Elige el IMEI que quieres registrar.</p>
      </div>
      {loading && <p role="status" className="text-sm text-blue-700">Buscando equipos y comprobando IMEI…</p>}
      {error && <div role="alert" className="text-sm text-red-700">{error} <button type="button" onClick={retry} className="underline">Reintentar consulta</button></div>}
      {!registrationStatusComplete && <p role="alert" className="text-sm text-amber-800">No se pudo verificar todo el historial de IMEI. No selecciones un equipo hasta completar la verificación.</p>}
      {!loading && !error && equipos.length === 0 && <p className="text-sm text-slate-600">No hay equipos vinculados a este documento. Puedes ingresar los datos de otro equipo.</p>}
      <div className="space-y-2">
        {equipos.map(eq => (
          <div key={eq.idEquipo} className="rounded border border-slate-200 bg-white p-3">
            <p className="text-sm font-semibold text-slate-800">{eq.nombreComercial || eq.modelo || 'Equipo sin modelo guardado'}</p>
            <p className="mt-0.5 text-xs text-slate-500">{[eq.marca, eq.nombreComercial && eq.modelo, eq.color, eq.memoria && `${eq.memoria} GB`].filter(Boolean).join(' · ')}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {[eq.idEquipo, eq.imei2].map((imei, index) => {
                if (!imei) return null;
                const active = isRegistered(imei);
                const valid = /^\d{15}$/.test(imei) && luhn(imei) && !/^(\d)\1{14}$/.test(imei);
                const disabled = active || !valid || loading || Boolean(error) || !registrationStatusComplete;
                const selected = selectedImei === imei;
                return <button key={imei} type="button" disabled={disabled} aria-pressed={selected}
                  onClick={() => onSelect(eq, imei)}
                  className={`min-h-11 rounded border px-3 py-2 text-left text-xs disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${selected ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-700 enabled:hover:border-blue-400'}`}>
                  <span className="font-semibold">IMEI {index + 1}</span> <span className="font-mono">{imei}</span>
                  <span className="mt-1 block">{active ? 'Ya tiene registro activo' : !valid ? 'IMEI guardado inválido: revisar' : selected ? 'Seleccionado para registrar' : 'Elegir este IMEI'}</span>
                </button>;
              })}
            </div>
          </div>
        ))}
      </div>
      {nextCursor && <button type="button" onClick={loadMore} disabled={loading} className="saas-secondary disabled:opacity-50">Cargar más equipos</button>}
    </section>
  );
}
