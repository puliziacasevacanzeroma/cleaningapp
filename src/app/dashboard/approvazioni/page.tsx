"use client";

import { useState } from "react";
import { ApprovazioniContent } from "~/components/dashboard/ApprovazioniContent";
import { ProprietaPendingContent } from "~/components/dashboard/ProprietaPendingContent";

type Tab = "utenti" | "proprieta";

const Ic = ({ d, className = "w-[18px] h-[18px]" }: { d: string | string[]; className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {(Array.isArray(d) ? d : [d]).map((p, i) => (
      <path key={i} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={p} />
    ))}
  </svg>
);

const ic = {
  users: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
  building: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
};

export default function ApprovazioniPage() {
  const [tab, setTab] = useState<Tab>("utenti");

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-3 sticky top-0 z-20">
        <h1 className="text-[20px] font-bold text-slate-800 mb-3">Approvazioni</h1>
        <div className="relative bg-slate-100 rounded-[14px] p-1">
          <div 
            className={`absolute top-1 left-1 w-[calc(50%-4px)] h-[calc(100%-8px)] bg-gradient-to-r from-sky-500 to-blue-500 rounded-[10px] shadow-[0_2px_8px_rgba(14,165,233,.25)] transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] ${tab === "proprieta" ? "translate-x-full" : ""}`} 
          />
          {(["utenti", "proprieta"] as Tab[]).map(t => (
            <button 
              key={t} 
              onClick={() => setTab(t)} 
              className={`flex-1 relative z-[1] py-[11px] flex items-center justify-center gap-[7px] text-[13px] font-semibold transition-colors duration-300 active:scale-[.97] ${tab === t ? "text-white" : "text-slate-400"}`}
            >
              <Ic d={t === "utenti" ? ic.users : ic.building} className="w-4 h-4" />
              {t === "utenti" ? "Utenti in Attesa" : "Proprietà in Attesa"}
            </button>
          ))}
        </div>
      </div>
      <div className="animate-[fadeUp_.3s_ease]" key={tab}>
        {tab === "utenti" ? <ApprovazioniContent /> : <ProprietaPendingContent />}
      </div>
      <style dangerouslySetInnerHTML={{ __html: "@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}" }} />
    </div>
  );
}
