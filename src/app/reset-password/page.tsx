"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type TokenState = "checking" | "valid" | "invalid" | "expired";
type SubmitState = "idle" | "submitting" | "success" | "error";

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  checks: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
  };
}

function getPasswordStrength(password: string): PasswordStrength {
  const checks = {
    length:    password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number:    /[0-9]/.test(password),
    special:   /[^A-Za-z0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const labels = ["", "Debole", "Discreta", "Buona", "Ottima", "Eccellente"];
  const colors = ["", "text-red-400", "text-orange-400", "text-yellow-400", "text-emerald-400", "text-emerald-400"];
  return { score, label: labels[score] ?? "", color: colors[score] ?? "", checks };
}

// ── Componente interno che usa useSearchParams ────────────────
function ResetPasswordContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get("token") ?? "";

  const [tokenState, setTokenState]   = useState<TokenState>("checking");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [minutesLeft, setMinutesLeft] = useState(60);

  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [showPwd, setShowPwd]         = useState(false);
  const [showCfm, setShowCfm]         = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState("");

  const strength = getPasswordStrength(password);
  const passwordsMatch = password === confirm && confirm.length > 0;
  const canSubmit = strength.score >= 2 && passwordsMatch && (submitState === "idle" || submitState === "error");

  const verifyToken = useCallback(async () => {
    if (!token || token.length !== 64) {
      setTokenState("invalid");
      return;
    }
    try {
      const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`);
      if (res.status === 410) { setTokenState("expired"); return; }
      if (!res.ok)             { setTokenState("invalid"); return; }
      const data = await res.json() as { valid: boolean; maskedEmail?: string; minutesLeft?: number };
      if (data.valid) {
        setTokenState("valid");
        setMaskedEmail(data.maskedEmail ?? "");
        setMinutesLeft(data.minutesLeft ?? 60);
      } else {
        setTokenState("invalid");
      }
    } catch {
      setTokenState("invalid");
    }
  }, [token]);

  useEffect(() => { verifyToken(); }, [verifyToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitState("submitting");
    setSubmitError("");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, password }),
      });

      const data = await res.json() as { ok?: boolean; error?: string };

      if (res.ok && data.ok) {
        setSubmitState("success");
        setTimeout(() => router.push("/login"), 3000);
      } else if (res.status === 410) {
        // Token scaduto durante la compilazione del form → schermata dedicata
        setTokenState("expired");
        setSubmitState("idle");
      } else {
        setSubmitError(data.error ?? "Errore durante il reset. Riprova.");
        setSubmitState("error");
      }
    } catch {
      setSubmitError("Errore di rete. Controlla la connessione e riprova.");
      setSubmitState("error");
    }
  };

  const strengthBars = [1, 2, 3, 4, 5];
  const strengthBarColor = (idx: number) => {
    if (password.length === 0) return "bg-white/10";
    if (strength.score >= idx) {
      if (strength.score <= 1) return "bg-red-400";
      if (strength.score <= 2) return "bg-orange-400";
      if (strength.score <= 3) return "bg-yellow-400";
      return "bg-emerald-400";
    }
    return "bg-white/10";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
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

          {/* ── CHECKING TOKEN ── */}
          {tokenState === "checking" && (
            <div className="p-8 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-sky-500/15 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-sky-500/30 border-t-sky-400 rounded-full animate-spin" />
              </div>
              <p className="text-slate-400 text-sm">Verifica del link in corso...</p>
            </div>
          )}

          {/* ── TOKEN INVALID ── */}
          {tokenState === "invalid" && (
            <div className="p-8 text-center">
              <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-red-500/15 border border-red-500/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Link non valido</h2>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                Questo link non è valido o è già stato utilizzato. Richiedi un nuovo reset.
              </p>
              <Link href="/forgot-password" className="block w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm rounded-xl text-center hover:shadow-lg hover:shadow-sky-500/25 transition-all">
                Richiedi nuovo link
              </Link>
              <Link href="/login" className="block mt-3 text-sm text-slate-500 hover:text-slate-400 transition-colors text-center">
                Torna al login
              </Link>
            </div>
          )}

          {/* ── TOKEN EXPIRED ── */}
          {tokenState === "expired" && (
            <div className="p-8 text-center">
              <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Link scaduto</h2>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                Il link è scaduto dopo 1 ora. Richiedi un nuovo link di reset.
              </p>
              <Link href="/forgot-password" className="block w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm rounded-xl text-center hover:shadow-lg hover:shadow-sky-500/25 transition-all">
                Richiedi nuovo link
              </Link>
            </div>
          )}

          {/* ── SUCCESS ── */}
          {submitState === "success" && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Password aggiornata!</h2>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                La tua password è stata reimpostata con successo.<br/>
                Verrai reindirizzato al login tra qualche secondo.
              </p>
              <Link href="/login" className="block w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-sm rounded-xl text-center hover:shadow-lg hover:shadow-emerald-500/25 transition-all">
                Vai al Login ora
              </Link>
            </div>
          )}

          {/* ── RESET FORM ── */}
          {tokenState === "valid" && submitState !== "success" && (
            <div className="p-8">
              <div className="mb-6">
                <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center">
                  <svg className="w-7 h-7 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-white text-center mb-1 tracking-tight">Nuova password</h1>
                {maskedEmail && (
                  <p className="text-slate-500 text-xs text-center">per <span className="text-slate-400">{maskedEmail}</span></p>
                )}
              </div>

              {minutesLeft > 0 && minutesLeft <= 15 && (
                <div className="mb-4 flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-amber-300 text-xs">Link scade in {minutesLeft} minut{minutesLeft === 1 ? "o" : "i"}</p>
                </div>
              )}

              {submitError && (
                <div className="mb-4 flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-400 text-sm">{submitError}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Nuova password */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Nuova password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <input
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimo 8 caratteri"
                      className="w-full pl-11 pr-12 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-slate-500 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPwd ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      )}
                    </button>
                  </div>

                  {/* Barre forza + checklist */}
                  {password.length > 0 && (
                    <div className="mt-2.5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {strengthBars.map((i) => (
                          <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${strengthBarColor(i)}`} />
                        ))}
                        <span className={`text-xs font-medium ml-1 ${strength.color}`}>{strength.label}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 mt-2">
                        {[
                          { key: "length",    label: "8+ caratteri" },
                          { key: "uppercase", label: "Maiuscola" },
                          { key: "lowercase", label: "Minuscola" },
                          { key: "number",    label: "Numero" },
                          { key: "special",   label: "Simbolo (!@#...)" },
                        ].map(({ key, label }) => {
                          const ok = strength.checks[key as keyof typeof strength.checks];
                          return (
                            <div key={key} className="flex items-center gap-1.5">
                              <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${ok ? "bg-emerald-500/20" : "bg-white/5"}`}>
                                <svg className={`w-2 h-2 transition-all ${ok ? "text-emerald-400" : "text-slate-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                              <span className={`text-xs transition-colors ${ok ? "text-slate-300" : "text-slate-600"}`}>{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Conferma password */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Conferma password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className={`w-4 h-4 transition-colors ${passwordsMatch ? "text-emerald-400" : "text-slate-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <input
                      type={showCfm ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Ripeti la password"
                      className={`w-full pl-11 pr-12 py-3.5 bg-white/5 rounded-xl text-white text-sm placeholder-slate-500 outline-none transition-all focus:ring-2 ${
                        confirm.length > 0
                          ? passwordsMatch
                            ? "border border-emerald-500/40 focus:border-emerald-500/60 focus:ring-emerald-500/20"
                            : "border border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20"
                          : "border border-white/10 focus:border-sky-500/60 focus:ring-sky-500/20"
                      }`}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCfm(!showCfm)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showCfm ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      )}
                    </button>
                  </div>
                  {confirm.length > 0 && !passwordsMatch && (
                    <p className="mt-1.5 text-xs text-red-400">Le password non corrispondono</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={`w-full py-3.5 font-semibold text-sm rounded-xl transition-all flex items-center justify-center gap-2 ${
                    canSubmit
                      ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-sky-500/25 hover:-translate-y-0.5 active:translate-y-0"
                      : "bg-white/10 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  {submitState === "submitting" ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Aggiornamento...
                    </>
                  ) : (
                    "Salva nuova password"
                  )}
                </button>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Export con Suspense boundary obbligatorio per useSearchParams ──
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sky-500/30 border-t-sky-400 rounded-full animate-spin" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
