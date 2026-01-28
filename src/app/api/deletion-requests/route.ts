/**
 * API: /api/deletion-requests
 * 
 * POST - Crea richiesta di cancellazione (proprietario)
 * GET - Lista richieste pending (solo admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc, 
  query, 
  where, 
  Timestamp,
  orderBy 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { cookies } from "next/headers";

// Helper per ottenere utente corrente da cookie
async function getCurrentUser() {
  const cookieStore = await cookies();
  const userCookie = cookieStore.get("firebase-user");
  if (!userCookie?.value) return null;
  try {
    return JSON.parse(decodeURIComponent(userCookie.value));
  } catch {
    return null;
  }
}

/**
 * POST - Crea richiesta di cancellazione
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json(
        { error: "Non autorizzato" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { propertyId, reason } = body;

    if (!propertyId || !reason) {
      return NextResponse.json(
        { error: "PropertyId e reason sono obbligatori" },
        { status: 400 }
      );
    }

    // Verifica che la proprietà esista
    const propertyRef = doc(db, "properties", propertyId);
    const propertySnap = await getDoc(propertyRef);

    if (!propertySnap.exists()) {
      return NextResponse.json(
        { error: "Proprietà non trovata" },
        { status: 404 }
      );
    }

    const propertyData = propertySnap.data();

    // Verifica che l'utente sia il proprietario (o admin)
    const isOwner = propertyData.ownerId === user.id || propertyData.userId === user.id;
    const isAdmin = user.role?.toUpperCase() === "ADMIN";
    
    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "Non sei autorizzato a richiedere la cancellazione di questa proprietà" },
        { status: 403 }
      );
    }

    // Verifica che non ci sia già una richiesta pending
    const existingQuery = query(
      collection(db, "deletionRequests"),
      where("propertyId", "==", propertyId),
      where("status", "==", "pending")
    );
    const existingSnap = await getDocs(existingQuery);
    
    if (!existingSnap.empty) {
      return NextResponse.json(
        { error: "Esiste già una richiesta di cancellazione in attesa per questa proprietà" },
        { status: 400 }
      );
    }

    // Recupera info proprietario
    let ownerData = { name: user.name, email: user.email };
    if (propertyData.ownerId && propertyData.ownerId !== user.id) {
      const ownerRef = doc(db, "users", propertyData.ownerId);
      const ownerSnap = await getDoc(ownerRef);
      if (ownerSnap.exists()) {
        const owner = ownerSnap.data();
        ownerData = { name: owner.name || "N/D", email: owner.email || "N/D" };
      }
    }

    // Crea la richiesta di cancellazione
    const deletionRequest = {
      propertyId,
      propertyName: propertyData.name || "Proprietà senza nome",
      ownerId: propertyData.ownerId || user.id,
      ownerName: ownerData.name,
      ownerEmail: ownerData.email,
      reason,
      status: "pending",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await addDoc(collection(db, "deletionRequests"), deletionRequest);

    // Aggiorna lo status della proprietà
    await updateDoc(propertyRef, {
      status: "PENDING_DELETION",
      deactivationRequested: true,
      deactivationReason: reason,
      deactivationRequestedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Crea UNA SOLA notifica per tutti gli admin (broadcast)
    // Il listener admin ascolta notifiche con recipientRole: "ADMIN"
    // quindi non serve creare una notifica per ogni admin
    await addDoc(collection(db, "notifications"), {
      title: "Richiesta Cancellazione Proprietà",
      message: `${ownerData.name} ha richiesto la cancellazione della proprietà "${propertyData.name}". Motivo: ${reason}`,
      type: "DELETION_REQUEST",
      recipientRole: "ADMIN",
      recipientId: null, // Broadcast a tutti gli admin
      senderId: user.id,
      senderName: user.name,
      status: "UNREAD",
      actionRequired: true,
      link: "/dashboard/proprieta/pending",
      metadata: {
        propertyId,
        deletionRequestId: docRef.id,
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    console.log(`🗑️ Richiesta cancellazione creata: ${docRef.id} per proprietà ${propertyId}`);

    return NextResponse.json({
      success: true,
      id: docRef.id,
      message: "Richiesta di cancellazione inviata con successo",
    });

  } catch (error) {
    console.error("Errore creazione richiesta cancellazione:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}

/**
 * GET - Lista richieste (solo admin)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json(
        { error: "Non autorizzato" },
        { status: 401 }
      );
    }

    // Solo admin può vedere tutte le richieste
    const isAdmin = user.role?.toUpperCase() === "ADMIN";
    
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";
    const propertyId = searchParams.get("propertyId");

    let requestsQuery;
    
    if (isAdmin) {
      // Admin vede tutte le richieste filtrate per status
      if (status === "all") {
        requestsQuery = query(
          collection(db, "deletionRequests"),
          orderBy("createdAt", "desc")
        );
      } else {
        requestsQuery = query(
          collection(db, "deletionRequests"),
          where("status", "==", status),
          orderBy("createdAt", "desc")
        );
      }
    } else {
      // Proprietario vede solo le sue richieste
      if (propertyId) {
        requestsQuery = query(
          collection(db, "deletionRequests"),
          where("ownerId", "==", user.id),
          where("propertyId", "==", propertyId)
        );
      } else {
        requestsQuery = query(
          collection(db, "deletionRequests"),
          where("ownerId", "==", user.id),
          orderBy("createdAt", "desc")
        );
      }
    }

    const snapshot = await getDocs(requestsQuery);
    
    const requests = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        
        // Carica info proprietà
        let property = null;
        if (data.propertyId) {
          const propRef = doc(db, "properties", data.propertyId);
          const propSnap = await getDoc(propRef);
          if (propSnap.exists()) {
            const propData = propSnap.data();
            property = {
              id: propSnap.id,
              name: propData.name,
              address: propData.address,
              status: propData.status,
            };
          }
        }

        // Carica info proprietario (solo per admin)
        let owner = null;
        if (isAdmin && data.ownerId) {
          const ownerRef = doc(db, "users", data.ownerId);
          const ownerSnap = await getDoc(ownerRef);
          if (ownerSnap.exists()) {
            const ownerData = ownerSnap.data();
            owner = {
              id: ownerSnap.id,
              name: ownerData.name,
              email: ownerData.email,
              phone: ownerData.phone,
            };
          }
        }

        return {
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || null,
          updatedAt: data.updatedAt?.toDate?.() || null,
          reviewedAt: data.reviewedAt?.toDate?.() || null,
          property,
          owner,
        };
      })
    );

    return NextResponse.json({
      success: true,
      requests,
      total: requests.length,
    });

  } catch (error) {
    console.error("Errore recupero richieste cancellazione:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
