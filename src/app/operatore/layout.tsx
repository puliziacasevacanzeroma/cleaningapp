import { redirect } from "next/navigation";
import { auth } from "~/server/auth";

export default async function OperatoreLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <span className="text-white text-lg">🧹</span>
            </div>
            <div>
              <h1 className="font-bold text-slate-800">CleaningApp</h1>
              <p className="text-xs text-slate-500">Area Operatore</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-slate-800">{session.user.name}</p>
            <a href="/logout" className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg">
              🚪
            </a>
          </div>
        </div>
      </header>
      
      <main>{children}</main>
    </div>
  );
}