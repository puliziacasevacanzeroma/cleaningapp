import { db } from "~/server/db";
import { UtentiClient } from "~/components/dashboard/UtentiClient";

export default async function ProprietariPage() {
  const users = await db.user.findMany({
    where: { role: "owner" },
    orderBy: { name: "asc" }
  });

  return (
    <UtentiClient 
      users={JSON.parse(JSON.stringify(users))}
      role="owner"
      roleLabel="Proprietari"
      roleColor="text-violet-600"
      roleBgColor="bg-violet-50"
    />
  );
}
