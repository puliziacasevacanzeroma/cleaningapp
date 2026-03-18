"use client";

import { useState } from "react";
import { ApprovazioniContent } from "~/components/dashboard/ApprovazioniContent";
import { ProprietaPendingContent } from "~/components/dashboard/ProprietaPendingContent";

type Tab = "utenti" | "proprieta";

const Ic = ({ d, className = "w-4 h-4" }: { d: string; className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
);

export default function ApprovazioniPage() {
  const [tab, setTab] = useState<Tab>("utenti");

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 px-4 pt-5 pb-14 text-white">
        <h1 className="text-[20px] font-bold">Approvazioni</h1>
        <p className="text-amber-100 text-[12px] mt-0.5">Utenti e proprietà in attesa</p>
      </div>
      <div className="mx-4 -mt-10 relative z-10">
        <div className="bg-white rounded-[14px] p-1 shadow-[0_2px_12px_rgba(0,0,0,.08)] flex relative">
          <div className={`absolute top-1 left-1 w-[calc(50%-4px)] h-[calc(100%-8px)] bg-gradient-to-r from-amber-500 to-orange-500 rounded-[10px] shadow-[0_2px_8px_rgba(245,158,11,.25)] transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] ${tab === "proprieta" ? "translate-x-full" : ""}`} />
          {(["utenti", "proprieta"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 relative z-[1] py-[11px] flex items-center justify-center gap-[7px] text-[13px] font-semibold transition-colors duration-300 active:scale-[.97] ${tab === t ? "text-white" : "text-slate-400"}`}>
              <Ic d={t === "utenti" ? "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" : "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"} />
              {t === "utenti" ? "Utenti" : "Proprietà"}
            </button>
          ))}
        </div>
      </div>
      <div key={tab} className="animate-[fadeUp_.3s_ease]">
        {tab === "utenti" ? <ApprovazioniContent embedded={true} /> : <ProprietaPendingContent embedded={true} />}
      </div>
      <style dangerouslySetInnerHTML={{ __html: "@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}" }} />
    </div>
  );
}
