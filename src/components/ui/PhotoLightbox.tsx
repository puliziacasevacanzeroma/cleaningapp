"use client";

import { useState, useEffect, useCallback, useRef, type TouchEvent as RTouchEvent } from "react";

/* ═══════════════════════════════════════════════════════════════
   PhotoLightbox v5 — RISOLVE foto 4284x5712 da Firebase
   
   PROBLEMA TROVATO DAL DEBUG:
   - Le foto sono 4284x5712 (24 megapixel!)
   - Il browser impiega 6+ secondi a decodificarle
   - Durante la decodifica il main thread si blocca
   - Il flag "transitioning" restava true e bloccava i touch
   
   SOLUZIONE:
   1. Ridimensiona le foto con OffscreenCanvas/canvas → max 1200px
   2. Crea un blob URL locale che il browser può renderizzare senza lag
   3. Usa scroll-snap nativo CSS per lo swipe (il browser gestisce tutto)
   4. ZERO JavaScript per il tracking touch → nessun blocco possibile
   5. Cache aggressiva dei blob URL ridimensionati
   ═══════════════════════════════════════════════════════════════ */

interface PhotoLightboxProps {
  photos: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  propertyName?: string;
}

// ─── Cache globale per immagini ridimensionate ───
const resizedCache = new Map<string, string>(); // url originale → blob URL ridimensionato

const MAX_DISPLAY_SIZE = 1200; // px — più che sufficiente per qualsiasi mobile

/**
 * Scarica l'immagine, la ridimensiona a max 1200px via canvas,
 * restituisce un blob URL leggero che il browser renderizza istantaneamente
 */
function resizeImage(src: string): Promise<string> {
  // Se già in cache, ritorna subito
  if (resizedCache.has(src)) return Promise.resolve(resizedCache.get(src)!);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;

      // Se già piccola, usa l'originale
      if (w <= MAX_DISPLAY_SIZE && h <= MAX_DISPLAY_SIZE) {
        resizedCache.set(src, src);
        resolve(src);
        return;
      }

      // Calcola nuove dimensioni
      if (w > h) {
        h = Math.round((h * MAX_DISPLAY_SIZE) / w);
        w = MAX_DISPLAY_SIZE;
      } else {
        w = Math.round((w * MAX_DISPLAY_SIZE) / h);
        h = MAX_DISPLAY_SIZE;
      }

      // Ridimensiona via canvas
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

    img.onerror = () => {
      // Fallback: usa l'originale
      resolve(src);
    };

    img.src = src;
  });
}

/**
 * Pre-processa un array di foto: le ridimensiona tutte in parallelo
 */
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
  // Foto ridimensionate pronte per il display
  const [displayPhotos, setDisplayPhotos] = useState<string[]>([]);
  const [processing, setProcessing] = useState(true);
  // ── Zoom: foto a piena risoluzione aperta in overlay dedicato (pinch/pan/doppio-tap) ──
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticScroll = useRef(false);

  // ── Open lifecycle ──
  useEffect(() => {
    if (isOpen) {
      setIndex(initialIndex);
      setEntered(false);
      setProcessing(true);
      document.body.style.overflow = "hidden";

      // Pre-processa tutte le foto (ridimensiona in background)
      preprocessPhotos(photos).then((resized) => {
        setDisplayPhotos(resized);
        setProcessing(false);
        requestAnimationFrame(() => {
          setEntered(true);
          // Scroll alla foto iniziale
          const el = scrollRef.current;
          if (el) {
            programmaticScroll.current = true;
            el.scrollTo({ left: initialIndex * el.clientWidth, behavior: "instant" as ScrollBehavior });
            setTimeout(() => { programmaticScroll.current = false; }, 50);
          }
        });
      });
    } else {
      setEntered(false);
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen, initialIndex, photos]);

  // ── Keyboard ──
  useEffect(() => {
    if (!isOpen) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") doClose();
      if (e.key === "ArrowRight") scrollToIndex(index + 1);
      if (e.key === "ArrowLeft") scrollToIndex(index - 1);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [isOpen, index]);

  // ── Scroll snap detection (track current photo) ──
  const handleScroll = useCallback(() => {
    if (programmaticScroll.current) return;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      const w = el.clientWidth;
      if (w === 0) return;
      const newIndex = Math.round(el.scrollLeft / w);
      if (newIndex >= 0 && newIndex < photos.length) {
        setIndex(newIndex);
      }
    }, 60);
  }, [photos.length]);

  const scrollToIndex = useCallback((i: number) => {
    if (i < 0 || i >= photos.length) return;
    const el = scrollRef.current;
    if (!el) return;
    programmaticScroll.current = true;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setIndex(i);
    setTimeout(() => { programmaticScroll.current = false; }, 400);
  }, [photos.length]);

  const doClose = useCallback(() => {
    setEntered(false);
    setTimeout(onClose, 200);
  }, [onClose]);

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
              {index + 1} di {photos.length} · tocca la foto per zoomare
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!processing && displayPhotos.length > 0 && (
            <button
              onClick={() => setZoomIndex(index)}
              aria-label="Zoom"
              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-4.35-4.35M11 8v6M8 11h6M19 11a8 8 0 11-16 0 8 8 0 0116 0z" />
              </svg>
            </button>
          )}
          <button
            onClick={doClose}
            className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
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

      {/* SCROLL-SNAP SLIDES — il browser gestisce tutto lo swipe */}
      {!processing && displayPhotos.length > 0 && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 flex overflow-x-auto scrollbar-hide"
          style={{
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            opacity: entered ? 1 : 0,
            transition: "opacity 0.2s ease",
          }}
        >
          {displayPhotos.map((src, i) => (
            <div
              key={i}
              className="flex-shrink-0 flex items-center justify-center"
              style={{
                width: "100vw",
                height: "100%",
                scrollSnapAlign: "start",
                scrollSnapStop: "always",
              }}
            >
              <img
                src={src}
                alt={`Foto ${i + 1}`}
                draggable={false}
                onClick={() => setZoomIndex(i)}
                decoding="async"
                className="max-w-full max-h-full object-contain select-none cursor-zoom-in"
                style={{
                  WebkitUserSelect: "none",
                  userSelect: "none",
                  WebkitTouchCallout: "none",
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Desktop arrows */}
      {!processing && photos.length > 1 && (
        <>
          {index > 0 && (
            <button
              onClick={() => scrollToIndex(index - 1)}
              className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm items-center justify-center text-white hover:bg-black/60 active:scale-90 transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {index < photos.length - 1 && (
            <button
              onClick={() => scrollToIndex(index + 1)}
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
        {/* Progress dots */}
        {photos.length > 1 && photos.length <= 15 && (
          <div className="flex justify-center gap-1.5 mb-3">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollToIndex(i)}
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

        {/* Thumbnail strip */}
        {photos.length > 1 && !processing && (
          <ThumbStrip
            photos={displayPhotos}
            current={index}
            onTap={scrollToIndex}
          />
        )}
      </div>

      {/* ZOOM OVERLAY (pinch / doppio-tap / trascina) — foto a piena risoluzione */}
      {zoomIndex !== null && (
        <ZoomView
          lowSrc={displayPhotos[zoomIndex] || photos[zoomIndex]}
          highSrc={photos[zoomIndex]}
          onClose={() => setZoomIndex(null)}
        />
      )}
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

// ─── Zoom view: singola foto a PIENA RISOLUZIONE con pinch / doppio-tap / trascina ───
function ZoomView({ lowSrc, highSrc, onClose }: { lowSrc: string; highSrc: string; onClose: () => void }) {
  const [shownSrc, setShownSrc] = useState(lowSrc);
  const imgRef = useRef<HTMLImageElement>(null);

  const scale = useRef(1);
  const tx = useRef(0);
  const ty = useRef(0);

  const mode = useRef<"none" | "pan" | "pinch">("none");
  const startDist = useRef(1);
  const startScale = useRef(1);
  const startX = useRef(0);
  const startY = useRef(0);
  const startTx = useRef(0);
  const startTy = useRef(0);
  const lastTap = useRef(0);

  const apply = () => {
    const img = imgRef.current;
    if (img) img.style.transform = `translate(${tx.current}px, ${ty.current}px) scale(${scale.current})`;
  };

  const clampScale = () => {
    if (scale.current < 1) { scale.current = 1; tx.current = 0; ty.current = 0; }
    if (scale.current > 5) scale.current = 5;
  };

  const onTouchStart = (e: RTouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      mode.current = "pinch";
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      startDist.current = Math.hypot(dx, dy) || 1;
      startScale.current = scale.current;
    } else if (e.touches.length === 1) {
      // doppio-tap → zoom in/out
      const now = Date.now();
      if (now - lastTap.current < 300) {
        if (scale.current > 1) { scale.current = 1; tx.current = 0; ty.current = 0; }
        else { scale.current = 2.5; }
        clampScale(); apply();
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
      mode.current = scale.current > 1 ? "pan" : "none";
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      startTx.current = tx.current;
      startTy.current = ty.current;
    }
  };

  const onTouchMove = (e: RTouchEvent<HTMLDivElement>) => {
    if (mode.current === "pinch" && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      scale.current = startScale.current * (dist / startDist.current);
      clampScale(); apply();
    } else if (mode.current === "pan" && e.touches.length === 1 && scale.current > 1) {
      tx.current = startTx.current + (e.touches[0].clientX - startX.current);
      ty.current = startTy.current + (e.touches[0].clientY - startY.current);
      apply();
    }
  };

  const onTouchEnd = (e: RTouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) {
      clampScale(); apply();
      mode.current = "none";
    } else if (e.touches.length === 1) {
      mode.current = scale.current > 1 ? "pan" : "none";
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      startTx.current = tx.current;
      startTy.current = ty.current;
    }
  };

  const onDoubleClick = () => {
    if (scale.current > 1) { scale.current = 1; tx.current = 0; ty.current = 0; }
    else { scale.current = 2.5; }
    clampScale(); apply();
  };

  // Progressivo: mostra subito la versione leggera (già in cache → istantanea),
  // poi carica l'originale a piena risoluzione e lo sostituisce senza sfarfallio.
  // Lo scroll dello sfondo è già bloccato dalla galleria: qui NON tocchiamo body.
  useEffect(() => {
    setShownSrc(lowSrc);
    if (!highSrc || highSrc === lowSrc) return;
    const hi = new Image();
    hi.onload = () => setShownSrc(highSrc);
    hi.src = highSrc;
    return () => { hi.onload = null; };
  }, [lowSrc, highSrc]);

  return (
    <div className="fixed inset-0 z-[10000] bg-black flex flex-col" style={{ touchAction: "none" }}>
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3">
        <p className="text-white/70 text-xs">Pizzica o doppio-tap per zoomare · trascina per spostarti</p>
        <button
          onClick={onClose}
          aria-label="Chiudi zoom"
          className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div
        className="flex-1 overflow-hidden flex items-center justify-center relative"
        style={{ touchAction: "none" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={onDoubleClick}
      >
        <img
          ref={imgRef}
          src={shownSrc}
          alt="Zoom"
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
    </div>
  );
}

export default PhotoLightbox;
