"use client";

import { useState, useEffect } from "react";

interface RatingScores {
  guestCleanliness: number;
  checkoutPunctuality: number;
  propertyCondition: number;
  damages: number;
  accessEase: number;
}

interface CleaningRatingBadgeProps {
  cleaningId: string;
  ratingScore?: number;
  compact?: boolean;
  showDetails?: boolean;
}

const CATEGORIES = [
  { key: 'guestCleanliness', icon: '🧹', label: 'Pulizia Ospiti' },
  { key: 'checkoutPunctuality', icon: '⏰', label: 'Puntualità' },
  { key: 'propertyCondition', icon: '🏠', label: 'Stato Casa' },
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

function getScoreEmoji(score: number): string {
  if (score >= 4.75) return "🌟";
  if (score >= 4.5) return "⭐";
  if (score >= 4.0) return "👍";
  if (score >= 3.5) return "✅";
  if (score >= 3.0) return "📊";
  if (score >= 2.5) return "⚠️";
  return "🔴";
}

export default function CleaningRatingBadge({ 
  cleaningId, 
  ratingScore,
  compact = true,
  showDetails = false 
}: CleaningRatingBadgeProps) {
  const [rating, setRating] = useState<any>(null);
  const [loading, setLoading] = useState(!ratingScore);

  useEffect(() => {
    if (ratingScore !== undefined) {
      setRating({ averageScore: ratingScore });
      setLoading(false);
      return;
    }

    async function loadRating() {
      try {
        const res = await fetch(`/api/property-ratings?cleaningId=${cleaningId}`);
        const data = await res.json();
        if (data.rating) {
          setRating(data.rating);
        }
      } catch (error) {
        console.error("Errore caricamento rating:", error);
      } finally {
        setLoading(false);
      }
    }

    loadRating();
  }, [cleaningId, ratingScore]);

  if (loading) {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg animate-pulse">
        <div className="w-3 h-3 bg-slate-300 rounded-full" />
        <div className="w-6 h-3 bg-slate-300 rounded" />
      </div>
    );
  }

  if (!rating) {
    return null;
  }

  const score = rating.averageScore;
  const color = getScoreColor(score);
  const emoji = getScoreEmoji(score);

  // Versione compatta (badge)
  if (compact && !showDetails) {
    return (
      <div 
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer transition-colors ${
          color === 'emerald' ? 'bg-emerald-50 border border-emerald-200 hover:bg-emerald-100' :
          color === 'green' ? 'bg-green-50 border border-green-200 hover:bg-green-100' :
          color === 'sky' ? 'bg-sky-50 border border-sky-200 hover:bg-sky-100' :
          color === 'amber' ? 'bg-amber-50 border border-amber-200 hover:bg-amber-100' :
          color === 'orange' ? 'bg-orange-50 border border-orange-200 hover:bg-orange-100' :
          'bg-rose-50 border border-rose-200 hover:bg-rose-100'
        }`}
        title={`Rating: ${score.toFixed(2)}/5`}
      >
        <span className="text-sm">{emoji}</span>
        <span className={`text-xs font-bold ${
          color === 'emerald' ? 'text-emerald-700' :
          color === 'green' ? 'text-green-700' :
          color === 'sky' ? 'text-sky-700' :
          color === 'amber' ? 'text-amber-700' :
          color === 'orange' ? 'text-orange-700' :
          'text-rose-700'
        }`}>{score.toFixed(1)}</span>
      </div>
    );
  }

  // Versione espansa con dettagli
  return (
    <div className={`rounded-xl p-3 ${
      color === 'emerald' ? 'bg-emerald-50 border border-emerald-200' :
      color === 'green' ? 'bg-green-50 border border-green-200' :
      color === 'sky' ? 'bg-sky-50 border border-sky-200' :
      color === 'amber' ? 'bg-amber-50 border border-amber-200' :
      color === 'orange' ? 'bg-orange-50 border border-orange-200' :
      'bg-rose-50 border border-rose-200'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{emoji}</span>
          <div>
            <p className="font-bold text-slate-800">Valutazione Pulizia</p>
            <p className="text-xs text-slate-500">Media su 5 categorie</p>
          </div>
        </div>
        <div className={`text-2xl font-black ${
          color === 'emerald' ? 'text-emerald-600' :
          color === 'green' ? 'text-green-600' :
          color === 'sky' ? 'text-sky-600' :
          color === 'amber' ? 'text-amber-600' :
          color === 'orange' ? 'text-orange-600' :
          'text-rose-600'
        }`}>
          {score.toFixed(1)}<span className="text-sm font-normal text-slate-400">/5</span>
        </div>
      </div>

      {/* Barra progresso */}
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-3">
        <div 
          className={`h-full rounded-full transition-all ${
            color === 'emerald' ? 'bg-emerald-500' :
            color === 'green' ? 'bg-green-500' :
            color === 'sky' ? 'bg-sky-500' :
            color === 'amber' ? 'bg-amber-500' :
            color === 'orange' ? 'bg-orange-500' :
            'bg-rose-500'
          }`}
          style={{ width: `${(score / 5) * 100}%` }}
        />
      </div>

      {/* Dettagli categorie se disponibili */}
      {rating.scores && (
        <div className="grid grid-cols-5 gap-2">
          {CATEGORIES.map(cat => {
            const catScore = rating.scores[cat.key as keyof RatingScores];
            if (!catScore) return null;
            const catColor = getScoreColor(catScore);
            
            return (
              <div 
                key={cat.key}
                className="flex flex-col items-center text-xs"
                title={`${cat.label}: ${catScore}/5`}
              >
                <span>{cat.icon}</span>
                <span className={`font-medium ${
                  catColor === 'emerald' ? 'text-emerald-600' :
                  catColor === 'green' ? 'text-green-600' :
                  catColor === 'sky' ? 'text-sky-600' :
                  catColor === 'amber' ? 'text-amber-600' :
                  catColor === 'orange' ? 'text-orange-600' :
                  'text-rose-600'
                }`}>{catScore}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Note operatore */}
      {rating.notes && (
        <div className="mt-2 pt-2 border-t border-slate-200">
          <p className="text-xs text-slate-500">Note: {rating.notes}</p>
        </div>
      )}
    </div>
  );
}
