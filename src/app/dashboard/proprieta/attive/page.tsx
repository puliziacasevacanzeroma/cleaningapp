import { db } from "~/server/db";
import { ProprietaAttiveClient } from "~/components/dashboard/ProprietaAttiveClient";

export default async function ProprietaAttivePage() {
  const properties = await db.property.findMany({
    where: { status: "ACTIVE" },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      _count: {
        select: {
          bookings: true,
          cleanings: true
        }
      }
    },
    orderBy: { name: "asc" }
  });
  return <ProprietaAttiveClient properties={JSON.parse(JSON.stringify(properties))} />;
}