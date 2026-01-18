import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { DashboardLayoutClient } from "~/components/dashboard/DashboardLayoutClient";
import { UserContext } from "~/lib/UserContext";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  
  if (!session) {
    redirect("/login");
  }
  
  const role = session.user.role?.toUpperCase();
  if (role !== "ADMIN") {
    redirect("/proprietario");
  }

  const pendingCount = await db.property.count({
    where: { status: "PENDING" }
  });

  return (
    <UserContext.Provider value={{
      userName: session.user.name || "Admin",
      userEmail: session.user.email || "",
      userRole: role || "ADMIN"
    }}>
      <DashboardLayoutClient
        userName={session.user.name || "Admin"}
        userEmail={session.user.email || ""}
        pendingPropertiesCount={pendingCount}
      >
        {children}
      </DashboardLayoutClient>
    </UserContext.Provider>
  );
}