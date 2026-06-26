import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Check, Crop, Maximize2, RotateCcw, RotateCw, X} from 'lucide-react';

const HANDLE_SIZE = 28;
const MIN_CROP_SIZE = 60;
const OUTPUT_TYPE = 'image/jpeg';
const OUTPUT_QUALITY = 0.92;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const numberOr = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

function initialCrop(width, height) {
  const cropWidth = Math.max(MIN_CROP_SIZE, Math.round(width * 0.82));
  const cropHeight = Math.max(MIN_CROP_SIZE, Math.round(height * 0.82));
  return {
    x: Math.round((width - cropWidth) / 2),
    y: Math.round((height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  };
}

function cropForRatio(width, height, ratio) {
  if (!ratio) return initialCrop(width, height);
  let cropWidth = Math.round(width * 0.86);
  let cropHeight = Math.round(cropWidth / ratio);
  if (cropHeight > height * 0.86) {
    cropHeight = Math.round(height * 0.86);
    cropWidth = Math.round(cropHeight * ratio);
  }
  return {
    x: Math.round((width - cropWidth) / 2),
    y: Math.round((height - cropHeight) / 2),
    width: Math.max(MIN_CROP_SIZE, cropWidth),
    height: Math.max(MIN_CROP_SIZE, cropHeight),
  };
}

function rotatedSize(imageSize, rotation) {
  if (rotation % 180 === 0) return imageSize;
  return {width: imageSize.height, height: imageSize.width};
}

function drawImageRotated(ctx, image, rotation, x, y, width, height) {
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  ctx.save();
  if (rotation === 90) {
    ctx.translate(x + width, y);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(image, 0, 0, naturalWidth, naturalHeight, 0, 0, height, width);
  } else if (rotation === 180) {
    ctx.translate(x + width, y + height);
    ctx.rotate(Math.PI);
    ctx.drawImage(image, 0, 0, naturalWidth, naturalHeight, 0, 0, width, height);
  } else if (rotation === 270) {
    ctx.translate(x, y + height);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(image, 0, 0, naturalWidth, naturalHeight, 0, 0, height, width);
  } else {
    ctx.drawImage(image, 0, 0, naturalWidth, naturalHeight, x, y, width, height);
  }
  ctx.restore();
}

function createRotatedCanvas(image, rotation, imageSize) {
  const oriented = rotatedSize(imageSize, rotation);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(oriented.width));
  canvas.height = Math.max(1, Math.round(oriented.height));
  const ctx = canvas.getContext('2d', {alpha: false});
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawImageRotated(ctx, image, rotation, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function resizeCropFromHandle(startCrop, handle, dx, dy, bounds) {
  let left = startCrop.x;
  let top = startCrop.y;
  let right = startCrop.x + startCrop.width;
  let bottom = startCrop.y + startCrop.height;

  if (handle.includes('w')) left = clamp(left + dx, 0, right - MIN_CROP_SIZE);
  if (handle.includes('e')) right = clamp(right + dx, left + MIN_CROP_SIZE, bounds.width);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - MIN_CROP_SIZE);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + MIN_CROP_SIZE, bounds.height);

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
  };
}

export function ImageCropModal({dataUrl, title = 'Recortar foto', onCancel, onConfirm, onUseOriginal}) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const pointerRef = useRef(null);
  const layoutRef = useRef({scale: 1, x: 0, y: 0, width: 0, height: 0});

  const [loadError, setLoadError] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [imageSize, setImageSize] = useState({width: 0, height: 0});
  const [canvasSize, setCanvasSize] = useState({width: 320, height: 420});
  const [crop, setCrop] = useState(null);

  const orientedSize = useMemo(() => rotatedSize(imageSize, rotation), [imageSize, rotation]);
  const isReady = Boolean(imageSize.width && orientedSize.width && orientedSize.height && crop);

  useEffect(() => {
    if (!dataUrl) return undefined;
    let cancelled = false;
    const resetTimer = window.setTimeout(() => {
      if (cancelled) return;
      setLoadError(false);
      setRotation(0);
      setImageSize({width: 0, height: 0});
      setCrop(null);
    }, 0);

    const image = new Image();
    image.onload = async () => {
      if (cancelled) return;
      try {
        await image.decode?.();
      } catch {
        // Safari can reject decode on already-loaded data URLs; onload is enough.
      }
      if (cancelled) return;
      const nextSize = {
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      };
      imageRef.current = image;
      setImageSize(nextSize);
      setCrop(initialCrop(nextSize.width, nextSize.height));
    };
    image.onerror = () => {
      if (cancelled) return;
      imageRef.current = null;
      setLoadError(true);
    };
    image.src = dataUrl;

    return () => {
      cancelled = true;
      window.clearTimeout(resetTimer);
    };
  }, [dataUrl]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const update = () => {
      const rect = stage.getBoundingClientRect();
      setCanvasSize({
        width: Math.max(280, Math.round(rect.width)),
        height: Math.max(280, Math.round(rect.height)),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !orientedSize.width || !orientedSize.height) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvasSize.width * dpr);
    canvas.height = Math.round(canvasSize.height * dpr);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;

    const ctx = canvas.getContext('2d', {alpha: false});
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    const scale = Math.min(
      canvasSize.width / orientedSize.width,
      canvasSize.height / orientedSize.height,
    );
    const imageWidth = orientedSize.width * scale;
    const imageHeight = orientedSize.height * scale;
    const imageX = (canvasSize.width - imageWidth) / 2;
    const imageY = (canvasSize.height - imageHeight) / 2;
    layoutRef.current = {scale, x: imageX, y: imageY, width: imageWidth, height: imageHeight};

    drawImageRotated(ctx, image, rotation, imageX, imageY, imageWidth, imageHeight);

    if (!crop) return;
    const cropScreen = {
      x: imageX + crop.x * scale,
      y: imageY + crop.y * scale,
      width: crop.width * scale,
      height: crop.height * scale,
    };

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.62)';
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
    ctx.clearRect(cropScreen.x, cropScreen.y, cropScreen.width, cropScreen.height);
    ctx.beginPath();
    ctx.rect(cropScreen.x, cropScreen.y, cropScreen.width, cropScreen.height);
    ctx.clip();
    drawImageRotated(ctx, image, rotation, imageX, imageY, imageWidth, imageHeight);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropScreen.x, cropScreen.y, cropScreen.width, cropScreen.height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i += 1) {
      const x = cropScreen.x + (cropScreen.width * i) / 3;
      const y = cropScreen.y + (cropScreen.height * i) / 3;
      ctx.beginPath();
      ctx.moveTo(x, cropScreen.y);
      ctx.lineTo(x, cropScreen.y + cropScreen.height);
      ctx.moveTo(cropScreen.x, y);
      ctx.lineTo(cropScreen.x + cropScreen.width, y);
      ctx.stroke();
    }

    const handles = [
      [cropScreen.x, cropScreen.y],
      [cropScreen.x + cropScreen.width / 2, cropScreen.y],
      [cropScreen.x + cropScreen.width, cropScreen.y],
      [cropScreen.x, cropScreen.y + cropScreen.height / 2],
      [cropScreen.x + cropScreen.width, cropScreen.y + cropScreen.height / 2],
      [cropScreen.x, cropScreen.y + cropScreen.height],
      [cropScreen.x + cropScreen.width / 2, cropScreen.y + cropScreen.height],
      [cropScreen.x + cropScreen.width, cropScreen.y + cropScreen.height],
    ];
    ctx.fillStyle = '#2563eb';
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    handles.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }, [canvasSize.height, canvasSize.width, crop, orientedSize.height, orientedSize.width, rotation]);

  useEffect(() => {
    draw();
  }, [draw]);

  const screenToImage = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const layout = layoutRef.current;
    if (!rect) return {x: 0, y: 0};
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return {
      x: clamp((screenX - layout.x) / Math.max(layout.scale, 0.0001), 0, orientedSize.width),
      y: clamp((screenY - layout.y) / Math.max(layout.scale, 0.0001), 0, orientedSize.height),
      screenX,
      screenY,
    };
  }, [orientedSize.height, orientedSize.width]);

  const getPointerMode = useCallback((screenX, screenY) => {
    if (!crop) return {mode: 'draw', handle: 'se'};
    const layout = layoutRef.current;
    const scale = layout.scale;
    const rect = {
      x: layout.x + crop.x * scale,
      y: layout.y + crop.y * scale,
      width: crop.width * scale,
      height: crop.height * scale,
    };
    const points = [
      ['nw', rect.x, rect.y],
      ['n', rect.x + rect.width / 2, rect.y],
      ['ne', rect.x + rect.width, rect.y],
      ['w', rect.x, rect.y + rect.height / 2],
      ['e', rect.x + rect.width, rect.y + rect.height / 2],
      ['sw', rect.x, rect.y + rect.height],
      ['s', rect.x + rect.width / 2, rect.y + rect.height],
      ['se', rect.x + rect.width, rect.y + rect.height],
    ];
    const close = points.find(([, x, y]) => Math.abs(screenX - x) <= HANDLE_SIZE && Math.abs(screenY - y) <= HANDLE_SIZE);
    if (close) return {mode: 'resize', handle: close[0]};

    const inside = screenX >= rect.x && screenX <= rect.x + rect.width && screenY >= rect.y && screenY <= rect.y + rect.height;
    return inside ? {mode: 'move', handle: 'move'} : {mode: 'draw', handle: 'se'};
  }, [crop]);

  const handlePointerDown = event => {
    if (!isReady) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = screenToImage(event.clientX, event.clientY);
    const mode = getPointerMode(point.screenX, point.screenY);
    pointerRef.current = {
      ...mode,
      startX: point.x,
      startY: point.y,
      crop,
    };
    if (mode.mode === 'draw') {
      setCrop({x: Math.round(point.x), y: Math.round(point.y), width: MIN_CROP_SIZE, height: MIN_CROP_SIZE});
    }
  };

  const handlePointerMove = event => {
    const current = pointerRef.current;
    if (!current || !crop) return;
    event.preventDefault();
    const point = screenToImage(event.clientX, event.clientY);
    const dx = point.x - current.startX;
    const dy = point.y - current.startY;

    if (current.mode === 'move') {
      setCrop({
        ...current.crop,
        x: Math.round(clamp(current.crop.x + dx, 0, orientedSize.width - current.crop.width)),
        y: Math.round(clamp(current.crop.y + dy, 0, orientedSize.height - current.crop.height)),
      });
      return;
    }

    if (current.mode === 'draw') {
      const left = clamp(Math.min(current.startX, point.x), 0, orientedSize.width - MIN_CROP_SIZE);
      const top = clamp(Math.min(current.startY, point.y), 0, orientedSize.height - MIN_CROP_SIZE);
      const right = clamp(Math.max(current.startX, point.x), left + MIN_CROP_SIZE, orientedSize.width);
      const bottom = clamp(Math.max(current.startY, point.y), top + MIN_CROP_SIZE, orientedSize.height);
      setCrop({x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top)});
      return;
    }

    setCrop(resizeCropFromHandle(current.crop, current.handle, dx, dy, orientedSize));
  };

  const endPointer = event => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    pointerRef.current = null;
  };

  const setCropSize = (nextWidth, nextHeight) => {
    if (!crop || !orientedSize.width || !orientedSize.height) return;
    const width = clamp(Math.round(numberOr(nextWidth, crop.width)), MIN_CROP_SIZE, orientedSize.width);
    const height = clamp(Math.round(numberOr(nextHeight, crop.height)), MIN_CROP_SIZE, orientedSize.height);
    const centerX = crop.x + crop.width / 2;
    const centerY = crop.y + crop.height / 2;
    setCrop({
      x: clamp(Math.round(centerX - width / 2), 0, orientedSize.width - width),
      y: clamp(Math.round(centerY - height / 2), 0, orientedSize.height - height),
      width,
      height,
    });
  };

  const applyRatio = ratio => {
    if (!orientedSize.width || !orientedSize.height) return;
    setCrop(cropForRatio(orientedSize.width, orientedSize.height, ratio));
  };

  const rotateImage = direction => {
    const nextRotation = (rotation + (direction === 'right' ? 90 : -90) + 360) % 360;
    const nextSize = rotatedSize(imageSize, nextRotation);
    setRotation(nextRotation);
    if (nextSize.width && nextSize.height) setCrop(initialCrop(nextSize.width, nextSize.height));
  };

  const exportFullImage = () => {
    const image = imageRef.current;
    if (!image || !imageSize.width || !imageSize.height) return dataUrl;
    if (rotation === 0) return dataUrl;
    return createRotatedCanvas(image, rotation, imageSize).toDataURL(OUTPUT_TYPE, OUTPUT_QUALITY);
  };

  const confirmCrop = () => {
    const image = imageRef.current;
    if (!image || !crop || !imageSize.width || !imageSize.height) return;

    const rotatedCanvas = createRotatedCanvas(image, rotation, imageSize);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(crop.width));
    canvas.height = Math.max(1, Math.round(crop.height));
    const ctx = canvas.getContext('2d', {alpha: false});
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      rotatedCanvas,
      Math.round(crop.x),
      Math.round(crop.y),
      Math.round(crop.width),
      Math.round(crop.height),
      0,
      0,
      canvas.width,
      canvas.height,
    );
    onConfirm?.(canvas.toDataURL(OUTPUT_TYPE, OUTPUT_QUALITY));
  };

  if (!dataUrl) return null;

  return (
    <div className="fixed inset-0 z-[240] flex h-[100dvh] flex-col bg-slate-950 text-slate-100 sm:p-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-950 sm:rounded-lg sm:border sm:border-slate-800" role="dialog" aria-modal="true" aria-labelledby="crop-modal-title">
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 sm:px-4">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase text-slate-400">Evidencias</p>
            <h3 id="crop-modal-title" className="truncate text-sm font-semibold text-slate-50 sm:text-base">{title}</h3>
          </div>
          <button type="button" onClick={onCancel} className="inline-flex h-11 w-11 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-100" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div ref={stageRef} className="relative min-h-0 flex-1 touch-none select-none bg-slate-950">
          {loadError ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm font-semibold text-slate-300">
              No se pudo cargar la imagen. Vuelve a elegir la foto.
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="block h-full w-full touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
            />
          )}
        </div>

        <div className="border-t border-slate-800 bg-slate-950 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
          <div className="mx-auto grid max-w-4xl gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="mb-2 text-[11px] font-extrabold uppercase text-slate-400">Orientacion</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => rotateImage('left')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-100">
                    <RotateCcw size={16} /> Izq.
                  </button>
                  <button type="button" onClick={() => rotateImage('right')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-100">
                    <RotateCw size={16} /> Der.
                  </button>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-extrabold uppercase text-slate-400">Dimensiones</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Ancho
                    <input
                      type="number"
                      min={MIN_CROP_SIZE}
                      max={orientedSize.width || undefined}
                      value={crop?.width || ''}
                      onChange={event => setCropSize(event.target.value, crop?.height)}
                      className="mt-1 h-11 w-full rounded border border-slate-700 bg-slate-900 px-2 text-sm font-semibold text-white outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-300">
                    Alto
                    <input
                      type="number"
                      min={MIN_CROP_SIZE}
                      max={orientedSize.height || undefined}
                      value={crop?.height || ''}
                      onChange={event => setCropSize(crop?.width, event.target.value)}
                      className="mt-1 h-11 w-full rounded border border-slate-700 bg-slate-900 px-2 text-sm font-semibold text-white outline-none focus:border-blue-400"
                    />
                  </label>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-extrabold uppercase text-slate-400">Formato</p>
                <div className="grid grid-cols-4 gap-2">
                  <button type="button" onClick={() => applyRatio(null)} className="min-h-11 rounded border border-slate-700 bg-slate-900 px-2 text-xs font-semibold text-slate-100">Libre</button>
                  <button type="button" onClick={() => applyRatio(1)} className="min-h-11 rounded border border-slate-700 bg-slate-900 px-2 text-xs font-semibold text-slate-100">1:1</button>
                  <button type="button" onClick={() => applyRatio(4 / 3)} className="min-h-11 rounded border border-slate-700 bg-slate-900 px-2 text-xs font-semibold text-slate-100">4:3</button>
                  <button type="button" onClick={() => setCrop({x: 0, y: 0, width: orientedSize.width, height: orientedSize.height})} className="inline-flex min-h-11 items-center justify-center rounded border border-slate-700 bg-slate-900 px-2 text-slate-100" aria-label="Usar imagen completa">
                    <Maximize2 size={15} />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 lg:w-[430px]">
              <button type="button" onClick={() => onUseOriginal?.(exportFullImage())} className="min-h-11 rounded border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-100 sm:text-sm">
                Sin recorte
              </button>
              <button type="button" onClick={onCancel} className="min-h-11 rounded border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-100 sm:text-sm">
                Cancelar
              </button>
              <button type="button" onClick={confirmCrop} disabled={!isReady} className="inline-flex min-h-11 items-center justify-center gap-1 rounded bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-50 sm:text-sm">
                <Crop size={15} /> <Check size={15} /> Aplicar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
