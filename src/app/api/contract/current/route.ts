/**
 * API: GET /api/contract/current
 * 
 * Ritorna il documento regolamentare attivo per il ruolo dell'utente.
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  collection, 
  query, 
  where, 
  getDocs,
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { COLLECTIONS } from "~/lib/firebase/collections";
import type { 
  RegulationDocument, 
  ContractAcceptance,
  ApplicableRole 
} from "~/types/contract";

// Ottiene info utente dagli header o cookie
function getUserInfo(request: NextRequest): {
  uid: string;
  role: ApplicableRole;
} | null {
  // Prima prova header
  const userId = request.headers.get("X-User-Id");
  const userRole = request.headers.get("X-User-Role");
  
  if (userId) {
    return {
      uid: userId,
      role: (userRole || "OPERATORE_PULIZIE") as ApplicableRole,
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
      };
    } catch {
      // Cookie non valido
    }
  }
  
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const userInfo = getUserInfo(request);
    
    if (!userInfo) {
      return NextResponse.json({
        document: null,
        userAcceptance: null,
        needsAcceptance: true,
        message: "Non autenticato"
      }, { status: 401 });
    }

    const { uid, role } = userInfo;
    console.log(`📄 Contract current - User: ${uid}, Role: ${role}`);

    // Query semplice: solo documenti attivi
    const docsQuery = query(
      collection(db, COLLECTIONS.REGULATION_DOCUMENTS),
      where("isActive", "==", true)
    );

    const docsSnapshot = await getDocs(docsQuery);
    console.log(`📄 Documenti trovati: ${docsSnapshot.size}`);
    
    // Filtra per ruolo e prendi il primo valido
    let currentDocument: RegulationDocument | null = null;
    
    for (const docSnapshot of docsSnapshot.docs) {
      const data = docSnapshot.data();
      const applicableTo = data.applicableTo as string[] || [];
      const isDraft = data.isDraft === true;
      
      // Salta le bozze
      if (isDraft) continue;
      
      // Verifica se il ruolo è incluso
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
      console.log(`📄 Nessun documento per ruolo ${role}`);
      return NextResponse.json({
        document: null,
        userAcceptance: null,
        needsAcceptance: false,
        message: "Nessun documento attivo per il tuo ruolo",
      });
    }

    console.log(`📄 Documento trovato: ${currentDocument.id} - ${currentDocument.title}`);

    // Verifica se l'utente ha già accettato
    const acceptanceQuery = query(
      collection(db, COLLECTIONS.CONTRACT_ACCEPTANCES),
      where("userId", "==", uid),
      where("documentId", "==", currentDocument.id),
      where("status", "==", "valid")
    );

    const acceptanceSnapshot = await getDocs(acceptanceQuery);
    
    let userAcceptance: ContractAcceptance | null = null;
    let needsAcceptance = true;

    if (!acceptanceSnapshot.empty) {
      const acceptanceDoc = acceptanceSnapshot.docs[0];
      const acceptanceData = acceptanceDoc.data();
      
      // Verifica hash
      if (acceptanceData.documentHash === currentDocument.hash) {
        userAcceptance = {
          id: acceptanceDoc.id,
          ...acceptanceData,
        } as ContractAcceptance;
        needsAcceptance = false;
        console.log(`✅ Utente ${uid} ha già accettato`);
      }
    }

    return NextResponse.json({
      document: currentDocument,
      userAcceptance,
      needsAcceptance,
      message: needsAcceptance ? "Accettazione richiesta" : "Già accettato",
    });

  } catch (error) {
    console.error("❌ Errore API contract/current:", error);
    return NextResponse.json({
      document: null,
      userAcceptance: null,
      needsAcceptance: true,
      message: "Errore server: " + (error instanceof Error ? error.message : "sconosciuto")
    }, { status: 500 });
  }
}
