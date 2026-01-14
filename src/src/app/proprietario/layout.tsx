import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import Link from "next/link";
import { SidebarProvider } from "~/components/ui/SidebarContext";
import { ProprietarioSidebar } from "~/components/proprietario/Sidebar";

export default async function ProprietarioLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  
  if (!session) {
    redirect("/login");
  }

  // Verifica che sia un proprietario o admin
  if (session.user.role !== "owner" && session.user.role !== "admin") {
    redirect("/login");
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30">
        <ProprietarioSidebar user={session.user} />
        
        {/* Main Content */}
        <div className="lg:pl-64 min-h-screen">
          <main>{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
