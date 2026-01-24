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
  limit
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { COLLECTIONS } from "~/lib/firebase/collections";
import type { 
  AcceptContractRequest,
  ContractAcceptance,
  RegulationDocument,
  ApplicableRole 
} from "~/types/contract";
import { isValidFiscalCode, areConsentsValid, isSignatureValid } from "~/types/contract";

// Ottiene info utente dagli header
function getUserFromHeaders(request: NextRequest): {
  uid: string;
  role: ApplicableRole;
  email: string;
} | null {
  const userId = request.headers.get("X-User-Id");
  const userRole = request.headers.get("X-User-Role");
  const userEmail = request.headers.get("X-User-Email");
  
  if (!userId) return null;
  
  return {
    uid: userId,
    role: (userRole || "OPERATORE_PULIZIE") as ApplicableRole,
    email: userEmail || "",
  };
}

// Genera hash
async function generateHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: NextRequest) {
  try {
    // Ottieni utente dagli header
    let userInfo = getUserFromHeaders(request);
    
    // Se non c'è negli header, prova cookie
    if (!userInfo) {
      const userCookie = request.cookies.get("firebase-user")?.value;
      if (userCookie) {
        try {
          const cookieData = JSON.parse(decodeURIComponent(userCookie));
          userInfo = {
            uid: cookieData.id,
            role: cookieData.role as ApplicableRole,
            email: cookieData.email || "",
          };
        } catch {
          // Cookie non valido
        }
      }
    }
    
    if (!userInfo) {
      return NextResponse.json(
        { success: false, error: "Non autenticato" },
        { status: 401 }
      );
    }

    const { uid, role, email } = userInfo;

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

    // Trova il documento corrente per questo ruolo
    const docsQuery = query(
      collection(db, COLLECTIONS.REGULATION_DOCUMENTS),
      where("isActive", "==", true),
      where("isDraft", "==", false),
      limit(10)
    );

    const docsSnapshot = await getDocs(docsQuery);
    
    let currentDocument: RegulationDocument | null = null;
    
    for (const docSnapshot of docsSnapshot.docs) {
      const data = docSnapshot.data();
      const applicableTo = data.applicableTo as string[];
      
      if (applicableTo.includes(role) || applicableTo.includes("ALL")) {
        currentDocument = {
          id: docSnapshot.id,
          ...data,
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

    // Verifica se già accettato con stesso hash
    const existingQuery = query(
      collection(db, COLLECTIONS.CONTRACT_ACCEPTANCES),
      where("userId", "==", uid),
      where("documentId", "==", currentDocument.id),
      where("documentHash", "==", currentDocument.hash),
      where("status", "==", "valid"),
      limit(1)
    );

    const existingSnapshot = await getDocs(existingQuery);
    
    if (!existingSnapshot.empty) {
      return NextResponse.json({
        success: true,
        acceptanceId: existingSnapshot.docs[0].id,
        message: "Documento già accettato",
      });
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
    const acceptanceData: Omit<ContractAcceptance, "id"> = {
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
      documentUrl: currentDocument.pdfUrl,
      signatureImage,
      signatureMethod: "drawn",
      consents,
      metadata: {
        ipAddress: typeof ipAddress === 'string' ? ipAddress : ipAddress[0],
        userAgent,
        geolocation: geolocation || undefined,
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

    // Aggiorna lo stato utente
    const userDocRef = doc(db, COLLECTIONS.USERS, uid);
    const userDoc = await getDoc(userDocRef);
    
    if (userDoc.exists()) {
      await updateDoc(userDocRef, {
        contractAcceptance: {
          accepted: true,
          acceptanceId: acceptanceRef.id,
          version: currentDocument.version,
          acceptedAt: Timestamp.now(),
          needsReAcceptance: false,
        },
        status: userDoc.data().status === "PENDING_CONTRACT" ? "ACTIVE" : userDoc.data().status,
        updatedAt: Timestamp.now(),
      });
    }

    console.log(`✅ Contratto accettato: utente ${uid}, documento ${currentDocument.id}`);

    return NextResponse.json({
      success: true,
      acceptanceId: acceptanceRef.id,
      message: "Contratto accettato con successo",
    });

  } catch (error) {
    console.error("Errore API contract/accept:", error);
    return NextResponse.json(
      { success: false, error: "Errore durante l'accettazione" },
      { status: 500 }
    );
  }
}
