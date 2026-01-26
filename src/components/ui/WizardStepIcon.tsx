"use client";

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD STEP ICONS - Icone SVG professionali per il wizard pulizia
// ═══════════════════════════════════════════════════════════════════════════

interface StepIconProps {
  size?: number;
  color?: string;
  className?: string;
}

// 📋 BRIEFING - Clipboard con checklist
export function BriefingIcon({ size = 24, color = "currentColor", className = "" }: StepIconProps) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      className={className}
    >
      {/* Clipboard board */}
      <rect x="4" y="4" width="16" height="18" rx="2" fill={color} opacity="0.2" />
      <rect x="4" y="4" width="16" height="18" rx="2" stroke={color} strokeWidth="1.5" fill="none" />
      
      {/* Clipboard clip */}
      <rect x="8" y="2" width="8" height="4" rx="1" fill={color} />
      
      {/* Lines */}
      <line x1="8" y1="10" x2="16" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="14" x2="14" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="18" x2="12" y2="18" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ✓ CHECKLIST - Lista con checkmarks
export function ChecklistIcon({ size = 24, color = "currentColor", className = "" }: StepIconProps) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      className={className}
    >
      {/* Paper */}
      <rect x="5" y="3" width="14" height="18" rx="2" fill={color} opacity="0.2" />
      <rect x="5" y="3" width="14" height="18" rx="2" stroke={color} strokeWidth="1.5" fill="none" />
      
      {/* Checkmark 1 */}
      <path d="M8 9L10 11L13 7" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      
      {/* Checkmark 2 */}
      <path d="M8 15L10 17L13 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      
      {/* Lines */}
      <line x1="15" y1="9" x2="17" y2="9" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="15" y1="15" x2="17" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// 🧴 PRODUCTS - Bottiglia spray
export function ProductsIcon({ size = 24, color = "currentColor", className = "" }: StepIconProps) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      className={className}
    >
      {/* Bottle body */}
      <path 
        d="M8 10V20C8 21.1 8.9 22 10 22H14C15.1 22 16 21.1 16 20V10" 
        fill={color} 
        opacity="0.2" 
      />
      <path 
        d="M8 10V20C8 21.1 8.9 22 10 22H14C15.1 22 16 21.1 16 20V10" 
        stroke={color} 
        strokeWidth="1.5" 
        fill="none"
      />
      
      {/* Bottle neck */}
      <rect x="10" y="6" width="4" height="4" fill={color} />
      
      {/* Spray head */}
      <path d="M10 6V4C10 3.45 10.45 3 11 3H13C13.55 3 14 3.45 14 4V6" stroke={color} strokeWidth="1.5" />
      
      {/* Trigger */}
      <path d="M14 4H17C17.55 4 18 4.45 18 5V6C18 6.55 17.55 7 17 7H14" stroke={color} strokeWidth="1.5" />
      
      {/* Spray lines */}
      <line x1="19" y1="3" x2="21" y2="2" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <line x1="19" y1="5" x2="22" y2="5" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <line x1="19" y1="7" x2="21" y2="8" stroke={color} strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

// ⭐ RATING - Stella
export function RatingIcon({ size = 24, color = "currentColor", className = "" }: StepIconProps) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      className={className}
    >
      <path 
        d="M12 2L14.9 8.6L22 9.3L17 14.1L18.2 21.1L12 17.8L5.8 21.1L7 14.1L2 9.3L9.1 8.6L12 2Z" 
        fill={color} 
        opacity="0.2"
      />
      <path 
        d="M12 2L14.9 8.6L22 9.3L17 14.1L18.2 21.1L12 17.8L5.8 21.1L7 14.1L2 9.3L9.1 8.6L12 2Z" 
        stroke={color} 
        strokeWidth="1.5" 
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// 🔧 ISSUES - Chiave inglese
export function IssuesIcon({ size = 24, color = "currentColor", className = "" }: StepIconProps) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      className={className}
    >
      {/* Wrench head */}
      <path 
        d="M6 4C3.8 4 2 5.8 2 8C2 9.5 2.8 10.8 4 11.5V20C4 21.1 4.9 22 6 22C7.1 22 8 21.1 8 20V11.5C9.2 10.8 10 9.5 10 8C10 5.8 8.2 4 6 4Z" 
        fill={color} 
        opacity="0.2"
      />
      <path 
        d="M6 4C3.8 4 2 5.8 2 8C2 9.5 2.8 10.8 4 11.5V20C4 21.1 4.9 22 6 22C7.1 22 8 21.1 8 20V11.5C9.2 10.8 10 9.5 10 8C10 5.8 8.2 4 6 4Z" 
        stroke={color} 
        strokeWidth="1.5"
        fill="none"
      />
      {/* Slot */}
      <line x1="4" y1="8" x2="8" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      
      {/* Screwdriver */}
      <rect x="14" y="2" width="4" height="6" rx="1" fill={color} opacity="0.2" />
      <rect x="14" y="2" width="4" height="6" rx="1" stroke={color} strokeWidth="1.5" fill="none" />
      <rect x="15" y="8" width="2" height="12" fill={color} />
      <path d="M15 20L16 22L17 20" fill={color} />
    </svg>
  );
}

// 📷 PHOTOS - Macchina fotografica
export function PhotosIcon({ size = 24, color = "currentColor", className = "" }: StepIconProps) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      className={className}
    >
      {/* Camera body */}
      <rect x="2" y="6" width="20" height="14" rx="3" fill={color} opacity="0.2" />
      <rect x="2" y="6" width="20" height="14" rx="3" stroke={color} strokeWidth="1.5" fill="none" />
      
      {/* Top bump */}
      <path d="M8 6V5C8 4.45 8.45 4 9 4H15C15.55 4 16 4.45 16 5V6" stroke={color} strokeWidth="1.5" />
      
      {/* Lens outer */}
      <circle cx="12" cy="13" r="4" stroke={color} strokeWidth="1.5" fill="none" />
      
      {/* Lens inner */}
      <circle cx="12" cy="13" r="2" fill={color} opacity="0.3" />
      
      {/* Flash */}
      <circle cx="18" cy="9" r="1" fill={color} />
    </svg>
  );
}

// ✅ COMPLETE - Cerchio con check
export function CompleteIcon({ size = 24, color = "currentColor", className = "" }: StepIconProps) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      className={className}
    >
      {/* Circle */}
      <circle cx="12" cy="12" r="10" fill={color} opacity="0.2" />
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" fill="none" />
      
      {/* Checkmark */}
      <path 
        d="M7 12L10.5 15.5L17 8.5" 
        stroke={color} 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP ICON COMPONENT - Restituisce l'icona corretta per ogni step
// ═══════════════════════════════════════════════════════════════════════════

export type StepType = "briefing" | "checklist" | "products" | "rating" | "issues" | "photos" | "complete";

interface WizardStepIconProps {
  step: StepType;
  size?: number;
  color?: string;
  className?: string;
}

export default function WizardStepIcon({ step, size = 24, color = "currentColor", className = "" }: WizardStepIconProps) {
  switch (step) {
    case "briefing":
      return <BriefingIcon size={size} color={color} className={className} />;
    case "checklist":
      return <ChecklistIcon size={size} color={color} className={className} />;
    case "products":
      return <ProductsIcon size={size} color={color} className={className} />;
    case "rating":
      return <RatingIcon size={size} color={color} className={className} />;
    case "issues":
      return <IssuesIcon size={size} color={color} className={className} />;
    case "photos":
      return <PhotosIcon size={size} color={color} className={className} />;
    case "complete":
      return <CompleteIcon size={size} color={color} className={className} />;
    default:
      return null;
  }
}
