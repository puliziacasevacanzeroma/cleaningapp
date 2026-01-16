import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import PropertyServiceConfig from "~/components/dashboard/PropertyServiceConfig";

interface PageProps {
  params: { id: string };
}

export default async function ProprietaDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const property = await db.property.findUnique({
    where: { id: params.id },
  });

  if (!property) {
    redirect("/proprietario/proprieta");
  }

  if (property.clientId !== session.user.id) {
    redirect("/proprietario/proprieta");
  }

  return (
    <PropertyServiceConfig 
      isAdmin={false} 
      propertyId={property.id}
      initialImageUrl={property.imageUrl}
    />
  );
}