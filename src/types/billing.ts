/**
 * Tipi e validazioni per Dati di Fatturazione
 * 
 * Gestisce sia persone fisiche che aziende con validazioni
 * secondo le specifiche italiane.
 */

// ==================== TIPI ====================

export type BillingType = "persona_fisica" | "azienda";

export interface BillingAddress {
  street: string;       // Via/Piazza + numero civico
  city: string;         // Città
  postalCode: string;   // CAP (5 cifre)
  province: string;     // Provincia (2 lettere)
  country: string;      // Paese (default: Italia)
}

export interface PersonaFisicaBilling {
  type: "persona_fisica";
  firstName: string;    // Nome intestatario
  lastName: string;     // Cognome intestatario
  fiscalCode: string;   // Codice Fiscale (16 caratteri)
  address: BillingAddress;
}

export interface AziendaBilling {
  type: "azienda";
  companyName: string;       // Ragione Sociale
  vatNumber: string;         // Partita IVA (11 cifre)
  sdiCode: string;           // Codice SDI (7 caratteri)
  pecEmail: string;          // Email PEC
  fiscalCode?: string;       // Codice Fiscale azienda (opzionale)
  address: BillingAddress;
}

export type BillingInfo = PersonaFisicaBilling | AziendaBilling;

// Form state (tutti i campi possibili)
export interface BillingFormData {
  type: BillingType;
  // Persona fisica
  firstName: string;
  lastName: string;
  fiscalCode: string;
  // Azienda
  companyName: string;
  vatNumber: string;
  sdiCode: string;
  pecEmail: string;
  companyFiscalCode: string;
  // Indirizzo
  street: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
}

// Errori di validazione
export interface BillingValidationErrors {
  firstName?: string;
  lastName?: string;
  fiscalCode?: string;
  companyName?: string;
  vatNumber?: string;
  sdiCode?: string;
  pecEmail?: string;
  companyFiscalCode?: string;
  street?: string;
  city?: string;
  postalCode?: string;
  province?: string;
  country?: string;
}

// ==================== VALIDAZIONI ====================

/**
 * Valida il Codice Fiscale italiano (16 caratteri alfanumerici)
 * Formato: RSSMRA80A01H501U
 */
export function isValidFiscalCode(code: string): boolean {
  if (!code || code.length !== 16) return false;
  
  const pattern = /^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/i;
  return pattern.test(code);
}

/**
 * Valida la Partita IVA italiana (11 cifre)
 * Include controllo checksum
 */
export function isValidVatNumber(vat: string): boolean {
  if (!vat || vat.length !== 11) return false;
  if (!/^\d{11}$/.test(vat)) return false;
  
  // Algoritmo di controllo Partita IVA italiana
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(vat[i], 10);
    if (i % 2 === 0) {
      sum += digit;
    } else {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
  }
  
  return sum % 10 === 0;
}

/**
 * Valida il Codice SDI (7 caratteri alfanumerici)
 * Codice identificativo per fatturazione elettronica
 */
export function isValidSdiCode(code: string): boolean {
  if (!code || code.length !== 7) return false;
  
  const pattern = /^[A-Z0-9]{7}$/i;
  return pattern.test(code);
}

/**
 * Valida email PEC
 */
export function isValidPecEmail(email: string): boolean {
  if (!email) return false;
  
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

/**
 * Valida CAP italiano (5 cifre)
 */
export function isValidPostalCode(cap: string): boolean {
  if (!cap || cap.length !== 5) return false;
  return /^\d{5}$/.test(cap);
}

/**
 * Valida sigla provincia italiana (2 lettere)
 */
export function isValidProvince(prov: string): boolean {
  if (!prov || prov.length !== 2) return false;
  return /^[A-Z]{2}$/i.test(prov);
}

/**
 * Formatta il Codice Fiscale (uppercase, rimuove spazi)
 */
export function formatFiscalCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Formatta la Partita IVA (solo numeri)
 */
export function formatVatNumber(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Formatta il Codice SDI (uppercase, alfanumerico)
 */
export function formatSdiCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Formatta il CAP (solo numeri)
 */
export function formatPostalCode(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Formatta la sigla provincia (uppercase, solo lettere)
 */
export function formatProvince(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/gi, "");
}

// ==================== VERIFICA CF vs NOME/COGNOME ====================

/**
 * Estrae le 3 lettere dal COGNOME secondo l'algoritmo del CF italiano.
 * Regole:
 * 1. Prende le consonanti del cognome (rimuovendo spazi)
 * 2. Se non bastano, aggiunge le vocali
 * 3. Se ancora non bastano, aggiunge X
 */
function extractCognomeCode(cognome: string): string {
  const clean = cognome.toUpperCase().replace(/[^A-Z]/g, "");
  const consonants = clean.replace(/[AEIOU]/g, "");
  const vowels = clean.replace(/[^AEIOU]/g, "");
  const pool = consonants + vowels;
  return (pool + "XXX").substring(0, 3);
}

/**
 * Estrae le 3 lettere dal NOME secondo l'algoritmo del CF italiano.
 * Regole:
 * 1. Prende le consonanti del nome
 * 2. Se ci sono 4+ consonanti, prende la 1a, 3a e 4a
 * 3. Se ci sono esattamente 3 consonanti, le prende tutte
 * 4. Se non bastano, aggiunge le vocali
 * 5. Se ancora non bastano, aggiunge X
 */
function extractNomeCode(nome: string): string {
  const clean = nome.toUpperCase().replace(/[^A-Z]/g, "");
  const consonants = clean.replace(/[AEIOU]/g, "");
  const vowels = clean.replace(/[^AEIOU]/g, "");
  
  if (consonants.length >= 4) {
    // 4+ consonanti: prendi 1a, 3a, 4a
    return consonants[0] + consonants[2] + consonants[3];
  }
  
  // 3 o meno consonanti: consonanti + vocali
  const pool = consonants + vowels;
  return (pool + "XXX").substring(0, 3);
}

/**
 * Verifica se il Codice Fiscale corrisponde a nome e cognome.
 * Confronta le prime 6 lettere del CF con quelle calcolate da cognome e nome.
 * 
 * @param firstName - Nome della persona
 * @param lastName - Cognome della persona
 * @param fiscalCode - Codice Fiscale da verificare
 * @returns true se corrispondono, false se non corrispondono
 */
export function validateFiscalCodeMatch(firstName: string, lastName: string, fiscalCode: string): boolean {
  if (!firstName || !lastName || !fiscalCode || fiscalCode.length !== 16) {
    return false;
  }
  
  const cfUpper = fiscalCode.toUpperCase();
  const expectedCognome = extractCognomeCode(lastName);
  const expectedNome = extractNomeCode(firstName);
  const expected = expectedCognome + expectedNome;
  const actual = cfUpper.substring(0, 6);
  
  return expected === actual;
}

/**
 * Versione con fullName (nome e cognome in un campo unico).
 * Con nomi di 3+ parole prova tutte le combinazioni possibili di split
 * tra nome e cognome, dato che non sappiamo dove finisce il nome
 * e dove inizia il cognome.
 */
export function validateFiscalCodeMatchFullName(fullName: string, fiscalCode: string): boolean {
  if (!fullName || !fiscalCode || fiscalCode.length !== 16) {
    return false;
  }
  
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return false;
  
  // Prova tutti i possibili split: le prime N parole sono il nome, le restanti il cognome
  // E viceversa: le prime N parole sono il cognome, le restanti il nome
  for (let i = 1; i < parts.length; i++) {
    const groupA = parts.slice(0, i).join(" ");
    const groupB = parts.slice(i).join(" ");
    
    // groupA = nome, groupB = cognome
    if (validateFiscalCodeMatch(groupA, groupB, fiscalCode)) return true;
    // groupA = cognome, groupB = nome
    if (validateFiscalCodeMatch(groupB, groupA, fiscalCode)) return true;
  }
  
  return false;
}

// ==================== VALIDAZIONE COMPLETA ====================

/**
 * Valida tutti i campi del form e ritorna gli errori
 */
export function validateBillingForm(data: BillingFormData): BillingValidationErrors {
  const errors: BillingValidationErrors = {};

  // Validazioni per Persona Fisica
  if (data.type === "persona_fisica") {
    if (!data.firstName || data.firstName.trim().length < 2) {
      errors.firstName = "Nome obbligatorio (minimo 2 caratteri)";
    }

    if (!data.lastName || data.lastName.trim().length < 2) {
      errors.lastName = "Cognome obbligatorio (minimo 2 caratteri)";
    }

    if (!data.fiscalCode) {
      errors.fiscalCode = "Codice Fiscale obbligatorio";
    } else if (!isValidFiscalCode(data.fiscalCode)) {
      errors.fiscalCode = "Codice Fiscale non valido (16 caratteri)";
    } else if (
      data.firstName && data.firstName.trim().length >= 2 &&
      data.lastName && data.lastName.trim().length >= 2 &&
      !validateFiscalCodeMatch(data.firstName.trim(), data.lastName.trim(), data.fiscalCode)
    ) {
      errors.fiscalCode = "Il Codice Fiscale non corrisponde al nome e cognome inseriti";
    }
  }

  // Validazioni per Azienda
  if (data.type === "azienda") {
    if (!data.companyName || data.companyName.trim().length < 2) {
      errors.companyName = "Ragione Sociale obbligatoria";
    }

    if (!data.vatNumber) {
      errors.vatNumber = "Partita IVA obbligatoria";
    } else if (!isValidVatNumber(data.vatNumber)) {
      errors.vatNumber = "Partita IVA non valida (11 cifre)";
    }

    if (!data.sdiCode) {
      errors.sdiCode = "Codice SDI obbligatorio";
    } else if (!isValidSdiCode(data.sdiCode)) {
      errors.sdiCode = "Codice SDI non valido (7 caratteri)";
    }

    if (!data.pecEmail) {
      errors.pecEmail = "Email PEC obbligatoria";
    } else if (!isValidPecEmail(data.pecEmail)) {
      errors.pecEmail = "Email PEC non valida";
    }

    if (data.companyFiscalCode && !isValidFiscalCode(data.companyFiscalCode)) {
      errors.companyFiscalCode = "Codice Fiscale non valido";
    }
  }

  // Validazioni indirizzo (sempre obbligatorio)
  if (!data.street || data.street.trim().length < 3) {
    errors.street = "Indirizzo obbligatorio";
  }

  if (!data.city || data.city.trim().length < 2) {
    errors.city = "Città obbligatoria";
  }

  if (!data.postalCode) {
    errors.postalCode = "CAP obbligatorio";
  } else if (!isValidPostalCode(data.postalCode)) {
    errors.postalCode = "CAP non valido (5 cifre)";
  }

  if (!data.province) {
    errors.province = "Provincia obbligatoria";
  } else if (!isValidProvince(data.province)) {
    errors.province = "Sigla provincia non valida (2 lettere)";
  }

  if (!data.country || data.country.trim().length < 2) {
    errors.country = "Paese obbligatorio";
  }

  return errors;
}

/**
 * Verifica se il form è valido (nessun errore)
 */
export function isBillingFormValid(data: BillingFormData): boolean {
  const errors = validateBillingForm(data);
  return Object.keys(errors).length === 0;
}

/**
 * Converte i dati del form nel formato BillingInfo
 */
export function formDataToBillingInfo(data: BillingFormData): BillingInfo {
  const address: BillingAddress = {
    street: data.street.trim(),
    city: data.city.trim(),
    postalCode: data.postalCode,
    province: data.province.toUpperCase(),
    country: data.country.trim(),
  };

  if (data.type === "persona_fisica") {
    return {
      type: "persona_fisica",
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      fiscalCode: data.fiscalCode.toUpperCase(),
      address,
    };
  }

  return {
    type: "azienda",
    companyName: data.companyName.trim(),
    vatNumber: data.vatNumber || "",
    sdiCode: (data.sdiCode || "").toUpperCase(),
    pecEmail: (data.pecEmail || "").toLowerCase(),
    fiscalCode: data.companyFiscalCode ? data.companyFiscalCode.toUpperCase() : "",
    address,
  };
}

/**
 * Crea dati form vuoti con valori di default
 */
export function createEmptyBillingFormData(): BillingFormData {
  return {
    type: "persona_fisica",
    firstName: "",
    lastName: "",
    fiscalCode: "",
    companyName: "",
    vatNumber: "",
    sdiCode: "",
    pecEmail: "",
    companyFiscalCode: "",
    street: "",
    city: "",
    postalCode: "",
    province: "",
    country: "Italia",
  };
}

/**
 * Popola i dati form da un BillingInfo esistente
 */
export function billingInfoToFormData(info: BillingInfo): BillingFormData {
  const base = createEmptyBillingFormData();
  
  base.type = info.type;
  base.street = info.address.street;
  base.city = info.address.city;
  base.postalCode = info.address.postalCode;
  base.province = info.address.province;
  base.country = info.address.country;

  if (info.type === "persona_fisica") {
    base.firstName = (info as PersonaFisicaBilling).firstName || "";
    base.lastName = (info as PersonaFisicaBilling).lastName || "";
    base.fiscalCode = info.fiscalCode;
  } else {
    base.companyName = info.companyName;
    base.vatNumber = info.vatNumber;
    base.sdiCode = info.sdiCode;
    base.pecEmail = info.pecEmail;
    base.companyFiscalCode = info.fiscalCode || "";
  }

  return base;
}

// ==================== LISTA PROVINCE ITALIANE ====================

export const PROVINCE_ITALIANE = [
  { code: "AG", name: "Agrigento" },
  { code: "AL", name: "Alessandria" },
  { code: "AN", name: "Ancona" },
  { code: "AO", name: "Aosta" },
  { code: "AR", name: "Arezzo" },
  { code: "AP", name: "Ascoli Piceno" },
  { code: "AT", name: "Asti" },
  { code: "AV", name: "Avellino" },
  { code: "BA", name: "Bari" },
  { code: "BT", name: "Barletta-Andria-Trani" },
  { code: "BL", name: "Belluno" },
  { code: "BN", name: "Benevento" },
  { code: "BG", name: "Bergamo" },
  { code: "BI", name: "Biella" },
  { code: "BO", name: "Bologna" },
  { code: "BZ", name: "Bolzano" },
  { code: "BS", name: "Brescia" },
  { code: "BR", name: "Brindisi" },
  { code: "CA", name: "Cagliari" },
  { code: "CL", name: "Caltanissetta" },
  { code: "CB", name: "Campobasso" },
  { code: "CE", name: "Caserta" },
  { code: "CT", name: "Catania" },
  { code: "CZ", name: "Catanzaro" },
  { code: "CH", name: "Chieti" },
  { code: "CO", name: "Como" },
  { code: "CS", name: "Cosenza" },
  { code: "CR", name: "Cremona" },
  { code: "KR", name: "Crotone" },
  { code: "CN", name: "Cuneo" },
  { code: "EN", name: "Enna" },
  { code: "FM", name: "Fermo" },
  { code: "FE", name: "Ferrara" },
  { code: "FI", name: "Firenze" },
  { code: "FG", name: "Foggia" },
  { code: "FC", name: "Forlì-Cesena" },
  { code: "FR", name: "Frosinone" },
  { code: "GE", name: "Genova" },
  { code: "GO", name: "Gorizia" },
  { code: "GR", name: "Grosseto" },
  { code: "IM", name: "Imperia" },
  { code: "IS", name: "Isernia" },
  { code: "SP", name: "La Spezia" },
  { code: "AQ", name: "L'Aquila" },
  { code: "LT", name: "Latina" },
  { code: "LE", name: "Lecce" },
  { code: "LC", name: "Lecco" },
  { code: "LI", name: "Livorno" },
  { code: "LO", name: "Lodi" },
  { code: "LU", name: "Lucca" },
  { code: "MC", name: "Macerata" },
  { code: "MN", name: "Mantova" },
  { code: "MS", name: "Massa-Carrara" },
  { code: "MT", name: "Matera" },
  { code: "ME", name: "Messina" },
  { code: "MI", name: "Milano" },
  { code: "MO", name: "Modena" },
  { code: "MB", name: "Monza e Brianza" },
  { code: "NA", name: "Napoli" },
  { code: "NO", name: "Novara" },
  { code: "NU", name: "Nuoro" },
  { code: "OR", name: "Oristano" },
  { code: "PD", name: "Padova" },
  { code: "PA", name: "Palermo" },
  { code: "PR", name: "Parma" },
  { code: "PV", name: "Pavia" },
  { code: "PG", name: "Perugia" },
  { code: "PU", name: "Pesaro e Urbino" },
  { code: "PE", name: "Pescara" },
  { code: "PC", name: "Piacenza" },
  { code: "PI", name: "Pisa" },
  { code: "PT", name: "Pistoia" },
  { code: "PN", name: "Pordenone" },
  { code: "PZ", name: "Potenza" },
  { code: "PO", name: "Prato" },
  { code: "RG", name: "Ragusa" },
  { code: "RA", name: "Ravenna" },
  { code: "RC", name: "Reggio Calabria" },
  { code: "RE", name: "Reggio Emilia" },
  { code: "RI", name: "Rieti" },
  { code: "RN", name: "Rimini" },
  { code: "RM", name: "Roma" },
  { code: "RO", name: "Rovigo" },
  { code: "SA", name: "Salerno" },
  { code: "SS", name: "Sassari" },
  { code: "SV", name: "Savona" },
  { code: "SI", name: "Siena" },
  { code: "SR", name: "Siracusa" },
  { code: "SO", name: "Sondrio" },
  { code: "SU", name: "Sud Sardegna" },
  { code: "TA", name: "Taranto" },
  { code: "TE", name: "Teramo" },
  { code: "TR", name: "Terni" },
  { code: "TO", name: "Torino" },
  { code: "TP", name: "Trapani" },
  { code: "TN", name: "Trento" },
  { code: "TV", name: "Treviso" },
  { code: "TS", name: "Trieste" },
  { code: "UD", name: "Udine" },
  { code: "VA", name: "Varese" },
  { code: "VE", name: "Venezia" },
  { code: "VB", name: "Verbano-Cusio-Ossola" },
  { code: "VC", name: "Vercelli" },
  { code: "VR", name: "Verona" },
  { code: "VV", name: "Vibo Valentia" },
  { code: "VI", name: "Vicenza" },
  { code: "VT", name: "Viterbo" },
];
