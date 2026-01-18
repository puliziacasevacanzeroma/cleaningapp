import { NextResponse } from "next/server";
import { getProperties } from "~/lib/firebase/firestore-data";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const properties = await getProperties();
    let synced = 0;
    
    for (const property of properties) {
      if (property.icalUrl) {
        await updateDoc(doc(db, "properties", property.id), { 
          lastIcalSync: new Date(),
          updatedAt: new Date()
        });
        synced++;
      }
    }
    
    return NextResponse.json({ success: true, synced });
  } catch (error) {
    console.error("Errore sync-all-ical:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}