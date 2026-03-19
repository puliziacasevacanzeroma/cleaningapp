"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { NotificheAdminContent } from "~/components/dashboard/NotificheAdminContent";
import { SegnalazioniAdminContent } from "~/components/dashboard/SegnalazioniAdminContent";

type Tab = "notifiche" | "segnalazioni";

const Ic = ({ d, className = "w-4 h-4" }: { d: string; className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
);

export default function CentroMessaggiPage() {
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const initialInternalTab = urlTab === "modifications" ? urlTab : undefined;
  const initialIssueId = searchParams.get("id") || undefined;
  const [tab, setTab] = useState<Tab>(urlTab === "segnalazioni" ? "segnalazioni" : "notifiche");

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <div className="bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-600 px-4 pt-5 pb-14 text-white">
        <h1 className="text-[20px] font-bold">Centro Messaggi</h1>
        <p className="text-sky-100 text-[12px] mt-0.5">Notifiche e segnalazioni</p>
      </div>
      <div className="mx-4 -mt-10 relative z-10">
        <div className="bg-white rounded-[14px] p-1 shadow-[0_2px_12px_rgba(0,0,0,.08)] flex relative">
          <div className={`absolute top-1 left-1 w-[calc(50%-4px)] h-[calc(100%-8px)] bg-gradient-to-r from-sky-500 to-blue-500 rounded-[10px] shadow-[0_2px_8px_rgba(14,165,233,.25)] transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] ${tab === "segnalazioni" ? "translate-x-full" : ""}`} />
          {(["notifiche", "segnalazioni"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 relative z-[1] py-[11px] flex items-center justify-center gap-[7px] text-[13px] font-semibold transition-colors duration-300 active:scale-[.97] ${tab === t ? "text-white" : "text-slate-400"}`}>
              <Ic d={t === "notifiche" ? "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" : "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"} />
              {t === "notifiche" ? "Notifiche" : "Segnalazioni"}
            </button>
          ))}
        </div>
      </div>
      <div key={tab} className="animate-[fadeUp_.3s_ease]">
        {tab === "notifiche" ? <NotificheAdminContent embedded={true} initialTab={initialInternalTab} /> : <SegnalazioniAdminContent embedded={true} initialIssueId={initialIssueId} />}
      </div>
      <style dangerouslySetInnerHTML={{ __html: "@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}" }} />
    </div>
  );
}
