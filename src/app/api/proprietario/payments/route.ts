import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// Types
type PaymentMethod = "BONIFICO" | "CONTANTI" | "ALTRO";
type PaymentType = "ACCONTO" | "SALDO";
type ServiceType = "PULIZIA" | "BIANCHERIA" | "KIT_CORTESIA" | "SERVIZI_EXTRA";

interface Payment {
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
}

interface OrderItemDetail {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  categoryName: string;
}

interface ServiceDetail {
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
  items?: OrderItemDetail[];
}

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) {
      return JSON.parse(decodeURIComponent(userCookie.value));
    }
    return null;
  } catch {
    return null;
  }
}

function mapCategoryToServiceType(categoryName: string): ServiceType {
  const lower = categoryName.toLowerCase();
  if (lower.includes("kit") || lower.includes("cortesia")) return "KIT_CORTESIA";
  if (lower.includes("extra") || lower.includes("servizi")) return "SERVIZI_EXTRA";
  return "BIANCHERIA";
}

// GET - Ottieni statistiche pagamenti per il proprietario loggato
export async function GET(request: NextRequest) {
  const currentUser = await getFirebaseUser();
  
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  // Solo proprietari possono accedere
  if (currentUser.role !== "PROPRIETARIO") {
    return NextResponse.json({ error: "Solo i proprietari possono accedere" }, { status: 403 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

    const ownerId = currentUser.id;
    const ownerName = currentUser.name || "Proprietario";

    // 1. Carica proprietà del proprietario
    const propertiesSnapshot = await getDocs(
      query(
        collection(db, "properties"),
        where("ownerId", "==", ownerId),
        where("status", "==", "ACTIVE")
      )
    );
    
    const properties: any[] = [];
    const propertyIds: string[] = [];
    const propertiesById = new Map<string, any>();
    
    propertiesSnapshot.docs.forEach(doc => {
      const data = { id: doc.id, ...doc.data() };
      properties.push(data);
      propertyIds.push(doc.id);
      propertiesById.set(doc.id, data);
    });

    if (properties.length === 0) {
      return NextResponse.json({
        success: true,
        month,
        year,
        stats: null,
        message: "Nessuna proprietà attiva",
      });
    }

    // 2. Carica inventario per i prezzi
    const inventorySnapshot = await getDocs(collection(db, "inventory"));
    const inventoryById = new Map<string, any>();
    inventorySnapshot.docs.forEach(doc => {
      inventoryById.set(doc.id, { id: doc.id, ...doc.data() });
    });

    // 3. Range date per il mese
    const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    // 4. Carica pulizie COMPLETED nel mese per le proprietà del proprietario
    const cleaningsSnapshot = await getDocs(collection(db, "cleanings"));
    
    const services: ServiceDetail[] = [];
    let cleaningsTotal = 0;
    let cleaningsCount = 0;

    cleaningsSnapshot.docs.forEach(doc => {
      const data = { id: doc.id, ...doc.data() };
      
      if (data.status !== "COMPLETED") return;
      if (!propertyIds.includes(data.propertyId)) return;
      
      const scheduledDate = data.scheduledDate?.toDate?.();
      if (!scheduledDate) return;
      
      if (scheduledDate >= startOfMonth && scheduledDate <= endOfMonth) {
        const property = propertiesById.get(data.propertyId);
        const originalPrice = data.price || property?.cleaningPrice || 0;
        const effectivePrice = data.priceOverride ?? originalPrice;
        
        cleaningsTotal += effectivePrice;
        cleaningsCount++;
        
        services.push({
          id: data.id,
          type: "PULIZIA",
          date: scheduledDate,
          propertyId: data.propertyId,
          propertyName: data.propertyName || property?.name || "Proprietà",
          description: `Pulizia ${data.type || "checkout"}`,
          originalPrice,
          effectivePrice,
          hasOverride: data.priceOverride !== undefined && data.priceOverride !== null,
          overrideReason: data.priceOverrideReason,
        });
      }
    });

    // 5. Carica ordini DELIVERED nel mese per le proprietà del proprietario
    const ordersSnapshot = await getDocs(collection(db, "orders"));
    
    let ordersTotal = 0;
    let ordersCount = 0;
    let kitCortesiaTotal = 0;
    let kitCortesiaCount = 0;
    let serviziExtraTotal = 0;
    let serviziExtraCount = 0;

    ordersSnapshot.docs.forEach(doc => {
      const data = { id: doc.id, ...doc.data() };
      
      if (data.status !== "DELIVERED") return;
      if (!propertyIds.includes(data.propertyId)) return;
      
      const deliveryDate = data.deliveredAt?.toDate?.() || data.scheduledDate?.toDate?.() || data.createdAt?.toDate?.();
      if (!deliveryDate) return;
      
      if (deliveryDate >= startOfMonth && deliveryDate <= endOfMonth) {
        // Calcola totale ordine dagli items con dettagli
        let calculatedTotal = 0;
        const itemDetails: OrderItemDetail[] = [];
        let mainCategory = "Biancheria";
        let maxCategoryTotal = 0;
        const categoryTotals: { [key: string]: number } = {};
        
        if (data.items && Array.isArray(data.items)) {
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

        const originalPrice = calculatedTotal || 0;
        const effectivePrice = data.totalPriceOverride ?? originalPrice;
        const serviceType = mapCategoryToServiceType(mainCategory);
        
        // Aggiorna contatori in base alla categoria
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
          id: data.id,
          type: serviceType,
          date: deliveryDate,
          propertyId: data.propertyId,
          propertyName: data.propertyName || "Proprietà",
          description: `${itemDetails.length || 0} articoli`,
          originalPrice,
          effectivePrice,
          hasOverride: data.totalPriceOverride !== undefined && data.totalPriceOverride !== null,
          overrideReason: data.priceOverrideReason,
          items: itemDetails,
        });
      }
    });

    // 6. Carica pagamenti del proprietario per questo mese
    const paymentsSnapshot = await getDocs(
      query(
        collection(db, "payments"),
        where("proprietarioId", "==", ownerId),
        where("month", "==", month),
        where("year", "==", year)
      )
    );
    
    const payments: Payment[] = paymentsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Payment[];

    // 7. Carica override del proprietario per questo mese
    const overridesSnapshot = await getDocs(
      query(
        collection(db, "paymentOverrides"),
        where("proprietarioId", "==", ownerId),
        where("month", "==", month),
        where("year", "==", year)
      )
    );
    
    const override = overridesSnapshot.docs.length > 0 
      ? { id: overridesSnapshot.docs[0].id, ...overridesSnapshot.docs[0].data() }
      : null;

    // Ordina servizi per data
    services.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calcola totali
    const totaleCalcolato = cleaningsTotal + ordersTotal + kitCortesiaTotal + serviziExtraTotal;
    const totaleEffettivo = override?.overrideTotal ?? totaleCalcolato;
    const totalePagato = payments.reduce((sum, p) => sum + p.amount, 0);
    const saldo = totaleEffettivo - totalePagato;

    // Stato
    let stato: "SALDATO" | "PARZIALE" | "DA_PAGARE" = "DA_PAGARE";
    if (saldo <= 0) stato = "SALDATO";
    else if (totalePagato > 0) stato = "PARZIALE";

    // Statistiche per proprietà
    const statsByProperty = properties.map(property => {
      const propServices = services.filter(s => s.propertyId === property.id);
      const propTotal = propServices.reduce((sum, s) => sum + s.effectivePrice, 0);
      const propCleanings = propServices.filter(s => s.type === "PULIZIA").length;
      const propOrders = propServices.filter(s => s.type !== "PULIZIA").length;
      
      return {
        propertyId: property.id,
        propertyName: property.name,
        servicesCount: propServices.length,
        cleaningsCount: propCleanings,
        ordersCount: propOrders,
        total: propTotal,
      };
    }).filter(p => p.servicesCount > 0);

    return NextResponse.json({
      success: true,
      month,
      year,
      stats: {
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
        payments,
        totalePagato,
        saldo,
        stato,
        services,
        statsByProperty,
      },
    });
  } catch (error) {
    console.error("Errore GET proprietario payments:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
