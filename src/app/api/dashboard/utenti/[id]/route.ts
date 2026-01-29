import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, updateDoc, deleteDoc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) {
      return JSON.parse(decodeURIComponent(userCookie.value));
    }
    return null;
  } catch {
    return null;
  }
}

// GET - Ottieni singolo utente
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getFirebaseUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const docRef = doc(db, "users", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    const data = docSnap.data();
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
  const currentUser = await getFirebaseUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, surname, email, phone, role, status, password, suspendedReason, action } = body;

    // Recupera utente per avere firebaseAuthUid
    const docRef = doc(db, "users", id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }
    
    const userData = docSnap.data();
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

    await updateDoc(docRef, updateData);

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
  const currentUser = await getFirebaseUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    
    // Non permettere di eliminare se stessi
    if (id === currentUser.id) {
      return NextResponse.json({ error: "Non puoi eliminare il tuo stesso account" }, { status: 400 });
    }
    
    // Recupera utente per avere firebaseAuthUid
    const docRef = doc(db, "users", id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const userData = docSnap.data();
      const firebaseAuthUid = userData.firebaseAuthUid;
      
      // Elimina da Firebase Auth se configurato
      if (firebaseAuthUid && process.env.FIREBASE_ADMIN_PROJECT_ID) {
        try {
          const { deleteAuthUser } = await import("~/lib/firebase/admin");
          await deleteAuthUser(firebaseAuthUid);
        } catch (authError) {
          console.error("Errore eliminazione Firebase Auth:", authError);
          // Continuiamo comunque con Firestore
        }
      }
    }
    
    await deleteDoc(docRef);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore DELETE utente:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}