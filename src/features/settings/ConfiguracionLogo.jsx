import React, { useState } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';

export function ConfiguracionLogo({ logoVentas, onLogoChange, showToast }) {
  const [guardando, setGuardando] = useState(false);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Solo se aceptan imágenes.', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { showToast('La imagen no debe superar 2MB.', 'error'); return; }
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
    if (!window.confirm('¿Eliminar el logo?')) return;
    setGuardando(true);
    try {
      await onLogoChange(null);
      showToast('Logo eliminado ✓', 'success');
    } catch {
      showToast('Error al eliminar el logo', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
          <ImagePlus size={20} className="text-blue-600" /> Logo para Tickets de Venta
        </h2>
        <p className="text-xs text-gray-400 mb-6">La imagen aparecerá en la parte superior del ticket PDF al imprimir una venta. Se sincroniza en todos los dispositivos.</p>

        {/* Preview */}
        <div className="flex flex-col items-center gap-4 mb-6">
          {logoVentas ? (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 w-full flex flex-col items-center gap-3 bg-gray-50">
              <img src={logoVentas} alt="Logo actual" className="max-h-28 max-w-full object-contain rounded" />
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">✓ Logo guardado en la nube</span>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 w-full flex flex-col items-center gap-2 bg-gray-50 text-gray-300">
              <ImagePlus size={40} />
              <span className="text-sm">Sin logo configurado</span>
            </div>
          )}
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <label className={`flex-1 ${guardando ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
            <div className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold text-center transition-colors">
              {guardando ? '⏳ Guardando...' : logoVentas ? '🔄 Cambiar logo' : '📁 Subir logo'}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={guardando} />
          </label>
          {logoVentas && (
            <button onClick={handleEliminar} disabled={guardando}
              className="px-4 py-2.5 border border-red-200 text-red-500 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              Eliminar
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-3">Formatos: PNG, JPG, WebP · Máximo 2MB · Se guarda en Firebase y aplica en todos los dispositivos.</p>
      </div>
    </div>
  );
}

