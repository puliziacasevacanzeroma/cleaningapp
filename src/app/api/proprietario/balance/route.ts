import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

// ==================== TYPES ====================

interface MonthlyBalance {
  mese: number;
  anno: number;
  label: string; // "Gennaio 2026"
  totaleServizi: number;
  totalePagato: number;
  saldo: number;
  giorniRitardo: number;
  stato: "CORRENTE" | "APPENA_SCADUTO" | "IN_RITARDO" | "RITARDO_GRAVE" | "CRITICO" | "SALDATO";
  colore: "green" | "orange" | "yellow" | "orange-dark" | "red" | "red-dark";
}

interface BalanceResponse {
  success: boolean;
  // Totali
  arretrati: {
    totale: number;
    mesi: MonthlyBalance[];
  };
  meseCorrente: MonthlyBalance | null;
  totaleDaPagare: number;
  totalePagatoSempre: number;
  totaleServiziSempre: number;
  // Massimo ritardo
  maxGiorniRitardo: number;
  mostraAvviso: boolean; // true se > 15 giorni
}

// ==================== HELPERS ====================

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

function mapCategoryToServiceType(categoryName: string): string {
  const lower = (categoryName || "").toLowerCase();
  if (lower.includes("kit") || lower.includes("cortesia")) return "KIT_CORTESIA";
  if (lower.includes("extra") || lower.includes("servizi")) return "SERVIZI_EXTRA";
  return "BIANCHERIA";
}

function getAgingStatus(giorniRitardo: number, saldo: number): { 
  stato: MonthlyBalance["stato"]; 
  colore: MonthlyBalance["colore"]; 
} {
  if (saldo <= 0) return { stato: "SALDATO", colore: "green" };
  if (giorniRitardo <= 0) return { stato: "CORRENTE", colore: "orange" };
  if (giorniRitardo <= 5) return { stato: "APPENA_SCADUTO", colore: "yellow" };
  if (giorniRitardo <= 10) return { stato: "IN_RITARDO", colore: "orange-dark" };
  if (giorniRitardo <= 15) return { stato: "RITARDO_GRAVE", colore: "red" };
  return { stato: "CRITICO", colore: "red-dark" };
}

function calcGiorniRitardo(mese: number, anno: number): number {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  // Se è il mese corrente, ritardo = 0 (in maturazione)
  if (mese === currentMonth && anno === currentYear) {
    return 0;
  }
  
  // Fine del mese di riferimento
  const fineDelMese = new Date(anno, mese, 0, 23, 59, 59); // ultimo giorno del mese
  
  // Giorni passati dalla fine del mese
  const diffMs = now.getTime() - fineDelMese.getTime();
  const giorniRitardo = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  return Math.max(0, giorniRitardo);
}

// ==================== MAIN API ====================

export async function GET(request: NextRequest) {
  const currentUser = await getApiUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  // Solo proprietari possono accedere
  if (currentUser.role !== "PROPRIETARIO" && currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const proprietarioId = searchParams.get("proprietarioId") || currentUser.id;
    
    // Se non admin, può vedere solo i propri dati
    if (currentUser.role !== "ADMIN" && proprietarioId !== currentUser.id) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // ==================== 1. CARICA PROPRIETÀ ====================
    const propertiesQuery = adminDb.collection("properties").where("ownerId", "==", proprietarioId).where("status", "==", "ACTIVE");
    const propertiesSnap = await propertiesQuery.get();
    const properties = propertiesSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })) as any[];

    if (properties.length === 0) {
      return NextResponse.json({
        success: true,
        arretrati: { totale: 0, mesi: [] },
        meseCorrente: null,
        totaleDaPagare: 0,
        totalePagatoSempre: 0,
        totaleServiziSempre: 0,
        maxGiorniRitardo: 0,
        mostraAvviso: false,
      });
    }

    const propertyIds = properties.map(p => p.id);
    const propertiesById = new Map(properties.map(p => [p.id, p]));

    // ==================== 2. CARICA INVENTORY ====================
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryById = new Map(
      inventorySnap.docs.map(doc => [doc.id, { id: doc.id, ...(doc.data() as Record<string, any>) }])
    );

    // ==================== 3. CARICA TUTTI I DATI STORICI ====================
    // Cleanings
    const cleaningsSnap = await adminDb.collection("cleanings").get();
    const allCleanings = cleaningsSnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }))
      .filter((c: any) => propertyIds.includes(c.propertyId) && c.status === "COMPLETED") as any[];

    // Orders
    const ordersSnap = await adminDb.collection("orders").get();
    const allOrders = ordersSnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }))
      .filter((o: any) => propertyIds.includes(o.propertyId)) as any[];

    // Payments
    const paymentsQuery = adminDb.collection("payments").where("proprietarioId", "==", proprietarioId);
    const paymentsSnap = await paymentsQuery.get();
    const allPayments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })) as any[];

    // Overrides
    const overridesQuery = adminDb.collection("paymentOverrides").where("proprietarioId", "==", proprietarioId);
    const overridesSnap = await overridesQuery.get();
    const overridesByMonthYear = new Map<string, any>();
    overridesSnap.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      const key = `${data.month}-${data.year}`;
      overridesByMonthYear.set(key, data);
    });

    // ==================== 4. RAGGRUPPA PER MESE ====================
    const monthlyData = new Map<string, {
      mese: number;
      anno: number;
      servizi: number;
      pagato: number;
    }>();

    // Mappa pulizie completate per collegamento ordini
    const completedCleaningIds = new Set<string>();
    const completedCleaningOrderIds = new Set<string>();

    // Processa Cleanings
    allCleanings.forEach((cleaning: any) => {
      const scheduledDate = cleaning.scheduledDate?.toDate?.();
      if (!scheduledDate) return;

      const mese = scheduledDate.getMonth() + 1;
      const anno = scheduledDate.getFullYear();
      const key = `${mese}-${anno}`;

      completedCleaningIds.add(cleaning.id);
      if (cleaning.laundryOrderId) completedCleaningOrderIds.add(cleaning.laundryOrderId);

      const property = propertiesById.get(cleaning.propertyId);
      const originalPrice = (cleaning.price || property?.cleaningPrice || 0) + (cleaning.holidayFee ?? 0);
      const effectivePrice = (cleaning.priceOverride ?? (cleaning.price || property?.cleaningPrice || 0)) + (cleaning.holidayFee ?? 0);

      const existing = monthlyData.get(key) || { mese, anno, servizi: 0, pagato: 0 };
      existing.servizi += effectivePrice;
      monthlyData.set(key, existing);
    });

    // Processa Orders (DELIVERED o collegati a pulizie completate)
    const processedOrderIds = new Set<string>();
    allOrders.forEach((order: any) => {
      if (processedOrderIds.has(order.id)) return;

      const isDelivered = order.status === "DELIVERED";
      const isLinkedToCompletedCleaning =
        (order.cleaningId && completedCleaningIds.has(order.cleaningId)) ||
        completedCleaningOrderIds.has(order.id);

      if (!isDelivered && !isLinkedToCompletedCleaning) return;

      let referenceDate: Date | null = null;
      if (isDelivered) {
        referenceDate = order.deliveredAt?.toDate?.() || order.scheduledDate?.toDate?.() || order.createdAt?.toDate?.() || null;
      } else {
        referenceDate = order.scheduledDate?.toDate?.() || order.createdAt?.toDate?.() || null;
      }

      if (!referenceDate) return;

      processedOrderIds.add(order.id);

      const mese = referenceDate.getMonth() + 1;
      const anno = referenceDate.getFullYear();
      const key = `${mese}-${anno}`;

      // Calcola totale ordine
      let orderTotal = 0;
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item: any) => {
          const invItem = inventoryById.get(item.id) as any;
          const basePrice = invItem?.sellPrice || item.price || 0;
          const unitPrice = item.priceOverride ?? basePrice;
          const quantity = item.quantity || 1;
          orderTotal += unitPrice * quantity;
        });
      }
      // 💰 Aggiungi costo consegna se presente e abilitato
      if (order.deliveryFee && order.deliveryFeeEnabled !== false) {
        orderTotal += order.deliveryFee;
      }
      const effectivePrice = order.totalPriceOverride ?? orderTotal;

      const existing = monthlyData.get(key) || { mese, anno, servizi: 0, pagato: 0 };
      existing.servizi += effectivePrice;
      monthlyData.set(key, existing);
    });

    // Processa Payments
    allPayments.forEach((payment: any) => {
      const key = `${payment.month}-${payment.year}`;
      const existing = monthlyData.get(key) || { mese: payment.month, anno: payment.year, servizi: 0, pagato: 0 };
      existing.pagato += payment.amount || 0;
      monthlyData.set(key, existing);
    });

    // ==================== 5. CALCOLA BALANCE PER MESE ====================
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const monthlyBalances: MonthlyBalance[] = [];
    let totalePagatoSempre = 0;
    let totaleServiziSempre = 0;

    // Ordina per data (più vecchi prima)
    const sortedMonths = Array.from(monthlyData.entries()).sort((a, b) => {
      const [ma, ya] = a[0].split("-").map(Number);
      const [mb, yb] = b[0].split("-").map(Number);
      if (ya !== yb) return ya - yb;
      return ma - mb;
    });

    sortedMonths.forEach(([key, data]) => {
      // Applica override se esiste
      const override = overridesByMonthYear.get(key);
      const totaleServizi = override?.overrideTotal ?? data.servizi;
      const totalePagato = data.pagato;
      const saldo = totaleServizi - totalePagato;
      const giorniRitardo = calcGiorniRitardo(data.mese, data.anno);
      const { stato, colore } = getAgingStatus(giorniRitardo, saldo);

      totalePagatoSempre += totalePagato;
      totaleServiziSempre += totaleServizi;

      // Includi solo mesi con servizi o pagamenti
      if (totaleServizi > 0 || totalePagato > 0) {
        monthlyBalances.push({
          mese: data.mese,
          anno: data.anno,
          label: `${MONTHS[data.mese - 1]} ${data.anno}`,
          totaleServizi,
          totalePagato,
          saldo,
          giorniRitardo,
          stato,
          colore,
        });
      }
    });

    // ==================== 6. SEPARA CORRENTE DA ARRETRATI ====================
    const meseCorrente = monthlyBalances.find(
      m => m.mese === currentMonth && m.anno === currentYear
    ) || null;

    const arretratiMesi = monthlyBalances.filter(
      m => !(m.mese === currentMonth && m.anno === currentYear) && m.saldo > 0
    );

    const totaleArretrati = arretratiMesi.reduce((sum, m) => sum + m.saldo, 0);
    const totaleMeseCorrente = meseCorrente?.saldo || 0;
    const totaleDaPagare = totaleArretrati + Math.max(0, totaleMeseCorrente);

    // Massimo ritardo
    const maxGiorniRitardo = arretratiMesi.reduce(
      (max, m) => Math.max(max, m.giorniRitardo),
      0
    );

    // Mostra avviso se ritardo > 15 giorni
    const mostraAvviso = maxGiorniRitardo > 15;

    // ==================== 7. RISPOSTA ====================
    const response: BalanceResponse = {
      success: true,
      arretrati: {
        totale: totaleArretrati,
        mesi: arretratiMesi.sort((a, b) => {
          // Ordina per ritardo decrescente (più urgenti prima)
          return b.giorniRitardo - a.giorniRitardo;
        }),
      },
      meseCorrente,
      totaleDaPagare,
      totalePagatoSempre,
      totaleServiziSempre,
      maxGiorniRitardo,
      mostraAvviso,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Errore GET proprietario/balance:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
