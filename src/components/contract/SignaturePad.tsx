/**
 * SignaturePad Component
 * 
 * Componente per la firma digitale disegnata su canvas.
 * Supporta mouse e touch (mobile).
 * 
 * Uso:
 * <SignaturePad 
 *   onSignatureChange={(base64) => setSignature(base64)} 
 *   width={400} 
 *   height={200} 
 * />
 */

"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";

// ==================== TIPI ====================

export interface SignaturePadProps {
  /** Callback chiamato quando la firma cambia */
  onSignatureChange: (base64: string | null) => void;
  
  /** Larghezza del canvas (default: 100%) */
  width?: number | string;
  
  /** Altezza del canvas (default: 200px) */
  height?: number;
  
  /** Colore del tratto (default: nero) */
  penColor?: string;
  
  /** Spessore del tratto (default: 2) */
  penWidth?: number;
  
  /** Colore di sfondo (default: bianco) */
  backgroundColor?: string;
  
  /** Placeholder text (default: "Firma qui") */
  placeholder?: string;
  
  /** Se il componente è disabilitato */
  disabled?: boolean;
  
  /** Classe CSS aggiuntiva */
  className?: string;
}

// ==================== COMPONENTE ====================

export function SignaturePad({
  onSignatureChange,
  width = "100%",
  height = 200,
  penColor = "#000000",
  penWidth = 2,
  backgroundColor = "#ffffff",
  placeholder = "Firma qui",
  disabled = false,
  className = "",
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [canvasWidth, setCanvasWidth] = useState(400);
  
  // Ultimo punto per disegno fluido
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  // ==================== INIZIALIZZAZIONE ====================
  
  // Imposta dimensioni canvas responsive
  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current && canvasRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        setCanvasWidth(containerWidth);
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        
        // Salva il contenuto corrente prima di ridimensionare
        const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
        
        // Imposta le dimensioni effettive del canvas
        canvas.width = containerWidth;
        canvas.height = height;
        
        // Ripristina lo sfondo
        if (ctx) {
          ctx.fillStyle = backgroundColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Ripristina il contenuto se c'era
          if (imageData && !isEmpty) {
            ctx.putImageData(imageData, 0, 0);
          }
        }
      }
    };

    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);
    
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, [height, backgroundColor, isEmpty]);

  // Inizializza il canvas con sfondo
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [backgroundColor]);

  // ==================== UTILITY ====================
  
  // Ottiene le coordinate relative al canvas
  const getCoordinates = useCallback((
    e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX: number, clientY: number;
    
    if ("touches" in e) {
      // Touch event
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      // Mouse event
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  // Disegna una linea
  const drawLine = useCallback((
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }, [penColor, penWidth]);

  // Esporta la firma come base64
  const exportSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) {
      onSignatureChange(null);
      return;
    }
    
    const base64 = canvas.toDataURL("image/png");
    onSignatureChange(base64);
  }, [isEmpty, onSignatureChange]);

  // ==================== EVENT HANDLERS ====================
  
  // Inizio disegno
  const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;
    
    setIsDrawing(true);
    setIsEmpty(false);
    lastPoint.current = coords;
  }, [disabled, getCoordinates]);

  // Durante il disegno
  const handleMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords || !lastPoint.current) return;
    
    drawLine(lastPoint.current, coords);
    lastPoint.current = coords;
  }, [isDrawing, disabled, getCoordinates, drawLine]);

  // Fine disegno
  const handleEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    
    e.preventDefault();
    setIsDrawing(false);
    lastPoint.current = null;
    
    // Esporta dopo un breve delay per assicurarsi che il disegno sia completo
    setTimeout(exportSignature, 100);
  }, [isDrawing, exportSignature]);

  // ==================== AZIONI ====================
  
  // Pulisce il canvas
  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    setIsEmpty(true);
    onSignatureChange(null);
  }, [backgroundColor, onSignatureChange]);

  // ==================== RENDER ====================
  
  return (
    <div 
      ref={containerRef}
      className={`relative ${className}`}
      style={{ width }}
    >
      {/* Canvas per la firma */}
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={height}
        className={`
          w-full rounded-lg border-2 border-dashed
          ${isEmpty ? "border-gray-300" : "border-sky-400"}
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-crosshair"}
          touch-none
        `}
        style={{ backgroundColor }}
        
        // Mouse events
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        
        // Touch events
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        onTouchCancel={handleEnd}
      />
      
      {/* Placeholder quando vuoto */}
      {isEmpty && !disabled && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-gray-400">
            <svg 
              className="mx-auto h-12 w-12 mb-2" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={1.5} 
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" 
              />
            </svg>
            <p className="text-sm font-medium">{placeholder}</p>
            <p className="text-xs mt-1">Disegna con il mouse o il dito</p>
          </div>
        </div>
      )}
      
      {/* Bottone cancella */}
      {!isEmpty && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          className="
            absolute top-2 right-2 
            p-2 rounded-full 
            bg-white/80 hover:bg-white 
            text-gray-600 hover:text-red-500
            shadow-sm border border-gray-200
            transition-colors
          "
          title="Cancella firma"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" 
            />
          </svg>
        </button>
      )}
      
      {/* Indicatore stato */}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
        <span>
          {isEmpty ? "Nessuna firma" : "✓ Firma inserita"}
        </span>
        {!isEmpty && (
          <button
            type="button"
            onClick={handleClear}
            className="text-sky-600 hover:text-sky-700 font-medium"
          >
            Cancella e ricomincia
          </button>
        )}
      </div>
    </div>
  );
}

export default SignaturePad;
