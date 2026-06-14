import React, {useId} from 'react';
import {AlertCircle, X} from 'lucide-react';
import {Dialog} from './Dialog.jsx';

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'blue',
  loading = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const closeModal = () => {
    if (!loading) onCancel?.();
  };

  if (!open) return null;

  const toneClass = tone === 'danger'
    ? 'border-red-100 bg-red-50 text-red-700'
    : 'border-blue-100 bg-blue-50 text-blue-700';
  const buttonClass = tone === 'danger'
    ? 'inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60'
    : 'saas-primary disabled:opacity-60';

  return (
    <Dialog
      open={open}
      onClose={closeModal}
      titleId={titleId}
      descriptionId={message ? descriptionId : undefined}
      className="saas-detail-modal w-full max-w-sm p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${toneClass}`}>
          <AlertCircle size={20} />
        </div>
        <button type="button" onClick={closeModal} disabled={loading} className="saas-form-close disabled:opacity-50" aria-label="Cerrar dialogo">
          <X size={18}/>
        </button>
      </div>
      <h3 id={titleId} className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      {message && <p id={descriptionId} className="mt-2 text-sm leading-5 text-slate-500">{message}</p>}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={closeModal} disabled={loading} className="saas-secondary disabled:opacity-50">{cancelLabel}</button>
        <button type="button" onClick={onConfirm} disabled={loading} className={buttonClass}>
          {loading ? 'Procesando...' : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
