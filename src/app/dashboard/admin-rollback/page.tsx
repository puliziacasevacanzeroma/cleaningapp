"use client";

import { useState } from "react";

export default function RollbackPage() {
  const [file, setFile] = useState<File | null>(null);
  const [secret, setSecret] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [skipOrders, setSkipOrders] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function handleSubmit() {
    setError("");
    setResult("");
    if (!file) {
      setError("Seleziona prima il file di backup JSON");
      return;
    }

    setLoading(true);
    try {
      // Leggo il file come testo
      const text = await file.text();
      const backup = JSON.parse(text);

      // Costruisco URL
      const params = new URLSearchParams();
      if (!dryRun) {
        params.set("dryRun", "false");
        if (secret) params.set("secret", secret);
      }
      if (skipOrders) params.set("skipOrders", "true");

      const url = `/api/debug/inventory-rollback?${params.toString()}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">🔄 Inventory Rollback</h1>
        <p className="text-sm text-slate-600 mb-6">
          Ripristina inventory + orders allo stato del backup JSON.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              File backup JSON
            </label>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm border border-slate-300 rounded-lg p-2"
            />
            {file && (
              <p className="text-xs text-slate-500 mt-1">
                Selezionato: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-amber-900">
                Dry Run (simulazione, nessuna modifica)
              </span>
            </label>
            {dryRun ? (
              <p className="text-xs text-amber-700">
                ✅ Sicuro: vedrai solo cosa farebbe, niente verrà modificato.
              </p>
            ) : (
              <p className="text-xs text-red-700 font-semibold">
                ⚠️ ATTENZIONE: modificherà davvero il database. Devi inserire il secret.
              </p>
            )}
          </div>

          {!dryRun && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                CRON_SECRET (per autorizzare)
              </label>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="block w-full text-sm border border-slate-300 rounded-lg p-2"
                placeholder="Incolla il valore di CRON_SECRET"
              />
            </div>
          )}

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={skipOrders}
                onChange={(e) => setSkipOrders(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm text-slate-700">
                Skip orders (ripristina solo inventory, non gli ordini)
              </span>
            </label>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || !file}
            className="w-full bg-slate-900 text-white font-semibold py-3 rounded-lg hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {loading ? "Elaborazione..." : dryRun ? "Lancia DRY RUN" : "ESEGUI ROLLBACK"}
          </button>
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-red-900 mb-1">Errore</p>
            <pre className="text-xs text-red-800 whitespace-pre-wrap">{error}</pre>
          </div>
        )}

        {result && (
          <div className="mt-4 bg-slate-900 rounded-lg p-4 max-h-[600px] overflow-auto">
            <pre className="text-xs text-emerald-300 whitespace-pre-wrap font-mono">
              {result}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
