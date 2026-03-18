"use client";

import { useState } from "react";
import { InventarioClientWrapper } from "~/components/dashboard/InventarioClientWrapper";
import { InventarioProdottiWrapper } from "~/components/dashboard/InventarioProdottiWrapper";

type Tab = "biancheria" | "prodotti";

const Ic = ({ d, className = "w-4 h-4" }: { d: string; className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
);

export default function InventarioPage() {
  const [tab, setTab] = useState<Tab>("biancheria");

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <div className="bg-gradient-to-br from-sky-500 via-cyan-500 to-teal-500 px-4 pt-5 pb-14 text-white">
        <h1 className="text-[20px] font-bold">Inventario</h1>
        <p className="text-sky-100 text-[12px] mt-0.5">Biancheria e prodotti pulizia</p>
      </div>
      <div className="mx-4 -mt-10 relative z-10">
        <div className="bg-white rounded-[14px] p-1 shadow-[0_2px_12px_rgba(0,0,0,.08)] flex relative">
          <div className={`absolute top-1 left-1 w-[calc(50%-4px)] h-[calc(100%-8px)] bg-gradient-to-r from-sky-500 to-cyan-500 rounded-[10px] shadow-[0_2px_8px_rgba(14,165,233,.25)] transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] ${tab === "prodotti" ? "translate-x-full" : ""}`} />
          {(["biancheria", "prodotti"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 relative z-[1] py-[11px] flex items-center justify-center gap-[7px] text-[13px] font-semibold transition-colors duration-300 active:scale-[.97] ${tab === t ? "text-white" : "text-slate-400"}`}>
              <Ic d={t === "biancheria" ? "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" : "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"} />
              {t === "biancheria" ? "Biancheria" : "Prodotti"}
            </button>
          ))}
        </div>
      </div>
      <div key={tab} className="animate-[fadeUp_.3s_ease]">
        {tab === "biancheria" ? <InventarioClientWrapper /> : <InventarioProdottiWrapper />}
      </div>
      <style dangerouslySetInnerHTML={{ __html: "@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}" }} />
    </div>
  );
}
