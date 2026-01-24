import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createPayment,
  deletePayment,
  getClientPaymentStats,
  calculateSummaryFromStats,
  getPropertiesWithoutPrice,
  setPaymentOverride,
  deletePaymentOverride,
} from "~/lib/firebase/payments";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// Funzione per inviare notifica al proprietario
async function notifyOwnerPaymentReceived(
  proprietarioId: string,
  amount: number,
  totalDue: number,
  totalPaid: number,
  month: number,
  year: number
) {
  try {
    const monthNames = [
      'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
      'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
    ];
    const monthName = monthNames[month - 1] || '';
    const remaining = totalDue - totalPaid;
    
    let message = `Abbiamo ricevuto il tuo pagamento di €${amount.toFixed(2)} per ${monthName} ${year}.`;
    
    if (remaining > 0) {
      message += ` Saldo rimanente: €${remaining.toFixed(2)}`;
    } else if (remaining === 0) {
      message += ` Il tuo saldo è stato completamente saldato! ✓`;
    } else {
      message += ` Hai un credito di €${Math.abs(remaining).toFixed(2)}`;
    }

    await addDoc(collection(db, "notifications"), {
      title: "✅ Pagamento ricevuto",
      message,
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
    
    console.log("📬 Notifica pagamento inviata al proprietario:", proprietarioId);
  } catch (error) {
    console.error("Errore invio notifica pagamento:", error);
  }
}

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) {
      return JSON.parse(decodeURIComponent(userCookie.value));
    }
    return null;
  } catch {
    return null;
  }
}

// GET - Ottieni statistiche pagamenti
export async function GET(request: NextRequest) {
  const currentUser = await getFirebaseUser();
  
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  if (currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo gli amministratori" }, { status: 403 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const summaryOnly = searchParams.get("summary") === "true";

    // OTTIMIZZATO: Esegui le query in parallelo
    const [propertiesWithoutPrice, clientStats] = await Promise.all([
      getPropertiesWithoutPrice(),
      getClientPaymentStats(month, year)
    ]);

    // OTTIMIZZATO: Calcola il summary dai dati già caricati (no chiamata doppia!)
    const summary = calculateSummaryFromStats(clientStats);

    if (summaryOnly) {
      return NextResponse.json({
        success: true,
        month,
        year,
        summary,
        propertiesWithoutPrice,
      });
    }

    return NextResponse.json({
      success: true,
      month,
      year,
      summary,
      clients: clientStats,
      propertiesWithoutPrice,
    });
  } catch (error) {
    console.error("Errore GET payments:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// POST - Registra nuovo pagamento
export async function POST(request: NextRequest) {
  const currentUser = await getFirebaseUser();
  
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  if (currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo gli amministratori" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    // Azione: Registra pagamento
    if (action === "create_payment" || !action) {
      const { proprietarioId, proprietarioName, month, year, amount, type, method, note, totalDue, totalPaid } = body;

      if (!proprietarioId || !month || !year || !amount || !type || !method) {
        return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
      }

      const paymentId = await createPayment({
        proprietarioId,
        proprietarioName,
        month,
        year,
        amount: parseFloat(amount),
        type,
        method,
        note,
        createdBy: currentUser.id,
      });

      // 📬 Notifica al proprietario
      const amountNum = parseFloat(amount);
      const totalDueNum = parseFloat(totalDue || "0");
      const totalPaidNum = parseFloat(totalPaid || "0") + amountNum;
      
      await notifyOwnerPaymentReceived(
        proprietarioId,
        amountNum,
        totalDueNum,
        totalPaidNum,
        month,
        year
      );

      return NextResponse.json({
        success: true,
        paymentId,
        message: `Pagamento di €${amount} registrato`,
      });
    }

    // Azione: Override totale
    if (action === "set_override") {
      const { proprietarioId, month, year, originalTotal, overrideTotal, reason } = body;

      if (!proprietarioId || !month || !year || overrideTotal === undefined || !reason) {
        return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
      }

      const overrideId = await setPaymentOverride({
        proprietarioId,
        month,
        year,
        originalTotal: parseFloat(originalTotal),
        overrideTotal: parseFloat(overrideTotal),
        reason,
        createdBy: currentUser.id,
      });

      return NextResponse.json({
        success: true,
        overrideId,
        message: `Totale modificato a €${overrideTotal}`,
      });
    }

    // Azione: Reset override (ripristina totale originale)
    if (action === "reset_override") {
      const { proprietarioId, month, year } = body;

      if (!proprietarioId || !month || !year) {
        return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
      }

      await deletePaymentOverride(proprietarioId, month, year);

      return NextResponse.json({
        success: true,
        message: "Totale ripristinato al valore calcolato",
      });
    }

    return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
  } catch (error) {
    console.error("Errore POST payments:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// DELETE - Elimina pagamento
export async function DELETE(request: NextRequest) {
  const currentUser = await getFirebaseUser();
  
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  if (currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo gli amministratori" }, { status: 403 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const paymentId = searchParams.get("id");

    if (!paymentId) {
      return NextResponse.json({ error: "ID pagamento richiesto" }, { status: 400 });
    }

    await deletePayment(paymentId);

    return NextResponse.json({
      success: true,
      message: "Pagamento eliminato",
    });
  } catch (error) {
    console.error("Errore DELETE payment:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
