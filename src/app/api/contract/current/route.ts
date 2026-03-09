/**
 * API: GET /api/contract/current
 */

import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { adminDb } from "~/lib/firebase/admin";
import { COLLECTIONS } from "~/lib/firebase/collections";
import type { RegulationDocument, ContractAcceptance, ApplicableRole } from "~/types/contract";

async function getUserInfo(request: NextRequest): Promise<{ uid: string; role: ApplicableRole } | null> {
  const userId = request.headers.get("X-User-Id");
  const userRole = request.headers.get("X-User-Role");
  if (userId) return { uid: userId, role: (userRole || "OPERATORE_PULIZIE") as ApplicableRole };
  const apiUser = await getApiUser();
  if (apiUser) return { uid: apiUser.id, role: apiUser.role as ApplicableRole };
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const userInfo = await getUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ document: null, userAcceptance: null, needsAcceptance: true, message: "Non autenticato" }, { status: 401 });
    }

    const { uid, role } = userInfo;

    const docsSnapshot = await adminDb.collection(COLLECTIONS.REGULATION_DOCUMENTS).where("isActive", "==", true).get();

    let currentDocument: RegulationDocument | null = null;
    for (const docSnapshot of docsSnapshot.docs) {
      const data = docSnapshot.data();
      const applicableTo = data.applicableTo as string[] || [];
      const docType = data.type || "";
      if (data.isDraft === true) continue;
      // Salta l'Allegato D — viene gestito separatamente per singola proprietà
      if (docType === "allegato_d_template") continue;
      if (applicableTo.includes(role) || applicableTo.includes("ALL")) {
        currentDocument = { id: docSnapshot.id, ...data } as RegulationDocument;
        break;
      }
    }

    if (!currentDocument) {
      return NextResponse.json({ document: null, userAcceptance: null, needsAcceptance: false, message: "Nessun documento attivo per il tuo ruolo" });
    }

    const acceptanceSnapshot = await adminDb.collection(COLLECTIONS.CONTRACT_ACCEPTANCES)
      .where("userId", "==", uid)
      .where("documentId", "==", currentDocument.id)
      .where("status", "==", "valid")
      .get();

    let userAcceptance: ContractAcceptance | null = null;
    let needsAcceptance = true;

    if (!acceptanceSnapshot.empty) {
      const acceptanceDoc = acceptanceSnapshot.docs[0];
      const acceptanceData = acceptanceDoc.data();
      if (acceptanceData.documentHash === currentDocument.hash) {
        userAcceptance = { id: acceptanceDoc.id, ...acceptanceData } as ContractAcceptance;
        needsAcceptance = false;
      }
    }

    return NextResponse.json({
      document: currentDocument, userAcceptance, needsAcceptance,
      message: needsAcceptance ? "Accettazione richiesta" : "Già accettato",
    });
  } catch (error) {
    console.error("❌ Errore API contract/current:", error);
    return NextResponse.json({ document: null, userAcceptance: null, needsAcceptance: true, message: "Errore server: " + (error instanceof Error ? error.message : "sconosciuto") }, { status: 500 });
  }
}
