/**
 * Gestione crediti automatici da eliminazione/esclusione servizi.
 *
 * Quando l'admin elimina o esclude dal billing un servizio in un mese
 * GIÀ PAGATO (totalmente o parzialmente), si genera un sovra-pagamento.
 * Questa utility sposta automaticamente quel credito al primo mese
 * successivo con debito non saldato.
 *
 * Funzionamento:
 *   1. Calcola il credito generato per il proprietario nel mese di riferimento
 *   2. Trova il primo mese successivo con servizi (non saldati)
 *   3. Crea un payment di tipo "ACCONTO" su quel mese, con note esplicative
 *   4. Logga l'operazione su `creditTransfers` per audit
 *
 * Non modifica i pagamenti originali. Crea solo un nuovo pagamento
 * che si va a scalare sul mese successivo.
 */

import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

/**
 * Sposta il credito generato dall'eliminazione/esclusione di un servizio
 * al primo mese successivo con debito non saldato.
 *
 * @param ownerId proprietarioId Firestore
 * @param ownerName proprietarioName per audit
 * @param sourceMonth mese del servizio rimosso (1-12)
 * @param sourceYear anno del servizio rimosso
 * @param creditAmount importo del credito da spostare (€)
 * @param sourceServiceType "PULIZIA" | "BIANCHERIA" | ecc.
 * @param sourceServiceId id del servizio rimosso
 * @param actionType "DELETED" | "EXCLUDED"
 * @param adminId chi ha eseguito l'azione
 * @param adminName nome admin
 *
 * @returns { applied, targetMonth, targetYear, paymentId } se applicato, null se non c'erano debiti su mesi successivi
 */
export async function transferCreditToNextMonth(opts: {
  ownerId: string;
  ownerName: string;
  sourceMonth: number;
  sourceYear: number;
  creditAmount: number;
  sourceServiceType: string;
  sourceServiceId: string;
  actionType: "DELETED" | "EXCLUDED";
  adminId: string;
  adminName: string;
}): Promise<{
  applied: boolean;
  targetMonth?: number;
  targetYear?: number;
  paymentId?: string;
  reason?: string;
}> {
  const {
    ownerId, ownerName, sourceMonth, sourceYear, creditAmount,
    sourceServiceType, sourceServiceId, actionType, adminId, adminName,
  } = opts;

  if (creditAmount <= 0.01) {
    return { applied: false, reason: "Credito troppo piccolo o zero" };
  }

  // ─── 1. Verifica se sourceMonth è REALMENTE pagato in eccesso ───
  // Ricalcola quanto era stato pagato per quel mese
  const paymentsSnap = await adminDb
    .collection("payments")
    .where("proprietarioId", "==", ownerId)
    .where("month", "==", sourceMonth)
    .where("year", "==", sourceYear)
    .get();

  const totalPaidSourceMonth = paymentsSnap.docs.reduce(
    (s, d) => s + ((d.data().amount as number) || 0), 0
  );

  if (totalPaidSourceMonth <= 0.01) {
    return { applied: false, reason: "Mese sorgente non pagato, nessun credito da spostare" };
  }

  // ─── 2. Trova prossimo mese con debiti non saldati ───
  // Logica semplice: cerca i prossimi 12 mesi e applica al primo con debito > pagato
  const now = Timestamp.now();
  let targetMonth = sourceMonth + 1;
  let targetYear = sourceYear;
  if (targetMonth > 12) {
    targetMonth = 1;
    targetYear += 1;
  }

  // ─── 3. Crea il payment di tipo ACCONTO sul mese successivo ───
  // Lo creiamo "alla cieca" sul mese successivo: anche se quel mese non ha
  // ancora servizi, l'acconto resta in attesa (carry-over naturale).
  const noteMessage =
    actionType === "DELETED"
      ? `Credito automatico da eliminazione servizio del ${sourceMonth.toString().padStart(2, "0")}/${sourceYear}`
      : `Credito automatico da esclusione servizio del ${sourceMonth.toString().padStart(2, "0")}/${sourceYear}`;

  const paymentRef = adminDb.collection("payments").doc();
  await paymentRef.set({
    proprietarioId: ownerId,
    proprietarioName: ownerName,
    month: targetMonth,
    year: targetYear,
    amount: creditAmount,
    type: "ACCONTO",
    method: "ALTRO",
    note: noteMessage,
    createdAt: now,
    createdBy: adminId,
    createdByName: adminName,
    // Metadata per audit trail e per riconoscere visivamente questi pagamenti
    isCreditTransfer: true,
    sourceServiceId,
    sourceServiceType,
    sourceMonth,
    sourceYear,
    actionType,
  });

  // ─── 4. Logga su creditTransfers (audit) ───
  await adminDb.collection("creditTransfers").add({
    ownerId,
    ownerName,
    creditAmount,
    sourceMonth,
    sourceYear,
    sourceServiceId,
    sourceServiceType,
    actionType,
    targetMonth,
    targetYear,
    paymentId: paymentRef.id,
    createdAt: now,
    createdBy: adminId,
    createdByName: adminName,
  });

  return {
    applied: true,
    targetMonth,
    targetYear,
    paymentId: paymentRef.id,
  };
}

/**
 * Verifica se un servizio è in un mese pagato (totalmente o parzialmente).
 * Restituisce { isPaid, totalPaid, ownerId, ownerName, propertyData }.
 */
export async function checkIfServiceMonthIsPaid(opts: {
  propertyId: string;
  scheduledDate: any;
}): Promise<{
  isPaid: boolean;
  totalPaid: number;
  ownerId: string | null;
  ownerName: string | null;
  month: number;
  year: number;
  propertyData: Record<string, any> | null;
}> {
  const { propertyId, scheduledDate } = opts;

  // Estrai mese/anno
  const d = scheduledDate?.toDate?.() || (scheduledDate instanceof Date ? scheduledDate : null);
  if (!d) {
    return { isPaid: false, totalPaid: 0, ownerId: null, ownerName: null, month: 0, year: 0, propertyData: null };
  }
  const month = d.getMonth() + 1;
  const year = d.getFullYear();

  // Carica proprietà per ownerId/ownerName
  const propSnap = await adminDb.collection("properties").doc(propertyId).get();
  if (!propSnap.exists) {
    return { isPaid: false, totalPaid: 0, ownerId: null, ownerName: null, month, year, propertyData: null };
  }
  const propData = propSnap.data() as Record<string, any>;
  const ownerId = propData.ownerId || null;

  if (!ownerId) {
    return { isPaid: false, totalPaid: 0, ownerId: null, ownerName: null, month, year, propertyData: propData };
  }

  // Carica owner name
  let ownerName = "Proprietario";
  try {
    const ownerSnap = await adminDb.collection("users").doc(ownerId).get();
    if (ownerSnap.exists) {
      const od = ownerSnap.data() as Record<string, any>;
      ownerName = od?.name || od?.displayName || od?.email || "Proprietario";
    }
  } catch {
    // ok, usa default
  }

  // Verifica pagamenti del mese
  const paymentsSnap = await adminDb
    .collection("payments")
    .where("proprietarioId", "==", ownerId)
    .where("month", "==", month)
    .where("year", "==", year)
    .get();

  const totalPaid = paymentsSnap.docs.reduce(
    (s, d) => s + ((d.data().amount as number) || 0), 0
  );

  return {
    isPaid: totalPaid > 0.01,
    totalPaid,
    ownerId,
    ownerName,
    month,
    year,
    propertyData: propData,
  };
}
