import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
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

  return (
    <DashboardLayoutClient
      userName={session.user.name || "Admin"}
      userEmail={session.user.email || ""}
    >
      {children}
    </DashboardLayoutClient>
  );
}
