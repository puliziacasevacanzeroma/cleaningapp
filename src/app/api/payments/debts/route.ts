import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface OrderItemDetail {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface ServiceDetail {
  id: string;
  type: "PULIZIA" | "BIANCHERIA" | "KIT_CORTESIA" | "SERVIZI_EXTRA";
  date: string;
  propertyId: string;
  propertyName: string;
  description: string;
  originalPrice: number;
  effectivePrice: number;
  hasOverride: boolean;
  overrideReason?: string;
  items?: OrderItemDetail[];
  cleaningId?: string;
  laundryOrderId?: string;
}

interface ServiceGroup {
  cleaning?: ServiceDetail;
  laundry?: ServiceDetail;
  extras: ServiceDetail[];
  totalPrice: number;
  date: string;
}

interface PropertyServices {
  propertyId: string;
  propertyName: string;
  groups: ServiceGroup[];
  totalPrice: number;
}

interface MonthDebt {
  month: number;
  year: number;
  monthKey: string;
  monthLabel: string;
  status: "SCADUTO" | "WARNING" | "DA_PAGARE" | "SALDATO";
  statusLabel: string;
  daysToDeadline: number;
  deadline: string;
  properties: PropertyServices[];
  totaleServizi: number;
  totalePagato: number;
  saldo: number;
  payments: any[];
}

interface ClientDebt {
  proprietarioId: string;
  proprietarioName: string;
  proprietarioEmail?: string;
  propertyCount: number;
  months: MonthDebt[];
  totaleDebito: number;
  totaleScaduto: number;
  totaleWarning: number;
  totaleCorrentes: number;
  hasScaduto: boolean;
  hasWarning: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const MONTHS_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

function getMonthKey(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getDeadlineDate(month: number, year: number): Date {
  let deadlineMonth = month + 1;
  let deadlineYear = year;
  if (deadlineMonth > 12) {
    deadlineMonth = 1;
    deadlineYear++;
  }
  return new Date(deadlineYear, deadlineMonth - 1, 10, 23, 59, 59);
}

function getWarningDate(month: number, year: number): Date {
  let warningMonth = month + 1;
  let warningYear = year;
  if (warningMonth > 12) {
    warningMonth = 1;
    warningYear++;
  }
  return new Date(warningYear, warningMonth - 1, 5, 0, 0, 0);
}

function getDebtStatus(month: number, year: number, saldo: number): {
  status: "SCADUTO" | "WARNING" | "DA_PAGARE" | "SALDATO";
  statusLabel: string;
  daysToDeadline: number;
} {
  if (saldo <= 0) {
    return { status: "SALDATO", statusLabel: "Saldato", daysToDeadline: 0 };
  }
  
  const now = new Date();
  const deadline = getDeadlineDate(month, year);
  const warning = getWarningDate(month, year);
  const daysToDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (now > deadline) {
    return { status: "SCADUTO", statusLabel: `Scaduto da ${Math.abs(daysToDeadline)} giorni`, daysToDeadline };
  }
  if (now >= warning) {
    return { status: "WARNING", statusLabel: `Scade tra ${daysToDeadline} giorni`, daysToDeadline };
  }
  return { status: "DA_PAGARE", statusLabel: `Scade il 10/${month + 1 > 12 ? 1 : month + 1}`, daysToDeadline };
}

function parseDate(date: any): Date | null {
  if (!date) return null;
  if (date.toDate) return date.toDate();
  if (date.seconds) return new Date(date.seconds * 1000);
  if (typeof date === "string") return new Date(date);
  return null;
}

function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN API
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const currentUser = await getApiUser();
  
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const monthsBack = parseInt(searchParams.get("monthsBack") || "6");
    
    // Calcola range date (da X mesi fa ad oggi)
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    if (process.env.NODE_ENV !== "production") console.log(`📊 Caricamento debiti dal ${startDate.toLocaleDateString()} al ${endDate.toLocaleDateString()}`);

    // ═══════════════════════════════════════════════════════════════════════════
    // CARICA DATI
    // ═══════════════════════════════════════════════════════════════════════════

    const [
      propertiesSnapshot,
      usersSnapshot,
      cleaningsSnapshot,
      ordersSnapshot,
      paymentsSnapshot,
      inventorySnapshot,
    ] = await Promise.all([
      adminDb.collection("properties").get(),
      adminDb.collection("users").get(),
      adminDb.collection("cleanings").where("status", "==", "COMPLETED").get(),
      adminDb.collection("orders").where("status", "==", "DELIVERED").get(),
      adminDb.collection("payments").get(),
      adminDb.collection("inventory").get(),
    ]);

    // Index dati
    const propertiesById = new Map<string, any>();
    const propertiesByOwner = new Map<string, any[]>();
    const ownerNames = new Map<string, string>();
    const ownerEmails = new Map<string, string>();
    const inventoryById = new Map<string, any>();

    propertiesSnapshot.docs.forEach(doc => {
      const data = { id: doc.id, ...(doc.data() as Record<string, any>) };
      propertiesById.set(doc.id, data);
      
      // @ts-expect-error TODO-FIX: TS2339 Property 'ownerId' does not exist on type '{ id: string; }'.
      const ownerId = data.ownerId;
      if (ownerId) {
        if (!propertiesByOwner.has(ownerId)) {
          propertiesByOwner.set(ownerId, []);
        }
        propertiesByOwner.get(ownerId)!.push(data);
      }
    });

    usersSnapshot.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      if (data.role === "PROPRIETARIO") {
        ownerNames.set(doc.id, data.name || data.email || "Sconosciuto");
        ownerEmails.set(doc.id, data.email || "");
      }
    });

    inventorySnapshot.docs.forEach(doc => {
      inventoryById.set(doc.id, { id: doc.id, ...(doc.data() as Record<string, any>) });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // PROCESSA PULIZIE
    // ═══════════════════════════════════════════════════════════════════════════

    interface CleaningData {
      id: string;
      propertyId: string;
      propertyName: string;
      date: Date;
      month: number;
      year: number;
      price: number;
      priceOverride?: number;
      priceOverrideReason?: string;
      laundryOrderId?: string;
      type?: string;
    }

    const cleaningsByMonth = new Map<string, CleaningData[]>();
    const cleaningsById = new Map<string, CleaningData>();

    cleaningsSnapshot.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      const date = parseDate(data.scheduledDate) || parseDate(data.completedAt);
      if (!date || date < startDate || date > endDate) return;
      
      const property = propertiesById.get(data.propertyId);
      if (!property) return;
      
      const cleaning: CleaningData = {
        id: doc.id,
        propertyId: data.propertyId,
        propertyName: data.propertyName || property.name || "Proprietà",
        date,
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        price: data.priceOverride ?? data.cleaningPrice ?? property.cleaningPrice ?? 0,
        priceOverride: data.priceOverride,
        priceOverrideReason: data.priceOverrideReason,
        laundryOrderId: data.laundryOrderId,
        type: data.type,
      };
      
      const monthKey = getMonthKey(cleaning.month, cleaning.year);
      if (!cleaningsByMonth.has(monthKey)) {
        cleaningsByMonth.set(monthKey, []);
      }
      cleaningsByMonth.get(monthKey)!.push(cleaning);
      cleaningsById.set(doc.id, cleaning);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // PROCESSA ORDINI
    // ═══════════════════════════════════════════════════════════════════════════

    interface OrderData {
      id: string;
      propertyId: string;
      propertyName: string;
      date: Date;
      month: number;
      year: number;
      totalPrice: number;
      totalPriceOverride?: number;
      priceOverrideReason?: string;
      cleaningId?: string;
      items: OrderItemDetail[];
      category: string;
    }

    const ordersByMonth = new Map<string, OrderData[]>();
    const completedCleaningIds = new Set<string>();
    
    // Prima raccogli tutti gli ID delle pulizie completate
    cleaningsSnapshot.docs.forEach(doc => {
      completedCleaningIds.add(doc.id);
    });

    ordersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      
      // Se l'ordine è collegato a una pulizia, verifica che sia completata
      if (data.cleaningId && !completedCleaningIds.has(data.cleaningId)) {
        return; // Skip ordine se pulizia non completata
      }
      
      const date = parseDate(data.deliveredAt) || parseDate(data.scheduledDate) || parseDate(data.createdAt);
      if (!date || date < startDate || date > endDate) return;
      
      const property = propertiesById.get(data.propertyId);
      if (!property) return;
      
      // Calcola totale e items
      let totalPrice = 0;
      const items: OrderItemDetail[] = [];
      let mainCategory = "Biancheria";
      
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          const invItem = inventoryById.get(item.id);
          const unitPrice = item.priceOverride ?? invItem?.sellPrice ?? item.price ?? 0;
          const quantity = item.quantity || 1;
          const itemTotal = unitPrice * quantity;
          totalPrice += itemTotal;
          
          items.push({
            itemId: item.id,
            name: invItem?.name || item.name || "Articolo",
            quantity,
            unitPrice,
            totalPrice: itemTotal,
          });
          
          if (invItem?.categoryName) {
            mainCategory = invItem.categoryName;
          }
        });
      }
      
      const order: OrderData = {
        id: doc.id,
        propertyId: data.propertyId,
        propertyName: data.propertyName || property.name || "Proprietà",
        date,
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        totalPrice: data.totalPriceOverride ?? totalPrice,
        totalPriceOverride: data.totalPriceOverride,
        priceOverrideReason: data.priceOverrideReason,
        cleaningId: data.cleaningId,
        items,
        category: mainCategory,
      };
      
      const monthKey = getMonthKey(order.month, order.year);
      if (!ordersByMonth.has(monthKey)) {
        ordersByMonth.set(monthKey, []);
      }
      ordersByMonth.get(monthKey)!.push(order);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // PROCESSA PAGAMENTI
    // ═══════════════════════════════════════════════════════════════════════════

    interface PaymentData {
      id: string;
      proprietarioId: string;
      month: number;
      year: number;
      amount: number;
      method: string;
      note?: string;
      createdAt: Date;
    }

    const paymentsByOwnerMonth = new Map<string, PaymentData[]>();

    paymentsSnapshot.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      const key = `${data.proprietarioId}-${getMonthKey(data.month, data.year)}`;
      
      const payment: PaymentData = {
        id: doc.id,
        proprietarioId: data.proprietarioId,
        month: data.month,
        year: data.year,
        amount: data.amount,
        method: data.method,
        note: data.note,
        createdAt: parseDate(data.createdAt) || new Date(),
      };
      
      if (!paymentsByOwnerMonth.has(key)) {
        paymentsByOwnerMonth.set(key, []);
      }
      paymentsByOwnerMonth.get(key)!.push(payment);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // COSTRUISCI STRUTTURA CLIENTI
    // ═══════════════════════════════════════════════════════════════════════════

    const clients: ClientDebt[] = [];
    const allProperties: { id: string; name: string; ownerId: string; ownerName: string }[] = [];

    for (const [ownerId, properties] of propertiesByOwner) {
      const ownerName = ownerNames.get(ownerId) || "Sconosciuto";
      const ownerEmail = ownerEmails.get(ownerId);
      const propertyIds = properties.map(p => p.id);
      
      // Aggiungi proprietà alla lista globale
      properties.forEach(p => {
        allProperties.push({
          id: p.id,
          name: p.name,
          ownerId,
          ownerName,
        });
      });
      
      const months: MonthDebt[] = [];
      let totaleDebito = 0;
      let totaleScaduto = 0;
      let totaleWarning = 0;
      let totaleCorrentes = 0;
      
      // Itera su tutti i mesi nel range
      for (let m = startDate.getMonth(); m <= now.getMonth() + (now.getFullYear() - startDate.getFullYear()) * 12; m++) {
        const month = ((m % 12) + 12) % 12 + 1;
        const year = startDate.getFullYear() + Math.floor(m / 12);
        const monthKey = getMonthKey(month, year);
        
        // Trova servizi per questo proprietario in questo mese
        const monthCleanings = (cleaningsByMonth.get(monthKey) || [])
          .filter(c => propertyIds.includes(c.propertyId));
        const monthOrders = (ordersByMonth.get(monthKey) || [])
          .filter(o => propertyIds.includes(o.propertyId));
        
        if (monthCleanings.length === 0 && monthOrders.length === 0) continue;
        
        // Raggruppa per proprietà
        const propertiesMap = new Map<string, PropertyServices>();
        
        // Prima le pulizie
        monthCleanings.forEach(cleaning => {
          if (!propertiesMap.has(cleaning.propertyId)) {
            propertiesMap.set(cleaning.propertyId, {
              propertyId: cleaning.propertyId,
              propertyName: cleaning.propertyName,
              groups: [],
              totalPrice: 0,
            });
          }
          
          const prop = propertiesMap.get(cleaning.propertyId)!;
          
          // Trova ordine collegato
          const linkedOrder = monthOrders.find(o => o.cleaningId === cleaning.id);
          
          const group: ServiceGroup = {
            cleaning: {
              id: cleaning.id,
              type: "PULIZIA",
              date: formatDateISO(cleaning.date),
              propertyId: cleaning.propertyId,
              propertyName: cleaning.propertyName,
              description: `Pulizia ${cleaning.type || "checkout"}`,
              originalPrice: (cleaning.price ?? 0) + (cleaning.holidayFee ?? 0),
              effectivePrice: (cleaning.priceOverride ?? cleaning.price ?? 0) + (cleaning.holidayFee ?? 0),
              hasOverride: cleaning.priceOverride !== undefined,
              overrideReason: cleaning.priceOverrideReason,
              laundryOrderId: cleaning.laundryOrderId,
              holidayFee: cleaning.holidayFee ?? 0,
              holidayName: cleaning.holidayName ?? null,
            },
            extras: [],
            totalPrice: (cleaning.priceOverride ?? cleaning.price ?? 0) + (cleaning.holidayFee ?? 0),
            date: formatDateISO(cleaning.date),
          };
          
          if (linkedOrder) {
            group.laundry = {
              id: linkedOrder.id,
              type: "BIANCHERIA",
              date: formatDateISO(linkedOrder.date),
              propertyId: linkedOrder.propertyId,
              propertyName: linkedOrder.propertyName,
              description: `${linkedOrder.items.length} articoli`,
              originalPrice: linkedOrder.totalPrice,
              effectivePrice: linkedOrder.totalPriceOverride ?? linkedOrder.totalPrice,
              hasOverride: linkedOrder.totalPriceOverride !== undefined,
              overrideReason: linkedOrder.priceOverrideReason,
              items: linkedOrder.items,
              cleaningId: linkedOrder.cleaningId,
            };
            group.totalPrice += linkedOrder.totalPriceOverride ?? linkedOrder.totalPrice;
          }
          
          prop.groups.push(group);
          prop.totalPrice += group.totalPrice;
        });
        
        // Poi ordini senza pulizia collegata
        monthOrders.forEach(order => {
          if (order.cleaningId) return; // Già gestito sopra
          
          if (!propertiesMap.has(order.propertyId)) {
            propertiesMap.set(order.propertyId, {
              propertyId: order.propertyId,
              propertyName: order.propertyName,
              groups: [],
              totalPrice: 0,
            });
          }
          
          const prop = propertiesMap.get(order.propertyId)!;
          
          const serviceType = order.category.toLowerCase().includes("kit") ? "KIT_CORTESIA" : "BIANCHERIA";
          
          const group: ServiceGroup = {
            extras: [{
              id: order.id,
              type: serviceType,
              date: formatDateISO(order.date),
              propertyId: order.propertyId,
              propertyName: order.propertyName,
              description: `${order.items.length} articoli`,
              originalPrice: order.totalPrice,
              effectivePrice: order.totalPriceOverride ?? order.totalPrice,
              hasOverride: order.totalPriceOverride !== undefined,
              overrideReason: order.priceOverrideReason,
              items: order.items,
            }],
            totalPrice: order.totalPriceOverride ?? order.totalPrice,
            date: formatDateISO(order.date),
          };
          
          prop.groups.push(group);
          prop.totalPrice += group.totalPrice;
        });
        
        // Ordina gruppi per data
        propertiesMap.forEach(prop => {
          prop.groups.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        });
        
        // Calcola totali mese
        const totaleServizi = Array.from(propertiesMap.values())
          .reduce((sum, p) => sum + p.totalPrice, 0);
        
        // Pagamenti per questo mese
        const paymentKey = `${ownerId}-${monthKey}`;
        const monthPayments = paymentsByOwnerMonth.get(paymentKey) || [];
        const totalePagato = monthPayments.reduce((sum, p) => sum + p.amount, 0);
        const saldo = totaleServizi - totalePagato;
        
        if (saldo <= 0 && totaleServizi === 0) continue;
        
        // Status
        const { status, statusLabel, daysToDeadline } = getDebtStatus(month, year, saldo);
        const deadline = getDeadlineDate(month, year);
        
        // Aggiungi mese
        months.push({
          month,
          year,
          monthKey,
          monthLabel: `${MONTHS_IT[month - 1]} ${year}`,
          status,
          statusLabel,
          daysToDeadline,
          deadline: formatDateISO(deadline),
          properties: Array.from(propertiesMap.values()),
          totaleServizi,
          totalePagato,
          saldo,
          payments: monthPayments.map(p => ({
            id: p.id,
            amount: p.amount,
            method: p.method,
            note: p.note,
            date: formatDateISO(p.createdAt),
          })),
        });
        
        // Accumula totali
        if (saldo > 0) {
          totaleDebito += saldo;
          if (status === "SCADUTO") totaleScaduto += saldo;
          else if (status === "WARNING") totaleWarning += saldo;
          else totaleCorrentes += saldo;
        }
      }
      
      // Skip clienti senza debiti
      if (months.length === 0) continue;
      
      // Ordina mesi (più vecchi prima)
      months.sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      });
      
      clients.push({
        proprietarioId: ownerId,
        proprietarioName: ownerName,
        proprietarioEmail: ownerEmail,
        propertyCount: properties.length,
        months,
        totaleDebito,
        totaleScaduto,
        totaleWarning,
        totaleCorrentes,
        hasScaduto: totaleScaduto > 0,
        hasWarning: totaleWarning > 0,
      });
    }
    
    // Ordina clienti (prima quelli con scaduti, poi per debito totale)
    clients.sort((a, b) => {
      if (a.hasScaduto !== b.hasScaduto) return a.hasScaduto ? -1 : 1;
      if (a.hasWarning !== b.hasWarning) return a.hasWarning ? -1 : 1;
      return b.totaleDebito - a.totaleDebito;
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // CALCOLA SUMMARY
    // ═══════════════════════════════════════════════════════════════════════════

    const summary = {
      totaleScaduto: clients.reduce((sum, c) => sum + c.totaleScaduto, 0),
      totaleWarning: clients.reduce((sum, c) => sum + c.totaleWarning, 0),
      totaleCorrentes: clients.reduce((sum, c) => sum + c.totaleCorrentes, 0),
      totaleDebito: clients.reduce((sum, c) => sum + c.totaleDebito, 0),
      clientiConScaduto: clients.filter(c => c.hasScaduto).length,
      clientiConWarning: clients.filter(c => c.hasWarning).length,
      clientiTotali: clients.length,
    };

    // Lista proprietari per filtri
    const owners = clients.map(c => ({
      id: c.proprietarioId,
      name: c.proprietarioName,
      debt: c.totaleDebito,
      hasScaduto: c.hasScaduto,
    }));

    return NextResponse.json({
      success: true,
      summary,
      clients,
      owners,
      properties: allProperties,
    });

  } catch (error) {
    console.error("❌ Errore caricamento debiti:", error);
    return NextResponse.json(
      { error: "Errore nel caricamento dei dati" },
      { status: 500 }
    );
  }
}
