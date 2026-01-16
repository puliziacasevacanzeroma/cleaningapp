import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { InventarioClientWrapper } from "~/components/dashboard/InventarioClientWrapper";

export default async function InventarioPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return <InventarioClientWrapper />;
}
