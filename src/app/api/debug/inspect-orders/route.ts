/**
 * GET /api/debug/inspect-orders?cronSecret=XXX&name=valle&month=3&year=2026
 *
 * Mostra TUTTI i campi raw degli ordini di un proprietario in un mese,
 * INCLUSI quelli excludedFromBilling, CANCELLED, ecc, per capire perché
 * la pagina pagamenti li conta diversamente dal calcolo backend.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("cronSecret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const month = parseInt(searchParams.get("month") || "");
  const year = parseInt(searchParams.get("year") || "");
  const nameFilter = searchParams.get("name");

  if (!month || !year || !nameFilter) {
    return NextResponse.json({ error: "Parametri name, month, year obbligatori" }, { status: 400 });
  }

  try {
    // Trova owner
    let ownerId: string | null = null;
    let ownerData: any = null;
    const usersSnap = await adminDb.collection("users").get();
    for (const d of usersSnap.docs) {
      const u = d.data() as any;
      const name = u.name || u.fullName || u.displayName || "";
      if (name.toLowerCase().includes(nameFilter.toLowerCase())) {
        ownerId = d.id;
        ownerData = u;
        break;
      }
    }
    if (!ownerId) return NextResponse.json({ error: "Owner non trovato" }, { status: 404 });

    // Proprietà
    const propsSnap = await adminDb.collection("properties").where("ownerId", "==", ownerId).get();
    const propIds = propsSnap.docs.map(d => d.id);
    const propsById = new Map<string, any>();
    propsSnap.docs.forEach(d => propsById.set(d.id, { id: d.id, ...(d.data() as any) }));

    // ═══ TUTTI gli ordini delle properties dell'owner, in qualunque stato ═══
    // Range largo per essere sicuri
    const monthStart = new Date(year, month - 2, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

    const ordersAll: any[] = [];

    // Carico ordini con scheduledDate nel range
    if (propIds.length > 0) {
      const ordersSnap = await adminDb.collection("orders")
        .where("scheduledDate", ">=", Timestamp.fromDate(monthStart))
        .where("scheduledDate", "<=", Timestamp.fromDate(monthEnd))
        .get();

      for (const d of ordersSnap.docs) {
        const o = d.data() as any;
        if (!propIds.includes(o.propertyId)) continue;

        const scheduledDate = o.scheduledDate?.toDate?.();
        const deliveredAt = o.deliveredAt?.toDate?.();

        // Determina mese di riferimento
        const refDate = deliveredAt || scheduledDate;
        const refM = refDate?.getMonth() + 1;
        const refY = refDate?.getFullYear();

        if (refM !== month || refY !== year) continue;

        // Calcolo prezzo per il backend
        let backendPrice = 0;
        if (o.totalPriceOverride !== undefined && o.totalPriceOverride !== null) {
          backendPrice = o.totalPriceOverride;
        } else {
          if (Array.isArray(o.items)) {
            for (const item of o.items) {
              const itemTotal = item.totalPrice ?? ((item.unitPrice ?? item.price ?? 0) * (item.quantity ?? 1));
              backendPrice += itemTotal;
            }
          }
          if (o.deliveryFee && o.deliveryFeeEnabled !== false) backendPrice += o.deliveryFee;
          if (o.bedMaking && o.bedMakingFee) backendPrice += o.bedMakingFee;
        }

        // Verifica anche cleaningId collegato
        let cleaningInfo: any = null;
        if (o.cleaningId) {
          try {
            const c = await adminDb.collection("cleanings").doc(o.cleaningId).get();
            if (c.exists) {
              const cd = c.data() as any;
              cleaningInfo = {
                id: c.id,
                status: cd.status,
                scheduledDate: cd.scheduledDate?.toDate?.()?.toISOString(),
              };
            } else {
              cleaningInfo = { id: o.cleaningId, exists: false };
            }
          } catch {}
        }

        ordersAll.push({
          id: d.id,
          propertyName: propsById.get(o.propertyId)?.name || "?",
          status: o.status,
          excludedFromBilling: o.excludedFromBilling === true,
          scheduledDate: scheduledDate?.toISOString() || null,
          deliveredAt: deliveredAt?.toISOString() || null,
          createdAt: o.createdAt?.toDate?.()?.toISOString() || null,
          // Items
          itemsCount: Array.isArray(o.items) ? o.items.length : 0,
          items: o.items || [],
          // Pricing
          totalPriceOverride: o.totalPriceOverride ?? null,
          deliveryFee: o.deliveryFee ?? null,
          deliveryFeeEnabled: o.deliveryFeeEnabled ?? null,
          bedMaking: o.bedMaking ?? null,
          bedMakingFee: o.bedMakingFee ?? null,
          // Calcolato
          backendPriceComputed: round(backendPrice),
          // Cleaning collegata
          cleaningId: o.cleaningId ?? null,
          cleaningInfo,
          // Filtri di visualizzazione
          willBeCountedByBackend: (
            o.status !== "CANCELLED" &&
            o.excludedFromBilling !== true
          ),
          // Tutti gli altri campi raw
          _rawAll: o,
        });
      }
    }

    return NextResponse.json({
      success: true,
      ownerId, ownerName: ownerData?.name || ownerData?.fullName,
      month, year,
      ordersCount: ordersAll.length,
      countedCount: ordersAll.filter(o => o.willBeCountedByBackend).length,
      orders: ordersAll,
    });
  } catch (error: any) {
    console.error("Errore inspect-orders:", error);
    return NextResponse.json({
      error: "Errore server",
      message: error.message,
    }, { status: 500 });
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
