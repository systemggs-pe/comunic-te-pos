import React, { useState } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';
import {ConfirmModal} from '../../components/ui/ConfirmModal.jsx';

export function ConfiguracionLogo({ logoVentas, onLogoChange, showToast }) {
  const [guardando, setGuardando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

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
    </div>
  );
}

