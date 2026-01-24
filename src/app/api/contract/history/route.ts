/**
 * API: GET /api/contract/history
 * 
 * Ritorna lo storico delle accettazioni contratto dell'utente loggato.
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs,
  doc,
  getDoc,
  limit as firestoreLimit
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { COLLECTIONS } from "~/lib/firebase/collections";
import type { 
  ContractAcceptance,
  AcceptanceHistoryResponse,
  ApplicableRole
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

export async function GET(request: NextRequest) {
  try {
    // 1. Verifica autenticazione
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return NextResponse.json(
        { error: "Non autenticato" },
        { status: 401 }
      );
    }

    const { uid } = user;

    // 2. Parametri opzionali dalla query string
    const { searchParams } = new URL(request.url);
    const limitParam = parseInt(searchParams.get("limit") || "50");
    const statusFilter = searchParams.get("status"); // "valid", "expired", "revoked"

    // 3. Costruisci la query
    let acceptanceQuery = query(
      collection(db, COLLECTIONS.CONTRACT_ACCEPTANCES),
      where("userId", "==", uid),
      orderBy("createdAt", "desc")
    );

    // Aggiungi filtro per status se specificato
    if (statusFilter && ["valid", "expired", "revoked", "pending"].includes(statusFilter)) {
      acceptanceQuery = query(
        collection(db, COLLECTIONS.CONTRACT_ACCEPTANCES),
        where("userId", "==", uid),
        where("status", "==", statusFilter),
        orderBy("createdAt", "desc")
      );
    }

    // Applica limit
    acceptanceQuery = query(acceptanceQuery, firestoreLimit(Math.min(limitParam, 100)));

    // 4. Esegui la query
    const acceptanceSnapshot = await getDocs(acceptanceQuery);

    // 5. Mappa i risultati
    const acceptances: ContractAcceptance[] = acceptanceSnapshot.docs.map(docSnapshot => ({
      ...docSnapshot.data() as ContractAcceptance,
      id: docSnapshot.id,
      // Rimuovi dati sensibili dalla risposta
      signatureImage: "[FIRMA]", // Non restituire l'immagine completa per motivi di sicurezza/performance
      metadata: {
        ...docSnapshot.data().metadata,
        ipAddress: maskIP(docSnapshot.data().metadata?.ipAddress),
      },
    }));

    // 6. Costruisci la risposta
    const response: AcceptanceHistoryResponse = {
      acceptances,
      total: acceptances.length,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("Errore API contract/history:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}

/**
 * Maschera parzialmente l'indirizzo IP per privacy
 * Es: "192.168.1.100" -> "192.168.x.x"
 */
function maskIP(ip: string | undefined): string {
  if (!ip || ip === "unknown") return "***";
  
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.x.x`;
  }
  
  // IPv6 o formato sconosciuto
  return ip.substring(0, 10) + "...";
}
