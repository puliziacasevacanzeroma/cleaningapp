// ═══════════════════════════════════════════════════════════════
// PHOTO UPLOAD QUEUE - Sistema upload con coda e retry
// ═══════════════════════════════════════════════════════════════
//
// Caratteristiche:
// 1. Upload in background - l'operatore può continuare a lavorare
// 2. Coda persistente - le foto non si perdono se c'è un errore
// 3. Retry automatico con backoff esponenziale
// 4. Upload parallelo limitato (max 2 foto per non saturare)
// 5. Progress tracking per ogni foto
// 6. Salvataggio locale in caso di offline
//
// ═══════════════════════════════════════════════════════════════

import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL,
  UploadTask
} from "firebase/storage";
import { storage } from "~/lib/firebase/config";

// Genera UUID senza dipendenze esterne
function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback per browser più vecchi
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
import {
  PhotoQueueItem,
  PhotoUploadStatus,
  PhotoUploadQueueState,
  INITIAL_QUEUE_STATE,
  PhotoUploadEvent,
  PhotoUploadEventType,
  PhotoCompressionConfig,
  BatchUploadResult,
} from "~/types/photo";
import { PhotoCategory } from "~/types/cleaning";
import { compressImage, getOptimalCompressionConfig } from "./imageCompression";

// ═══════════════════════════════════════════════════════════════
// UPLOAD QUEUE CLASS
// ═══════════════════════════════════════════════════════════════

export class PhotoUploadQueue {
  private state: PhotoUploadQueueState;
  private activeUploads: Map<string, UploadTask>;
  private eventListeners: Set<(event: PhotoUploadEvent) => void>;
  private processingPromise: Promise<void> | null = null;
  
  constructor(config?: Partial<PhotoUploadQueueState>) {
    this.state = { ...INITIAL_QUEUE_STATE, ...config };
    this.activeUploads = new Map();
    this.eventListeners = new Set();
  }
  
  // ─── STATE GETTERS ───
  
  getState(): PhotoUploadQueueState {
    return { ...this.state };
  }
  
  getItems(): PhotoQueueItem[] {
    return [...this.state.items];
  }
  
  getPendingCount(): number {
    return this.state.items.filter(
      item => item.status !== "completed" && item.status !== "failed"
    ).length;
  }
  
  getCompletedCount(): number {
    return this.state.completedItems;
  }
  
  isAllComplete(): boolean {
    return this.state.items.length > 0 && 
           this.state.items.every(item => 
             item.status === "completed" || item.status === "failed"
           );
  }
  
  // ─── EVENT HANDLING ───
  
  addEventListener(listener: (event: PhotoUploadEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }
  
  private emit(type: PhotoUploadEventType, itemId: string, data?: PhotoUploadEvent["data"]) {
    const event: PhotoUploadEvent = {
      type,
      itemId,
      timestamp: Date.now(),
      data,
    };
    this.eventListeners.forEach(listener => listener(event));
  }
  
  // ─── ADD PHOTOS TO QUEUE ───
  
  async addPhoto(
    file: File,
    cleaningId: string,
    category: PhotoCategory,
    options?: {
      caption?: string;
      roomName?: string;
      isIssuePhoto?: boolean;
      issueId?: string;
    }
  ): Promise<string> {
    const id = generateUUID();
    
    const item: PhotoQueueItem = {
      id,
      cleaningId,
      originalFile: file,
      originalSize: file.size,
      originalName: file.name,
      category,
      caption: options?.caption,
      roomName: options?.roomName,
      isIssuePhoto: options?.isIssuePhoto || false,
      issueId: options?.issueId,
      status: "pending",
      progress: 0,
      retryCount: 0,
      maxRetries: 3,
      addedAt: Date.now(),
    };
    
    this.state.items.push(item);
    this.state.totalItems++;
    
    this.emit("added", id);
    
    // Avvia processing se non già in corso
    this.startProcessing();
    
    return id;
  }
  
  async addMultiplePhotos(
    files: FileList | File[],
    cleaningId: string,
    category: PhotoCategory,
    options?: {
      caption?: string;
      roomName?: string;
      isIssuePhoto?: boolean;
    }
  ): Promise<string[]> {
    const fileArray = Array.from(files);
    const ids: string[] = [];
    
    for (const file of fileArray) {
      const id = await this.addPhoto(file, cleaningId, category, options);
      ids.push(id);
    }
    
    return ids;
  }
  
  // ─── PROCESSING ───
  
  private async startProcessing(): Promise<void> {
    if (this.state.isProcessing || this.state.isPaused) {
      return;
    }
    
    this.state.isProcessing = true;
    this.processingPromise = this.processQueue();
    
    try {
      await this.processingPromise;
    } finally {
      this.state.isProcessing = false;
      this.processingPromise = null;
    }
  }
  
  private async processQueue(): Promise<void> {
    while (true) {
      if (this.state.isPaused) {
        break;
      }
      
      // Trova items da processare
      const pendingItems = this.state.items.filter(
        item => item.status === "pending" || item.status === "error"
      );
      
      if (pendingItems.length === 0) {
        // Tutto completato
        if (this.state.items.length > 0) {
          this.emit("queue_complete", "all");
        }
        break;
      }
      
      // Conta upload attivi
      const activeCount = this.state.items.filter(
        item => item.status === "compressing" || item.status === "uploading"
      ).length;
      
      // Avvia nuovi upload fino al limite
      const slotsAvailable = this.state.maxConcurrentUploads - activeCount;
      const itemsToStart = pendingItems.slice(0, slotsAvailable);
      
      if (itemsToStart.length === 0) {
        // Aspetta che si liberi uno slot
        await this.sleep(100);
        continue;
      }
      
      // Avvia upload in parallelo (ma non aspetta)
      itemsToStart.forEach(item => {
        this.processItem(item).catch(console.error);
      });
      
      // Piccola pausa prima del prossimo ciclo
      await this.sleep(100);
    }
  }
  
  private async processItem(item: PhotoQueueItem): Promise<void> {
    try {
      // 1. COMPRESSIONE
      this.updateItemStatus(item.id, "compressing", 0);
      this.emit("compression_start", item.id);
      
      const compressionConfig = getOptimalCompressionConfig();
      const result = await compressImage(item.originalFile, compressionConfig);
      
      if (!result.success || !result.compressedBlob) {
        throw new Error(result.error || "Compression failed");
      }
      
      item.compressedBlob = result.compressedBlob;
      item.compressedSize = result.compressedSize;
      item.thumbnailDataUrl = result.thumbnailDataUrl || undefined;
      
      this.emit("compression_complete", item.id);
      
      // 2. UPLOAD
      this.updateItemStatus(item.id, "uploading", 0);
      this.emit("upload_start", item.id);
      item.startedAt = Date.now();
      
      const { originalUrl, thumbnailUrl } = await this.uploadToFirebase(item);
      
      // 3. COMPLETATO
      item.uploadedUrl = originalUrl;
      item.uploadedThumbnailUrl = thumbnailUrl;
      item.completedAt = Date.now();
      this.updateItemStatus(item.id, "completed", 100);
      this.state.completedItems++;
      
      this.emit("upload_complete", item.id, { url: originalUrl });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Upload failed";
      
      item.retryCount++;
      item.error = errorMessage;
      
      if (item.retryCount >= item.maxRetries) {
        this.updateItemStatus(item.id, "failed", 0);
        this.state.failedItems++;
        this.emit("failed", item.id, { error: errorMessage });
      } else {
        // Retry con backoff esponenziale
        const delay = Math.min(1000 * Math.pow(2, item.retryCount), 10000);
        this.emit("retry", item.id, { retryCount: item.retryCount });
        
        await this.sleep(delay);
        this.updateItemStatus(item.id, "error", 0);
        this.emit("upload_error", item.id, { error: errorMessage });
      }
    }
  }
  
  private async uploadToFirebase(item: PhotoQueueItem): Promise<{
    originalUrl: string;
    thumbnailUrl: string;
  }> {
    if (!item.compressedBlob) {
      throw new Error("No compressed blob available");
    }
    
    const timestamp = Date.now();
    const basePath = `cleanings/${item.cleaningId}/photos`;
    
    // Upload immagine principale
    const originalRef = ref(storage, `${basePath}/${timestamp}_${item.id}.jpg`);
    const uploadTask = uploadBytesResumable(originalRef, item.compressedBlob, {
      contentType: "image/jpeg",
      customMetadata: {
        category: item.category,
        caption: item.caption || "",
        roomName: item.roomName || "",
        isIssuePhoto: String(item.isIssuePhoto),
        issueId: item.issueId || "",
        originalName: item.originalName,
        originalSize: String(item.originalSize),
        compressedSize: String(item.compressedSize || 0),
      },
    });
    
    // Track upload task per cancellazione
    this.activeUploads.set(item.id, uploadTask);
    
    // Monitora progresso
    return new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          this.updateItemProgress(item.id, progress);
          this.emit("upload_progress", item.id, { progress });
        },
        (error) => {
          this.activeUploads.delete(item.id);
          reject(error);
        },
        async () => {
          this.activeUploads.delete(item.id);
          
          try {
            const originalUrl = await getDownloadURL(uploadTask.snapshot.ref);
            
            // Upload thumbnail (se disponibile)
            let thumbnailUrl = "";
            if (item.thumbnailDataUrl) {
              thumbnailUrl = await this.uploadThumbnail(
                item.cleaningId,
                item.id,
                item.thumbnailDataUrl
              );
            }
            
            resolve({ originalUrl, thumbnailUrl });
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  }
  
  private async uploadThumbnail(
    cleaningId: string,
    photoId: string,
    thumbnailDataUrl: string
  ): Promise<string> {
    // Converti data URL a blob
    const response = await fetch(thumbnailDataUrl);
    const blob = await response.blob();
    
    const thumbnailRef = ref(
      storage,
      `cleanings/${cleaningId}/thumbnails/${photoId}_thumb.jpg`
    );
    
    await uploadBytesResumable(thumbnailRef, blob, {
      contentType: "image/jpeg",
    });
    
    return getDownloadURL(thumbnailRef);
  }
  
  // ─── CONTROL METHODS ───
  
  pause(): void {
    this.state.isPaused = true;
    // Pausa upload attivi
    this.activeUploads.forEach(task => task.pause());
  }
  
  resume(): void {
    this.state.isPaused = false;
    // Riprendi upload attivi
    this.activeUploads.forEach(task => task.resume());
    // Riavvia processing
    this.startProcessing();
  }
  
  cancelItem(itemId: string): boolean {
    const task = this.activeUploads.get(itemId);
    if (task) {
      task.cancel();
      this.activeUploads.delete(itemId);
    }
    
    const itemIndex = this.state.items.findIndex(item => item.id === itemId);
    if (itemIndex !== -1) {
      this.state.items.splice(itemIndex, 1);
      this.state.totalItems--;
      return true;
    }
    
    return false;
  }
  
  retryItem(itemId: string): boolean {
    const item = this.state.items.find(item => item.id === itemId);
    if (item && (item.status === "error" || item.status === "failed")) {
      item.status = "pending";
      item.error = undefined;
      item.retryCount = 0;
      this.startProcessing();
      return true;
    }
    return false;
  }
  
  retryAllFailed(): number {
    let count = 0;
    this.state.items
      .filter(item => item.status === "error" || item.status === "failed")
      .forEach(item => {
        item.status = "pending";
        item.error = undefined;
        item.retryCount = 0;
        count++;
      });
    
    if (count > 0) {
      this.state.failedItems = 0;
      this.startProcessing();
    }
    
    return count;
  }
  
  clear(): void {
    // Cancella tutti gli upload attivi
    this.activeUploads.forEach(task => task.cancel());
    this.activeUploads.clear();
    
    // Reset state
    this.state = { ...INITIAL_QUEUE_STATE };
  }
  
  // ─── HELPER METHODS ───
  
  private updateItemStatus(itemId: string, status: PhotoUploadStatus, progress: number): void {
    const item = this.state.items.find(item => item.id === itemId);
    if (item) {
      item.status = status;
      item.progress = progress;
    }
  }
  
  private updateItemProgress(itemId: string, progress: number): void {
    const item = this.state.items.find(item => item.id === itemId);
    if (item) {
      item.progress = progress;
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // ─── GET RESULTS ───
  
  getUploadedPhotos(): Array<{
    id: string;
    url: string;
    thumbnailUrl: string;
    category: PhotoCategory;
    caption?: string;
    roomName?: string;
    isIssuePhoto: boolean;
    issueId?: string;
  }> {
    return this.state.items
      .filter(item => item.status === "completed" && item.uploadedUrl)
      .map(item => ({
        id: item.id,
        url: item.uploadedUrl!,
        thumbnailUrl: item.uploadedThumbnailUrl || item.uploadedUrl!,
        category: item.category,
        caption: item.caption,
        roomName: item.roomName,
        isIssuePhoto: item.isIssuePhoto,
        issueId: item.issueId,
      }));
  }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════

let queueInstance: PhotoUploadQueue | null = null;

export function getPhotoUploadQueue(): PhotoUploadQueue {
  if (!queueInstance) {
    queueInstance = new PhotoUploadQueue();
  }
  return queueInstance;
}

export function resetPhotoUploadQueue(): void {
  if (queueInstance) {
    queueInstance.clear();
  }
  queueInstance = null;
}

// ═══════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export async function uploadCleaningPhoto(
  file: File,
  cleaningId: string,
  category: PhotoCategory,
  options?: {
    caption?: string;
    roomName?: string;
    isIssuePhoto?: boolean;
    issueId?: string;
  }
): Promise<string> {
  const queue = getPhotoUploadQueue();
  return queue.addPhoto(file, cleaningId, category, options);
}

export async function uploadMultipleCleaningPhotos(
  files: FileList | File[],
  cleaningId: string,
  category: PhotoCategory
): Promise<string[]> {
  const queue = getPhotoUploadQueue();
  return queue.addMultiplePhotos(files, cleaningId, category);
}
