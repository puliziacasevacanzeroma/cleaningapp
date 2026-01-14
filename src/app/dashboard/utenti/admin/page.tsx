import { db } from "~/server/db";
import { UtentiClient } from "~/components/dashboard/UtentiClient";

export default async function AdminPage() {
  const users = await db.user.findMany({
    where: { role: "admin" },
    orderBy: { name: "asc" }
  });

  return (
    <UtentiClient 
      users={JSON.parse(JSON.stringify(users))}
      role="admin"
      roleLabel="Amministratori"
      roleColor="text-amber-600"
      roleBgColor="bg-amber-50"
    />
  );
}
