"use client";

import { useState, useLayoutEffect } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

const demoAccounts = [
  { label: "Admin", email: "admin@demo.com", password: "demo123", icon: "🛡️", color: "from-violet-500 to-purple-600" },
  { label: "Proprietario", email: "proprietario@demo.com", password: "demo123", icon: "🏠", color: "from-sky-500 to-blue-600" },
  { label: "Operatore", email: "operatore@demo.com", password: "demo123", icon: "🧹", color: "from-emerald-500 to-teal-600" },
  { label: "Rider", email: "rider@demo.com", password: "demo123", icon: "🚗", color: "from-amber-500 to-orange-600" },
];

// 🔄 Helper per controllare se utente è in cache (SINCRONO - prima del render)
function getUserFromCache(): any {
  if (typeof window === "undefined") return null;
  try {
    // Prova localStorage
    const stored = localStorage.getItem("user");
    if (stored) return JSON.parse(stored);
    
    // Prova cookie
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === "firebase-user" && value) {
        return JSON.parse(decodeURIComponent(value));
      }
    }
  } catch {}
  return null;
}

// Helper per ottenere la destinazione in base al ruolo
function getDestinationByRole(role: string): string {
  const upperRole = role?.toUpperCase() || "";
  if (upperRole === "ADMIN") return "/dashboard";
  if (["PROPRIETARIO", "OWNER", "CLIENTE"].includes(upperRole)) return "/proprietario";
  if (["OPERATORE_PULIZIE", "OPERATORE", "OPERATOR"].includes(upperRole)) return "/operatore";
  if (upperRole === "RIDER") return "/rider";
  return "/dashboard";
}

// Loading Screen - SOLO durante login attivo
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-500 via-sky-600 to-blue-700 flex items-center justify-center">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-white/20 backdrop-blur-xl flex items-center justify-center">
          <svg className="w-10 h-10 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        </div>
        <p className="text-white/80 text-lg font-medium">Accesso in corso...</p>
        <div className="flex justify-center gap-2 mt-4">
          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // 🔄 CONTROLLA CACHE IMMEDIATAMENTE - prima di qualsiasi render!
  const [cachedUser] = useState(() => getUserFromCache());
  const [hasRedirected, setHasRedirected] = useState(false);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { user, login, loginWithGoogle } = useAuth();
  const router = useRouter();
  
  // 🔄 REDIRECT IMMEDIATO se utente in cache
  useLayoutEffect(() => {
    const userToCheck = cachedUser || user;
    if (userToCheck && !hasRedirected) {
      setHasRedirected(true);
      const destination = getDestinationByRole(userToCheck.role || "");
      console.log("🔄 Utente in cache, redirect immediato a:", destination);
      router.replace(destination);
    }
  }, [cachedUser, user, router, hasRedirected]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError("");

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || "Credenziali non valide");
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setError("");

    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err.message || "Errore durante l'accesso con Google");
      setIsLoggingIn(false);
    }
  };

  const handleDemoLogin = (account: typeof demoAccounts[0]) => {
    setEmail(account.email);
    setPassword(account.password);
  };

  // 🔄 Se utente in cache o già loggato, NON mostrare nulla!
  if (cachedUser || user) {
    return null;
  }
  
  // Mostra loading SOLO durante login attivo
  if (isLoggingIn) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
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
            <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/30">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <span className="text-2xl font-bold text-white">CleaningApp</span>
            </div>

            <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-8 shadow-2xl">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Bentornato!</h2>
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

              {/* Google Login Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full py-3.5 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-100 transition-all flex items-center justify-center gap-3 mb-6"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continua con Google
              </button>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-slate-900 text-slate-400">oppure</span>
                </div>
              </div>

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
                  className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-sky-500/30 hover:-translate-y-0.5 transition-all"
                >
                  Accedi
                </button>
              </form>

              {/* ✅ LINK REGISTRAZIONE */}
              <div className="mt-6 text-center">
                <p className="text-slate-400">
                  Non hai un account?{" "}
                  <Link href="/register" className="text-sky-400 font-semibold hover:text-sky-300 transition-colors">
                    Registrati
                  </Link>
                </p>
              </div>

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
