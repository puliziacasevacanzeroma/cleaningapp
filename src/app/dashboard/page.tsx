import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { DashboardClientWrapper } from "~/components/dashboard/DashboardClientWrapper";

export default async function DashboardPage() {
  const session = await auth();
  if (!session || (session.user.role !== "admin" && session.user.role !== "ADMIN")) redirect("/login");

  return <DashboardClientWrapper userName={session.user.name || "Admin"} />;
}