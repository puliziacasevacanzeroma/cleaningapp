import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { AdminLayoutClient } from "~/components/admin/AdminLayoutClient";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session || session.user.role !== "admin") {
    redirect("/login");
  }

  return (
    <AdminLayoutClient userName={session.user.name || "Admin"}>
      {children}
    </AdminLayoutClient>
  );
}