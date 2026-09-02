import React, {useId} from 'react';
import {AlertCircle, X} from 'lucide-react';
import {Dialog} from './Dialog.jsx';
import {Button, IconButton} from './Button.jsx';

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

  const toneClass = tone === 'danger' ? 'ui-badge--danger' : 'ui-badge--accent';

  return (
    <Dialog
      open={open}
      onClose={closeModal}
      titleId={titleId}
      descriptionId={message ? descriptionId : undefined}
      className="ui-dialog max-w-sm p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className={`ui-badge ${toneClass} h-10 w-10 justify-center p-0`}>
          <AlertCircle size={20} />
        </div>
        <IconButton label="Cerrar dialogo" onClick={closeModal} disabled={loading}>
          <X size={18}/>
        </IconButton>
      </div>
      <h3 id={titleId} className="mt-4 text-base font-semibold text-[var(--ui-text)]">{title}</h3>
      {message && <p id={descriptionId} className="mt-2 text-sm leading-5 text-[var(--ui-text-secondary)]">{message}</p>}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button onClick={closeModal} disabled={loading}>{cancelLabel}</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}
