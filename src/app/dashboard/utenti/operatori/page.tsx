import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { UtentiClient } from "~/components/dashboard/UtentiClient";

export const dynamic = 'force-dynamic';

export default async function OperatoriPage() {
  const usersSnap = await getDocs(
    query(
      collection(db, "users"),
      where("role", "==", "OPERATORE_PULIZIE"),
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
      role="operator"
      roleLabel="Operatori"
      roleColor="text-emerald-600"
      roleBgColor="bg-emerald-50"
    />
  );
}
