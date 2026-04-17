import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * API Timbrature (workSessions).
 *
 * ARCHITETTURA ANTI-DOPPIA-APERTURA
 * ──────────────────────────────────
 * Uso DUE collezioni:
 *   1. `activeShifts/{userId}` → lock serializzabile. Contiene l'ID della sessione aperta.
 *      Doc ID fisso = userId. Transaction su questo doc è garantita serializzabile da Firestore.
 *   2. `workSessions/{autoId}` → storico di TUTTE le sessioni (aperte e chiuse). Tutti i report si basano qui.
 *
 * Flusso start:
 *   txn {
 *     get(activeShifts/{userId}) → se esiste, ALREADY_OPEN
 *     create(workSessions/{newId}) con status="OPEN"
 *     set(activeShifts/{userId}) con { sessionId: newId, startAt, ... }
 *   }
 *
 * Flusso end:
 *   txn {
 *     get(activeShifts/{userId}) → se non esiste, NO_OPEN
 *     get(workSessions/{sessionId}) → aggiorna status="CLOSED", endAt, durationMinutes
 *     delete(activeShifts/{userId})
 *   }
 *
 * Azioni:
 *   POST /api/shifts { action: "start", notes? }         → apre sessione (user corrente)
 *   POST /api/shifts { action: "end", notes? }           → chiude sessione (user corrente)
 *   POST /api/shifts { action: "get_active" }            → sessione OPEN corrente (o null)
 *   [admin] { action: "admin_edit", sessionId, startAt?, endAt?, notes?, reason }
 *   [admin] { action: "admin_close", sessionId, endAt, reason }
 *
 *   GET /api/shifts?userId=X&from=YYYY-MM-DD&to=YYYY-MM-DD  (admin può filtrare user, altrimenti proprie)
 */

// ════════════════════════════════════════════════════════════════
// GET — Lista sessioni
// ════════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const role = user.role?.toUpperCase();
  const isAdmin = role === "ADMIN";

  const url = new URL(request.url);
  const userIdParam = url.searchParams.get("userId");
  const from = url.searchParams.get("from"); // YYYY-MM-DD
  const to = url.searchParams.get("to");

  // Non-admin vede solo le proprie sessioni
  const targetUserId = isAdmin && userIdParam ? userIdParam : user.id;

  try {
    // La query usa filtri tutti sullo stesso campo (dateKey) + filtro userId:
    // per evitare composite index filtriamo dateKey SOLO se c'è from, e facciamo
    // il resto lato JS. In alternativa si può creare l'index.
    let q: FirebaseFirestore.Query = adminDb.collection("workSessions").where("userId", "==", targetUserId);
    // NON aggiungo orderBy per evitare composite index userId+dateKey.
    // Ordino in JS dopo il fetch.

    const snap = await q.limit(500).get();
    let sessions = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        startAt: data.startAt?.toMillis?.() || null,
        endAt: data.endAt?.toMillis?.() || null,
        status: data.status,
        dateKey: data.dateKey,
        durationMinutes: data.durationMinutes ?? null,
        notes: data.notes || null,
        alertedAt: data.alertedAt?.toMillis?.() || null,
        editHistory: (data.editHistory || []).map((e: any) => ({
          ...e,
          editedAt: e.editedAt?.toMillis?.() || null,
          prev: e.prev?.toMillis?.() ?? e.prev ?? null,
          next: e.next?.toMillis?.() ?? e.next ?? null,
        })),
      };
    });

    // Filtro per range in JS
    if (from) sessions = sessions.filter((s) => s.dateKey >= from);
    if (to) sessions = sessions.filter((s) => s.dateKey <= to);

    // Ordine desc per dateKey, poi per startAt
    sessions.sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? 1 : -1;
      return (b.startAt || 0) - (a.startAt || 0);
    });

    return NextResponse.json({ sessions });
  } catch (error: any) {
    console.error("Errore GET workSessions:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}

// ════════════════════════════════════════════════════════════════
// POST — Azioni
// ════════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const role = user.role?.toUpperCase();
  const isAdmin = role === "ADMIN";

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }
  const { action } = body;

  // Validazione limiti lunghezza campi di testo (anti abuso/DoS)
  const MAX_NOTES_LEN = 500;
  const MAX_REASON_LEN = 500;
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string") {
      return NextResponse.json({ error: "Campo 'notes' deve essere testo" }, { status: 400 });
    }
    if (body.notes.length > MAX_NOTES_LEN) {
      return NextResponse.json({ error: `Le note non possono superare ${MAX_NOTES_LEN} caratteri` }, { status: 400 });
    }
  }
  if (body.reason !== undefined && body.reason !== null) {
    if (typeof body.reason !== "string") {
      return NextResponse.json({ error: "Campo 'reason' deve essere testo" }, { status: 400 });
    }
    if (body.reason.length > MAX_REASON_LEN) {
      return NextResponse.json({ error: `Il motivo non può superare ${MAX_REASON_LEN} caratteri` }, { status: 400 });
    }
  }

  try {
    // ==========================================================
    // START — apre nuova sessione per l'utente corrente
    // ==========================================================
    if (action === "start") {
      // Solo OPERATORE_PULIZIE e RIDER possono timbrare.
      // Admin NON può timbrare (evita sporcare i report con sessioni admin).
      if (role !== "OPERATORE_PULIZIE" && role !== "RIDER") {
        return NextResponse.json({ error: "Solo operatori e rider possono timbrare il turno" }, { status: 403 });
      }

      const now = Timestamp.now();
      const dateKey = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

      // Transaction serializzabile:
      // - Leggo activeShifts/{userId} (doc ID fisso = lock)
      // - Se esiste → ALREADY_OPEN
      // - Altrimenti creo workSessions/{newId} e activeShifts/{userId}
      const result = await adminDb.runTransaction(async (txn) => {
        const lockRef = adminDb.collection("activeShifts").doc(user.id);
        const lockSnap = await txn.get(lockRef);

        if (lockSnap.exists) {
          const data = lockSnap.data() || {};
          return { ok: false, reason: "ALREADY_OPEN", sessionId: data.sessionId, startAt: data.startAt };
        }

        const newRef = adminDb.collection("workSessions").doc();
        const sessionData = {
          userId: user.id,
          userName: user.name || user.email,
          userRole: role || "OPERATORE_PULIZIE",
          startAt: now,
          endAt: null,
          status: "OPEN",
          dateKey,
          durationMinutes: null,
          notes: body.notes || null,
          alertedAt: null,
          editHistory: [],
          createdAt: now,
          updatedAt: now,
        };

        txn.set(newRef, sessionData);
        txn.set(lockRef, {
          sessionId: newRef.id,
          userId: user.id,
          userName: user.name || user.email,
          userRole: role || "OPERATORE_PULIZIE",
          startAt: now,
          dateKey,
        });
        return { ok: true, sessionId: newRef.id };
      });

      if (!result.ok) {
        return NextResponse.json(
          {
            error: "Hai già un turno in corso. Termina quello precedente prima di aprirne un altro.",
            code: "ALREADY_OPEN",
            sessionId: result.sessionId,
          },
          { status: 409 }
        );
      }

      return NextResponse.json({ success: true, sessionId: result.sessionId, startAt: now.toMillis() });
    }

    // ==========================================================
    // END — chiude sessione OPEN dell'utente corrente
    // ==========================================================
    if (action === "end") {
      const now = Timestamp.now();

      const result = await adminDb.runTransaction(async (txn) => {
        const lockRef = adminDb.collection("activeShifts").doc(user.id);
        const lockSnap = await txn.get(lockRef);
        if (!lockSnap.exists) return { ok: false, reason: "NO_OPEN" };

        const lockData = lockSnap.data() || {};
        const sessionId = lockData.sessionId;
        if (!sessionId) return { ok: false, reason: "LOCK_CORRUPT" };

        const sessionRef = adminDb.collection("workSessions").doc(sessionId);
        const sessionSnap = await txn.get(sessionRef);
        if (!sessionSnap.exists) {
          // Lock inconsistente: rimuovilo silenziosamente e segnala
          txn.delete(lockRef);
          return { ok: false, reason: "SESSION_MISSING" };
        }

        const data = sessionSnap.data()!;
        const startMs = data.startAt?.toMillis?.() || 0;
        const endMs = now.toMillis();
        const durationMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));

        const mergedNotes = body.notes
          ? data.notes
            ? `${data.notes}\n${body.notes}`
            : body.notes
          : data.notes;

        txn.update(sessionRef, {
          endAt: now,
          status: "CLOSED",
          durationMinutes,
          notes: mergedNotes,
          updatedAt: now,
        });
        txn.delete(lockRef);
        return { ok: true, sessionId, durationMinutes, endAt: endMs };
      });

      if (!result.ok) {
        if (result.reason === "SESSION_MISSING") {
          return NextResponse.json({ error: "Sessione non trovata, lock rimosso. Riprova." }, { status: 409 });
        }
        return NextResponse.json({ error: "Nessun turno aperto da chiudere" }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        sessionId: result.sessionId,
        durationMinutes: result.durationMinutes,
        endAt: result.endAt,
      });
    }

    // ==========================================================
    // GET_ACTIVE — ritorna la sessione OPEN dell'utente (o null)
    // ==========================================================
    if (action === "get_active") {
      const lockSnap = await adminDb.collection("activeShifts").doc(user.id).get();
      if (!lockSnap.exists) return NextResponse.json({ session: null });
      const lockData = lockSnap.data() || {};
      const sessionId = lockData.sessionId;
      if (!sessionId) return NextResponse.json({ session: null });

      const sessionSnap = await adminDb.collection("workSessions").doc(sessionId).get();
      if (!sessionSnap.exists) return NextResponse.json({ session: null });
      const data = sessionSnap.data()!;
      return NextResponse.json({
        session: {
          id: sessionSnap.id,
          userId: data.userId,
          userName: data.userName,
          userRole: data.userRole,
          startAt: data.startAt?.toMillis?.() || null,
          status: data.status,
          dateKey: data.dateKey,
          notes: data.notes || null,
        },
      });
    }

    // ==========================================================
    // ADMIN_EDIT — modifica timestamp/note con audit trail
    // ==========================================================
    if (action === "admin_edit") {
      if (!isAdmin) return NextResponse.json({ error: "Solo admin" }, { status: 403 });
      const { sessionId, startAt, endAt, notes, reason } = body;
      if (!sessionId) return NextResponse.json({ error: "sessionId richiesto" }, { status: 400 });
      if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
        return NextResponse.json({ error: "Specifica il motivo della modifica (min 3 caratteri)" }, { status: 400 });
      }

      const now = Timestamp.now();
      const result = await adminDb.runTransaction(async (txn) => {
        const sessionRef = adminDb.collection("workSessions").doc(sessionId);
        const snap = await txn.get(sessionRef);
        if (!snap.exists) return { ok: false, reason: "NOT_FOUND" };
        const data = snap.data()!;

        const updates: any = { updatedAt: now };
        const editEntries: any[] = [];

        let newStart = data.startAt;
        let newEnd = data.endAt;

        if (startAt !== undefined && startAt !== null) {
          const ts = Timestamp.fromMillis(Number(startAt));
          if ((data.startAt?.toMillis?.() || 0) !== ts.toMillis()) {
            updates.startAt = ts;
            newStart = ts;
            editEntries.push({
              editedAt: now,
              editedBy: user.id,
              editedByName: user.name || user.email,
              field: "startAt",
              prev: data.startAt || null,
              next: ts,
              reason: reason.trim(),
            });
          }
        }
        if (endAt !== undefined) {
          const ts = endAt === null ? null : Timestamp.fromMillis(Number(endAt));
          const prevEndMs = data.endAt?.toMillis?.() ?? null;
          const nextEndMs = ts?.toMillis?.() ?? null;
          if (prevEndMs !== nextEndMs) {
            updates.endAt = ts;
            newEnd = ts;
            if (ts !== null && data.status === "OPEN") {
              updates.status = "CLOSED";
              // Se sto chiudendo via admin_edit, devo rimuovere anche il lock
              // ATTENZIONE: farlo in una transaction che già sta modificando session
              // è ok perché il lock è su un altro doc. Ma lo faccio fuori transaction
              // per semplicità (non race perché l'admin sta modificando).
            }
            editEntries.push({
              editedAt: now,
              editedBy: user.id,
              editedByName: user.name || user.email,
              field: "endAt",
              prev: data.endAt || null,
              next: ts,
              reason: reason.trim(),
            });
          }
        }
        if (notes !== undefined && notes !== (data.notes || null)) {
          updates.notes = notes;
          editEntries.push({
            editedAt: now,
            editedBy: user.id,
            editedByName: user.name || user.email,
            field: "notes",
            prev: data.notes || null,
            next: notes,
            reason: reason.trim(),
          });
        }

        // Validazioni
        const startMs = newStart?.toMillis?.() ?? 0;
        const endMs = newEnd?.toMillis?.() ?? null;
        if (endMs !== null && endMs <= startMs) {
          return { ok: false, reason: "END_BEFORE_START" };
        }

        if (endMs !== null) {
          updates.durationMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));
        }

        if (editEntries.length === 0) {
          return { ok: false, reason: "NO_CHANGES" };
        }

        updates.editHistory = FieldValue.arrayUnion(...editEntries);
        txn.update(sessionRef, updates);

        // Se admin ha chiuso una sessione aperta, serve rimuovere il lock
        const shouldDropLock = endAt !== undefined && endAt !== null && data.status === "OPEN";
        return { ok: true, shouldDropLock, userId: data.userId, sessionId };
      });

      if (!result.ok) {
        const msg =
          result.reason === "NOT_FOUND"
            ? "Sessione non trovata"
            : result.reason === "END_BEFORE_START"
            ? "L'ora di fine deve essere successiva a quella di inizio"
            : result.reason === "NO_CHANGES"
            ? "Nessuna modifica rilevata"
            : "Errore";
        return NextResponse.json({ error: msg }, { status: 400 });
      }

      // Drop del lock se ho chiuso una sessione aperta (fuori transaction: ok perché admin)
      if (result.shouldDropLock && result.userId) {
        try {
          const lockRef = adminDb.collection("activeShifts").doc(result.userId);
          const lockSnap = await lockRef.get();
          if (lockSnap.exists && lockSnap.data()?.sessionId === result.sessionId) {
            await lockRef.delete();
          }
        } catch (e) {
          console.error("Errore rimozione lock post admin_edit:", e);
        }
      }

      return NextResponse.json({ success: true });
    }

    // ==========================================================
    // ADMIN_CLOSE — chiude forzatamente una sessione OPEN altrui
    // ==========================================================
    if (action === "admin_close") {
      if (!isAdmin) return NextResponse.json({ error: "Solo admin" }, { status: 403 });
      const { sessionId, endAt, reason } = body;
      if (!sessionId || !endAt) return NextResponse.json({ error: "sessionId e endAt richiesti" }, { status: 400 });
      if (!reason || reason.trim().length < 3)
        return NextResponse.json({ error: "Specifica il motivo" }, { status: 400 });

      const now = Timestamp.now();
      const endTs = Timestamp.fromMillis(Number(endAt));

      const result = await adminDb.runTransaction(async (txn) => {
        const sessionRef = adminDb.collection("workSessions").doc(sessionId);
        const snap = await txn.get(sessionRef);
        if (!snap.exists) return { ok: false, reason: "NOT_FOUND" };
        const data = snap.data()!;
        if (data.status !== "OPEN") return { ok: false, reason: "NOT_OPEN" };

        const startMs = data.startAt?.toMillis?.() || 0;
        const endMs = endTs.toMillis();
        if (endMs <= startMs) return { ok: false, reason: "END_BEFORE_START" };

        const durationMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));

        txn.update(sessionRef, {
          endAt: endTs,
          status: "CLOSED",
          durationMinutes,
          updatedAt: now,
          editHistory: FieldValue.arrayUnion({
            editedAt: now,
            editedBy: user.id,
            editedByName: user.name || user.email,
            field: "endAt",
            prev: null,
            next: endTs,
            reason: `[ADMIN CLOSE] ${reason.trim()}`,
          }),
        });
        return { ok: true, userId: data.userId, sessionId };
      });

      if (!result.ok) {
        const msg =
          result.reason === "NOT_FOUND"
            ? "Sessione non trovata"
            : result.reason === "NOT_OPEN"
            ? "La sessione è già chiusa"
            : result.reason === "END_BEFORE_START"
            ? "L'ora di fine deve essere successiva a quella di inizio"
            : "Errore";
        return NextResponse.json({ error: msg }, { status: 400 });
      }

      // Rimuovi il lock (fuori transaction)
      if (result.userId && result.sessionId) {
        try {
          const lockRef = adminDb.collection("activeShifts").doc(result.userId);
          const lockSnap = await lockRef.get();
          if (lockSnap.exists && lockSnap.data()?.sessionId === result.sessionId) {
            await lockRef.delete();
          }
        } catch (e) {
          console.error("Errore rimozione lock post admin_close:", e);
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
  } catch (error: any) {
    console.error("Errore POST workSessions:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}
