import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { ProprietaClient } from "~/components/dashboard/ProprietaClient";

export default async function ProprietaPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const [activeProperties, pendingProperties] = await Promise.all([
    db.property.findMany({
      where: { status: "ACTIVE" },
      include: {
        _count: { select: { bookings: true, cleanings: true } },
        owner: { select: { name: true } }
      },
      orderBy: { name: "asc" },
    }),
    db.property.findMany({
      where: { status: "PENDING" },
      include: { owner: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    })
  ]);

  return (
    <ProprietaClient
      activeProperties={JSON.parse(JSON.stringify(activeProperties))}
      pendingProperties={JSON.parse(JSON.stringify(pendingProperties))}
    />
  );
}