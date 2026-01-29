/**
 * LINEN CALCULATOR - FILE CENTRALIZZATO
 * UNICA FONTE DI VERITÀ per il calcolo della biancheria
 */

export interface PropertyBed {
  id: string;
  tipo: string;
  nome: string;
  stanza: string;
  capacita: number;
}

export interface GuestLinenConfig {
  selectedBeds: string[];
  bedLinen: Record<string, Record<string, number>>;
  bathItems: Record<string, number>;
  kitItems: Record<string, number>;
  extras: Record<string, boolean>;
}

export interface LinenRequirement {
  lenzuolaMatrimoniali: number;
  lenzuolaSingole: number;
  federe: number;
}

export interface BathRequirement {
  asciugamaniGrandi: number;
  asciugamaniViso: number;
  asciugamaniPiccoli: number;
  tappetini: number;
}

// TIPI LETTO
export const TIPI_LETTO = [
  { tipo: 'matrimoniale' as const, nome: 'Matrimoniale', capacita: 2, icon: '🛏️', dbType: 'matr' },
  { tipo: 'singolo' as const, nome: 'Singolo', capacita: 1, icon: '🛏️', dbType: 'sing' },
  { tipo: 'piazza_mezza' as const, nome: 'Piazza e Mezza', capacita: 1, icon: '🛏️', dbType: 'sing' },
  { tipo: 'divano_letto' as const, nome: 'Divano Letto', capacita: 2, icon: '🛋️', dbType: 'divano' },
  { tipo: 'castello' as const, nome: 'Letto a Castello', capacita: 2, icon: '🛏️', dbType: 'castello' },
] as const;

export type TipoLetto = typeof TIPI_LETTO[number]['tipo'];

export function getTipoLettoInfo(tipo: string) {
  return TIPI_LETTO.find(t => t.tipo === tipo || t.dbType === tipo) || TIPI_LETTO[1];
}

export function getDbTypeForBed(tipo: string): string {
  const info = getTipoLettoInfo(tipo);
  return info.dbType;
}

// CALCOLO BIANCHERIA LETTO
export function getLinenForBedType(bedType: string): LinenRequirement {
  const tipo = bedType.toLowerCase();
  if (tipo.includes('matr') || tipo === 'matrimoniale' || tipo === 'divano' || tipo === 'divano_letto') {
    return { lenzuolaMatrimoniali: 3, lenzuolaSingole: 0, federe: 2 };
  }
  if (tipo === 'castello') {
    return { lenzuolaMatrimoniali: 0, lenzuolaSingole: 6, federe: 2 };
  }
  return { lenzuolaMatrimoniali: 0, lenzuolaSingole: 3, federe: 1 };
}

// CALCOLO BIANCHERIA BAGNO
export function calculateBathLinen(guestsCount: number, bathroomsCount: number): BathRequirement {
  return {
    asciugamaniGrandi: guestsCount,
    asciugamaniViso: guestsCount,
    asciugamaniPiccoli: guestsCount,
    tappetini: bathroomsCount
  };
}

// KEYWORD MATCHING
const ITEM_KEYWORDS = {
  lenzuolaMatrimoniali: ['doublesheets', 'double', 'matrimoniali', 'matrimoniale'],
  lenzuolaSingole: ['singlesheets', 'single', 'singole', 'singolo'],
  federe: ['pillowcases', 'pillowcase', 'federe', 'federa'],
  asciugamaniGrandi: ['towelslarge', 'large', 'grandi', 'grande', 'corpo', 'doccia'],
  asciugamaniViso: ['towelsface', 'face', 'viso'],
  asciugamaniPiccoli: ['towelssmall', 'small', 'piccoli', 'piccolo', 'bidet'],
  tappetini: ['bathmats', 'mats', 'tappetini', 'tappetino', 'scendi'],
};

function findItemByKeywords<T extends { id: string; nome?: string; name?: string; key?: string }>(
  items: T[], keywordType: keyof typeof ITEM_KEYWORDS
): T | undefined {
  const keywords = ITEM_KEYWORDS[keywordType];
  return items.find(item => {
    const name = (item.nome || item.name || '').toLowerCase();
    const id = item.id.toLowerCase();
    const key = (item.key || '').toLowerCase();
    return keywords.some(kw => name.includes(kw) || id.includes(kw) || key.includes(kw));
  });
}

// MAPPING BIANCHERIA LETTO
export function mapLinenToInventory<T extends { id: string; nome?: string; name?: string; key?: string }>(
  linenReq: LinenRequirement, inventoryItems: T[]
): Record<string, number> {
  const result: Record<string, number> = {};
  if (linenReq.lenzuolaMatrimoniali > 0) {
    const item = findItemByKeywords(inventoryItems, 'lenzuolaMatrimoniali');
    if (item) result[item.id] = linenReq.lenzuolaMatrimoniali;
  }
  if (linenReq.lenzuolaSingole > 0) {
    const item = findItemByKeywords(inventoryItems, 'lenzuolaSingole');
    if (item) result[item.id] = linenReq.lenzuolaSingole;
  }
  if (linenReq.federe > 0) {
    const item = findItemByKeywords(inventoryItems, 'federe');
    if (item) result[item.id] = linenReq.federe;
  }
  return result;
}

// MAPPING BIANCHERIA BAGNO
export function mapBathToInventory<T extends { id: string; nome?: string; name?: string; key?: string }>(
  bathReq: BathRequirement, inventoryItems: T[]
): Record<string, number> {
  const result: Record<string, number> = {};
  if (bathReq.asciugamaniGrandi > 0) {
    const item = findItemByKeywords(inventoryItems, 'asciugamaniGrandi');
    if (item) result[item.id] = bathReq.asciugamaniGrandi;
  }
  if (bathReq.asciugamaniViso > 0) {
    const item = findItemByKeywords(inventoryItems, 'asciugamaniViso');
    if (item) result[item.id] = bathReq.asciugamaniViso;
  }
  if (bathReq.asciugamaniPiccoli > 0) {
    const item = findItemByKeywords(inventoryItems, 'asciugamaniPiccoli');
    if (item) result[item.id] = bathReq.asciugamaniPiccoli;
  }
  if (bathReq.tappetini > 0) {
    const item = findItemByKeywords(inventoryItems, 'tappetini');
    if (item) result[item.id] = bathReq.tappetini;
  }
  return result;
}

// GENERAZIONE CONFIG DEFAULT
export function generateDefaultConfigForGuests<T extends { id: string; nome?: string; name?: string; key?: string }>(
  guestCount: number, allBeds: PropertyBed[], bathroomsCount: number,
  inventoryLinen: T[], inventoryBath: T[]
): { selectedBeds: string[]; bedLinen: Record<string, Record<string, number>>; bathItems: Record<string, number> } {
  const selectedBeds: string[] = [];
  let remainingGuests = guestCount;
  for (const bed of allBeds) {
    if (remainingGuests <= 0) break;
    selectedBeds.push(bed.id);
    remainingGuests -= bed.capacita;
  }
  const bedLinen: Record<string, Record<string, number>> = {};
  for (const bedId of selectedBeds) {
    const bed = allBeds.find(b => b.id === bedId);
    if (!bed) continue;
    const linenReq = getLinenForBedType(bed.tipo);
    bedLinen[bedId] = mapLinenToInventory(linenReq, inventoryLinen);
  }
  const bathReq = calculateBathLinen(guestCount, bathroomsCount);
  const bathItems = mapBathToInventory(bathReq, inventoryBath);
  return { selectedBeds, bedLinen, bathItems };
}

// GENERAZIONE TUTTE LE CONFIG
export function generateAllGuestConfigs<T extends { id: string; nome?: string; name?: string; key?: string }>(
  maxGuests: number, allBeds: PropertyBed[], bathroomsCount: number,
  inventoryLinen: T[], inventoryBath: T[], inventoryExtras: { id: string }[] = []
): Record<number, GuestLinenConfig> {
  const configs: Record<number, GuestLinenConfig> = {};
  for (let guests = 1; guests <= maxGuests; guests++) {
    const { selectedBeds, bedLinen, bathItems } = generateDefaultConfigForGuests(
      guests, allBeds, bathroomsCount, inventoryLinen, inventoryBath
    );
    configs[guests] = {
      selectedBeds, bedLinen, bathItems,
      kitItems: {},
      extras: Object.fromEntries(inventoryExtras.map(e => [e.id, false]))
    };
  }
  return configs;
}

// CONVERSIONE PER DATABASE
export function convertConfigsForDatabase(configs: Record<number, GuestLinenConfig>): Record<number, any> {
  const result: Record<number, any> = {};
  for (const [gc, cfg] of Object.entries(configs)) {
    result[parseInt(gc)] = { beds: cfg.selectedBeds, bl: cfg.bedLinen, ba: cfg.bathItems, ki: cfg.kitItems, ex: cfg.extras };
  }
  return result;
}
