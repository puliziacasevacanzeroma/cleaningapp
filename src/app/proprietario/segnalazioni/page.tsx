"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

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
  resolvedByName?: string;
  resolutionNotes?: string;
}

const ISSUE_TYPES: Record<string, { icon: string; label: string }> = {
  damage: { icon: '💔', label: 'Danno' },
  missing_item: { icon: '📦', label: 'Oggetto mancante' },
  maintenance: { icon: '🔧', label: 'Manutenzione' },
  cleanliness: { icon: '🧹', label: 'Pulizia' },
  safety: { icon: '⚠️', label: 'Sicurezza' },
  other: { icon: '📝', label: 'Altro' },
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

export default function ProprietarioSegnalazioniPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('id');
  
  const [issues, setIssues] = useState<Issue[]>([]);
  const [properties, setProperties] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  // Fetch owner's properties first
  useEffect(() => {
    if (!user?.id) return;
    
    const q = query(
      collection(db, "properties"),
      where("ownerId", "==", user.id)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const propertyIds = snapshot.docs.map(doc => doc.id);
      setProperties(propertyIds);
    });

    return () => unsubscribe();
  }, [user?.id]);

  // Fetch issues for owner's properties
  useEffect(() => {
    if (properties.length === 0) {
      setLoading(false);
      return;
    }
    
    // Query senza orderBy per evitare necessità di indici composti
    const q = query(
      collection(db, "issues"),
      where("propertyId", "in", properties.slice(0, 10)) // Firestore limit
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const issuesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Issue[];
      
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
  }, [properties, highlightId]);

  // Filter issues - supporta sia status che resolved
  const filteredIssues = issues.filter(issue => {
    const isResolved = issue.resolved === true || issue.status === 'resolved';
    if (filter === 'open') return !isResolved;
    if (filter === 'resolved') return isResolved;
    return true;
  });

  // Counts
  const openCount = issues.filter(i => !(i.resolved === true || i.status === 'resolved')).length;
  const urgentCount = issues.filter(i => i.isUrgent && !(i.resolved === true || i.status === 'resolved')).length;

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
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">🔧 Segnalazioni</h1>
          <p className="text-sm text-slate-500">Problemi segnalati nelle tue proprietà</p>
        </div>
        
        {urgentCount > 0 && (
          <div className="bg-red-100 text-red-700 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
            <span>🚨</span>
            <span className="font-bold text-sm">{urgentCount}</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
          <p className="text-2xl font-bold text-slate-700">{issues.length}</p>
          <p className="text-xs text-slate-500">Totali</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
          <p className="text-2xl font-bold text-amber-600">{openCount}</p>
          <p className="text-xs text-slate-500">Aperte</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
          <p className="text-2xl font-bold text-emerald-600">{issues.length - openCount}</p>
          <p className="text-xs text-slate-500">Risolte</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-xl font-medium text-sm whitespace-nowrap transition-all ${
            filter === 'all' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600'
          }`}
        >
          Tutte
        </button>
        <button
          onClick={() => setFilter('open')}
          className={`px-4 py-2 rounded-xl font-medium text-sm whitespace-nowrap transition-all ${
            filter === 'open' ? 'bg-amber-500 text-white' : 'bg-white text-slate-600'
          }`}
        >
          Aperte ({openCount})
        </button>
        <button
          onClick={() => setFilter('resolved')}
          className={`px-4 py-2 rounded-xl font-medium text-sm whitespace-nowrap transition-all ${
            filter === 'resolved' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600'
          }`}
        >
          Risolte
        </button>
      </div>

      {/* Issues List */}
      {filteredIssues.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center">
          <span className="text-4xl block mb-3">✨</span>
          <p className="font-bold text-slate-700">Nessuna segnalazione</p>
          <p className="text-sm text-slate-500 mt-1">
            {filter !== 'all' ? 'in questa categoria' : 'per le tue proprietà'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIssues.map((issue) => {
            const typeInfo = ISSUE_TYPES[issue.type] || ISSUE_TYPES.other;
            
            return (
              <div
                key={issue.id}
                onClick={() => setSelectedIssue(issue)}
                className={`bg-white rounded-xl p-4 shadow-sm cursor-pointer active:scale-[0.98] transition-all border-l-4 ${
                  issue.isUrgent ? 'border-l-red-500 bg-red-50/50' : 
                  issue.status === 'resolved' ? 'border-l-emerald-500' : 'border-l-amber-500'
                } ${highlightId === issue.id ? 'ring-2 ring-emerald-500' : ''}`}
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
                      <h3 className="font-bold text-slate-800 truncate">{issue.title}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[issue.status]}`}>
                        {issue.status === 'resolved' ? '✓' : '●'}
                      </span>
                    </div>
                    
                    <p className="text-xs text-slate-500">{issue.propertyName}</p>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-1">{issue.description}</p>
                    
                    {/* Meta */}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[issue.severity]}`}>
                        {issue.severity === 'critical' ? 'Critica' : issue.severity === 'high' ? 'Alta' : issue.severity === 'medium' ? 'Media' : 'Bassa'}
                      </span>
                      <span className="text-[10px] text-slate-400">{formatDate(issue.reportedAt || issue.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal (Read Only) */}
      {selectedIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedIssue(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div 
            className="relative bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header compatto */}
            <div className={`px-4 py-4 flex items-center justify-between ${
              selectedIssue.isUrgent ? 'bg-gradient-to-r from-red-500 to-rose-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500'
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
                onClick={() => setSelectedIssue(null)}
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
                  {selectedIssue.severity === 'critical' ? 'Critica' : selectedIssue.severity === 'high' ? 'Alta' : selectedIssue.severity === 'medium' ? 'Media' : 'Bassa'}
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
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Foto</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {selectedIssue.photos.map((photo, idx) => (
                      <img
                        key={idx}
                        src={photo}
                        alt=""
                        className="w-20 h-20 object-cover rounded-xl cursor-pointer flex-shrink-0"
                        onClick={() => setLightbox({ images: selectedIssue.photos, index: idx })}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Info compatte */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 text-xs">Segnalato da</span>
                  <span className="font-medium text-xs">{selectedIssue.reportedByName}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 text-xs">Data segnalazione</span>
                  <span className="font-medium text-xs">{formatDate(selectedIssue.reportedAt || selectedIssue.createdAt)}</span>
                </div>
                {selectedIssue.status === 'resolved' && (
                  <>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 text-xs">Risolto il</span>
                      <span className="font-medium text-xs">{formatDate(selectedIssue.resolvedAt)}</span>
                    </div>
                    {selectedIssue.resolutionNotes && (
                      <div className="py-1.5">
                        <span className="text-slate-500 text-xs block mb-1">Note risoluzione</span>
                        <p className="font-medium text-xs text-emerald-700 bg-emerald-50 p-2 rounded-lg">{selectedIssue.resolutionNotes}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            
            {/* Footer compatto */}
            <div className="flex-shrink-0 p-4 bg-slate-50 border-t border-slate-100">
              <button
                onClick={() => setSelectedIssue(null)}
                className="w-full py-3 bg-slate-200 text-slate-700 font-bold rounded-xl"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white text-2xl">✕</button>
          <img 
            src={lightbox.images[lightbox.index]} 
            alt="" 
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </div>
  );
}
