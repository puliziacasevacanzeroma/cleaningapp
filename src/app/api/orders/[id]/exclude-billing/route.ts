/**
 * PATCH /api/orders/[id]/exclude-billing
 *
 * Esclude (o riinclude) un ordine biancheria dal calcolo dei pagamenti,
 * senza eliminarlo dal sistema. L'ordine rimane visibile nel modulo
 * lavanderia, storico rider, ecc., ma il suo importo non viene
 * conteggiato nei pagamenti dovuti dal cliente.
 *
 * BODY:
 *   { excluded: true,  reason: "Articolo arrivato danneggiato" }
 *   { excluded: false }
 *
 * AUTH: solo ADMIN.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { transferCreditToNextMonth, checkIfServiceMonthIsPaid } from "~/lib/payments/creditTransfer";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    if (user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Solo l'admin può escludere ordini dal billing" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    const excluded = body.excluded === true;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (excluded && !reason) {
      return NextResponse.json({
        error: "La motivazione è obbligatoria quando escludi un ordine dal billing"
      }, { status: 400 });
    }

    const ref = adminDb.collection("orders").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
    }
    const orderData = snap.data() as Record<string, any>;

    const now = Timestamp.now();
    const historyEntry = {
      action: excluded ? "EXCLUDE" : "INCLUDE",
      reason: reason || null,
      by: user.id,
      byName: user.name || user.email,
      at: now,
    };

    const updates: Record<string, unknown> = {
      excludedFromBilling: excluded,
      excludedFromBillingHistory: FieldValue.arrayUnion(historyEntry),
      updatedAt: now,
    };

    if (excluded) {
      updates.excludedFromBillingReason = reason;
      updates.excludedFromBillingBy = user.id;
      updates.excludedFromBillingByName = user.name || user.email;
      updates.excludedFromBillingAt = now;
    } else {
      updates.excludedFromBillingReason = FieldValue.delete();
      updates.excludedFromBillingBy = FieldValue.delete();
      updates.excludedFromBillingByName = FieldValue.delete();
      updates.excludedFromBillingAt = FieldValue.delete();
    }

    await ref.update(updates);

    // ─── CREDITO AUTOMATICO SE ESCLUSIONE IN MESE PAGATO ───
    let creditTransferResult: any = null;
    if (excluded) {
      try {
        const propertyId = orderData.propertyId;
        const refDate = orderData.deliveredAt || orderData.scheduledDate;

        if (propertyId && refDate) {
          const paidCheck = await checkIfServiceMonthIsPaid({ propertyId, scheduledDate: refDate });

          if (paidCheck.isPaid && paidCheck.ownerId) {
            // Calcola prezzo effettivo ordine (stessa logica di DELETE)
            let orderEffectivePrice = 0;
            if (orderData.totalPriceOverride !== undefined && orderData.totalPriceOverride !== null) {
              orderEffectivePrice = orderData.totalPriceOverride;
            } else {
              if (Array.isArray(orderData.items)) {
                for (const item of orderData.items) {
                  const itemTotal = item.totalPrice ?? ((item.unitPrice ?? item.price ?? 0) * (item.quantity ?? 1));
                  orderEffectivePrice += itemTotal;
                }
              }
              if (orderData.deliveryFee && orderData.deliveryFeeEnabled !== false) {
                orderEffectivePrice += orderData.deliveryFee;
              }
              if (orderData.bedMaking && orderData.bedMakingFee) {
                orderEffectivePrice += orderData.bedMakingFee;
              }
            }

            if (orderEffectivePrice > 0.01) {
              creditTransferResult = await transferCreditToNextMonth({
                ownerId: paidCheck.ownerId,
                ownerName: paidCheck.ownerName || "Proprietario",
                sourceMonth: paidCheck.month,
                sourceYear: paidCheck.year,
                creditAmount: orderEffectivePrice,
                sourceServiceType: "ORDINE",
                sourceServiceId: id,
                actionType: "EXCLUDED",
                adminId: user.id,
                adminName: user.name || user.email,
              });
            }
          }
        }
      } catch (creditErr) {
        console.error("Errore trasferimento credito (esclusione order non bloccata):", creditErr);
      }
    }

    return NextResponse.json({
      success: true,
      excluded,
      creditTransfer: creditTransferResult,
      message: excluded
        ? "Ordine escluso dai pagamenti. L'ordine resta visibile nello storico."
        : "Ordine riincluso nei pagamenti.",
    });
  } catch (err: any) {
    console.error("[orders/exclude-billing] errore:", err);
    return NextResponse.json({
      error: err?.message || "Errore interno",
    }, { status: 500 });
  }
}
