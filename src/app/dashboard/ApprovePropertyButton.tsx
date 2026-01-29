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
        router.refresh();
      }
    } catch (error) {
      console.error("Errore:", error);
    } finally {
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
        {loading ? "..." : "✓ Approva"}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="px-4 py-2 bg-white border border-rose-300 text-rose-600 font-medium rounded-xl hover:bg-rose-50 disabled:opacity-50 transition-all"
    >
      {loading ? "..." : "✗ Rifiuta"}
    </button>
  );
}