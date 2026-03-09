"use client";

/**
 * Global Error Boundary — Cattura errori nel root layout.
 * NOTA: deve includere <html> e <body> perché sostituisce il root layout.
 * Usa inline styles perché Tailwind non è disponibile a questo livello.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="it">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            background: "linear-gradient(135deg, #06b6d4, #0284c7, #1d4ed8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              textAlign: "center",
              maxWidth: "24rem",
              background: "rgba(255,255,255,0.12)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderRadius: "1.5rem",
              padding: "2.5rem 2rem",
              border: "1px solid rgba(255,255,255,0.2)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                width: "4rem",
                height: "4rem",
                margin: "0 auto 1.25rem",
                borderRadius: "1rem",
                background: "rgba(255,255,255,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.75rem",
              }}
            >
              ⚠️
            </div>
            <h1
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                color: "#fff",
                marginBottom: "0.5rem",
              }}
            >
              Qualcosa è andato storto
            </h1>
            <p
              style={{
                fontSize: "0.875rem",
                color: "rgba(255,255,255,0.7)",
                marginBottom: "1.75rem",
                lineHeight: 1.6,
              }}
            >
              Si è verificato un errore imprevisto. Prova a ricaricare la pagina.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                onClick={reset}
                style={{
                  background: "rgba(255,255,255,0.95)",
                  color: "#0369a1",
                  border: "none",
                  borderRadius: "0.75rem",
                  padding: "0.75rem 1.5rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Riprova
              </button>
              <a
                href="/"
                style={{
                  color: "rgba(255,255,255,0.8)",
                  fontSize: "0.8125rem",
                  textDecoration: "none",
                }}
              >
                Torna alla Home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
