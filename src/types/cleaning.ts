import { Timestamp } from "firebase/firestore";

// ═══════════════════════════════════════════════════════════════
// CLEANING STATUS - Stati possibili di una pulizia
// ═══════════════════════════════════════════════════════════════

export type CleaningStatus = 
  | "pending"      // Creata, in attesa di assegnazione
  | "assigned"     // Assegnata a operatore, in attesa di inizio
  | "in_progress"  // Operatore ha iniziato la pulizia
  | "completed"    // Operatore ha completato, in attesa verifica
  | "verified"     // Admin ha verificato e approvato
  | "cancelled";   // Cancellata

export type CleaningType = 
  | "checkout"     // Pulizia standard checkout
  | "checkin"      // Preparazione pre-checkin
  | "deep_clean"   // Pulizia profonda
  | "maintenance"  // Manutenzione/riparazione
  | "emergency";   // Emergenza

// ═══════════════════════════════════════════════════════════════
// CLEANING PHOTO - Sistema foto ottimizzato
// ═══════════════════════════════════════════════════════════════

export type PhotoCategory = 
  | "entrance"     // Ingresso
  | "living"       // Soggiorno
  | "kitchen"      // Cucina
  | "bedroom"      // Camera da letto
  | "bathroom"     // Bagno
  | "balcony"      // Balcone/terrazza
  | "issue"        // Problema/danno
  | "before"       // Prima della pulizia
  | "after"        // Dopo la pulizia
  | "other";       // Altro

export interface CleaningPhoto {
  id: string;
  cleaningId: string;
  
  // URL immagini (Firebase Storage)
  originalUrl: string;      // Immagine originale compressa
  thumbnailUrl: string;     // Thumbnail 200x200 per lista
  
  // Metadata
  category: PhotoCategory;
  caption?: string;         // Descrizione opzionale
  roomName?: string;        // Nome stanza specifica
  
  // Info tecniche
  fileSize: number;         // Dimensione in bytes
  width: number;
  height: number;
  mimeType: string;
  
  // Upload tracking
  uploadedAt: Timestamp;
  uploadedBy: string;       // operatorId
  
  // Per problemi/danni
  isIssuePhoto: boolean;
  issueId?: string;         // Collegamento a CleaningIssue
}

// Per upload progressivo lato client
export interface PhotoUploadProgress {
  id: string;               // ID temporaneo locale
  localUri: string;         // URI locale per preview immediata
  thumbnailDataUrl: string; // Data URL thumbnail per preview
  status: "pending" | "compressing" | "uploading" | "completed" | "error";
  progress: number;         // 0-100
  error?: string;
  retryCount: number;
  category: PhotoCategory;
  caption?: string;
}

// ═══════════════════════════════════════════════════════════════
// CLEANING ISSUE - Problemi rilevati durante pulizia
// ═══════════════════════════════════════════════════════════════

export type IssueSeverity = "low" | "medium" | "high" | "critical";
export type IssueStatus = "reported" | "acknowledged" | "in_progress" | "resolved" | "closed";

export type IssueCategory = 
  | "damage"           // Danno a mobili/struttura
  | "missing_item"     // Oggetto mancante
  | "broken_appliance" // Elettrodomestico rotto
  | "plumbing"         // Problema idraulico
  | "electrical"       // Problema elettrico
  | "cleanliness"      // Problemi pulizia precedente
  | "pest"             // Infestazione
  | "safety"           // Problema sicurezza
  | "other";           // Altro

export interface CleaningIssue {
  id: string;
  cleaningId: string;
  propertyId: string;
  
  // Dettagli problema
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  location?: string;        // Dove nell'appartamento
  
  // Foto collegate
  photoIds: string[];
  
  // Stato
  status: IssueStatus;
  
  // Costo stimato riparazione
  estimatedCost?: number;
  actualCost?: number;
  
  // Tracking
  reportedBy: string;       // operatorId
  reportedAt: Timestamp;
  acknowledgedBy?: string;
  acknowledgedAt?: Timestamp;
  resolvedBy?: string;
  resolvedAt?: Timestamp;
  resolutionNotes?: string;
  
  // Se addebitato al guest precedente
  chargedToGuest: boolean;
  chargeAmount?: number;
}

// ═══════════════════════════════════════════════════════════════
// EXTRA CHARGE - Costi aggiuntivi
// ═══════════════════════════════════════════════════════════════

export type ExtraChargeType = 
  | "deep_cleaning"    // Pulizia extra necessaria
  | "damage_repair"    // Riparazione danno
  | "missing_item"     // Oggetto mancante
  | "extra_time"       // Tempo extra impiegato
  | "special_request"  // Richiesta speciale proprietario
  | "holiday_fee"      // Maggiorazione festivo
  | "urgency_fee"      // Maggiorazione urgenza
  | "other";           // Altro

export interface ExtraCharge {
  id: string;
  cleaningId: string;
  
  type: ExtraChargeType;
  description: string;
  amount: number;
  
  // Chi paga
  chargeToOwner: boolean;   // Se true, addebitato al proprietario
  chargeToGuest: boolean;   // Se true, addebitato al guest
  
  // Approvazione
  requiresApproval: boolean;
  approved: boolean;
  approvedBy?: string;
  approvedAt?: Timestamp;
  
  // Collegamento a issue se presente
  issueId?: string;
  
  // Tracking
  createdBy: string;
  createdAt: Timestamp;
}

// ═══════════════════════════════════════════════════════════════
// PROPERTY RATING - Valutazione proprietà post-pulizia
// ═══════════════════════════════════════════════════════════════

export interface PropertyRatingScores {
  cleanliness: number;          // 1-5 Pulizia lasciata dal guest
  checkoutPunctuality: number;  // 1-5 Puntualità checkout
  generalCondition: number;     // 1-5 Condizione generale
  damages: number;              // 1-5 Presenza danni (5 = nessun danno)
}

export interface PropertyRating {
  id: string;
  cleaningId: string;
  propertyId: string;
  bookingId?: string;
  
  // Punteggi
  scores: PropertyRatingScores;
  averageScore: number;         // Media calcolata
  
  // Note
  operatorNotes?: string;       // Note private per admin
  publicNotes?: string;         // Note visibili al proprietario
  
  // Foto specifiche per danni
  damagePhotoIds: string[];
  
  // Tracking
  ratedBy: string;              // operatorId
  ratedAt: Timestamp;
}

// ═══════════════════════════════════════════════════════════════
// CLEANING - Entità principale pulizia
// ═══════════════════════════════════════════════════════════════

export interface Cleaning {
  id: string;
  
  // ─── Riferimenti ───
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  propertyCity?: string;
  ownerId: string;
  ownerName?: string;
  bookingId?: string;           // Se collegata a prenotazione
  
  // ─── Operatore ───
  operatorId?: string;
  operatorName?: string;
  assignedBy?: string;          // Chi ha assegnato
  assignedAt?: Timestamp;       // Quando assegnato
  
  // ─── Pianificazione ───
  scheduledDate: Timestamp;     // Data pulizia (a mezzogiorno per timezone)
  scheduledTime?: string;       // Orario preferito "10:00"
  originalDate?: Timestamp;     // Se spostata, data originale
  estimatedDuration?: number;   // Durata stimata in minuti
  
  // ─── Tipo e Status ───
  type: CleaningType;
  status: CleaningStatus;
  priority: "low" | "normal" | "high" | "urgent";
  
  // ─── Prezzo ───
  serviceTypeId?: string;
  basePrice: number;            // Prezzo base del servizio
  holidayFee: number;           // Maggiorazione festivo
  extraChargesTotal: number;    // Totale costi extra
  finalPrice: number;           // Prezzo finale
  
  // ─── Ospiti ───
  guestsCount?: number;
  checkInTime?: string;         // Orario checkin successivo
  checkOutTime?: string;        // Orario checkout
  
  // ─── Esecuzione ───
  startedAt?: Timestamp;        // Inizio effettivo
  completedAt?: Timestamp;      // Fine effettiva
  duration?: number;            // Durata effettiva in minuti
  
  // ─── Checklist ───
  checklistCompleted: boolean;
  checklistItems?: CleaningChecklistItem[];
  
  // ─── Note ───
  adminNotes?: string;          // Note admin (visibili solo admin)
  ownerNotes?: string;          // Note proprietario (istruzioni speciali)
  operatorNotes?: string;       // Note operatore (post pulizia)
  
  // ─── Dati completamento ───
  photosCount: number;          // Numero foto caricate
  photoIds: string[];           // ID foto in storage
  issuesCount: number;          // Numero problemi rilevati
  issueIds: string[];           // ID issues
  extraChargeIds: string[];     // ID costi extra
  ratingId?: string;            // ID valutazione proprietà
  
  // ─── Cancellazione ───
  cancelledAt?: Timestamp;
  cancelledBy?: string;
  cancellationReason?: string;
  
  // ─── Biancheria ───
  laundryOrderId?: string;      // Ordine biancheria collegato
  requiresLaundry: boolean;
  
  // ─── Sync iCal ───
  sourceCalendar?: "airbnb" | "booking" | "manual";
  externalUid?: string;         // UID evento iCal
  lastSyncAt?: Timestamp;
  
  // ─── Tracking ───
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  
  // ─── Verifiche ───
  verifiedAt?: Timestamp;
  verifiedBy?: string;
  verificationNotes?: string;
}

// ═══════════════════════════════════════════════════════════════
// CHECKLIST ITEM - Elementi checklist pulizia
// ═══════════════════════════════════════════════════════════════

export interface CleaningChecklistItem {
  id: string;
  category: string;             // "cucina", "bagno", etc.
  task: string;                 // Descrizione attività
  completed: boolean;
  completedAt?: Timestamp;
  photoRequired: boolean;       // Se richiede foto
  photoId?: string;
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════
// CANCELLED CLEANING RECORD - Per evitare re-sync iCal
// ═══════════════════════════════════════════════════════════════

export interface CancelledCleaningRecord {
  id: string;
  propertyId: string;
  originalDate: Timestamp;
  externalUid?: string;
  reason: string;
  cancelledBy: string;
  cancelledAt: Timestamp;
  // Questo record previene che la pulizia venga ricreata dal sync iCal
}

// ═══════════════════════════════════════════════════════════════
// CLEANING SUMMARY - Per vista riepilogo post-completamento
// ═══════════════════════════════════════════════════════════════

export interface CleaningSummary {
  cleaning: Cleaning;
  photos: CleaningPhoto[];
  issues: CleaningIssue[];
  extraCharges: ExtraCharge[];
  rating?: PropertyRating;
  
  // Statistiche
  stats: {
    totalPhotos: number;
    photosByCategory: Record<PhotoCategory, number>;
    totalIssues: number;
    issuesBySeverity: Record<IssueSeverity, number>;
    totalExtraCharges: number;
    durationMinutes: number;
    averageRating: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// CLEANING FILTERS - Per query e filtri
// ═══════════════════════════════════════════════════════════════

export interface CleaningFilters {
  propertyId?: string;
  propertyIds?: string[];       // Per proprietario con più proprietà
  operatorId?: string;
  ownerId?: string;
  status?: CleaningStatus | CleaningStatus[];
  type?: CleaningType | CleaningType[];
  dateFrom?: Date;
  dateTo?: Date;
  hasIssues?: boolean;
  hasPhotos?: boolean;
  priority?: "low" | "normal" | "high" | "urgent";
  sourceCalendar?: "airbnb" | "booking" | "manual";
}

// ═══════════════════════════════════════════════════════════════
// CLEANING STATS - Statistiche pulizie
// ═══════════════════════════════════════════════════════════════

export interface CleaningStats {
  total: number;
  byStatus: Record<CleaningStatus, number>;
  byType: Record<CleaningType, number>;
  completedToday: number;
  pendingToday: number;
  averageDuration: number;
  averageRating: number;
  totalRevenue: number;
  issuesReported: number;
}

// ═══════════════════════════════════════════════════════════════
// FORM TYPES - Per creazione/modifica
// ═══════════════════════════════════════════════════════════════

export interface CreateCleaningInput {
  propertyId: string;
  scheduledDate: Date;
  scheduledTime?: string;
  type: CleaningType;
  serviceTypeId?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  guestsCount?: number;
  bookingId?: string;
  adminNotes?: string;
  requiresLaundry?: boolean;
}

export interface UpdateCleaningInput {
  scheduledDate?: Date;
  scheduledTime?: string;
  operatorId?: string;
  status?: CleaningStatus;
  priority?: "low" | "normal" | "high" | "urgent";
  adminNotes?: string;
  ownerNotes?: string;
}

export interface CompleteCleaningInput {
  operatorNotes?: string;
  rating: {
    scores: PropertyRatingScores;
    operatorNotes?: string;
    publicNotes?: string;
  };
  issues?: Omit<CleaningIssue, "id" | "cleaningId" | "propertyId" | "reportedBy" | "reportedAt" | "status">[];
  extraCharges?: Omit<ExtraCharge, "id" | "cleaningId" | "createdBy" | "createdAt">[];
}
