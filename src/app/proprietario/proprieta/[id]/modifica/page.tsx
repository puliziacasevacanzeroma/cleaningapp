import { redirect, notFound } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import Link from "next/link";
import { ModificaProprietaForm } from "~/components/proprietario/ModificaProprietaForm";

export default async function ModificaProprietaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;

  const property = await db.property.findFirst({
    where: { id: id, ownerId: session.user.id }
  });

  if (!property) notFound();

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
