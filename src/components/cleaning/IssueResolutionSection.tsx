"use client";

import { useState, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Issue {
  id: string;
  type: 'damage' | 'missing_item' | 'maintenance' | 'cleanliness' | 'safety' | 'other';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  photos: string[];
  reportedByName: string;
  reportedAt: string;
  resolved: boolean;
}

interface IssueResolution {
  issueId: string;
  resolved: boolean;
  notes: string;
  photos: string[];
}

interface IssueResolutionSectionProps {
  issues: Issue[];
  onResolutionsChange: (resolutions: IssueResolution[]) => void;
  cleaningId: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const ISSUE_TYPES: Record<string, { icon: string; label: string }> = {
  damage: { icon: '💔', label: 'Danno' },
  missing_item: { icon: '📦', label: 'Oggetto mancante' },
  maintenance: { icon: '🔧', label: 'Manutenzione' },
  cleanliness: { icon: '🧹', label: 'Pulizia' },
  safety: { icon: '⚠️', label: 'Sicurezza' },
  other: { icon: '📝', label: 'Altro' },
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function IssueResolutionSection({ 
  issues, 
  onResolutionsChange,
  cleaningId 
}: IssueResolutionSectionProps) {
  const [resolutions, setResolutions] = useState<Record<string, IssueResolution>>({});
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentIssueRef = useRef<string | null>(null);
  
  // Filtra solo issues aperti
  const openIssues = issues.filter(i => !i.resolved);
  
  if (openIssues.length === 0) {
    return null;
  }
  
  // Handlers
  const handleResolutionChange = (issueId: string, resolved: boolean) => {
    const updated = {
      ...resolutions,
      [issueId]: {
        issueId,
        resolved,
        notes: resolutions[issueId]?.notes || '',
        photos: resolutions[issueId]?.photos || [],
      }
    };
    setResolutions(updated);
    onResolutionsChange(Object.values(updated));
  };
  
  const handleNotesChange = (issueId: string, notes: string) => {
    const updated = {
      ...resolutions,
      [issueId]: {
        ...resolutions[issueId],
        issueId,
        resolved: resolutions[issueId]?.resolved ?? false,
        notes,
        photos: resolutions[issueId]?.photos || [],
      }
    };
    setResolutions(updated);
    onResolutionsChange(Object.values(updated));
  };
  
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const issueId = currentIssueRef.current;
    if (!issueId || !e.target.files?.length) return;
    
    setUploadingFor(issueId);
    
    const newPhotos: string[] = [];
    
    for (const file of Array.from(e.target.files)) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("cleaningId", cleaningId);
        formData.append("type", "issue_resolution");
        
        const res = await fetch("/api/upload-photo", {
          method: "POST",
          body: formData,
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            newPhotos.push(data.url);
          }
        }
      } catch (error) {
        console.error("Errore upload:", error);
      }
    }
    
    if (newPhotos.length > 0) {
      const currentPhotos = resolutions[issueId]?.photos || [];
      const updated = {
        ...resolutions,
        [issueId]: {
          ...resolutions[issueId],
          issueId,
          resolved: resolutions[issueId]?.resolved ?? true,
          notes: resolutions[issueId]?.notes || '',
          photos: [...currentPhotos, ...newPhotos],
        }
      };
      setResolutions(updated);
      onResolutionsChange(Object.values(updated));
    }
    
    setUploadingFor(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  
  const handleRemovePhoto = (issueId: string, photoIndex: number) => {
    const currentPhotos = resolutions[issueId]?.photos || [];
    const updated = {
      ...resolutions,
      [issueId]: {
        ...resolutions[issueId],
        issueId,
        resolved: resolutions[issueId]?.resolved ?? false,
        notes: resolutions[issueId]?.notes || '',
        photos: currentPhotos.filter((_, idx) => idx !== photoIndex),
      }
    };
    setResolutions(updated);
    onResolutionsChange(Object.values(updated));
  };
  
  const triggerPhotoUpload = (issueId: string) => {
    currentIssueRef.current = issueId;
    fileInputRef.current?.click();
  };
  
  // Conta risolti
  const resolvedCount = Object.values(resolutions).filter(r => r.resolved).length;

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handlePhotoUpload}
        className="hidden"
      />
      
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 border-b border-amber-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">✅</span>
            <div>
              <p className="font-bold text-slate-800">Conferma Risoluzione Problemi</p>
              <p className="text-xs text-slate-500">
                Indica se hai risolto le segnalazioni aperte
              </p>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
            resolvedCount === openIssues.length 
              ? 'bg-emerald-100 text-emerald-700' 
              : 'bg-slate-100 text-slate-600'
          }`}>
            {resolvedCount}/{openIssues.length}
          </span>
        </div>
      </div>
      
      {/* Lista Issues */}
      <div className="p-3 space-y-3">
        {openIssues.map((issue) => {
          const typeInfo = ISSUE_TYPES[issue.type] || ISSUE_TYPES.other;
          const resolution = resolutions[issue.id];
          const isResolved = resolution?.resolved ?? false;
          const isNotResolved = resolution?.resolved === false;
          
          return (
            <div 
              key={issue.id}
              className={`border rounded-xl overflow-hidden transition-all ${
                isResolved 
                  ? 'border-emerald-300 bg-emerald-50' 
                  : isNotResolved
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              {/* Issue Info */}
              <div className="p-3">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isResolved ? 'bg-emerald-100' : 'bg-slate-100'
                  }`}>
                    <span className="text-lg">{typeInfo.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm">{issue.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                      {issue.description}
                    </p>
                  </div>
                </div>
                
                {/* Resolution Options */}
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => handleResolutionChange(issue.id, true)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                      isResolved
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-600'
                    }`}
                  >
                    <span>✓</span>
                    <span>Risolto</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolutionChange(issue.id, false)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                      isNotResolved
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-amber-300 hover:text-amber-600'
                    }`}
                  >
                    <span>✗</span>
                    <span>Non risolto</span>
                  </button>
                </div>
              </div>
              
              {/* Resolution Details (when resolved) */}
              {isResolved && (
                <div className="px-3 pb-3 space-y-3">
                  {/* Note */}
                  <div>
                    <label className="text-xs font-medium text-emerald-700 mb-1 block">
                      Come hai risolto? (opzionale)
                    </label>
                    <textarea
                      value={resolution?.notes || ''}
                      onChange={(e) => handleNotesChange(issue.id, e.target.value)}
                      placeholder="Es: Sostituita guarnizione, pulito..."
                      className="w-full p-2.5 border border-emerald-200 rounded-lg text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-white"
                    />
                  </div>
                  
                  {/* Foto risoluzione */}
                  <div>
                    <label className="text-xs font-medium text-emerald-700 mb-1.5 block">
                      📷 Foto dopo la risoluzione (opzionale)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {resolution?.photos?.map((photo, idx) => (
                        <div key={idx} className="relative">
                          <img 
                            src={photo} 
                            alt="" 
                            className="w-14 h-14 rounded-lg object-cover border border-emerald-200"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(issue.id, idx)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 text-white rounded-full text-xs flex items-center justify-center shadow-sm"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => triggerPhotoUpload(issue.id)}
                        disabled={uploadingFor === issue.id}
                        className="w-14 h-14 border-2 border-dashed border-emerald-300 rounded-lg flex items-center justify-center text-emerald-400 hover:border-emerald-400 hover:text-emerald-500 transition-colors bg-white"
                      >
                        {uploadingFor === issue.id ? (
                          <div className="w-5 h-5 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
                        ) : (
                          <span className="text-xl">+</span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Not Resolved Note */}
              {isNotResolved && (
                <div className="px-3 pb-3">
                  <div className="bg-amber-100 rounded-lg p-2.5">
                    <p className="text-xs text-amber-700">
                      ℹ️ Questa segnalazione rimarrà aperta per la prossima pulizia
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Summary */}
      {Object.keys(resolutions).length > 0 && (
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Riepilogo:</span>
            <div className="flex items-center gap-3">
              <span className="text-emerald-600 font-medium">
                ✓ {resolvedCount} risolt{resolvedCount === 1 ? 'o' : 'i'}
              </span>
              <span className="text-amber-600 font-medium">
                ✗ {openIssues.length - resolvedCount} apert{openIssues.length - resolvedCount === 1 ? 'o' : 'i'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
