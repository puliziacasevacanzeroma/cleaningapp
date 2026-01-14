import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { ProprietarioLayoutClient } from "~/components/proprietario/ProprietarioLayoutClient";

export default async function ProprietarioLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  // Solo owner possono accedere
  if (session.user.role !== "OWNER" && session.user.role !== "ADMIN" && session.user.role !== "owner" && session.user.role !== "admin") {
    redirect("/login");
  }

  return (
    <ProprietarioLayoutClient
      userName={session.user.name || "Proprietario"}
      userEmail={session.user.email || ""}
    >
      {children}
    </ProprietarioLayoutClient>
  );
}

