import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { ProprietarioProprietaClient } from "~/components/proprietario/ProprietarioProprietaClient";

export default async function ProprietaPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;

  const properties = await db.property.findMany({
    where: { clientId: userId },
    include: {
      _count: {
        select: { bookings: true, cleanings: true }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const activeProperties = properties.filter(p => p.status === "ACTIVE" || p.status === "active");
  const pendingProperties = properties.filter(p => p.status === "PENDING" || p.status === "pending");

  return (
    <ProprietarioProprietaClient
      activeProperties={JSON.parse(JSON.stringify(activeProperties))}
      pendingProperties={JSON.parse(JSON.stringify(pendingProperties))}
    />
  );
}
