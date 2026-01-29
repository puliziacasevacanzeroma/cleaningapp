import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
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

export async function GET() {
  const user = await getFirebaseUser();
  
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const startTime = Date.now();
    
    // UNA SOLA QUERY per tutte le proprietà!
    const q = query(collection(db, "properties"), orderBy("name", "asc"));
    const snapshot = await getDocs(q);
    
    console.log(`⚡ API properties/list: ${snapshot.docs.length} docs in ${Date.now() - startTime}ms`);
    
    const activeProperties: any[] = [];
    const pendingProperties: any[] = [];
    const deactivationRequests: any[] = [];
    const suspendedProperties: any[] = [];
    
    // Raggruppa per status in una sola passata
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const property = {
        id: doc.id,
        ...data,
        ownerId: data.ownerId || "",
        cleaningPrice: data.cleaningPrice || 0,
        monthlyTotal: 0,
        cleaningsThisMonth: 0,
        completedThisMonth: 0,
        _count: { bookings: 0, cleanings: 0 },
        owner: { name: data.ownerName || "", email: data.ownerEmail || "" },
      };
      
      // Prima controlla se c'è richiesta di disattivazione
      if (data.deactivationRequested && data.status === "ACTIVE") {
        deactivationRequests.push(property);
      } else {
        switch (data.status) {
          case "ACTIVE": activeProperties.push(property); break;
          case "PENDING": pendingProperties.push(property); break;
          case "SUSPENDED": 
          case "INACTIVE": suspendedProperties.push(property); break;
        }
      }
    });

    return NextResponse.json({
      activeProperties,
      pendingProperties,
      deactivationRequests,
      suspendedProperties,
      proprietari: [],
    });
  } catch (error) {
    console.error("Errore fetch proprietà:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}