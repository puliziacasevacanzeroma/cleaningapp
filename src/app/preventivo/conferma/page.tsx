/**
 * /preventivo/conferma — Pagina PUBBLICA di conferma prezzo (dal link nella mail).
 *
 * Flusso: il cliente clicca il link nella mail → questa pagina carica (GET, nessuna
 * scrittura: gli scanner email seguono i GET) → il cliente preme "Confermo il prezzo"
 * → POST → il lead viene segnato come accettato e l'admin lo vede nel gestionale.
 */

"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface Info {
  nome: string;
  numeroPreventivo: string;
  tipo: string;
  min: number;
  max: number;
  unitaDettaglio: { nome: string; min: number; max: number }[] | null;
  giaAccettato: boolean;
}

function ConfermaInner() {
  const params = useSearchParams();
  const token = params.get("t") ?? "";
  const [fase, setFase] = useState<"carico" | "pronto" | "invio" | "fatto" | "errore">("carico");
  const [info, setInfo] = useState<Info | null>(null);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch("/api/leads/confirm?t=" + encodeURIComponent(token));
        const data = await res.json();
        if (!vivo) return;
        if (!data.ok) { setErrore(data.errore || "Link non valido"); setFase("errore"); return; }
        setInfo(data as Info);
        setFase(data.giaAccettato ? "fatto" : "pronto");
      } catch {
        if (vivo) { setErrore("Errore di rete: riprova tra poco."); setFase("errore"); }
      }
    })();
    return () => { vivo = false; };
  }, [token]);

  const conferma = useCallback(async () => {
    setFase("invio");
    try {
      const res = await fetch("/api/leads/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!data.ok) { setErrore(data.errore || "Conferma non riuscita"); setFase("errore"); return; }
      setFase("fatto");
    } catch {
      setErrore("Errore di rete: riprova tra poco.");
      setFase("errore");
    }
  }, [token]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-sky-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl max-w-lg w-full overflow-hidden">
        {/* testata brand (stessi colori del wizard) */}
        <div className="bg-gradient-to-br from-[#2A4257] to-[#3D5A73] px-6 py-5 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/preventivo/logo-mail.png" alt="" className="h-11 w-auto mb-2" />
          <div className="font-extrabold text-lg leading-tight">Puliziacasevacanze.it</div>
          <div className="text-white/80 text-sm">Conferma del preventivo</div>
        </div>

        <div className="p-6">
          {fase === "carico" && (
            <div className="py-10 text-center text-slate-500">Carico il tuo preventivo…</div>
          )}

          {fase === "errore" && (
            <div className="py-6 text-center">
              <div className="text-4xl mb-3">🤔</div>
              <div className="font-bold text-slate-800 text-lg">Qualcosa non torna</div>
              <p className="text-sm text-slate-600 mt-2">{errore}</p>
              <p className="text-sm text-slate-500 mt-4">
                Puoi sempre scriverci su{" "}
                <a className="font-semibold text-[#B0764A]" href="https://wa.me/393927830017">WhatsApp</a>{" "}
                o chiamare il <a className="font-semibold text-[#B0764A]" href="tel:+393927830017">392 783 0017</a>.
              </p>
            </div>
          )}

          {(fase === "pronto" || fase === "invio") && info && (
            <>
              <h1 className="text-xl font-extrabold text-slate-800">
                Ciao{info.nome ? ` ${info.nome.split(" ")[0]}` : ""}, confermi il prezzo?
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Preventivo {info.numeroPreventivo ? <b>N°{info.numeroPreventivo}</b> : null}
              </p>

              {info.unitaDettaglio && info.unitaDettaglio.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {info.unitaDettaglio.map((u, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                      <span className="text-sm font-semibold text-slate-700">{u.nome}</span>
                      <span className="text-sm font-bold text-slate-800">da €{u.min} <span className="text-slate-400 font-normal">· max €{u.max}</span></span>
                    </div>
                  ))}
                  <p className="text-[11px] text-slate-400">Prezzo a pulizia, per singola casa.</p>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-200 px-5 py-4 text-center">
                  <div className="text-xs font-bold tracking-wide text-slate-400 uppercase">{info.tipo === "bnb" ? "Prezzo a camera" : "Prezzo a pulizia"}</div>
                  <div className="text-3xl font-extrabold text-slate-800 mt-1">
                    {info.tipo === "bnb" ? <>da €{info.min}<span className="text-base font-semibold text-slate-500">/camera</span></> : <>€{info.min} – €{info.max}</>}
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={fase === "invio"}
                onClick={conferma}
                className="mt-5 w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold text-base shadow-md transition-all disabled:opacity-60"
              >
                {fase === "invio" ? "Un attimo…" : "✓ Confermo il prezzo"}
              </button>
              <p className="text-xs text-slate-500 text-center mt-3 leading-relaxed">
                Dopo la conferma ti ricontattiamo noi per organizzare il sopralluogo gratuito e l'avvio.
                Nessun pagamento adesso, nessun vincolo: il prezzo definitivo lo firmiamo insieme.
              </p>
            </>
          )}

          {fase === "fatto" && (
            <div className="py-6 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              </div>
              <div className="font-extrabold text-slate-800 text-xl mt-4">Prezzo confermato!</div>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                Grazie{info?.nome ? ` ${info.nome.split(" ")[0]}` : ""}. Ti ricontattiamo <b>entro 24 ore</b> per
                organizzare il sopralluogo gratuito e iniziare la collaborazione.
              </p>
              <p className="text-sm text-slate-500 mt-4">
                Vuoi anticiparci? <a className="font-semibold text-[#B0764A]" href="https://wa.me/393927830017?text=Ciao!%20Ho%20appena%20confermato%20il%20preventivo.">Scrivici su WhatsApp</a>
              </p>
              {/* 🔗 Uscita esplicita verso il sito principale */}
              <a href="https://puliziacasevacanze.it" className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors">
                ← Torna al sito
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function PaginaConferma() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center text-slate-500">Carico…</main>}>
      <ConfermaInner />
    </Suspense>
  );
}
