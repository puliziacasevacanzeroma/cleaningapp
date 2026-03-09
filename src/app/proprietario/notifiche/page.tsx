"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useNotifications } from "~/hooks/useNotifications";
import { useSearchParams } from "next/navigation";

interface Issue {
  id: string; propertyId: string; propertyName: string; cleaningId?: string;
  type: string; title: string; description: string; severity: string; status: string;
  photos: string[]; isUrgent?: boolean; resolved?: boolean;
  reportedBy: string; reportedByName: string; createdAt: any; reportedAt?: any;
  resolvedAt?: any; resolvedByName?: string; resolutionNotes?: string;
}

const Ic = ({ d, className = "w-[18px] h-[18px]" }: { d: string | string[]; className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {(Array.isArray(d) ? d : [d]).map((p, i) => (
      <path key={i} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={p} />
    ))}
  </svg>
);

const ic = {
  bell: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  warn: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  check: "M5 13l4 4L19 7",
  trash: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  star: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
  coin: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  cal: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  chevR: "M9 5l7 7-7 7",
  close: "M6 18L18 6M6 6l12 12",
  box: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  gear: ["M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z", "M15 12a3 3 0 11-6 0 3 3 0 016 0z"],
};

function getNotifIcon(type: string) {
  switch (type) {
    case "CLEANING_ASSIGNED": case "CLEANING_COMPLETED": return { d: ic.star, color: "bg-sky-50 text-sky-500" };
    case "PROPERTY_APPROVED": case "NEW_PROPERTY": return { d: ic.check, color: "bg-emerald-50 text-emerald-500" };
    case "PROPERTY_REJECTED": case "ERROR": return { d: ic.close, color: "bg-red-50 text-red-500" };
    case "PAYMENT_DUE": case "WARNING": return { d: ic.coin, color: "bg-amber-50 text-amber-500" };
    case "PAYMENT_RECEIVED": case "SUCCESS": return { d: ic.coin, color: "bg-emerald-50 text-emerald-500" };
    default: return { d: ic.bell, color: "bg-indigo-50 text-indigo-500" };
  }
}

function getIssueIcon(type: string, isUrgent?: boolean) {
  if (isUrgent) return { d: ic.warn, bg: "bg-red-50 text-red-500" };
  switch (type) {
    case "damage": return { d: ic.warn, bg: "bg-red-50 text-red-500" };
    case "missing_item": return { d: ic.box, bg: "bg-amber-50 text-amber-500" };
    case "maintenance": return { d: ic.gear, bg: "bg-emerald-50 text-emerald-500" };
    case "cleanliness": return { d: ic.star, bg: "bg-sky-50 text-sky-500" };
    default: return { d: ic.bell, bg: "bg-slate-100 text-slate-500" };
  }
}

function timeAgo(date: Date): string {
  const ms = new Date().getTime() - date.getTime();
  const m = Math.floor(ms / 60000), h = Math.floor(ms / 3600000), d = Math.floor(ms / 86400000);
  if (m < 1) return "Adesso"; if (m < 60) return m + " min fa"; if (h < 24) return h + " ore fa"; if (d < 7) return d + " gg fa";
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDate(ts: any): string {
  if (!ts) return "-"; const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const SEV: Record<string, string> = { low: "bg-emerald-100 text-emerald-700", medium: "bg-amber-100 text-amber-700", high: "bg-orange-100 text-orange-700", critical: "bg-red-100 text-red-700" };
const SEV_L: Record<string, string> = { low: "Bassa", medium: "Media", high: "Alta", critical: "Critica" };
const ST_C: Record<string, string> = { open: "bg-red-100 text-red-700", in_progress: "bg-amber-100 text-amber-700", resolved: "bg-emerald-100 text-emerald-700" };

type MainTab = "notifiche" | "segnalazioni";
type NF = "all" | "unread" | "read" | "archived";
type IF = "all" | "open" | "resolved";

export default function CentroMessaggiPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("id");
  const [mainTab, setMainTab] = useState<MainTab>("notifiche");
  const [nf, setNf] = useState<NF>("all");
  const { notifications, unreadCount, loading: nLoad, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const fNotifs = notifications.filter(n => { switch (nf) { case "unread": return n.status === "UNREAD"; case "read": return n.status === "READ"; case "archived": return n.status === "ARCHIVED"; default: return n.status !== "ARCHIVED"; } });
  const nTabs = [
    { id: "all" as NF, label: "Tutte", count: notifications.filter(n => n.status !== "ARCHIVED").length },
    { id: "unread" as NF, label: "Non lette", count: unreadCount },
    { id: "read" as NF, label: "Lette", count: notifications.filter(n => n.status === "READ").length },
    { id: "archived" as NF, label: "Archiviate", count: notifications.filter(n => n.status === "ARCHIVED").length },
  ];
  const [issues, setIssues] = useState<Issue[]>([]);
  const [props, setProps] = useState<string[]>([]);
  const [iLoad, setILoad] = useState(true);
  const [iFilter, setIFilter] = useState<IF>("all");
  const [selIssue, setSelIssue] = useState<Issue | null>(null);
  const [lb, setLb] = useState<{ images: string[]; index: number } | null>(null);

  useEffect(() => { if (!user?.id) return; const q = query(collection(db, "properties"), where("ownerId", "==", user.id)); const unsub = onSnapshot(q, snap => setProps(snap.docs.map(d => d.id))); return () => unsub(); }, [user?.id]);

  useEffect(() => {
    if (props.length === 0) { setILoad(false); return; }
    const q = query(collection(db, "issues"), where("propertyId", "in", props.slice(0, 10)));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })) as Issue[];
      data.sort((a, b) => { const da = a.createdAt?.toDate?.() || a.reportedAt?.toDate?.() || new Date(0); const db2 = b.createdAt?.toDate?.() || b.reportedAt?.toDate?.() || new Date(0); return db2.getTime() - da.getTime(); });
      setIssues(data); setILoad(false);
      if (highlightId) { const f = data.find(i => i.id === highlightId); if (f) setSelIssue(f); }
    }, () => setILoad(false));
    return () => unsub();
  }, [props, highlightId]);

  const fIssues = issues.filter(i => { const r = i.resolved === true || i.status === "resolved"; if (iFilter === "open") return !r; if (iFilter === "resolved") return r; return true; });
  const openC = issues.filter(i => !(i.resolved === true || i.status === "resolved")).length;
  const urgC = issues.filter(i => i.isUrgent && !(i.resolved === true || i.status === "resolved")).length;
  const loading = mainTab === "notifiche" ? nLoad : iLoad;
  if (loading && ((mainTab === "notifiche" && notifications.length === 0) || (mainTab === "segnalazioni" && issues.length === 0))) return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500" /></div>;

  return (
    <div className="min-h-screen bg-[#f0f2f5] pb-24">
      <div className="bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-600 px-4 pt-5 pb-14 text-white relative">
        <h1 className="text-[20px] font-bold">Centro Messaggi</h1>
        <p className="text-sky-100 text-[12px] mt-0.5">Notifiche e segnalazioni</p>
        {mainTab === "notifiche" && unreadCount > 0 && (<button onClick={() => markAllAsRead()} className="absolute top-5 right-4 bg-white/20 backdrop-blur-sm text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg active:scale-95 active:bg-white/30 transition-all">Segna tutte lette</button>)}
        {mainTab === "segnalazioni" && urgC > 0 && (<div className="absolute top-5 right-4 bg-red-500/80 backdrop-blur-sm text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Ic d={ic.warn} className="w-3.5 h-3.5" /> {urgC} urgenti</div>)}
      </div>
      <div className="mx-4 -mt-10 relative z-10">
        <div className="bg-white rounded-[14px] p-1 shadow-[0_2px_12px_rgba(0,0,0,.08)] flex relative">
          <div className={`absolute top-1 left-1 w-[calc(50%-4px)] h-[calc(100%-8px)] bg-gradient-to-r from-sky-500 to-blue-500 rounded-[10px] shadow-[0_2px_8px_rgba(14,165,233,.25)] transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] ${mainTab === "segnalazioni" ? "translate-x-full" : ""}`} />
          {(["notifiche", "segnalazioni"] as MainTab[]).map(tab => (
            <button key={tab} onClick={() => setMainTab(tab)} className={`flex-1 relative z-[1] py-[11px] flex items-center justify-center gap-[7px] text-[13px] font-semibold transition-colors duration-300 active:scale-[.97] ${mainTab === tab ? "text-white" : "text-slate-400"}`}>
              <Ic d={tab === "notifiche" ? ic.bell : ic.warn} className="w-4 h-4" />
              {tab === "notifiche" ? "Notifiche" : "Segnalazioni"}
              {tab === "notifiche" && unreadCount > 0 && <span className={`min-w-[18px] h-[18px] px-[5px] rounded-[9px] text-[10px] font-bold inline-flex items-center justify-center ${mainTab === "notifiche" ? "bg-white/25 text-white" : "bg-red-100 text-red-500"}`}>{unreadCount}</span>}
              {tab === "segnalazioni" && openC > 0 && <span className={`min-w-[18px] h-[18px] px-[5px] rounded-[9px] text-[10px] font-bold inline-flex items-center justify-center ${mainTab === "segnalazioni" ? "bg-white/25 text-white" : "bg-red-100 text-red-500"}`}>{openC}</span>}
            </button>
          ))}
        </div>
      </div>
      {mainTab === "notifiche" && (
        <div className="px-4 pt-4 animate-[fadeUp_.3s_ease]">
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: "none" }}>
            {nTabs.map(t => (
              <button key={t.id} onClick={() => setNf(t.id)} className={`px-3.5 py-[7px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 border-[1.5px] ${nf === t.id ? "bg-sky-500 text-white border-sky-500 shadow-[0_2px_8px_rgba(14,165,233,.2)]" : "bg-white text-slate-500 border-slate-200"}`}>
                {t.label}{t.count > 0 ? ` (${t.count})` : ""}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {fNotifs.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center"><Ic d={ic.bell} className="w-12 h-12 text-slate-300 mx-auto mb-3" /><h3 className="text-[15px] font-bold text-slate-700">Nessuna notifica</h3><p className="text-[12px] text-slate-400 mt-1">Non hai notifiche in questa sezione</p></div>
            ) : fNotifs.map(n => {
              const ur = n.status === "UNREAD"; const ca = n.createdAt?.toDate?.() || new Date(); const { d, color } = getNotifIcon(n.type);
              return (
                <div key={n.id} className={`bg-white rounded-[16px] p-[14px] flex gap-3 transition-all cursor-pointer active:scale-[.985] shadow-[0_1px_3px_rgba(0,0,0,.03)] ${ur ? "border-2 border-sky-200 shadow-[0_2px_8px_rgba(14,165,233,.08)]" : "border-2 border-transparent"}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}><Ic d={d} /></div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-[13px] text-slate-800 ${ur ? "font-bold" : "font-semibold"}`}>{n.title}</h4>
                    <p className="text-[11.5px] text-slate-500 leading-[1.4] line-clamp-2">{n.message}</p>
                    {n.link && <a href={n.link} className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-500 mt-1">Visualizza <Ic d={ic.chevR} className="w-3 h-3" /></a>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="text-[10px] text-slate-400 font-medium">{timeAgo(ca)}</span>
                    <div className="flex gap-1">
                      {ur && <button onClick={e => { e.stopPropagation(); markAsRead(n.id); }} className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 active:scale-[.85] active:bg-sky-50 active:text-sky-500 transition-all" title="Segna letta"><Ic d={ic.check} className="w-[14px] h-[14px]" /></button>}
                      {n.status !== "ARCHIVED" && <button onClick={e => { e.stopPropagation(); deleteNotification(n.id); }} className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 active:scale-[.85] active:bg-red-50 active:text-red-500 transition-all" title="Elimina"><Ic d={ic.trash} className="w-[14px] h-[14px]" /></button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {mainTab === "segnalazioni" && (<div className="px-4 pt-4 animate-[fadeUp_.3s_ease]">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {([{ id: "all" as IF, label: "Tutte" }, { id: "open" as IF, label: `Aperte (${openC})` }, { id: "resolved" as IF, label: "Risolte" }]).map(t => (
              <button key={t.id} onClick={() => setIFilter(t.id)} className={`px-3.5 py-[7px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 border-[1.5px] ${iFilter === t.id ? "bg-sky-500 text-white border-sky-500" : "bg-white text-slate-500 border-slate-200"}`}>{t.label}</button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 mb-3">
            <div className="bg-white rounded-[14px] p-3 text-center border border-slate-100"><p className="text-[22px] font-bold text-slate-700">{issues.length}</p><p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">Totali</p></div>
            <div className="bg-white rounded-[14px] p-3 text-center border border-slate-100"><p className="text-[22px] font-bold text-amber-500">{openC}</p><p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">Aperte</p></div>
            <div className="bg-white rounded-[14px] p-3 text-center border border-slate-100"><p className="text-[22px] font-bold text-emerald-500">{issues.length - openC}</p><p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">Risolte</p></div>
          </div>
          <div className="space-y-2">
            {fIssues.length === 0 ? (<div className="bg-white rounded-2xl p-10 text-center"><Ic d={ic.check} className="w-12 h-12 text-slate-300 mx-auto mb-3" /><h3 className="text-[15px] font-bold text-slate-700">Nessuna segnalazione</h3></div>
            ) : fIssues.map(issue => {
              const isRes = issue.resolved === true || issue.status === "resolved"; const { d, bg } = getIssueIcon(issue.type, issue.isUrgent);
              return (<div key={issue.id} onClick={() => setSelIssue(issue)} className={`bg-white rounded-[16px] p-[14px] flex gap-3 cursor-pointer transition-all active:scale-[.985] border-l-4 ${issue.isUrgent ? "border-l-red-500 bg-red-50/30" : isRes ? "border-l-emerald-500 opacity-65" : "border-l-amber-500"} ${highlightId === issue.id ? "ring-2 ring-sky-500" : ""}`}>
                  <div className={`w-[38px] h-[38px] rounded-[11px] flex items-center justify-center flex-shrink-0 ${bg}`}><Ic d={d} /></div>
                  <div className="flex-1 min-w-0"><h4 className="text-[13px] font-bold text-slate-800 truncate">{issue.title}</h4><p className="text-[11px] text-slate-400 mt-0.5">{issue.propertyName}</p><p className="text-[11.5px] text-slate-500 mt-1 truncate">{issue.description}</p>
                    <div className="flex gap-1 mt-[7px] flex-wrap items-center"><span className={`text-[9.5px] font-bold px-[7px] py-[2px] rounded-full ${SEV[issue.severity] || SEV.low}`}>{SEV_L[issue.severity] || "Bassa"}</span><span className={`text-[9.5px] font-bold px-[7px] py-[2px] rounded-full ${isRes ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{isRes ? "Risolta" : "Aperta"}</span><span className="text-[10px] text-slate-400">{fmtDate(issue.reportedAt || issue.createdAt)}</span></div>
                  </div></div>);
            })}</div></div>)}
      {selIssue && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelIssue(null)}><div className="absolute inset-0 bg-black/60" /><div className="relative bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}><div className={`px-4 py-4 flex items-center justify-between ${selIssue.isUrgent ? "bg-gradient-to-r from-red-500 to-rose-500" : "bg-gradient-to-r from-sky-500 to-blue-500"}`}><div className="flex items-center gap-3 flex-1 min-w-0"><div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"><Ic d={getIssueIcon(selIssue.type, selIssue.isUrgent).d} className="w-5 h-5 text-white" /></div><div className="min-w-0 flex-1"><h3 className="font-bold text-white truncate">{selIssue.title}</h3><p className="text-white/80 text-xs">{selIssue.propertyName}</p></div></div><button onClick={() => setSelIssue(null)} className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white ml-2"><Ic d={ic.close} className="w-4 h-4" /></button></div><div className="flex-1 overflow-y-auto p-4 space-y-3"><div className="flex gap-2"><span className={`px-2.5 py-1 rounded-full text-xs font-bold ${ST_C[selIssue.status] || ST_C.open}`}>{selIssue.status === "resolved" ? "Risolta" : "Aperta"}</span><span className={`px-2.5 py-1 rounded-full text-xs font-bold ${SEV[selIssue.severity] || SEV.low}`}>{SEV_L[selIssue.severity] || "Bassa"}</span></div><div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Descrizione</p><p className="text-sm text-slate-700">{selIssue.description}</p></div>{selIssue.photos?.length > 0 && (<div><p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Foto</p><div className="flex gap-2 overflow-x-auto">{selIssue.photos.map((p, i) => (<img key={i} src={p} alt="" className="w-20 h-20 object-cover rounded-xl cursor-pointer" onClick={() => setLb({ images: selIssue.photos, index: i })} />))}</div></div>)}<div className="text-sm space-y-1"><div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-slate-500 text-xs">Segnalato da</span><span className="text-xs font-medium">{selIssue.reportedByName}</span></div><div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-slate-500 text-xs">Data</span><span className="text-xs font-medium">{fmtDate(selIssue.reportedAt || selIssue.createdAt)}</span></div></div></div><div className="p-4 bg-slate-50 border-t"><button onClick={() => setSelIssue(null)} className="w-full py-3 bg-slate-200 text-slate-700 font-bold rounded-xl active:scale-[.98] transition-all">Chiudi</button></div></div></div>)}
      {lb && (<div className="fixed inset-0 z-[100] bg-black flex items-center justify-center" onClick={() => setLb(null)}><button className="absolute top-4 right-4 text-white"><Ic d={ic.close} className="w-6 h-6" /></button><img src={lb.images[lb.index]} alt="" className="max-w-full max-h-full object-contain" /></div>)}
      <style dangerouslySetInnerHTML={{ __html: "@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}" }} />
    </div>
  );
}
