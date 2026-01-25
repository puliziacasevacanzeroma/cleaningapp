"use client";

import { useState, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// TIPI
// ═══════════════════════════════════════════════════════════════

type IssueType = 
  | 'damage'
  | 'missing_item'
  | 'maintenance'
  | 'cleanliness'
  | 'safety'
  | 'other';

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface Issue {
  id: string;
  type: IssueType;
  title: string;
  description: string;
  severity: Severity;
  photos: string[];
}

const ISSUE_TYPES: Record<IssueType, { icon: string; label: string; color: string }> = {
  damage: { icon: '💔', label: 'Danno riscontrato', color: 'rose' },
  missing_item: { icon: '📦', label: 'Oggetto mancante', color: 'amber' },
  maintenance: { icon: '🔧', label: 'Manutenzione necessaria', color: 'orange' },
  cleanliness: { icon: '🧹', label: 'Problema pulizia grave', color: 'yellow' },
  safety: { icon: '⚠️', label: 'Problema sicurezza', color: 'red' },
  other: { icon: '📝', label: 'Altro', color: 'slate' },
};

const SEVERITY_OPTIONS: Record<Severity, { label: string; color: string; description: string }> = {
  low: { label: 'Bassa', color: 'emerald', description: 'Problema minore, non urgente' },
  medium: { label: 'Media', color: 'amber', description: 'Da risolvere entro qualche giorno' },
  high: { label: 'Alta', color: 'orange', description: 'Da risolvere prima della prossima pulizia' },
  critical: { label: 'Critica', color: 'rose', description: 'Richiede intervento immediato' },
};

interface IssueReporterProps {
  onIssuesChange: (issues: Issue[]) => void;
  initialIssues?: Issue[];
  cleaningId?: string;
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function IssueReporter({ 
  onIssuesChange, 
  initialIssues = [],
  cleaningId 
}: IssueReporterProps) {
  const [issues, setIssues] = useState<Issue[]>(initialIssues);
  const [isExpanded, setIsExpanded] = useState(initialIssues.length > 0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  
  // Form state
  const [selectedType, setSelectedType] = useState<IssueType | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form
  const resetForm = () => {
    setSelectedType(null);
    setTitle("");
    setDescription("");
    setSeverity("medium");
    setPhotos([]);
    setShowAddForm(false);
    setEditingIssue(null);
  };

  // Aggiungi/modifica issue
  const handleSaveIssue = () => {
    if (!selectedType || !title.trim() || !description.trim()) return;
    
    // Per danni, foto obbligatoria
    if (selectedType === 'damage' && photos.length === 0) {
      alert("Per segnalare un danno è necessario almeno una foto");
      return;
    }
    
    const newIssue: Issue = {
      id: editingIssue?.id || `issue_${Date.now()}`,
      type: selectedType,
      title: title.trim(),
      description: description.trim(),
      severity,
      photos,
    };
    
    let updatedIssues: Issue[];
    if (editingIssue) {
      updatedIssues = issues.map(i => i.id === editingIssue.id ? newIssue : i);
    } else {
      updatedIssues = [...issues, newIssue];
    }
    
    setIssues(updatedIssues);
    onIssuesChange(updatedIssues);
    resetForm();
  };

  // Rimuovi issue
  const handleRemoveIssue = (issueId: string) => {
    const updatedIssues = issues.filter(i => i.id !== issueId);
    setIssues(updatedIssues);
    onIssuesChange(updatedIssues);
  };

  // Modifica issue
  const handleEditIssue = (issue: Issue) => {
    setEditingIssue(issue);
    setSelectedType(issue.type);
    setTitle(issue.title);
    setDescription(issue.description);
    setSeverity(issue.severity);
    setPhotos(issue.photos);
    setShowAddForm(true);
  };

  // Upload foto
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploadingPhoto(true);
    
    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (cleaningId) formData.append("cleaningId", cleaningId);
        formData.append("type", "issue");
        
        const res = await fetch("/api/upload-photo", {
          method: "POST",
          body: formData,
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            setPhotos(prev => [...prev, data.url]);
          }
        }
      } catch (error) {
        console.error("Errore upload foto:", error);
      }
    }
    
    setUploadingPhoto(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Rimuovi foto
  const handleRemovePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div className="text-left">
            <p className="font-semibold text-slate-800">Segnala Problemi</p>
            <p className="text-xs text-slate-500">
              {issues.length === 0 
                ? "Nessun problema segnalato" 
                : `${issues.length} problema${issues.length > 1 ? 'i' : ''} segnalat${issues.length > 1 ? 'i' : 'o'}`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {issues.length > 0 && (
            <span className="px-2 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-full">
              {issues.length}
            </span>
          )}
          <svg 
            className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Contenuto espanso */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Lista problemi esistenti */}
          {issues.length > 0 && (
            <div className="space-y-2">
              {issues.map((issue) => {
                const typeInfo = ISSUE_TYPES[issue.type];
                const severityInfo = SEVERITY_OPTIONS[issue.severity];
                
                return (
                  <div 
                    key={issue.id}
                    className="p-3 rounded-lg border bg-slate-50 border-slate-200"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        <span className="text-lg">{typeInfo.icon}</span>
                        <div>
                          <p className="font-medium text-slate-800 text-sm">{issue.title}</p>
                          <p className="text-xs text-slate-500">{typeInfo.label}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          severityInfo.color === 'emerald' ? 'bg-emerald-100 text-emerald-700' :
                          severityInfo.color === 'amber' ? 'bg-amber-100 text-amber-700' :
                          severityInfo.color === 'orange' ? 'bg-orange-100 text-orange-700' :
                          'bg-rose-100 text-rose-700'
                        }`}>
                          {severityInfo.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleEditIssue(issue)}
                          className="p-1 text-slate-400 hover:text-slate-600"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveIssue(issue.id)}
                          className="p-1 text-rose-400 hover:text-rose-600"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">{issue.description}</p>
                    
                    {issue.photos.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {issue.photos.map((photo, idx) => (
                          <img 
                            key={idx} 
                            src={photo} 
                            alt="" 
                            className="w-10 h-10 rounded object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Form aggiunta problema */}
          {showAddForm ? (
            <div className="border border-slate-200 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-slate-800">
                  {editingIssue ? "Modifica problema" : "Nuovo problema"}
                </h4>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Tipo problema */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-2 block">Tipo di problema *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(ISSUE_TYPES) as [IssueType, typeof ISSUE_TYPES[IssueType]][]).map(([key, info]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedType(key)}
                      className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-all ${
                        selectedType === key 
                          ? "bg-slate-100 border-slate-400" 
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <span className="text-lg">{info.icon}</span>
                      <span className="text-xs font-medium text-slate-700">{info.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Titolo */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Titolo breve *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Es: Vetro rotto finestra camera"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                  maxLength={100}
                />
              </div>

              {/* Descrizione */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Descrizione *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrivi il problema in dettaglio..."
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                />
              </div>

              {/* Gravità */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-2 block">Gravità *</label>
                <div className="flex gap-2">
                  {(Object.entries(SEVERITY_OPTIONS) as [Severity, typeof SEVERITY_OPTIONS[Severity]][]).map(([key, info]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSeverity(key)}
                      className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                        severity === key 
                          ? info.color === 'emerald' ? 'bg-emerald-100 border-emerald-300 text-emerald-700' :
                            info.color === 'amber' ? 'bg-amber-100 border-amber-300 text-amber-700' :
                            info.color === 'orange' ? 'bg-orange-100 border-orange-300 text-orange-700' :
                            'bg-rose-100 border-rose-300 text-rose-700'
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {info.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {SEVERITY_OPTIONS[severity].description}
                </p>
              </div>

              {/* Foto */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-2 block">
                  Foto {selectedType === 'damage' && <span className="text-rose-500">*</span>}
                </label>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                
                <div className="flex flex-wrap gap-2">
                  {photos.map((photo, idx) => (
                    <div key={idx} className="relative">
                      <img 
                        src={photo} 
                        alt="" 
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white rounded-full text-xs flex items-center justify-center"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="w-16 h-16 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors"
                  >
                    {uploadingPhoto ? (
                      <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    ) : (
                      <span className="text-2xl">+</span>
                    )}
                  </button>
                </div>
                
                {selectedType === 'damage' && photos.length === 0 && (
                  <p className="text-xs text-rose-500 mt-1">
                    ⚠️ Per i danni è obbligatorio allegare almeno una foto
                  </p>
                )}
              </div>

              {/* Bottoni */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleSaveIssue}
                  disabled={!selectedType || !title.trim() || !description.trim() || (selectedType === 'damage' && photos.length === 0)}
                  className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-600"
                >
                  {editingIssue ? "Salva modifiche" : "Aggiungi problema"}
                </button>
              </div>
            </div>
          ) : (
            /* Bottone aggiungi */
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="w-full py-3 border-2 border-dashed border-amber-300 rounded-lg text-amber-600 font-medium hover:bg-amber-50 hover:border-amber-400 transition-all flex items-center justify-center gap-2"
            >
              <span className="text-lg">➕</span>
              <span>Segnala un problema</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
