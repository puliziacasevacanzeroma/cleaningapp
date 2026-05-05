/**
 * PATCH /api/cleanings/[id]/exclude-billing
 *
 * Esclude (o riinclude) una pulizia dal calcolo dei pagamenti, senza
 * eliminarla dal sistema. La pulizia rimane visibile in calendario,
 * report operativi, storico operatori, ecc., ma il suo importo non
 * viene conteggiato nei pagamenti dovuti dal cliente.
 *
 * Caso d'uso tipico: contestazioni del cliente, sconto di cortesia.
 *
 * BODY:
 *   { excluded: true,  reason: "Sconto cortesia per allagamento" }
 *   { excluded: false }   // riinclude
 *
 * AUTH: solo ADMIN.
 *
 * Aggiorna anche `audit log` (campo `excludedFromBillingHistory`) per
 * tracciabilità delle modifiche nel tempo.
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
      return NextResponse.json({ error: "Solo l'admin può escludere servizi dal billing" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    const excluded = body.excluded === true;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (excluded && !reason) {
      return NextResponse.json({
        error: "La motivazione è obbligatoria quando escludi un servizio dal billing"
      }, { status: 400 });
    }

    const ref = adminDb.collection("cleanings").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }
    const cleaningData = snap.data() as Record<string, any>;

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
    // Solo per AZIONE excluded=true (non per riinclusione)
    let creditTransferResult: any = null;
    if (excluded) {
      try {
        const propertyId = cleaningData.propertyId;
        const scheduledDate = cleaningData.scheduledDate;
        const paidCheck = await checkIfServiceMonthIsPaid({ propertyId, scheduledDate });

        if (paidCheck.isPaid && paidCheck.ownerId) {
          const cleaningEffectivePrice =
            (cleaningData.priceOverride ?? cleaningData.price ?? paidCheck.propertyData?.cleaningPrice ?? 0) +
            (cleaningData.holidayFee ?? 0);

          if (cleaningEffectivePrice > 0.01) {
            creditTransferResult = await transferCreditToNextMonth({
              ownerId: paidCheck.ownerId,
              ownerName: paidCheck.ownerName || "Proprietario",
              sourceMonth: paidCheck.month,
              sourceYear: paidCheck.year,
              creditAmount: cleaningEffectivePrice,
              sourceServiceType: "PULIZIA",
              sourceServiceId: id,
              actionType: "EXCLUDED",
              adminId: user.id,
              adminName: user.name || user.email,
            });
          }
        }
      } catch (creditErr) {
        console.error("Errore trasferimento credito (esclusione non bloccata):", creditErr);
      }
    }

    return NextResponse.json({
      success: true,
      excluded,
      creditTransfer: creditTransferResult,
      message: excluded
        ? "Pulizia esclusa dai pagamenti. La pulizia resta visibile nel calendario."
        : "Pulizia riinclusa nei pagamenti.",
    });
  } catch (err: any) {
    console.error("[cleanings/exclude-billing] errore:", err);
    return NextResponse.json({
      error: err?.message || "Errore interno",
    }, { status: 500 });
  }
}
