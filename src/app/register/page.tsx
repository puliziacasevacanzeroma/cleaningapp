/**
 * Pagina Registrazione Pubblica
 * 
 * Flusso:
 * 1. Registrazione → utente loggato automaticamente
 * 2. Contratto → firma
 * 3. Fatturazione → compila
 * 4. PENDING_APPROVAL → attende approvazione (riceve email con credenziali)
 * 
 * URL: /register
 */

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Validazione
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim() || formData.name.trim().length < 3) {
      newErrors.name = "Nome completo richiesto (minimo 3 caratteri)";
    }
    
    if (!formData.email.trim()) {
      newErrors.email = "Email richiesta";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Email non valida";
    }
    
    if (!formData.phone.trim()) {
      newErrors.phone = "Telefono richiesto";
    } else if (formData.phone.replace(/\D/g, "").length < 9) {
      newErrors.phone = "Numero di telefono non valido";
    }
    
    if (!formData.password) {
      newErrors.password = "Password richiesta";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password troppo corta (minimo 6 caratteri)";
    }
    
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Le password non coincidono";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit - chiama API che crea utente con bcrypt
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    try {
      setLoading(true);
      setGeneralError(null);
      
      // Chiama API per registrazione
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone.trim(),
          password: formData.password,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "Errore durante la registrazione");
      }
      
      // Salva utente per login automatico
      const authUser = result.user;
      
      localStorage.setItem("user", JSON.stringify(authUser));
      
      // Imposta cookie per middleware
      const expires = new Date();
      expires.setTime(expires.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 giorni
      document.cookie = `firebase-user=${encodeURIComponent(JSON.stringify(authUser))}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
      
      setSuccess(true);
      
      // Redirect al primo step (contratto)
      setTimeout(() => {
        router.push("/accept-contract");
      }, 2000);
      
    } catch (error: any) {
      console.error("Errore registrazione:", error);
      setGeneralError(error.message || "Errore durante la registrazione. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  // Input change
  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  // Successo
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Registrazione Completata!</h1>
          <p className="text-gray-600 mb-6">
            Benvenuto in CleaningApp!<br/>
            Ora completa i passaggi per attivare il tuo account.
          </p>
          <div className="animate-pulse text-sky-500">Reindirizzamento...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-sky-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-500 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Registrati</h1>
          <p className="text-gray-500 mt-1">Crea il tuo account CleaningApp</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Nome */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome e Cognome *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Mario Rossi"
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 ${
                  errors.name ? "border-red-500 bg-red-50" : "border-gray-300"
                }`}
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1">{errors.name}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="mario@esempio.it"
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 ${
                  errors.email ? "border-red-500 bg-red-50" : "border-gray-300"
                }`}
              />
              {errors.email && (
                <p className="text-red-500 text-sm mt-1">{errors.email}</p>
              )}
            </div>

            {/* Telefono */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telefono *
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                placeholder="+39 333 1234567"
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 ${
                  errors.phone ? "border-red-500 bg-red-50" : "border-gray-300"
                }`}
              />
              {errors.phone && (
                <p className="text-red-500 text-sm mt-1">{errors.phone}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password *
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => handleChange("password", e.target.value)}
                placeholder="Minimo 6 caratteri"
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 ${
                  errors.password ? "border-red-500 bg-red-50" : "border-gray-300"
                }`}
              />
              {errors.password && (
                <p className="text-red-500 text-sm mt-1">{errors.password}</p>
              )}
            </div>

            {/* Conferma Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Conferma Password *
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => handleChange("confirmPassword", e.target.value)}
                placeholder="Ripeti la password"
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 ${
                  errors.confirmPassword ? "border-red-500 bg-red-50" : "border-gray-300"
                }`}
              />
              {errors.confirmPassword && (
                <p className="text-red-500 text-sm mt-1">{errors.confirmPassword}</p>
              )}
            </div>

            {/* Errore generale */}
            {generalError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-red-700 text-sm">{generalError}</p>
              </div>
            )}

            {/* Info */}
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
              <p className="text-sky-800 text-sm">
                <strong>Dopo la registrazione dovrai:</strong>
              </p>
              <ul className="text-sky-700 text-sm mt-2 space-y-1">
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-sky-200 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  Firmare il contratto/regolamento
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-sky-200 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  Compilare i dati di fatturazione
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-sky-200 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                  Attendere l'approvazione
                </li>
              </ul>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all ${
                loading
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-600 hover:to-blue-700 shadow-lg hover:shadow-xl"
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Registrazione...
                </span>
              ) : (
                "Registrati"
              )}
            </button>
          </form>

          {/* Link login */}
          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Hai già un account?{" "}
              <Link href="/login" className="text-sky-600 font-medium hover:underline">
                Accedi
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Registrandoti accetti i termini di servizio e la privacy policy
        </p>
      </div>
    </div>
  );
}
