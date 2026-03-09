"use client";

import { useState, useEffect, useRef, memo } from "react";

/* ═══════════════════════════════════════════════════════════════
   SmartImage — Auto-ridimensiona foto pesanti prima di mostrarle
   
   Problema: foto da Firebase sono 4284x5712 (24MP, 6-8MB).
   Il browser crasha cercando di decodificarle per una thumbnail.
   
   Soluzione: scarica → ridimensiona via canvas → mostra blob URL leggero.
   Cache globale per non ri-processare la stessa foto.
   ═══════════════════════════════════════════════════════════════ */

// Cache globale: URL originale → blob URL ridimensionato
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
      // Timeout: usa originale dopo 15s
      setTimeout(() => { clearInterval(check); resolve(src); }, 15000);
    });
  }

  processing.add(cacheKey);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;

      // Se già piccola, usa originale
      if (w <= maxSize && h <= maxSize) {
        thumbCache.set(cacheKey, src);
        processing.delete(cacheKey);
        resolve(src);
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
        processing.delete(cacheKey);
        resolve(src);
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            processing.delete(cacheKey);
            resolve(src);
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
    };

    img.onerror = () => {
      processing.delete(cacheKey);
      resolve(src); // Fallback all'originale
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
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setIsLoading(true);

    // Controlla se è già in cache (sync)
    const cacheKey = `${src}__${maxSize}`;
    if (thumbCache.has(cacheKey)) {
      setDisplaySrc(thumbCache.get(cacheKey)!);
      setIsLoading(false);
      return;
    }

    // Resize asincrono
    getResizedUrl(src, maxSize, quality).then((url) => {
      if (mounted.current) {
        setDisplaySrc(url);
        setIsLoading(false);
      }
    });

    return () => { mounted.current = false; };
  }, [src, maxSize, quality]);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={style}
      onClick={onClick}
    >
      {/* Skeleton loading */}
      {isLoading && showSkeleton && (
        <div className="absolute inset-0 bg-slate-200 animate-pulse" />
      )}

      {/* Immagine ridimensionata */}
      {displaySrc && (
        <img
          src={displaySrc}
          alt={alt}
          loading={loading}
          draggable={false}
          className="w-full h-full object-cover"
          style={{
            opacity: isLoading ? 0 : 1,
            transition: "opacity 0.2s ease",
          }}
          onLoad={() => setIsLoading(false)}
        />
      )}
    </div>
  );
});

export { SmartImage, getResizedUrl, thumbCache };
export default SmartImage;
