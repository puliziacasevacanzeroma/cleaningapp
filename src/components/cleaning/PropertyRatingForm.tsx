"use client";

import { useState } from "react";

// ═══════════════════════════════════════════════════════════════
// TIPI E COSTANTI - 5 CATEGORIE
// ═══════════════════════════════════════════════════════════════

interface RatingScores {
  guestCleanliness: number;
  checkoutPunctuality: number;
  propertyCondition: number;
  damages: number;
  accessEase: number;
}

const CATEGORIES = [
  {
    key: 'guestCleanliness' as keyof RatingScores,
    icon: '🧹',
    label: 'Pulizia Ospiti',
    description: 'Quanto era pulita la casa al tuo arrivo?',
    lowLabel: 'Molto sporca',
    highLabel: 'Perfetta',
  },
  {
    key: 'checkoutPunctuality' as keyof RatingScores,
    icon: '⏰',
    label: 'Puntualità Checkout',
    description: 'Gli ospiti erano usciti in orario?',
    lowLabel: 'Molto in ritardo',
    highLabel: 'Puntuali',
  },
  {
    key: 'propertyCondition' as keyof RatingScores,
    icon: '🏠',
    label: 'Stato Proprietà',
    description: 'Condizione generale della casa',
    lowLabel: 'Problemi gravi',
    highLabel: 'Ottimo stato',
  },
  {
    key: 'damages' as keyof RatingScores,
    icon: '⚠️',
    label: 'Danni Riscontrati',
    description: 'Hai trovato danni o rotture?',
    lowLabel: 'Danni gravi',
    highLabel: 'Nessun danno',
  },
  {
    key: 'accessEase' as keyof RatingScores,
    icon: '🔑',
    label: 'Facilità Accesso',
    description: 'Chiavi, codici, istruzioni chiare?',
    lowLabel: 'Molto difficile',
    highLabel: 'Molto facile',
  },
];

interface PropertyRatingFormProps {
  onRatingChange: (scores: RatingScores, notes: string, isComplete: boolean) => void;
  initialScores?: Partial<RatingScores>;
  initialNotes?: string;
  compact?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// STAR RATING COMPONENT
// ═══════════════════════════════════════════════════════════════

function StarRating({ 
  value, 
  onChange, 
  size = "normal" 
}: { 
  value: number; 
  onChange: (v: number) => void;
  size?: "small" | "normal" | "large";
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  
  const sizeClasses = {
    small: "text-xl",
    normal: "text-2xl",
    large: "text-3xl",
  };
  
  const displayValue = hovered ?? value;
  
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(null)}
          className={`${sizeClasses[size]} transition-all duration-150 active:scale-90 touch-manipulation`}
        >
          {star <= displayValue ? (
            <span className="text-amber-400 drop-shadow-sm">★</span>
          ) : (
            <span className="text-slate-300">☆</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function PropertyRatingForm({ 
  onRatingChange, 
  initialScores,
  initialNotes = "",
  compact = false 
}: PropertyRatingFormProps) {
  const [scores, setScores] = useState<RatingScores>({
    guestCleanliness: initialScores?.guestCleanliness || 0,
    checkoutPunctuality: initialScores?.checkoutPunctuality || 0,
    propertyCondition: initialScores?.propertyCondition || 0,
    damages: initialScores?.damages || 0,
    accessEase: initialScores?.accessEase || 0,
  });
  const [notes, setNotes] = useState(initialNotes);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Calcola media e stato completamento (5 categorie)
  const scoredCategories = Object.values(scores).filter(s => s > 0).length;
  const averageScore = scoredCategories > 0 
    ? Object.values(scores).reduce((a, b) => a + b, 0) / scoredCategories 
    : 0;
  const isComplete = scoredCategories === 5; // 5 categorie
  const progress = (scoredCategories / 5) * 100;

  const handleScoreChange = (key: keyof RatingScores, value: number) => {
    const newScores = { ...scores, [key]: value };
    setScores(newScores);
    
    const newScoredCategories = Object.values(newScores).filter(s => s > 0).length;
    onRatingChange(newScores, notes, newScoredCategories === 5);
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    onRatingChange(scores, value, isComplete);
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="space-y-4">
      {/* Header con progresso */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">⭐</span>
            <h3 className="font-bold text-slate-800">Valutazione Proprietà</h3>
          </div>
          <div className="flex items-center gap-2">
            {isComplete && (
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-medium">
                ✓ Completa
              </span>
            )}
            <span className="text-sm font-bold text-slate-600">
              {averageScore > 0 ? averageScore.toFixed(1) : "-"}/5
            </span>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-300 ${
              isComplete ? "bg-emerald-500" : "bg-amber-400"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-slate-400 mt-1.5">
          {scoredCategories}/5 categorie valutate
        </p>
      </div>

      {/* Categorie */}
      <div className="space-y-2">
        {CATEGORIES.map((category) => {
          const score = scores[category.key];
          const isExpanded = expandedCategory === category.key || !compact;
          
          return (
            <div 
              key={category.key}
              className={`bg-white rounded-xl shadow-sm overflow-hidden transition-all ${
                score > 0 ? "border-l-4 border-emerald-400" : ""
              }`}
            >
              {/* Header categoria */}
              <button
                type="button"
                onClick={() => compact && setExpandedCategory(
                  expandedCategory === category.key ? null : category.key
                )}
                className={`w-full p-4 flex items-center justify-between ${
                  compact ? "cursor-pointer active:bg-slate-50" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{category.icon}</span>
                  <div className="text-left">
                    <p className="font-semibold text-slate-800">{category.label}</p>
                    {!compact && (
                      <p className="text-xs text-slate-500">{category.description}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {score > 0 && (
                    <span className={`text-sm font-bold ${
                      score >= 4 ? "text-emerald-600" :
                      score >= 3 ? "text-amber-600" :
                      "text-rose-600"
                    }`}>
                      {score}/5
                    </span>
                  )}
                  {compact && (
                    <svg 
                      className={`w-5 h-5 text-slate-400 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </div>
              </button>
              
              {/* Contenuto espanso */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-0">
                  {compact && (
                    <p className="text-xs text-slate-500 mb-3">{category.description}</p>
                  )}
                  
                  {/* Stars */}
                  <div className="flex justify-center mb-2">
                    <StarRating
                      value={score}
                      onChange={(v) => handleScoreChange(category.key, v)}
                      size={compact ? "normal" : "large"}
                    />
                  </div>
                  
                  {/* Labels */}
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{category.lowLabel}</span>
                    <span>{category.highLabel}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Note */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <label className="flex items-center gap-2 mb-2">
          <span className="text-lg">📝</span>
          <span className="text-sm font-semibold text-slate-700">Note per il proprietario</span>
          <span className="text-xs text-slate-400">(opzionale)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="Segnala dettagli utili per il proprietario..."
          className="w-full p-3 border border-slate-200 rounded-lg text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
        />
      </div>

      {/* Riepilogo quando completo */}
      {isComplete && (
        <div className={`rounded-xl p-4 ${
          averageScore >= 4 ? "bg-emerald-50 border border-emerald-200" :
          averageScore >= 3 ? "bg-amber-50 border border-amber-200" :
          "bg-rose-50 border border-rose-200"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold ${
              averageScore >= 4 ? "bg-emerald-100 text-emerald-600" :
              averageScore >= 3 ? "bg-amber-100 text-amber-600" :
              "bg-rose-100 text-rose-600"
            }`}>
              {averageScore.toFixed(1)}
            </div>
            <div>
              <p className="font-semibold text-slate-800">
                {averageScore >= 4 ? "Ottima valutazione! 🎉" :
                 averageScore >= 3 ? "Valutazione nella media" :
                 "Alcuni problemi riscontrati"}
              </p>
              <p className="text-xs text-slate-500">
                Media su 5 categorie
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
