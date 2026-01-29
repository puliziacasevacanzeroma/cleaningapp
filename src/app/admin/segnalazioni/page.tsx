"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { useSearchParams } from "next/navigation";

interface Issue {
  id: string;
  propertyId: string;
  propertyName: string;
  cleaningId?: string;
  type: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  photos: string[];
  isUrgent?: boolean;
  reportedBy: string;
  reportedByName: string;
  createdAt: any;
  resolvedAt?: any;
  resolvedBy?: string;
  resolvedByName?: string;
  resolutionNotes?: string;
}

const ISSUE_TYPES: Record<string, { icon: string; label: string; color: string }> = {
  damage: { icon: '💔', label: 'Danno', color: 'rose' },
  missing_item: { icon: '📦', label: 'Oggetto mancante', color: 'amber' },
  maintenance: { icon: '🔧', label: 'Manutenzione', color: 'orange' },
  cleanliness: { icon: '🧹', label: 'Pulizia', color: 'yellow' },
  safety: { icon: '⚠️', label: 'Sicurezza', color: 'red' },
  other: { icon: '📝', label: 'Altro', color: 'slate' },
};

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-rose-100 text-rose-700',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-emerald-100 text-emerald-700',
};

export default function AdminSegnalazioniPage() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('id');
  
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({ status: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  // Fetch issues realtime
  useEffect(() => {
    const q = query(collection(db, "issues"), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const issuesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Issue[];
      
      setIssues(issuesData);
      setLoading(false);
      
      // Auto-open se c'è un ID nella URL
      if (highlightId) {
        const found = issuesData.find(i => i.id === highlightId);
        if (found) {
          setSelectedIssue(found);
        }
      }
    });

    return () => unsubscribe();
  }, [highlightId]);

  // Filter issues
  const filteredIssues = issues.filter(issue => {
    if (filter === 'open') return issue.status !== 'resolved';
    if (filter === 'resolved') return issue.status === 'resolved';
    return true;
  });

  // Counts
  const openCount = issues.filter(i => i.status !== 'resolved').length;
  const urgentCount = issues.filter(i => i.isUrgent && i.status !== 'resolved').length;

  // Update issue
  const handleSave = async () => {
    if (!selectedIssue) return;
    
    setSaving(true);
    try {
      const updateData: any = {
        status: editData.status,
        updatedAt: Timestamp.now(),
      };
      
      if (editData.status === 'resolved') {
        updateData.resolvedAt = Timestamp.now();
        updateData.resolutionNotes = editData.notes;
      }
      
      await updateDoc(doc(db, "issues", selectedIssue.id), updateData);
      
      setEditMode(false);
      setSelectedIssue(null);
    } catch (error) {
      console.error("Errore aggiornamento:", error);
      alert("Errore nel salvataggio");
    }
    setSaving(false);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('it-IT', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">🔧 Segnalazioni</h1>
          <p className="text-sm text-slate-500">Gestisci tutte le segnalazioni delle proprietà</p>
        </div>
        
        {/* Stats */}
        <div className="flex gap-3">
          {urgentCount > 0 && (
            <div className="bg-red-100 text-red-700 px-4 py-2 rounded-xl flex items-center gap-2">
              <span className="text-lg">🚨</span>
              <span className="font-bold">{urgentCount} urgenti</span>
            </div>
          )}
          <div className="bg-amber-100 text-amber-700 px-4 py-2 rounded-xl flex items-center gap-2">
            <span className="font-bold">{openCount} aperte</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-xl font-medium transition-all ${
            filter === 'all' ? 'bg-sky-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          Tutte ({issues.length})
        </button>
        <button
          onClick={() => setFilter('open')}
          className={`px-4 py-2 rounded-xl font-medium transition-all ${
            filter === 'open' ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          Aperte ({openCount})
        </button>
        <button
          onClick={() => setFilter('resolved')}
          className={`px-4 py-2 rounded-xl font-medium transition-all ${
            filter === 'resolved' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          Risolte ({issues.length - openCount})
        </button>
      </div>

      {/* Issues List */}
      {filteredIssues.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center">
          <span className="text-4xl block mb-3">✨</span>
          <p className="text-slate-500">Nessuna segnalazione {filter !== 'all' && 'in questa categoria'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIssues.map((issue) => {
            const typeInfo = ISSUE_TYPES[issue.type] || ISSUE_TYPES.other;
            
            return (
              <div
                key={issue.id}
                onClick={() => {
                  setSelectedIssue(issue);
                  setEditData({ status: issue.status, notes: issue.resolutionNotes || '' });
                }}
                className={`bg-white rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all border-l-4 ${
                  issue.isUrgent ? 'border-l-red-500 bg-red-50/50' : 
                  issue.status === 'resolved' ? 'border-l-emerald-500' : 'border-l-amber-500'
                } ${highlightId === issue.id ? 'ring-2 ring-sky-500' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    issue.isUrgent ? 'bg-red-100' : 'bg-slate-100'
                  }`}>
                    <span className="text-lg">{issue.isUrgent ? '🚨' : typeInfo.icon}</span>
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-slate-800 truncate">{issue.title}</h3>
                        <p className="text-xs text-slate-500">{issue.propertyName}</p>
                      </div>
                      
                      {/* Status Badge */}
                      <span className={`text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ${STATUS_COLORS[issue.status] || STATUS_COLORS.open}`}>
                        {issue.status === 'resolved' ? 'Risolta' : issue.status === 'in_progress' ? 'In corso' : 'Aperta'}
                      </span>
                    </div>
                    
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{issue.description}</p>
                    
                    {/* Meta */}
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                      <span className={`px-2 py-0.5 rounded-full ${SEVERITY_COLORS[issue.severity]}`}>
                        {issue.severity === 'low' ? 'Bassa' : issue.severity === 'medium' ? 'Media' : issue.severity === 'high' ? 'Alta' : 'Critica'}
                      </span>
                      <span>{formatDate(issue.createdAt)}</span>
                      {issue.photos?.length > 0 && (
                        <span>📷 {issue.photos.length}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail/Edit Modal */}
      {selectedIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setSelectedIssue(null); setEditMode(false); }}>
          <div className="absolute inset-0 bg-black/60" />
          <div 
            className="relative bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`px-5 py-4 flex items-center justify-between ${
              selectedIssue.isUrgent ? 'bg-gradient-to-r from-red-500 to-rose-500' : 'bg-gradient-to-r from-sky-500 to-blue-500'
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selectedIssue.isUrgent ? '🚨' : ISSUE_TYPES[selectedIssue.type]?.icon || '📝'}</span>
                <div>
                  <h3 className="font-bold text-white">{selectedIssue.title}</h3>
                  <p className="text-white/80 text-xs">{selectedIssue.propertyName}</p>
                </div>
              </div>
              <button 
                onClick={() => { setSelectedIssue(null); setEditMode(false); }}
                className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white"
              >
                ✕
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Status */}
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${STATUS_COLORS[selectedIssue.status]}`}>
                  {selectedIssue.status === 'resolved' ? '✓ Risolta' : selectedIssue.status === 'in_progress' ? '⏳ In corso' : '⚠️ Aperta'}
                </span>
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${SEVERITY_COLORS[selectedIssue.severity]}`}>
                  Gravità: {selectedIssue.severity === 'low' ? 'Bassa' : selectedIssue.severity === 'medium' ? 'Media' : selectedIssue.severity === 'high' ? 'Alta' : 'Critica'}
                </span>
              </div>
              
              {/* Description */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Descrizione</p>
                <p className="text-slate-700">{selectedIssue.description}</p>
              </div>
              
              {/* Photos */}
              {selectedIssue.photos?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Foto ({selectedIssue.photos.length})</p>
                  <div className="flex gap-2 overflow-x-auto">
                    {selectedIssue.photos.map((photo, idx) => (
                      <img
                        key={idx}
                        src={photo}
                        alt=""
                        className="w-20 h-20 object-cover rounded-lg cursor-pointer hover:opacity-80"
                        onClick={() => setLightbox({ images: selectedIssue.photos, index: idx })}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Meta Info */}
              <div className="bg-slate-50 rounded-xl p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Segnalato da:</span>
                  <span className="font-medium">{selectedIssue.reportedByName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Data:</span>
                  <span className="font-medium">{formatDate(selectedIssue.createdAt)}</span>
                </div>
                {selectedIssue.resolvedAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Risolto il:</span>
                    <span className="font-medium">{formatDate(selectedIssue.resolvedAt)}</span>
                  </div>
                )}
                {selectedIssue.resolutionNotes && (
                  <div className="pt-2 border-t border-slate-200">
                    <span className="text-slate-500">Note risoluzione:</span>
                    <p className="font-medium mt-1">{selectedIssue.resolutionNotes}</p>
                  </div>
                )}
              </div>
              
              {/* Edit Form */}
              {editMode && (
                <div className="bg-sky-50 rounded-xl p-4 space-y-3">
                  <p className="font-bold text-sky-800">Modifica Segnalazione</p>
                  
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Stato</label>
                    <select
                      value={editData.status}
                      onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                    >
                      <option value="open">Aperta</option>
                      <option value="in_progress">In Lavorazione</option>
                      <option value="resolved">Risolta</option>
                    </select>
                  </div>
                  
                  {editData.status === 'resolved' && (
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Note Risoluzione</label>
                      <textarea
                        value={editData.notes}
                        onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                        placeholder="Descrivi come è stato risolto..."
                        rows={3}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl resize-none"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
              {!editMode ? (
                <>
                  <button
                    onClick={() => { setSelectedIssue(null); setEditMode(false); }}
                    className="flex-1 py-3 bg-slate-200 text-slate-700 font-bold rounded-xl"
                  >
                    Chiudi
                  </button>
                  <button
                    onClick={() => setEditMode(true)}
                    className="flex-1 py-3 bg-sky-500 text-white font-bold rounded-xl"
                  >
                    ✏️ Modifica
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setEditMode(false)}
                    className="flex-1 py-3 bg-slate-200 text-slate-700 font-bold rounded-xl"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-xl"
                  >
                    {saving ? 'Salvataggio...' : '✓ Salva'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white text-2xl z-10">✕</button>
          <img 
            src={lightbox.images[lightbox.index]} 
            alt="" 
            className="max-w-full max-h-full object-contain"
          />
          {lightbox.images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox({ ...lightbox, index: (lightbox.index - 1 + lightbox.images.length) % lightbox.images.length }); }}
                className="absolute left-4 text-white text-4xl"
              >
                ‹
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox({ ...lightbox, index: (lightbox.index + 1) % lightbox.images.length }); }}
                className="absolute right-4 text-white text-4xl"
              >
                ›
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
