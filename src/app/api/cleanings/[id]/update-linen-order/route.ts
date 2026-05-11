import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getItemName } from "~/lib/itemNames";
import { getApiUser } from "~/lib/api-auth";
import { auditLog } from "~/lib/services/auditService";


export const dynamic = 'force-dynamic';

/**
 * POST /api/cleanings/[id]/update-linen-order
 * 
 * Aggiorna l'ordine biancheria PENDING collegato a questa specifica pulizia.
 * Ricalcola gli items in base a:
 * - customLinenConfig della pulizia (se linenConfigModified === true)
 * - serviceConfigs della proprietà (altrimenti)
 *
 * 🔍 FORENSIC AUDIT: ogni chiamata viene tracciata in auditLog
 * (action=LINEN_ORDER_RECALCULATED) con snapshot completo della pulizia
 * al momento del ricalcolo, identità del chiamante, items before/after e
 * marker "suspicious" se il guestsCount è anomalo rispetto a property.maxGuests.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  // ─────────────────────────────────────────────────────

    const { id: cleaningId } = await params;

    // 🔍 Caller info per audit trap
    const callerUserAgent = request.headers.get("user-agent") || null;
    const callerIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null;

    // 1. Carica la pulizia
    const cleaningDoc = await adminDb.collection("cleanings").doc(cleaningId).get();
    if (!cleaningDoc.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }
    
    const cleaningData = cleaningDoc.data() as Record<string, any>;
    const propertyId = cleaningData.propertyId;
    const guestsCount = cleaningData.guestsCount || 2;
    const hasCustomConfig = cleaningData.linenConfigModified === true && cleaningData.customLinenConfig;
    
    if (process.env.NODE_ENV !== "production") console.log(`   Proprietà: ${propertyId}, Ospiti: ${guestsCount}, Custom: ${hasCustomConfig}`);
    
    // 2. Trova l'ordine PENDING collegato a questa pulizia
    const ordersQuery = adminDb.collection("orders").where("cleaningId", "==", cleaningId).where("status", "==", "PENDING");
    
    const ordersSnapshot = await ordersQuery.get();
    
    if (ordersSnapshot.empty) {
      if (process.env.NODE_ENV !== "production") console.log(`   ⚠️ Nessun ordine PENDING trovato per questa pulizia`);
      return NextResponse.json({ 
        success: true, 
        updated: 0, 
        message: "Nessun ordine PENDING trovato" 
      });
    }

    // 🔍 Carico la proprietà SEMPRE (anche se uso customLinenConfig) per audit
    // Serve a confrontare guestsCount con property.maxGuests
    const propertyDocForAudit = await adminDb.collection("properties").doc(propertyId).get();
    const propertyDataForAudit = propertyDocForAudit.exists
      ? (propertyDocForAudit.data() as Record<string, any>)
      : null;
    const propertyName = propertyDataForAudit?.name || "(unknown)";
    const propertyMaxGuests = (propertyDataForAudit?.maxGuests as number) ?? null;

    // 3. Determina la fonte degli items
    let config: any = null;
    let configSource = "";
    
    if (hasCustomConfig) {
      // Usa la configurazione personalizzata della pulizia
      config = cleaningData.customLinenConfig;
      configSource = "customLinenConfig";
      if (process.env.NODE_ENV !== "production") console.log(`   📦 Usando customLinenConfig della pulizia`);
    } else {
      // Usa serviceConfigs della proprietà (già caricata sopra per audit)
      if (!propertyDataForAudit) {
        return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
      }

      const serviceConfigs = propertyDataForAudit.serviceConfigs;
      
      if (!serviceConfigs) {
        if (process.env.NODE_ENV !== "production") console.log(`   ⚠️ Nessuna serviceConfigs nella proprietà`);
        return NextResponse.json({ 
          success: true, 
          updated: 0, 
          message: "Nessuna configurazione nella proprietà" 
        });
      }
      
      // Cerca la config per questo numero di ospiti (numero o stringa)
      config = serviceConfigs[guestsCount] || serviceConfigs[String(guestsCount)];
      configSource = `serviceConfigs[${guestsCount}]`;
      
      if (!config) {
        if (process.env.NODE_ENV !== "production") console.log(`   ⚠️ Nessuna config per ${guestsCount} ospiti`);
        return NextResponse.json({ 
          success: true, 
          updated: 0, 
          message: `Nessuna configurazione per ${guestsCount} ospiti` 
        });
      }
      
      if (process.env.NODE_ENV !== "production") console.log(`   📦 Usando ${configSource} dalla proprietà`);
    }
    
    // 4. Calcola i nuovi items
    const newItems: { id: string; name: string; quantity: number }[] = [];
    
    // Biancheria Letto (bl) - usa 'all' come fonte di verità
    if (config.bl) {
      if (config.bl['all']) {
        // Usa direttamente 'all'
        Object.entries(config.bl['all']).forEach(([itemId, qty]) => {
          if (typeof qty === 'number' && qty > 0) {
            newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
          }
        });
      } else {
        // Somma da tutti i gruppi letto
        Object.entries(config.bl).forEach(([bedId, items]) => {
          if (typeof items === 'object' && items !== null) {
            Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
              if (typeof qty === 'number' && qty > 0) {
                const existing = newItems.find(i => i.id === itemId);
                if (existing) {
                  existing.quantity += qty;
                } else {
                  newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                }
              }
            });
          }
        });
      }
    }
    
    // Biancheria Bagno (ba)
    if (config.ba) {
      Object.entries(config.ba).forEach(([itemId, qty]) => {
        if (typeof qty === 'number' && qty > 0) {
          newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
        }
      });
    }
    
    // Kit Cortesia (ki)
    if (config.ki) {
      Object.entries(config.ki).forEach(([itemId, qty]) => {
        if (typeof qty === 'number' && qty > 0) {
          newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
        }
      });
    }
    
    if (process.env.NODE_ENV !== "production") console.log(`   📋 Calcolati ${newItems.length} items:`, newItems.map(i => `${i.name}:${i.quantity}`).join(', '));
    
    // 5. Aggiorna tutti gli ordini trovati (dovrebbe essere 1)
    let updated = 0;
    for (const orderDoc of ordersSnapshot.docs) {
      // 🔍 Snapshot items PRIMA dell'update (per diff in audit)
      const orderDataBefore = orderDoc.data() as Record<string, any>;
      const itemsBefore: Array<{ id: string; quantity: number }> = Array.isArray(orderDataBefore.items)
        ? orderDataBefore.items.map((it: any) => ({ id: String(it.id), quantity: Number(it.quantity) || 0 }))
        : [];

      await adminDb.collection("orders").doc(orderDoc.id).update({
        items: newItems,
        updatedAt: Timestamp.now(),
        itemsUpdatedFromConfig: true,
        configSource: configSource,
      });
      if (process.env.NODE_ENV !== "production") console.log(`   ✅ Ordine ${orderDoc.id} aggiornato`);
      updated++;

      // 🔍 FORENSIC AUDIT — fire-and-forget, mai blocca la response
      try {
        const suspiciousReasons: string[] = [];
        // Heuristics: il bug Villa Borghese ha guestsCount=1 (anomalo) e
        // poco prima/dopo la pulizia ha avuto guestsCount=4 (maxGuests).
        if (typeof propertyMaxGuests === "number" && guestsCount < propertyMaxGuests) {
          suspiciousReasons.push(
            `guestsCount=${guestsCount} < property.maxGuests=${propertyMaxGuests}`
          );
        }
        if (guestsCount === 1) {
          suspiciousReasons.push("guestsCount=1 (estremamente basso, valore tipico del bug)");
        }
        if (cleaningData.guestsAppliedBySystem === true && guestsCount === 1) {
          suspiciousReasons.push("guestsAppliedBySystem=true ma guestsCount=1 (incoerente: il cron applica maxGuests)");
        }
        // Differenza forte di "lenzuola_matrimoniale" prima/dopo è un altro sintomo
        const beforeMat = itemsBefore.find((i) => i.id === "lenzuola_matrimoniale")?.quantity ?? 0;
        const afterMat = newItems.find((i) => i.id === "lenzuola_matrimoniale")?.quantity ?? 0;
        if (beforeMat > 0 && afterMat > 0 && beforeMat - afterMat >= 2) {
          suspiciousReasons.push(
            `downsize lenzuola_matrimoniale: ${beforeMat} → ${afterMat}`
          );
        }

        await auditLog.linenOrderRecalculated({
          cleaningId,
          orderId: orderDoc.id,
          propertyId,
          propertyName,
          cleaningGuestsCount: guestsCount,
          cleaningAdulti: typeof cleaningData.adulti === "number" ? cleaningData.adulti : null,
          cleaningNeonati: typeof cleaningData.neonati === "number" ? cleaningData.neonati : null,
          cleaningGuestsConfirmed:
            typeof cleaningData.guestsConfirmed === "boolean" ? cleaningData.guestsConfirmed : null,
          cleaningGuestsAppliedBySystem:
            typeof cleaningData.guestsAppliedBySystem === "boolean"
              ? cleaningData.guestsAppliedBySystem
              : null,
          cleaningLinenConfigModified:
            typeof cleaningData.linenConfigModified === "boolean"
              ? cleaningData.linenConfigModified
              : null,
          propertyMaxGuests,
          configSource,
          itemsCountBefore: itemsBefore.length,
          itemsCountAfter: newItems.length,
          itemsBefore,
          itemsAfter: newItems.map((it) => ({ id: it.id, quantity: it.quantity })),
          callerUserId: _user.id || null,
          callerUserEmail: _user.email || null,
          callerUserRole: _user.role || null,
          callerUserAgent,
          callerIp,
          isSuspicious: suspiciousReasons.length > 0,
          suspiciousReasons,
        });
      } catch (auditErr) {
        // L'audit non deve mai rompere il flow principale
        console.error("[UpdateLinenOrder] Audit write failed:", auditErr);
      }
    }
    
    return NextResponse.json({
      success: true,
      updated,
      items: newItems.length,
      configSource,
      message: `Aggiornato ordine con ${newItems.length} items da ${configSource}`
    });
    
  } catch (error) {
    console.error("❌ [UpdateLinenOrder] Errore:", error);
    return NextResponse.json(
      { error: "Errore server", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
