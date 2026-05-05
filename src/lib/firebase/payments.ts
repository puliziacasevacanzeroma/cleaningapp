import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "./config";

// ==================== TYPES ====================

export type PaymentMethod = "BONIFICO" | "CONTANTI" | "ALTRO";
export type PaymentType = "ACCONTO" | "SALDO";
export type ServiceType = "PULIZIA" | "BIANCHERIA" | "KIT_CORTESIA" | "SERVIZI_EXTRA";

export interface Payment {
  id: string;
  proprietarioId: string;
  proprietarioName: string;
  month: number;
  year: number;
  amount: number;
  type: PaymentType;
  method: PaymentMethod;
  note?: string;
  createdAt: Timestamp;
  createdBy: string;
  /** Pagamento auto-generato dal sistema come credito da eliminazione/esclusione servizi */
  isCreditTransfer?: boolean;
}

export interface PaymentOverride {
  id: string;
  proprietarioId: string;
  month: number;
  year: number;
  originalTotal: number;
  overrideTotal: number;
  reason: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
}

// Dettaglio singolo item in un ordine
export interface OrderItemDetail {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  categoryName: string;
}

export interface ServiceDetail {
  id: string;
  type: ServiceType;
  date: Date;
  propertyId: string;
  propertyName: string;
  description: string;
  originalPrice: number;
  effectivePrice: number;
  hasOverride: boolean;
  overrideReason?: string;
  // Dettaglio items per ordini (biancheria, kit, extra)
  items?: OrderItemDetail[];
  // Collegamento pulizia-biancheria
  cleaningId?: string;      // Per ordini: ID della pulizia collegata
  laundryOrderId?: string;  // Per pulizie: ID dell'ordine biancheria collegato
  // Flag esclusione dal billing
  excludedFromBilling?: boolean;
  excludedFromBillingReason?: string;
}

export interface ClientPaymentStats {
  proprietarioId: string;
  proprietarioName: string;
  proprietarioEmail?: string;
  propertyCount: number;
  
  cleaningsCount: number;
  cleaningsTotal: number;
  ordersCount: number;
  ordersTotal: number;
  kitCortesiaCount: number;
  kitCortesiaTotal: number;
  serviziExtraCount: number;
  serviziExtraTotal: number;
  
  totaleCalcolato: number;
  totaleEffettivo: number;
  hasOverride: boolean;
  overrideReason?: string;
  
  payments: Payment[];
  totalePagato: number;
  
  saldo: number;
  stato: "SALDATO" | "PARZIALE" | "DA_PAGARE";
  
  services: ServiceDetail[];
}

export interface PaymentsSummary {
  totaleServizi: number;
  totaleIncassato: number;
  totaleContanti: number;
  totaleBonifico: number;
  totaleAltro: number;
  saldoTotale: number;
  clientiConSaldo: number;
  clientiSaldati: number;
}

// ==================== PAYMENTS CRUD ====================

export async function createPayment(data: {
  proprietarioId: string;
  proprietarioName: string;
  month: number;
  year: number;
  amount: number;
  type: PaymentType;
  method: PaymentMethod;
  note?: string;
  createdBy: string;
}): Promise<string> {
  const docRef = await addDoc(collection(db, "payments"), {
    ...data,
    createdAt: Timestamp.now(),
  });
  
  return docRef.id;
}

export async function getPayments(
  proprietarioId: string,
  month: number,
  year: number
): Promise<Payment[]> {
  const q = query(
    collection(db, "payments"),
    where("proprietarioId", "==", proprietarioId),
    where("month", "==", month),
    where("year", "==", year)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })) as Payment[];
}

export async function getAllPaymentsForMonth(
  month: number,
  year: number
): Promise<Payment[]> {
  const q = query(
    collection(db, "payments"),
    where("month", "==", month),
    where("year", "==", year)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })) as Payment[];
}

export async function deletePayment(paymentId: string): Promise<void> {
  await deleteDoc(doc(db, "payments", paymentId));
}

// ==================== PAYMENT OVERRIDES ====================

export async function setPaymentOverride(data: {
  proprietarioId: string;
  month: number;
  year: number;
  originalTotal: number;
  overrideTotal: number;
  reason: string;
  createdBy: string;
}): Promise<string> {
  const existing = await getPaymentOverride(data.proprietarioId, data.month, data.year);
  
  if (existing) {
    await updateDoc(doc(db, "paymentOverrides", existing.id), {
      overrideTotal: data.overrideTotal,
      reason: data.reason,
      updatedAt: Timestamp.now(),
    });
    return existing.id;
  } else {
    const docRef = await addDoc(collection(db, "paymentOverrides"), {
      ...data,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    return docRef.id;
  }
}

export async function getPaymentOverride(
  proprietarioId: string,
  month: number,
  year: number
): Promise<PaymentOverride | null> {
  const q = query(
    collection(db, "paymentOverrides"),
    where("proprietarioId", "==", proprietarioId),
    where("month", "==", month),
    where("year", "==", year)
  );
  
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  
  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...(docSnap.data() as Record<string, any>) } as PaymentOverride;
}

export async function deletePaymentOverride(
  proprietarioId: string,
  month: number,
  year: number
): Promise<void> {
  const override = await getPaymentOverride(proprietarioId, month, year);
  if (override) {
    await deleteDoc(doc(db, "paymentOverrides", override.id));
  }
}

// ==================== PRICE UPDATES ====================

export async function updateCleaningPrice(
  cleaningId: string,
  newPrice: number,
  reason: string,
  updatedBy: string
): Promise<void> {
  await updateDoc(doc(db, "cleanings", cleaningId), {
    priceOverride: newPrice,
    priceOverrideReason: reason,
    priceOverrideAt: Timestamp.now(),
    priceOverrideBy: updatedBy,
    updatedAt: Timestamp.now(),
  });
}

export async function updateOrderPrice(
  orderId: string,
  newPrice: number,
  reason: string,
  updatedBy: string
): Promise<void> {
  await updateDoc(doc(db, "orders", orderId), {
    totalPriceOverride: newPrice,
    priceOverrideReason: reason,
    priceOverrideAt: Timestamp.now(),
    priceOverrideBy: updatedBy,
    updatedAt: Timestamp.now(),
  });
}

// Aggiorna singolo item in un ordine
export async function updateOrderItem(
  orderId: string,
  itemId: string,
  newQuantity: number,
  newUnitPrice: number,
  reason: string,
  updatedBy: string
): Promise<void> {
  // Carica l'ordine attuale
  const orderRef = doc(db, "orders", orderId);
  const orderSnapshot = await getDocs(query(collection(db, "orders"), where("__name__", "==", orderId)));
  
  if (orderSnapshot.empty) {
    throw new Error("Ordine non trovato");
  }
  
  const orderData = orderSnapshot.docs[0].data();
  const items = orderData.items || [];
  
  // Trova e aggiorna l'item
  const updatedItems = items.map((item: any) => {
    if (item.id === itemId) {
      return {
        ...item,
        quantity: newQuantity,
        priceOverride: newUnitPrice,
        priceOverrideReason: reason,
      };
    }
    return item;
  });
  
  // Salva
  await updateDoc(orderRef, {
    items: updatedItems,
    updatedAt: Timestamp.now(),
    lastModifiedBy: updatedBy,
  });
  
}

// ==================== PROPERTIES WITHOUT PRICE ====================

export async function getPropertiesWithoutPrice(): Promise<{ id: string; name: string; ownerName: string }[]> {
  // OTTIMIZZATO: Usa query filtrata per proprietà attive
  const q = query(
    collection(db, "properties"),
    where("status", "==", "ACTIVE")
  );
  const snapshot = await getDocs(q);
  
  const result: { id: string; name: string; ownerName: string }[] = [];
  
  snapshot.docs.forEach(doc => {
    const data = doc.data() as Record<string, any>;
    if (!data.cleaningPrice || data.cleaningPrice <= 0) {
      result.push({
        id: doc.id,
        name: data.name || "Senza nome",
        ownerName: data.ownerName || "Proprietario sconosciuto",
      });
    }
  });
  
  return result;
}

// ==================== INVENTORY HELPERS ====================

function mapCategoryToServiceType(categoryName: string): ServiceType {
  const lower = categoryName.toLowerCase();
  if (lower.includes("cortesia")) return "KIT_CORTESIA";
  if (lower.includes("extra") || lower.includes("servizi")) return "SERVIZI_EXTRA";
  return "BIANCHERIA";
}

// ==================== MAIN STATS CALCULATION (OTTIMIZZATO) ====================

export async function getClientPaymentStats(
  month: number,
  year: number
): Promise<ClientPaymentStats[]> {
  const startTime = Date.now();
  
  // Range date per il mese
  const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);
  
  
  // ========== ESEGUI TUTTE LE QUERY IN PARALLELO ==========
  const [
    inventorySnapshot,
    propertiesSnapshot,
    cleaningsSnapshot,
    ordersSnapshot,
    paymentsSnapshot,
    overridesSnapshot,
  ] = await Promise.all([
    // 1. Inventario
    getDocs(collection(db, "inventory")),
    
    // 2. Proprietà ACTIVE (query filtrata)
    getDocs(query(
      collection(db, "properties"),
      where("status", "==", "ACTIVE")
    )),
    
    // 3. Pulizie COMPLETED (query filtrata)
    getDocs(query(
      collection(db, "cleanings"),
      where("status", "==", "COMPLETED")
    )),
    
    // 4. Ordini DELIVERED (query filtrata)
    getDocs(query(
      collection(db, "orders"),
      where("status", "==", "DELIVERED")
    )),
    
    // 5. Pagamenti del mese (query filtrata)
    getDocs(query(
      collection(db, "payments"),
      where("month", "==", month),
      where("year", "==", year)
    )),
    
    // 6. Override del mese (query filtrata)
    getDocs(query(
      collection(db, "paymentOverrides"),
      where("month", "==", month),
      where("year", "==", year)
    )),
  ]);
  
  
  // ========== PROCESSA INVENTARIO ==========
  // Mappa con ENTRAMBI gli ID: completo (item_doubleSheets) e corto (doubleSheets)
  const inventoryById = new Map<string, { name: string; sellPrice: number; categoryName: string }>();
  inventorySnapshot.docs.forEach(doc => {
    const data = doc.data() as Record<string, any>;
    const itemData = {
      name: data.name || "",
      sellPrice: data.sellPrice || data.price || 0,
      categoryName: data.categoryName || data.category || "Altro",
    };
    
    // Aggiungi con ID completo (es: item_doubleSheets)
    inventoryById.set(doc.id, itemData);
    
    // Aggiungi anche con key corta se presente (es: doubleSheets)
    if (data.key) {
      inventoryById.set(data.key, itemData);
    }
    
    // Se l'ID inizia con "item_", aggiungi anche senza prefisso
    if (doc.id.startsWith("item_")) {
      inventoryById.set(doc.id.replace("item_", ""), itemData);
    }
  });
  
  // ========== PROCESSA PROPRIETÀ ==========
  const propertiesById = new Map<string, any>();
  const propertiesByOwner = new Map<string, any[]>();
  const ownerNames = new Map<string, string>();
  
  propertiesSnapshot.docs.forEach(doc => {
    const data = { id: doc.id, ...(doc.data() as Record<string, any>) };
    propertiesById.set(doc.id, data);
    
    // @ts-expect-error TODO-FIX: TS2339 Property 'ownerId' does not exist on type '{ id: string; }'.
    const ownerId = data.ownerId || "unknown";
    // @ts-expect-error TODO-FIX: TS2339 Property 'ownerName' does not exist on type '{ id: string; }'.
    const ownerName = data.ownerName || "Proprietario sconosciuto";
    
    if (!propertiesByOwner.has(ownerId)) {
      propertiesByOwner.set(ownerId, []);
      ownerNames.set(ownerId, ownerName);
    }
    propertiesByOwner.get(ownerId)!.push(data);
  });
  
  // ========== FILTRA PULIZIE PER MESE ==========
  const cleaningsInMonth: any[] = [];
  // 🔥 FIX: Creo un Set con TUTTI gli ID delle pulizie COMPLETED (non solo del mese)
  // Serve per verificare se un ordine può apparire nei pagamenti
  const completedCleaningIds = new Set<string>();
  
  cleaningsSnapshot.docs.forEach(doc => {
    const data = { id: doc.id, ...(doc.data() as Record<string, any>) };
    
    // Aggiungo TUTTI gli ID delle pulizie COMPLETED al Set
    completedCleaningIds.add(doc.id);
    
    // @ts-expect-error TODO-FIX: TS2339 Property 'scheduledDate' does not exist on type '{ id: string; }'.
    const scheduledDate = data.scheduledDate?.toDate?.();
    if (!scheduledDate) return;
    
    if (scheduledDate >= startOfMonth && scheduledDate <= endOfMonth) {
      cleaningsInMonth.push({
        ...data,
        scheduledDateParsed: scheduledDate
      });
    }
  });
  
  // ========== FILTRA ORDINI PER MESE ==========
  // 🔥 FIX: Gli ordini collegati a una pulizia (cleaningId) appaiono nei pagamenti
  // SOLO se la pulizia collegata è COMPLETED. Ordini standalone appaiono normalmente.
  const ordersInMonth: any[] = [];
  let ordersSkippedDuePendingCleaning = 0;
  
  ordersSnapshot.docs.forEach(doc => {
    const data = { id: doc.id, ...(doc.data() as Record<string, any>) };
    
    // 🔥 FIX: Se l'ordine è collegato a una pulizia, verifica che sia COMPLETED
    // @ts-expect-error TODO-FIX: TS2339 Property 'cleaningId' does not exist on type '{ id: string; }'.
    if (data.cleaningId) {
      // @ts-expect-error TODO-FIX: TS2339 Property 'cleaningId' does not exist on type '{ id: string; }'.
      if (!completedCleaningIds.has(data.cleaningId)) {
        // La pulizia collegata NON è completata → NON mostrare l'ordine nei pagamenti
        ordersSkippedDuePendingCleaning++;
        return; // Skip questo ordine
      }
    }
    
    // @ts-expect-error TODO-FIX: TS2339 Property 'deliveredAt' does not exist on type '{ id: string; }'.
    const deliveryDate = data.deliveredAt?.toDate?.() || data.scheduledDate?.toDate?.() || data.createdAt?.toDate?.();
    if (!deliveryDate) return;
    
    if (deliveryDate >= startOfMonth && deliveryDate <= endOfMonth) {
      // Calcola totale ordine dagli items con dettagli
      let calculatedTotal = 0;
      const itemDetails: OrderItemDetail[] = [];
      let mainCategory = "Biancheria";
      let maxCategoryTotal = 0;
      const categoryTotals: { [key: string]: number } = {};
      
      // @ts-expect-error TODO-FIX: TS2339 Property 'items' does not exist on type '{ id: string; }'.
      if (data.items && Array.isArray(data.items)) {
        // @ts-expect-error TODO-FIX: TS2339 Property 'items' does not exist on type '{ id: string; }'.
        data.items.forEach((item: any) => {
          const invItem = inventoryById.get(item.id);
          const basePrice = invItem?.sellPrice || item.price || 0;
          const unitPrice = item.priceOverride ?? basePrice;
          const quantity = item.quantity || 1;
          const itemTotal = unitPrice * quantity;
          calculatedTotal += itemTotal;
          
          const categoryName = invItem?.categoryName || "Altro";
          
          categoryTotals[categoryName] = (categoryTotals[categoryName] || 0) + itemTotal;
          if (categoryTotals[categoryName] > maxCategoryTotal) {
            maxCategoryTotal = categoryTotals[categoryName];
            mainCategory = categoryName;
          }
          
          itemDetails.push({
            itemId: item.id,
            name: invItem?.name || item.name || "Articolo",
            quantity,
            unitPrice,
            totalPrice: itemTotal,
            categoryName,
          });
        });
      }
      
      ordersInMonth.push({
        ...data,
        deliveryDateParsed: deliveryDate,
        calculatedTotal,
        itemDetails,
        mainCategory,
      });
    }
  });
  
  // ========== PROCESSA PAGAMENTI ==========
  const payments: Payment[] = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })) as Payment[];
  
  // ========== PROCESSA OVERRIDE ==========
  const overridesByOwner = new Map<string, PaymentOverride>();
  overridesSnapshot.docs.forEach(doc => {
    const data = doc.data() as Record<string, any>;
    overridesByOwner.set(data.proprietarioId, { id: doc.id, ...data } as PaymentOverride);
  });
  
  // ========== CALCOLA STATS PER PROPRIETARIO ==========
  const stats: ClientPaymentStats[] = [];
  
  for (const [ownerId, properties] of propertiesByOwner) {
    const propertyIds = properties.map(p => p.id);
    const ownerName = ownerNames.get(ownerId) || "Sconosciuto";
    const services: ServiceDetail[] = [];
    
    // PULIZIE
    let cleaningsTotal = 0;
    let cleaningsCount = 0;
    
    cleaningsInMonth.forEach(cleaning => {
      if (propertyIds.includes(cleaning.propertyId)) {
        // ⚠️ Salta se escluso dal billing (admin ha contestato/scontato)
        if ((cleaning as any).excludedFromBilling === true) return;
        const property = propertiesById.get(cleaning.propertyId);
        const originalPrice = cleaning.price || property?.cleaningPrice || 0;
        const effectivePrice = cleaning.priceOverride ?? originalPrice;
        
        cleaningsTotal += effectivePrice;
        cleaningsCount++;
        
        services.push({
          id: cleaning.id,
          type: "PULIZIA",
          date: cleaning.scheduledDateParsed,
          propertyId: cleaning.propertyId,
          propertyName: cleaning.propertyName || property?.name || "Proprietà",
          // @ts-expect-error TODO-FIX: TS2561 Object literal may only specify known properties, but 'propertyImage' does not e...
          propertyImage: property?.imageUrl || property?.image || property?.coverImage || property?.images?.door || property?.images?.building || property?.photos?.[0] || undefined,
          description: `Pulizia ${cleaning.type || "checkout"}`,
          originalPrice,
          effectivePrice,
          hasOverride: cleaning.priceOverride !== undefined && cleaning.priceOverride !== null,
          overrideReason: cleaning.priceOverrideReason,
          laundryOrderId: cleaning.laundryOrderId || undefined,
        });
      }
    });
    
    // ORDINI (separati per categoria)
    let ordersTotal = 0;
    let ordersCount = 0;
    let kitCortesiaTotal = 0;
    let kitCortesiaCount = 0;
    let serviziExtraTotal = 0;
    let serviziExtraCount = 0;
    
    ordersInMonth.forEach(order => {
      if (propertyIds.includes(order.propertyId)) {
        // ⚠️ Salta se escluso dal billing
        if ((order as any).excludedFromBilling === true) return;
        const originalPrice = order.calculatedTotal || 0;
        const effectivePrice = order.totalPriceOverride ?? originalPrice;
        
        const serviceType = mapCategoryToServiceType(order.mainCategory);
        
        if (serviceType === "KIT_CORTESIA") {
          kitCortesiaTotal += effectivePrice;
          kitCortesiaCount++;
        } else if (serviceType === "SERVIZI_EXTRA") {
          serviziExtraTotal += effectivePrice;
          serviziExtraCount++;
        } else {
          ordersTotal += effectivePrice;
          ordersCount++;
        }
        
        services.push({
          id: order.id,
          type: serviceType,
          date: order.deliveryDateParsed,
          propertyId: order.propertyId,
          propertyName: order.propertyName || "Proprietà",
          // @ts-expect-error TODO-FIX: TS2561 Object literal may only specify known properties, but 'propertyImage' does not e...
          propertyImage: (() => {
            const p = propertiesById.get(order.propertyId);
            return p?.imageUrl || p?.image || p?.coverImage || p?.images?.door || p?.images?.building || p?.photos?.[0] || undefined;
          })(),
          description: `${order.itemDetails?.length || 0} articoli`,
          originalPrice,
          effectivePrice,
          hasOverride: order.totalPriceOverride !== undefined && order.totalPriceOverride !== null,
          overrideReason: order.priceOverrideReason,
          items: order.itemDetails,
          cleaningId: order.cleaningId || undefined,
        });
      }
    });
    
    // Skip se non ci sono servizi
    const totalServices = cleaningsCount + ordersCount + kitCortesiaCount + serviziExtraCount;
    if (totalServices === 0) continue;
    
    // Ordina servizi per data
    services.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Calcola totali
    const totaleCalcolato = cleaningsTotal + ordersTotal + kitCortesiaTotal + serviziExtraTotal;
    const override = overridesByOwner.get(ownerId);
    const totaleEffettivo = override?.overrideTotal ?? totaleCalcolato;
    
    // Pagamenti del proprietario
    const ownerPayments = payments.filter(p => p.proprietarioId === ownerId);
    // ⚠️ Escludo isCreditTransfer per evitare doppio conteggio col carryover passivo
    const totalePagato = ownerPayments
      .filter(p => p.isCreditTransfer !== true)
      .reduce((sum, p) => sum + p.amount, 0);
    
    // Saldo
    const saldo = totaleEffettivo - totalePagato;
    
    // Stato
    let stato: "SALDATO" | "PARZIALE" | "DA_PAGARE" = "DA_PAGARE";
    if (saldo <= 0) stato = "SALDATO";
    else if (totalePagato > 0) stato = "PARZIALE";
    
    stats.push({
      proprietarioId: ownerId,
      proprietarioName: ownerName,
      propertyCount: properties.length,
      cleaningsCount,
      cleaningsTotal,
      ordersCount,
      ordersTotal,
      kitCortesiaCount,
      kitCortesiaTotal,
      serviziExtraCount,
      serviziExtraTotal,
      totaleCalcolato,
      totaleEffettivo,
      hasOverride: !!override,
      overrideReason: override?.reason,
      payments: ownerPayments,
      totalePagato,
      saldo,
      stato,
      services,
    });
  }
  
  // Ordina per saldo decrescente
  stats.sort((a, b) => b.saldo - a.saldo);
  
  const totalTime = Date.now() - startTime;
  
  return stats;
}

// ==================== SUMMARY (CALCOLA DA STATS GIÀ ESISTENTI) ====================

export function calculateSummaryFromStats(stats: ClientPaymentStats[]): PaymentsSummary {
  const totaleServizi = stats.reduce((sum, s) => sum + s.totaleEffettivo, 0);
  const totaleIncassato = stats.reduce((sum, s) => sum + s.totalePagato, 0);
  const saldoTotale = stats.reduce((sum, s) => sum + s.saldo, 0);
  const clientiConSaldo = stats.filter(s => s.saldo > 0).length;
  const clientiSaldati = stats.filter(s => s.stato === "SALDATO").length;
  
  // Calcola totali per metodo di pagamento
  let totaleContanti = 0;
  let totaleBonifico = 0;
  let totaleAltro = 0;
  
  stats.forEach(s => {
    s.payments.forEach(p => {
      // ⚠️ Escludo isCreditTransfer dai totali per metodo (non sono cash flow nuovi)
      if (p.isCreditTransfer === true) return;
      if (p.method === "CONTANTI") {
        totaleContanti += p.amount;
      } else if (p.method === "BONIFICO") {
        totaleBonifico += p.amount;
      } else {
        totaleAltro += p.amount;
      }
    });
  });
  
  return {
    totaleServizi,
    totaleIncassato,
    totaleContanti,
    totaleBonifico,
    totaleAltro,
    saldoTotale,
    clientiConSaldo,
    clientiSaldati,
  };
}

// DEPRECATO: Usa calculateSummaryFromStats invece
// Questa funzione è mantenuta per retrocompatibilità ma non dovrebbe essere usata
export async function getPaymentsSummary(month: number, year: number): Promise<PaymentsSummary> {
  console.warn("⚠️ getPaymentsSummary è deprecato! Usa calculateSummaryFromStats");
  const stats = await getClientPaymentStats(month, year);
  return calculateSummaryFromStats(stats);
}
