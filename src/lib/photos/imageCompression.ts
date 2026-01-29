// ═══════════════════════════════════════════════════════════════
// IMAGE COMPRESSION - Compressione lato client ottimizzata
// ═══════════════════════════════════════════════════════════════
//
// Questa utility comprime le immagini PRIMA dell'upload per:
// 1. Ridurre drasticamente i tempi di upload (80-90% più veloce)
// 2. Risparmiare dati mobili dell'operatore
// 3. Ridurre costi storage Firebase
// 4. Migliorare esperienza su smartphone lenti
//
// ═══════════════════════════════════════════════════════════════

import { 
  PhotoCompressionConfig, 
  DEFAULT_COMPRESSION_CONFIG,
  LOW_END_DEVICE_CONFIG 
} from "~/types/photo";

export interface CompressionResult {
  success: boolean;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  compressedBlob: Blob | null;
  thumbnailDataUrl: string | null;
  width: number;
  height: number;
  error?: string;
}

/**
 * Rileva se il dispositivo è "low-end" basandosi su:
 * - Memoria disponibile
 * - Numero di core CPU
 * - User agent per dispositivi noti
 */
export function detectLowEndDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  
  // Check hardware concurrency (CPU cores)
  const cores = navigator.hardwareConcurrency || 4;
  if (cores <= 2) return true;
  
  // Check device memory (se disponibile)
  const deviceMemory = (navigator as { deviceMemory?: number }).deviceMemory;
  if (deviceMemory && deviceMemory <= 2) return true;
  
  // Check user agent per dispositivi noti come lenti
  const ua = navigator.userAgent.toLowerCase();
  const lowEndPatterns = [
    /android 4\./,
    /android 5\./,
    /msie/,
    /iphone os [789]_/,
  ];
  
  return lowEndPatterns.some(pattern => pattern.test(ua));
}

/**
 * Ottiene la configurazione ottimale per il dispositivo corrente
 */
export function getOptimalCompressionConfig(): PhotoCompressionConfig {
  const isLowEnd = detectLowEndDevice();
  return isLowEnd ? LOW_END_DEVICE_CONFIG : DEFAULT_COMPRESSION_CONFIG;
}

/**
 * Comprime un'immagine usando Canvas API
 * Ottimizzata per non bloccare il main thread
 */
export async function compressImage(
  file: File,
  config: PhotoCompressionConfig = DEFAULT_COMPRESSION_CONFIG
): Promise<CompressionResult> {
  const originalSize = file.size;
  
  try {
    // Leggi file come data URL
    const dataUrl = await readFileAsDataUrl(file);
    
    // Crea immagine
    const img = await loadImage(dataUrl);
    
    // Calcola nuove dimensioni mantenendo aspect ratio
    const { width, height } = calculateDimensions(
      img.width,
      img.height,
      config.maxWidth,
      config.maxHeight
    );
    
    // Comprimi immagine principale
    const compressedBlob = await compressToBlob(img, width, height, config);
    
    // Se ancora troppo grande, riduci qualità progressivamente
    let finalBlob = compressedBlob;
    let quality = config.quality;
    
    while (finalBlob.size > config.maxFileSize && quality > 0.3) {
      quality -= 0.1;
      finalBlob = await compressToBlob(img, width, height, {
        ...config,
        quality,
      });
    }
    
    // Genera thumbnail
    const thumbnailDataUrl = await generateThumbnail(
      img,
      config.thumbnailWidth,
      config.thumbnailHeight,
      config.thumbnailQuality
    );
    
    const compressedSize = finalBlob.size;
    
    return {
      success: true,
      originalSize,
      compressedSize,
      compressionRatio: originalSize / compressedSize,
      compressedBlob: finalBlob,
      thumbnailDataUrl,
      width,
      height,
    };
  } catch (error) {
    return {
      success: false,
      originalSize,
      compressedSize: 0,
      compressionRatio: 0,
      compressedBlob: null,
      thumbnailDataUrl: null,
      width: 0,
      height: 0,
      error: error instanceof Error ? error.message : "Compression failed",
    };
  }
}

/**
 * Comprime multiple immagini in parallelo (limitato per non sovraccaricare)
 */
export async function compressMultipleImages(
  files: File[],
  config: PhotoCompressionConfig = DEFAULT_COMPRESSION_CONFIG,
  maxConcurrent: number = 2,
  onProgress?: (completed: number, total: number) => void
): Promise<Map<File, CompressionResult>> {
  const results = new Map<File, CompressionResult>();
  let completed = 0;
  
  // Processa in batch per non sovraccaricare dispositivi lenti
  for (let i = 0; i < files.length; i += maxConcurrent) {
    const batch = files.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(file => compressImage(file, config))
    );
    
    batch.forEach((file, index) => {
      results.set(file, batchResults[index]);
      completed++;
      onProgress?.(completed, files.length);
    });
    
    // Piccola pausa tra batch per permettere al browser di respirare
    if (i + maxConcurrent < files.length) {
      await sleep(50);
    }
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let width = originalWidth;
  let height = originalHeight;
  
  // Riduci se supera max width
  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }
  
  // Riduci se supera max height
  if (height > maxHeight) {
    width = Math.round((width * maxHeight) / height);
    height = maxHeight;
  }
  
  return { width, height };
}

function compressToBlob(
  img: HTMLImageElement,
  width: number,
  height: number,
  config: PhotoCompressionConfig
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // Usa OffscreenCanvas se disponibile (più performante)
    let canvas: HTMLCanvasElement | OffscreenCanvas;
    let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    
    if (typeof OffscreenCanvas !== "undefined") {
      canvas = new OffscreenCanvas(width, height);
      ctx = canvas.getContext("2d");
    } else {
      canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      ctx = canvas.getContext("2d");
    }
    
    if (!ctx) {
      reject(new Error("Could not get canvas context"));
      return;
    }
    
    // Disegna immagine
    ctx.drawImage(img, 0, 0, width, height);
    
    // Converti a blob
    const mimeType = config.outputFormat === "webp" ? "image/webp" : "image/jpeg";
    
    if (canvas instanceof OffscreenCanvas) {
      canvas.convertToBlob({
        type: mimeType,
        quality: config.quality,
      }).then(resolve).catch(reject);
    } else {
      canvas.toBlob(
        blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create blob"));
          }
        },
        mimeType,
        config.quality
      );
    }
  });
}

async function generateThumbnail(
  img: HTMLImageElement,
  width: number,
  height: number,
  quality: number
): Promise<string> {
  // Calcola dimensioni thumbnail mantenendo aspect ratio
  const aspectRatio = img.width / img.height;
  let thumbWidth = width;
  let thumbHeight = height;
  
  if (aspectRatio > 1) {
    thumbHeight = Math.round(width / aspectRatio);
  } else {
    thumbWidth = Math.round(height * aspectRatio);
  }
  
  // Crea canvas per thumbnail
  const canvas = document.createElement("canvas");
  canvas.width = thumbWidth;
  canvas.height = thumbHeight;
  
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not get canvas context for thumbnail");
  }
  
  ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);
  
  return canvas.toDataURL("image/jpeg", quality);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
// EXIF ORIENTATION FIX
// ═══════════════════════════════════════════════════════════════
// Le foto da smartphone spesso hanno rotazione EXIF che causa problemi

export async function fixImageOrientation(file: File): Promise<Blob> {
  // Leggi EXIF orientation
  const orientation = await getExifOrientation(file);
  
  if (orientation <= 1) {
    // Nessuna correzione necessaria
    return file;
  }
  
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);
  
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  
  if (!ctx) {
    return file;
  }
  
  // Imposta dimensioni in base all'orientamento
  if (orientation >= 5 && orientation <= 8) {
    canvas.width = img.height;
    canvas.height = img.width;
  } else {
    canvas.width = img.width;
    canvas.height = img.height;
  }
  
  // Applica trasformazione
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, img.width, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, img.width, img.height); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, img.height); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, img.height, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, img.height, img.width); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, img.width); break;
  }
  
  ctx.drawImage(img, 0, 0);
  
  return new Promise((resolve) => {
    canvas.toBlob(
      blob => resolve(blob || file),
      "image/jpeg",
      0.95
    );
  });
}

async function getExifOrientation(file: File): Promise<number> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const view = new DataView(e.target?.result as ArrayBuffer);
      
      if (view.getUint16(0, false) !== 0xFFD8) {
        resolve(1);
        return;
      }
      
      const length = view.byteLength;
      let offset = 2;
      
      while (offset < length) {
        if (view.getUint16(offset + 2, false) <= 8) {
          resolve(1);
          return;
        }
        
        const marker = view.getUint16(offset, false);
        offset += 2;
        
        if (marker === 0xFFE1) {
          if (view.getUint32(offset += 2, false) !== 0x45786966) {
            resolve(1);
            return;
          }
          
          const little = view.getUint16(offset += 6, false) === 0x4949;
          offset += view.getUint32(offset + 4, little);
          
          const tags = view.getUint16(offset, little);
          offset += 2;
          
          for (let i = 0; i < tags; i++) {
            if (view.getUint16(offset + (i * 12), little) === 0x0112) {
              resolve(view.getUint16(offset + (i * 12) + 8, little));
              return;
            }
          }
        } else if ((marker & 0xFF00) !== 0xFF00) {
          break;
        } else {
          offset += view.getUint16(offset, false);
        }
      }
      
      resolve(1);
    };
    
    reader.readAsArrayBuffer(file.slice(0, 65536));
  });
}
