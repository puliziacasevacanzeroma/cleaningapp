import { redirect, notFound } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import PropertyDetailClient from "./PropertyDetailClient";

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const { id } = await params;

  const property = await db.property.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      bookings: { orderBy: { checkIn: "desc" }, take: 50 },
      cleanings: { 
        orderBy: { scheduledDate: "desc" }, 
        take: 20, 
        include: { operator: { select: { id: true, name: true } } } 
      },
    },
  });

  if (!property) notFound();

  const operators = await db.user.findMany({
    where: { role: "OPERATORE_PULIZIE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const completedCleanings = property.cleanings.filter((c) => c.status === "COMPLETED").length;
  const totalRevenue = completedCleanings * (property.cleaningPrice || 0);

  return (
    <PropertyDetailClient
      property={JSON.parse(JSON.stringify(property))}
      operators={operators}
      linenItems={[]}
      stats={{ totalCleanings: property.cleanings.length, completedCleanings, totalRevenue }}
      isAdmin={session.user.role === "admin" || session.user.role === "ADMIN"}
    />
  );
}