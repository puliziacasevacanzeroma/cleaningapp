// ═══════════════════════════════════════════════════════════════
// TYPES INDEX - Esportazione centralizzata tipi
// ═══════════════════════════════════════════════════════════════

// Cleaning types
export * from "./cleaning";

// Service types
export * from "./serviceType";

// Holiday types
export * from "./holiday";

// Photo upload types
export * from "./photo";

// Billing types
export * from "./billing";

// Contract types
// @ts-expect-error TODO-FIX: TS2308 Module "./billing" has already exported a member named 'formatFiscalCode'. Consi...
export * from "./contract";

// Notification types
export * from "./notification";

// Deletion request types
export * from "./deletionRequest";
