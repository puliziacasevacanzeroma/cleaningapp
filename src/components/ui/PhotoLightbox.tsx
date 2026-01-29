"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface PhotoLightboxProps {
  photos: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  propertyName?: string;
}

export function PhotoLightbox({ 
  photos, 
  initialIndex = 0, 
  isOpen, 
  onClose,
  propertyName 
}: PhotoLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isAnimating, setIsAnimating] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Minimo swipe per cambiare foto (in pixel)
  const minSwipeDistance = 50;

  // Reset quando si apre
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setIsClosing(false);
      setImageLoaded(false);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, initialIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === 'ArrowLeft') {
        goToPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, photos.length]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 200);
  }, [onClose]);

  const goToNext = useCallback(() => {
    if (isAnimating || currentIndex >= photos.length - 1) return;
    setIsAnimating(true);
    setImageLoaded(false);
    setCurrentIndex(prev => prev + 1);
    setTimeout(() => setIsAnimating(false), 300);
  }, [currentIndex, photos.length, isAnimating]);

  const goToPrev = useCallback(() => {
    if (isAnimating || currentIndex <= 0) return;
    setIsAnimating(true);
    setImageLoaded(false);
    setCurrentIndex(prev => prev - 1);
    setTimeout(() => setIsAnimating(false), 300);
  }, [currentIndex, isAnimating]);

  // Touch handlers per swipe
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    setIsDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const currentTouch = e.targetTouches[0].clientX;
    setTouchEnd(currentTouch);
    setDragOffset(currentTouch - touchStart);
  };

  const onTouchEnd = () => {
    setIsDragging(false);
    setDragOffset(0);
    
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe && currentIndex < photos.length - 1) {
      goToNext();
    } else if (isRightSwipe && currentIndex > 0) {
      goToPrev();
    }
    
    setTouchStart(null);
    setTouchEnd(null);
  };

  // Click sul background per chiudere
  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === containerRef.current) {
      handleClose();
    }
  };

  if (!isOpen || photos.length === 0) return null;

  return (
    <div 
      ref={containerRef}
      onClick={handleBackgroundClick}
      className={`fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm flex flex-col transition-opacity duration-200 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
            <span className="text-xl">📷</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm">
              {propertyName || 'Foto Pulizia'}
            </p>
            <p className="text-white/60 text-xs">
              {currentIndex + 1} di {photos.length}
            </p>
          </div>
        </div>
        
        {/* Close button */}
        <button
          onClick={handleClose}
          className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur flex items-center justify-center text-white transition-all active:scale-95"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Main Image Area */}
      <div 
        className="flex-1 flex items-center justify-center relative overflow-hidden px-4"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Loading indicator */}
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
          </div>
        )}

        {/* Image */}
        <div 
          className={`relative transition-all duration-300 ease-out ${
            isAnimating ? 'scale-95 opacity-50' : 'scale-100 opacity-100'
          }`}
          style={{
            transform: isDragging ? `translateX(${dragOffset}px)` : undefined
          }}
        >
          <img
            src={photos[currentIndex]}
            alt={`Foto ${currentIndex + 1}`}
            className={`max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl transition-opacity duration-300 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setImageLoaded(true)}
            draggable={false}
          />
        </div>

        {/* Navigation Arrows - Desktop */}
        {photos.length > 1 && (
          <>
            {/* Previous */}
            <button
              onClick={goToPrev}
              disabled={currentIndex === 0}
              className={`hidden md:flex absolute left-4 w-14 h-14 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur items-center justify-center text-white transition-all ${
                currentIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110 active:scale-95'
              }`}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Next */}
            <button
              onClick={goToNext}
              disabled={currentIndex === photos.length - 1}
              className={`hidden md:flex absolute right-4 w-14 h-14 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur items-center justify-center text-white transition-all ${
                currentIndex === photos.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110 active:scale-95'
              }`}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Footer - Thumbnails & Dots */}
      <div className="flex-shrink-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        {/* Mobile: Dots indicator */}
        {photos.length > 1 && photos.length <= 10 && (
          <div className="flex md:hidden justify-center gap-2 mb-3">
            {photos.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setImageLoaded(false);
                  setCurrentIndex(idx);
                }}
                className={`transition-all duration-200 rounded-full ${
                  idx === currentIndex 
                    ? 'w-8 h-2 bg-white' 
                    : 'w-2 h-2 bg-white/40 hover:bg-white/60'
                }`}
              />
            ))}
          </div>
        )}

        {/* Thumbnails - Desktop & Tablet */}
        {photos.length > 1 && (
          <div className="hidden md:flex justify-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {photos.map((photo, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setImageLoaded(false);
                  setCurrentIndex(idx);
                }}
                className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden transition-all duration-200 ${
                  idx === currentIndex 
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-110' 
                    : 'opacity-50 hover:opacity-80'
                }`}
              >
                <img
                  src={photo}
                  alt={`Thumbnail ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {/* Mobile: Swipe hint */}
        {photos.length > 1 && (
          <p className="md:hidden text-center text-white/50 text-xs mt-2">
            ← Scorri per vedere le altre foto →
          </p>
        )}

        {/* Counter for mobile with many photos */}
        {photos.length > 10 && (
          <div className="md:hidden text-center">
            <span className="bg-white/20 backdrop-blur px-4 py-2 rounded-full text-white text-sm font-medium">
              {currentIndex + 1} / {photos.length}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default PhotoLightbox;
