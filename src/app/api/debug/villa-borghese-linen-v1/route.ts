/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Diagnostica biancheria per una proprietà specifica
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/villa-borghese-linen-v1?cronSecret=XXX
 *
 * Analizza il caso "biancheria consegnata sbagliata" per Villa Borghese
 * (o qualsiasi altra proprietà via ?propertyName=...).
 *
 * Fa il confronto tra:
 *  - Ciò che la proprietà ha in property.linenConfig (vecchio formato flat)
 *  - Ciò che la proprietà ha in property.serviceConfigs[guestsCount] (formato nuovo)
 *  - Ciò che è effettivamente nell'ordine (orders.items)
 *  - Ciò che AVREBBE DOVUTO esserci secondo serviceConfigs[guestsCount]
 *
 * READ-ONLY: nessuna scrittura su Firestore.
 *
 * Query params:
 *   cronSecret      (obbligatorio se settato CRON_SECRET)
 *   propertyName    (default: "Villa Borghese")
 *   propertyId      (alternativo a propertyName)
 *   date            (data pulizia in formato YYYY-MM-DD; default: oggi)
 *
 * Output: JSON con
 *  - property: id, name, hasLinenConfig, linenConfig, hasServiceConfigs, serviceConfigsKeys, autoGenerateLaundry, usesOwnLinen
 *  - cleanings: lista pulizie del giorno per quella proprietà
 *  - orders: lista ordini collegati alla pulizia
 *  - diagnosis: per ogni cleaning + order trovato, il confronto
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("cronSecret") || searchParams.get("secret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const propertyName = searchParams.get("propertyName") || "Villa Borghese";
  const propertyId = searchParams.get("propertyId") || null;
  const dateParam = searchParams.get("date"); // YYYY-MM-DD

  try {
    // ─── 1. Trova proprietà ───
    let propertyDocs: Array<{ id: string; data: any }> = [];
    if (propertyId) {
      const single = await adminDb.collection("properties").doc(propertyId).get();
      if (single.exists) {
        propertyDocs.push({ id: single.id, data: single.data() });
      }
    } else {
      const snap = await adminDb.collection("properties").get();
      const lower = propertyName.toLowerCase();
      propertyDocs = snap.docs
        .filter((d) => {
          const name = ((d.data() as any).name || "").toLowerCase();
          return name.includes(lower);
        })
        .map((d) => ({ id: d.id, data: d.data() }));
    }

    if (propertyDocs.length === 0) {
      return NextResponse.json({
        error: "Proprietà non trovata",
        query: { propertyName, propertyId },
      }, { status: 404 });
    }

    // Range data: tutto il giorno richiesto (o oggi)
    let refDate: Date;
    if (dateParam) {
      const [yy, mm, dd] = dateParam.split("-").map(Number);
      refDate = new Date(yy, (mm || 1) - 1, dd || 1, 0, 0, 0, 0);
    } else {
      refDate = new Date();
      refDate.setHours(0, 0, 0, 0);
    }
    const endOfDay = new Date(refDate);
    endOfDay.setHours(23, 59, 59, 999);
    const startTs = Timestamp.fromDate(refDate);
    const endTs = Timestamp.fromDate(endOfDay);

    // ─── 2. Per ogni proprietà matched, fai diagnosi ───
    const results: any[] = [];

    for (const { id: propId, data: propData } of propertyDocs) {
      const result: any = {
        property: {
          id: propId,
          name: propData.name,
          maxGuests: propData.maxGuests,
          bedrooms: propData.bedrooms,
          bathrooms: propData.bathrooms,
          autoGenerateLaundry: propData.autoGenerateLaundry,
          usesOwnLinen: propData.usesOwnLinen,
          // ⚠️ Cuore della diagnosi: questi due campi devono essere mutuamente esclusivi
          hasLinenConfig: Array.isArray(propData.linenConfig) && propData.linenConfig.length > 0,
          linenConfig: propData.linenConfig || null,
          hasServiceConfigs:
            propData.serviceConfigs &&
            typeof propData.serviceConfigs === "object" &&
            Object.keys(propData.serviceConfigs).length > 0,
          serviceConfigsKeys: propData.serviceConfigs
            ? Object.keys(propData.serviceConfigs)
            : [],
          serviceConfigs: propData.serviceConfigs || null,
        },
        cleaningsOnDate: [],
      };

      // Trova pulizie del giorno per questa proprietà
      const cleaningsSnap = await adminDb
        .collection("cleanings")
        .where("propertyId", "==", propId)
        .where("scheduledDate", ">=", startTs)
        .where("scheduledDate", "<=", endTs)
        .get();

      for (const cDoc of cleaningsSnap.docs) {
        const c = cDoc.data() as any;
        const cleaningEntry: any = {
          id: cDoc.id,
          status: c.status,
          guestsCount: c.guestsCount,
          maxGuestsAtTime: c.maxGuestsAtTime,
          autoGenerateLaundry: c.autoGenerateLaundry,
          requiresLaundry: c.requiresLaundry,
          laundryOrderId: c.laundryOrderId || null,
          linenConfigModified: c.linenConfigModified,
          startedAt: c.startedAt ? (c.startedAt.toDate?.() || c.startedAt) : null,
          completedAt: c.completedAt ? (c.completedAt.toDate?.() || c.completedAt) : null,
          createdAt: c.createdAt ? (c.createdAt.toDate?.() || c.createdAt) : null,
          createdBy: c.createdBy,
          source: c.source, // iCal / manual / ecc.
        };

        // Trova l'ordine collegato
        const linkedOrders: any[] = [];

        // Via laundryOrderId esplicito
        if (c.laundryOrderId) {
          const orderDoc = await adminDb.collection("orders").doc(c.laundryOrderId).get();
          if (orderDoc.exists) {
            linkedOrders.push({
              source: "via_laundryOrderId",
              id: orderDoc.id,
              ...(orderDoc.data() as any),
            });
          } else {
            linkedOrders.push({
              source: "via_laundryOrderId",
              id: c.laundryOrderId,
              error: "DOC_NOT_FOUND",
            });
          }
        }

        // Via where(cleaningId == id) — trova anche eventuali ordini orfani
        const ordersByCleaningSnap = await adminDb
          .collection("orders")
          .where("cleaningId", "==", cDoc.id)
          .get();
        for (const oDoc of ordersByCleaningSnap.docs) {
          // Evita duplicati
          if (linkedOrders.some((lo) => lo.id === oDoc.id)) continue;
          linkedOrders.push({
            source: "via_cleaningId",
            id: oDoc.id,
            ...(oDoc.data() as any),
          });
        }

        // Per ogni ordine, sintetizza
        cleaningEntry.linkedOrders = linkedOrders.map((o) => ({
          source: o.source,
          id: o.id,
          status: o.status,
          type: o.type,
          autoGenerated: o.autoGenerated,
          createdAt: o.createdAt ? (o.createdAt.toDate?.() || o.createdAt) : null,
          updatedAt: o.updatedAt ? (o.updatedAt.toDate?.() || o.updatedAt) : null,
          itemsCount: Array.isArray(o.items) ? o.items.length : 0,
          items: o.items || [],
          linenItems: o.linenItems || null,
          totalLinenQuantity: Array.isArray(o.items)
            ? o.items
                .filter((it: any) => it.type === "linen" || (!it.type && it.id !== "_delivery_fee" && it.id !== "_bed_making_fee"))
                .reduce((sum: number, it: any) => sum + (it.quantity || 0), 0)
            : 0,
          error: o.error,
        }));

        // Calcolo "cosa AVREBBE DOVUTO essere consegnato"
        const guestsCount = c.guestsCount || propData.maxGuests || 2;
        let expectedFromServiceConfigs: any = null;
        let expectedFromLinenConfig: any = null;

        if (propData.serviceConfigs) {
          const cfg =
            propData.serviceConfigs[guestsCount] ||
            propData.serviceConfigs[String(guestsCount)];
          if (cfg) {
            const expected: Record<string, number> = {};
            // Replica logica di sync-ical:65 e manual:415
            if (cfg.bl) {
              const blKeys = Object.keys(cfg.bl);
              const hasAll =
                cfg.bl["all"] &&
                typeof cfg.bl["all"] === "object" &&
                Object.keys(cfg.bl["all"]).length > 0;
              const bedGroupKeys = blKeys.filter((k) => k !== "all");
              const hasBedGroups =
                bedGroupKeys.length > 0 &&
                bedGroupKeys.some((k: string) => {
                  const items = cfg.bl[k];
                  return items && typeof items === "object" && Object.keys(items).length > 0;
                });
              if (hasAll && hasBedGroups) {
                bedGroupKeys.forEach((k: string) => {
                  const items = cfg.bl[k];
                  if (items && typeof items === "object") {
                    Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
                      if (typeof qty === "number" && qty > 0) {
                        expected[itemId] = (expected[itemId] || 0) + qty;
                      }
                    });
                  }
                });
                Object.entries(cfg.bl["all"]).forEach(([itemId, qty]: [string, any]) => {
                  if (typeof qty === "number" && qty > 0) {
                    expected[itemId] = qty; // override
                  }
                });
              } else if (hasAll) {
                Object.entries(cfg.bl["all"]).forEach(([itemId, qty]: [string, any]) => {
                  if (typeof qty === "number" && qty > 0) expected[itemId] = qty;
                });
              } else {
                Object.entries(cfg.bl).forEach(([bedId, items]: [string, any]) => {
                  if (bedId === "all") return;
                  if (items && typeof items === "object") {
                    Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
                      if (typeof qty === "number" && qty > 0) {
                        expected[itemId] = (expected[itemId] || 0) + qty;
                      }
                    });
                  }
                });
              }
            }
            if (cfg.ba) {
              Object.entries(cfg.ba).forEach(([itemId, qty]: [string, any]) => {
                if (typeof qty === "number" && qty > 0) {
                  expected[itemId] = (expected[itemId] || 0) + qty;
                }
              });
            }
            if (cfg.ki) {
              Object.entries(cfg.ki).forEach(([itemId, qty]: [string, any]) => {
                if (typeof qty === "number" && qty > 0) {
                  expected[itemId] = (expected[itemId] || 0) + qty;
                }
              });
            }
            expectedFromServiceConfigs = {
              guestsCount,
              configKeyUsed: propData.serviceConfigs[guestsCount]
                ? guestsCount
                : String(guestsCount),
              expectedItems: expected,
              totalQuantity: Object.values(expected).reduce((s, q) => s + q, 0),
            };
          } else {
            expectedFromServiceConfigs = {
              guestsCount,
              error: `Nessuna config in serviceConfigs per ${guestsCount} ospiti. Chiavi disponibili: ${Object.keys(
                propData.serviceConfigs,
              ).join(", ")}`,
            };
          }
        }

        if (Array.isArray(propData.linenConfig) && propData.linenConfig.length > 0) {
          const expected: Record<string, number> = {};
          propData.linenConfig.forEach((item: any) => {
            const k = item.itemId || item.id;
            if (k && typeof item.quantity === "number") {
              expected[k] = (expected[k] || 0) + item.quantity;
            }
          });
          expectedFromLinenConfig = {
            note: "linenConfig è il vecchio formato FISSO — quantità non scala col numero ospiti",
            expectedItems: expected,
            totalQuantity: Object.values(expected).reduce((s, q) => s + q, 0),
          };
        }

        cleaningEntry.expectedFromServiceConfigs = expectedFromServiceConfigs;
        cleaningEntry.expectedFromLinenConfig = expectedFromLinenConfig;

        // Se l'ordine ha items, fai il confronto numerico
        if (linkedOrders.length > 0) {
          const realOrder = linkedOrders.find((o) => !o.error) || linkedOrders[0];
          if (realOrder && Array.isArray(realOrder.items)) {
            const actualItems: Record<string, number> = {};
            realOrder.items.forEach((it: any) => {
              const k = it.itemId || it.id;
              if (k && typeof it.quantity === "number") {
                actualItems[k] = (actualItems[k] || 0) + it.quantity;
              }
            });
            cleaningEntry.comparison = {
              actualItems,
              actualTotalQuantity: Object.values(actualItems).reduce((s, q) => s + q, 0),
              matchesServiceConfigs: expectedFromServiceConfigs
                ? deepEqualMaps(
                    actualItems,
                    expectedFromServiceConfigs.expectedItems || {},
                  )
                : null,
              matchesLinenConfig: expectedFromLinenConfig
                ? deepEqualMaps(actualItems, expectedFromLinenConfig.expectedItems || {})
                : null,
            };
          }
        }

        result.cleaningsOnDate.push(cleaningEntry);
      }

      results.push(result);
    }

    // ─── 3. Conclusione ───
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      query: { propertyName, propertyId, date: dateParam || "today" },
      _legend: {
        hasLinenConfig:
          "Se true, esiste vecchio formato FISSO che non scala con ospiti — è la causa principale del bug 'biancheria per 1 invece di 3'",
        hasServiceConfigs:
          "Se true, esiste formato NUOVO scalato per numero ospiti",
        matchesServiceConfigs:
          "Se true, l'ordine attuale è coerente con la config nuova (corretta). Se false, è incoerente.",
        matchesLinenConfig:
          "Se true, l'ordine attuale è stato generato dal vecchio linenConfig (= bug attivo).",
      },
      results,
    });
  } catch (error: any) {
    console.error("Errore villa-borghese-linen-v1:", error);
    return NextResponse.json(
      {
        error: "Errore server",
        message: error?.message,
        stack: error?.stack?.split("\n").slice(0, 5).join("\n"),
      },
      { status: 500 },
    );
  }
}

// ─── Helpers ───
function deepEqualMaps(a: Record<string, number>, b: Record<string, number>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > 0.0001) return false;
  }
  return true;
}
