"use client";

import { useState, useEffect, useCallback, useRef, type TouchEvent as RTouchEvent } from "react";

/* ═══════════════════════════════════════════════════════════════
   PhotoLightbox v7 — carosello con SWIPE + PINCH-ZOOM + PAN inline

   - Swipe orizzontale tra le foto (gestito a mano via transform,
     niente scroll nativo → nessun conflitto col gesto di zoom)
   - Pizzica per zoomare la foto corrente, trascina per spostarti,
     doppio-tap per zoom rapido (1× ↔ 2.5×, fino a 5×)
   - touch-action: none → controlliamo noi ogni gesto
   - Foto ridimensionate a 1200px per caricamento veloce; la foto che
     zoomi viene aggiornata a piena risoluzione in background (progressivo)
   ═══════════════════════════════════════════════════════════════ */

interface PhotoLightboxProps {
  photos: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  propertyName?: string;
}

// Cache globale per immagini ridimensionate
const resizedCache = new Map<string, string>();
const MAX_DISPLAY_SIZE = 1200; // px

function resizeImage(src: string): Promise<string> {
  if (resizedCache.has(src)) return Promise.resolve(resizedCache.get(src)!);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;

      if (w <= MAX_DISPLAY_SIZE && h <= MAX_DISPLAY_SIZE) {
        resizedCache.set(src, src);
        resolve(src);
        return;
      }

      if (w > h) {
        h = Math.round((h * MAX_DISPLAY_SIZE) / w);
        w = MAX_DISPLAY_SIZE;
      } else {
        w = Math.round((w * MAX_DISPLAY_SIZE) / h);
        h = MAX_DISPLAY_SIZE;
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(src); return; }

      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(src); return; }
          const blobUrl = URL.createObjectURL(blob);
          resizedCache.set(src, blobUrl);
          resolve(blobUrl);
        },
        "image/jpeg",
        0.85
      );
    };

    img.onerror = () => resolve(src);
    img.src = src;
  });
}

async function preprocessPhotos(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map(resizeImage));
}

export function PhotoLightbox({
  photos,
  initialIndex = 0,
  isOpen,
  onClose,
  propertyName,
}: PhotoLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [entered, setEntered] = useState(false);
  const [displayPhotos, setDisplayPhotos] = useState<string[]>([]);
  const [processing, setProcessing] = useState(true);
  const [zoomed, setZoomed] = useState(false); // solo per UI (nasconde frecce/hint)

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const indexRef = useRef(initialIndex);

  // Zoom della slide corrente
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);

  // Stato del gesto
  const mode = useRef<"idle" | "swipe" | "pinch" | "pan">("idle");
  const startX = useRef(0);
  const startY = useRef(0);
  const startTrackX = useRef(0);
  const startDist = useRef(1);
  const startScale = useRef(1);
  const startTx = useRef(0);
  const startTy = useRef(0);
  const lastTap = useRef(0);
  const movedRef = useRef(false);
  const upgraded = useRef<Set<number>>(new Set());

  const getWidth = () => viewportRef.current?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 1) || 1;
  const getHeight = () => viewportRef.current?.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 1) || 1;

  const currentImg = (): HTMLImageElement | null => {
    const track = trackRef.current;
    if (!track) return null;
    const slide = track.children[indexRef.current] as HTMLElement | undefined;
    return slide ? (slide.querySelector("img") as HTMLImageElement | null) : null;
  };

  const positionTrack = (i: number, animate: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animate ? "transform 0.3s cubic-bezier(0.22,0.61,0.36,1)" : "none";
    track.style.transform = `translate3d(${-i * getWidth()}px,0,0)`;
  };

  const applyZoom = (animate: boolean) => {
    const img = currentImg();
    if (!img) return;
    img.style.transition = animate ? "transform 0.18s ease" : "none";
    img.style.transform = `translate3d(${txRef.current}px, ${tyRef.current}px, 0) scale(${scaleRef.current})`;
  };

  const syncZoomedFlag = () => {
    const z = scaleRef.current > 1.02;
    setZoomed((prev) => (prev !== z ? z : prev));
  };

  const resetZoom = (animate: boolean) => {
    scaleRef.current = 1;
    txRef.current = 0;
    tyRef.current = 0;
    applyZoom(animate);
    syncZoomedFlag();
  };

  const clampPan = () => {
    const img = currentImg();
    const w = getWidth();
    const h = getHeight();
    const iw = (img?.clientWidth || w) * scaleRef.current;
    const ih = (img?.clientHeight || h) * scaleRef.current;
    const maxX = Math.max(0, (iw - w) / 2);
    const maxY = Math.max(0, (ih - h) / 2);
    if (txRef.current > maxX) txRef.current = maxX;
    if (txRef.current < -maxX) txRef.current = -maxX;
    if (tyRef.current > maxY) tyRef.current = maxY;
    if (tyRef.current < -maxY) tyRef.current = -maxY;
  };

  // Quando zoomi, carica l'originale a piena risoluzione e sostituiscilo (progressivo)
  const upgradeCurrentToFullRes = () => {
    const i = indexRef.current;
    if (upgraded.current.has(i)) return;
    const hi = photos[i];
    const img = currentImg();
    if (!img || !hi) return;
    if (img.src === hi) { upgraded.current.add(i); return; }
    const pre = new Image();
    pre.onload = () => {
      const cur = currentImg();
      if (cur && indexRef.current === i) cur.src = hi;
      upgraded.current.add(i);
    };
    pre.src = hi;
  };

  const goTo = useCallback((i: number) => {
    const n = photos.length;
    if (i < 0 || i >= n) { positionTrack(indexRef.current, true); return; }
    resetZoom(false); // azzera lo zoom della slide che lasciamo
    indexRef.current = i;
    setIndex(i);
    positionTrack(i, true);
  }, [photos.length]);

  const doClose = useCallback(() => {
    setEntered(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  // ── Open lifecycle ──
  useEffect(() => {
    if (isOpen) {
      setIndex(initialIndex);
      indexRef.current = initialIndex;
      scaleRef.current = 1; txRef.current = 0; tyRef.current = 0;
      setZoomed(false);
      setEntered(false);
      setProcessing(true);
      upgraded.current = new Set();
      document.body.style.overflow = "hidden";

      preprocessPhotos(photos).then((resized) => {
        setDisplayPhotos(resized);
        setProcessing(false);
        requestAnimationFrame(() => setEntered(true));
      });
    } else {
      setEntered(false);
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen, initialIndex, photos]);

  // ── Posiziona il track quando le foto sono pronte ──
  useEffect(() => {
    if (!processing && displayPhotos.length > 0) {
      positionTrack(indexRef.current, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing, displayPhotos.length]);

  // ── Resize / rotazione schermo ──
  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => { resetZoom(false); positionTrack(indexRef.current, false); };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Keyboard ──
  useEffect(() => {
    if (!isOpen) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") doClose();
      if (e.key === "ArrowRight") goTo(indexRef.current + 1);
      if (e.key === "ArrowLeft") goTo(indexRef.current - 1);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [isOpen, goTo, doClose]);

  // ═══════════════════════════
  //  GESTI TOUCH
  // ═══════════════════════════
  const onTouchStart = (e: RTouchEvent<HTMLDivElement>) => {
    const t = e.touches;
    movedRef.current = false;
    if (t.length === 2) {
      mode.current = "pinch";
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      startDist.current = Math.hypot(dx, dy) || 1;
      startScale.current = scaleRef.current;
      startTx.current = txRef.current;
      startTy.current = tyRef.current;
    } else if (t.length === 1) {
      const now = Date.now();
      const isDouble = now - lastTap.current < 280;
      lastTap.current = now;

      if (isDouble) {
        if (scaleRef.current > 1) {
          resetZoom(true);
        } else {
          scaleRef.current = 2.5;
          clampPan();
          applyZoom(true);
          syncZoomedFlag();
          upgradeCurrentToFullRes();
        }
        mode.current = "idle";
        return;
      }

      if (scaleRef.current > 1) {
        mode.current = "pan";
        startX.current = t[0].clientX;
        startY.current = t[0].clientY;
        startTx.current = txRef.current;
        startTy.current = tyRef.current;
      } else {
        mode.current = "swipe";
        startX.current = t[0].clientX;
        startY.current = t[0].clientY;
        startTrackX.current = -indexRef.current * getWidth();
      }
    }
  };

  const onTouchMove = (e: RTouchEvent<HTMLDivElement>) => {
    const t = e.touches;
    movedRef.current = true;

    if (mode.current === "pinch" && t.length === 2) {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      const dist = Math.hypot(dx, dy);
      let s = startScale.current * (dist / startDist.current);
      if (s < 1) s = 1;
      if (s > 5) s = 5;
      scaleRef.current = s;
      clampPan();
      applyZoom(false);
    } else if (mode.current === "pan" && t.length === 1) {
      txRef.current = startTx.current + (t[0].clientX - startX.current);
      tyRef.current = startTy.current + (t[0].clientY - startY.current);
      clampPan();
      applyZoom(false);
    } else if (mode.current === "swipe" && t.length === 1) {
      const dx = t[0].clientX - startX.current;
      const track = trackRef.current;
      if (track) {
        track.style.transition = "none";
        track.style.transform = `translate3d(${startTrackX.current + dx}px,0,0)`;
      }
    }
  };

  const onTouchEnd = (e: RTouchEvent<HTMLDivElement>) => {
    const remaining = e.touches.length;

    if (mode.current === "swipe") {
      const endX = e.changedTouches[0]?.clientX ?? startX.current;
      const dx = endX - startX.current;
      const threshold = Math.min(80, getWidth() * 0.18);
      if (dx <= -threshold && indexRef.current < photos.length - 1) goTo(indexRef.current + 1);
      else if (dx >= threshold && indexRef.current > 0) goTo(indexRef.current - 1);
      else positionTrack(indexRef.current, true);
      mode.current = "idle";
      return;
    }

    if (mode.current === "pinch") {
      if (scaleRef.current <= 1.02) {
        resetZoom(true);
      } else {
        clampPan();
        applyZoom(true);
        upgradeCurrentToFullRes();
      }
      syncZoomedFlag();
      if (remaining === 1) {
        // un dito ancora a terra → passa a pan se zoomato
        mode.current = scaleRef.current > 1 ? "pan" : "idle";
        const r = e.touches[0];
        startX.current = r.clientX;
        startY.current = r.clientY;
        startTx.current = txRef.current;
        startTy.current = tyRef.current;
      } else {
        mode.current = "idle";
      }
      return;
    }

    if (mode.current === "pan") {
      if (remaining === 0) {
        clampPan();
        applyZoom(true);
        mode.current = "idle";
      }
      return;
    }
  };

  // ═══════════════════════════
  //  RENDER
  // ═══════════════════════════
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{
        backgroundColor: entered ? "rgba(0,0,0,0.97)" : "rgba(0,0,0,0)",
        transition: "background-color 0.2s ease",
      }}
    >
      {/* HEADER */}
      <div
        className="flex-shrink-0 relative z-10 flex items-center justify-between px-4 py-3"
        style={{ opacity: entered ? 1 : 0, transition: "opacity 0.25s ease" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
            <span className="text-base">📷</span>
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate">
              {propertyName || "Foto Pulizia"}
            </p>
            <p className="text-white/50 text-xs">
              {index + 1} di {photos.length}{zoomed ? " · zoom" : " · pizzica per zoomare"}
            </p>
          </div>
        </div>
        <button
          onClick={doClose}
          className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* PROCESSING INDICATOR */}
      {processing && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full border-[3px] border-white/10 border-t-white/70 animate-spin" />
            <p className="text-white/60 text-sm">Ottimizzazione foto...</p>
          </div>
        </div>
      )}

      {/* CAROSELLO (swipe + pinch + pan gestiti a mano) */}
      {!processing && displayPhotos.length > 0 && (
        <div
          ref={viewportRef}
          className="flex-1 overflow-hidden relative"
          style={{
            touchAction: "none",
            opacity: entered ? 1 : 0,
            transition: "opacity 0.2s ease",
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div
            ref={trackRef}
            className="flex h-full"
            style={{ width: "100%", height: "100%", willChange: "transform" }}
          >
            {displayPhotos.map((src, i) => (
              <div
                key={i}
                className="flex-shrink-0 flex items-center justify-center"
                style={{ width: "100%", height: "100%" }}
              >
                <img
                  src={src}
                  alt={`Foto ${i + 1}`}
                  draggable={false}
                  decoding="async"
                  className="max-w-full max-h-full object-contain select-none"
                  style={{
                    transformOrigin: "center center",
                    willChange: "transform",
                    WebkitUserSelect: "none",
                    userSelect: "none",
                    WebkitTouchCallout: "none",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Frecce desktop (nascoste se zoomato) */}
      {!processing && photos.length > 1 && !zoomed && (
        <>
          {index > 0 && (
            <button
              onClick={() => goTo(index - 1)}
              className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm items-center justify-center text-white hover:bg-black/60 active:scale-90 transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {index < photos.length - 1 && (
            <button
              onClick={() => goTo(index + 1)}
              className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm items-center justify-center text-white hover:bg-black/60 active:scale-90 transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </>
      )}

      {/* FOOTER */}
      <div
        className="flex-shrink-0 relative z-10 px-4 pb-4"
        style={{
          opacity: entered ? 1 : 0,
          transition: "opacity 0.25s ease",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)",
        }}
      >
        {photos.length > 1 && photos.length <= 15 && (
          <div className="flex justify-center gap-1.5 mb-3">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className="transition-all duration-200 rounded-full"
                style={{
                  width: i === index ? 24 : 7,
                  height: 7,
                  backgroundColor: i === index ? "white" : "rgba(255,255,255,0.3)",
                }}
              />
            ))}
          </div>
        )}

        {photos.length > 15 && (
          <div className="flex justify-center mb-3">
            <span className="bg-white/15 backdrop-blur-sm px-4 py-1.5 rounded-full text-white/90 text-xs font-medium tabular-nums">
              {index + 1} / {photos.length}
            </span>
          </div>
        )}

        {photos.length > 1 && !processing && (
          <ThumbStrip photos={displayPhotos} current={index} onTap={goTo} />
        )}
      </div>
    </div>
  );
}

// ─── Thumbnail strip ───
function ThumbStrip({ photos, current, onTap }: { photos: string[]; current: number; onTap: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const thumb = el.children[current] as HTMLElement;
    if (!thumb) return;
    const left = thumb.offsetLeft - el.clientWidth / 2 + thumb.clientWidth / 2;
    el.scrollTo({ left, behavior: "smooth" });
  }, [current]);

  return (
    <div
      ref={ref}
      className="flex gap-1.5 overflow-x-auto scrollbar-hide"
      style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      {photos.map((p, i) => (
        <button
          key={i}
          onClick={() => onTap(i)}
          className="flex-shrink-0 rounded-lg overflow-hidden"
          style={{
            width: i === current ? 48 : 36,
            height: i === current ? 48 : 36,
            opacity: i === current ? 1 : 0.4,
            border: i === current ? "2px solid white" : "2px solid transparent",
            marginTop: i === current ? 0 : 6,
            transition: "all 0.2s ease",
          }}
        >
          <img src={p} alt="" draggable={false} loading="lazy" className="w-full h-full object-cover" />
        </button>
      ))}
    </div>
  );
}

export default PhotoLightbox;
