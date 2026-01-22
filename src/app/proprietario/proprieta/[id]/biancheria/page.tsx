import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import { doc, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import Link from "next/link";
import { BiancheriaConfigurator } from "~/components/proprietario/BiancheriaConfigurator";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

export default async function BiancheriaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getFirebaseUser();
  if (!user) redirect("/login");

  const { id } = await params;

  const propertySnap = await getDoc(doc(db, "properties", id));
  
  if (!propertySnap.exists()) notFound();
  
  const propertyData = propertySnap.data();
  
  // Verifica proprietario (se non admin)
  if (user.role?.toUpperCase() === "PROPRIETARIO" && propertyData.ownerId !== user.id) {
    notFound();
  }

  const property = {
    id: propertySnap.id,
    name: propertyData.name || "Proprietà",
    maxGuests: propertyData.maxGuests || 10,
    linenConfigs: propertyData.linenConfigs || []
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link href="/proprietario/proprieta" className="hover:text-slate-700">Proprietà</Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <Link href={`/proprietario/proprieta/${property.id}`} className="hover:text-slate-700">{property.name}</Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-slate-800 font-medium">Biancheria</span>
      </div>

      <div className="bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 rounded-3xl p-6 lg:p-8 mb-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold">Configurazione Biancheria</h1>
              <p className="text-white/80">{property.name}</p>
            </div>
          </div>
          <p className="text-white/70 mt-4 max-w-xl">
            Configura la biancheria necessaria per ogni numero di ospiti. 
            Quando inserisci il numero di ospiti in una prenotazione, il sistema utilizzerà 
            automaticamente la configurazione corrispondente.
          </p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="font-semibold text-amber-800">Come funziona?</h3>
            <p className="text-sm text-amber-700 mt-1">
              Per ogni numero di ospiti (1, 2, 3...) puoi definire esattamente quanta biancheria serve. 
              Quando il proprietario indica il numero di ospiti della prenotazione, il sistema creerà 
              automaticamente l'ordine di biancheria per il rider.
            </p>
          </div>
        </div>
      </div>

      <BiancheriaConfigurator 
        propertyId={property.id}
        maxGuests={property.maxGuests}
        existingConfigs={property.linenConfigs}
      />
    </div>
  );
}