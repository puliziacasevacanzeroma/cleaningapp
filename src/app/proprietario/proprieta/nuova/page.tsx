import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { NuovaProprietaForm } from "~/components/proprietario/NuovaProprietaForm";

export default async function NuovaProprietaPage() {
  const session = await auth();
  if (!session) redirect("/login");

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

