import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";
import { createNotification } from "~/lib/firebase/notifications-admin";
import {
  sanitizeSchedule,
  isValidDateKey,
  exceptionDocId,
} from "~/lib/shifts/availability";
import { EXCEPTIONS_COLLECTION } from "~/lib/shifts/plannedAvailability";

export const dynamic = "force-dynamic";

/**
 * API Turni Pianificati (pianificazione settimanale, NON timbrature).
 *
 * Le timbrature live restano su /api/shifts (workSessions/activeShifts).
 * Qui si gestisce CHI DOVREBBE lavorare in quali giorni:
 *   - template ricorrente: `users/{id}.workSchedule` { mon..sun: boolean }
 *   - eccezioni puntuali: collection `shiftExceptions`, doc ID `${userId}_${dateKey}`
 *
 * GET /api/planned-shifts?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   ADMIN → tutti gli utenti OPERATORE_PULIZIE/RIDER attivi (id, name, role,
 *           workSchedule) + tutte le eccezioni nel range.
 *   OPERATORE/RIDER → solo i propri dati (schedule + proprie eccezioni nel range).
 *
 * POST /api/planned-shifts  (solo ADMIN)
 *   { action: "set_schedule",     userId, schedule: {mon..sun} }
 *   { action: "set_exception",    userId, dateKey, type: "ON"|"OFF", reason? }
 *   { action: "remove_exception", userId, dateKey }
 *
 * NOTE DI SICUREZZA
 * - Tutte le scritture passano da qui (admin-gated + sanitizzazione input).
 * - set_exception "ON" notifica il dipendente (turno extra). "OFF" no
 *   (è l'admin che registra un'assenza, di solito già concordata).
 */

const MANAGED_ROLES = ["OPERATORE_PULIZIE", "RIDER"];

// ════════════════════════════════════════════════════════════════
// GET — lettura schedule + eccezioni
// ════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const role = user.role?.toUpperCase();
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) {
    return NextResponse.json(
      { error: "Parametri from/to non validi (atteso YYYY-MM-DD, from <= to)" },
      { status: 400 }
    );
  }

  // Range massimo 92 giorni: protegge da query enormi
  const fromMs = new Date(from + "T12:00:00Z").getTime();
  const toMs = new Date(to + "T12:00:00Z").getTime();
  if ((toMs - fromMs) / 86400000 > 92) {
    return NextResponse.json({ error: "Range massimo 92 giorni" }, { status: 400 });
  }

  try {
    if (role === "ADMIN") {
      // Tutti i dipendenti gestiti
      const usersSnap = await adminDb
        .collection("users")
        .where("role", "in", MANAGED_ROLES)
        .get();
      const users = usersSnap.docs
        .map((d) => {
          const raw = d.data() as Record<string, any>;
          return {
            id: d.id,
            name: raw.name || raw.email || "Utente",
            role: raw.role || "",
            status: raw.status || "ACTIVE",
            workSchedule: raw.workSchedule || null,
          };
        })
        .filter((u) => u.status === "ACTIVE")
        .sort((a, b) => a.name.localeCompare(b.name));

      const excSnap = await adminDb
        .collection(EXCEPTIONS_COLLECTION)
        .where("dateKey", ">=", from)
        .where("dateKey", "<=", to)
        .get();
      const exceptions = excSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) }));

      return NextResponse.json({ users, exceptions });
    }

    if (MANAGED_ROLES.includes(role)) {
      // Self-service: solo i propri dati
      const userSnap = await adminDb.collection("users").doc(user.id).get();
      const raw = userSnap.exists ? (userSnap.data() as Record<string, any>) : {};
      const excSnap = await adminDb
        .collection(EXCEPTIONS_COLLECTION)
        .where("userId", "==", user.id)
        .get();
      const exceptions = excSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) }))
        .filter((e: any) => e.dateKey >= from && e.dateKey <= to);

      return NextResponse.json({
        users: [
          {
            id: user.id,
            name: raw.name || user.name || "Utente",
            role: raw.role || role,
            status: raw.status || "ACTIVE",
            workSchedule: raw.workSchedule || null,
          },
        ],
        exceptions,
      });
    }

    return NextResponse.json({ error: "Ruolo non autorizzato" }, { status: 403 });
  } catch (e) {
    console.error("GET planned-shifts errore:", e);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ════════════════════════════════════════════════════════════════
// POST — azioni admin
// ════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  if (user.role?.toUpperCase() !== "ADMIN") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  const action = body.action as string;
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return NextResponse.json({ error: "userId richiesto" }, { status: 400 });
  }

  // Carica e valida l'utente bersaglio (deve essere operatore o rider)
  const targetSnap = await adminDb.collection("users").doc(userId).get();
  if (!targetSnap.exists) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }
  const target = targetSnap.data() as Record<string, any>;
  if (!MANAGED_ROLES.includes((target.role || "").toUpperCase())) {
    return NextResponse.json(
      { error: "I turni si gestiscono solo per operatori e rider" },
      { status: 400 }
    );
  }
  const targetName = target.name || target.email || "Utente";
  const now = Timestamp.now();

  try {
    // ── SET SCHEDULE (template ricorrente) ──
    if (action === "set_schedule") {
      const schedule = sanitizeSchedule(body.schedule);
      await adminDb.collection("users").doc(userId).update({
        workSchedule: schedule,
        workScheduleUpdatedAt: now,
        workScheduleUpdatedBy: user.id,
      });
      return NextResponse.json({ success: true, schedule });
    }

    // ── SET EXCEPTION (assenza o turno extra) ──
    if (action === "set_exception") {
      const dateKey = typeof body.dateKey === "string" ? body.dateKey.trim() : "";
      const type = body.type === "OFF" ? "OFF" : body.type === "ON" ? "ON" : null;
      const reason =
        typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

      if (!isValidDateKey(dateKey)) {
        return NextResponse.json({ error: "dateKey non valida" }, { status: 400 });
      }
      if (!type) {
        return NextResponse.json({ error: "type deve essere ON o OFF" }, { status: 400 });
      }

      await adminDb
        .collection(EXCEPTIONS_COLLECTION)
        .doc(exceptionDocId(userId, dateKey))
        .set(
          {
            userId,
            userName: targetName,
            userRole: target.role,
            dateKey,
            type,
            reason: reason || null,
            createdBy: user.id,
            createdByName: user.name || user.email || "Admin",
            createdAt: now,
            updatedAt: now,
            forced: false,
          },
          { merge: true }
        );

      // Notifica solo per turno extra (ON)
      if (type === "ON") {
        try {
          const dateStr = new Date(dateKey + "T12:00:00Z").toLocaleDateString("it-IT", {
            timeZone: "Europe/Rome",
            weekday: "long",
            day: "numeric",
            month: "long",
          });
          await createNotification({
            title: "📅 Turno aggiunto",
            message: `Sei stato aggiunto in turno per ${dateStr}.${reason ? ` Motivo: ${reason}` : ""}`,
            type: "SHIFT_EXCEPTION_ON",
            recipientRole: target.role,
            recipientId: userId,
            senderId: user.id,
            senderName: user.name || "Admin",
            link: (target.role || "").toUpperCase() === "RIDER" ? "/rider" : "/operatore",
          });
        } catch (e) {
          console.error("Notifica set_exception fallita (non bloccante):", e);
        }
      }

      return NextResponse.json({ success: true });
    }

    // ── REMOVE EXCEPTION ──
    if (action === "remove_exception") {
      const dateKey = typeof body.dateKey === "string" ? body.dateKey.trim() : "";
      if (!isValidDateKey(dateKey)) {
        return NextResponse.json({ error: "dateKey non valida" }, { status: 400 });
      }
      await adminDb
        .collection(EXCEPTIONS_COLLECTION)
        .doc(exceptionDocId(userId, dateKey))
        .delete();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `Azione sconosciuta: ${action}` }, { status: 400 });
  } catch (e) {
    console.error("POST planned-shifts errore:", e);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
