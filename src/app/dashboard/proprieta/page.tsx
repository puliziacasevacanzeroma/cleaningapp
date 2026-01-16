import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { ProprietaClientWrapper } from "~/components/dashboard/ProprietaClientWrapper";

export default async function ProprietaPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return <ProprietaClientWrapper />;
}