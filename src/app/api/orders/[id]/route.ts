/**
 * DELETE /api/orders/[id]
 *
 * Elimina definitivamente un ordine biancheria. Diversamente da `/cancel`,
 * questo endpoint:
 *   - permette la cancellazione anche di ordini DELIVERED/COMPLETED (admin only)
 *   - permette la cancellazione anche di ordini con cleaningId (linked)
 *
 * Caso d'uso: admin che vuole eliminare un servizio dalla pagina Pagamenti
 * per casi di errore inserimento, contestazione, ecc.
 *
 * Se l'ordine è di un mese GIÀ PAGATO, genera automaticamente un credito
 * (acconto) sul mese successivo.
 *
 * AUTH: solo ADMIN.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";
import { transferCreditToNextMonth, checkIfServiceMonthIsPaid } from "~/lib/payments/creditTransfer";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    if (user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Solo l'admin può eliminare ordini" }, { status: 403 });
    }

    const { id } = await params;
    const ref = adminDb.collection("orders").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
    }
    const orderData = snap.data() as Record<string, any>;

    // ─── CREDITO AUTOMATICO SE MESE GIÀ PAGATO ───
    let creditTransferResult: any = null;
    try {
      const propertyId = orderData.propertyId;
      // Per ordini, usa deliveredAt se presente, altrimenti scheduledDate
      const refDate = orderData.deliveredAt || orderData.scheduledDate;

      if (propertyId && refDate) {
        const paidCheck = await checkIfServiceMonthIsPaid({ propertyId, scheduledDate: refDate });

        if (paidCheck.isPaid && paidCheck.ownerId) {
          // Calcola prezzo effettivo dell'ordine
          // - se totalPriceOverride: usalo
          // - altrimenti: somma items + deliveryFee (se enabled) + bedMakingFee (se bedMaking)
          let orderEffectivePrice = 0;
          if (orderData.totalPriceOverride !== undefined && orderData.totalPriceOverride !== null) {
            orderEffectivePrice = orderData.totalPriceOverride;
          } else {
            // Items: usa item.totalPrice (già calcolato) o unitPrice * quantity
            if (Array.isArray(orderData.items)) {
              for (const item of orderData.items) {
                const itemTotal = item.totalPrice ?? ((item.unitPrice ?? item.price ?? 0) * (item.quantity ?? 1));
                orderEffectivePrice += itemTotal;
              }
            }
            // Delivery fee
            if (orderData.deliveryFee && orderData.deliveryFeeEnabled !== false) {
              orderEffectivePrice += orderData.deliveryFee;
            }
            // Bed making
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
              actionType: "DELETED",
              adminId: user.id,
              adminName: user.name || user.email,
            });

            if (process.env.NODE_ENV !== "production") {
              console.log("💰 Credito trasferito (order):", creditTransferResult);
            }
          }
        }
      }
    } catch (creditErr) {
      console.error("Errore trasferimento credito (eliminazione order non bloccata):", creditErr);
    }

    await ref.delete();

    return NextResponse.json({
      success: true,
      creditTransfer: creditTransferResult,
      message: "Ordine eliminato definitivamente",
    });
  } catch (err: any) {
    console.error("[orders/DELETE] errore:", err);
    return NextResponse.json({
      error: err?.message || "Errore interno",
    }, { status: 500 });
  }
}
