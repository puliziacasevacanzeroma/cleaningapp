import { db } from "~/server/db";
import { UtentiClient } from "~/components/dashboard/UtentiClient";

export default async function RiderPage() {
  const users = await db.user.findMany({
    where: { role: "rider" },
    orderBy: { name: "asc" }
  });

  return (
    <UtentiClient 
      users={JSON.parse(JSON.stringify(users))}
      role="rider"
      roleLabel="Rider"
      roleColor="text-sky-600"
      roleBgColor="bg-sky-50"
    />
  );
}
