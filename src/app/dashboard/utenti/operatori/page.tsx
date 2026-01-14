import { db } from "~/server/db";
import { UtentiClient } from "~/components/dashboard/UtentiClient";

export default async function OperatoriPage() {
  const users = await db.user.findMany({
    where: { role: "operator" },
    orderBy: { name: "asc" }
  });

  return (
    <UtentiClient 
      users={JSON.parse(JSON.stringify(users))}
      role="operator"
      roleLabel="Operatori"
      roleColor="text-emerald-600"
      roleBgColor="bg-emerald-50"
    />
  );
}
