import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

// Pagina modifica non più necessaria - redirect al dettaglio che ha la modal unificata
export default async function ModificaProprietaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/proprietario/proprieta/${id}`);
}
