/**
 * API: POST /api/contract/accept
 * 
 * Registra l'accettazione del contratto/regolamento da parte dell'utente.
 * Raccoglie automaticamente: IP, userAgent, timestamp, timezone.
 * Aggiorna lo stato dell'utente.
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
  orderBy,
  limit
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { COLLECTIONS, generateDocId } from "~/lib/firebase/collections";
import type { 
  RegulationDocument, 
  ContractAcceptance,
  AcceptContractRequest,
  AcceptContractResponse,
  AcceptanceConsents,
  AcceptanceMetadata,
  ApplicableRole
} from "~/types/contract";
import { 
  isValidFiscalCode, 
  areConsentsValid, 
  isSignatureValid,
  formatFiscalCode 
} from "~/types/contract";

// Verifica autenticazione
async function getAuthenticatedUser(request: NextRequest): Promise<{
  uid: string;
  role: ApplicableRole;
  email: string;
} | null> {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }
    
    const token = authHeader.replace("Bearer ", "");
    
    try {
      // Decodifica JWT (placeholder - in produzione usa Firebase Admin)
      const payload = JSON.parse(atob(token.split(".")[1]));
      
      const userDocRef = doc(db, COLLECTIONS.USERS, payload.user_id || payload.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      if (!userDocSnap.exists()) {
        return null;
      }
      
      const userData = userDocSnap.data();
      return {
        uid: payload.user_id || payload.uid,
        role: userData.role as ApplicableRole,
        email: payload.email || userData.email,
      };
    } catch {
      return null;
    }
  } catch (error) {
    console.error("Errore autenticazione:", error);
    return null;
  }
}

// Ottiene l'IP del client
function getClientIP(request: NextRequest): string {
  // Prova vari header usati da proxy/load balancer
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  
  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }
  
  // Fallback
  return "unknown";
}

// Ottiene il timezone dalla request o usa default
function getTimezone(request: NextRequest): string {
  const tz = request.headers.get("x-timezone");
  return tz || "Europe/Rome";
}

export async function POST(request: NextRequest) {
  try {
    // 1. Verifica autenticazione
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Non autenticato" } as AcceptContractResponse,
        { status: 401 }
      );
    }

    const { uid, role, email } = user;

    // 2. Parse del body
    let body: AcceptContractRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Body non valido" } as AcceptContractResponse,
        { status: 400 }
      );
    }

    const { fullName, fiscalCode, signatureImage, consents, geolocation } = body;

    // 3. Validazioni
    
    // Nome completo
    if (!fullName || fullName.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: "Nome e cognome obbligatorio (minimo 3 caratteri)" } as AcceptContractResponse,
        { status: 400 }
      );
    }

    // Codice fiscale
    const formattedFiscalCode = formatFiscalCode(fiscalCode || "");
    if (!isValidFiscalCode(formattedFiscalCode)) {
      return NextResponse.json(
        { success: false, error: "Codice fiscale non valido" } as AcceptContractResponse,
        { status: 400 }
      );
    }

    // Consensi
    if (!consents || !areConsentsValid(consents)) {
      return NextResponse.json(
        { success: false, error: "Tutti i consensi obbligatori devono essere accettati" } as AcceptContractResponse,
        { status: 400 }
      );
    }

    // Firma
    if (!isSignatureValid(signatureImage)) {
      return NextResponse.json(
        { success: false, error: "Firma non valida o mancante" } as AcceptContractResponse,
        { status: 400 }
      );
    }

    // 4. Trova il documento attivo per il ruolo
    const documentsQuery = query(
      collection(db, COLLECTIONS.REGULATION_DOCUMENTS),
      where("isActive", "==", true),
      where("isDraft", "==", false),
      orderBy("effectiveFrom", "desc"),
      limit(10)
    );

    const documentsSnapshot = await getDocs(documentsQuery);
    
    let activeDocument: (RegulationDocument & { id: string }) | null = null;
    
    for (const docSnapshot of documentsSnapshot.docs) {
      const docData = docSnapshot.data() as RegulationDocument;
      const applicableTo = docData.applicableTo || [];
      
      if (applicableTo.includes(role) || applicableTo.includes("ALL")) {
        activeDocument = {
          ...docData,
          id: docSnapshot.id,
        };
        break;
      }
    }

    if (!activeDocument) {
      return NextResponse.json(
        { success: false, error: "Nessun documento regolamentare attivo trovato" } as AcceptContractResponse,
        { status: 404 }
      );
    }

    // 5. Verifica se già accettato
    const existingAcceptanceQuery = query(
      collection(db, COLLECTIONS.CONTRACT_ACCEPTANCES),
      where("userId", "==", uid),
      where("documentId", "==", activeDocument.id),
      where("status", "==", "valid"),
      limit(1)
    );

    const existingAcceptance = await getDocs(existingAcceptanceQuery);
    
    if (!existingAcceptance.empty) {
      const existingDoc = existingAcceptance.docs[0].data();
      if (existingDoc.documentHash === activeDocument.hash) {
        return NextResponse.json(
          { 
            success: false, 
            error: "Hai già accettato questa versione del documento",
            acceptanceId: existingAcceptance.docs[0].id 
          } as AcceptContractResponse,
          { status: 409 }
        );
      }
      // Se l'hash è diverso, il documento è stato modificato - permetti nuova accettazione
    }

    // 6. Raccogli metadata
    const now = new Date();
    const timezone = getTimezone(request);
    
    const metadata: AcceptanceMetadata = {
      ipAddress: getClientIP(request),
      userAgent: request.headers.get("user-agent") || "unknown",
      timestamp: Timestamp.now(),
      timezone,
      localTime: now.toLocaleString("it-IT", { timeZone: timezone }),
      language: request.headers.get("accept-language")?.split(",")[0] || "it",
      platform: request.headers.get("sec-ch-ua-platform")?.replace(/"/g, "") || undefined,
    };

    // Aggiungi geolocation se fornita
    if (geolocation && geolocation.latitude && geolocation.longitude) {
      metadata.geolocation = {
        latitude: geolocation.latitude,
        longitude: geolocation.longitude,
        accuracy: geolocation.accuracy || 0,
        timestamp: Date.now(),
      };
    }

    // 7. Crea il documento di accettazione
    const acceptanceId = generateDocId(COLLECTIONS.CONTRACT_ACCEPTANCES);
    
    const acceptance: Omit<ContractAcceptance, "id"> = {
      userId: uid,
      userRole: role,
      userEmail: email,
      
      fullName: fullName.trim(),
      fiscalCode: formattedFiscalCode,
      
      documentId: activeDocument.id,
      documentType: activeDocument.type,
      documentVersion: activeDocument.version,
      documentHash: activeDocument.hash,
      documentTitle: activeDocument.title,
      documentUrl: activeDocument.pdfUrl,
      
      signatureImage,
      signatureMethod: "drawn",
      
      consents: consents as AcceptanceConsents,
      
      metadata,
      
      status: "valid",
      createdAt: Timestamp.now(),
    };

    // 8. Salva l'accettazione
    await setDoc(
      doc(db, COLLECTIONS.CONTRACT_ACCEPTANCES, acceptanceId),
      acceptance
    );

    console.log(`✅ Contratto accettato: ${acceptanceId} da utente ${uid}`);

    // 9. Aggiorna il documento utente
    const userDocRef = doc(db, COLLECTIONS.USERS, uid);
    await updateDoc(userDocRef, {
      contractAcceptance: {
        accepted: true,
        acceptanceId,
        version: activeDocument.version,
        acceptedAt: Timestamp.now(),
        needsReAcceptance: false,
      },
      // Se l'utente era in stato pending_contract, attivalo
      // (solo se il precedente stato era pending_contract)
      updatedAt: Timestamp.now(),
    });

    // Verifica se bisogna cambiare lo status
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      const userData = userDocSnap.data();
      if (userData.status === "pending_contract" || userData.status === "PENDING_CONTRACT") {
        await updateDoc(userDocRef, {
          status: "ACTIVE",
        });
        console.log(`✅ Utente ${uid} attivato dopo accettazione contratto`);
      }
    }

    // 10. Rispondi con successo
    const response: AcceptContractResponse = {
      success: true,
      acceptanceId,
      message: "Contratto accettato con successo",
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("Errore API contract/accept:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Errore interno del server" 
      } as AcceptContractResponse,
      { status: 500 }
    );
  }
}
