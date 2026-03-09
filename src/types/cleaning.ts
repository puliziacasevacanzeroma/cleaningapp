// ═══════════════════════════════════════════════════════════════
// PROPERTY RATING - Valutazione proprietà post-pulizia (5 categorie)
// ═══════════════════════════════════════════════════════════════

import { Timestamp } from "firebase/firestore";

export interface PropertyRatingScores {
  guestCleanliness: number;     // 1-5 🧹 Pulizia lasciata dagli ospiti
  checkoutPunctuality: number;  // 1-5 ⏰ Puntualità checkout ospiti
  propertyCondition: number;    // 1-5 🏠 Stato generale proprietà
  damages: number;              // 1-5 ⚠️ Danni riscontrati (5 = nessun danno)
  accessEase: number;           // 1-5 🔑 Facilità di accesso
}

export const RATING_CATEGORIES = {
  guestCleanliness: {
    key: 'guestCleanliness',
    icon: '🧹',
    label: 'Pulizia Ospiti',
    description: 'Quanto era pulita la casa al tuo arrivo?',
    lowLabel: 'Molto sporca',
    highLabel: 'Perfetta',
  },
  checkoutPunctuality: {
    key: 'checkoutPunctuality',
    icon: '⏰',
    label: 'Puntualità Checkout',
    description: 'Gli ospiti erano usciti in orario?',
    lowLabel: 'Molto in ritardo',
    highLabel: 'Puntuali',
  },
  propertyCondition: {
    key: 'propertyCondition',
    icon: '🏠',
    label: 'Stato Proprietà',
    description: 'Condizione generale della casa',
    lowLabel: 'Problemi gravi',
    highLabel: 'Ottimo stato',
  },
  damages: {
    key: 'damages',
    icon: '⚠️',
    label: 'Danni Riscontrati',
    description: 'Hai trovato danni o rotture?',
    lowLabel: 'Danni gravi',
    highLabel: 'Nessun danno',
  },
  accessEase: {
    key: 'accessEase',
    icon: '🔑',
    label: 'Facilità Accesso',
    description: 'Chiavi, codici, istruzioni chiare?',
    lowLabel: 'Molto difficile',
    highLabel: 'Molto facile',
  },
} as const;

export interface PropertyRating {
  id: string;
  cleaningId: string;
  propertyId: string;
  propertyName: string;
  bookingId?: string;
  
  // Punteggi (5 categorie)
  scores: PropertyRatingScores;
  averageScore: number;         // Media calcolata automatica
  
  // Note
  operatorNotes?: string;       // Note per admin
  ownerNotes?: string;          // Note visibili al proprietario
  
  // Tracking
  operatorId: string;
  operatorName: string;
  createdAt: Timestamp;
}

// ═══════════════════════════════════════════════════════════════
// ISSUE REPORTING - Segnalazione problemi durante pulizia
// ═══════════════════════════════════════════════════════════════

export type IssueType = 
  | 'damage'           // Danni riscontrati
  | 'missing_item'     // Oggetti mancanti
  | 'maintenance'      // Manutenzione necessaria
  | 'cleanliness'      // Problemi pulizia grave
  | 'safety'           // Problemi sicurezza
  | 'other';           // Altro

export const ISSUE_TYPES = {
  damage: { icon: '💔', label: 'Danno riscontrato', color: 'rose' },
  missing_item: { icon: '📦', label: 'Oggetto mancante', color: 'amber' },
  maintenance: { icon: '🔧', label: 'Manutenzione necessaria', color: 'orange' },
  cleanliness: { icon: '🧹', label: 'Problema pulizia grave', color: 'yellow' },
  safety: { icon: '⚠️', label: 'Problema sicurezza', color: 'red' },
  other: { icon: '📝', label: 'Altro', color: 'slate' },
} as const;

export interface CleaningIssue {
  id: string;
  cleaningId: string;
  propertyId: string;
  propertyName: string;
  
  // Dettagli problema
  type: IssueType;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  photos: string[];             // URL foto del problema
  
  // Stato
  status: 'open' | 'in_progress' | 'resolved' | 'wont_fix';
  resolvedAt?: Timestamp;
  resolvedBy?: string;
  resolution?: string;
  
  // Tracking
  reportedBy: string;           // operatorId
  reportedByName: string;
  reportedAt: Timestamp;
}

// ═══════════════════════════════════════════════════════════════
// PROPERTY INSIGHTS - Consigli automatici per proprietario
// ═══════════════════════════════════════════════════════════════

export type InsightCategory = 
  | 'cleanliness'
  | 'checkout'
  | 'maintenance'
  | 'damages'
  | 'access';

export type InsightPriority = 'info' | 'suggestion' | 'warning' | 'critical';

export interface PropertyInsight {
  id: string;
  propertyId: string;
  category: InsightCategory;
  priority: InsightPriority;
  title: string;
  message: string;
  suggestions: string[];        // Lista di azioni suggerite
  basedOnRatings: number;       // Numero di valutazioni analizzate
  averageScore: number;         // Media nella categoria
  trend: 'improving' | 'stable' | 'declining';
  createdAt: Timestamp;
  dismissedAt?: Timestamp;      // Se il proprietario l'ha ignorato
}

// Helper per calcolare insights
export const INSIGHT_THRESHOLDS = {
  warning: 3.0,                 // Sotto questa media → warning
  critical: 2.0,                // Sotto questa → critical
  minRatings: 3,                // Minimo valutazioni per generare insight
} as const;
