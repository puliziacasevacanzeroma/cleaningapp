/**
 * API: /api/deletion-requests/[id]
 * 
 * GET - Dettaglio singola richiesta
 * PATCH - Approva o rifiuta richiesta (solo admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  doc, 
  getDoc, 
  updateDoc, 
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  Timestamp 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { cookies } from "next/headers";

// Helper per ottenere utente corrente
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

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET - Dettaglio richiesta
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const requestRef = doc(db, "deletionRequests", id);
    const requestSnap = await getDoc(requestRef);

    if (!requestSnap.exists()) {
      return NextResponse.json({ error: "Richiesta non trovata" }, { status: 404 });
    }

    const data = requestSnap.data();
    const isAdmin = user.role?.toUpperCase() === "ADMIN";
    const isOwner = data.ownerId === user.id;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // Carica info proprietà
    let property = null;
    if (data.propertyId) {
      const propRef = doc(db, "properties", data.propertyId);
      const propSnap = await getDoc(propRef);
      if (propSnap.exists()) {
        property = { id: propSnap.id, ...propSnap.data() };
      }
    }

    // Carica info proprietario
    let owner = null;
    if (data.ownerId) {
      const ownerRef = doc(db, "users", data.ownerId);
      const ownerSnap = await getDoc(ownerRef);
      if (ownerSnap.exists()) {
        owner = { id: ownerSnap.id, ...ownerSnap.data() };
      }
    }

    return NextResponse.json({
      success: true,
      request: {
        id: requestSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || null,
        updatedAt: data.updatedAt?.toDate?.() || null,
        reviewedAt: data.reviewedAt?.toDate?.() || null,
        property,
        owner,
      },
    });

  } catch (error) {
    console.error("Errore recupero richiesta:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

/**
 * PATCH - Approva o rifiuta richiesta (solo admin)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // Solo admin può approvare/rifiutare
    const isAdmin = user.role?.toUpperCase() === "ADMIN";
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Solo gli admin possono gestire le richieste di cancellazione" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status, adminNote } = body;

    if (!status || !["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "Status deve essere 'approved' o 'rejected'" },
        { status: 400 }
      );
    }

    // Recupera la richiesta
    const requestRef = doc(db, "deletionRequests", id);
    const requestSnap = await getDoc(requestRef);

    if (!requestSnap.exists()) {
      return NextResponse.json({ error: "Richiesta non trovata" }, { status: 404 });
    }

    const requestData = requestSnap.data();

    if (requestData.status !== "pending") {
      return NextResponse.json(
        { error: "Questa richiesta è già stata processata" },
        { status: 400 }
      );
    }

    // Aggiorna la richiesta
    await updateDoc(requestRef, {
      status,
      adminNote: adminNote || null,
      reviewedBy: user.id,
      reviewedByName: user.name,
      reviewedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Recupera la proprietà
    const propertyRef = doc(db, "properties", requestData.propertyId);
    const propertySnap = await getDoc(propertyRef);

    if (status === "approved") {
      // ✅ APPROVATO: Disattiva/Cancella la proprietà
      
      if (propertySnap.exists()) {
        // Opzione 1: Soft delete (disattiva)
        await updateDoc(propertyRef, {
          status: "DELETED",
          deletedAt: Timestamp.now(),
          deletedBy: user.id,
          deletionReason: requestData.reason,
          deactivationRequested: false,
          isActive: false,
          updatedAt: Timestamp.now(),
        });

        // Cancella anche le prenotazioni future
        const bookingsQuery = query(
          collection(db, "bookings"),
          where("propertyId", "==", requestData.propertyId),
          where("status", "==", "confirmed")
        );
        const bookingsSnap = await getDocs(bookingsQuery);
        
        for (const bookingDoc of bookingsSnap.docs) {
          const bookingData = bookingDoc.data();
          const checkIn = bookingData.checkIn?.toDate?.() || new Date(bookingData.checkIn);
          
          // Cancella solo prenotazioni future
          if (checkIn > new Date()) {
            await updateDoc(doc(db, "bookings", bookingDoc.id), {
              status: "cancelled",
              cancelledAt: Timestamp.now(),
              cancelReason: "Proprietà cancellata",
              updatedAt: Timestamp.now(),
            });
          }
        }

        // Cancella pulizie future
        const cleaningsQuery = query(
          collection(db, "cleanings"),
          where("propertyId", "==", requestData.propertyId),
          where("status", "in", ["PENDING", "SCHEDULED", "IN_PROGRESS"])
        );
        const cleaningsSnap = await getDocs(cleaningsQuery);
        
        for (const cleaningDoc of cleaningsSnap.docs) {
          await updateDoc(doc(db, "cleanings", cleaningDoc.id), {
            status: "CANCELLED",
            cancelledAt: Timestamp.now(),
            cancelReason: "Proprietà cancellata",
            updatedAt: Timestamp.now(),
          });
        }
      }

      // Notifica al proprietario: APPROVATA
      await addDoc(collection(db, "notifications"), {
        title: "Richiesta Cancellazione Approvata",
        message: `La tua richiesta di cancellazione per "${requestData.propertyName}" è stata approvata. La proprietà è stata rimossa dal sistema.${adminNote ? ` Nota: ${adminNote}` : ""}`,
        type: "SUCCESS",
        recipientRole: "PROPRIETARIO",
        recipientId: requestData.ownerId,
        senderId: user.id,
        senderName: user.name,
        status: "UNREAD",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      console.log(`✅ Richiesta ${id} APPROVATA - Proprietà ${requestData.propertyId} cancellata`);

    } else {
      // ❌ RIFIUTATO: Ripristina la proprietà
      
      if (propertySnap.exists()) {
        await updateDoc(propertyRef, {
          status: "ACTIVE",
          deactivationRequested: false,
          deactivationReason: null,
          deactivationRequestedAt: null,
          updatedAt: Timestamp.now(),
        });
      }

      // Notifica al proprietario: RIFIUTATA
      await addDoc(collection(db, "notifications"), {
        title: "Richiesta Cancellazione Rifiutata",
        message: `La tua richiesta di cancellazione per "${requestData.propertyName}" è stata rifiutata.${adminNote ? ` Motivo: ${adminNote}` : ""} La proprietà rimane attiva.`,
        type: "WARNING",
        recipientRole: "PROPRIETARIO",
        recipientId: requestData.ownerId,
        senderId: user.id,
        senderName: user.name,
        status: "UNREAD",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      console.log(`❌ Richiesta ${id} RIFIUTATA - Proprietà ${requestData.propertyId} ripristinata`);
    }

    return NextResponse.json({
      success: true,
      message: status === "approved" 
        ? "Richiesta approvata - Proprietà cancellata"
        : "Richiesta rifiutata - Proprietà ripristinata",
      status,
    });

  } catch (error) {
    console.error("Errore gestione richiesta:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

/**
 * DELETE - Annulla richiesta (solo proprietario, se pending)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const requestRef = doc(db, "deletionRequests", id);
    const requestSnap = await getDoc(requestRef);

    if (!requestSnap.exists()) {
      return NextResponse.json({ error: "Richiesta non trovata" }, { status: 404 });
    }

    const requestData = requestSnap.data();
    const isOwner = requestData.ownerId === user.id;
    const isAdmin = user.role?.toUpperCase() === "ADMIN";

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    if (requestData.status !== "pending") {
      return NextResponse.json(
        { error: "Solo le richieste in attesa possono essere annullate" },
        { status: 400 }
      );
    }

    // Ripristina la proprietà
    const propertyRef = doc(db, "properties", requestData.propertyId);
    await updateDoc(propertyRef, {
      status: "ACTIVE",
      deactivationRequested: false,
      deactivationReason: null,
      deactivationRequestedAt: null,
      updatedAt: Timestamp.now(),
    });

    // Cancella la richiesta
    await deleteDoc(requestRef);

    console.log(`🔄 Richiesta ${id} annullata dal proprietario`);

    return NextResponse.json({
      success: true,
      message: "Richiesta di cancellazione annullata",
    });

  } catch (error) {
    console.error("Errore annullamento richiesta:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
