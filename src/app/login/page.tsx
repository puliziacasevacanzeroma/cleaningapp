"use client";

import { useState, useEffect } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";

// Credenziali demo per test rapido
const demoAccounts = [
  { label: "Admin", email: "damianiariele@gmail.com", password: "password123", icon: "🛡️", color: "from-violet-500 to-purple-600" },
  { label: "Proprietario", email: "proprietario@demo.com", password: "demo123", icon: "🏠", color: "from-sky-500 to-blue-600" },
  { label: "Operatore", email: "operatore@demo.com", password: "demo123", icon: "🧹", color: "from-emerald-500 to-teal-600" },
  { label: "Rider", email: "rider@demo.com", password: "demo123", icon: "🚗", color: "from-amber-500 to-orange-600" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const router = useRouter();

  // PWA Install prompt
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Mostra banner solo se non già installata
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Controlla se già installata
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallBanner(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await doLogin(email, password);
  };

  const doLogin = async (loginEmail: string, loginPassword: string) => {
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email: loginEmail,
      password: loginPassword,
      redirect: false,
    });

    if (result?.error) {
      setError("Credenziali non valide");
      setLoading(false);
    } else {
      // Ottieni la sessione per leggere il ruolo
      const session = await getSession();
      const role = session?.user?.role?.toUpperCase();

      // Redirect in base al ruolo
      switch (role) {
        case "ADMIN":
          router.push("/dashboard");
          break;
        case "OWNER":
        case "PROPRIETARIO":
        case "CLIENTE":
          router.push("/proprietario");
          break;
        case "OPERATOR":
        case "OPERATORE":
        case "OPERATORE_PULIZIE":
          router.push("/operatore");
          break;
        case "RIDER":
          router.push("/rider");
          break;
        default:
          router.push("/dashboard");
      }
    }
  };

  const handleDemoLogin = (account: typeof demoAccounts[0]) => {
    setEmail(account.email);
    setPassword(account.password);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      
      {/* PWA Install Banner - Stile Google Play */}
      {showInstallBanner && (
        <div className="bg-white w-full">
          <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-4">
            {/* App Icon */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            
            {/* App Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-slate-900 text-base">CleaningApp</h3>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="flex items-center">
                  {[1,2,3,4,5].map(i => (
                    <svg key={i} className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <span className="text-xs text-slate-500">4.9 • Gratuita</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">Gestionale pulizie case vacanza</p>
            </div>
            
            {/* Install Button */}
            <button
              onClick={handleInstall}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-lg transition-colors flex-shrink-0"
            >
              Installa
            </button>
          </div>
          
          {/* Divider */}
          <div className="h-px bg-slate-200" />
        </div>
      )}

      <div className="flex-1 flex">
        {/* Left Side - Branding */}
        <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 bg-gradient-to-br from-cyan-500 via-sky-500 to-blue-600 relative overflow-hidden">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl"></div>

          <div className="relative z-10 flex flex-col justify-between p-12 xl:p-20 w-full">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-xl flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <div>
                <span className="text-2xl font-bold text-white">CleaningApp</span>
                <p className="text-white/70 text-sm">Gestionale Pro</p>
              </div>
            </div>

            <div>
              <h1 className="text-4xl xl:text-5xl font-extrabold text-white leading-tight mb-6">
                Gestisci i tuoi<br />
                <span className="text-white/90">servizi di pulizia</span><br />
                in modo semplice
              </h1>
              <p className="text-xl text-white/80 max-w-md">
                Pulizie, biancheria, operatori e consegne.<br />
                Tutto in un&apos;unica piattaforma.
              </p>
            </div>

            <div className="flex gap-12">
              <div>
                <p className="text-4xl font-bold text-white">99+</p>
                <p className="text-white/70">Proprietà gestite</p>
              </div>
              <div>
                <p className="text-4xl font-bold text-white">1k+</p>
                <p className="text-white/70">Prenotazioni</p>
              </div>
              <div>
                <p className="text-4xl font-bold text-white">98%</p>
                <p className="text-white/70">Soddisfazione</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            <div className="lg:hidden flex items-center justify-center gap-3 mb-10">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/30">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <span className="text-2xl font-bold text-white">CleaningApp</span>
            </div>

            <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-8 shadow-2xl">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Bentornato! 👋</h2>
                <p className="text-slate-400">Accedi al tuo account per continuare</p>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 text-sm flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nome@email.com"
                      className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-sky-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Accesso in corso..." : "Accedi"}
                </button>
              </form>

              {/* Demo Buttons */}
              <div className="mt-8 pt-6 border-t border-white/10">
                <p className="text-center text-sm text-slate-400 mb-4">Accesso rapido demo</p>
                <div className="grid grid-cols-2 gap-3">
                  {demoAccounts.map((account) => (
                    <button
                      key={account.label}
                      type="button"
                      onClick={() => handleDemoLogin(account)}
                      className={`flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r ${account.color} text-white text-sm font-medium rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all`}
                    >
                      <span>{account.icon}</span>
                      <span>{account.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
