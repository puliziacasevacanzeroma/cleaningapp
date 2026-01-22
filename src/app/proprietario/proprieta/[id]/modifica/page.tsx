import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import { doc, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import Link from "next/link";
import { ModificaProprietaForm } from "~/components/proprietario/ModificaProprietaForm";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

export default async function ModificaProprietaPage({ params }: { params: Promise<{ id: string }> }) {
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
    ...propertyData
  };

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link href="/proprietario/proprieta" className="hover:text-slate-700">Proprietà</Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <Link href={`/proprietario/proprieta/${property.id}`} className="hover:text-slate-700">{property.name}</Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-slate-800 font-medium">Modifica</span>
      </div>

      <div className="max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Modifica Proprietà</h1>
          <p className="text-slate-500 mt-1">Aggiorna i dati della tua proprietà</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <ModificaProprietaForm property={property} />
        </div>
      </div>
    </div>
  );
}
