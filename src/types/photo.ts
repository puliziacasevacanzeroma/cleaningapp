// ═══════════════════════════════════════════════════════════════
// PHOTO UPLOAD SYSTEM - Sistema ottimizzato per smartphone
// ═══════════════════════════════════════════════════════════════
// 
// STRATEGIA DI OTTIMIZZAZIONE:
// 1. Compressione lato client PRIMA dell'upload (riduce 80-90% dimensione)
// 2. Generazione thumbnail locale per preview istantanea
// 3. Upload in background mentre l'operatore continua a lavorare
// 4. Queue con retry automatico per connessioni instabili
// 5. Upload parallelo limitato (max 2-3 foto simultanee)
// 6. Salvataggio locale in caso di errore per retry successivo
// ═══════════════════════════════════════════════════════════════

// @ts-expect-error TODO-FIX: TS2305 Module '"./cleaning"' has no exported member 'PhotoCategory'.
import { PhotoCategory } from "./cleaning";

// ═══════════════════════════════════════════════════════════════
// COMPRESSION CONFIG - Configurazione compressione
// ═══════════════════════════════════════════════════════════════

export interface PhotoCompressionConfig {
  // Dimensioni massime
  maxWidth: number;           // Default: 1920px
  maxHeight: number;          // Default: 1920px
  
  // Qualità JPEG (0-1)
  quality: number;            // Default: 0.7 (buon compromesso qualità/dimensione)
  
  // Thumbnail
  thumbnailWidth: number;     // Default: 200px
  thumbnailHeight: number;    // Default: 200px
  thumbnailQuality: number;   // Default: 0.6
  
  // Formato output
  outputFormat: "jpeg" | "webp";
  
  // Limite dimensione file (bytes)
  maxFileSize: number;        // Default: 500KB
}

export const DEFAULT_COMPRESSION_CONFIG: PhotoCompressionConfig = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.7,
  thumbnailWidth: 200,
  thumbnailHeight: 200,
  thumbnailQuality: 0.6,
  outputFormat: "jpeg",
  maxFileSize: 500 * 1024,    // 500KB
};

// Config per smartphone lenti - compressione più aggressiva
export const LOW_END_DEVICE_CONFIG: PhotoCompressionConfig = {
  maxWidth: 1280,
  maxHeight: 1280,
  quality: 0.6,
  thumbnailWidth: 150,
  thumbnailHeight: 150,
  thumbnailQuality: 0.5,
  outputFormat: "jpeg",
  maxFileSize: 300 * 1024,    // 300KB
};

// ═══════════════════════════════════════════════════════════════
// UPLOAD QUEUE - Coda upload con gestione errori
// ═══════════════════════════════════════════════════════════════

export type PhotoUploadStatus = 
  | "pending"       // In attesa nella coda
  | "compressing"   // Compressione in corso
  | "uploading"     // Upload in corso
  | "completed"     // Upload completato
  | "error"         // Errore (verrà ritentato)
  | "failed";       // Fallito definitivamente dopo max retry

export interface PhotoQueueItem {
  // Identificatori
  id: string;                   // UUID temporaneo
  cleaningId: string;
  
  // File originale
  originalFile: File;
  originalSize: number;
  originalName: string;
  
  // Dati compressi (generati lato client)
  compressedBlob?: Blob;
  compressedSize?: number;
  thumbnailDataUrl?: string;    // Data URL per preview immediata
  
  // Metadata
  category: PhotoCategory;
  caption?: string;
  roomName?: string;
  isIssuePhoto: boolean;
  issueId?: string;
  
  // Stato upload
  status: PhotoUploadStatus;
  progress: number;             // 0-100
  error?: string;
  retryCount: number;
  maxRetries: number;           // Default: 3
  
  // Timestamp
  addedAt: number;              // timestamp ms
  startedAt?: number;
  completedAt?: number;
  
  // URL finale (dopo upload completato)
  uploadedUrl?: string;
  uploadedThumbnailUrl?: string;
  firestoreId?: string;         // ID documento in Firestore
}

// ═══════════════════════════════════════════════════════════════
// UPLOAD QUEUE STATE - Stato globale della coda
// ═══════════════════════════════════════════════════════════════

export interface PhotoUploadQueueState {
  // Items nella coda
  items: PhotoQueueItem[];
  
  // Statistiche
  totalItems: number;
  completedItems: number;
  failedItems: number;
  
  // Stato
  isProcessing: boolean;
  isPaused: boolean;
  
  // Configurazione
  maxConcurrentUploads: number; // Default: 2
  compressionConfig: PhotoCompressionConfig;
  
  // Errori globali
  globalError?: string;
}

export const INITIAL_QUEUE_STATE: PhotoUploadQueueState = {
  items: [],
  totalItems: 0,
  completedItems: 0,
  failedItems: 0,
  isProcessing: false,
  isPaused: false,
  maxConcurrentUploads: 2,
  compressionConfig: DEFAULT_COMPRESSION_CONFIG,
};

// ═══════════════════════════════════════════════════════════════
// UPLOAD EVENTS - Eventi per tracking UI
// ═══════════════════════════════════════════════════════════════

export type PhotoUploadEventType = 
  | "added"           // Foto aggiunta alla coda
  | "compression_start"
  | "compression_complete"
  | "upload_start"
  | "upload_progress"
  | "upload_complete"
  | "upload_error"
  | "retry"
  | "failed"
  | "queue_complete"; // Tutte le foto caricate

export interface PhotoUploadEvent {
  type: PhotoUploadEventType;
  itemId: string;
  timestamp: number;
  data?: {
    progress?: number;
    error?: string;
    url?: string;
    retryCount?: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// DEVICE DETECTION - Rilevamento dispositivo
// ═══════════════════════════════════════════════════════════════

export interface DeviceCapabilities {
  isLowEndDevice: boolean;
  hasWeakConnection: boolean;
  estimatedUploadSpeed: number; // bytes/sec
  availableMemory?: number;     // MB
  deviceType: "mobile" | "tablet" | "desktop";
  browserSupportsWebP: boolean;
}

// ═══════════════════════════════════════════════════════════════
// OFFLINE SUPPORT - Supporto offline
// ═══════════════════════════════════════════════════════════════

export interface OfflinePhotoStore {
  cleaningId: string;
  photos: OfflineStoredPhoto[];
  savedAt: number;
  synced: boolean;
}

export interface OfflineStoredPhoto {
  id: string;
  compressedDataUrl: string;    // Foto compressa come data URL
  thumbnailDataUrl: string;
  category: PhotoCategory;
  caption?: string;
  roomName?: string;
  isIssuePhoto: boolean;
  issueId?: string;
  savedAt: number;
}

// ═══════════════════════════════════════════════════════════════
// PHOTO GALLERY - Per visualizzazione
// ═══════════════════════════════════════════════════════════════

export interface PhotoGalleryItem {
  id: string;
  url: string;
  thumbnailUrl: string;
  category: PhotoCategory;
  caption?: string;
  roomName?: string;
  isIssuePhoto: boolean;
  uploadedAt: Date;
  uploadedBy: string;
  uploadedByName?: string;
}

export interface PhotoGalleryState {
  photos: PhotoGalleryItem[];
  selectedPhotoId?: string;
  isLoading: boolean;
  error?: string;
  filters: {
    category?: PhotoCategory;
    isIssuePhoto?: boolean;
  };
  sortBy: "uploadedAt" | "category";
  sortOrder: "asc" | "desc";
}

// ═══════════════════════════════════════════════════════════════
// PHOTO REQUIREMENTS - Requisiti foto per completamento
// ═══════════════════════════════════════════════════════════════

export interface PhotoRequirements {
  minTotal: number;             // Minimo foto totali
  requiredCategories: PhotoCategory[];
  minPerCategory?: Record<PhotoCategory, number>;
}

export interface PhotoRequirementsValidation {
  isValid: boolean;
  totalPhotos: number;
  missingTotal: number;
  missingCategories: PhotoCategory[];
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════
// HELPER TYPES
// ═══════════════════════════════════════════════════════════════

export interface PhotoUploadResult {
  success: boolean;
  photoId?: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

export interface BatchUploadResult {
  totalAttempted: number;
  successful: number;
  failed: number;
  results: PhotoUploadResult[];
}

// ═══════════════════════════════════════════════════════════════
// PHOTO CATEGORY LABELS - Etichette per UI
// ═══════════════════════════════════════════════════════════════

export const PHOTO_CATEGORY_LABELS: Record<PhotoCategory, { label: string; icon: string }> = {
  entrance: { label: "Ingresso", icon: "🚪" },
  living: { label: "Soggiorno", icon: "🛋️" },
  kitchen: { label: "Cucina", icon: "🍳" },
  bedroom: { label: "Camera", icon: "🛏️" },
  bathroom: { label: "Bagno", icon: "🚿" },
  balcony: { label: "Balcone", icon: "🌿" },
  issue: { label: "Problema", icon: "⚠️" },
  before: { label: "Prima", icon: "📷" },
  after: { label: "Dopo", icon: "✨" },
  other: { label: "Altro", icon: "📸" },
};
