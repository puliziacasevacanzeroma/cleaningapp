/**
 * 🔍 DEBUG — Diagnosi proprietà pending + notifiche
 * GET /api/debug/property-pending?secret=SECRET&userId=OWNER_ID
 * 
 * Analizza TUTTO il flusso:
 * 1. Proprietà in DB per quel proprietario
 * 2. Notifiche in DB per quel proprietario  
 * 3. Confronto ownerId vs user.id
 * 4. Cosa vede il proprietario vs cosa c'è nel DB
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get("secret");
  if (urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = req.nextUrl.searchParams.get("userId") || "";
  const report: Record<string, any> = {
    timestamp: new Date().toISOString(),
    userId: userId || "NON PASSATO — aggiungi ?userId=ID_PROPRIETARIO",
  };

  try {
    // ══════════════════════════════════════════════════════
    // STEP 1: Leggi l'utente dal DB
    // ══════════════════════════════════════════════════════
    if (userId) {
      const userSnap = await adminDb.collection("users").doc(userId).get();
      if (!userSnap.exists) {
        report.utente = `❌ NON TROVATO con id="${userId}"`;
      } else {
        const u = userSnap.data() as Record<string, any>;
        report.utente = {
          id: userSnap.id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
        };
      }
    }

    // ══════════════════════════════════════════════════════
    // STEP 2: Tutte le proprietà di questo ownerId
    // ══════════════════════════════════════════════════════
    const propByOwnerSnap = userId
      ? await adminDb.collection("properties").where("ownerId", "==", userId).get()
      : null;

    report.proprieta_per_ownerId = propByOwnerSnap
      ? propByOwnerSnap.docs.map(d => {
          const data = d.data() as Record<string, any>;
          return {
            id: d.id,
            name: data.name,
            status: data.status,
            ownerId: data.ownerId,
            ownerName: data.ownerName,
            ownerEmail: data.ownerEmail,
            cleaningPrice: data.cleaningPrice,
            createdAt: data.createdAt?.toDate?.()?.toISOString(),
          };
        })
      : "userId non passato";

    // ══════════════════════════════════════════════════════
    // STEP 3: Proprietà con status PENDING o PENDING_SIGNATURE (tutte)
    // ══════════════════════════════════════════════════════
    const pendingSnap = await adminDb.collection("properties")
      .where("status", "in", ["PENDING", "PENDING_SIGNATURE"])
      .get();

    report.tutte_proprieta_pending = pendingSnap.docs.map(d => {
      const data = d.data() as Record<string, any>;
      const ownerMatch = userId ? data.ownerId === userId : null;
      return {
        id: d.id,
        name: data.name,
        status: data.status,
        ownerId: data.ownerId || "❌ MANCANTE",
        ownerIdType: typeof data.ownerId,
        ownerIdIsEmpty: data.ownerId === "" || data.ownerId === "pending",
        ownerName: data.ownerName,
        matchesUserId: ownerMatch === null ? "non verificato" : (ownerMatch ? "✅ SÌ" : "❌ NO"),
        cleaningPrice: data.cleaningPrice,
        createdAt: data.createdAt?.toDate?.()?.toISOString(),
      };
    });

    // ══════════════════════════════════════════════════════
    // STEP 4: Notifiche per questo userId
    // ══════════════════════════════════════════════════════
    if (userId) {
      // Notifiche con recipientId
      const notifByIdSnap = await adminDb.collection("notifications")
        .where("recipientId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();

      // Notifiche broadcast PROPRIETARIO
      const notifBroadcastSnap = await adminDb.collection("notifications")
        .where("recipientRole", "==", "PROPRIETARIO")
        .orderBy("createdAt", "desc")
        .limit(10)
        .get();

      report.notifiche_per_userId = notifByIdSnap.docs.map(d => {
        const data = d.data() as Record<string, any>;
        return {
          id: d.id,
          title: data.title,
          message: data.message?.substring(0, 100),
          type: data.type,
          recipientId: data.recipientId,
          recipientIdType: typeof data.recipientId,
          recipientIdMatchesUser: data.recipientId === userId ? "✅ MATCH" : `❌ NO MATCH (${JSON.stringify(data.recipientId)})`,
          status: data.status,
          relatedEntityId: data.relatedEntityId,
          createdAt: data.createdAt?.toDate?.()?.toISOString(),
        };
      });

      report.notifiche_broadcast_proprietario = notifBroadcastSnap.docs.map(d => {
        const data = d.data() as Record<string, any>;
        return {
          id: d.id,
          title: data.title,
          recipientId: data.recipientId || "nessuno (broadcast)",
          status: data.status,
          createdAt: data.createdAt?.toDate?.()?.toISOString(),
        };
      });

      // STEP 4b: Cerca notifiche con recipientId che sia un OGGETTO (il bug storico)
      const allNotifSnap = await adminDb.collection("notifications")
        .where("recipientRole", "==", "PROPRIETARIO")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();

      const buggedNotifs = allNotifSnap.docs.filter(d => {
        const data = d.data() as Record<string, any>;
        return typeof data.recipientId === "object" && data.recipientId !== null;
      });

      report.notifiche_con_recipientId_oggetto_BUG = buggedNotifs.length > 0
        ? buggedNotifs.map(d => {
            const data = d.data() as Record<string, any>;
            return {
              id: d.id,
              title: data.title,
              recipientId: JSON.stringify(data.recipientId),
              createdAt: data.createdAt?.toDate?.()?.toISOString(),
            };
          })
        : "✅ Nessuna notifica con bug recipientId oggetto trovata";
    }

    // ══════════════════════════════════════════════════════
    // STEP 5: Proprietà con ownerId "pending" o vuoto (bug creazione)
    // ══════════════════════════════════════════════════════
    const pendingOwnerSnap = await adminDb.collection("properties")
      .where("ownerId", "==", "pending")
      .get();
    const emptyOwnerSnap = await adminDb.collection("properties")
      .where("ownerId", "==", "")
      .get();

    report.proprieta_con_ownerId_pending_BUG = pendingOwnerSnap.docs.map(d => ({
      id: d.id,
      name: (d.data() as any).name,
      status: (d.data() as any).status,
      ownerName: (d.data() as any).ownerName,
      ownerEmail: (d.data() as any).ownerEmail,
      createdAt: (d.data() as any).createdAt?.toDate?.()?.toISOString(),
    }));

    report.proprieta_con_ownerId_vuoto_BUG = emptyOwnerSnap.docs.map(d => ({
      id: d.id,
      name: (d.data() as any).name,
      status: (d.data() as any).status,
      ownerName: (d.data() as any).ownerName,
      ownerEmail: (d.data() as any).ownerEmail,
    }));

    // ══════════════════════════════════════════════════════
    // STEP 6: Se userId passato, cerca l'utente per email
    // (per verificare che l'ID sia quello giusto)
    // ══════════════════════════════════════════════════════
    if (userId) {
      // Cerca anche tutte le proprietà dove ownerEmail matcha l'email dell'utente
      const userSnap2 = await adminDb.collection("users").doc(userId).get();
      if (userSnap2.exists) {
        const email = (userSnap2.data() as any)?.email;
        if (email) {
          const propByEmailSnap = await adminDb.collection("properties")
            .where("ownerEmail", "==", email)
            .get();
          report.proprieta_per_ownerEmail = propByEmailSnap.docs.map(d => {
            const data = d.data() as Record<string, any>;
            return {
              id: d.id,
              name: data.name,
              status: data.status,
              ownerId: data.ownerId,
              ownerIdMatchesUserId: data.ownerId === userId ? "✅ OK" : `❌ DISCREPANZA: ownerId="${data.ownerId}" vs userId="${userId}"`,
            };
          });
        }
      }
    }

    // ══════════════════════════════════════════════════════
    // DIAGNOSI FINALE
    // ══════════════════════════════════════════════════════
    const diagnosi: string[] = [];

    if (propByOwnerSnap && propByOwnerSnap.empty && userId) {
      diagnosi.push(`❌ CRITICO: Nessuna proprietà trovata con ownerId="${userId}" — le proprietà potrebbero avere ownerId diverso`);
    }

    const buggedOwner = report.proprieta_con_ownerId_pending_BUG;
    if (Array.isArray(buggedOwner) && buggedOwner.length > 0) {
      diagnosi.push(`❌ BUG: ${buggedOwner.length} proprietà con ownerId="pending" — non verranno mai mostrate al proprietario`);
    }

    const emptyOwner = report.proprieta_con_ownerId_vuoto_BUG;
    if (Array.isArray(emptyOwner) && emptyOwner.length > 0) {
      diagnosi.push(`❌ BUG: ${emptyOwner.length} proprietà con ownerId="" — non verranno mai mostrate al proprietario`);
    }

    const buggedNotif = report.notifiche_con_recipientId_oggetto_BUG;
    if (Array.isArray(buggedNotif) && buggedNotif.length > 0) {
      diagnosi.push(`❌ BUG STORICO: ${buggedNotif.length} notifiche con recipientId=oggetto — già fixato ma queste vecchie non arriveranno mai`);
    }

    if (diagnosi.length === 0) {
      diagnosi.push("✅ Nessun bug strutturale trovato — controlla la console del browser per errori Firestore");
    }

    report.DIAGNOSI = diagnosi;
    report.COME_USARE = {
      step1: "Prendi l'ID del proprietario da Firebase Console → users → copia il document ID",
      step2: `Chiama: /api/debug/property-pending?secret=SECRET&userId=ID_PROPRIETARIO`,
      step3: "Controlla 'DIAGNOSI' e 'tutte_proprieta_pending' per vedere ownerId di ogni proprietà",
    };

    return NextResponse.json(report, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}
