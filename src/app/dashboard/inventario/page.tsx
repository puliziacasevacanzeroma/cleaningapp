"use client";

import { useState } from "react";
import { InventarioClientWrapper } from "~/components/dashboard/InventarioClientWrapper";
import { InventarioProdottiWrapper } from "~/components/dashboard/InventarioProdottiWrapper";

type Tab = "biancheria" | "prodotti";

const Ic = ({ d, className = "w-[18px] h-[18px]" }: { d: string | string[]; className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {(Array.isArray(d) ? d : [d]).map((p, i) => (
      <path key={i} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={p} />
    ))}
  </svg>
);

const ic = {
  bed: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
  clean: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
};

export default function InventarioPage() {
  const [tab, setTab] = useState<Tab>("biancheria");

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header con Tab stile centro messaggi proprietario */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-3 sticky top-0 z-20">
        <h1 className="text-[20px] font-bold text-slate-800 mb-3">Inventario</h1>
        <div className="relative bg-slate-100 rounded-[14px] p-1">
          <div 
            className={`absolute top-1 left-1 w-[calc(50%-4px)] h-[calc(100%-8px)] bg-gradient-to-r from-sky-500 to-blue-500 rounded-[10px] shadow-[0_2px_8px_rgba(14,165,233,.25)] transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] ${tab === "prodotti" ? "translate-x-full" : ""}`} 
          />
          {(["biancheria", "prodotti"] as Tab[]).map(t => (
            <button 
              key={t} 
              onClick={() => setTab(t)} 
              className={`flex-1 relative z-[1] py-[11px] flex items-center justify-center gap-[7px] text-[13px] font-semibold transition-colors duration-300 active:scale-[.97] ${tab === t ? "text-white" : "text-slate-400"}`}
            >
              <Ic d={t === "biancheria" ? ic.bed : ic.clean} className="w-4 h-4" />
              {t === "biancheria" ? "Biancheria & Dotazioni" : "Prodotti Pulizia"}
            </button>
          ))}
        </div>
      </div>

      {/* Contenuto tab */}
      <div className="animate-[fadeUp_.3s_ease]" key={tab}>
        {tab === "biancheria" ? <InventarioClientWrapper /> : <InventarioProdottiWrapper />}
      </div>

      <style dangerouslySetInnerHTML={{ __html: "@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}" }} />
    </div>
  );
}
