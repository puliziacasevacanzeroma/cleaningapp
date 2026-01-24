/**
 * API: GET /api/contract/current
 * 
 * Ritorna il documento regolamentare attivo per il ruolo dell'utente loggato,
 * insieme allo stato di accettazione dell'utente.
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  doc,
  getDoc 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { COLLECTIONS } from "~/lib/firebase/collections";
import type { 
  RegulationDocument, 
  ContractAcceptance,
  CurrentDocumentResponse,
  ApplicableRole 
} from "~/types/contract";

// Verifica autenticazione tramite cookie o header
async function getAuthenticatedUser(request: NextRequest): Promise<{
  uid: string;
  role: ApplicableRole;
  email: string;
} | null> {
  try {
    // Prova a ottenere l'utente dal cookie di sessione
    const sessionCookie = request.cookies.get("session")?.value;
    
    if (!sessionCookie) {
      // Prova con header Authorization
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return null;
      }
      
      // Per ora, decodifica il token dal client
      // In produzione, usa Firebase Admin SDK per verificare il token
      const token = authHeader.replace("Bearer ", "");
      
      // Decodifica base64 (questo è un placeholder - in produzione usa Firebase Admin)
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        
        // Recupera il ruolo dal database
        const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, payload.user_id || payload.uid));
        if (!userDoc.exists()) {
          return null;
        }
        
        const userData = userDoc.data();
        return {
          uid: payload.user_id || payload.uid,
          role: userData.role as ApplicableRole,
          email: payload.email || userData.email,
        };
      } catch {
        return null;
      }
    }
    
    // Se c'è un cookie, decodificalo (placeholder)
    // In produzione, verifica il cookie con Firebase Admin SDK
    return null;
  } catch (error) {
    console.error("Errore autenticazione:", error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verifica autenticazione
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return NextResponse.json(
        { error: "Non autenticato" },
        { status: 401 }
      );
    }

    const { uid, role } = user;

    // 1. Trova il documento regolamentare attivo per il ruolo dell'utente
    // Filtra per: applicableTo contiene role O "ALL", isActive = true
    // Ordina per effectiveFrom DESC, prendi il primo
    
    const documentsQuery = query(
      collection(db, COLLECTIONS.REGULATION_DOCUMENTS),
      where("isActive", "==", true),
      where("isDraft", "==", false),
      orderBy("effectiveFrom", "desc"),
      limit(10) // Prendi alcuni per filtrare poi per ruolo
    );

    const documentsSnapshot = await getDocs(documentsQuery);
    
    // Filtra per ruolo (Firestore non supporta array-contains con OR)
    let activeDocument: RegulationDocument | null = null;
    
    for (const docSnapshot of documentsSnapshot.docs) {
      const docData = docSnapshot.data() as RegulationDocument;
      const applicableTo = docData.applicableTo || [];
      
      // Controlla se il documento si applica a questo ruolo
      if (applicableTo.includes(role) || applicableTo.includes("ALL")) {
        activeDocument = {
          ...docData,
          id: docSnapshot.id,
        };
        break; // Prendi il primo (più recente)
      }
    }

    // Se non c'è documento attivo
    if (!activeDocument) {
      const response: CurrentDocumentResponse = {
        document: null,
        userAcceptance: null,
        needsAcceptance: false,
        message: "Nessun documento regolamentare attivo per il tuo ruolo",
      };
      
      return NextResponse.json(response);
    }

    // 2. Verifica se l'utente ha già accettato questa versione
    const acceptanceQuery = query(
      collection(db, COLLECTIONS.CONTRACT_ACCEPTANCES),
      where("userId", "==", uid),
      where("documentId", "==", activeDocument.id),
      where("status", "==", "valid"),
      limit(1)
    );

    const acceptanceSnapshot = await getDocs(acceptanceQuery);
    
    let userAcceptance: ContractAcceptance | null = null;
    let needsAcceptance = true;
    
    if (!acceptanceSnapshot.empty) {
      const acceptanceDoc = acceptanceSnapshot.docs[0];
      userAcceptance = {
        ...acceptanceDoc.data() as ContractAcceptance,
        id: acceptanceDoc.id,
      };
      
      // Verifica che l'hash corrisponda (integrità documento)
      if (userAcceptance.documentHash === activeDocument.hash) {
        needsAcceptance = false;
      } else {
        // Documento modificato, necessita ri-accettazione
        userAcceptance.status = "expired";
        needsAcceptance = true;
      }
    }

    const response: CurrentDocumentResponse = {
      document: activeDocument,
      userAcceptance,
      needsAcceptance,
      message: needsAcceptance 
        ? "È necessario accettare il regolamento per continuare"
        : "Regolamento già accettato",
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("Errore API contract/current:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
