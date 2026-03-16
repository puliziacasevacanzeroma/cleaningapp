/**
 * Pagina Impostazioni Proprietario — Redesign Accordion
 * 
 * Funzionalità:
 * - Dati personali (nome, telefono, email) con salvataggio Firebase
 * - Cambio password con re-autenticazione Firebase Auth
 * - Dati di fatturazione (BillingInfoForm)
 * - Preferenze notifiche con toggle
 * - Documenti firmati con visualizzazione e download PDF
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { doc, getDoc, updateDoc, Timestamp, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { auth } from "~/lib/firebase/config";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { BillingInfoForm } from "~/components/billing";
import type { BillingFormData, BillingInfo } from "~/types/billing";
import { 
  formDataToBillingInfo, 
  billingInfoToFormData, 
  createEmptyBillingFormData,
} from "~/types/billing";

// ==================== TIPI ====================

interface UserData {
  name: string;
  email: string;
  phone?: string;
  billingInfo?: BillingInfo;
  createdAt?: Date;
  role?: string;
  status?: string;
  registrationMethod?: string;
}

interface SignedDocument {
  id: string;
  documentId: string;
  documentTitle: string;
  documentVersion: string;
  documentType: string;
  fullName: string;
  fiscalCode: string;
  signatureImage: string;
  selfiePhotoUrl?: string;
  createdAt: Date;
  documentContent?: string;
}

// ==================== ICONE ====================

const ic = {
  user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  billing: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z",
  bell: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  docIcon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  check: "M5 13l4 4L19 7",
  checkCircle: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  chevDown: "M6 9l6 6 6-6",
  emailIcon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  phoneIcon: "M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z",
  sparkle: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
  money: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  eye: "M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  eyeFull: "M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
  download: "M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  close: "M6 18L18 6M6 6l12 12",
  error: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  lock: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  eyeOff: "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18",
  shield: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
};

function Svg({ d, className = "w-5 h-5", sw = 2 }: { d: string | string[]; className?: string; sw?: number }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw}>
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

// ==================== ACCORDION ====================

function Accordion({ title, subtitle, icon, accent, iconBg, iconColor, open, onToggle, children }: {
  title: string; subtitle: string; icon: string; accent: string; iconBg: string; iconColor: string;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-[18px] overflow-hidden border border-black/[.04] mb-2.5 transition-shadow duration-300 ${open ? "shadow-[0_2px_8px_rgba(0,0,0,0.06)]" : "shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"}`}>
      <button onClick={onToggle} className="flex items-center gap-3 w-full px-[18px] py-4 text-left transition-colors hover:bg-[#fafbfc]">
        <div className="w-1 h-10 rounded-sm flex-shrink-0" style={{ background: accent }} />
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
          <svg className="w-[19px] h-[19px]" fill="none" stroke={iconColor} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}><path d={icon} /></svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-900 tracking-tight">{title}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">{subtitle}</div>
        </div>
        <svg className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round" strokeWidth={2}><path d={ic.chevDown} /></svg>
      </button>
      <div className="overflow-hidden transition-all duration-400" style={{ maxHeight: open ? "2000px" : "0px" }}>
        <div className="px-[18px] pb-[18px]"><div className="h-px bg-slate-100 mb-4" />{children}</div>
      </div>
    </div>
  );
}

// ==================== TOGGLE ====================

function Toggle({ icon, iconBg, iconColor, label, desc, on, onToggle }: {
  icon: string; iconBg: string; iconColor: string; label: string; desc: string; on: boolean; onToggle: () => void;
}) {
  return (
    <div onClick={onToggle} className="flex items-center gap-3 p-3 bg-slate-50 rounded-[13px] mb-[7px] border border-slate-100 cursor-pointer transition-all hover:bg-slate-100 hover:border-slate-200">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
        <svg className="w-[14px] h-[14px]" fill="none" stroke={iconColor} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}><path d={icon} /></svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold text-slate-900">{label}</div>
        <div className="text-[9.5px] text-slate-400 font-medium mt-0.5">{desc}</div>
      </div>
      <div className={`w-[44px] h-6 rounded-xl relative transition-colors duration-300 flex-shrink-0 ${on ? "bg-indigo-500" : "bg-slate-300"}`}>
        <div className={`absolute w-5 h-5 rounded-full bg-white top-0.5 left-0.5 shadow-sm transition-transform duration-300 ${on ? "translate-x-5" : ""}`} />
      </div>
    </div>
  );
}

// ==================== FIELD ====================

function Field({ label, value, onChange, type = "text", disabled = false, placeholder = "", hint = "" }: {
  label: string; value: string; onChange?: (v: string) => void; type?: string; disabled?: boolean; placeholder?: string; hint?: string;
}) {
  const [showPw, setShowPw] = useState(false);
  const isPw = type === "password";
  return (
    <div className="mb-2.5">
      <label className="block text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</label>
      <div className="relative">
        <input type={isPw && showPw ? "text" : type} value={value} onChange={e => onChange?.(e.target.value)} disabled={disabled} placeholder={placeholder}
          className={`w-full px-3.5 py-[11px] border-[1.5px] rounded-xl text-[13.5px] font-medium outline-none transition-all ${disabled ? "border-slate-100 text-slate-400 bg-slate-50 cursor-not-allowed" : "border-slate-200 text-slate-900 focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-500/[.07]"} ${isPw ? "pr-10" : ""}`} />
        {isPw && (
          <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
            <Svg d={showPw ? ic.eyeOff : [ic.eye, ic.eyeFull]} className="w-4 h-4" />
          </button>
        )}
      </div>
      {hint && <p className={`text-[8.5px] mt-1 ${hint.startsWith("⚠") ? "text-amber-500" : hint.startsWith("✓") ? "text-green-500" : "text-slate-400"}`}>{hint}</p>}
    </div>
  );
}

// ==================== SAVE BUTTON ====================

function SaveBtn({ onClick, disabled, loading, label = "Salva" }: { onClick: () => void; disabled?: boolean; loading?: boolean; label?: string }) {
  return (
    <button onClick={onClick} disabled={disabled || loading}
      className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[12.5px] font-bold transition-all ${disabled ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-[0_2px_10px_rgba(99,102,241,.25)] hover:-translate-y-0.5 hover:shadow-[0_4px_18px_rgba(99,102,241,.35)]"} disabled:opacity-50`}>
      <Svg d={ic.check} className="w-3.5 h-3.5" sw={2.5} />
      {loading ? "Salvataggio..." : label}
    </button>
  );
}

// ==================== COMPONENTE PRINCIPALE ====================

export default function ImpostazioniPage() {
  const { user } = useAuth();
  
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["profilo"]));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  const [userData, setUserData] = useState<UserData>({ name: "", email: "", phone: "" });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  
  const [billingData, setBillingData] = useState<BillingFormData>(createEmptyBillingFormData());
  const [billingValid, setBillingValid] = useState(false);
  const [billingComplete, setBillingComplete] = useState(false);
  
  const [notificationPrefs, setNotificationPrefs] = useState({
    emailNotifications: true, pushNotifications: true, cleaningReminders: true, paymentAlerts: true,
  });

  const [signedDocuments, setSignedDocuments] = useState<SignedDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<SignedDocument | null>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);

  const [initialUserData, setInitialUserData] = useState<UserData>({ name: "", email: "", phone: "" });
  const [initialNotificationPrefs, setInitialNotificationPrefs] = useState({
    emailNotifications: true, pushNotifications: true, cleaningReminders: true, paymentAlerts: true,
  });
  const [initialBillingData, setInitialBillingData] = useState<BillingFormData>(createEmptyBillingFormData());

  const activeNotif = Object.values(notificationPrefs).filter(Boolean).length;

  const profileDirty = userData.name !== initialUserData.name || (userData.phone || "") !== (initialUserData.phone || "");
  const notifDirty = JSON.stringify(notificationPrefs) !== JSON.stringify(initialNotificationPrefs);
  const billingDirty = JSON.stringify(billingData) !== JSON.stringify(initialBillingData);

  const toggleSec = useCallback((id: string) => {
    setOpenSections(prev => {
      if (prev.has(id)) return new Set();
      return new Set([id]);
    });
  }, []);

  // ==================== LOAD ====================
  
  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      try {
        setLoading(true);
        const userDoc = await getDoc(doc(db, "users", user.id));
        if (userDoc.exists()) {
          const data = userDoc.data() as Record<string, any>;
          setUserData({ name: data.name || "", email: data.email || "", phone: data.phone || "", createdAt: data.createdAt?.toDate?.() || undefined, role: data.role || "", status: data.status || "", registrationMethod: data.registrationMethod || "email" });
          if (data.billingInfo) {
            const formData = billingInfoToFormData(data.billingInfo);
            if (data.billingInfo.type === "persona_fisica" && !formData.firstName && !formData.lastName && data.name) {
              const nameParts = data.name.trim().split(/\s+/);
              if (nameParts.length >= 2) {
                formData.firstName = nameParts[0];
                formData.lastName = nameParts.slice(1).join(" ");
              }
            }
            setBillingData(formData);
            setInitialBillingData({...formData});
            setBillingComplete(!!data.billingCompleted);
          }
          if (data.notificationPrefs) { setNotificationPrefs(prev => ({ ...prev, ...data.notificationPrefs })); setInitialNotificationPrefs(prev => ({ ...prev, ...data.notificationPrefs })); }
          setIsGoogleUser(data.registrationMethod === "google");
          setInitialUserData({ name: data.name || "", email: data.email || "", phone: data.phone || "" });
        }
      } catch (error) { console.error("Errore caricamento dati:", error); showMsg("error", "Errore nel caricamento dei dati"); } finally { setLoading(false); }
    }
    load();
  }, [user?.id]);

  useEffect(() => {
    async function loadDocs() {
      if (!user?.id) return;
      try {
        setLoadingDocuments(true);
        const snap = await getDocs(query(collection(db, "contractAcceptances"), where("userId", "==", user.id), where("status", "==", "valid")));
        const docs: SignedDocument[] = [];
        for (const docSnap of snap.docs) {
          const data = docSnap.data() as Record<string, any>;
          let dc = data.documentContent || "";
          if (!dc) { try { const r = await getDoc(doc(db, "regulationDocuments", data.documentId)); if (r.exists()) dc = (r.data() as Record<string, any>).content || ""; } catch {} }
          if (dc) {
            const ts = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "";
            const ip = data.metadata?.ipAddress || "N/A";
            dc = dc.replace(/\[Firma tramite Gestionale\]/g, "✓ Firmato digitalmente da " + (data.fullName || "—"))
              .replace(/\[FIRMA DIGITALE HOST – Gestionale\]/g, "✓ Firmato digitalmente da " + (data.fullName || "—"))
              .replace(/<span style="color:#999;font-style:italic">\[La tua firma\]<\/span>/g, "✓ Firmato digitalmente da " + (data.fullName || "—"))
              .replace(/\[La tua firma\]/g, "✓ Firmato digitalmente da " + (data.fullName || "—"))
              .replace(/\[FIRMA DIGITALE AUTO – Gestionale\]/g, "✓ Firma digitale – Puliziacasevacanze.it S.r.l.s.")
              .replace(/\[timestamp: AUTO \| IP: AUTO\]/g, "Timestamp: " + ts + " | IP: " + ip)
              .replace(/\[timestamp: AUTO \| IP:AUTO\]/g, "Timestamp: " + ts + " | IP: " + ip)
              .replace(/\[AUTO_SIG_HOST\]/g, "✓ Firmato digitalmente da " + (data.fullName || "—"))
              .replace(/\[AUTO_SIG_COMPANY\]/g, "✓ Firma digitale – Puliziacasevacanze.it S.r.l.s.")
              .replace(/\[AUTO_SIG_TIMESTAMP\]/g, ts + " | IP: " + ip)
              .replace(/Nome \/ Ragione Sociale: \[AUTO – Gestionale\]/g, "Nome / Ragione Sociale: " + (data.fullName || "—"))
              .replace(/C\.F\. \/ P\.IVA: \[AUTO – Gestionale\]/g, "C.F. / P.IVA: " + (data.fiscalCode || "—"))
              .replace(/Email: \[AUTO – Gestionale\]/g, "Email: " + (data.userEmail || "—"))
              .replace(/\[AUTO – Gestionale\]/g, "—").replace(/\[AUTO\]/g, "—");
          }
          docs.push({ id: docSnap.id, documentId: data.documentId, documentTitle: data.documentTitle || "Documento", documentVersion: data.documentVersion || "1.0", documentType: data.documentType || "regolamento", fullName: data.fullName, fiscalCode: data.fiscalCode, signatureImage: data.signatureImage, selfiePhotoUrl: data.selfiePhotoUrl || data.selfiePhotoBase64 || "", createdAt: data.createdAt?.toDate() || new Date(), documentContent: dc });
        }
        docs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setSignedDocuments(docs);
      } catch (error) { console.error("Errore caricamento documenti:", error); } finally { setLoadingDocuments(false); }
    }
    loadDocs();
  }, [user?.id]);

  // ==================== MSG + SAVE ====================

  const showMsg = (type: "success" | "error", text: string) => { setMessage({ type, text }); if (type === "success") setTimeout(() => setMessage(null), 3000); };

  const saveProfile = async () => {
    if (!user?.id) return;
    if (!userData.name.trim()) { showMsg("error", "Il nome è obbligatorio"); return; }
    try { setSaving(true); setMessage(null); await updateDoc(doc(db, "users", user.id), { name: userData.name.trim(), phone: userData.phone?.trim() || "", updatedAt: Timestamp.now() }); showMsg("success", "Profilo aggiornato con successo!"); setInitialUserData({ ...userData, name: userData.name.trim(), phone: userData.phone?.trim() || "" }); }
    catch { showMsg("error", "Errore durante il salvataggio"); } finally { setSaving(false); }
  };

  const changePassword = async () => {
    if (!auth.currentUser) { showMsg("error", "Sessione scaduta. Effettua di nuovo il login."); return; }
    if (!currentPassword) { showMsg("error", "Inserisci la password attuale"); return; }
    if (!newPassword || newPassword.length < 6) { showMsg("error", "La nuova password deve avere almeno 6 caratteri"); return; }
    if (newPassword !== confirmPassword) { showMsg("error", "Le password non coincidono"); return; }
    if (currentPassword === newPassword) { showMsg("error", "La nuova password deve essere diversa da quella attuale"); return; }
    try {
      setChangingPassword(true); setMessage(null);
      const credential = EmailAuthProvider.credential(auth.currentUser.email!, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      showMsg("success", "Password aggiornata con successo!");
    } catch (error: any) {
      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") showMsg("error", "La password attuale non è corretta");
      else if (error.code === "auth/weak-password") showMsg("error", "La password è troppo debole. Usa almeno 6 caratteri");
      else if (error.code === "auth/requires-recent-login") showMsg("error", "Sessione scaduta. Effettua logout e login, poi riprova");
      else if (error.code === "auth/too-many-requests") showMsg("error", "Troppi tentativi. Riprova tra qualche minuto");
      else showMsg("error", "Errore durante il cambio password. Riprova.");
    } finally { setChangingPassword(false); }
  };

  const saveBilling = async () => {
    if (!user?.id || !billingValid) return;
    try { setSaving(true); setMessage(null); await updateDoc(doc(db, "users", user.id), { billingInfo: formDataToBillingInfo(billingData), billingCompleted: true, updatedAt: Timestamp.now() }); setBillingComplete(true); setInitialBillingData({...billingData}); showMsg("success", "Dati di fatturazione salvati!"); }
    catch { showMsg("error", "Errore durante il salvataggio"); } finally { setSaving(false); }
  };

  const saveNotifications = async () => {
    if (!user?.id) return;
    try { setSaving(true); setMessage(null); await updateDoc(doc(db, "users", user.id), { notificationPrefs, updatedAt: Timestamp.now() }); showMsg("success", "Preferenze notifiche salvate!"); setInitialNotificationPrefs({...notificationPrefs}); }
    catch { showMsg("error", "Errore durante il salvataggio"); } finally { setSaving(false); }
  };

  const handleBillingChange = (data: BillingFormData, isValid: boolean) => { setBillingData(data); setBillingValid(isValid); };

  const dlPDF = async (d: SignedDocument) => {
    try {
      const res = await fetch("/api/contract/generate-pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acceptanceId: d.id }) });
      if (res.ok) {
        const ct = res.headers.get("content-type") || "";
        const fileName = `${d.documentTitle.replace(/\s+/g, "_")}_firmato`;
        if (ct.includes("application/pdf")) {
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = fileName + ".pdf"; a.style.display = "none"; document.body.appendChild(a); a.click(); setTimeout(() => { window.URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
        } else {
          const html = await res.text();
          const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${d.documentTitle}</title></head><body>${html}</body></html>`;
          const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = fileName + ".html"; a.style.display = "none"; document.body.appendChild(a); a.click(); setTimeout(() => { window.URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
        }
      } else { const e = await res.json().catch(() => ({ error: "Errore sconosciuto" })); showMsg("error", e.error || "Errore generazione PDF"); }
    } catch { showMsg("error", "Errore durante il download"); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500" /></div>;

  const initials = userData.name ? userData.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) : "??";
  const pwValid = currentPassword.length > 0 && newPassword.length >= 6 && newPassword === confirmPassword && currentPassword !== newPassword;

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* ═══ HEADER ═══ */}
      <div className="relative overflow-hidden bg-[#0c0f1a]" style={{ padding: "22px 18px 32px" }}>
        <div className="absolute inset-0 opacity-60" style={{ background: "radial-gradient(ellipse 350px 250px at 10% 50%, rgba(56,189,248,.25) 0%, transparent 70%), radial-gradient(ellipse 300px 200px at 90% 30%, rgba(99,102,241,.2) 0%, transparent 70%), radial-gradient(ellipse 250px 200px at 50% 100%, rgba(168,85,247,.15) 0%, transparent 70%)", animation: "pulse 20s ease-in-out infinite" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(12,15,26,.3), rgba(12,15,26,.85))" }} />
        <style>{`@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}`}</style>
        <div className="relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center text-[22px] font-extrabold text-white flex-shrink-0 border-2 border-white/10" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 4px 20px rgba(99,102,241,.3)" }}>{initials}</div>
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-tight">{userData.name || "Proprietario"}</h1>
              <p className="text-[11px] text-white/40 font-medium mt-0.5">{userData.email} · Proprietario</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            {(() => {
              const fmtDate = (d?: Date) => d ? d.toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "—";
              const lastDoc = signedDocuments.length > 0 ? signedDocuments.reduce((a, b) => a.createdAt > b.createdAt ? a : b) : null;
              return [
                { val: userData.createdAt ? fmtDate(userData.createdAt) : "—", label: "Membro dal", color: "#fff" },
                { val: billingComplete ? "✓" : "—", label: "Fatturazione", color: billingComplete ? "#22c55e" : "#f59e0b" },
                { val: lastDoc ? fmtDate(lastDoc.createdAt) : "—", label: "Ultimo contratto", color: "#fff" },
                { val: `${activeNotif}/4`, label: "Notifiche", color: activeNotif === 4 ? "#22c55e" : "#fff" },
              ].map((s, i) => (
                <div key={i} className="flex-1 rounded-xl p-2.5 text-center backdrop-blur-lg" style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.07)" }}>
                  <div className="text-[13px] font-extrabold tracking-tight" style={{ color: s.color }}>{s.val}</div>
                  <div className="text-[7.5px] font-bold text-white/30 uppercase tracking-widest mt-0.5">{s.label}</div>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="px-4 pb-10 -mt-3.5 relative z-10 max-w-[600px] mx-auto">
        {message && (
          <div className={`mb-3 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold ${message.type === "success" ? "bg-slate-900 text-white" : "bg-red-50 border border-red-200 text-red-700"}`}>
            <Svg d={message.type === "success" ? ic.check : ic.error} className={`w-4 h-4 flex-shrink-0 ${message.type === "success" ? "text-green-400" : ""}`} />
            {message.text}
          </div>
        )}

        {/* 1. PROFILO */}
        <Accordion title="Dati Personali" subtitle="Nome, email, telefono" icon={ic.user} accent="linear-gradient(180deg, #6366f1, #818cf8)" iconBg="#eef2ff" iconColor="#6366f1" open={openSections.has("profilo")} onToggle={() => toggleSec("profilo")}>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-[13px] mb-4 border border-slate-100">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-extrabold text-white" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>{initials}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-bold text-slate-900">{userData.name || "—"}</div>
              <div className="text-[10px] text-slate-400 font-medium">{userData.email}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-[8px] font-bold text-indigo-500 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded">{isGoogleUser ? "Google" : "Email"}</div>
              {userData.createdAt && <div className="text-[8px] text-slate-400 mt-1">dal {userData.createdAt.toLocaleDateString("it-IT")}</div>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2.5">
            <Field label="Nome e Cognome" value={userData.name} onChange={v => setUserData(p => ({ ...p, name: v }))} />
            <Field label="Telefono" value={userData.phone || ""} onChange={v => setUserData(p => ({ ...p, phone: v }))} type="tel" placeholder="+39 333 1234567" />
          </div>
          <Field label="Email" value={userData.email} disabled hint="L'email non può essere modificata" />
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-1">
            <span className="text-[9px] text-slate-400 font-medium">{userData.createdAt ? `Iscritto dal ${userData.createdAt.toLocaleDateString("it-IT")}` : ""}</span>
            <SaveBtn onClick={saveProfile} loading={saving} disabled={!userData.name.trim() || !profileDirty} label="Salva Profilo" />
          </div>
        </Accordion>

        {/* 2. SICUREZZA */}
        <Accordion title="Sicurezza" subtitle="Modifica la tua password" icon={ic.lock} accent="linear-gradient(180deg, #f59e0b, #fbbf24)" iconBg="#fffbeb" iconColor="#f59e0b" open={openSections.has("sicurezza")} onToggle={() => toggleSec("sicurezza")}>
          {isGoogleUser ? (
            <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-[13px] border border-amber-100">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-100"><Svg d={ic.shield} className="w-5 h-5 text-amber-600" /></div>
              <div>
                <div className="text-[13px] font-semibold text-amber-900">Account Google</div>
                <div className="text-[11px] text-amber-700 mt-0.5">Il tuo account utilizza l&apos;accesso con Google. La password è gestita direttamente da Google nelle impostazioni del tuo account Google.</div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-xl mb-4 border border-indigo-100">
                <Svg d={ic.shield} className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                <p className="text-[11px] text-indigo-700 font-medium">Per sicurezza, inserisci la password attuale prima di impostarne una nuova. Minimo 6 caratteri.</p>
              </div>
              <Field label="Password attuale" value={currentPassword} onChange={setCurrentPassword} type="password" placeholder="Inserisci la password attuale" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2.5">
                <Field label="Nuova password" value={newPassword} onChange={setNewPassword} type="password" placeholder="Minimo 6 caratteri" hint={newPassword.length > 0 && newPassword.length < 6 ? "⚠ Minimo 6 caratteri" : ""} />
                <Field label="Conferma nuova password" value={confirmPassword} onChange={setConfirmPassword} type="password" placeholder="Ripeti la nuova password" hint={confirmPassword.length > 0 && confirmPassword !== newPassword ? "⚠ Le password non coincidono" : confirmPassword.length > 0 && confirmPassword === newPassword ? "✓ Le password coincidono" : ""} />
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-1">
                <span className="text-[9px] text-slate-400 font-medium">{pwValid ? "✓ Pronto per il cambio" : "Compila tutti i campi"}</span>
                <SaveBtn onClick={changePassword} loading={changingPassword} disabled={!pwValid} label="Cambia Password" />
              </div>
            </>
          )}
        </Accordion>

        {/* 3. FATTURAZIONE */}
        <Accordion title="Dati di Fatturazione" subtitle="Fatturazione elettronica" icon={ic.billing} accent="linear-gradient(180deg, #8b5cf6, #a78bfa)" iconBg="#f5f3ff" iconColor="#8b5cf6" open={openSections.has("fatturazione")} onToggle={() => toggleSec("fatturazione")}>
          <BillingInfoForm initialData={billingData} onChange={handleBillingChange} compact />
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-3">
            <span className="text-[9px] text-slate-400 font-medium">{billingComplete ? "Dati completi ✓" : "Completa i dati obbligatori"}</span>
            <SaveBtn onClick={saveBilling} loading={saving} disabled={!billingValid || !billingDirty} label="Salva Fatturazione" />
          </div>
        </Accordion>

        {/* 4. NOTIFICHE */}
        <Accordion title="Preferenze Notifiche" subtitle={`${activeNotif} di 4 attive`} icon={ic.bell} accent="linear-gradient(180deg, #0ea5e9, #38bdf8)" iconBg="#e0f2fe" iconColor="#0ea5e9" open={openSections.has("notifiche")} onToggle={() => toggleSec("notifiche")}>
          <Toggle icon={ic.emailIcon} iconBg="#eef2ff" iconColor="#6366f1" label="Notifiche Email" desc="Aggiornamenti via email" on={notificationPrefs.emailNotifications} onToggle={() => setNotificationPrefs(p => ({ ...p, emailNotifications: !p.emailNotifications }))} />
          <Toggle icon={ic.phoneIcon} iconBg="#f5f3ff" iconColor="#8b5cf6" label="Notifiche Push" desc="Sul dispositivo" on={notificationPrefs.pushNotifications} onToggle={() => setNotificationPrefs(p => ({ ...p, pushNotifications: !p.pushNotifications }))} />
          <Toggle icon={ic.sparkle} iconBg="#e0f2fe" iconColor="#0ea5e9" label="Promemoria Pulizie" desc="Ricorda pulizie programmate" on={notificationPrefs.cleaningReminders} onToggle={() => setNotificationPrefs(p => ({ ...p, cleaningReminders: !p.cleaningReminders }))} />
          <Toggle icon={ic.money} iconBg="#f0fdf4" iconColor="#22c55e" label="Avvisi Pagamenti" desc="Notifiche su fatture" on={notificationPrefs.paymentAlerts} onToggle={() => setNotificationPrefs(p => ({ ...p, paymentAlerts: !p.paymentAlerts }))} />
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-2">
            <span className="text-[9px] text-slate-400 font-medium">{activeNotif} di 4 attive</span>
            <SaveBtn onClick={saveNotifications} loading={saving} disabled={!notifDirty} label="Salva Notifiche" />
          </div>
        </Accordion>

        {/* 5. DOCUMENTI */}
        <Accordion title="Documenti Firmati" subtitle={`${signedDocuments.length} documenti`} icon={ic.docIcon} accent="linear-gradient(180deg, #22c55e, #4ade80)" iconBg="#f0fdf4" iconColor="#22c55e" open={openSections.has("documenti")} onToggle={() => toggleSec("documenti")}>
          {loadingDocuments ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" /></div>
          ) : signedDocuments.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-xl"><Svg d={ic.docIcon} className="w-12 h-12 text-slate-300 mx-auto mb-3" sw={1.5} /><p className="text-slate-400 text-sm">Nessun documento firmato</p></div>
          ) : signedDocuments.map(d => (
            <div key={d.id} className="border border-slate-100 rounded-[14px] p-3.5 mb-2 transition-all hover:border-slate-200 hover:shadow-[0_2px_10px_rgba(0,0,0,.03)] bg-white">
              <div className="flex items-start gap-3">
                <div className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center flex-shrink-0 bg-green-50"><Svg d={ic.checkCircle} className="w-[17px] h-[17px] text-green-500" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-bold text-slate-900">{d.documentTitle}</div>
                  <div className="text-[9.5px] text-slate-400 font-semibold mt-0.5">Versione {d.documentVersion}</div>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    <span className="flex items-center gap-1 text-[9.5px] text-slate-500 font-medium"><Svg d={ic.calendar} className="w-2.5 h-2.5 text-slate-400" />{d.createdAt.toLocaleDateString("it-IT")}</span>
                    <span className="flex items-center gap-1 text-[9.5px] text-slate-500 font-medium"><Svg d={ic.user} className="w-2.5 h-2.5 text-slate-400" />{d.fullName}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 mt-2.5 pt-2.5 border-t border-slate-50">
                <button onClick={() => { setSelectedDocument(d); setShowDocumentModal(true); }} className="flex items-center gap-1 px-3 py-[7px] rounded-lg text-[10.5px] font-semibold bg-indigo-50 text-indigo-500 hover:bg-indigo-100 active:scale-95 active:bg-indigo-200 transition-all"><Svg d={[ic.eye, ic.eyeFull]} className="w-[11px] h-[11px]" />Visualizza</button>
                <button onClick={() => dlPDF(d)} className="flex items-center gap-1 px-3 py-[7px] rounded-lg text-[10.5px] font-semibold bg-slate-50 text-slate-500 hover:bg-slate-100 active:scale-95 active:bg-slate-200 transition-all"><Svg d={ic.download} className="w-[11px] h-[11px]" />PDF</button>
              </div>
            </div>
          ))}
        </Accordion>
      </div>

      {/* ═══ MODAL DOCUMENTO ═══ */}
      {showDocumentModal && selectedDocument && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] px-3 py-16 sm:p-6">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-full overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div><h3 className="font-semibold text-slate-900">{selectedDocument.documentTitle}</h3><p className="text-sm text-slate-500">Versione {selectedDocument.documentVersion}</p></div>
              <button onClick={() => setShowDocumentModal(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><Svg d={ic.close} className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {selectedDocument.documentContent ? (
                <>
                  <style dangerouslySetInnerHTML={{ __html: `.doc-view{overflow-x:hidden}.doc-view table{width:100%!important;table-layout:auto!important;font-size:.85em!important;border-collapse:collapse!important;max-width:100%!important;box-sizing:border-box!important}.doc-view th,.doc-view td{padding:6px 10px!important;word-break:break-word;overflow-wrap:break-word;width:auto!important;box-sizing:border-box!important}.doc-view th{text-align:left!important}.doc-view h1{font-size:1.2em!important}.doc-view p{font-size:.85em!important;line-height:1.5!important}.doc-view>div{max-width:100%!important;overflow:hidden!important}@media(max-width:640px){.doc-view table{font-size:.78em!important}.doc-view th,.doc-view td{padding:4px 6px!important}}` }} />
                  <div className="doc-view max-w-none" style={{ overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: selectedDocument.documentContent.replace(/width:\s*38%\s*;?/g, "").replace(/table-layout:\s*fixed\s*;?/g, "table-layout:auto;") }} />
                </>
              ) : <p className="text-slate-500 text-center py-8">Contenuto non disponibile</p>}
              <div className="mt-8 pt-6 border-t">
                <h4 className="font-semibold text-slate-900 mb-4">Dati Firma</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><p className="text-sm text-slate-500">Firmatario</p><p className="font-medium">{selectedDocument.fullName}</p></div>
                  <div><p className="text-sm text-slate-500">Codice Fiscale</p><p className="font-medium">{selectedDocument.fiscalCode}</p></div>
                  <div><p className="text-sm text-slate-500">Data e Ora</p><p className="font-medium">{selectedDocument.createdAt.toLocaleDateString("it-IT")} alle {selectedDocument.createdAt.toLocaleTimeString("it-IT")}</p></div>
                </div>
                {/* Firma + Selfie affiancati */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedDocument.signatureImage && (
                    <div>
                      <p className="text-sm text-slate-500 mb-2">Firma Digitale</p>
                      <div className="border border-slate-200 rounded-lg bg-white p-2 flex items-center justify-center" style={{minHeight: 96}}>
                        <img src={selectedDocument.signatureImage} alt="Firma" className="max-h-24 object-contain" />
                      </div>
                    </div>
                  )}
                  {selectedDocument.selfiePhotoUrl && (
                    <div>
                      <p className="text-sm text-slate-500 mb-2 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                        Foto Identità Verificata
                      </p>
                      <div className="border-2 border-green-200 rounded-lg bg-green-50 overflow-hidden" style={{minHeight: 96}}>
                        <img src={selectedDocument.selfiePhotoUrl} alt="Foto identità" className="w-full h-32 object-cover" />
                      </div>
                    </div>
                  )}
                  {!selectedDocument.selfiePhotoUrl && (
                    <div>
                      <p className="text-sm text-slate-500 mb-2">Foto Identità</p>
                      <div className="border border-dashed border-slate-200 rounded-lg bg-slate-50 flex items-center justify-center" style={{minHeight: 96}}>
                        <p className="text-xs text-slate-400 text-center px-3">Non disponibile<br/>(contratto precedente)</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowDocumentModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 active:scale-95 active:bg-slate-300 rounded-lg transition-all">Chiudi</button>
              <button onClick={() => dlPDF(selectedDocument)} className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 active:scale-95 active:bg-indigo-700 transition-all"><Svg d={ic.download} className="w-4 h-4" />Scarica PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
