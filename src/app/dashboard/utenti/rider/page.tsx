import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { UtentiClient } from "~/components/dashboard/UtentiClient";

export const dynamic = 'force-dynamic';

export default async function RiderPage() {
  const usersSnap = await getDocs(
    query(
      collection(db, "users"),
      where("role", "==", "RIDER"),
      orderBy("name", "asc")
    )
  );
  
  const users = usersSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  return (
    <UtentiClient 
      users={users}
      role="rider"
      roleLabel="Rider"
      roleColor="text-sky-600"
      roleBgColor="bg-sky-50"
    />
  );
}
