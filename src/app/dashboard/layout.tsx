import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { DashboardLayoutClient } from "~/components/dashboard/DashboardLayoutClient";
import { cachedQuery } from "~/lib/cache";

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

  // ⚡ USA CACHE per il conteggio pending
  const pendingCount = await cachedQuery("dashboard", async () => {
    return db.property.count({
      where: { status: "PENDING" }
    });
  });

  return (
    <DashboardLayoutClient
      userName={session.user.name || "Admin"}
      userEmail={session.user.email || ""}
      pendingPropertiesCount={pendingCount as number}
    >
      {children}
    </DashboardLayoutClient>
  );
}