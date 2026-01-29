import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { collection, getDocs, updateDoc, doc, Timestamp, query, where, deleteDoc } from "firebase/firestore";
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
    const { hardDelete } = body; // Se true, elimina completamente invece di cancellare

    const now = Timestamp.now();
    
    // Prendi TUTTI gli ordini
    const ordersSnapshot = await getDocs(collection(db, "orders"));
    
    console.log(`🔍 Trovati ${ordersSnapshot.docs.length} ordini totali`);
    
    // Filtra quelli che NON sono completati o già cancellati
    // Se hardDelete, elimina TUTTI
    const ordersToCancel = hardDelete 
      ? ordersSnapshot.docs 
      : ordersSnapshot.docs.filter(doc => {
          const status = doc.data().status;
          return status !== "COMPLETED" && status !== "CANCELLED" && status !== "DELIVERED";
        });
    
    console.log(`🎯 Ordini da ${hardDelete ? 'eliminare' : 'cancellare'}: ${ordersToCancel.length}`);
    
    let cancelledCount = 0;
    
    for (const orderDoc of ordersToCancel) {
      try {
        if (hardDelete) {
          await deleteDoc(doc(db, "orders", orderDoc.id));
        } else {
          await updateDoc(doc(db, "orders", orderDoc.id), {
            status: "CANCELLED",
            cancelledAt: now,
            cancelledBy: user.id,
            cancelReason: "Cancellazione massiva admin",
            updatedAt: now
          });
        }
        cancelledCount++;
        console.log(`✅ Ordine ${orderDoc.id} ${hardDelete ? 'eliminato' : 'cancellato'} (era: ${orderDoc.data().status})`);
      } catch (err) {
        console.error(`❌ Errore ordine ${orderDoc.id}:`, err);
      }
    }

    return NextResponse.json({ 
      success: true, 
      cancelled: cancelledCount,
      total: ordersToCancel.length,
      message: `${cancelledCount} ordini ${hardDelete ? 'eliminati' : 'cancellati'}`
    });
    
  } catch (error) {
    console.error("Errore cancellazione ordini:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// GET per vedere tutti gli ordini e il loro status
export async function GET() {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const ordersSnapshot = await getDocs(collection(db, "orders"));
    
    // Raggruppa per status
    const byStatus: Record<string, number> = {};
    const orders = ordersSnapshot.docs.map(doc => {
      const data = doc.data();
      byStatus[data.status] = (byStatus[data.status] || 0) + 1;
      return {
        id: doc.id,
        propertyName: data.propertyName,
        status: data.status,
        createdAt: data.createdAt?.toDate?.()?.toISOString()
      };
    });

    return NextResponse.json({ 
      totalOrders: orders.length,
      byStatus,
      orders
    });
    
  } catch (error) {
    console.error("Errore:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
