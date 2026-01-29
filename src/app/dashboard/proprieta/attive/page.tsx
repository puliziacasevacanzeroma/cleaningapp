import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { ProprietaAttiveClient } from "~/components/dashboard/ProprietaAttiveClient";

export const dynamic = 'force-dynamic';

export default async function ProprietaAttivePage() {
  const propertiesSnap = await getDocs(
    query(
      collection(db, "properties"),
      where("status", "==", "ACTIVE"),
      orderBy("name", "asc")
    )
  );
  
  const properties = propertiesSnap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || "Senza nome",
      address: data.address || "",
      status: data.status || "ACTIVE",
      cleaningPrice: data.cleaningPrice || 0,
      maxGuests: data.maxGuests || 2,
      owner: {
        id: data.ownerId || "",
        name: data.ownerName || "",
        email: data.ownerEmail || ""
      },
      _count: {
        bookings: 0,
        cleanings: 0
      }
    };
  });
  
  return <ProprietaAttiveClient properties={properties} />;
}