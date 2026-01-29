"use client";

import { useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type BedType = 
  | "matrimoniale" 
  | "singolo" 
  | "piazza_mezza" 
  | "divano_letto" 
  | "castello"
  | "letto_aggiuntivo";

export type BedSize = "xs" | "sm" | "md" | "lg" | "xl";

export type BedColor = 
  | "emerald" 
  | "blue" 
  | "violet" 
  | "rose" 
  | "amber" 
  | "slate" 
  | "sky"
  | "teal";

interface BedIconProps {
  type: BedType;
  size?: BedSize;
  color?: BedColor;
  active?: boolean;
  showLabel?: boolean;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SIZE & COLOR MAPS
// ═══════════════════════════════════════════════════════════════════════════

const SIZE_MAP: Record<BedSize, { width: number; height: number; labelSize: string }> = {
  xs: { width: 24, height: 24, labelSize: "text-[10px]" },
  sm: { width: 32, height: 32, labelSize: "text-xs" },
  md: { width: 40, height: 40, labelSize: "text-sm" },
  lg: { width: 56, height: 56, labelSize: "text-sm" },
  xl: { width: 72, height: 72, labelSize: "text-base" },
};

const COLOR_MAP: Record<BedColor, { stroke: string; fill: string; bg: string; text: string }> = {
  emerald: { 
    stroke: "#059669", // emerald-600
    fill: "#d1fae5",   // emerald-100
    bg: "bg-emerald-50",
    text: "text-emerald-700"
  },
  blue: { 
    stroke: "#2563eb", // blue-600
    fill: "#dbeafe",   // blue-100
    bg: "bg-blue-50",
    text: "text-blue-700"
  },
  violet: { 
    stroke: "#7c3aed", // violet-600
    fill: "#ede9fe",   // violet-100
    bg: "bg-violet-50",
    text: "text-violet-700"
  },
  rose: { 
    stroke: "#e11d48", // rose-600
    fill: "#ffe4e6",   // rose-100
    bg: "bg-rose-50",
    text: "text-rose-700"
  },
  amber: { 
    stroke: "#d97706", // amber-600
    fill: "#fef3c7",   // amber-100
    bg: "bg-amber-50",
    text: "text-amber-700"
  },
  slate: { 
    stroke: "#475569", // slate-600
    fill: "#f1f5f9",   // slate-100
    bg: "bg-slate-50",
    text: "text-slate-700"
  },
  sky: { 
    stroke: "#0284c7", // sky-600
    fill: "#e0f2fe",   // sky-100
    bg: "bg-sky-50",
    text: "text-sky-700"
  },
  teal: { 
    stroke: "#0d9488", // teal-600
    fill: "#ccfbf1",   // teal-100
    bg: "bg-teal-50",
    text: "text-teal-700"
  },
};

const BED_LABELS: Record<BedType, string> = {
  matrimoniale: "Matrimoniale",
  singolo: "Singolo",
  piazza_mezza: "1 Piazza e ½",
  divano_letto: "Divano Letto",
  castello: "Castello",
  letto_aggiuntivo: "Aggiuntivo",
};

// ═══════════════════════════════════════════════════════════════════════════
// SVG COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

// Letto Matrimoniale - Letto grande con due cuscini
function MatrimonialeIcon({ stroke, fill }: { stroke: string; fill: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Testiera */}
      <rect x="4" y="8" width="40" height="8" rx="2" fill={fill} stroke={stroke} strokeWidth="2"/>
      
      {/* Materasso */}
      <rect x="4" y="16" width="40" height="20" rx="2" fill={fill} stroke={stroke} strokeWidth="2"/>
      
      {/* Cuscino sinistro */}
      <rect x="7" y="11" width="14" height="6" rx="1.5" fill="white" stroke={stroke} strokeWidth="1.5"/>
      
      {/* Cuscino destro */}
      <rect x="27" y="11" width="14" height="6" rx="1.5" fill="white" stroke={stroke} strokeWidth="1.5"/>
      
      {/* Coperta - linea decorativa */}
      <path d="M8 26 H40" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4 2"/>
      
      {/* Piedini */}
      <rect x="6" y="36" width="4" height="4" rx="1" fill={stroke}/>
      <rect x="38" y="36" width="4" height="4" rx="1" fill={stroke}/>
    </svg>
  );
}

// Letto Singolo - Letto stretto con un cuscino
function SingoloIcon({ stroke, fill }: { stroke: string; fill: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Testiera */}
      <rect x="12" y="8" width="24" height="8" rx="2" fill={fill} stroke={stroke} strokeWidth="2"/>
      
      {/* Materasso */}
      <rect x="12" y="16" width="24" height="20" rx="2" fill={fill} stroke={stroke} strokeWidth="2"/>
      
      {/* Cuscino */}
      <rect x="16" y="11" width="16" height="6" rx="1.5" fill="white" stroke={stroke} strokeWidth="1.5"/>
      
      {/* Coperta - linea decorativa */}
      <path d="M16 26 H32" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4 2"/>
      
      {/* Piedini */}
      <rect x="14" y="36" width="4" height="4" rx="1" fill={stroke}/>
      <rect x="30" y="36" width="4" height="4" rx="1" fill={stroke}/>
    </svg>
  );
}

// Letto 1 Piazza e Mezza - Letto medio con un cuscino grande
function PiazzaMezzaIcon({ stroke, fill }: { stroke: string; fill: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Testiera */}
      <rect x="8" y="8" width="32" height="8" rx="2" fill={fill} stroke={stroke} strokeWidth="2"/>
      
      {/* Materasso */}
      <rect x="8" y="16" width="32" height="20" rx="2" fill={fill} stroke={stroke} strokeWidth="2"/>
      
      {/* Cuscino grande */}
      <rect x="12" y="11" width="24" height="6" rx="1.5" fill="white" stroke={stroke} strokeWidth="1.5"/>
      
      {/* Coperta - linea decorativa */}
      <path d="M12 26 H36" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4 2"/>
      
      {/* Piedini */}
      <rect x="10" y="36" width="4" height="4" rx="1" fill={stroke}/>
      <rect x="34" y="36" width="4" height="4" rx="1" fill={stroke}/>
    </svg>
  );
}

// Divano Letto - Divano con braccioli
function DivanoLettoIcon({ stroke, fill }: { stroke: string; fill: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Schienale */}
      <rect x="4" y="10" width="40" height="10" rx="2" fill={fill} stroke={stroke} strokeWidth="2"/>
      
      {/* Seduta/Materasso */}
      <rect x="4" y="20" width="40" height="12" rx="2" fill={fill} stroke={stroke} strokeWidth="2"/>
      
      {/* Bracciolo sinistro */}
      <rect x="2" y="14" width="6" height="18" rx="2" fill={fill} stroke={stroke} strokeWidth="2"/>
      
      {/* Bracciolo destro */}
      <rect x="40" y="14" width="6" height="18" rx="2" fill={fill} stroke={stroke} strokeWidth="2"/>
      
      {/* Cuscini decorativi */}
      <rect x="10" y="13" width="8" height="6" rx="1.5" fill="white" stroke={stroke} strokeWidth="1.5"/>
      <rect x="30" y="13" width="8" height="6" rx="1.5" fill="white" stroke={stroke} strokeWidth="1.5"/>
      
      {/* Piedini */}
      <rect x="8" y="32" width="4" height="6" rx="1" fill={stroke}/>
      <rect x="36" y="32" width="4" height="6" rx="1" fill={stroke}/>
    </svg>
  );
}

// Letto a Castello - Due letti sovrapposti
function CastelloIcon({ stroke, fill }: { stroke: string; fill: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Struttura laterale sinistra */}
      <rect x="6" y="4" width="3" height="40" rx="1" fill={stroke}/>
      
      {/* Struttura laterale destra */}
      <rect x="39" y="4" width="3" height="40" rx="1" fill={stroke}/>
      
      {/* Letto superiore - materasso */}
      <rect x="9" y="8" width="30" height="10" rx="2" fill={fill} stroke={stroke} strokeWidth="2"/>
      
      {/* Letto superiore - cuscino */}
      <rect x="12" y="10" width="10" height="5" rx="1" fill="white" stroke={stroke} strokeWidth="1"/>
      
      {/* Barra sicurezza superiore */}
      <rect x="9" y="5" width="30" height="3" rx="1" fill={fill} stroke={stroke} strokeWidth="1.5"/>
      
      {/* Letto inferiore - materasso */}
      <rect x="9" y="28" width="30" height="10" rx="2" fill={fill} stroke={stroke} strokeWidth="2"/>
      
      {/* Letto inferiore - cuscino */}
      <rect x="12" y="30" width="10" height="5" rx="1" fill="white" stroke={stroke} strokeWidth="1"/>
      
      {/* Scala */}
      <rect x="34" y="18" width="3" height="20" rx="0.5" fill={stroke}/>
      <rect x="32" y="22" width="7" height="2" rx="0.5" fill={stroke}/>
      <rect x="32" y="28" width="7" height="2" rx="0.5" fill={stroke}/>
      <rect x="32" y="34" width="7" height="2" rx="0.5" fill={stroke}/>
    </svg>
  );
}

// Letto Aggiuntivo - Brandina/letto pieghevole
function LettoAggiuntivoIcon({ stroke, fill }: { stroke: string; fill: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Struttura pieghevole - gambe a X */}
      <path d="M8 40 L20 20 M20 40 L8 20" stroke={stroke} strokeWidth="2" strokeLinecap="round"/>
      <path d="M28 40 L40 20 M40 40 L28 20" stroke={stroke} strokeWidth="2" strokeLinecap="round"/>
      
      {/* Materasso */}
      <rect x="6" y="12" width="36" height="10" rx="2" fill={fill} stroke={stroke} strokeWidth="2"/>
      
      {/* Cuscino */}
      <rect x="9" y="14" width="12" height="5" rx="1.5" fill="white" stroke={stroke} strokeWidth="1.5"/>
      
      {/* Coperta linea */}
      <path d="M24 17 H38" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 2"/>
      
      {/* Ruote */}
      <circle cx="10" cy="42" r="2" fill={stroke}/>
      <circle cx="38" cy="42" r="2" fill={stroke}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function BedIcon({ 
  type, 
  size = "md", 
  color = "emerald",
  active = false,
  showLabel = false,
  className = ""
}: BedIconProps) {
  const sizeConfig = SIZE_MAP[size];
  const colorConfig = COLOR_MAP[color];
  
  const IconComponent = useMemo(() => {
    const props = { 
      stroke: active ? colorConfig.stroke : "#64748b", // slate-500 when inactive
      fill: active ? colorConfig.fill : "#f1f5f9"      // slate-100 when inactive
    };
    
    switch (type) {
      case "matrimoniale":
        return <MatrimonialeIcon {...props} />;
      case "singolo":
        return <SingoloIcon {...props} />;
      case "piazza_mezza":
        return <PiazzaMezzaIcon {...props} />;
      case "divano_letto":
        return <DivanoLettoIcon {...props} />;
      case "castello":
        return <CastelloIcon {...props} />;
      case "letto_aggiuntivo":
        return <LettoAggiuntivoIcon {...props} />;
      default:
        return <SingoloIcon {...props} />;
    }
  }, [type, active, colorConfig]);

  if (showLabel) {
    return (
      <div className={`flex flex-col items-center gap-1 ${className}`}>
        <div 
          className={`rounded-xl p-2 transition-all duration-200 ${
            active 
              ? `${colorConfig.bg} ring-2 ring-${color}-300 shadow-sm` 
              : "bg-slate-50"
          }`}
          style={{ width: sizeConfig.width + 16, height: sizeConfig.height + 16 }}
        >
          <div style={{ width: sizeConfig.width, height: sizeConfig.height }}>
            {IconComponent}
          </div>
        </div>
        <span className={`${sizeConfig.labelSize} font-medium ${
          active ? colorConfig.text : "text-slate-500"
        }`}>
          {BED_LABELS[type]}
        </span>
      </div>
    );
  }

  return (
    <div 
      className={`inline-flex items-center justify-center transition-all duration-200 ${className}`}
      style={{ width: sizeConfig.width, height: sizeConfig.height }}
    >
      {IconComponent}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BADGE COMPONENT - Per mostrare tipo + quantità
// ═══════════════════════════════════════════════════════════════════════════

interface BedBadgeProps {
  type: BedType;
  quantity?: number;
  color?: BedColor;
  size?: "sm" | "md";
}

export function BedBadge({ type, quantity = 1, color = "emerald", size = "md" }: BedBadgeProps) {
  const colorConfig = COLOR_MAP[color];
  const isSmall = size === "sm";
  
  return (
    <div className={`inline-flex items-center gap-2 ${colorConfig.bg} ${
      isSmall ? "px-2 py-1 rounded-lg" : "px-3 py-1.5 rounded-xl"
    }`}>
      <BedIcon 
        type={type} 
        size={isSmall ? "xs" : "sm"} 
        color={color} 
        active 
      />
      <span className={`font-medium ${colorConfig.text} ${isSmall ? "text-xs" : "text-sm"}`}>
        {quantity > 1 && `${quantity}x `}{BED_LABELS[type]}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOM CONFIG COMPONENT - Per mostrare configurazione stanza
// ═══════════════════════════════════════════════════════════════════════════

interface Bed {
  tipo: BedType;
  quantita: number;
}

interface RoomConfigProps {
  roomName: string;
  beds: Bed[];
  color?: BedColor;
  compact?: boolean;
}

export function RoomConfig({ roomName, beds, color = "emerald", compact = false }: RoomConfigProps) {
  const colorConfig = COLOR_MAP[color];
  
  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-600 min-w-[80px]">{roomName}:</span>
        {beds.map((bed, idx) => (
          <BedBadge 
            key={idx} 
            type={bed.tipo} 
            quantity={bed.quantita} 
            color={color}
            size="sm"
          />
        ))}
      </div>
    );
  }
  
  return (
    <div className={`${colorConfig.bg} rounded-xl p-3 border border-${color}-100`}>
      <p className={`text-xs font-bold ${colorConfig.text} uppercase tracking-wide mb-2`}>
        {roomName}
      </p>
      <div className="flex flex-wrap gap-2">
        {beds.map((bed, idx) => (
          <BedBadge 
            key={idx} 
            type={bed.tipo} 
            quantity={bed.quantita} 
            color={color}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BED SELECTOR COMPONENT - Per selezionare tipi di letto
// ═══════════════════════════════════════════════════════════════════════════

interface BedSelectorProps {
  selectedType: BedType | null;
  onSelect: (type: BedType) => void;
  color?: BedColor;
  availableTypes?: BedType[];
}

export function BedSelector({ 
  selectedType, 
  onSelect, 
  color = "emerald",
  availableTypes = ["matrimoniale", "singolo", "piazza_mezza", "divano_letto", "castello", "letto_aggiuntivo"]
}: BedSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {availableTypes.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onSelect(type)}
          className={`p-3 rounded-xl border-2 transition-all duration-200 active:scale-95 ${
            selectedType === type
              ? `border-${color}-400 bg-${color}-50 shadow-sm`
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <BedIcon 
            type={type} 
            size="lg" 
            color={color}
            active={selectedType === type}
            showLabel
          />
        </button>
      ))}
    </div>
  );
}
