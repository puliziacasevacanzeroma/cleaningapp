"use client";

import { useState } from "react";

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

interface OpenIssuesSectionProps {
  issues: Issue[];
  onViewPhoto?: (photos: string[], index: number) => void;
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

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  low: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Bassa' },
  medium: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Media' },
  high: { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', label: 'Alta' },
  critical: { color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', label: 'Critica' },
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function OpenIssuesSection({ issues, onViewPhoto }: OpenIssuesSectionProps) {
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  
  // Filtra solo issues aperti
  const openIssues = issues.filter(i => !i.resolved);
  
  if (openIssues.length === 0) {
    return null; // Non mostrare nulla se non ci sono issues aperti
  }
  
  // Ordina per gravità (critical > high > medium > low)
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedIssues = [...openIssues].sort((a, b) => 
    (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3)
  );
  
  const hasCritical = sortedIssues.some(i => i.severity === 'critical');
  const hasHigh = sortedIssues.some(i => i.severity === 'high');

  return (
    <div className={`rounded-xl overflow-hidden ${
      hasCritical ? 'bg-rose-50 border-2 border-rose-300' :
      hasHigh ? 'bg-orange-50 border-2 border-orange-300' :
      'bg-amber-50 border border-amber-200'
    }`}>
      {/* Header */}
      <div className={`px-4 py-3 ${
        hasCritical ? 'bg-rose-100' :
        hasHigh ? 'bg-orange-100' :
        'bg-amber-100'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            <div>
              <p className={`font-bold ${
                hasCritical ? 'text-rose-800' :
                hasHigh ? 'text-orange-800' :
                'text-amber-800'
              }`}>
                {openIssues.length} Segnalazion{openIssues.length === 1 ? 'e' : 'i'} Apert{openIssues.length === 1 ? 'a' : 'e'}
              </p>
              <p className={`text-xs ${
                hasCritical ? 'text-rose-600' :
                hasHigh ? 'text-orange-600' :
                'text-amber-600'
              }`}>
                Da verificare durante questa pulizia
              </p>
            </div>
          </div>
          {hasCritical && (
            <span className="px-2 py-1 bg-rose-500 text-white text-xs font-bold rounded-full animate-pulse">
              URGENTE
            </span>
          )}
        </div>
      </div>
      
      {/* Lista Issues */}
      <div className="p-3 space-y-2">
        {sortedIssues.map((issue) => {
          const typeInfo = ISSUE_TYPES[issue.type] || ISSUE_TYPES.other;
          const severityConfig = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.medium;
          const isExpanded = expandedIssue === issue.id;
          const reportedDate = issue.reportedAt 
            ? new Date(issue.reportedAt).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
            : '';
          
          return (
            <div 
              key={issue.id}
              className={`bg-white rounded-lg border ${severityConfig.border} overflow-hidden`}
            >
              {/* Issue Header - Clickable */}
              <button
                type="button"
                onClick={() => setExpandedIssue(isExpanded ? null : issue.id)}
                className="w-full p-3 text-left flex items-start gap-3"
              >
                {/* Icon */}
                <div className={`w-10 h-10 ${severityConfig.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                  <span className="text-lg">{typeInfo.icon}</span>
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-800 text-sm">{issue.title}</p>
                    <span className={`px-2 py-0.5 ${severityConfig.bg} ${severityConfig.color} text-[10px] font-bold rounded-full flex-shrink-0`}>
                      {severityConfig.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {typeInfo.label} • Segnalato il {reportedDate} da {issue.reportedByName}
                  </p>
                  {!isExpanded && (
                    <p className="text-xs text-slate-600 mt-1 line-clamp-1">
                      {issue.description}
                    </p>
                  )}
                </div>
                
                {/* Expand Arrow */}
                <svg 
                  className={`w-5 h-5 text-slate-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-0">
                  <div className="border-t border-slate-100 pt-3">
                    {/* Descrizione completa */}
                    <p className="text-sm text-slate-700 mb-3">
                      {issue.description}
                    </p>
                    
                    {/* Foto */}
                    {issue.photos && Array.isArray(issue.photos) && issue.photos.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-slate-500 mb-2">📷 Foto allegate:</p>
                        <div className="flex gap-2 flex-wrap">
                          {issue.photos.filter(p => p).map((photo, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewPhoto?.(issue.photos.filter(p => p), idx);
                              }}
                              className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 hover:border-slate-400 transition-colors"
                            >
                              <img 
                                src={photo} 
                                alt={`Foto ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Info box */}
                    <div className={`${severityConfig.bg} rounded-lg p-2.5`}>
                      <p className={`text-xs ${severityConfig.color}`}>
                        💡 <strong>Cosa fare:</strong> Verifica questo problema durante la pulizia. 
                        Se riesci a risolverlo, potrai segnarlo come risolto al termine.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
