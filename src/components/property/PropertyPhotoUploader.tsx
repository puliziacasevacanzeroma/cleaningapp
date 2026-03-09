"use client";

import { useState, useRef, useCallback } from "react";
import { compressImage } from "~/lib/photos/imageCompression";

// ═══════════════════════════════════════════════════════════════
// PROPERTY PHOTO UPLOADER - Upload foto proprietà (porta, palazzo)
// ═══════════════════════════════════════════════════════════════

interface PropertyPhotoUploaderProps {
  propertyId: string;
  photoType: "door" | "building";
  currentPhotoUrl?: string;
  onPhotoUploaded: (url: string) => void;
  onPhotoRemoved: () => void;
  label: string;
  description?: string;
  isRequired?: boolean;
}

export function PropertyPhotoUploader({
  propertyId,
  photoType,
  currentPhotoUrl,
  onPhotoUploaded,
  onPhotoRemoved,
  label,
  description,
  isRequired = false,
}: PropertyPhotoUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentPhotoUrl || null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Gestisce la selezione del file
  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Seleziona un'immagine valida (JPG, PNG, WebP)");
      return;
    }

    // Max 10MB prima della compressione
    if (file.size > 10 * 1024 * 1024) {
      setError("L'immagine è troppo grande. Massimo 10MB.");
      return;
    }

    setError(null);
    setIsUploading(true);
    setUploadProgress(10);

    try {
      // 1. Comprimi l'immagine
      setUploadProgress(20);
      const compressionResult = await compressImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8,
        maxFileSize: 500 * 1024, // 500KB max dopo compressione
        outputFormat: "jpeg",
        thumbnailWidth: 200,
        thumbnailHeight: 200,
        thumbnailQuality: 0.6,
      });

      if (!compressionResult.success || !compressionResult.compressedBlob) {
        throw new Error("Errore durante la compressione dell'immagine");
      }

      // 2. Mostra preview immediata
      const localPreview = URL.createObjectURL(compressionResult.compressedBlob);
      setPreviewUrl(localPreview);
      setUploadProgress(40);

      // 3. Upload su Firebase Storage
      const formData = new FormData();
      formData.append("file", compressionResult.compressedBlob, `${photoType}.jpg`);
      formData.append("propertyId", propertyId);
      formData.append("photoType", photoType);

      setUploadProgress(60);

      const response = await fetch("/api/properties/upload-photo", {
        method: "POST",
        body: formData,
      });

      setUploadProgress(90);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Errore durante l'upload");
      }

      const result = await response.json();
      setUploadProgress(100);

      // 4. Notifica il parent con l'URL finale
      onPhotoUploaded(result.url);

      // Pulisci preview locale
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(result.url);

    } catch (err) {
      console.error("Errore upload foto:", err);
      setError(err instanceof Error ? err.message : "Errore durante l'upload");
      setPreviewUrl(currentPhotoUrl || null);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [propertyId, photoType, currentPhotoUrl, onPhotoUploaded]);

  // Gestisce il click sull'area di upload
  const handleClick = () => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  };

  // Gestisce il cambio del file input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // Reset input per permettere di ricaricare lo stesso file
    e.target.value = "";
  };

  // Drag & Drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Rimuove la foto
  const handleRemove = () => {
    setPreviewUrl(null);
    setError(null);
    onPhotoRemoved();
  };

  return (
    <div className="space-y-2">
      {/* Label */}
      <label className="block text-sm font-medium text-slate-700">
        {label}
        {isRequired && <span className="text-rose-500 ml-1">*</span>}
      </label>

      {description && (
        <p className="text-xs text-slate-500">{description}</p>
      )}

      {/* Area Upload / Preview */}
      <div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          relative rounded-xl border-2 border-dashed transition-all cursor-pointer
          ${isDragging 
            ? "border-sky-500 bg-sky-50" 
            : previewUrl 
              ? "border-slate-200 bg-slate-50" 
              : "border-slate-300 hover:border-sky-400 hover:bg-sky-50"
          }
          ${isUploading ? "pointer-events-none opacity-70" : ""}
        `}
      >
        {/* Se c'è una foto */}
        {previewUrl ? (
          <div className="relative aspect-video">
            <img
              src={previewUrl}
              alt={label}
              className="w-full h-full object-cover rounded-lg"
            />
            
            {/* Overlay con azioni */}
            <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-all rounded-lg flex items-center justify-center opacity-0 hover:opacity-100">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="px-3 py-2 bg-white text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-all"
                >
                  📷 Cambia
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove();
                  }}
                  className="px-3 py-2 bg-rose-500 text-white rounded-lg text-sm font-medium hover:bg-rose-600 transition-all"
                >
                  🗑️ Rimuovi
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Se non c'è foto - Area upload */
          <div className="flex flex-col items-center justify-center py-8 px-4">
            <div className={`
              w-16 h-16 rounded-full flex items-center justify-center mb-3
              ${photoType === "door" ? "bg-amber-100" : "bg-slate-100"}
            `}>
              {photoType === "door" ? (
                <span className="text-3xl">🚪</span>
              ) : (
                <span className="text-3xl">🏢</span>
              )}
            </div>
            
            <p className="text-sm font-medium text-slate-700 mb-1">
              {isDragging ? "Rilascia qui" : "Clicca o trascina un'immagine"}
            </p>
            <p className="text-xs text-slate-500">
              JPG, PNG o WebP • Max 10MB
            </p>
          </div>
        )}

        {/* Progress bar durante upload */}
        {isUploading && (
          <div className="absolute inset-0 bg-white/80 rounded-lg flex flex-col items-center justify-center">
            <div className="w-3/4 h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-sky-500 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-sm text-slate-600">
              {uploadProgress < 40 ? "Compressione..." : "Upload in corso..."}
            </p>
          </div>
        )}
      </div>

      {/* Errore */}
      {error && (
        <p className="text-sm text-rose-600 flex items-center gap-1">
          <span>⚠️</span> {error}
        </p>
      )}

      {/* Input file nascosto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  );
}
