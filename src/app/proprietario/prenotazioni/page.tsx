"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { getPropertiesByOwner, getBookings } from "~/lib/firebase/firestore-data";
import Link from "next/link";

export default function PrenotazioniPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    async function loadData() {
      if (!user?.id) return;
      
      try {
        const props = await getPropertiesByOwner(user.id);
        const propertyIds = props.map(p => p.id);
        const propertyMap = Object.fromEntries(props.map(p => [p.id, p]));
        
        const allBookings = await getBookings();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const myBookings = allBookings
          .filter(b => {
            if (!propertyIds.includes(b.propertyId)) return false;
            const checkOut = b.checkOut?.toDate?.() || new Date(0);
            return checkOut >= today;
          })
          .map(b => ({
            id: b.id,
            propertyId: b.propertyId,
            property: propertyMap[b.propertyId] || { name: "Proprietà", address: "" },
            guestName: b.guestName || "Ospite",
            checkIn: b.checkIn?.toDate?.() || new Date(),
            checkOut: b.checkOut?.toDate?.() || new Date(),
            guestsCount: b.guests || b.adults || 0,
            status: b.status || "CONFIRMED"
          }))
          .sort((a, b) => a.checkOut.getTime() - b.checkOut.getTime());

        setBookings(myBookings);
      } catch (error) {
        console.error("Errore caricamento:", error);
      } finally {
        setDataLoading(false);
      }
    }
    
    if (user) loadData();
  }, [user]);

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  if (!user) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const pendingGuestsCount = bookings.filter(b => !b.guestsCount).length;

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Prenotazioni</h1>
        <p className="text-slate-500 mt-1">Gestisci le prenotazioni delle tue proprietà</p>
      </div>

      {pendingGuestsCount > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <p className="text-sm text-amber-700">
              Hai <strong>{pendingGuestsCount}</strong> prenotazioni senza numero ospiti.
            </p>
          </div>
        </div>
      )}

      {bookings.length > 0 ? (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const checkOutDate = new Date(booking.checkOut);
            const checkInDate = new Date(booking.checkIn);
            const isToday = checkOutDate.toDateString() === today.toDateString();
            const isTomorrow = checkOutDate.toDateString() === tomorrow.toDateString();
            const needsGuests = !booking.guestsCount;
            const isUrgent = needsGuests && (isToday || isTomorrow);

            return (
              <Link key={booking.id} href={`/proprietario/prenotazioni/${booking.id}`}
                className={`block bg-white rounded-2xl border p-4 hover:shadow-lg transition-all ${isUrgent ? "border-amber-300 bg-amber-50/50" : "border-slate-200"}`}>
                <div className="flex gap-4">
                  <div className="w-28 h-20 rounded-xl overflow-hidden bg-slate-200 flex-shrink-0">
                    <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
                      <span className="text-2xl">🏠</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-slate-800">{booking.property.name}</h3>
                        <p className="text-sm text-slate-500">{booking.property.address}</p>
                      </div>
                      {isUrgent && (
                        <span className="px-2 py-1 bg-amber-500 text-white text-xs font-medium rounded-lg">Urgente</span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                      <div>
                        <p className="text-slate-400 text-xs">Check-in</p>
                        <p className="text-slate-700 font-medium">{checkInDate.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs">Check-out</p>
                        <p className={`font-medium ${isToday ? "text-rose-600" : isTomorrow ? "text-amber-600" : "text-slate-700"}`}>
                          {isToday ? "Oggi" : isTomorrow ? "Domani" : checkOutDate.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs">Ospite</p>
                        <p className="text-slate-700 font-medium truncate">{booking.guestName}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs">N. Ospiti</p>
                        {needsGuests ? (
                          <p className="text-amber-600 font-medium">⚠️ Da inserire</p>
                        ) : (
                          <p className="text-emerald-600 font-medium">{booking.guestsCount} ospiti</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="text-slate-600 font-medium">Nessuna prenotazione</p>
        </div>
      )}
    </div>
  );
}