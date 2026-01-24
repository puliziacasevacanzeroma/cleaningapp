/**
 * Tipi per il Sistema di Accettazione Regolamento/Contratto
 * 
 * Questo modulo definisce le interfacce per:
 * - Documenti regolamentari (regolamento operativo, privacy, termini)
 * - Accettazione contratto con firma digitale
 */

import { Timestamp } from "firebase/firestore";

// ==================== TIPI BASE ====================

/**
 * Tipi di documenti regolamentari
 */
export type RegulationDocumentType = 
  | "regolamento_operativo"  // Regolamento operativo per collaboratori
  | "privacy_policy"         // Informativa privacy
  | "termini_servizio"       // Termini e condizioni di servizio
  | "contratto_lavoro"       // Contratto di collaborazione
  | "codice_condotta";       // Codice di condotta

/**
 * Ruoli a cui si applica un documento
 */
export type ApplicableRole = 
  | "ADMIN" 
  | "PROPRIETARIO" 
  | "OPERATORE_PULIZIE" 
  | "RIDER" 
  | "ALL";

/**
 * Metodo di firma utilizzato
 */
export type SignatureMethod = 
  | "drawn"      // Firma disegnata su canvas
  | "typed"      // Nome digitato come firma
  | "uploaded"   // Immagine firma caricata
  | "biometric"; // Firma biometrica (futuro)

/**
 * Status dell'accettazione
 */
export type AcceptanceStatus = 
  | "valid"      // Accettazione valida
  | "expired"    // Scaduta (nuova versione documento disponibile)
  | "revoked"    // Revocata dall'utente o admin
  | "pending";   // In attesa di completamento

// ==================== DOCUMENTO REGOLAMENTARE ====================

/**
 * Documento regolamentare (regolamento, privacy policy, etc.)
 * 
 * Collection: regulationDocuments
 */
export interface RegulationDocument {
  id: string;
  
  // Identificazione
  type: RegulationDocumentType;
  version: string;              // Es: "1.0", "2.1"
  title: string;                // Es: "Regolamento Operativo v2.1"
  
  // Contenuto
  content: string;              // Contenuto HTML del documento
  pdfUrl?: string;              // URL al PDF scaricabile (opzionale)
  hash: string;                 // Hash SHA-256 del contenuto per verifica integrità
  
  // Applicabilità
  applicableTo: ApplicableRole[]; // Ruoli a cui si applica
  
  // Validità temporale
  effectiveFrom: Timestamp;     // Data di entrata in vigore
  effectiveUntil?: Timestamp;   // Data di scadenza (opzionale)
  
  // Versioning
  previousVersion?: string;     // ID della versione precedente
  changelog?: string;           // Note sulle modifiche rispetto alla versione precedente
  
  // Stato
  isActive: boolean;            // Se è la versione attiva corrente
  isDraft: boolean;             // Se è ancora una bozza
  
  // Metadata
  createdAt: Timestamp;
  createdBy: string;            // ID dell'admin che ha creato
  updatedAt?: Timestamp;
  updatedBy?: string;
  publishedAt?: Timestamp;      // Quando è stato pubblicato
  publishedBy?: string;
}

// ==================== CONSENSI ====================

/**
 * Consensi richiesti per l'accettazione
 */
export interface AcceptanceConsents {
  readFully: boolean;           // "Dichiaro di aver letto integralmente il documento"
  acceptTerms: boolean;         // "Accetto integralmente i termini e le condizioni"
  privacyConsent: boolean;      // "Acconsento al trattamento dei dati personali"
  
  // Consensi opzionali aggiuntivi
  marketingConsent?: boolean;   // Consenso comunicazioni marketing
  dataShareConsent?: boolean;   // Consenso condivisione dati con terzi
}

// ==================== METADATA ACCETTAZIONE ====================

/**
 * Metadata raccolti al momento dell'accettazione
 */
export interface AcceptanceMetadata {
  // Informazioni dispositivo/browser
  ipAddress: string;            // Indirizzo IP
  userAgent: string;            // User agent del browser
  
  // Geolocalizzazione (se concessa)
  geolocation?: {
    latitude: number;
    longitude: number;
    accuracy: number;           // Precisione in metri
    timestamp: number;          // Timestamp della rilevazione
  };
  
  // Timestamp e timezone
  timestamp: Timestamp;         // Momento esatto dell'accettazione
  timezone: string;             // Es: "Europe/Rome"
  localTime: string;            // Ora locale formattata
  
  // Informazioni aggiuntive
  screenResolution?: string;    // Es: "1920x1080"
  language?: string;            // Lingua del browser
  platform?: string;            // Sistema operativo
}

// ==================== ACCETTAZIONE CONTRATTO ====================

/**
 * Record di accettazione contratto/regolamento
 * 
 * Collection: contractAcceptances
 */
export interface ContractAcceptance {
  id: string;
  
  // Utente
  userId: string;               // ID utente Firebase
  userRole: ApplicableRole;     // Ruolo dell'utente al momento della firma
  userEmail: string;            // Email per riferimento
  
  // Dati identificativi (inseriti dall'utente)
  fullName: string;             // Nome e cognome completo
  fiscalCode: string;           // Codice fiscale italiano
  
  // Documento accettato
  documentId: string;           // ID del RegulationDocument
  documentType: RegulationDocumentType;
  documentVersion: string;      // Versione del documento
  documentHash: string;         // Hash del documento al momento della firma
  documentTitle: string;        // Titolo per riferimento
  documentUrl?: string;         // URL al PDF se disponibile
  
  // Firma
  signatureImage: string;       // Base64 della firma disegnata
  signatureMethod: SignatureMethod;
  
  // Consensi
  consents: AcceptanceConsents;
  
  // Metadata raccolta automatica
  metadata: AcceptanceMetadata;
  
  // Stato
  status: AcceptanceStatus;
  
  // Timestamp
  createdAt: Timestamp;
  
  // Revoca (se applicabile)
  revokedAt?: Timestamp;
  revokedBy?: string;           // ID di chi ha revocato
  revokedReason?: string;       // Motivo revoca
}

// ==================== USER CONTRACT STATUS ====================

/**
 * Stato dell'accettazione contratto per un utente
 * Salvato nel documento utente per quick access
 */
export interface UserContractStatus {
  accepted: boolean;            // Se ha accettato il contratto corrente
  acceptanceId?: string;        // ID dell'ultima accettazione
  version?: string;             // Versione accettata
  acceptedAt?: Timestamp;       // Quando ha accettato
  
  // Se necessita ri-accettazione
  needsReAcceptance: boolean;   // True se c'è nuova versione
  pendingVersion?: string;      // Versione da accettare
}

// ==================== API TYPES ====================

/**
 * Richiesta per accettare un contratto
 */
export interface AcceptContractRequest {
  // Dati utente
  fullName: string;
  fiscalCode: string;
  
  // Firma
  signatureImage: string;       // Base64 PNG
  
  // Consensi
  consents: AcceptanceConsents;
  
  // Geolocation (opzionale, dal frontend)
  geolocation?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

/**
 * Risposta accettazione contratto
 */
export interface AcceptContractResponse {
  success: boolean;
  acceptanceId?: string;
  error?: string;
  message?: string;
}

/**
 * Documento corrente per un ruolo
 */
export interface CurrentDocumentResponse {
  document: RegulationDocument | null;
  userAcceptance: ContractAcceptance | null;
  needsAcceptance: boolean;
  message?: string;
}

/**
 * Storico accettazioni
 */
export interface AcceptanceHistoryResponse {
  acceptances: ContractAcceptance[];
  total: number;
}

// ==================== VALIDATION ====================

/**
 * Regex per validazione codice fiscale italiano
 */
export const FISCAL_CODE_REGEX = /^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/i;

/**
 * Valida il formato del codice fiscale
 */
export function isValidFiscalCode(code: string): boolean {
  if (!code || code.length !== 16) return false;
  return FISCAL_CODE_REGEX.test(code.toUpperCase());
}

/**
 * Valida che tutti i consensi obbligatori siano accettati
 */
export function areConsentsValid(consents: AcceptanceConsents): boolean {
  return consents.readFully && consents.acceptTerms && consents.privacyConsent;
}

/**
 * Valida che la firma sia presente e valida
 */
export function isSignatureValid(signature: string): boolean {
  if (!signature) return false;
  // Deve essere una stringa base64 valida che inizia con data:image/png
  return signature.startsWith("data:image/png;base64,") && signature.length > 100;
}

// ==================== HELPERS ====================

/**
 * Genera hash SHA-256 di un contenuto
 */
export async function generateContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Formatta il codice fiscale in maiuscolo
 */
export function formatFiscalCode(code: string): string {
  return code.toUpperCase().replace(/\s/g, "");
}
