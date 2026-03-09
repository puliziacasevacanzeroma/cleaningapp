"use client";

import { useState } from "react";
import Link from "next/link";

// "error" rimosso: non viene mai usato (per sicurezza mostriamo sempre "sent")
type Step = "form" | "sending" | "sent";

export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState("");
  const [step, setStep]         = useState<Step>("form");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || step === "sending") return;

    setStep("sending");
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      if (res.ok) {
        setStep("sent");
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        if (data.error === "Email non valida") {
          setErrorMsg("Inserisci un indirizzo email valido.");
          setStep("form");
        } else {
          // Anche su errore server mostriamo "sent" (no user enumeration)
          setStep("sent");
        }
      }
    } catch {
      // Errore di rete: mostriamo comunque "sent"
      setStep("sent");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">

      {/* Background decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/30">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <span className="text-xl font-bold text-white tracking-tight">CleaningApp</span>
        </div>

        <div className="bg-white/[0.06] backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden">

          {/* ── STEP: FORM ── */}
          {step === "form" && (
            <div className="p-8">
              <div className="mb-8">
                <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center">
                  <svg className="w-7 h-7 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-white text-center mb-2 tracking-tight">Password dimenticata?</h1>
                <p className="text-slate-400 text-center text-sm leading-relaxed">
                  Inserisci la tua email e ti mandiamo un link sicuro per reimpostare la password.
                </p>
              </div>

              {errorMsg && (
                <div className="mb-5 flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-400 text-sm">{errorMsg}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Indirizzo email</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nome@email.com"
                      className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-slate-500 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                      required
                      autoFocus
                      autoComplete="email"
                      disabled={loading}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={step === "sending"}
                  className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm rounded-xl hover:shadow-lg hover:shadow-sky-500/25 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  Invia link di reset
                </button>
              </form>

              {/* Google hint */}
              <div className="mt-5 p-3.5 bg-white/[0.04] border border-white/[0.07] rounded-2xl flex items-start gap-3">
                <svg className="w-8 h-8 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <div>
                  <p className="text-sm text-slate-300 font-medium">Accesso con Google?</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Non hai una password. Torna al login e usa "Continua con Google".</p>
                </div>
              </div>

              <div className="mt-6 text-center">
                <Link href="/login" className="text-sm text-sky-400 hover:text-sky-300 font-medium transition-colors">
                  ← Torna al login
                </Link>
              </div>
            </div>
          )}

          {/* ── STEP: SENDING ── */}
          {step === "sending" && (
            <div className="p-8 text-center">
              <div className="w-14 h-14 mx-auto mb-6 rounded-2xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-sky-500/30 border-t-sky-400 rounded-full animate-spin" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Invio in corso...</h2>
              <p className="text-slate-400 text-sm">
                Stiamo preparando l&apos;email per <span className="text-slate-300">{email}</span>
              </p>
            </div>
          )}

          {/* ── STEP: SENT ── */}
          {step === "sent" && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">Controlla la posta!</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-2">
                Se l&apos;email <span className="text-slate-200 font-medium">{email}</span> è registrata,
                riceverai a breve un link per reimpostare la password.
              </p>
              <p className="text-slate-500 text-xs mb-8">
                Il link scade in <strong className="text-slate-400">1 ora</strong>. Controlla anche lo spam.
              </p>

              {/* Istruzioni visive */}
              <div className="text-left bg-white/[0.04] border border-white/[0.07] rounded-2xl p-4 mb-6 space-y-3">
                {[
                  { icon: "📧", text: "Apri l'email da CleaningApp" },
                  { icon: "🔗", text: "Clicca \"Reimposta Password\"" },
                  { icon: "🔑", text: "Scegli la nuova password" },
                  { icon: "✅", text: "Accedi con le nuove credenziali" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-lg">{item.icon}</span>
                    <p className="text-slate-300 text-sm">{item.text}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { setStep("form"); setEmail(""); setErrorMsg(""); }}
                  className="w-full py-3 text-sm text-slate-400 hover:text-slate-300 transition-colors"
                >
                  Prova con un&apos;altra email
                </button>
                <Link
                  href="/login"
                  className="block w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm rounded-xl hover:shadow-lg hover:shadow-sky-500/25 transition-all text-center"
                >
                  Torna al Login
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
