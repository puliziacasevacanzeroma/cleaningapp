import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * POST /api/payment-block
 * 
 * Gestisce il blocco pagamenti per un proprietario.
 * 
 * Actions:
 * - "activate"  → Attiva il blocco (chiamato automaticamente quando un debito scade)
 * - "override"  → L'admin sblocca manualmente senza che il pagamento sia stato fatto
 * - "remove"    → Rimuove completamente il blocco (quando tutti i debiti scaduti sono saldati)
 */
export async function POST(request: NextRequest) {
  const currentUser = await getApiUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, proprietarioId, reason } = body;

    if (!proprietarioId) {
      return NextResponse.json({ error: "proprietarioId richiesto" }, { status: 400 });
    }

    const userRef = adminDb.collection("users").doc(proprietarioId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    const userData = userDoc.data() as Record<string, any>;

    if (action === "activate") {
      // Solo admin o sistema può attivare il blocco
      if (currentUser.role !== "ADMIN") {
        return NextResponse.json({ error: "Solo gli amministratori" }, { status: 403 });
      }
      // Attiva il blocco — può essere chiamato dal sistema o dall'admin
      // Non attivare se l'admin ha già fatto un override attivo (a meno che force=true)
      const existingBlock = userData.paymentBlock;
      const force = body.force === true;
      if (!force && existingBlock?.overriddenByAdmin === true) {
        return NextResponse.json({ 
          success: true, 
          skipped: true, 
          message: "Blocco non attivato: override admin attivo" 
        });
      }

      await userRef.update({
        paymentBlock: {
          active: true,
          since: Timestamp.now(),
          reason: reason || "Pagamento scaduto non effettuato",
          overriddenByAdmin: false,
          overriddenAt: null,
        },
      });

      // Notifica al proprietario
      await adminDb.collection("notifications").add({
        title: "⚠️ Account limitato",
        message: "Il tuo account è stato temporaneamente limitato per pagamenti scaduti. Regolarizza la tua posizione per ripristinare l'accesso completo.",
        type: "PAYMENT_OVERDUE",
        recipientRole: "PROPRIETARIO",
        recipientId: proprietarioId,
        senderId: "system",
        senderName: "Sistema",
        status: "UNREAD",
        actionRequired: true,
        relatedEntityType: "PAYMENT",
        link: "/proprietario/pagamenti",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Notifica all'admin
      const ownerName = userData.name || userData.email || "Proprietario";
      await adminDb.collection("notifications").add({
        title: "💳 Account limitato per morosità",
        message: `L'account di ${ownerName} è stato limitato automaticamente per pagamenti scaduti.`,
        type: "WARNING",
        recipientRole: "ADMIN",
        recipientId: null,
        senderId: "system",
        senderName: "Sistema",
        status: "UNREAD",
        actionRequired: false,
        relatedEntityType: "PAYMENT",
        relatedEntityName: ownerName,
        link: "/dashboard/pagamenti",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      return NextResponse.json({ success: true, action: "activated" });
    }

    if (action === "override") {
      // Solo admin può fare override
      if (currentUser.role !== "ADMIN") {
        return NextResponse.json({ error: "Solo gli amministratori" }, { status: 403 });
      }

      await userRef.update({
        "paymentBlock.overriddenByAdmin": true,
        "paymentBlock.overriddenAt": Timestamp.now(),
      });

      // Notifica al proprietario
      await adminDb.collection("notifications").add({
        title: "✅ Accesso ripristinato",
        message: "L'amministratore ha ripristinato il tuo accesso completo. Ti ricordiamo di regolarizzare i pagamenti in sospeso.",
        type: "SUCCESS",
        recipientRole: "PROPRIETARIO",
        recipientId: proprietarioId,
        senderId: currentUser.id,
        senderName: currentUser.name || "Admin",
        status: "UNREAD",
        actionRequired: false,
        relatedEntityType: "PAYMENT",
        link: "/proprietario/pagamenti",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      return NextResponse.json({ success: true, action: "overridden" });
    }

    if (action === "remove") {
      // Solo admin può rimuovere il blocco
      if (currentUser.role !== "ADMIN") {
        return NextResponse.json({ error: "Solo gli amministratori" }, { status: 403 });
      }
      // Rimuove completamente il blocco
      await userRef.update({
        paymentBlock: null,
      });

      // Notifica al proprietario solo se c'era un blocco attivo
      if (userData.paymentBlock?.active === true) {
        await adminDb.collection("notifications").add({
          title: "✅ Account ripristinato",
          message: "I tuoi pagamenti risultano regolari. L'accesso completo è stato ripristinato. Grazie!",
          type: "PAYMENT_RECEIVED",
          recipientRole: "PROPRIETARIO",
          recipientId: proprietarioId,
          senderId: "system",
          senderName: "Sistema",
          status: "UNREAD",
          actionRequired: false,
          relatedEntityType: "PAYMENT",
          link: "/proprietario/pagamenti",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }

      return NextResponse.json({ success: true, action: "removed" });
    }

    return NextResponse.json({ error: "Azione non valida. Usa: activate, override, remove" }, { status: 400 });
  } catch (error) {
    console.error("Errore payment-block:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

/**
 * GET /api/payment-block?proprietarioId=xxx
 * Restituisce lo stato del blocco per un proprietario
 */
export async function GET(request: NextRequest) {
  const currentUser = await getApiUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const proprietarioId = request.nextUrl.searchParams.get("proprietarioId");
    if (!proprietarioId) {
      return NextResponse.json({ error: "proprietarioId richiesto" }, { status: 400 });
    }

    // Un proprietario può vedere solo il proprio blocco, l'admin può vedere tutti
    if (currentUser.role !== "ADMIN" && currentUser.id !== proprietarioId) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const userDoc = await adminDb.collection("users").doc(proprietarioId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    const userData = userDoc.data() as Record<string, any>;
    const paymentBlock = userData.paymentBlock || null;

    return NextResponse.json({ success: true, paymentBlock });
  } catch (error) {
    console.error("Errore GET payment-block:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
