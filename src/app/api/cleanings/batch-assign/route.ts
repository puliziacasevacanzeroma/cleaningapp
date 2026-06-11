import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { createNotificationDirect } from "~/lib/notifications/createNotification";
import { getApiUser } from "~/lib/api-auth";
import { z } from "zod";
import {
  checkPlannedAvailability,
  forceShiftOnException,
  dateKeyFromScheduled,
} from "~/lib/shifts/plannedAvailability";

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
    estimatedDuration: z.number().optional(), // ore — dall'auto-assign
  })).min(1).max(100),
  // Override turni: force=true assegna anche operatori fuori turno
  // (crea le eccezioni "ON" d'urgenza). Senza force: 409 con la lista conflitti.
  force: z.boolean().optional(),
  forceReason: z.string().trim().max(300).optional(),
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

    const { assignments, force, forceReason } = parsed.data;
    const now = Timestamp.now();
    const results: Array<{ cleaningId: string; success: boolean; error?: string }> = [];

    // ── Raggruppa per cleaningId (una pulizia può avere più operatori) ──
    const byCleaningId = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const arr = byCleaningId.get(a.cleaningId) || [];
      arr.push(a);
      byCleaningId.set(a.cleaningId, arr);
    }

    // ═══════════════════════════════════════════════════════════
    // PRE-CHECK TURNI — PRIMA di qualunque scrittura.
    // Se anche un solo operatore è fuori turno e force≠true → 409 con la
    // lista completa dei conflitti e NESSUNA assegnazione applicata
    // (mai un batch a metà). Con force=true: eccezioni "ON" create per
    // ogni (operatore, giorno) in conflitto, poi si procede normalmente.
    // ═══════════════════════════════════════════════════════════
    const cleaningSnapCache = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    const availCache = new Map<string, boolean>(); // `${operatorId}_${dateKey}`
    const shiftConflicts: Array<{
      cleaningId: string;
      userId: string;
      userName: string;
      dateKey: string;
      propertyName: string;
    }> = [];

    for (const [cleaningId, ops] of byCleaningId) {
      const snap = await adminDb.collection("cleanings").doc(cleaningId).get();
      cleaningSnapCache.set(cleaningId, snap);
      if (!snap.exists) continue; // il loop principale registrerà l'errore
      const cdata = snap.data() as Record<string, any>;
      const dateKey = dateKeyFromScheduled(cdata.scheduledDate);
      if (!dateKey) continue; // data non interpretabile: fail-open
      for (const op of ops) {
        const cacheKey = `${op.operatorId}_${dateKey}`;
        if (!availCache.has(cacheKey)) {
          const a = await checkPlannedAvailability(op.operatorId, dateKey);
          availCache.set(cacheKey, a.available);
        }
        if (!availCache.get(cacheKey)) {
          shiftConflicts.push({
            cleaningId,
            userId: op.operatorId,
            userName: op.operatorName,
            dateKey,
            propertyName: cdata.propertyName || "Proprietà",
          });
        }
      }
    }

    if (shiftConflicts.length > 0) {
      if (!force) {
        return NextResponse.json({
          error: `${shiftConflicts.length} assegnazion${shiftConflicts.length === 1 ? "e" : "i"} a operatori fuori turno`,
          code: "SHIFT_UNAVAILABLE",
          conflicts: shiftConflicts,
        }, { status: 409 });
      }
      // force=true: una sola eccezione per (operatore, giorno) anche se in conflitto su più pulizie
      const done = new Set<string>();
      for (const c of shiftConflicts) {
        const k = `${c.userId}_${c.dateKey}`;
        if (done.has(k)) continue;
        done.add(k);
        await forceShiftOnException({
          userId: c.userId,
          userName: c.userName,
          userRole: "OPERATORE_PULIZIE",
          dateKey: c.dateKey,
          createdBy: { id: user.id || "system", name: user.name || user.email || "Admin" },
          reason: forceReason,
          contextLabel: c.propertyName,
        });
      }
    }

    // ── Processa ogni pulizia ──
    for (const [cleaningId, ops] of byCleaningId) {
      try {
        const cleaningRef = adminDb.collection("cleanings").doc(cleaningId);
        const cleaningSnap = cleaningSnapCache.get(cleaningId) || await cleaningRef.get();

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

        // Se c'è estimatedDuration dall'auto-assign, salvala (in minuti per Firestore)
        if (ops[0]?.estimatedDuration && ops[0].estimatedDuration > 0) {
          // L'auto-assign manda in ore, Firestore usa minuti
          updateData.estimatedDuration = Math.round(ops[0].estimatedDuration * 60);
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
