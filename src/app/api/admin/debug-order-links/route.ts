import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { collection, getDocs, doc, updateDoc, Timestamp } from "firebase/firestore";
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

// GET: Mostra tutti gli ordini e le loro connessioni con le pulizie
export async function GET() {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // Carica tutti gli ordini
    const ordersSnapshot = await getDocs(collection(db, "orders"));
    const orders = ordersSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        propertyId: data.propertyId,
        propertyName: data.propertyName,
        cleaningId: data.cleaningId || "❌ NESSUNO",
        status: data.status,
        scheduledDate: data.scheduledDate?.toDate?.()?.toISOString?.()?.split('T')[0] || "N/A",
      };
    });

    // Carica tutte le pulizie
    const cleaningsSnapshot = await getDocs(collection(db, "cleanings"));
    const cleanings = cleaningsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        propertyId: data.propertyId,
        propertyName: data.propertyName,
        laundryOrderId: data.laundryOrderId || "❌ NESSUNO",
        status: data.status,
        scheduledDate: data.scheduledDate?.toDate?.()?.toISOString?.()?.split('T')[0] || "N/A",
      };
    });

    // Trova ordini senza cleaningId
    const ordersWithoutCleaningId = orders.filter(o => o.cleaningId === "❌ NESSUNO");
    
    // Trova pulizie senza laundryOrderId
    const cleaningsWithoutOrderId = cleanings.filter(c => c.laundryOrderId === "❌ NESSUNO");

    return NextResponse.json({
      summary: {
        totalOrders: orders.length,
        ordersWithoutCleaningId: ordersWithoutCleaningId.length,
        totalCleanings: cleanings.length,
        cleaningsWithoutOrderId: cleaningsWithoutOrderId.length,
      },
      orders,
      cleanings,
      issues: {
        ordersWithoutCleaningId,
        cleaningsWithoutOrderId,
      }
    });
    
  } catch (error) {
    console.error("Errore debug:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// POST: Collega automaticamente ordini e pulizie per propertyId + data
export async function POST() {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const now = Timestamp.now();
    
    // Carica tutti gli ordini
    const ordersSnapshot = await getDocs(collection(db, "orders"));
    const orders = ordersSnapshot.docs.map(doc => ({
      id: doc.id,
      ref: doc.ref,
      ...doc.data()
    }));

    // Carica tutte le pulizie
    const cleaningsSnapshot = await getDocs(collection(db, "cleanings"));
    const cleanings = cleaningsSnapshot.docs.map(doc => ({
      id: doc.id,
      ref: doc.ref,
      ...doc.data()
    }));

    let linkedCount = 0;
    const linkedPairs: {cleaningId: string, orderId: string, propertyName: string}[] = [];

    // Per ogni ordine senza cleaningId, cerca una pulizia corrispondente
    for (const order of orders) {
      if (order.cleaningId) continue; // Già collegato
      
      const orderDate = order.scheduledDate?.toDate?.()?.toISOString?.()?.split('T')[0];
      if (!orderDate || !order.propertyId) continue;
      
      // Cerca pulizia con stessa proprietà e data
      const matchingCleaning = cleanings.find(c => {
        const cleaningDate = c.scheduledDate?.toDate?.()?.toISOString?.()?.split('T')[0];
        return c.propertyId === order.propertyId && cleaningDate === orderDate;
      });
      
      if (matchingCleaning) {
        // Collega ordine -> pulizia
        await updateDoc(doc(db, "orders", order.id), {
          cleaningId: matchingCleaning.id,
          updatedAt: now
        });
        
        // Collega pulizia -> ordine (se non già fatto)
        if (!matchingCleaning.laundryOrderId) {
          await updateDoc(doc(db, "cleanings", matchingCleaning.id), {
            laundryOrderId: order.id,
            updatedAt: now
          });
        }
        
        linkedCount++;
        linkedPairs.push({
          cleaningId: matchingCleaning.id,
          orderId: order.id,
          propertyName: order.propertyName || matchingCleaning.propertyName || "N/A"
        });
        
        console.log(`✅ Collegati: Pulizia ${matchingCleaning.id} <-> Ordine ${order.id}`);
      }
    }

    return NextResponse.json({
      success: true,
      linkedCount,
      linkedPairs,
      message: `${linkedCount} ordini collegati alle rispettive pulizie`
    });
    
  } catch (error) {
    console.error("Errore linking:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
