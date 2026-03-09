"use client";

import { useState } from "react";

// ═══════════════════════════════════════════════════════════════
// PROPERTY ACCESS CARD - Banner riutilizzabile per info accesso
// Usato da: Admin, Proprietario, Operatore, Rider
// ═══════════════════════════════════════════════════════════════

interface PropertyAccessData {
  // Indirizzo e posizione
  address?: string;
  city?: string;
  postalCode?: string;
  floor?: string;
  apartment?: string;
  intercom?: string;
  
  // Info accesso
  doorCode?: string;
  keysLocation?: string;
  accessNotes?: string;
  
  // Foto
  images?: {
    door?: string;
    building?: string;
  };
}

interface PropertyAccessCardProps {
  property: PropertyAccessData;
  editable?: boolean;
  onEdit?: () => void;
  compact?: boolean; // Per vista ridotta (solo foto porta e indirizzo)
  className?: string;
}

// Icone SVG inline
const Icons = {
  edit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <path d="M11 4H4C2.9 4 2 4.9 2 6V20C2 21.1 2.9 22 4 22H18C19.1 22 20 21.1 20 20V13"/>
      <path d="M18.5 2.5C19.3 1.7 20.7 1.7 21.5 2.5C22.3 3.3 22.3 4.7 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z"/>
    </svg>
  ),
  navigate: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22S19 14.25 19 9C19 5.13 15.87 2 12 2Z" fill="currentColor" opacity="0.15"/>
      <circle cx="12" cy="9" r="2.5"/>
      <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22S19 14.25 19 9C19 5.13 15.87 2 12 2Z"/>
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <rect x="9" y="9" width="13" height="13" rx="2" fill="currentColor" opacity="0.1"/>
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4C2.9 15 2 14.1 2 13V4C2 2.9 2.9 2 4 2H13C14.1 2 15 2.9 15 4V5"/>
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-full h-full">
      <path d="M5 13L9 17L19 7"/>
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full">
      <path d="M18 6L6 18M6 6L18 18"/>
    </svg>
  ),
  expand: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
    </svg>
  ),
};

export default function PropertyAccessCard({ 
  property, 
  editable = false, 
  onEdit,
  compact = false,
  className = ""
}: PropertyAccessCardProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  
  const hasData = property.images?.door || property.images?.building || 
                  property.doorCode || property.keysLocation || property.accessNotes;
  
  const fullAddress = [
    property.address,
    property.postalCode,
    property.city
  ].filter(Boolean).join(", ");

  // Copia testo negli appunti
  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error("Errore copia:", err);
    }
  };

  // Apri Google Maps
  const openGoogleMaps = () => {
    const query = encodeURIComponent(fullAddress || property.address || "");
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
  };

  // Lightbox per foto
  const openLightbox = (imageUrl: string) => {
    setLightboxImage(imageUrl);
    document.body.style.overflow = "hidden";
  };

  const closeLightbox = () => {
    setLightboxImage(null);
    document.body.style.overflow = "";
  };

  // ═══════════════════════════════════════════════════════════════
  // STATO VUOTO - Placeholder
  // ═══════════════════════════════════════════════════════════════
  if (!hasData && editable) {
    return (
      <div className={`bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 overflow-hidden ${className}`}>
        <div className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-amber-100 flex items-center justify-center">
              <span className="text-2xl">🔐</span>
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Accesso Proprietà</h3>
              <p className="text-sm text-amber-600">Aggiungi foto e istruzioni per operatori</p>
            </div>
          </div>
          <button
            onClick={onEdit}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold rounded-xl hover:from-amber-600 hover:to-orange-600 active:scale-95 transition-all flex items-center gap-2"
          >
            <span className="text-base">➕</span>
            Aggiungi
          </button>
        </div>
      </div>
    );
  }

  // Se non ci sono dati e non è editabile, non mostrare nulla
  if (!hasData && !editable) {
    return null;
  }

  // ═══════════════════════════════════════════════════════════════
  // VISTA COMPATTA (solo foto porta + indirizzo)
  // ═══════════════════════════════════════════════════════════════
  if (compact) {
    return (
      <>
        <div className={`bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 overflow-hidden ${className}`}>
          <div className="p-4">
            <div className="flex items-start gap-4">
              {/* Foto porta */}
              {property.images?.door ? (
                <div 
                  className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 cursor-pointer relative group"
                  onClick={() => openLightbox(property.images!.door!)}
                >
                  <img 
                    src={property.images.door} 
                    alt="Porta" 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-6 h-6 text-white">{Icons.expand}</div>
                  </div>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-3xl">🚪</span>
                </div>
              )}
              
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{property.address}</p>
                {(property.floor || property.apartment) && (
                  <p className="text-xs text-slate-600 mt-0.5">
                    {[
                      property.floor && `Piano ${property.floor}`,
                      property.apartment && `Int. ${property.apartment}`
                    ].filter(Boolean).join(" • ")}
                  </p>
                )}
                {property.doorCode && (
                  <button
                    onClick={() => copyToClipboard(property.doorCode!, "doorCode")}
                    className="mt-2 px-3 py-1.5 bg-white rounded-lg text-sm font-mono font-bold text-amber-700 border border-amber-200 hover:bg-amber-50 active:scale-95 transition-all flex items-center gap-2"
                  >
                    🚪 {property.doorCode}
                    <div className="w-4 h-4 text-amber-500">
                      {copied === "doorCode" ? Icons.check : Icons.copy}
                    </div>
                  </button>
                )}
              </div>
              
              {/* Bottone Naviga */}
              <button
                onClick={openGoogleMaps}
                className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 active:scale-95 transition-all flex-shrink-0"
              >
                <div className="w-6 h-6">{Icons.navigate}</div>
              </button>
            </div>
          </div>
        </div>

        {/* Lightbox */}
        {lightboxImage && (
          <div 
            className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4"
            onClick={closeLightbox}
          >
            <button 
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"
              onClick={closeLightbox}
            >
              <div className="w-5 h-5 text-white">{Icons.close}</div>
            </button>
            <img 
              src={lightboxImage} 
              alt="Foto ingrandita" 
              className="max-w-full max-h-full object-contain rounded-xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // VISTA COMPLETA (Banner con tutte le info)
  // ═══════════════════════════════════════════════════════════════
  return (
    <>
      <div className={`bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 overflow-hidden ${className}`}>
        {/* Header */}
        <div className="p-4 border-b border-amber-200/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <span className="text-xl">🔐</span>
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Accesso Proprietà</h3>
              <p className="text-xs text-amber-600">Info per operatori e rider</p>
            </div>
          </div>
          {editable && onEdit && (
            <button
              onClick={onEdit}
              className="px-3 py-2 bg-white border border-amber-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-amber-50 active:scale-95 transition-all flex items-center gap-2"
            >
              <div className="w-4 h-4">{Icons.edit}</div>
              Modifica
            </button>
          )}
        </div>
        
        {/* Contenuto */}
        <div className="p-4 space-y-4">
          {/* Foto */}
          {(property.images?.door || property.images?.building) && (
            <div className="flex gap-3">
              {/* Foto Porta (più grande) */}
              {property.images?.door && (
                <div 
                  className="flex-1 aspect-[4/3] max-w-[180px] rounded-xl overflow-hidden cursor-pointer relative group border-2 border-amber-200"
                  onClick={() => openLightbox(property.images!.door!)}
                >
                  <img 
                    src={property.images.door} 
                    alt="Porta" 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-8 h-8 text-white">{Icons.expand}</div>
                  </div>
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded-lg text-xs text-white font-medium">
                    🚪 Porta
                  </div>
                </div>
              )}
              
              {/* Foto Palazzo */}
              {property.images?.building && (
                <div 
                  className="w-24 aspect-square rounded-xl overflow-hidden cursor-pointer relative group border-2 border-amber-100"
                  onClick={() => openLightbox(property.images!.building!)}
                >
                  <img 
                    src={property.images.building} 
                    alt="Palazzo" 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-6 h-6 text-white">{Icons.expand}</div>
                  </div>
                  <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/50 rounded text-[10px] text-white font-medium">
                    🏢
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Indirizzo + Naviga */}
          <div className="bg-white rounded-xl p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{property.address}</p>
              {(property.city || property.postalCode) && (
                <p className="text-xs text-slate-500">
                  {[property.postalCode, property.city].filter(Boolean).join(" ")}
                </p>
              )}
            </div>
            <button
              onClick={openGoogleMaps}
              className="px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 active:scale-95 transition-all flex items-center gap-2 flex-shrink-0"
            >
              <div className="w-4 h-4">{Icons.navigate}</div>
              Naviga
            </button>
          </div>
          
          {/* Piano / Interno / Citofono */}
          {(property.floor || property.apartment || property.intercom) && (
            <div className="grid grid-cols-3 gap-2">
              {property.floor && (
                <div className="bg-white rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-500 uppercase font-medium">Piano</p>
                  <p className="text-lg font-bold text-slate-800">{property.floor}</p>
                </div>
              )}
              {property.apartment && (
                <div className="bg-white rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-500 uppercase font-medium">Interno</p>
                  <p className="text-lg font-bold text-slate-800">{property.apartment}</p>
                </div>
              )}
              {property.intercom && (
                <div className="bg-white rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-500 uppercase font-medium">Citofono</p>
                  <p className="text-lg font-bold text-slate-800">{property.intercom}</p>
                </div>
              )}
            </div>
          )}
          
          {/* Codice Porta */}
          {property.doorCode && (
            <button
              onClick={() => copyToClipboard(property.doorCode!, "doorCode")}
              className="w-full bg-white rounded-xl p-3 flex items-center justify-between hover:bg-slate-50 active:scale-[0.99] transition-all border border-amber-100"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🚪</span>
                <div className="text-left">
                  <p className="text-[10px] text-slate-500 uppercase font-medium">Codice Porta</p>
                  <p className="text-xl font-mono font-bold text-amber-700">{property.doorCode}</p>
                </div>
              </div>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${copied === "doorCode" ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                <div className="w-5 h-5">{copied === "doorCode" ? Icons.check : Icons.copy}</div>
              </div>
            </button>
          )}
          
          {/* Posizione Chiavi */}
          {property.keysLocation && (
            <button
              onClick={() => copyToClipboard(property.keysLocation!, "keysLocation")}
              className="w-full bg-white rounded-xl p-3 flex items-center justify-between hover:bg-slate-50 active:scale-[0.99] transition-all border border-amber-100"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🔑</span>
                <div className="text-left">
                  <p className="text-[10px] text-slate-500 uppercase font-medium">Posizione Chiavi</p>
                  <p className="text-sm font-semibold text-slate-800">{property.keysLocation}</p>
                </div>
              </div>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${copied === "keysLocation" ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                <div className="w-5 h-5">{copied === "keysLocation" ? Icons.check : Icons.copy}</div>
              </div>
            </button>
          )}
          
          {/* Istruzioni Accesso */}
          {property.accessNotes && (
            <div className="bg-white rounded-xl p-3 border border-amber-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">📝</span>
                <p className="text-[10px] text-slate-500 uppercase font-medium">Istruzioni di Accesso</p>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{property.accessNotes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <button 
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"
            onClick={closeLightbox}
          >
            <div className="w-5 h-5 text-white">{Icons.close}</div>
          </button>
          <img 
            src={lightboxImage} 
            alt="Foto ingrandita" 
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
