import { Timestamp } from "firebase/firestore";

// ═══════════════════════════════════════════════════════════════
// SERVICE TYPE - Tipi di servizio pulizia
// ═══════════════════════════════════════════════════════════════

export interface ServiceType {
  id: string;
  
  // Info base
  name: string;                 // "Pulizia Standard", "Pulizia Profonda"
  description: string;
  code: string;                 // "STANDARD", "DEEP_CLEAN", etc.
  
  // Prezzo
  basePrice: number;            // Prezzo base
  pricePerRoom?: number;        // Prezzo aggiuntivo per stanza
  pricePerBathroom?: number;    // Prezzo aggiuntivo per bagno
  pricePerGuest?: number;       // Prezzo aggiuntivo per ospite
  minPrice?: number;            // Prezzo minimo
  maxPrice?: number;            // Prezzo massimo
  
  // Tempo stimato
  estimatedDuration: number;    // Durata stimata in minuti
  durationPerRoom?: number;     // Minuti extra per stanza
  durationPerBathroom?: number; // Minuti extra per bagno
  
  // Checklist predefinita
  defaultChecklist?: ServiceChecklistTemplate[];
  
  // Requisiti
  minPhotosRequired: number;    // Minimo foto da caricare
  requiresRating: boolean;      // Richiede valutazione proprietà
  
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
    description: "Pulizia completa per checkout/checkin",
    code: "STANDARD",
    basePrice: 50,
    pricePerRoom: 10,
    pricePerBathroom: 15,
    estimatedDuration: 90,
    durationPerRoom: 20,
    durationPerBathroom: 15,
    minPhotosRequired: 10,
    requiresRating: true,
    isActive: true,
    sortOrder: 1,
    icon: "🧹",
    color: "#3B82F6",
    availableForManual: true,
    availableForAuto: true,
  },
  {
    name: "Pulizia Profonda",
    description: "Pulizia approfondita con sanificazione",
    code: "DEEP_CLEAN",
    basePrice: 100,
    pricePerRoom: 20,
    pricePerBathroom: 25,
    estimatedDuration: 180,
    durationPerRoom: 30,
    durationPerBathroom: 25,
    minPhotosRequired: 15,
    requiresRating: true,
    isActive: true,
    sortOrder: 2,
    icon: "✨",
    color: "#8B5CF6",
    availableForManual: true,
    availableForAuto: false,
  },
  {
    name: "Preparazione Check-in",
    description: "Controllo e preparazione rapida per arrivo ospiti",
    code: "CHECKIN_PREP",
    basePrice: 25,
    estimatedDuration: 30,
    minPhotosRequired: 5,
    requiresRating: false,
    isActive: true,
    sortOrder: 3,
    icon: "🔑",
    color: "#10B981",
    availableForManual: true,
    availableForAuto: false,
  },
  {
    name: "Manutenzione",
    description: "Intervento di manutenzione o riparazione",
    code: "MAINTENANCE",
    basePrice: 40,
    estimatedDuration: 60,
    minPhotosRequired: 5,
    requiresRating: false,
    isActive: true,
    sortOrder: 4,
    icon: "🔧",
    color: "#F59E0B",
    availableForManual: true,
    availableForAuto: false,
  },
  {
    name: "Emergenza",
    description: "Intervento urgente fuori programma",
    code: "EMERGENCY",
    basePrice: 80,
    estimatedDuration: 60,
    minPhotosRequired: 10,
    requiresRating: true,
    isActive: true,
    sortOrder: 5,
    icon: "🚨",
    color: "#EF4444",
    availableForManual: true,
    availableForAuto: false,
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
  code: string;
  basePrice: number;
  pricePerRoom?: number;
  pricePerBathroom?: number;
  pricePerGuest?: number;
  estimatedDuration: number;
  durationPerRoom?: number;
  durationPerBathroom?: number;
  minPhotosRequired: number;
  requiresRating: boolean;
  sortOrder?: number;
  icon?: string;
  color?: string;
  availableForManual?: boolean;
  availableForAuto?: boolean;
}

export interface UpdateServiceTypeInput extends Partial<CreateServiceTypeInput> {
  isActive?: boolean;
}
