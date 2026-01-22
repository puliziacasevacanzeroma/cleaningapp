import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { DashboardClient } from "~/components/admin/DashboardClient";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

export default async function AdminDashboardPage() {
  const user = await getFirebaseUser();
  if (!user || user.role?.toUpperCase() !== "ADMIN") redirect("/login");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 7);

  // Carica dati da Firestore
  const [cleaningsSnap, usersSnap, propertiesSnap, bookingsSnap] = await Promise.all([
    getDocs(collection(db, "cleanings")),
    getDocs(collection(db, "users")),
    getDocs(query(collection(db, "properties"), where("status", "==", "ACTIVE"))),
    getDocs(collection(db, "bookings"))
  ]);

  // Calcola stats
  const cleaningsToday = cleaningsSnap.docs.filter(doc => {
    const data = doc.data();
    const schedDate = data.scheduledDate?.toDate?.() || new Date(data.scheduledDate);
    return schedDate >= today && schedDate < tomorrow;
  }).length;

  const operatorsActive = usersSnap.docs.filter(doc => {
    const data = doc.data();
    return data.role?.toUpperCase() === "OPERATORE_PULIZIE";
  }).length;

  const propertiesTotal = propertiesSnap.docs.length;

  const checkinsWeek = bookingsSnap.docs.filter(doc => {
    const data = doc.data();
    const checkIn = data.checkIn?.toDate?.() || new Date(data.checkIn);
    return checkIn >= weekStart && checkIn < tomorrow;
  }).length;

  // Pulizie di oggi con dettagli
  const cleaningsOfToday = cleaningsSnap.docs
    .filter(doc => {
      const data = doc.data();
      const schedDate = data.scheduledDate?.toDate?.() || new Date(data.scheduledDate);
      return schedDate >= today && schedDate < tomorrow;
    })
    .map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        propertyId: data.propertyId,
        propertyName: data.propertyName || "Proprietà",
        scheduledDate: data.scheduledDate?.toDate?.()?.toISOString() || new Date().toISOString(),
        scheduledTime: data.scheduledTime || "10:00",
        status: data.status || "SCHEDULED",
        operatorName: data.operatorName || null,
        guestName: data.guestName || null,
        guestsCount: data.guestsCount || 2
      };
    })
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

  return (
    <DashboardClient 
      userName={user.name || "Admin"}
      stats={{
        cleaningsToday,
        operatorsActive,
        propertiesTotal,
        checkinsWeek
      }}
      cleanings={cleaningsOfToday}
    />
  );
}