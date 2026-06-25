import React, {useState} from 'react';
import {Check, Crop, Move, X} from 'lucide-react';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function initialCrop(width, height) {
  const size = Math.max(1, Math.round(Math.min(width, height) * 0.82));
  return {
    x: Math.round((width - size) / 2),
    y: Math.round((height - size) / 2),
    width: size,
    height: size,
  };
}

export function ImageCropModal({dataUrl, title = 'Recortar foto', onCancel, onConfirm, onUseOriginal}) {
  const imageRef = React.useRef(null);
  const pointerRef = React.useRef(null);
  const [imageSize, setImageSize] = useState({width: 0, height: 0});
  const [displaySize, setDisplaySize] = useState({width: 0, height: 0});
  const [crop, setCrop] = useState(null);

  const updateDisplaySize = image => {
    const rect = image.getBoundingClientRect();
    setDisplaySize({width: rect.width, height: rect.height});
  };

  const handleImageLoad = event => {
    const img = event.currentTarget;
    const natural = {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
    };
    setImageSize(natural);
    updateDisplaySize(img);
    setCrop(initialCrop(natural.width, natural.height));
  };

  const displayScale = {
    x: imageSize.width / Math.max(1, displaySize.width || imageSize.width),
    y: imageSize.height / Math.max(1, displaySize.height || imageSize.height),
  };

  const cropStyle = crop && imageSize.width && imageSize.height ? {
    left: crop.x * (displaySize.width || imageSize.width) / imageSize.width,
    top: crop.y * (displaySize.height || imageSize.height) / imageSize.height,
    width: crop.width * (displaySize.width || imageSize.width) / imageSize.width,
    height: crop.height * (displaySize.height || imageSize.height) / imageSize.height,
  } : {};

  const startPointer = (event, mode) => {
    if (!crop) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      crop,
    };
  };

  const movePointer = event => {
    const current = pointerRef.current;
    if (!current || !crop) return;

    const dx = (event.clientX - current.startX) * displayScale.x;
    const dy = (event.clientY - current.startY) * displayScale.y;
    const minSize = Math.max(80, Math.min(imageSize.width, imageSize.height) * 0.16);

    setCrop(() => {
      if (current.mode === 'move') {
        return {
          ...current.crop,
          x: clamp(Math.round(current.crop.x + dx), 0, imageSize.width - current.crop.width),
          y: clamp(Math.round(current.crop.y + dy), 0, imageSize.height - current.crop.height),
        };
      }

      return {
        ...current.crop,
        width: clamp(Math.round(current.crop.width + dx), minSize, imageSize.width - current.crop.x),
        height: clamp(Math.round(current.crop.height + dy), minSize, imageSize.height - current.crop.y),
      };
    });
  };

  const endPointer = () => {
    pointerRef.current = null;
  };

  const confirmCrop = () => {
    if (!dataUrl || !crop || !imageSize.width || !imageSize.height) return;
    const image = imageRef.current;
    if (!image) return;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(crop.width));
    canvas.height = Math.max(1, Math.round(crop.height));
    const ctx = canvas.getContext('2d', {alpha: false});
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    onConfirm?.(canvas.toDataURL('image/jpeg', 0.92));
  };

  if (!dataUrl) return null;

  return (
    <div className="saas-modal-backdrop fixed inset-0 z-[240] flex items-center justify-center p-3">
      <div className="saas-detail-modal flex max-h-[96vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <p className="saas-page-kicker">Evidencias</p>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          </div>
          <button type="button" onClick={onCancel} className="saas-form-close" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 bg-slate-950 p-3">
          <div className="relative mx-auto flex max-h-[68vh] min-h-[320px] items-center justify-center overflow-hidden rounded bg-slate-900">
            <img
              ref={imageRef}
              src={dataUrl}
              alt=""
              onLoad={handleImageLoad}
              className="max-h-[68vh] max-w-full select-none object-contain"
              draggable={false}
            />
            {crop && (
              <div
                className="absolute touch-none border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.55)]"
                style={cropStyle}
                onPointerDown={event => startPointer(event, 'move')}
                onPointerMove={movePointer}
                onPointerUp={endPointer}
                onPointerCancel={endPointer}
              >
                <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-700">
                  <Move size={12} />
                  Mover
                </div>
                <button
                  type="button"
                  aria-label="Redimensionar recorte"
                  title="Redimensionar"
                  onPointerDown={event => startPointer(event, 'resize')}
                  onPointerMove={movePointer}
                  onPointerUp={endPointer}
                  onPointerCancel={endPointer}
                  className="absolute bottom-0 right-0 h-8 w-8 translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white bg-blue-600 shadow-lg"
                />
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-2 border-t border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto_auto]">
          <button type="button" onClick={onUseOriginal} className="saas-secondary justify-center">
            Usar sin recortar
          </button>
          <button type="button" onClick={onCancel} className="saas-secondary justify-center">
            <X size={16} /> Cancelar
          </button>
          <button type="button" onClick={confirmCrop} className="saas-primary justify-center">
            <Crop size={16} /> <Check size={16} /> Aplicar recorte
          </button>
        </div>
      </div>
    </div>
  );
}