/**
 * API: POST /api/contract/accept
 * 
 * Accetta un documento regolamentare con firma digitale.
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  collection, 
  addDoc, 
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { COLLECTIONS } from "~/lib/firebase/collections";
import type { 
  AcceptContractRequest,
  RegulationDocument,
  ApplicableRole 
} from "~/types/contract";
import { isValidFiscalCode, areConsentsValid, isSignatureValid } from "~/types/contract";

// Ottiene info utente dagli header o cookie
function getUserInfo(request: NextRequest): {
  uid: string;
  role: ApplicableRole;
  email: string;
} | null {
  // Prima prova header
  const userId = request.headers.get("X-User-Id");
  const userRole = request.headers.get("X-User-Role");
  const userEmail = request.headers.get("X-User-Email");
  
  if (userId) {
    return {
      uid: userId,
      role: (userRole || "OPERATORE_PULIZIE") as ApplicableRole,
      email: userEmail || "",
    };
  }
  
  // Poi prova cookie
  const userCookie = request.cookies.get("firebase-user")?.value;
  if (userCookie) {
    try {
      const cookieData = JSON.parse(decodeURIComponent(userCookie));
      return {
        uid: cookieData.id,
        role: cookieData.role as ApplicableRole,
        email: cookieData.email || "",
      };
    } catch {
      // Cookie non valido
    }
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const userInfo = getUserInfo(request);
    
    if (!userInfo) {
      return NextResponse.json(
        { success: false, error: "Non autenticato" },
        { status: 401 }
      );
    }

    const { uid, role, email } = userInfo;
    console.log(`📝 Contract accept - User: ${uid}, Role: ${role}`);

    // Parse body
    const body: AcceptContractRequest = await request.json();
    const { fullName, fiscalCode, signatureImage, consents, geolocation } = body;

    // Validazioni
    if (!fullName || fullName.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: "Nome completo richiesto (minimo 3 caratteri)" },
        { status: 400 }
      );
    }

    if (!isValidFiscalCode(fiscalCode)) {
      return NextResponse.json(
        { success: false, error: "Codice fiscale non valido" },
        { status: 400 }
      );
    }

    if (!areConsentsValid(consents)) {
      return NextResponse.json(
        { success: false, error: "Tutti i consensi obbligatori devono essere accettati" },
        { status: 400 }
      );
    }

    if (!isSignatureValid(signatureImage)) {
      return NextResponse.json(
        { success: false, error: "Firma non valida" },
        { status: 400 }
      );
    }

    // Trova il documento corrente - query semplice
    const docsQuery = query(
      collection(db, COLLECTIONS.REGULATION_DOCUMENTS),
      where("isActive", "==", true)
    );

    const docsSnapshot = await getDocs(docsQuery);
    
    let currentDocument: RegulationDocument | null = null;
    
    for (const docSnapshot of docsSnapshot.docs) {
      const data = docSnapshot.data();
      const applicableTo = data.applicableTo as string[] || [];
      const isDraft = data.isDraft === true;
      
      if (isDraft) continue;
      
      if (applicableTo.includes(role) || applicableTo.includes("ALL")) {
        currentDocument = {
          id: docSnapshot.id,
          type: data.type,
          version: data.version,
          title: data.title,
          content: data.content,
          hash: data.hash,
          applicableTo: data.applicableTo,
          effectiveFrom: data.effectiveFrom,
          isActive: data.isActive,
          isDraft: data.isDraft,
          createdAt: data.createdAt,
          createdBy: data.createdBy,
        } as RegulationDocument;
        break;
      }
    }

    if (!currentDocument) {
      return NextResponse.json(
        { success: false, error: "Nessun documento da accettare" },
        { status: 404 }
      );
    }

    console.log(`📝 Documento da accettare: ${currentDocument.id}`);

    // Verifica se già accettato - query semplice
    const existingQuery = query(
      collection(db, COLLECTIONS.CONTRACT_ACCEPTANCES),
      where("userId", "==", uid),
      where("status", "==", "valid")
    );

    const existingSnapshot = await getDocs(existingQuery);
    
    // Controlla se esiste già un'accettazione per questo documento con stesso hash
    for (const doc of existingSnapshot.docs) {
      const data = doc.data();
      if (data.documentId === currentDocument.id && data.documentHash === currentDocument.hash) {
        console.log(`✅ Già accettato: ${doc.id}`);
        return NextResponse.json({
          success: true,
          acceptanceId: doc.id,
          message: "Documento già accettato",
        });
      }
    }

    // Raccogli metadata
    const ipAddress = request.headers.get("x-forwarded-for") || 
                      request.headers.get("x-real-ip") || 
                      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const timezone = request.headers.get("x-timezone") || "Europe/Rome";

    const now = new Date();
    const localTime = now.toLocaleString("it-IT", { timeZone: timezone });

    // Crea record accettazione
    const acceptanceData = {
      userId: uid,
      userRole: role,
      userEmail: email,
      fullName: fullName.trim(),
      fiscalCode: fiscalCode.toUpperCase(),
      documentId: currentDocument.id,
      documentType: currentDocument.type,
      documentVersion: currentDocument.version,
      documentHash: currentDocument.hash,
      documentTitle: currentDocument.title,
      signatureImage,
      signatureMethod: "drawn",
      consents,
      metadata: {
        ipAddress: typeof ipAddress === 'string' ? ipAddress : ipAddress[0],
        userAgent,
        geolocation: geolocation || null,
        timestamp: Timestamp.now(),
        timezone,
        localTime,
      },
      status: "valid",
      createdAt: Timestamp.now(),
    };

    const acceptanceRef = await addDoc(
      collection(db, COLLECTIONS.CONTRACT_ACCEPTANCES),
      acceptanceData
    );

    console.log(`✅ Accettazione creata: ${acceptanceRef.id}`);

    // Aggiorna lo stato utente
    try {
      const userDocRef = doc(db, COLLECTIONS.USERS, uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        await updateDoc(userDocRef, {
          contractAcceptance: {
            accepted: true,
            acceptanceId: acceptanceRef.id,
            version: currentDocument.version,
            acceptedAt: Timestamp.now(),
            needsReAcceptance: false,
          },
          status: userData.status === "PENDING_CONTRACT" ? "ACTIVE" : userData.status,
          updatedAt: Timestamp.now(),
        });
        console.log(`✅ Utente ${uid} aggiornato`);
      }
    } catch (updateError) {
      console.warn("⚠️ Errore aggiornamento utente (non bloccante):", updateError);
    }

    return NextResponse.json({
      success: true,
      acceptanceId: acceptanceRef.id,
      message: "Contratto accettato con successo",
    });

  } catch (error) {
    console.error("❌ Errore API contract/accept:", error);
    return NextResponse.json(
      { success: false, error: "Errore durante l'accettazione: " + (error instanceof Error ? error.message : "sconosciuto") },
      { status: 500 }
    );
  }
}
