import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { DashboardLayoutClient } from "~/components/dashboard/DashboardLayoutClient";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  // Solo admin possono accedere alla dashboard
  const role = session.user.role?.toUpperCase();
  if (role !== "ADMIN") {
    redirect("/proprietario");
  }

  // Conta proprietà in attesa per badge navbar
  const pendingCount = await db.property.count({
    where: { status: "PENDING" }
  });

  return (
    <DashboardLayoutClient
      userName={session.user.name || "Admin"}
      userEmail={session.user.email || ""}
      pendingPropertiesCount={pendingCount}
    >
      {children}
    </DashboardLayoutClient>
  );
}
