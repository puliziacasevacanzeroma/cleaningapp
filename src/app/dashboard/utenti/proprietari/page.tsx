import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { UtentiClient } from "~/components/dashboard/UtentiClient";

export const dynamic = 'force-dynamic';

export default async function ProprietariPage() {
  const usersSnap = await getDocs(
    query(
      collection(db, "users"),
      where("role", "==", "PROPRIETARIO"),
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
      role="owner"
      roleLabel="Proprietari"
      roleColor="text-violet-600"
      roleBgColor="bg-violet-50"
    />
  );
}
