/**
 * Contract Precompiler v6 - Placeholder semplici [AUTO_*]
 */

const COMPANY = {
  name: "Puliziacasevacanze.it S.r.l.s.",
  vatNumber: "17817311008",
  pec: "puliziacasevacanze@pec.it",
};

export interface UserData {
  id: string; name?: string; email?: string; phone?: string; role?: string;
  billingInfo?: {
    type?: "persona_fisica" | "azienda"; fiscalCode?: string; companyName?: string;
    vatNumber?: string; sdiCode?: string; pecEmail?: string; companyFiscalCode?: string;
    firstName?: string; lastName?: string;
    address?: { street?: string; city?: string; postalCode?: string; province?: string; country?: string; };
  };
}

export interface PropertyData {
  id?: string; name?: string; address?: string; city?: string; postalCode?: string;
  maxGuests?: number; bedrooms?: number; bathrooms?: number; cleaningPrice?: number;
  floor?: string; apartment?: string; intercom?: string; doorCode?: string;
  bedsConfig?: any[]; linenConfig?: any[]; usesOwnLinen?: boolean;
  ownerName?: string; ownerEmail?: string; createdAt?: string; approvedAt?: string;
}

function formatBeds(cfg?: any[]): string {
  if (!cfg || !Array.isArray(cfg) || cfg.length === 0) return "\u2014";
  const n: Record<string, string> = { matr: "Matrimoniale", sing: "Singolo", divano: "Divano letto", castello: "Castello" };
  const parts = cfg.filter(function(b: any) { return b && b.type; }).map(function(b: any) {
    return (n[b.type] || b.type) + (b.location ? " (" + b.location + ")" : "");
  });
  return parts.length > 0 ? parts.join(", ") : "\u2014";
}

/**
 * Ricava il nome completo dal billingInfo.
 * Per persona_fisica: usa firstName + lastName se disponibili, altrimenti fallback su user.name
 * Per azienda: usa companyName, altrimenti fallback su user.name
 */
function getHostName(b: UserData["billingInfo"], userName?: string): string {
  if (b?.type === "azienda") {
    return b.companyName || userName || "\u2014";
  }
  // persona_fisica o undefined
  if (b?.firstName && b?.lastName) {
    return (b.firstName + " " + b.lastName).trim();
  }
  return userName || "\u2014";
}

export function precompileOnboardingContract(html: string, user: UserData): string {
  let r = html;
  const b = user.billingInfo;
  const hostName = getHostName(b, user.name);
  const hostCF = b?.type === "azienda" ? (b.vatNumber || b.companyFiscalCode || "\u2014") : (b?.fiscalCode || "\u2014");
  const hostAddr = b?.address ? [b.address.street, b.address.postalCode, b.address.city, b.address.province ? "(" + b.address.province + ")" : ""].filter(Boolean).join(", ") : "\u2014";
  const hostPec = b?.type === "azienda" ? (b.pecEmail || "\u2014") : "\u2014";

  r = r.replace(/Nome \/ Ragione Sociale: \[AUTO – Gestionale\]/g, "Nome / Ragione Sociale: " + hostName);
  r = r.replace(/C\.F\. \/ P\.IVA: \[AUTO – Gestionale\]/g, "C.F. / P.IVA: " + hostCF);
  r = r.replace(/Indirizzo: \[AUTO – Gestionale\]/g, "Indirizzo: " + hostAddr);
  r = r.replace(/Email: \[AUTO – Gestionale\]/g, "Email: " + (user.email || "\u2014"));
  r = r.replace(/PEC: \[AUTO – Gestionale\]/g, "PEC: " + hostPec);
  r = r.replace(/Tel\.: \[AUTO – Gestionale\]/g, "Tel.: " + (user.phone || "\u2014"));
  r = r.replace(/P\.IVA \/ C\.F\.: \[AUTO – Gestionale\]/g, "P.IVA / C.F.: " + COMPANY.vatNumber);
  const ts = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
  r = r.replace(/\[FIRMA DIGITALE AUTO – Gestionale\]/g, "\u2713 Firma digitale \u2013 " + COMPANY.name);
  r = r.replace(/\[timestamp: AUTO \| IP: AUTO\]/g, "Timestamp: " + ts);
  r = r.replace(/\[FIRMA DIGITALE HOST – Gestionale\]/g, '<span style="color:#999;font-style:italic">[La tua firma]</span>');
  r = r.replace(/\[AUTO – Gestionale\]/g, "\u2014");
  r = r.replace(/\[AUTO\]/g, "\u2014");
  return r;
}

export function precompileAllegatoD(html: string, user: UserData, property: PropertyData): string {
  let r = html;
  const b = user.billingInfo;
  const now = new Date();
  const ts = now.toLocaleString("it-IT", { timeZone: "Europe/Rome" });
  const dateStr = now.toLocaleDateString("it-IT");

  const hostName = getHostName(b, user.name);
  const hostCF = b?.type === "azienda" ? (b.vatNumber || b.companyFiscalCode || "\u2014") : (b?.fiscalCode || "\u2014");
  const hostAddr = b?.address ? [b.address.street, b.address.postalCode, b.address.city, b.address.province ? "(" + b.address.province + ")" : ""].filter(Boolean).join(", ") : "\u2014";
  const hostPec = b?.type === "azienda" ? (b.pecEmail || "\u2014") : "\u2014";
  const hostSdi = b?.type === "azienda" ? (b.sdiCode || "\u2014") : "\u2014";

  const priceStr = "\u20AC " + (property.cleaningPrice || 0).toFixed(2).replace(".", ",");

  r = r.replace(/\[AUTO_PROP_NAME\]/g, property.name || "\u2014");
  r = r.replace(/\[AUTO_PROP_ADDRESS\]/g, property.address || "\u2014");
  r = r.replace(/\[AUTO_PROP_CITY_CAP\]/g, [property.city, property.postalCode].filter(Boolean).join(" / ") || "\u2014");
  r = r.replace(/\[AUTO_PROP_FLOOR\]/g, [property.floor, property.apartment].filter(Boolean).join(" / ") || "\u2014");
  r = r.replace(/\[AUTO_PROP_INTERCOM\]/g, property.intercom || "\u2014");
  r = r.replace(/\[AUTO_PROP_ID\]/g, property.id || "\u2014");
  r = r.replace(/\[AUTO_PROP_CREATED\]/g, property.createdAt || dateStr);
  r = r.replace(/\[AUTO_PROP_APPROVED\]/g, property.approvedAt || dateStr);

  r = r.replace(/\[AUTO_HOST_NAME\]/g, hostName);
  r = r.replace(/\[AUTO_HOST_CF\]/g, hostCF);
  r = r.replace(/\[AUTO_HOST_ADDRESS\]/g, hostAddr);
  r = r.replace(/\[AUTO_HOST_EMAIL\]/g, user.email || "\u2014");
  r = r.replace(/\[AUTO_HOST_PEC\]/g, hostPec);
  r = r.replace(/\[AUTO_HOST_PHONE\]/g, user.phone || "\u2014");
  r = r.replace(/\[AUTO_HOST_SDI\]/g, hostSdi);

  r = r.replace(/\[AUTO_PROP_GUESTS\]/g, String(property.maxGuests || "\u2014"));
  r = r.replace(/\[AUTO_PROP_BEDROOMS\]/g, String(property.bedrooms || "\u2014"));
  r = r.replace(/\[AUTO_PROP_BATHROOMS\]/g, String(property.bathrooms || "\u2014"));
  r = r.replace(/\[AUTO_PROP_BEDS\]/g, formatBeds(property.bedsConfig));

  r = r.replace(/\[AUTO_PRICE\]/g, priceStr);
  r = r.replace(/\[AUTO_DATE\]/g, dateStr);
  r = r.replace(/\[AUTO_SIG_COMPANY\]/g, "\u2713 Firma digitale apposta");
  r = r.replace(/\[AUTO_SIG_HOST\]/g, "[Firma tramite Gestionale]");
  r = r.replace(/\[AUTO_SIG_TIMESTAMP\]/g, ts);

  return r;
}
