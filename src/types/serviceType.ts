import { Timestamp } from "firebase/firestore";

// ═══════════════════════════════════════════════════════════════
// SERVICE TYPE - Tipi di servizio pulizia
// ═══════════════════════════════════════════════════════════════

export type ServiceTypeCode = "STANDARD" | "APPROFONDITA" | "SGROSSO";

export interface ServiceType {
  id: string;
  
  // Info base
  name: string;                 // "Pulizia Standard", "Pulizia Approfondita", "Sgrosso"
  description: string;
  code: ServiceTypeCode;
  
  // Prezzo
  // NOTA: Il prezzo base viene dal CONTRATTO della proprietà
  // Questi campi sono solo per eventuali sovrapprezzi
  baseSurcharge: number;        // Sovrapprezzo fisso (0 per STANDARD e APPROFONDITA)
  requiresManualPrice: boolean; // Se true, prezzo inserito manualmente (SGROSSO)
  
  // Tempo stimato
  estimatedDuration: number;    // Durata stimata in minuti
  extraDuration?: number;       // Minuti extra rispetto a STANDARD
  
  // Checklist predefinita
  defaultChecklist?: ServiceChecklistTemplate[];
  
  // Requisiti
  minPhotosRequired: number;    // Minimo foto da caricare
  requiresRating: boolean;      // Richiede valutazione proprietà
  
  // Permessi e logica
  adminOnly: boolean;           // Solo admin può creare/assegnare
  clientCanRequest: boolean;    // Cliente può richiederlo (attende approvazione)
  requiresApproval: boolean;    // Richiede approvazione admin
  requiresReason: boolean;      // Richiede motivo (per SGROSSO)
  
  // Auto-assegnazione
  autoAssignEveryN?: number;    // Ogni N pulizie diventa questo tipo (es. APPROFONDITA ogni 5)
  
  // Configurazione
  isActive: boolean;
  sortOrder: number;            // Per ordinamento in UI
  icon?: string;                // Icona (emoji o nome icona)
  color?: string;               // Colore tema
  
  // Disponibilità
  availableForManual: boolean;  // Disponibile per creazione manuale
  availableForAuto: boolean;    // Disponibile per creazione automatica (iCal)
  
  // Tracking
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

// ═══════════════════════════════════════════════════════════════
// MOTIVI SGROSSO
// ═══════════════════════════════════════════════════════════════

export type SgrossoReasonCode = 
  | "BAMBINI" 
  | "ANIMALI" 
  | "LUNGO_PERIODO" 
  | "SPORCO_ESTREMO" 
  | "LAVORI" 
  | "ALTRO";

export interface SgrossoReason {
  code: SgrossoReasonCode;
  label: string;
  icon: string;
  requiresNotes: boolean;  // Se true, note obbligatorie (es. ALTRO)
}

export const SGROSSO_REASONS: SgrossoReason[] = [
  { code: "BAMBINI", label: "Post famiglia con bambini", icon: "👶", requiresNotes: false },
  { code: "ANIMALI", label: "Post animali", icon: "🐕", requiresNotes: false },
  { code: "LUNGO_PERIODO", label: "Lungo periodo senza pulizia", icon: "📅", requiresNotes: false },
  { code: "SPORCO_ESTREMO", label: "Danneggiamento/sporco estremo", icon: "⚠️", requiresNotes: false },
  { code: "LAVORI", label: "Post ristrutturazione/lavori", icon: "🔨", requiresNotes: false },
  { code: "ALTRO", label: "Altro", icon: "📝", requiresNotes: true },
];

// ═══════════════════════════════════════════════════════════════
// SERVICE CHECKLIST TEMPLATE
// ═══════════════════════════════════════════════════════════════

export interface ServiceChecklistTemplate {
  id: string;
  category: string;             // "Cucina", "Bagno", "Camera", etc.
  categoryIcon?: string;
  items: ServiceChecklistItem[];
  sortOrder: number;
}

export interface ServiceChecklistItem {
  id: string;
  task: string;                 // "Pulire piano cottura"
  description?: string;         // Descrizione dettagliata
  photoRequired: boolean;       // Se richiede foto
  estimatedTime?: number;       // Tempo stimato in minuti
  priority: "required" | "recommended" | "optional";
}

// ═══════════════════════════════════════════════════════════════
// SERVICE TYPE PRESETS - Configurazioni predefinite
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_SERVICE_TYPES: Omit<ServiceType, "id" | "createdAt" | "updatedAt" | "createdBy">[] = [
  {
    name: "Pulizia Standard",
    description: "Pulizia normale per checkout o su richiesta",
    code: "STANDARD",
    baseSurcharge: 0,           // Prezzo da contratto, nessun sovrapprezzo
    requiresManualPrice: false,
    estimatedDuration: 90,
    minPhotosRequired: 10,
    requiresRating: true,
    adminOnly: false,           // Tutti possono crearla
    clientCanRequest: true,     // Cliente può richiederla
    requiresApproval: false,    // Non richiede approvazione
    requiresReason: false,      // Non richiede motivo
    isActive: true,
    sortOrder: 1,
    icon: "🧹",
    color: "#3B82F6",
    availableForManual: true,
    availableForAuto: true,     // Questa è quella che si crea da iCal
  },
  {
    name: "Pulizia Approfondita",
    description: "Pulizia più accurata - automatica ogni 5 pulizie o su richiesta admin",
    code: "APPROFONDITA",
    baseSurcharge: 0,           // Stesso prezzo di STANDARD
    requiresManualPrice: false,
    estimatedDuration: 120,     // 30 min extra
    extraDuration: 30,
    minPhotosRequired: 15,      // Più foto richieste
    requiresRating: true,
    adminOnly: true,            // Solo admin può assegnarla manualmente
    clientCanRequest: false,    // Cliente NON può richiederla
    requiresApproval: false,
    requiresReason: false,
    autoAssignEveryN: 5,        // Ogni 5 pulizie diventa automaticamente APPROFONDITA
    isActive: true,
    sortOrder: 2,
    icon: "✨",
    color: "#8B5CF6",
    availableForManual: true,   // Admin può crearla manualmente
    availableForAuto: true,     // Sistema può auto-assegnarla
  },
  {
    name: "Sgrosso",
    description: "Pulizia straordinaria con prezzo concordato",
    code: "SGROSSO",
    baseSurcharge: 0,           // Prezzo inserito manualmente
    requiresManualPrice: true,  // Admin deve inserire prezzo
    estimatedDuration: 180,     // Tempo variabile
    minPhotosRequired: 20,      // Molte foto richieste
    requiresRating: true,
    adminOnly: false,           // Admin può crearla direttamente
    clientCanRequest: true,     // Cliente può RICHIEDERLA (attende approvazione)
    requiresApproval: true,     // RICHIEDE approvazione admin
    requiresReason: true,       // RICHIEDE motivo (dropdown)
    isActive: true,
    sortOrder: 3,
    icon: "🔴",
    color: "#EF4444",
    availableForManual: true,
    availableForAuto: false,    // Mai automatica
  },
];

// ═══════════════════════════════════════════════════════════════
// CHECKLIST TEMPLATES - Template checklist predefinite
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_CHECKLIST_TEMPLATES: ServiceChecklistTemplate[] = [
  {
    id: "kitchen",
    category: "Cucina",
    categoryIcon: "🍳",
    sortOrder: 1,
    items: [
      { id: "k1", task: "Pulire piano cottura", photoRequired: true, priority: "required" },
      { id: "k2", task: "Pulire forno interno/esterno", photoRequired: false, priority: "required" },
      { id: "k3", task: "Pulire frigorifero interno/esterno", photoRequired: true, priority: "required" },
      { id: "k4", task: "Lavare stoviglie o caricare lavastoviglie", photoRequired: false, priority: "required" },
      { id: "k5", task: "Pulire lavello", photoRequired: false, priority: "required" },
      { id: "k6", task: "Pulire superfici e piano di lavoro", photoRequired: true, priority: "required" },
      { id: "k7", task: "Svuotare e pulire pattumiera", photoRequired: false, priority: "required" },
      { id: "k8", task: "Pulire microonde", photoRequired: false, priority: "recommended" },
      { id: "k9", task: "Controllare scorte (sale, olio, caffè)", photoRequired: false, priority: "recommended" },
    ],
  },
  {
    id: "bathroom",
    category: "Bagno",
    categoryIcon: "🚿",
    sortOrder: 2,
    items: [
      { id: "b1", task: "Pulire e disinfettare WC", photoRequired: true, priority: "required" },
      { id: "b2", task: "Pulire lavandino e rubinetteria", photoRequired: true, priority: "required" },
      { id: "b3", task: "Pulire doccia/vasca", photoRequired: true, priority: "required" },
      { id: "b4", task: "Pulire specchio", photoRequired: false, priority: "required" },
      { id: "b5", task: "Sostituire asciugamani", photoRequired: false, priority: "required" },
      { id: "b6", task: "Rifornire carta igienica", photoRequired: false, priority: "required" },
      { id: "b7", task: "Rifornire sapone/shampoo", photoRequired: false, priority: "required" },
      { id: "b8", task: "Lavare pavimento", photoRequired: false, priority: "required" },
      { id: "b9", task: "Svuotare cestino", photoRequired: false, priority: "required" },
    ],
  },
  {
    id: "bedroom",
    category: "Camera da Letto",
    categoryIcon: "🛏️",
    sortOrder: 3,
    items: [
      { id: "r1", task: "Cambiare lenzuola", photoRequired: true, priority: "required" },
      { id: "r2", task: "Rifare letto", photoRequired: true, priority: "required" },
      { id: "r3", task: "Spolverare superfici", photoRequired: false, priority: "required" },
      { id: "r4", task: "Pulire comodini", photoRequired: false, priority: "required" },
      { id: "r5", task: "Controllare armadio (grucce, spazio)", photoRequired: false, priority: "recommended" },
      { id: "r6", task: "Aspirare/lavare pavimento", photoRequired: false, priority: "required" },
      { id: "r7", task: "Controllare funzionamento luci", photoRequired: false, priority: "recommended" },
    ],
  },
  {
    id: "living",
    category: "Soggiorno",
    categoryIcon: "🛋️",
    sortOrder: 4,
    items: [
      { id: "l1", task: "Spolverare mobili e superfici", photoRequired: false, priority: "required" },
      { id: "l2", task: "Pulire tavolo", photoRequired: true, priority: "required" },
      { id: "l3", task: "Sistemare cuscini divano", photoRequired: false, priority: "required" },
      { id: "l4", task: "Pulire TV e telecomandi", photoRequired: false, priority: "recommended" },
      { id: "l5", task: "Aspirare/lavare pavimento", photoRequired: false, priority: "required" },
      { id: "l6", task: "Controllare funzionamento TV/WiFi", photoRequired: false, priority: "recommended" },
    ],
  },
  {
    id: "entrance",
    category: "Ingresso",
    categoryIcon: "🚪",
    sortOrder: 5,
    items: [
      { id: "e1", task: "Pulire zerbino", photoRequired: false, priority: "required" },
      { id: "e2", task: "Spolverare appendiabiti", photoRequired: false, priority: "recommended" },
      { id: "e3", task: "Pulire specchio ingresso", photoRequired: false, priority: "recommended" },
      { id: "e4", task: "Verificare chiavi di scorta", photoRequired: false, priority: "required" },
      { id: "e5", task: "Foto ingresso", photoRequired: true, priority: "required" },
    ],
  },
  {
    id: "balcony",
    category: "Balcone/Terrazza",
    categoryIcon: "🌿",
    sortOrder: 6,
    items: [
      { id: "t1", task: "Spazzare pavimento", photoRequired: false, priority: "required" },
      { id: "t2", task: "Pulire mobili esterni", photoRequired: false, priority: "recommended" },
      { id: "t3", task: "Svuotare posacenere", photoRequired: false, priority: "required" },
      { id: "t4", task: "Controllare piante", photoRequired: false, priority: "optional" },
    ],
  },
  {
    id: "final",
    category: "Controllo Finale",
    categoryIcon: "✅",
    sortOrder: 99,
    items: [
      { id: "f1", task: "Controllare tutte le luci", photoRequired: false, priority: "required" },
      { id: "f2", task: "Controllare aria condizionata/riscaldamento", photoRequired: false, priority: "required" },
      { id: "f3", task: "Controllare acqua calda", photoRequired: false, priority: "required" },
      { id: "f4", task: "Chiudere finestre", photoRequired: false, priority: "required" },
      { id: "f5", task: "Foto generale appartamento", photoRequired: true, priority: "required" },
      { id: "f6", task: "Lasciare welcome kit", photoRequired: false, priority: "recommended" },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// FORM TYPES
// ═══════════════════════════════════════════════════════════════

export interface CreateServiceTypeInput {
  name: string;
  description: string;
  code: ServiceTypeCode;
  baseSurcharge: number;
  requiresManualPrice: boolean;
  estimatedDuration: number;
  extraDuration?: number;
  minPhotosRequired: number;
  requiresRating: boolean;
  adminOnly: boolean;
  clientCanRequest: boolean;
  requiresApproval: boolean;
  requiresReason: boolean;
  autoAssignEveryN?: number;
  sortOrder?: number;
  icon?: string;
  color?: string;
  availableForManual?: boolean;
  availableForAuto?: boolean;
}

export interface UpdateServiceTypeInput extends Partial<CreateServiceTypeInput> {
  isActive?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// RICHIESTA SGROSSO (dal cliente)
// ═══════════════════════════════════════════════════════════════

export interface SgrossoRequest {
  id: string;
  propertyId: string;
  propertyName: string;
  requestedBy: string;           // ID cliente
  requestedByName: string;
  requestedDate: Timestamp;      // Data richiesta pulizia
  reasonCode: SgrossoReasonCode;
  reasonNotes?: string;          // Obbligatorio se reasonCode === "ALTRO"
  status: "pending" | "approved" | "rejected";
  
  // Compilati da admin se approvato
  approvedBy?: string;
  approvedAt?: Timestamp;
  approvedPrice?: number;        // Prezzo approvato da admin
  adminNotes?: string;
  
  // Se rifiutato
  rejectedBy?: string;
  rejectedAt?: Timestamp;
  rejectionReason?: string;
  
  // Pulizia creata
  cleaningId?: string;           // ID pulizia creata dopo approvazione
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
