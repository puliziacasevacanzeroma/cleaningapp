"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ApprovePropertyButtonProps {
  propertyId: string;
  action: "approve" | "reject";
}

export function ApprovePropertyButton({ propertyId, action }: ApprovePropertyButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/properties/${propertyId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      
      if (response.ok) {
        // Forza refresh completo della pagina
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || "Errore durante l'operazione");
        setLoading(false);
      }
    } catch (error) {
      console.error("Errore:", error);
      alert("Errore di connessione");
      setLoading(false);
    }
  };

  if (action === "approve") {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        className="px-4 py-2 bg-emerald-500 text-white font-medium rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-all"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Approvando...
          </span>
        ) : "✓ Approva"}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="px-4 py-2 bg-white border border-rose-300 text-rose-600 font-medium rounded-xl hover:bg-rose-50 disabled:opacity-50 transition-all"
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Rifiutando...
        </span>
      ) : "✗ Rifiuta"}
    </button>
  );
}
