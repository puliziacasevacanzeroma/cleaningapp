"use client";

import { useState, useEffect, useRef, memo } from "react";

/* ═══════════════════════════════════════════════════════════════
   SmartImage v2 — Auto-ridimensiona foto pesanti prima di mostrarle

   Problema: foto da Firebase sono 4284x5712 (24MP, 6-8MB).
   Il browser crasha cercando di decodificarle per una thumbnail.

   Soluzione: scarica → ridimensiona via canvas → mostra blob URL leggero.
   Cache globale per non ri-processare la stessa foto.

   ▼ FIX v2 ▼ — l'immagine viene SEMPRE mostrata, anche se il resize
   fallisce (es. CORS, decoder, formato non supportato). Niente più
   "icona rotta" se il bucket non ha CORS abilitato.
   Il tag <img> finale NON usa crossOrigin → carica da qualsiasi origin.
   ═══════════════════════════════════════════════════════════════ */

// Cache globale: URL originale → blob URL ridimensionato (o URL originale come fallback)
const thumbCache = new Map<string, string>();
// Foto in corso di processing (evita duplicati)
const processing = new Set<string>();

interface SmartImageProps {
  src: string;
  alt?: string;
  className?: string;
  /** Dimensione max per il lato più lungo (default: 400 per thumbnail, 800 per hero) */
  maxSize?: number;
  /** Quality JPEG 0-1 (default: 0.7) */
  quality?: number;
  /** Mostra sempre loading skeleton (default: true) */
  showSkeleton?: boolean;
  onClick?: () => void;
  loading?: "eager" | "lazy";
  style?: React.CSSProperties;
}

function getResizedUrl(src: string, maxSize: number, quality: number): Promise<string> {
  const cacheKey = `${src}__${maxSize}`;

  // Già in cache
  if (thumbCache.has(cacheKey)) {
    return Promise.resolve(thumbCache.get(cacheKey)!);
  }

  // Già in processing, aspetta
  if (processing.has(cacheKey)) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (thumbCache.has(cacheKey)) {
          clearInterval(check);
          resolve(thumbCache.get(cacheKey)!);
        }
      }, 100);
      // Timeout: usa originale dopo 8s (era 15s, ridotto perché ormai è solo un'ottimizzazione)
      setTimeout(() => { clearInterval(check); resolve(src); }, 8000);
    });
  }

  processing.add(cacheKey);

  return new Promise((resolve) => {
    const img = new Image();
    // ⚠️ NIENTE crossOrigin: serve solo se vogliamo leggere i pixel dal canvas.
    // Lo settiamo solo se il browser supporta caricamento CORS pulito,
    // ma con un fallback sicuro nel catch più sotto.
    img.crossOrigin = "anonymous";

    const fallbackToOriginal = () => {
      thumbCache.set(cacheKey, src);
      processing.delete(cacheKey);
      resolve(src);
    };

    img.onload = () => {
      try {
        let { naturalWidth: w, naturalHeight: h } = img;

        // Se già piccola, usa originale
        if (w <= maxSize && h <= maxSize) {
          fallbackToOriginal();
          return;
        }

        // Ridimensiona
        if (w > h) {
          h = Math.round((h * maxSize) / w);
          w = maxSize;
        } else {
          w = Math.round((w * maxSize) / h);
          h = maxSize;
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          fallbackToOriginal();
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);

        try {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                fallbackToOriginal();
                return;
              }
              const blobUrl = URL.createObjectURL(blob);
              thumbCache.set(cacheKey, blobUrl);
              processing.delete(cacheKey);
              resolve(blobUrl);
            },
            "image/jpeg",
            quality
          );
        } catch {
          // Canvas tainted (CORS) → fallback
          fallbackToOriginal();
        }
      } catch {
        // Qualsiasi altra eccezione (es. canvas tainted da CORS)
        fallbackToOriginal();
      }
    };

    img.onerror = () => {
      // Caricamento fallito (CORS, 404, ecc.) → fallback
      fallbackToOriginal();
    };

    img.src = src;
  });
}

const SmartImage = memo(function SmartImage({
  src,
  alt = "",
  className = "",
  maxSize = 400,
  quality = 0.7,
  showSkeleton = true,
  onClick,
  loading = "lazy",
  style,
}: SmartImageProps) {
  // ⚠️ FIX v2: il displaySrc parte SUBITO con l'URL originale.
  // In questo modo il tag <img> è sempre presente nel DOM e mostra
  // la foto anche se il resize asincrono fallisce.
  // Quando (se) il resize completa, sostituiamo con il blob ottimizzato.
  const [displaySrc, setDisplaySrc] = useState<string>(src);
  const [imgLoaded, setImgLoaded] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    // Reset quando cambia src
    setDisplaySrc(src);
    setImgLoaded(false);

    // Controlla se è già in cache (sync) — usiamo subito la versione ottimizzata
    const cacheKey = `${src}__${maxSize}`;
    if (thumbCache.has(cacheKey)) {
      setDisplaySrc(thumbCache.get(cacheKey)!);
      return;
    }

    // Resize asincrono — quando finisce sostituiamo con la versione ottimizzata
    getResizedUrl(src, maxSize, quality).then((url) => {
      if (mounted.current && url !== src) {
        setDisplaySrc(url);
      }
    }).catch(() => {
      // Se anche getResizedUrl fa errore, resta l'originale già settato
    });

    return () => { mounted.current = false; };
  }, [src, maxSize, quality]);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={style}
      onClick={onClick}
    >
      {/* Skeleton loading mentre l'immagine non è caricata */}
      {!imgLoaded && showSkeleton && (
        <div className="absolute inset-0 bg-slate-200 animate-pulse" />
      )}

      {/* Immagine: sempre presente nel DOM (parte da src originale) */}
      <img
        src={displaySrc}
        alt={alt}
        loading={loading}
        draggable={false}
        className="w-full h-full object-cover"
        style={{
          opacity: imgLoaded ? 1 : 0,
          transition: "opacity 0.2s ease",
        }}
        onLoad={() => setImgLoaded(true)}
        onError={() => {
          // Se il displaySrc corrente fallisce, prova l'URL originale
          if (displaySrc !== src) {
            setDisplaySrc(src);
          } else {
            // Anche l'originale ha fallito: marca come "caricato" per
            // far sparire lo skeleton (non rimanere in loop infinito)
            setImgLoaded(true);
          }
        }}
      />
    </div>
  );
});

export { SmartImage, getResizedUrl, thumbCache };
export default SmartImage;
