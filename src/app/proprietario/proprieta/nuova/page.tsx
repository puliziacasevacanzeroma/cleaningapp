import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { NuovaProprietaForm } from "~/components/proprietario/NuovaProprietaForm";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

export default async function NuovaProprietaPage() {
  const user = await getFirebaseUser();
  if (!user) redirect("/login");

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Nuova Proprietà</h1>
        <p className="text-slate-500 mt-1">Aggiungi una nuova proprietà. Sarà visibile dopo l'approvazione dell'amministratore.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <NuovaProprietaForm />
      </div>
    </div>
  );
}

