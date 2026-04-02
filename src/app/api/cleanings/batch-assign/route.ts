import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { createNotificationDirect } from "~/lib/notifications/createNotification";
import { getApiUser } from "~/lib/api-auth";
import { z } from "zod";

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════

const BatchAssignSchema = z.object({
  assignments: z.array(z.object({
    cleaningId: z.string().min(1),
    operatorId: z.string().min(1),
    operatorName: z.string().min(1),
    scheduledTime: z.string().optional(),
  })).min(1).max(100),
});

// ═══════════════════════════════════════════════════════════════
// POST - Conferma batch di assegnazioni (da modalità bozza)
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin può confermare assegnazioni" }, { status: 403 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "Body JSON malformato" }, { status: 400 });
    }

    const parsed = BatchAssignSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({
        error: "Dati non validi",
        details: parsed.error.flatten().fieldErrors,
      }, { status: 400 });
    }

    const { assignments } = parsed.data;
    const now = Timestamp.now();
    const results: Array<{ cleaningId: string; success: boolean; error?: string }> = [];

    // ── Raggruppa per cleaningId (una pulizia può avere più operatori) ──
    const byCleaningId = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const arr = byCleaningId.get(a.cleaningId) || [];
      arr.push(a);
      byCleaningId.set(a.cleaningId, arr);
    }

    // ── Processa ogni pulizia ──
    for (const [cleaningId, ops] of byCleaningId) {
      try {
        const cleaningRef = adminDb.collection("cleanings").doc(cleaningId);
        const cleaningSnap = await cleaningRef.get();

        if (!cleaningSnap.exists) {
          results.push({ cleaningId, success: false, error: "Pulizia non trovata" });
          continue;
        }

        const cleaning = cleaningSnap.data()!;

        // Non assegnare pulizie in corso o completate
        if (cleaning.status === "IN_PROGRESS" || cleaning.status === "COMPLETED") {
          results.push({ cleaningId, success: false, error: "Pulizia già in corso/completata" });
          continue;
        }

        // Costruisci array operatori — i nuovi SOSTITUISCONO i vecchi
        // perché la bozza rappresenta la pianificazione FINALE
        const newOperators = ops.map(o => ({ id: o.operatorId, name: o.operatorName }));

        // Prepara update data
        const updateData: Record<string, any> = {
          operators: newOperators,
          operatorId: newOperators[0]?.id || "",
          operatorName: newOperators[0]?.name || "",
          status: "ASSIGNED",
          assignedBy: user.id,
          assignedAt: now,
          updatedAt: now,
        };

        // Se c'è un nuovo scheduledTime, aggiornalo
        if (ops[0]?.scheduledTime) {
          updateData.scheduledTime = ops[0].scheduledTime;
        }

        await cleaningRef.update(updateData);

        // ── Notifiche per ogni operatore ──
        for (const op of ops) {
          try {
            let dateStr = "data da definire";
            if (cleaning.scheduledDate?.toDate) {
              dateStr = cleaning.scheduledDate.toDate().toLocaleDateString("it-IT", {
                weekday: "long",
                day: "numeric",
                month: "long",
              });
            }

            await createNotificationDirect({
              type: "CLEANING_ASSIGNED",
              recipientRole: "OPERATORE_PULIZIE",
              recipientId: op.operatorId,
              senderId: user.id || "system",
              senderName: user.name || user.email || "Admin",
              customTitle: "🧹 Nuova pulizia assegnata",
              customMessage: `Ti è stata assegnata la pulizia di "${cleaning.propertyName || 'Proprietà'}" per ${dateStr}`,
              relatedEntityId: cleaningId,
              relatedEntityType: "CLEANING",
              relatedEntityName: cleaning.propertyName || "",
              link: `/operatore/pulizie/${cleaningId}`,
              sendPush: true,
            });
          } catch (notifError) {
            console.error(`Errore notifica per operatore ${op.operatorId}:`, notifError);
          }
        }

        results.push({ cleaningId, success: true });
      } catch (err) {
        console.error(`Errore per pulizia ${cleaningId}:`, err);
        results.push({ cleaningId, success: false, error: "Errore interno" });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: failCount === 0,
      message: `${successCount} pulizie assegnate${failCount > 0 ? `, ${failCount} errori` : ""}`,
      results,
      successCount,
      failCount,
    });
  } catch (error) {
    console.error("❌ Errore batch-assign:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
