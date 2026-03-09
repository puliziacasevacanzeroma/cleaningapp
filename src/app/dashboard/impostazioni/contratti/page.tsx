"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";

interface ContractDoc {
  id: string;
  type: string;
  title: string;
  version: string;
  isActive: boolean;
  isDraft: boolean;
  hash: string;
  contentLength: number;
  createdAt: string;
  publishedAt?: string;
  changelog?: string;
  hasReverseCharge: boolean;
}

export default function ContrattiSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [documents, setDocuments] = useState<ContractDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Preview & Edit
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);
  const [editingDoc, setEditingDoc] = useState<{ id: string; type: string; title: string; content: string } | null>(null);

  // Drag & drop
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<{ name: string; content: string } | null>(null);
  const [uploadType, setUploadType] = useState("contratto_quadro_servizio");
  const [uploadTitle, setUploadTitle] = useState("");
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // ─── CARICA DOCUMENTI ───
  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/contracts");
      const data = await res.json();
      if (res.ok) setDocuments(data.documents || []);
      else setError(data.error || "Errore caricamento");
    } catch {
      setError("Errore di connessione");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user?.role === "ADMIN") loadDocuments();
  }, [authLoading, user, loadDocuments]);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "ADMIN")) router.push("/dashboard");
  }, [authLoading, user, router]);

  // ─── FILE HANDLING ───
  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith(".html") && !file.name.endsWith(".htm")) {
      setError("Solo file .html sono accettati");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content || content.length < 100) {
        setError("File HTML vuoto o troppo corto");
        return;
      }
      const isAllegatoD = file.name.toLowerCase().includes("allegato") || content.includes("Scheda Servizio") || content.includes("AUTO_PROP_NAME");
      setUploadType(isAllegatoD ? "allegato_d_template" : "contratto_quadro_servizio");
      setUploadTitle(isAllegatoD ? "Allegato D – Scheda Servizio Proprietà" : "Contratto Quadro di Servizio e Allegati");
      setUploadFile({ name: file.name, content });
      setError(null);
    };
    reader.readAsText(file);
  }, []);

  // ─── DRAG EVENTS ───
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current++;
    setDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setDragging(false);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragging(false);
    dragCounterRef.current = 0;
    const files = e.dataTransfer.files;
    if (files.length > 0) processFile(files[0]!);
  }, [processFile]);
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) processFile(files[0]!);
    e.target.value = "";
  }, [processFile]);

  // ─── UPLOAD ───
  const handleUpload = async () => {
    if (!uploadFile) return;
    if (!confirm(`Caricare "${uploadFile.name}" come ${uploadType === "contratto_quadro_servizio" ? "Contratto Quadro" : "Allegato D"}?\n\nLe versioni precedenti verranno disattivate.\nI clienti dovranno ri-accettare.`)) return;
    setUploading(true); setError(null); setSuccess(null);
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: uploadFile.content, type: uploadType, title: uploadTitle }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(data.message);
        setUploadFile(null);
        await loadDocuments();
      } else {
        setError(data.error || "Errore caricamento");
      }
    } catch {
      setError("Errore di connessione");
    } finally { setUploading(false); }
  };

  // ─── SYNC DA FILE ───
  const handleSyncFromFiles = async () => {
    if (!confirm("Sincronizzare i contratti dai file in public/contracts/?\nI vecchi verranno disattivati.")) return;
    setSyncing(true); setError(null); setSuccess(null);
    try {
      const res = await fetch("/api/admin/seed-contracts", { method: "POST" });
      const data = await res.json();
      if (data.success) { setSuccess(data.results?.join("\n")); await loadDocuments(); }
      else setError(data.error);
    } catch { setError("Errore di connessione"); }
    finally { setSyncing(false); }
  };

  // ─── PREVIEW / EDIT / TOGGLE ───
  const handlePreview = async (docId: string) => {
    try {
      const res = await fetch(`/api/admin/contracts/${docId}`);
      const data = await res.json();
      if (data.success) setPreview({ title: data.document.title, content: data.document.content });
    } catch { setError("Errore caricamento anteprima"); }
  };

  const handleEdit = async (docId: string) => {
    try {
      const res = await fetch(`/api/admin/contracts/${docId}`);
      const data = await res.json();
      if (data.success) setEditingDoc({ id: docId, type: data.document.type, title: data.document.title, content: data.document.content });
    } catch { setError("Errore caricamento documento"); }
  };

  const handleSaveEdit = async () => {
    if (!editingDoc) return;
    if (!confirm("Salvare le modifiche? I clienti dovranno ri-accettare.")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/contracts/${editingDoc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editingDoc.content, title: editingDoc.title }),
      });
      const data = await res.json();
      if (data.success) { setSuccess("Contratto aggiornato"); setEditingDoc(null); await loadDocuments(); }
      else setError(data.error);
    } catch { setError("Errore salvataggio"); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (docId: string, currentActive: boolean) => {
    const action = currentActive ? "disattivare" : "attivare";
    if (!confirm(`Vuoi ${action} questo documento?`)) return;
    try {
      const res = await fetch(`/api/admin/contracts/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      const data = await res.json();
      if (data.success) { setSuccess(`Documento ${currentActive ? "disattivato" : "attivato"}`); await loadDocuments(); }
      else setError(data.error);
    } catch { setError("Errore"); }
  };

  // ─── LOADING ───
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  // ─── EDITOR ───
  if (editingDoc) {
    return (
      <div className="p-4 lg:p-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <button onClick={() => setEditingDoc(null)} className="text-sm text-slate-500 hover:text-slate-700 mb-2">
              ← Torna alla lista
            </button>
            <h1 className="text-2xl font-bold text-slate-800">✏️ Modifica Contratto</h1>
            <p className="text-slate-500 text-sm mt-1">{editingDoc.title}</p>
          </div>
          <button onClick={handleSaveEdit} disabled={saving} className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 text-sm font-medium">
            {saving ? "Salvataggio..." : "💾 Salva e Pubblica"}
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-600 mb-1">Titolo</label>
          <input type="text" value={editingDoc.title} onChange={(e) => setEditingDoc({ ...editingDoc, title: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Codice HTML <span className="text-xs text-slate-400 ml-1">({editingDoc.content.length.toLocaleString()} car.)</span>
            </label>
            <textarea value={editingDoc.content} onChange={(e) => setEditingDoc({ ...editingDoc, content: e.target.value })} className="w-full h-[70vh] px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono resize-none bg-slate-50" spellCheck={false} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600 mb-1">Anteprima</p>
            <div className="border border-slate-200 rounded-lg bg-white p-4 h-[70vh] overflow-y-auto">
              <div dangerouslySetInnerHTML={{ __html: editingDoc.content }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── PREVIEW ───
  if (preview) {
    return (
      <div className="p-4 lg:p-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <button onClick={() => setPreview(null)} className="text-sm text-slate-500 hover:text-slate-700 mb-2">
              ← Torna alla lista
            </button>
            <h1 className="text-2xl font-bold text-slate-800">👁 Anteprima</h1>
            <p className="text-slate-500 text-sm mt-1">{preview.title}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6 overflow-y-auto" style={{ maxHeight: "80vh" }}>
          <div dangerouslySetInnerHTML={{ __html: preview.content }} />
        </div>
      </div>
    );
  }

  // ─── MAIN PAGE ───
  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <button
            onClick={() => router.push("/dashboard/impostazioni")}
            className="text-sm text-slate-500 hover:text-slate-700 mb-2"
          >
            ← Torna alle impostazioni
          </button>
          <h1 className="text-2xl font-bold text-slate-800">📄 Gestione Contratti</h1>
          <p className="text-slate-500 text-sm mt-1">
            Carica, modifica e gestisci Contratto Quadro e Allegato D
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSyncFromFiles}
            disabled={syncing}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 text-sm font-medium"
          >
            {syncing ? "Sync..." : "🔄 Sync da file"}
          </button>
        </div>
      </div>

      {/* ─── MESSAGGI ─── */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
          ❌ {error}
          <button onClick={() => setError(null)} className="ml-2 font-bold">×</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-emerald-100 text-emerald-700 rounded-lg text-sm whitespace-pre-line">
          ✅ {success}
          <button onClick={() => setSuccess(null)} className="ml-2 font-bold">×</button>
        </div>
      )}

      {/* ─── DRAG & DROP UPLOAD ─── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <h2 className="text-lg font-bold text-slate-800 mb-3">📤 Carica Contratto</h2>

        {!uploadFile ? (
          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
              dragging
                ? "border-sky-400 bg-sky-50 scale-[1.01] shadow-lg shadow-sky-100"
                : "border-slate-300 hover:border-sky-300 hover:bg-sky-50/30"
            }`}
          >
            <input ref={fileInputRef} type="file" accept=".html,.htm" onChange={handleFileSelect} className="hidden" />
            <div className={`text-5xl mb-3 transition-transform ${dragging ? "scale-125 animate-bounce" : ""}`}>
              {dragging ? "📥" : "📄"}
            </div>
            <p className="font-semibold text-slate-700 text-base">
              {dragging ? "Rilascia il file qui" : "Trascina qui il file HTML del contratto"}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              oppure clicca per selezionare dal computer
            </p>
            <div className="flex justify-center gap-8 mt-5">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-base">📋</span>
                Contratto Quadro
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-base">📎</span>
                Allegato D
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-sky-200 bg-sky-50/30 rounded-xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center text-2xl">📄</div>
                <div>
                  <p className="font-semibold text-slate-800">{uploadFile.name}</p>
                  <p className="text-xs text-slate-500">
                    {(uploadFile.content.length / 1024).toFixed(0)} KB •{" "}
                    {uploadFile.content.includes("Reverse Charge") ? (
                      <span className="text-emerald-600">✅ Contiene clausole IVA</span>
                    ) : (
                      <span className="text-amber-600">⚠️ Senza clausole IVA</span>
                    )}
                  </p>
                </div>
              </div>
              <button onClick={() => setUploadFile(null)} className="text-slate-400 hover:text-red-500 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tipo documento</label>
                <select value={uploadType} onChange={(e) => setUploadType(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                  <option value="contratto_quadro_servizio">📋 Contratto Quadro di Servizio</option>
                  <option value="allegato_d_template">📎 Allegato D – Scheda Servizio</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Titolo</label>
                <input type="text" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1 py-2.5 bg-sky-500 text-white text-sm font-medium rounded-lg hover:bg-sky-600 disabled:opacity-50"
              >
                {uploading ? "Caricamento..." : "🚀 Carica e Attiva"}
              </button>
              <button
                onClick={() => setPreview({ title: uploadFile.name, content: uploadFile.content })}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 text-sm rounded-lg hover:bg-slate-200"
              >
                👁 Anteprima
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-3">
              Le versioni precedenti dello stesso tipo verranno disattivate. I clienti che hanno già firmato dovranno ri-accettare.
            </p>
          </div>
        )}
      </div>

      {/* ─── LISTA DOCUMENTI ─── */}
      {documents.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500 mb-2">Nessun documento trovato</p>
          <p className="text-xs text-slate-400">Trascina un file HTML nell'area sopra per iniziare</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Desktop */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Documento</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Tipo</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Versione</th>
                  <th className="text-center px-4 py-3 text-sm font-semibold text-slate-600">IVA</th>
                  <th className="text-center px-4 py-3 text-sm font-semibold text-slate-600">Stato</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-slate-600">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((doc) => (
                  <tr key={doc.id} className={!doc.isActive ? "opacity-50 bg-slate-50" : ""}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 text-sm">{doc.title}</div>
                      {doc.changelog && <p className="text-xs text-slate-400 mt-0.5">{doc.changelog}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        doc.type === "contratto_quadro_servizio" ? "bg-sky-100 text-sky-700" : doc.type === "allegato_d_template" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                      }`}>
                        {doc.type === "contratto_quadro_servizio" ? "📋 Quadro" : doc.type === "allegato_d_template" ? "📎 All. D" : doc.type || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">v{doc.version}</td>
                    <td className="px-4 py-3 text-center">
                      {doc.hasReverseCharge ? (
                        <span className="text-emerald-600 text-sm">✅</span>
                      ) : (
                        <span className="text-amber-500 text-sm">⚠️</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(doc.id, doc.isActive)}
                        className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${doc.isActive ? "bg-sky-500" : "bg-slate-300"}`}
                      >
                        <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${doc.isActive ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => handlePreview(doc.id)} className="px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg" title="Anteprima">👁</button>
                        <button onClick={() => handleEdit(doc.id)} className="px-2.5 py-1.5 text-xs text-sky-600 hover:bg-sky-50 rounded-lg" title="Modifica">✏️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="lg:hidden divide-y divide-slate-100">
            {documents.map((doc) => (
              <div key={doc.id} className={`p-4 ${!doc.isActive ? "opacity-50 bg-slate-50" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        doc.type === "contratto_quadro_servizio" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {doc.type === "contratto_quadro_servizio" ? "📋 Quadro" : "📎 All. D"}
                      </span>
                      {doc.hasReverseCharge && <span className="text-xs text-emerald-600">IVA ✅</span>}
                      <span className={`text-xs font-medium ${doc.isActive ? "text-emerald-600" : "text-slate-400"}`}>
                        {doc.isActive ? "Attivo" : "Inattivo"}
                      </span>
                    </div>
                    <p className="font-medium text-slate-800 text-sm">{doc.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">v{doc.version} • {(doc.contentLength / 1024).toFixed(0)} KB</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handlePreview(doc.id)} className="p-2 text-slate-400 hover:text-slate-600">👁</button>
                    <button onClick={() => handleEdit(doc.id)} className="p-2 text-sky-400 hover:text-sky-600">✏️</button>
                    <button
                      onClick={() => handleToggleActive(doc.id, doc.isActive)}
                      className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer self-center ${doc.isActive ? "bg-sky-500" : "bg-slate-300"}`}
                    >
                      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${doc.isActive ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── PROMPT HELPER ─── */}
      <div className="mt-6 bg-slate-800 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <h3 className="font-semibold text-sm">Prompt per creare nuovi contratti</h3>
          </div>
          <button
            onClick={() => {
              const prompt = `Devi creare un contratto HTML per il gestionale CleaningApp (Puliziacasevacanze.it S.r.l.s.).

REGOLE FONDAMENTALI:
- Il contratto è un file HTML puro con stili inline e classi CSS definite internamente
- I dati del cliente e della proprietà vengono auto-compilati tramite PLACEHOLDER che il sistema sostituisce automaticamente

PLACEHOLDER PER IL CONTRATTO QUADRO (onboarding):
Questi vanno inseriti esattamente così nel testo HTML:
- Nome / Ragione Sociale: [AUTO – Gestionale]  →  nome/ragione sociale dell'host
- C.F. / P.IVA: [AUTO – Gestionale]  →  codice fiscale o P.IVA host
- Indirizzo: [AUTO – Gestionale]  →  indirizzo host
- Email: [AUTO – Gestionale]  →  email host
- PEC: [AUTO – Gestionale]  →  PEC host (se azienda)
- Tel.: [AUTO – Gestionale]  →  telefono host
- P.IVA / C.F.: [AUTO – Gestionale]  →  P.IVA della società (17817311008)
- [FIRMA DIGITALE AUTO – Gestionale]  →  firma digitale automatica della società
- [FIRMA DIGITALE HOST – Gestionale]  →  segnaposto per la firma del cliente
- [timestamp: AUTO | IP: AUTO]  →  data/ora e IP al momento della firma
- [AUTO – Gestionale]  →  fallback generico, diventa "—"

PLACEHOLDER PER L'ALLEGATO D (scheda servizio per singola proprietà):
- [AUTO_PROP_NAME]  →  nome proprietà
- [AUTO_PROP_ADDRESS]  →  indirizzo proprietà
- [AUTO_PROP_CITY_CAP]  →  comune / CAP
- [AUTO_PROP_FLOOR]  →  piano / interno
- [AUTO_PROP_INTERCOM]  →  citofono
- [AUTO_PROP_ID]  →  ID proprietà nel gestionale
- [AUTO_PROP_CREATED]  →  data inserimento
- [AUTO_PROP_APPROVED]  →  data approvazione
- [AUTO_PROP_GUESTS]  →  numero max ospiti
- [AUTO_PROP_BEDROOMS]  →  numero camere
- [AUTO_PROP_BATHROOMS]  →  numero bagni
- [AUTO_HOST_NAME]  →  nome/ragione sociale host
- [AUTO_HOST_CF]  →  CF o P.IVA host
- [AUTO_HOST_ADDRESS]  →  indirizzo host
- [AUTO_HOST_EMAIL]  →  email host
- [AUTO_HOST_PEC]  →  PEC host
- [AUTO_HOST_PHONE]  →  telefono host
- [AUTO_HOST_SDI]  →  codice SDI
- [AUTO_PRICE]  →  prezzo pulizia formattato (es. "€ 50,00")
- [AUTO_DATE]  →  data corrente
- [AUTO_SIG_COMPANY]  →  firma digitale società
- [AUTO_SIG_HOST]  →  segnaposto firma host
- [AUTO_SIG_TIMESTAMP]  →  timestamp firma

STILE GRAFICO:
- Font: 'Segoe UI', -apple-system, sans-serif
- Colore primario header: #0f2a4a (blu scuro)
- Gradient header: linear-gradient(135deg, #0f2a4a 0%, #1a3c5e 50%, #2563a0 100%)
- Font size base: 11px, titoli articoli: 11.5px bold
- Tabelle con header #0f2a4a bianco, bordi #d1d9e6, righe alternate #f8fafc
- Numeri articoli: cerchi con sfondo #2563a0 bianco
- Box evidenza: sfondo #f1f5f9 con bordo sinistro #2563a0

REGIME IVA (OBBLIGATORIO):
- La società è in regime IVA ORDINARIO
- TUTTI i prezzi sono IVA ESCLUSA
- Host con P.IVA: Reverse Charge (IVA € 0,00) sulle pulizie (art. 17 c.6 lett. a-ter DPR 633/72), IVA 22% su biancheria e servizi accessori
- Host persona fisica: IVA 22% su tutto
- Questa informazione DEVE essere presente nel contratto

DATI SOCIETÀ:
- Puliziacasevacanze.it S.r.l.s.
- P.IVA / C.F.: 17817311008
- Via della Cava Aurelia 84/N – 00165 Roma (RM)
- PEC: puliziacasevacanze@pec.it

TIPO DOCUMENTO:
- Se è un Contratto Quadro, il type deve essere "contratto_quadro_servizio"
- Se è un Allegato D, il type deve essere "allegato_d_template"
- Il file HTML va caricato nel gestionale tramite drag-and-drop in Impostazioni → Contratti

Genera un file HTML completo e pronto per essere caricato.`;
              navigator.clipboard.writeText(prompt).then(() => {
                setCopiedPrompt(true);
                setTimeout(() => setCopiedPrompt(false), 3000);
              });
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${copiedPrompt ? "bg-emerald-500 text-white" : "bg-white/10 hover:bg-white/20 text-white"}`}
          >
            {copiedPrompt ? "✅ Copiato!" : "📋 Copia Prompt"}
          </button>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Copia questo prompt e incollalo in una nuova sessione Claude per creare un nuovo contratto HTML 
          con tutti i placeholder corretti, lo stile grafico giusto e le clausole IVA. 
          Il file generato può essere trascinato direttamente nell'area di upload qui sopra.
        </p>
      </div>
    </div>
  );
}
