import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, getDoc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// GET - Dettaglio tipo servizio
// ═══════════════════════════════════════════════════════════════

export async function GET(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    const docRef = doc(db, "serviceTypes", id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Tipo servizio non trovato" }, { status: 404 });
    }
    
    return NextResponse.json({ 
      serviceType: {
        id: docSnap.id,
        ...docSnap.data()
      }
    });
  } catch (error) {
    console.error("Errore GET service-type:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// PATCH - Modifica tipo servizio (solo admin)
// ═══════════════════════════════════════════════════════════════

export async function PATCH(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin può modificare tipi servizio" }, { status: 403 });
    }
    
    const { id } = await params;
    const body = await req.json();
    
    const docRef = doc(db, "serviceTypes", id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Tipo servizio non trovato" }, { status: 404 });
    }
    
    // Campi aggiornabili
    const allowedFields = [
      "name", "description", "baseSurcharge", "requiresManualPrice",
      "estimatedDuration", "extraDuration", "minPhotosRequired",
      "requiresRating", "adminOnly", "clientCanRequest", "requiresApproval",
      "requiresReason", "autoAssignEveryN", "sortOrder", "icon", "color",
      "availableForManual", "availableForAuto", "isActive"
    ];
    
    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };
    
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        // Parse numeri dove necessario
        if (["baseSurcharge"].includes(field)) {
          updateData[field] = body[field] !== null ? parseFloat(body[field]) : null;
        } else if (["estimatedDuration", "extraDuration", "minPhotosRequired", "sortOrder", "autoAssignEveryN"].includes(field)) {
          updateData[field] = body[field] !== null ? parseInt(body[field]) : null;
        } else {
          updateData[field] = body[field];
        }
      }
    }
    
    await updateDoc(docRef, updateData);
    
    console.log(`✅ Tipo servizio ${id} aggiornato`);
    
    return NextResponse.json({ 
      success: true,
      message: "Tipo servizio aggiornato"
    });
  } catch (error) {
    console.error("Errore PATCH service-type:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE - Elimina tipo servizio (solo admin)
// ═══════════════════════════════════════════════════════════════

export async function DELETE(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin può eliminare tipi servizio" }, { status: 403 });
    }
    
    const { id } = await params;
    const docRef = doc(db, "serviceTypes", id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Tipo servizio non trovato" }, { status: 404 });
    }
    
    const serviceType = docSnap.data();
    
    // Invece di eliminare, disattiva (per mantenere storico)
    const { searchParams } = new URL(req.url);
    const forceDelete = searchParams.get("force") === "true";
    
    if (forceDelete) {
      await deleteDoc(docRef);
      console.log(`🗑️ Tipo servizio ${id} eliminato permanentemente`);
      
      return NextResponse.json({ 
        success: true,
        deleted: true,
        message: `Tipo servizio "${serviceType.name}" eliminato`
      });
    } else {
      await updateDoc(docRef, {
        isActive: false,
        deactivatedAt: Timestamp.now(),
        deactivatedBy: user.id,
        updatedAt: Timestamp.now(),
      });
      
      console.log(`❌ Tipo servizio ${id} disattivato`);
      
      return NextResponse.json({ 
        success: true,
        deleted: false,
        deactivated: true,
        message: `Tipo servizio "${serviceType.name}" disattivato`
      });
    }
  } catch (error) {
    console.error("Errore DELETE service-type:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
