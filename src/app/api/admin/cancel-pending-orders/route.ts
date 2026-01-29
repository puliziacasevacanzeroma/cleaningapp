import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { collection, getDocs, updateDoc, doc, Timestamp, query, where } from "firebase/firestore";
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

export async function POST(req: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { deleteAll } = body; // Se true, cancella TUTTI gli ordini pending

    const now = Timestamp.now();
    
    // Query per ordini PENDING (da assegnare)
    const ordersQuery = query(
      collection(db, "orders"),
      where("status", "in", ["PENDING", "pending", "DA_ASSEGNARE"])
    );
    
    const ordersSnapshot = await getDocs(ordersQuery);
    
    console.log(`🔍 Trovati ${ordersSnapshot.docs.length} ordini PENDING`);
    
    let cancelledCount = 0;
    
    for (const orderDoc of ordersSnapshot.docs) {
      try {
        await updateDoc(doc(db, "orders", orderDoc.id), {
          status: "CANCELLED",
          cancelledAt: now,
          cancelledBy: user.id,
          cancelReason: "Cancellazione massiva admin",
          updatedAt: now
        });
        cancelledCount++;
        console.log(`✅ Ordine ${orderDoc.id} cancellato`);
      } catch (err) {
        console.error(`❌ Errore cancellazione ordine ${orderDoc.id}:`, err);
      }
    }

    return NextResponse.json({ 
      success: true, 
      cancelled: cancelledCount,
      total: ordersSnapshot.docs.length,
      message: `${cancelledCount} ordini cancellati su ${ordersSnapshot.docs.length}`
    });
    
  } catch (error) {
    console.error("Errore cancellazione ordini:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// GET per vedere quanti ordini pending ci sono
export async function GET() {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const ordersQuery = query(
      collection(db, "orders"),
      where("status", "in", ["PENDING", "pending", "DA_ASSEGNARE"])
    );
    
    const ordersSnapshot = await getDocs(ordersQuery);
    
    const orders = ordersSnapshot.docs.map(doc => ({
      id: doc.id,
      propertyName: doc.data().propertyName,
      status: doc.data().status,
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString()
    }));

    return NextResponse.json({ 
      count: orders.length,
      orders
    });
    
  } catch (error) {
    console.error("Errore:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
