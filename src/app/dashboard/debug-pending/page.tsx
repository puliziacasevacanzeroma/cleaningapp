"use client";

/**
 * 🔍 Pagina Debug — Proprietà Pending & Notifiche
 * URL: /dashboard/debug-pending
 * Accessibile solo admin — legge direttamente da Firestore client-side
 */

import { useState, useEffect } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import {
  collection, query, where, getDocs, orderBy, limit, doc, getDoc
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export default function DebugPendingPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [users, setUsers] = useState<any[]>([]);

  // Carica lista proprietari
  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    getDocs(query(
      collection(db, "users"),
      where("role", "==", "PROPRIETARIO"),
      orderBy("name", "asc"),
      limit(100)
    )).then(snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  const runDiagnosis = async () => {
    setLoading(true);
    setReport(null);
    const r: any = { timestamp: new Date().toISOString(), sezioni: {} };

    try {
      // ── 1. Tutte le proprietà PENDING / PENDING_SIGNATURE ──
      const pendingSnap = await getDocs(query(
        collection(db, "properties"),
        where("status", "in", ["PENDING", "PENDING_SIGNATURE"])
      ));

      r.sezioni.proprieta_pending = pendingSnap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name,
          status: data.status,
          ownerId: data.ownerId || "❌ MANCANTE",
          ownerIdTipo: typeof data.ownerId,
          ownerIdProblema: !data.ownerId || data.ownerId === "pending" || data.ownerId === ""
            ? "⚠️ ownerId non valido → proprietario non la vedrà MAI"
            : "✅ ok",
          ownerName: data.ownerName || "—",
          ownerEmail: data.ownerEmail || "—",
          cleaningPrice: data.cleaningPrice || 0,
          createdAt: data.createdAt?.toDate?.()?.toLocaleString("it-IT") || "—",
        };
      });

      // ── 2. Proprietà con ownerId="pending" o vuoto ──
      const pendingOwnerSnap = await getDocs(query(
        collection(db, "properties"),
        where("ownerId", "==", "pending")
      ));
      const emptyOwnerSnap = await getDocs(query(
        collection(db, "properties"),
        where("ownerId", "==", "")
      ));

      r.sezioni.bug_ownerId_invalido = [
        ...pendingOwnerSnap.docs.map(d => ({
          id: d.id, name: (d.data() as any).name,
          status: (d.data() as any).status,
          ownerId: "pending", ownerEmail: (d.data() as any).ownerEmail,
          problema: "ownerId='pending' — proprietà invisibile al proprietario"
        })),
        ...emptyOwnerSnap.docs.map(d => ({
          id: d.id, name: (d.data() as any).name,
          status: (d.data() as any).status,
          ownerId: '""', ownerEmail: (d.data() as any).ownerEmail,
          problema: "ownerId='' — proprietà invisibile al proprietario"
        })),
      ];

      // ── 3. Se userId selezionato, analisi specifica ──
      if (selectedUserId) {
        // Proprietà di questo utente
        const myPropsSnap = await getDocs(query(
          collection(db, "properties"),
          where("ownerId", "==", selectedUserId),
          orderBy("name", "asc")
        ));

        r.sezioni.proprieta_utente_selezionato = myPropsSnap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id, name: data.name,
            status: data.status,
            ownerId: data.ownerId,
            cleaningPrice: data.cleaningPrice,
            visible_al_proprietario: ["ACTIVE", "PENDING", "PENDING_SIGNATURE", "PENDING_DELETION"].includes(data.status)
              ? "✅ Sì" : "❌ No (status non gestito)",
          };
        });

        // Notifiche per questo utente (recipientId = userId)
        const notifByIdSnap = await getDocs(query(
          collection(db, "notifications"),
          where("recipientId", "==", selectedUserId),
          orderBy("createdAt", "desc"),
          limit(20)
        ));

        r.sezioni.notifiche_utente = notifByIdSnap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            title: data.title,
            message: (data.message || "").substring(0, 120),
            type: data.type,
            recipientId: data.recipientId,
            recipientIdTipo: typeof data.recipientId,
            status: data.status,
            link: data.link || "—",
            createdAt: data.createdAt?.toDate?.()?.toLocaleString("it-IT") || "—",
          };
        });

        // Notifiche broadcast PROPRIETARIO (senza recipientId specifico)
        const broadcastSnap = await getDocs(query(
          collection(db, "notifications"),
          where("recipientRole", "==", "PROPRIETARIO"),
          orderBy("createdAt", "desc"),
          limit(20)
        ));

        // Cerca notifiche con recipientId che è un OGGETTO (bug storico)
        const buggedNotifs = broadcastSnap.docs.filter(d => {
          const data = d.data() as any;
          return typeof data.recipientId === "object" && data.recipientId !== null;
        });

        r.sezioni.notifiche_bug_recipientId_oggetto = buggedNotifs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            title: data.title,
            recipientId_valore: JSON.stringify(data.recipientId),
            problema: "recipientId è un oggetto {name:...} invece di stringa ID — mai visibile",
            createdAt: data.createdAt?.toDate?.()?.toLocaleString("it-IT") || "—",
          };
        });

        // Cerca proprietà per ownerEmail (utente potrebbe avere ownerId diverso)
        const userDoc = await getDoc(doc(db, "users", selectedUserId));
        const userEmail = (userDoc.data() as any)?.email || "";

        if (userEmail) {
          const propsByEmailSnap = await getDocs(query(
            collection(db, "properties"),
            where("ownerEmail", "==", userEmail)
          ));

          r.sezioni.proprieta_per_email = propsByEmailSnap.docs.map(d => {
            const data = d.data() as any;
            const ownerIdMatch = data.ownerId === selectedUserId;
            return {
              id: d.id,
              name: data.name,
              status: data.status,
              ownerId: data.ownerId,
              ownerIdMatchUserId: ownerIdMatch ? "✅ MATCH" : `❌ DISCREPANZA — ownerId="${data.ownerId}" ≠ userId="${selectedUserId}"`,
              cleaningPrice: data.cleaningPrice,
            };
          });

          r.sezioni.utente_info = {
            id: selectedUserId,
            email: userEmail,
            name: (userDoc.data() as any)?.name,
            role: (userDoc.data() as any)?.role,
          };
        }
      }

      // ── 4. DIAGNOSI AUTOMATICA ──
      const diagnosi: string[] = [];

      const pendingProps = r.sezioni.proprieta_pending || [];
      const bugOwner = r.sezioni.bug_ownerId_invalido || [];

      if (bugOwner.length > 0) {
        diagnosi.push(`❌ ${bugOwner.length} proprietà con ownerId non valido ("pending" o "") → non appaiono mai al proprietario`);
      }

      if (selectedUserId) {
        const userProps = r.sezioni.proprieta_utente_selezionato || [];
        const pendingForUser = pendingProps.filter((p: any) => p.ownerId === selectedUserId);
        const allForUser = userProps.length;

        if (allForUser === 0) {
          diagnosi.push(`❌ CRITICO: Nessuna proprietà trovata con ownerId="${selectedUserId}". Controlla 'proprieta_per_email' per vedere se esistono ma con ownerId diverso`);
        } else {
          diagnosi.push(`✅ Trovate ${allForUser} proprietà con ownerId="${selectedUserId}"`);
        }

        const bugNotifs = r.sezioni.notifiche_bug_recipientId_oggetto || [];
        if (bugNotifs.length > 0) {
          diagnosi.push(`❌ ${bugNotifs.length} notifiche con recipientId=oggetto (bug storico) — mai arrivate. Il bug è stato fixato, ma quelle vecchie restano invisibili`);
        }

        const userNotifs = r.sezioni.notifiche_utente || [];
        if (userNotifs.length === 0) {
          diagnosi.push(`⚠️ Nessuna notifica con recipientId="${selectedUserId}" — o non ancora inviate o inviate con ID sbagliato`);
        } else {
          diagnosi.push(`✅ ${userNotifs.length} notifiche trovate per questo utente`);
        }

        // Check discrepanza ownerId
        const emailProps = r.sezioni.proprieta_per_email || [];
        const discrepanze = emailProps.filter((p: any) => !p.ownerIdMatchUserId.startsWith("✅"));
        if (discrepanze.length > 0) {
          diagnosi.push(`❌ ${discrepanze.length} proprietà hanno ownerEmail giusto ma ownerId SBAGLIATO — devono essere fixate in Firestore`);
        }
      }

      r.DIAGNOSI = diagnosi.length > 0 ? diagnosi : ["Seleziona un proprietario per diagnosi completa"];

    } catch (err: any) {
      r.errore = err.message;
    }

    setReport(r);
    setLoading(false);
  };

  // Fix singola proprietà con discrepanza ownerId
  const fixOwnerIdDiscrepancy = async (propertyId: string, correctOwnerId: string) => {
    try {
      await fetch(`/api/properties/${propertyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: correctOwnerId }),
      });
      alert(`✅ Proprietà ${propertyId} aggiornata con ownerId=${correctOwnerId}`);
      runDiagnosis();
    } catch (err) {
      alert("❌ Errore: " + err);
    }
  };

  // Fix BATCH: corregge tutte le proprietà con ownerId="pending" cercando l'utente per email
  const fixAllPendingOwners = async () => {
    if (!confirm("Correggi TUTTE le proprietà con ownerId=pending cercando l'utente per ownerEmail?")) return;
    setLoading(true);
    const results: string[] = [];
    
    try {
      // Chiama API di fix batch
      const res = await fetch("/api/admin/fix-property-owners", { method: "POST" });
      const data = await res.json();
      if (data.results) {
        data.results.forEach((r: any) => results.push(r));
      }
      alert(`✅ Fix completato:
${data.fixed} proprietà corrette
${data.notFound} email non trovate
${data.errors} errori`);
      runDiagnosis();
    } catch (err) {
      alert("❌ Errore: " + err);
    }
    setLoading(false);
  };

// ── Componente riga fix manuale ──────────────────────────────────────
function ManualFixRow({ prop, users, onFixed }: { prop: any; users: any[]; onFixed: () => void }) {
  const [selectedOwner, setSelectedOwner] = useState("");
  const [saving, setSaving] = useState(false);

  const handleFix = async () => {
    if (!selectedOwner) { alert("Seleziona un proprietario"); return; }
    setSaving(true);
    try {
      // Aggiorna ownerId
      const owner = users.find(u => u.id === selectedOwner);
      const res = await fetch(`/api/admin/fix-property-owners-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: prop.id,
          ownerId: selectedOwner,
          ownerName: owner?.name || "",
          ownerEmail: owner?.email || "",
          sendNotification: prop.status === "PENDING_SIGNATURE",
          propertyName: prop.name,
          cleaningPrice: prop.cleaningPrice || 0,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ ${prop.name} aggiornata!
${data.notificationSent ? "📬 Notifica inviata al proprietario" : ""}`);
        onFixed();
      } else {
        alert("❌ Errore: " + data.error);
      }
    } catch (err) {
      alert("❌ Errore: " + err);
    }
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-lg border border-red-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <span className="font-bold text-sm">{prop.name}</span>
          <span className="ml-2 text-xs text-gray-500">[{prop.status}]</span>
          {prop.cleaningPrice > 0 && <span className="ml-2 text-xs font-medium text-green-700">€{prop.cleaningPrice}</span>}
          <p className="text-xs text-red-500 mt-0.5">ownerEmail vuota — seleziona proprietario manualmente</p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={selectedOwner}
            onChange={e => setSelectedOwner(e.target.value)}
            className="border rounded px-2 py-1 text-xs min-w-48"
          >
            <option value="">— Seleziona proprietario —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
          <button
            onClick={handleFix}
            disabled={!selectedOwner || saving}
            className="px-3 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? "..." : "🔧 Fix"}
          </button>
        </div>
      </div>
    </div>
  );
}

  if (!user || user.role !== "ADMIN") {
    return <div className="p-8 text-red-500">Accesso negato — solo admin</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">🔍 Debug — Proprietà Pending & Notifiche</h1>
      <p className="text-gray-500 text-sm mb-6">Analizza il flusso completo: ownerId, status, notifiche</p>

      {/* Selezione proprietario */}
      <div className="bg-white rounded-xl border p-4 mb-4 flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Seleziona proprietario (opzionale — per analisi specifica)
          </label>
          <select
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">— Tutti (diagnosi generale) —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email}) — {u.id}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={runDiagnosis}
          disabled={loading}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "Analisi..." : "▶ Esegui Diagnosi"}
        </button>
        <button
          onClick={fixAllPendingOwners}
          disabled={loading}
          className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
        >
          🔧 Fix Batch ownerId=pending
        </button>
        <button
          onClick={async () => {
            if (!confirm("Esegui fix avanzato? Cerca il proprietario per nome/email/id in tutti gli utenti del DB")) return;
            setLoading(true);
            try {
              const res = await fetch("/api/admin/fix-pending-now", { method: "POST" });
              const data = await res.json();
              alert(`✅ Fix avanzato completato:\n${data.fixed} proprietà corrette su ${data.total}\n\nDettagli:\n${(data.results||[]).join("\n")}\n\nProprietari nel DB: ${(data.proprietari_nel_db||[]).map((u:any) => u.name + " (" + u.email + ") " + u.id).join("\n")}`);
              runDiagnosis();
            } catch(e) { alert("Errore: "+e); }
            setLoading(false);
          }}
          disabled={loading}
          className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50"
        >
          🔬 Fix Avanzato (cerca per nome/email)
        </button>
      </div>

      {/* Correzione manuale ownerId */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <h3 className="font-bold text-red-800 mb-1">🔧 Correzione manuale</h3>
        <p className="text-xs text-red-600 mb-3">Correggi proprietà assegnate al proprietario sbagliato</p>
        <div className="space-y-2">
          <input id="fix-prop-id" placeholder="ID proprietà (da Firestore)" className="w-full border rounded px-3 py-1.5 text-sm" />
          <input id="fix-owner-id" placeholder="ID proprietario corretto (da Firestore)" className="w-full border rounded px-3 py-1.5 text-sm" />
          <input id="fix-owner-email" placeholder="Email proprietario (opzionale, per verifica)" className="w-full border rounded px-3 py-1.5 text-sm" />
          <button
            onClick={async () => {
              const propId = (document.getElementById("fix-prop-id") as HTMLInputElement)?.value?.trim();
              const ownerId = (document.getElementById("fix-owner-id") as HTMLInputElement)?.value?.trim();
              const ownerEmail = (document.getElementById("fix-owner-email") as HTMLInputElement)?.value?.trim();
              if (!propId || !ownerId) { alert("Inserisci ID proprietà e ID proprietario"); return; }
              if (!confirm(`Assegna proprietà\n${propId}\nal proprietario\n${ownerId}?`)) return;
              try {
                const res = await fetch("/api/admin/fix-property-owners-manual", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ propertyId: propId, ownerId, ownerEmail }),
                });
                const data = await res.json();
                if (data.success) { alert("✅ Corretto!"); runDiagnosis(); }
                else alert("❌ Errore: " + data.error);
              } catch(e) { alert("Errore: " + e); }
            }}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
          >
            ✏️ Applica correzione
          </button>
        </div>
      </div>

      {/* Report */}
      {report && (
        <div className="space-y-4">
          {/* DIAGNOSI */}
          <div className="bg-white rounded-xl border p-4">
            <h2 className="font-bold text-lg mb-3">🩺 Diagnosi Automatica</h2>
            <div className="space-y-2">
              {(report.DIAGNOSI || []).map((d: string, i: number) => (
                <div key={i} className={`p-3 rounded-lg text-sm font-medium ${
                  d.startsWith("✅") ? "bg-green-50 text-green-800" :
                  d.startsWith("❌") ? "bg-red-50 text-red-800" :
                  "bg-amber-50 text-amber-800"
                }`}>{d}</div>
              ))}
            </div>
          </div>

          {/* Proprietà pending */}
          <div className="bg-white rounded-xl border p-4">
            <h2 className="font-bold mb-3">
              📋 Proprietà PENDING / PENDING_SIGNATURE ({(report.sezioni?.proprieta_pending || []).length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    {["Nome", "Status", "ownerId", "Tipo", "Problema", "ownerEmail", "Prezzo", "Creata"].map(h => (
                      <th key={h} className="border px-2 py-1 text-left font-medium text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(report.sezioni?.proprieta_pending || []).map((p: any) => (
                    <tr key={p.id} className={p.ownerIdProblema.startsWith("⚠️") ? "bg-red-50" : ""}>
                      <td className="border px-2 py-1 font-medium">{p.name}</td>
                      <td className="border px-2 py-1">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          p.status === "PENDING_SIGNATURE" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                        }`}>{p.status}</span>
                      </td>
                      <td className="border px-2 py-1 font-mono text-xs">{p.ownerId}</td>
                      <td className="border px-2 py-1">{p.ownerIdTipo}</td>
                      <td className="border px-2 py-1">{p.ownerIdProblema}</td>
                      <td className="border px-2 py-1">{p.ownerEmail}</td>
                      <td className="border px-2 py-1">€{p.cleaningPrice}</td>
                      <td className="border px-2 py-1">{p.createdAt}</td>
                    </tr>
                  ))}
                  {(report.sezioni?.proprieta_pending || []).length === 0 && (
                    <tr><td colSpan={8} className="border px-2 py-3 text-center text-gray-400">Nessuna proprietà pending</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bug ownerId invalido — con fix manuale */}
          {(report.sezioni?.bug_ownerId_invalido || []).length > 0 && (
            <div className="bg-red-50 rounded-xl border border-red-200 p-4">
              <h2 className="font-bold text-red-800 mb-3">
                ❌ BUG: Proprietà con ownerId non valido ({report.sezioni.bug_ownerId_invalido.length})
              </h2>
              <p className="text-sm text-red-600 mb-3">
                ownerEmail vuota → il fix automatico non funziona. Seleziona manualmente il proprietario corretto.
              </p>
              <div className="space-y-3">
                {report.sezioni.bug_ownerId_invalido.map((p: any) => (
                  <ManualFixRow key={p.id} prop={p} users={users} onFixed={runDiagnosis} />
                ))}
              </div>
            </div>
          )}

          {/* Proprietà utente selezionato */}
          {report.sezioni?.proprieta_utente_selezionato && (
            <div className="bg-white rounded-xl border p-4">
              <h2 className="font-bold mb-3">
                👤 Proprietà di {report.sezioni.utente_info?.name} ({report.sezioni.proprieta_utente_selezionato.length})
              </h2>
              <div className="text-xs text-gray-500 mb-2 font-mono">
                userId: {report.sezioni.utente_info?.id} | email: {report.sezioni.utente_info?.email}
              </div>
              <div className="space-y-2">
                {report.sezioni.proprieta_utente_selezionato.map((p: any) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg border text-sm">
                    <span className="font-medium flex-1">{p.name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      p.status === "ACTIVE" ? "bg-green-100 text-green-800" :
                      p.status === "PENDING_SIGNATURE" ? "bg-amber-100 text-amber-800" :
                      "bg-blue-100 text-blue-800"
                    }`}>{p.status}</span>
                    <span className="text-xs">{p.visible_al_proprietario}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Proprietà per email (discrepanze) */}
          {report.sezioni?.proprieta_per_email && (
            <div className="bg-white rounded-xl border p-4">
              <h2 className="font-bold mb-3">
                📧 Proprietà per ownerEmail ({report.sezioni.proprieta_per_email.length})
              </h2>
              <div className="space-y-2">
                {report.sezioni.proprieta_per_email.map((p: any) => (
                  <div key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${
                    p.ownerIdMatchUserId.startsWith("❌") ? "bg-red-50 border-red-200" : ""
                  }`}>
                    <span className="font-medium flex-1">{p.name}</span>
                    <span className="text-xs text-gray-500">[{p.status}]</span>
                    <span className="text-xs">{p.ownerIdMatchUserId}</span>
                    {p.ownerIdMatchUserId.startsWith("❌") && (
                      <button
                        onClick={() => fixOwnerIdDiscrepancy(p.id, selectedUserId)}
                        className="px-3 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700"
                      >
                        🔧 Fix ownerId
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notifiche utente */}
          {report.sezioni?.notifiche_utente && (
            <div className="bg-white rounded-xl border p-4">
              <h2 className="font-bold mb-3">
                🔔 Notifiche per questo utente ({report.sezioni.notifiche_utente.length})
              </h2>
              <div className="space-y-2">
                {report.sezioni.notifiche_utente.map((n: any) => (
                  <div key={n.id} className="p-3 rounded-lg border text-sm">
                    <div className="font-medium">{n.title}</div>
                    <div className="text-gray-500 text-xs mt-0.5">{n.message}</div>
                    <div className="flex gap-3 mt-1 text-xs text-gray-400">
                      <span>tipo: {n.type}</span>
                      <span>status: {n.status}</span>
                      <span>link: {n.link}</span>
                      <span>{n.createdAt}</span>
                    </div>
                  </div>
                ))}
                {report.sezioni.notifiche_utente.length === 0 && (
                  <div className="text-amber-600 text-sm p-3 bg-amber-50 rounded-lg">
                    ⚠️ Nessuna notifica trovata — o non ancora inviate o inviate con recipientId sbagliato
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bug notifiche recipientId oggetto */}
          {(report.sezioni?.notifiche_bug_recipientId_oggetto || []).length > 0 && (
            <div className="bg-red-50 rounded-xl border border-red-200 p-4">
              <h2 className="font-bold text-red-800 mb-3">
                ❌ BUG STORICO: Notifiche con recipientId=oggetto ({report.sezioni.notifiche_bug_recipientId_oggetto.length})
              </h2>
              <p className="text-sm text-red-600 mb-2">
                Queste notifiche sono state create con il bug precedente (recipientId era l'oggetto owner invece dell'ID).
                Il bug è stato fixato ma queste vecchie notifiche non arriveranno mai — vanno riscritte.
              </p>
              {report.sezioni.notifiche_bug_recipientId_oggetto.map((n: any) => (
                <div key={n.id} className="bg-white rounded p-2 text-xs font-mono mt-1">
                  {n.title} — recipientId: {n.recipientId_valore} — {n.createdAt}
                </div>
              ))}
            </div>
          )}

          {/* JSON grezzo */}
          <details className="bg-gray-50 rounded-xl border p-4">
            <summary className="cursor-pointer font-medium text-gray-600 text-sm">
              📄 JSON grezzo completo
            </summary>
            <pre className="mt-3 text-xs overflow-auto max-h-96 bg-white p-3 rounded border">
              {JSON.stringify(report, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
