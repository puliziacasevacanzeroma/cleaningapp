"use client";

import { useState, useEffect } from "react";

interface PropertyRatingsSectionProps {
  propertyId: string;
  isAdmin?: boolean;
}

const CATEGORIES = [
  { key: 'guestCleanliness', icon: '🧹', label: 'Pulizia Ospiti' },
  { key: 'checkoutPunctuality', icon: '⏰', label: 'Puntualità Checkout' },
  { key: 'propertyCondition', icon: '🏠', label: 'Stato Proprietà' },
  { key: 'damages', icon: '⚠️', label: 'Danni' },
  { key: 'accessEase', icon: '🔑', label: 'Accesso' },
];

function getScoreColor(score: number): string {
  if (score >= 4.5) return "emerald";
  if (score >= 4.0) return "green";
  if (score >= 3.5) return "sky";
  if (score >= 3.0) return "amber";
  if (score >= 2.5) return "orange";
  return "rose";
}

export default function PropertyRatingsSection({ propertyId, isAdmin = false }: PropertyRatingsSectionProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);

  useEffect(() => {
    async function loadRatings() {
      try {
        const res = await fetch(`/api/property-ratings?propertyId=${propertyId}&months=3`);
        if (!res.ok) throw new Error("Errore caricamento");
        const result = await res.json();
        setData(result);
      } catch (err) {
        setError("Impossibile caricare le valutazioni");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (propertyId) loadRatings();
  }, [propertyId]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-1/3"></div>
          <div className="h-20 bg-slate-100 rounded"></div>
          <div className="h-32 bg-slate-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !data || !data.summary) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">⭐</span>
          <h2 className="text-lg font-bold text-slate-800">Valutazioni Proprietà</h2>
        </div>
        <div className="text-center py-8 text-slate-400">
          <span className="text-4xl block mb-2">📊</span>
          <p>Nessuna valutazione disponibile</p>
          <p className="text-sm mt-1">Le valutazioni appariranno dopo le pulizie completate</p>
        </div>
      </div>
    );
  }

  const { summary, insights, trend } = data;
  const color = getScoreColor(summary.overallAverage);

  return (
    <div className="space-y-4">
      {/* Header con media generale */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⭐</span>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Valutazioni Proprietà</h2>
              <p className="text-xs text-slate-500">Ultimi 3 mesi • {summary.totalRatings} valutazioni</p>
            </div>
          </div>
          
          {/* Score grande */}
          <div className={`text-center px-4 py-2 rounded-xl ${
            color === 'emerald' ? 'bg-emerald-50' :
            color === 'green' ? 'bg-green-50' :
            color === 'sky' ? 'bg-sky-50' :
            color === 'amber' ? 'bg-amber-50' :
            color === 'orange' ? 'bg-orange-50' :
            'bg-rose-50'
          }`}>
            <div className={`text-3xl font-black ${
              color === 'emerald' ? 'text-emerald-600' :
              color === 'green' ? 'text-green-600' :
              color === 'sky' ? 'text-sky-600' :
              color === 'amber' ? 'text-amber-600' :
              color === 'orange' ? 'text-orange-600' :
              'text-rose-600'
            }`}>
              {summary.overallAverage.toFixed(1)}
            </div>
            <div className="text-xs text-slate-500">su 5</div>
          </div>
        </div>

        {/* Barre per categoria */}
        <div className="space-y-3">
          {CATEGORIES.map(cat => {
            const catData = summary.categoryAverages[cat.key];
            if (!catData || catData.count === 0) return null;
            
            const catColor = getScoreColor(catData.average);
            const percentage = (catData.average / 5) * 100;
            
            return (
              <div key={cat.key} className="flex items-center gap-3">
                <span className="text-lg w-6">{cat.icon}</span>
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600">{cat.label}</span>
                    <span className={`font-bold ${
                      catColor === 'emerald' ? 'text-emerald-600' :
                      catColor === 'green' ? 'text-green-600' :
                      catColor === 'sky' ? 'text-sky-600' :
                      catColor === 'amber' ? 'text-amber-600' :
                      catColor === 'orange' ? 'text-orange-600' :
                      'text-rose-600'
                    }`}>{catData.average.toFixed(1)}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        catColor === 'emerald' ? 'bg-emerald-500' :
                        catColor === 'green' ? 'bg-green-500' :
                        catColor === 'sky' ? 'bg-sky-500' :
                        catColor === 'amber' ? 'bg-amber-500' :
                        catColor === 'orange' ? 'bg-orange-500' :
                        'bg-rose-500'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Trend */}
        {trend && trend.data && trend.data.length > 1 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-slate-700">Trend</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                trend.direction === 'improving' ? 'bg-emerald-100 text-emerald-700' :
                trend.direction === 'declining' ? 'bg-rose-100 text-rose-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {trend.direction === 'improving' ? '📈 In miglioramento' :
                 trend.direction === 'declining' ? '📉 In calo' :
                 '➡️ Stabile'}
              </span>
            </div>
            
            {/* Mini grafico trend */}
            <div className="flex items-end gap-1 h-12">
              {trend.data.map((item: any, idx: number) => {
                const height = (item.average / 5) * 100;
                const itemColor = getScoreColor(item.average);
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center">
                    <div 
                      className={`w-full rounded-t ${
                        itemColor === 'emerald' ? 'bg-emerald-400' :
                        itemColor === 'green' ? 'bg-green-400' :
                        itemColor === 'sky' ? 'bg-sky-400' :
                        itemColor === 'amber' ? 'bg-amber-400' :
                        itemColor === 'orange' ? 'bg-orange-400' :
                        'bg-rose-400'
                      }`}
                      style={{ height: `${height}%` }}
                      title={`${item.month}: ${item.average.toFixed(1)}`}
                    />
                    <span className="text-[10px] text-slate-400 mt-1">
                      {item.month.split('-')[1]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Consigli e Suggerimenti */}
      {insights && insights.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span>💡</span> Consigli per Migliorare
          </h3>
          
          <div className="space-y-3">
            {insights.map((insight: any, idx: number) => {
              const isExpanded = expandedInsight === insight.category;
              const needsAttention = ['critical', 'problematic', 'improve', 'attention'].includes(insight.priority);
              const isGood = ['excellence', 'great', 'very_good'].includes(insight.priority);
              
              return (
                <div 
                  key={idx}
                  className={`rounded-xl border overflow-hidden ${
                    needsAttention ? 'border-amber-200 bg-amber-50' :
                    isGood ? 'border-emerald-200 bg-emerald-50' :
                    'border-slate-200 bg-slate-50'
                  }`}
                >
                  <button
                    onClick={() => setExpandedInsight(isExpanded ? null : insight.category)}
                    className="w-full p-4 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{insight.categoryIcon}</span>
                      <div>
                        <p className="font-semibold text-slate-800">{insight.title}</p>
                        <p className="text-xs text-slate-500">{insight.categoryLabel} • {insight.score.toFixed(1)}/5</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        needsAttention ? 'bg-amber-200 text-amber-800' :
                        isGood ? 'bg-emerald-200 text-emerald-800' :
                        'bg-slate-200 text-slate-700'
                      }`}>
                        {insight.priorityEmoji} {insight.priorityLabel}
                      </span>
                      <svg 
                        className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0">
                      <p className="text-sm text-slate-600 mb-3">{insight.message}</p>
                      
                      {insight.suggestions && insight.suggestions.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-700 mb-2">Suggerimenti:</p>
                          <ul className="space-y-1">
                            {insight.suggestions.map((sugg: string, sIdx: number) => (
                              <li key={sIdx} className="flex items-start gap-2 text-sm text-slate-600">
                                <span className="text-emerald-500 mt-0.5">✓</span>
                                {sugg}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
