// ═══════════════════════════════════════════════════════════════
// PHOTOS UTILITIES INDEX
// ═══════════════════════════════════════════════════════════════

// Image compression
export {
  compressImage,
  compressMultipleImages,
  detectLowEndDevice,
  getOptimalCompressionConfig,
  fixImageOrientation,
  type CompressionResult,
} from "./imageCompression";

// Upload queue
export {
  PhotoUploadQueue,
  getPhotoUploadQueue,
  resetPhotoUploadQueue,
  uploadCleaningPhoto,
  uploadMultipleCleaningPhotos,
} from "./uploadQueue";
