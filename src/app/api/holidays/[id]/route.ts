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
// GET - Dettaglio festività
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
    const docRef = doc(db, "holidays", id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Festività non trovata" }, { status: 404 });
    }
    
    const data = docSnap.data();
    
    return NextResponse.json({ 
      holiday: {
        id: docSnap.id,
        ...data,
        date: data.date?.toDate?.() || null,
      }
    });
  } catch (error) {
    console.error("Errore GET holiday:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// PATCH - Modifica festività (solo admin)
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
      return NextResponse.json({ error: "Solo admin può modificare festività" }, { status: 403 });
    }
    
    const { id } = await params;
    const body = await req.json();
    
    const docRef = doc(db, "holidays", id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Festività non trovata" }, { status: 404 });
    }
    
    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };
    
    // Campi aggiornabili
    if (body.name !== undefined) updateData.name = body.name;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    
    // Ricorrenza
    if (body.isRecurring !== undefined) {
      updateData.isRecurring = body.isRecurring;
      if (body.isRecurring) {
        if (body.recurringMonth) updateData.recurringMonth = parseInt(body.recurringMonth);
        if (body.recurringDay) updateData.recurringDay = parseInt(body.recurringDay);
        updateData.date = null; // Rimuovi data specifica
      }
    }
    
    // Data specifica (per non ricorrenti)
    if (body.date !== undefined && !body.isRecurring) {
      updateData.date = Timestamp.fromDate(new Date(body.date));
    }
    
    // Maggiorazione
    if (body.surchargeType !== undefined) {
      updateData.surchargeType = body.surchargeType;
      if (body.surchargeType === "percentage") {
        updateData.surchargePercentage = parseFloat(body.surchargePercentage);
        updateData.surchargeFixed = null;
      } else {
        updateData.surchargeFixed = parseFloat(body.surchargeFixed);
        updateData.surchargePercentage = null;
      }
    } else if (body.surchargePercentage !== undefined) {
      updateData.surchargePercentage = parseFloat(body.surchargePercentage);
    } else if (body.surchargeFixed !== undefined) {
      updateData.surchargeFixed = parseFloat(body.surchargeFixed);
    }
    
    // Applicabilità servizi
    if (body.appliesToAllServices !== undefined) {
      updateData.appliesToAllServices = body.appliesToAllServices;
    }
    if (body.applicableServiceTypes !== undefined) {
      updateData.applicableServiceTypes = body.applicableServiceTypes;
    }
    
    await updateDoc(docRef, updateData);
    
    console.log(`✅ Festività ${id} aggiornata`);
    
    return NextResponse.json({ 
      success: true,
      message: "Festività aggiornata"
    });
  } catch (error) {
    console.error("Errore PATCH holiday:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE - Elimina festività (solo admin)
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
      return NextResponse.json({ error: "Solo admin può eliminare festività" }, { status: 403 });
    }
    
    const { id } = await params;
    const docRef = doc(db, "holidays", id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Festività non trovata" }, { status: 404 });
    }
    
    const holiday = docSnap.data();
    
    await deleteDoc(docRef);
    
    console.log(`🗑️ Festività ${id} eliminata (${holiday.name})`);
    
    return NextResponse.json({ 
      success: true,
      message: `Festività "${holiday.name}" eliminata`
    });
  } catch (error) {
    console.error("Errore DELETE holiday:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
