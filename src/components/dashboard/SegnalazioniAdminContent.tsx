"use client";

import { useState, useMemo, useEffect } from "react";
import { collection, query, onSnapshot, doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { useSearchParams } from "next/navigation";
import { matchesPropertyQuery, isInDateRange, EMPTY_RANGE, type DateRange } from "~/components/ui/PropertySearchBar";

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
  resolved?: boolean;
  reportedBy: string;
  reportedByName: string;
  createdAt: any;
  reportedAt?: any;
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

export function SegnalazioniAdminContent({
  embedded = false, initialIssueId,
  // 🔎 Filtri passati dal guscio della pagina Centro Messaggi.
  // Opzionali: senza, il componente si comporta esattamente come prima.
  searchTerm = "", searchProperty = null, dateRange = EMPTY_RANGE,
}: {
  embedded?: boolean; initialIssueId?: string;
  searchTerm?: string; searchProperty?: string | null; dateRange?: DateRange;
}) {
  const searchParams = useSearchParams();
  const highlightId = initialIssueId || searchParams.get('id');
  
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({ status: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  // Fetch issues realtime - senza orderBy per evitare necessità di indici
  useEffect(() => {
    const q = query(collection(db, "issues"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const issuesData = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })) as Issue[];
      
      // Ordina lato client per data (più recenti prima)
      issuesData.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || a.reportedAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || b.reportedAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      
      setIssues(issuesData);
      setLoading(false);
      
      // Auto-open se c'è un ID nella URL
      if (highlightId) {
        const found = issuesData.find(i => i.id === highlightId);
        if (found) {
          setSelectedIssue(found);
        }
      }
    }, (error) => {
      console.error("Errore fetch issues:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [highlightId]);

  // Filter issues - supporta sia status che resolved
  const filteredIssues = useMemo(() => issues
    .filter(issue => {
      const isResolved = issue.resolved === true || issue.status === 'resolved';
      if (filter === 'open') return !isResolved;
      if (filter === 'resolved') return isResolved;
      return true;
    })
    .filter(issue => isInDateRange((issue as any).reportedAt || (issue as any).createdAt, dateRange))
    .filter(issue =>
      matchesPropertyQuery(
        [issue.propertyName, issue.title, (issue as any).description],
        searchTerm,
        searchProperty,
      ),
    ),
    [issues, filter, dateRange.from, dateRange.to, searchTerm, searchProperty],
  );

  const searchActive = !!(searchTerm || searchProperty || dateRange.from || dateRange.to);

  // Counts
  const openCount = issues.filter(i => !(i.resolved === true || i.status === 'resolved')).length;
  const urgentCount = issues.filter(i => i.isUrgent && !(i.resolved === true || i.status === 'resolved')).length;

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
    // `overflow-x-hidden`: rete di sicurezza. Anche se un domani qualcuno
    // aggiunge un elemento troppo largo, non potrà più trascinare l'intera
    // pagina in orizzontale sul telefono.
    <div className={`overflow-x-hidden ${embedded ? "px-4 pt-3" : "space-y-6"}`}>
      {/* Header — nascosto quando embedded */}
      {!embedded && (
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
      )}

      {/* Stats mini quando embedded */}
      {embedded && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-white rounded-[14px] p-3 text-center border border-slate-100"><p className="text-[22px] font-bold text-slate-700">{issues.length}</p><p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">Totali</p></div>
          <div className="bg-white rounded-[14px] p-3 text-center border border-slate-100"><p className="text-[22px] font-bold text-amber-500">{openCount}</p><p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">Aperte</p></div>
          <div className="bg-white rounded-[14px] p-3 text-center border border-slate-100"><p className="text-[22px] font-bold text-emerald-500">{issues.length - openCount}</p><p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">Risolte</p></div>
        </div>
      )}

      {/* Filters — stile pill quando embedded */}
      <div className={`flex gap-1.5 ${embedded ? "overflow-x-auto -mx-4 px-4 pb-2" : "gap-2 mb-6"}`} style={embedded ? { scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } : {}}>
        <button
          onClick={() => setFilter('all')}
          className={embedded
            ? `px-3.5 py-[7px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 border-[1.5px] ${filter === 'all' ? "bg-sky-500 text-white border-sky-500 shadow-[0_2px_8px_rgba(14,165,233,.2)]" : "bg-white text-slate-500 border-slate-200"}`
            : `px-4 py-2 rounded-xl font-medium transition-all ${filter === 'all' ? 'bg-sky-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
        >
          Tutte ({issues.length})
        </button>
        <button
          onClick={() => setFilter('open')}
          className={embedded
            ? `px-3.5 py-[7px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 border-[1.5px] ${filter === 'open' ? "bg-sky-500 text-white border-sky-500 shadow-[0_2px_8px_rgba(14,165,233,.2)]" : "bg-white text-slate-500 border-slate-200"}`
            : `px-4 py-2 rounded-xl font-medium transition-all ${filter === 'open' ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
        >
          Aperte ({openCount})
        </button>
        <button
          onClick={() => setFilter('resolved')}
          className={embedded
            ? `px-3.5 py-[7px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 border-[1.5px] ${filter === 'resolved' ? "bg-sky-500 text-white border-sky-500 shadow-[0_2px_8px_rgba(14,165,233,.2)]" : "bg-white text-slate-500 border-slate-200"}`
            : `px-4 py-2 rounded-xl font-medium transition-all ${filter === 'resolved' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
        >
          Risolte ({issues.length - openCount})
        </button>
      </div>

      {/* Issues List */}
      {filteredIssues.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center">
          <span className="text-4xl block mb-3">✨</span>
          <p className="text-slate-500">{searchActive ? 'Nessuna segnalazione per questa ricerca' : <>Nessuna segnalazione {filter !== 'all' && 'in questa categoria'}</>}</p>
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
                      {/* ⚠️ `min-w-0` è OBBLIGATORIO: un figlio flex ha per
                          impostazione predefinita larghezza minima pari al
                          contenuto, quindi senza di esso `truncate` non ha
                          nulla contro cui restringersi. Il titolo lungo
                          allargava la card, che a sua volta allargava la
                          pagina e faceva scorrere lo schermo in orizzontale. */}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-slate-800 truncate">{issue.title}</h3>
                        <p className="text-xs text-slate-500 truncate">{issue.propertyName}</p>
                      </div>
                      
                      {/* Status Badge */}
                      <span className={`text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ${STATUS_COLORS[issue.status] || STATUS_COLORS.open}`}>
                        {issue.status === 'resolved' ? 'Risolta' : issue.status === 'in_progress' ? 'In corso' : 'Aperta'}
                      </span>
                    </div>
                    
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2 break-words">{issue.description}</p>
                    
                    {/* Meta */}
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-slate-400">
                      <span className={`px-2 py-0.5 rounded-full ${SEVERITY_COLORS[issue.severity]}`}>
                        {issue.severity === 'low' ? 'Bassa' : issue.severity === 'medium' ? 'Media' : issue.severity === 'high' ? 'Alta' : 'Critica'}
                      </span>
                      <span>{formatDate(issue.reportedAt || issue.createdAt)}</span>
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

      {/* Detail/Edit Modal - Centrata */}
      {selectedIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setSelectedIssue(null); setEditMode(false); }}>
          <div className="absolute inset-0 bg-black/60" />
          <div 
            className="relative bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`px-4 py-4 flex items-center justify-between ${
              selectedIssue.isUrgent ? 'bg-gradient-to-r from-red-500 to-rose-500' : 'bg-gradient-to-r from-sky-500 to-blue-500'
            }`}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-xl">{selectedIssue.isUrgent ? '🚨' : ISSUE_TYPES[selectedIssue.type]?.icon || '📝'}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-white truncate">{selectedIssue.title}</h3>
                  <p className="text-white/80 text-xs truncate">{selectedIssue.propertyName}</p>
                </div>
              </div>
              <button 
                onClick={() => { setSelectedIssue(null); setEditMode(false); }}
                className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white flex-shrink-0 ml-2 hover:bg-white/30 transition-colors"
              >
                ✕
              </button>
            </div>
            
            {/* Content scrollabile */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Status badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[selectedIssue.status]}`}>
                  {selectedIssue.status === 'resolved' ? '✓ Risolta' : selectedIssue.status === 'in_progress' ? '⏳ In corso' : '⚠️ Aperta'}
                </span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${SEVERITY_COLORS[selectedIssue.severity]}`}>
                  {selectedIssue.severity === 'low' ? 'Bassa' : selectedIssue.severity === 'medium' ? 'Media' : selectedIssue.severity === 'high' ? 'Alta' : 'Critica'}
                </span>
              </div>
              
              {/* Description */}
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Descrizione</p>
                <p className="text-sm text-slate-700">{selectedIssue.description}</p>
              </div>
              
              {/* Photos */}
              {selectedIssue.photos?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Foto ({selectedIssue.photos.length})</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {selectedIssue.photos.map((photo, idx) => (
                      <img
                        key={idx}
                        src={photo}
                        alt=""
                        className="w-16 h-16 object-cover rounded-lg cursor-pointer flex-shrink-0"
                        onClick={() => setLightbox({ images: selectedIssue.photos, index: idx })}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Meta Info compatte */}
              <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Segnalato da:</span>
                  <span className="font-medium">{selectedIssue.reportedByName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Data:</span>
                  <span className="font-medium">{formatDate(selectedIssue.reportedAt || selectedIssue.createdAt)}</span>
                </div>
                {selectedIssue.resolvedAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Risolto il:</span>
                    <span className="font-medium">{formatDate(selectedIssue.resolvedAt)}</span>
                  </div>
                )}
                {selectedIssue.resolutionNotes && (
                  <div className="pt-1.5 border-t border-slate-200">
                    <span className="text-slate-500">Note risoluzione:</span>
                    <p className="font-medium mt-1 text-emerald-700">{selectedIssue.resolutionNotes}</p>
                  </div>
                )}
              </div>
              
              {/* Edit Form */}
              {editMode && (
                <div className="bg-sky-50 rounded-xl p-3 space-y-2">
                  <p className="font-bold text-sky-800 text-sm">Modifica Segnalazione</p>
                  
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Stato</label>
                    <select
                      value={editData.status}
                      onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    >
                      <option value="open">Aperta</option>
                      <option value="in_progress">In Lavorazione</option>
                      <option value="resolved">Risolta</option>
                    </select>
                  </div>
                  
                  {editData.status === 'resolved' && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Note Risoluzione</label>
                      <textarea
                        value={editData.notes}
                        onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                        placeholder="Descrivi come è stato risolto..."
                        rows={2}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl resize-none text-sm"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="flex-shrink-0 p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
              {!editMode ? (
                <>
                  <button
                    onClick={() => { setSelectedIssue(null); setEditMode(false); }}
                    className="flex-1 py-3 bg-slate-200 text-slate-700 font-bold rounded-xl"
                  >
                    Chiudi
                  </button>
                  <button
                    onClick={() => { setEditData({ status: selectedIssue.status, notes: selectedIssue.resolutionNotes || '' }); setEditMode(true); }}
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
                    className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-xl disabled:opacity-50"
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
