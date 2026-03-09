/**
 * API: POST /api/contract/accept
 */

import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS } from "~/lib/firebase/collections";
import type { AcceptContractRequest, RegulationDocument, ApplicableRole } from "~/types/contract";
import { isValidFiscalCode, areConsentsValid, isSignatureValid } from "~/types/contract";
import { validateBody, ContractAcceptSchema } from "~/lib/validation/schemas";

async function getUserInfo(request: NextRequest): Promise<{ uid: string; role: ApplicableRole; email: string } | null> {
  const userId = request.headers.get("X-User-Id");
  const userRole = request.headers.get("X-User-Role");
  const userEmail = request.headers.get("X-User-Email");
  if (userId) return { uid: userId, role: (userRole || "OPERATORE_PULIZIE") as ApplicableRole, email: userEmail || "" };
  const apiUser = await getApiUser();
  if (apiUser) return { uid: apiUser.id, role: apiUser.role as ApplicableRole, email: apiUser.email || "" };
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const userInfo = await getUserInfo(request);
    if (!userInfo) return NextResponse.json({ success: false, error: "Non autenticato" }, { status: 401 });

    const { uid, role, email } = userInfo;
    const body = await validateBody(request, ContractAcceptSchema);
    if (body instanceof Response) return body;
    const { fullName, fiscalCode, signatureImage, consents, geolocation } = body;

    if (!fullName || fullName.trim().length < 3)
      return NextResponse.json({ success: false, error: "Nome completo richiesto (minimo 3 caratteri)" }, { status: 400 });
    if (!isValidFiscalCode(fiscalCode))
      return NextResponse.json({ success: false, error: "Codice fiscale non valido" }, { status: 400 });
    // @ts-expect-error TODO-FIX: TS2345 Argument of type 'Record<string, boolean> | undefined' is not assignable to para...
    if (!areConsentsValid(consents))
      return NextResponse.json({ success: false, error: "Tutti i consensi obbligatori devono essere accettati" }, { status: 400 });
    if (!isSignatureValid(signatureImage))
      return NextResponse.json({ success: false, error: "Firma non valida" }, { status: 400 });

    // Trova documento corrente
    const docsSnapshot = await adminDb.collection(COLLECTIONS.REGULATION_DOCUMENTS).where("isActive", "==", true).get();

    let currentDocument: RegulationDocument | null = null;
    for (const docSnapshot of docsSnapshot.docs) {
      const data = docSnapshot.data() as Record<string, any>;
      const applicableTo = data.applicableTo as string[] || [];
      if (data.isDraft === true) continue;
      if (applicableTo.includes(role) || applicableTo.includes("ALL")) {
        currentDocument = { id: docSnapshot.id, ...data } as RegulationDocument;
        break;
      }
    }

    if (!currentDocument)
      return NextResponse.json({ success: false, error: "Nessun documento da accettare" }, { status: 404 });

    // Verifica se già accettato
    const existingSnapshot = await adminDb.collection(COLLECTIONS.CONTRACT_ACCEPTANCES)
      .where("userId", "==", uid)
      .where("status", "==", "valid")
      .get();

    for (const existingDoc of existingSnapshot.docs) {
      const data = existingDoc.data() as Record<string, any>;
      if (data.documentId === currentDocument.id && data.documentHash === currentDocument.hash) {
        return NextResponse.json({ success: true, acceptanceId: existingDoc.id, message: "Documento già accettato" });
      }
    }

    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const timezone = request.headers.get("x-timezone") || "Europe/Rome";
    const now = new Date();
    const localTime = now.toLocaleString("it-IT", { timeZone: timezone });

    const acceptanceData = {
      userId: uid, userRole: role, userEmail: email,
      fullName: fullName.trim(), fiscalCode: fiscalCode.toUpperCase(),
      documentId: currentDocument.id, documentType: currentDocument.type,
      documentVersion: currentDocument.version, documentHash: currentDocument.hash,
      documentTitle: currentDocument.title, signatureImage, signatureMethod: "drawn",
      consents,
      metadata: {
        ipAddress: typeof ipAddress === 'string' ? ipAddress : ipAddress[0],
        userAgent, geolocation: geolocation || null,
        timestamp: Timestamp.now(), timezone, localTime,
      },
      status: "valid",
      createdAt: Timestamp.now(),
    };

    const acceptanceRef = await adminDb.collection(COLLECTIONS.CONTRACT_ACCEPTANCES).add(acceptanceData);

    // Aggiorna stato utente
    try {
      const userDocSnap = await adminDb.collection(COLLECTIONS.USERS).doc(uid).get();
      if (userDocSnap.exists) {
        const userData = userDocSnap.data()!;
        await adminDb.collection(COLLECTIONS.USERS).doc(uid).update({
          contractAcceptance: {
            accepted: true, acceptanceId: acceptanceRef.id,
            version: currentDocument.version, acceptedAt: Timestamp.now(), needsReAcceptance: false,
          },
          status: userData.status === "PENDING_CONTRACT" ? "ACTIVE" : userData.status,
          updatedAt: Timestamp.now(),
        });
      }
    } catch (updateError) {
      console.warn("⚠️ Errore aggiornamento utente (non bloccante):", updateError);
    }

    return NextResponse.json({ success: true, acceptanceId: acceptanceRef.id, message: "Contratto accettato con successo" });
  } catch (error) {
    console.error("❌ Errore API contract/accept:", error);
    return NextResponse.json({ success: false, error: "Errore durante l'accettazione: " + (error instanceof Error ? error.message : "sconosciuto") }, { status: 500 });
  }
}
