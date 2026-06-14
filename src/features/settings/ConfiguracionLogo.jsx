import React, { useEffect, useState } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';
import {ConfirmModal} from '../../components/ui/ConfirmModal.jsx';
import {mergeBoletaExtranjeraEmisores} from '../../config/boletaExtranjera.js';

const formatosBoleta = [
  {key: 'formato1', label: 'Boleta 1'},
  {key: 'formato2', label: 'Boleta 2'},
  {key: 'formato3', label: 'Boleta 3'},
];

export function ConfiguracionLogo({ logoVentas, boletaEmisoresConfig, onLogoChange, onBoletaEmisoresChange, showToast }) {
  const [guardando, setGuardando] = useState(false);
  const [guardandoEmisores, setGuardandoEmisores] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [emisoresForm, setEmisoresForm] = useState(() => mergeBoletaExtranjeraEmisores(boletaEmisoresConfig));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEmisoresForm(mergeBoletaExtranjeraEmisores(boletaEmisoresConfig));
  }, [boletaEmisoresConfig]);

  const handleEmisorChange = (formato, campo, value) => {
    setEmisoresForm(prev => ({
      ...prev,
      [formato]: {
        ...prev[formato],
        [campo]: value,
      },
    }));
  };

  const guardarEmisores = async () => {
    setGuardandoEmisores(true);
    try {
      await onBoletaEmisoresChange?.(mergeBoletaExtranjeraEmisores(emisoresForm));
      showToast('Datos de boletas guardados', 'success');
    } catch (error) {
      console.error(error);
      showToast('Error al guardar datos de boletas', 'error');
    } finally {
      setGuardandoEmisores(false);
    }
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Solo se aceptan imágenes.', 'error'); return; }
    if (file.size > 650 * 1024) { showToast('La imagen no debe superar 650KB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      setGuardando(true);
      try {
        await onLogoChange(ev.target.result);
        showToast('Logo guardado en la nube ✓', 'success');
      } catch {
        showToast('Error al guardar el logo', 'error');
      } finally {
        setGuardando(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleEliminar = async () => {
    setGuardando(true);
    try {
      await onLogoChange(null);
      showToast('Logo eliminado ✓', 'success');
      setConfirmarEliminar(false);
    } catch {
      showToast('Error al eliminar el logo', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="saas-settings-page space-y-6">
      <ConfirmModal
        open={confirmarEliminar}
        title="Eliminar logo"
        message="El logo dejara de aparecer en los tickets de venta."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        tone="danger"
        loading={guardando}
        onConfirm={handleEliminar}
        onCancel={() => setConfirmarEliminar(false)}
      />
      <div className="saas-settings-card">
        <div className="saas-form-header">
          <div>
            <p className="saas-page-kicker">Configuración</p>
            <h2 className="saas-page-title flex items-center gap-2">
              <ImagePlus size={20} className="text-blue-600" /> Logo para tickets de venta
            </h2>
            <p className="saas-page-desc">La imagen aparece en la parte superior del ticket PDF y se sincroniza en todos los dispositivos.</p>
          </div>
        </div>
        <div className="p-6">

        {/* Preview */}
        <div className="flex flex-col items-center gap-4 mb-6">
          {logoVentas ? (
            <div className="saas-upload-zone w-full p-4">
              <img src={logoVentas} alt="Logo actual" className="max-h-28 max-w-full object-contain rounded" />
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">✓ Logo guardado en la nube</span>
            </div>
          ) : (
            <div className="saas-upload-zone w-full p-8">
              <ImagePlus size={40} />
              <span className="text-sm">Sin logo configurado</span>
            </div>
          )}
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <label className={`flex-1 ${guardando ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
            <div className="saas-primary w-full">
              {guardando ? 'Guardando...' : logoVentas ? 'Cambiar logo' : 'Subir logo'}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={guardando} />
          </label>
          {logoVentas && (
            <button onClick={() => setConfirmarEliminar(true)} disabled={guardando}
              className="saas-secondary text-red-600 disabled:opacity-50">
              Eliminar
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-3">Formatos: PNG, JPG, WebP · Máximo 650KB · Se guarda en Firebase y aplica en todos los dispositivos.</p>
        </div>
      </div>

      <div className="saas-settings-card">
        <div className="saas-form-header">
          <div>
            <p className="saas-page-kicker">Boleta extranjera</p>
            <h2 className="saas-page-title flex items-center gap-2">
              <FileText size={20} className="text-blue-600" /> Datos del emisor
            </h2>
            <p className="saas-page-desc">Configura el nombre, RUT y direccion que aparecen en cada formato de boleta.</p>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {formatosBoleta.map(({key, label}) => (
            <section key={key} className="grid gap-3 p-5 lg:grid-cols-[150px_1fr_1fr_1fr] lg:items-start">
              <div>
                <p className="text-sm font-semibold text-slate-900">{label}</p>
                <p className="mt-1 text-xs text-slate-500">Se aplica al PDF correspondiente.</p>
              </div>
              <label className="block">
                <span className="block text-xs font-semibold uppercase text-slate-500">Nombre</span>
                <textarea
                  value={emisoresForm[key]?.nombre || ''}
                  onChange={e => handleEmisorChange(key, 'nombre', e.target.value.toUpperCase())}
                  className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold uppercase text-slate-500">RUT</span>
                <input
                  value={emisoresForm[key]?.rut || ''}
                  onChange={e => handleEmisorChange(key, 'rut', e.target.value.toUpperCase())}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold uppercase text-slate-500">Direccion</span>
                <textarea
                  value={emisoresForm[key]?.direccion || ''}
                  onChange={e => handleEmisorChange(key, 'direccion', e.target.value.toUpperCase())}
                  className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </section>
          ))}
        </div>
        <div className="flex justify-end border-t border-slate-100 p-5">
          <button type="button" onClick={guardarEmisores} disabled={guardandoEmisores} className="saas-primary disabled:opacity-60">
            {guardandoEmisores ? 'Guardando...' : 'Guardar datos de boletas'}
          </button>
        </div>
      </div>
    </div>
  );
}

