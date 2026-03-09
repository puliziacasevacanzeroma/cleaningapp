import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { deletePropertyWithCascade } from "~/lib/firebase/firestore-data-admin";
import { validateBody, UserUpdateSchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

// GET - Ottieni singolo utente
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getApiUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const docRef = adminDb.collection("users").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    const data = docSnap.data() as Record<string, any>;
    return NextResponse.json({
      id: docSnap.id,
      name: data.name || "",
      surname: data.surname || "",
      email: data.email || "",
      phone: data.phone || "",
      role: data.role || "",
      status: data.status || "ACTIVE",
      suspendedAt: data.suspendedAt || null,
      suspendedReason: data.suspendedReason || null,
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null,
      firebaseAuthUid: data.firebaseAuthUid || null,
    });
  } catch (error) {
    console.error("Errore GET utente:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// PATCH - Modifica utente (include sospensione/riattivazione)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getApiUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await validateBody(request, UserUpdateSchema);
    if (body instanceof Response) return body;
    const { name, surname, email, phone, role, status, password, suspendedReason, action } = body;

    // Recupera utente per avere firebaseAuthUid
    const docRef = adminDb.collection("users").doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }
    
    const userData = docSnap.data() as Record<string, any>;
    const firebaseAuthUid = userData.firebaseAuthUid;

    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    // Gestione azione specifica
    if (action === 'suspend') {
      // Sospendi utente
      updateData.status = 'SUSPENDED';
      updateData.suspendedAt = Timestamp.now();
      updateData.suspendedReason = suspendedReason || 'Sospeso dall\'amministratore';
      
      // Disabilita in Firebase Auth se configurato
      if (firebaseAuthUid && process.env.FIREBASE_ADMIN_PROJECT_ID) {
        try {
          const { disableAuthUser } = await import("~/lib/firebase/admin");
          await disableAuthUser(firebaseAuthUid);
        } catch (authError) {
          console.error("Errore disabilitazione Firebase Auth:", authError);
          // Continuiamo comunque con Firestore
        }
      }
      
    } else if (action === 'reactivate') {
      // Riattiva utente
      updateData.status = 'ACTIVE';
      updateData.suspendedAt = null;
      updateData.suspendedReason = null;
      
      // Riabilita in Firebase Auth se configurato
      if (firebaseAuthUid && process.env.FIREBASE_ADMIN_PROJECT_ID) {
        try {
          const { enableAuthUser } = await import("~/lib/firebase/admin");
          await enableAuthUser(firebaseAuthUid);
        } catch (authError) {
          console.error("Errore riabilitazione Firebase Auth:", authError);
          // Continuiamo comunque con Firestore
        }
      }
      
    } else {
      // Aggiornamento normale
      if (name !== undefined) updateData.name = name;
      if (surname !== undefined) updateData.surname = surname;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (role !== undefined) updateData.role = role;
      if (status !== undefined) updateData.status = status;
      
      if (password) {
        const bcrypt = await import("bcryptjs");
        updateData.password = await bcrypt.hash(password, 10);
        
        // Aggiorna anche in Firebase Auth se configurato
        if (firebaseAuthUid && process.env.FIREBASE_ADMIN_PROJECT_ID) {
          try {
            const { updateAuthUserPassword } = await import("~/lib/firebase/admin");
            await updateAuthUserPassword(firebaseAuthUid, password);
          } catch (authError) {
            console.error("Errore aggiornamento password Firebase Auth:", authError);
          }
        }
      }
    }

    await docRef.update(updateData);

    return NextResponse.json({ success: true, action: action || 'update' });
  } catch (error) {
    console.error("Errore PATCH utente:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// DELETE - Elimina utente
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getApiUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    
    // Non permettere di eliminare se stessi
    if (id === currentUser.id) {
      return NextResponse.json({ error: "Non puoi eliminare il tuo stesso account" }, { status: 400 });
    }
    
    // Recupera utente per avere firebaseAuthUid e ruolo
    const docRef = adminDb.collection("users").doc(id);
    const docSnap = await docRef.get();
    
    const cascadeResults = { properties: 0, cleanings: 0, orders: 0, bookings: 0 };
    
    if (docSnap.exists) {
      const userData = docSnap.data() as Record<string, any>;
      const firebaseAuthUid = userData.firebaseAuthUid;
      
      // ─── CASCADE: Elimina proprietà dell'utente e tutti i dati collegati ───
      const userRole = (userData.role || "").toUpperCase();
      if (userRole === "PROPRIETARIO" || userRole === "CLIENTE") {
        if (process.env.NODE_ENV !== "production") console.log(`🗑️ Cascade delete per utente ${id} (${userData.name || userData.email})`);
        
        // Cerca tutte le proprietà di questo utente
        const propsSnapshot = await adminDb.collection("properties").where("ownerId", "==", id).get();
        
        if (process.env.NODE_ENV !== "production") console.log(`   📦 Trovate ${propsSnapshot.size} proprietà da eliminare`);
        
        for (const propDoc of propsSnapshot.docs) {
          try {
            // Elimina tutti i dati collegati alla proprietà
            const result = await deletePropertyWithCascade(propDoc.id);
            cascadeResults.cleanings += result.deletedCleanings;
            cascadeResults.orders += result.deletedOrders;
            cascadeResults.bookings += result.deletedBookings;
            
            // Elimina la proprietà stessa
            // @ts-expect-error TODO-FIX: TS2339 Property 'delete' does not exist on type '"properties"'.
            await adminDb.collection("properties".delete().doc(propDoc.id));
            cascadeResults.properties++;
            
            if (process.env.NODE_ENV !== "production") console.log(`   ✓ Proprietà "${(propDoc.data() as Record<string, any>).name}" eliminata con cascade`);
          } catch (propError) {
            console.error(`   ❌ Errore eliminazione proprietà ${propDoc.id}:`, propError);
          }
        }
        
        if (process.env.NODE_ENV !== "production") console.log(`   📊 Cascade totale: ${cascadeResults.properties} proprietà, ${cascadeResults.cleanings} pulizie, ${cascadeResults.orders} ordini, ${cascadeResults.bookings} prenotazioni`);
      }
      
      // ─── CASCADE: Se operatore, elimina notifiche destinate a lui ───
      if (userRole === "OPERATORE_PULIZIE" || userRole === "RIDER") {
        try {
          const notifsSnapshot = await adminDb.collection("notifications").get();
          for (const notifDoc of notifsSnapshot.docs) {
            // @ts-expect-error TODO-FIX: TS2339 Property 'delete' does not exist on type '"notifications"'.
            await adminDb.collection("notifications".delete().doc(notifDoc.id));
          }
          if (process.env.NODE_ENV !== "production") console.log(`   ✓ Eliminate ${notifsSnapshot.size} notifiche dell'operatore/rider`);
        } catch (e) {
          console.error("Errore eliminazione notifiche utente:", e);
        }
      }
      
      // Elimina da Firebase Auth se configurato
      if (firebaseAuthUid && process.env.FIREBASE_ADMIN_PROJECT_ID) {
        try {
          const { deleteAuthUser } = await import("~/lib/firebase/admin");
          await deleteAuthUser(firebaseAuthUid);
        } catch (authError) {
          console.error("Errore eliminazione Firebase Auth:", authError);
        }
      }
    }
    
    // Elimina il documento utente
    await docRef.delete();
    
    return NextResponse.json({ 
      success: true,
      cascade: cascadeResults,
    });
  } catch (error) {
    console.error("Errore DELETE utente:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}