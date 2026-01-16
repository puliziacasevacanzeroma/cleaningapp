import { redirect, notFound } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { PropertyServiceConfig } from "~/components/dashboard/PropertyServiceConfig";

export default async function ProprietaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;

  const property = await db.property.findFirst({
    where: { id: id, ownerId: session.user.id },
    include: {
      _count: { select: { bookings: true, cleanings: true } },
    }
  });

  if (!property) notFound();

  // Passa i dati al componente client
  return <PropertyServiceConfig propertyId={property.id} />;
}
