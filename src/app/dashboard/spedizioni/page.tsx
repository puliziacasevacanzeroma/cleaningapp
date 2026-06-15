"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ════════════════════════════════════════════════════════════════════════
// /dashboard/spedizioni — Gestione spedizioni PRODOTTI pulizia (ADMIN-ONLY)
//
// Hub realtime delle consegne prodotti: standalone + prodotti che viaggiano
// dentro ordini biancheria. L'admin può pianificare nuove consegne a una data
// scelta, modificare data/prodotti, eliminare. Letture via onSnapshot; le
// scritture passano dagli endpoint server (requireAdmin):
//   POST   /api/orders/products-shipment
//   PATCH  /api/orders/[id]/products
//   DELETE /api/orders/[id]/products
// Il layout /dashboard blocca già i non-admin → proprietario non vede nulla.
// ════════════════════════════════════════════════════════════════════════

interface OrderItem {
  id?: string;
  itemId?: string;
  name?: string;
  quantity?: number;
  type?: string;
  categoryId?: string;
}
interface Order {
  id: string;
  propertyId?: string;
  propertyName?: string;
  propertyAddress?: string;
  cleaningId?: string;
  type?: string;
  status?: string;
  isProductsOnly?: boolean;
  hasCleaningProducts?: boolean;
  items?: OrderItem[];
  linenItems?: OrderItem[];
  cleaningProducts?: OrderItem[];
  scheduledDate?: any;
  createdAt?: any;
}
interface Property {
  id: string;
  name?: string;
  address?: string;
  city?: string;
  status?: string;
  usesOwnLinen?: boolean;
}
interface CatalogProduct {
  id: string;
  name: string;
  unit?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function tsToDate(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts?.toDate === "function") return ts.toDate();
  if (ts instanceof Date) return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}
function fmtDate(ts: any): string {
  const d = tsToDate(ts);
  return d ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}
function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function getProductItems(o: Order): OrderItem[] {
  const fromItems = (o.items ?? []).filter(i => i.type === "cleaning_product" || i.categoryId === "prodotti_pulizia");
  if (fromItems.length) return fromItems;
  return (o.cleaningProducts ?? []).filter(Boolean);
}
function orderHasLinen(o: Order): boolean {
  if (Array.isArray(o.linenItems) && o.linenItems.length > 0) return true;
  return (o.items ?? []).some(i => i.type !== "cleaning_product" && i.categoryId !== "prodotti_pulizia");
}
function isProductShipment(o: Order): boolean {
  if (o.isProductsOnly === true) return true;
  if (o.hasCleaningProducts === true) return true;
  return getProductItems(o).length > 0;
}
function isPureStandalone(o: Order): boolean {
  return !o.cleaningId && !orderHasLinen(o) &&
    (o.isProductsOnly === true || String(o.type ?? "").toUpperCase() === "PRODUCTS");
}

// ════════════════════════════════════════════════════════════════════════
export default function SpedizioniPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);

  // Realtime ordini
  useEffect(() => {
    // Solo ordini che contengono prodotti pulizia (flag settato da tutti i
    // percorsi di creazione: POST operatore, /start, endpoint admin). Query a
    // singolo campo → nessun indice composito, payload molto più leggero.
    const unsub = onSnapshot(
      query(collection(db, "orders"), where("hasCleaningProducts", "==", true)),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) } as Order));
        setOrders(list);
        setLoading(false);
      },
      err => { console.error("Errore listener orders:", err); setLoading(false); },
    );
    return () => unsub();
  }, []);

  // Realtime proprietà attive (per il picker)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "properties"),
      snap => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as Record<string, any>) } as Property))
          .filter(p => String(p.status ?? "").toUpperCase() !== "DELETED")
          .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
        setProperties(list);
      },
      err => console.error("Errore listener properties:", err),
    );
    return () => unsub();
  }, []);

  // Catalogo prodotti (una volta)
  useEffect(() => {
    fetch("/api/product-requests/available")
      .then(r => r.json())
      .then(d => setCatalog((d.products ?? []).map((p: any) => ({ id: p.id, name: p.name, unit: p.unit }))))
      .catch(() => setCatalog([]));
  }, []);

  const shipments = useMemo(
    () =>
      orders
        .filter(isProductShipment)
        .filter(o => String(o.status ?? "").toUpperCase() !== "CANCELLED")
        .sort((a, b) => (tsToDate(b.scheduledDate)?.getTime() ?? 0) - (tsToDate(a.scheduledDate)?.getTime() ?? 0)),
    [orders],
  );

  const toDeliver = shipments.filter(o => String(o.status ?? "").toUpperCase() !== "DELIVERED");
  const delivered = shipments.filter(o => String(o.status ?? "").toUpperCase() === "DELIVERED");

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Spedizioni Prodotti</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {toDeliver.length} da consegnare · {delivered.length} consegnate
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-medium shadow-lg shadow-sky-500/30 hover:opacity-95 transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuova spedizione
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <>
          <Section title="Da consegnare" empty="Nessuna spedizione in programma.">
            {toDeliver.map(o => (
              <ShipmentCard key={o.id} order={o} onEdit={() => setEditing(o)} />
            ))}
          </Section>

          {delivered.length > 0 && (
            <Section title="Consegnate" empty="">
              {delivered.map(o => (
                <ShipmentCard key={o.id} order={o} onEdit={() => setEditing(o)} delivered />
              ))}
            </Section>
          )}
        </>
      )}

      {showNew && (
        <NewShipmentModal
          properties={properties}
          catalog={catalog}
          onClose={() => setShowNew(false)}
        />
      )}
      {editing && (
        <EditShipmentModal
          order={editing}
          catalog={catalog}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ─── Sezione ────────────────────────────────────────────────────────────
function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  const isEmpty = arr.filter(Boolean).length === 0;
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">{title}</h2>
      {isEmpty ? (
        empty ? <p className="text-slate-400 text-sm py-6 text-center bg-slate-50 rounded-2xl">{empty}</p> : null
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">{children}</div>
      )}
    </div>
  );
}

// ─── Card spedizione ──────────────────────────────────────────────────────
function ShipmentCard({ order, onEdit, delivered }: { order: Order; onEdit: () => void; delivered?: boolean }) {
  const products = getProductItems(order);
  const withLinen = orderHasLinen(order);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 truncate">{order.propertyName || "Proprietà"}</p>
          {order.propertyAddress && <p className="text-xs text-slate-400 truncate">{order.propertyAddress}</p>}
        </div>
        <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
          delivered ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
        }`}>
          {delivered ? "Consegnata" : "Da consegnare"}
        </span>
      </div>

      <div className="flex items-center gap-3 mt-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Consegna: <strong className="text-slate-700">{fmtDate(order.scheduledDate)}</strong>
        </span>
        {withLinen && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-100">
            🛏️ con biancheria
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {products.length === 0 ? (
          <span className="text-xs text-slate-400">Nessun prodotto</span>
        ) : (
          products.map((p, i) => (
            <span key={p.itemId ?? p.id ?? i} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
              {p.name} ×{p.quantity ?? 1}
            </span>
          ))
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">Creata il {fmtDate(order.createdAt)}</span>
        {!delivered && (
          <button onClick={onEdit} className="text-sm font-medium text-sky-600 hover:text-sky-700">
            Modifica
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Selettore prodotti (riusato da entrambi i modali) ──────────────────────
function ProductPicker({
  catalog, selected, setSelected,
}: {
  catalog: CatalogProduct[];
  selected: Record<string, { name: string; qty: number }>;
  setSelected: (s: Record<string, { name: string; qty: number }>) => void;
}) {
  const toggle = (p: CatalogProduct) => {
    const next = { ...selected };
    if (next[p.id]) delete next[p.id];
    else next[p.id] = { name: p.name, qty: 1 };
    setSelected(next);
  };
  const changeQty = (id: string, delta: number) => {
    const next = { ...selected };
    if (!next[id]) return;
    const q = Math.max(1, Math.min(99, next[id].qty + delta));
    next[id] = { ...next[id], qty: q };
    setSelected(next);
  };
  return (
    <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
      {catalog.length === 0 && <p className="text-sm text-slate-400 p-3">Nessun prodotto in inventario.</p>}
      {catalog.map(p => {
        const sel = selected[p.id];
        return (
          <div key={p.id} className="flex items-center justify-between gap-2 p-2.5">
            <button
              onClick={() => toggle(p)}
              className="flex items-center gap-2 min-w-0 flex-1 text-left"
            >
              <span className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center ${
                sel ? "bg-sky-500 border-sky-500" : "border-slate-300"
              }`}>
                {sel && (
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className="text-sm text-slate-700 truncate">{p.name}</span>
            </button>
            {sel && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => changeQty(p.id, -1)} className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 font-bold">−</button>
                <span className="w-6 text-center text-sm font-medium">{sel.qty}</span>
                <button onClick={() => changeQty(p.id, +1)} className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 font-bold">+</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Modale: NUOVA spedizione ───────────────────────────────────────────────
function NewShipmentModal({
  properties, catalog, onClose,
}: { properties: Property[]; catalog: CatalogProduct[]; onClose: () => void }) {
  const [propertyId, setPropertyId] = useState("");
  const [date, setDate] = useState("");
  const [selected, setSelected] = useState<Record<string, { name: string; qty: number }>>({});
  const [cleanings, setCleanings] = useState<Array<{ id: string; date: Date }>>([]);
  const [loadingCleanings, setLoadingCleanings] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Carica pulizie future della proprietà (single-field query, no index)
  useEffect(() => {
    if (!propertyId) { setCleanings([]); return; }
    setLoadingCleanings(true);
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "cleanings"), where("propertyId", "==", propertyId)));
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const active = new Set(["SCHEDULED", "ASSIGNED", "PENDING", "IN_PROGRESS"]);
        const list = snap.docs
          .map(d => {
            const data = d.data() as Record<string, any>;
            return { id: d.id, date: tsToDate(data.scheduledDate), status: String(data.status ?? "").toUpperCase() };
          })
          .filter(c => c.date && c.date >= today && active.has(c.status))
          .map(c => ({ id: c.id, date: c.date as Date }))
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .slice(0, 12);
        setCleanings(list);
      } catch (e) {
        console.error("Errore caricamento pulizie:", e);
        setCleanings([]);
      } finally {
        setLoadingCleanings(false);
      }
    })();
  }, [propertyId]);

  const cleaningDayKeys = useMemo(() => new Set(cleanings.map(c => toInputDate(c.date))), [cleanings]);
  const chosenHasCleaning = date ? cleaningDayKeys.has(date) : false;
  const selectedProperty = properties.find(p => p.id === propertyId);

  const submit = async () => {
    setError("");
    const items = Object.entries(selected).map(([id, v]) => ({ itemId: id, name: v.name, quantity: v.qty }));
    if (!propertyId) return setError("Seleziona una proprietà.");
    if (!date) return setError("Scegli una data di consegna.");
    if (items.length === 0) return setError("Seleziona almeno un prodotto.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders/products-shipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, scheduledDate: date, items }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Errore durante la creazione."); setSubmitting(false); return; }
      onClose();
    } catch {
      setError("Errore di rete.");
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title="Nuova spedizione prodotti" onClose={onClose}>
      {/* Proprietà */}
      <label className="block text-sm font-medium text-slate-600 mb-1">Proprietà</label>
      <select
        value={propertyId}
        onChange={e => { setPropertyId(e.target.value); setDate(""); }}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 mb-2"
      >
        <option value="">Seleziona…</option>
        {properties.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}{p.usesOwnLinen ? " · biancheria propria" : ""}
          </option>
        ))}
      </select>

      {/* Pulizie in programma → quick-pick data */}
      {propertyId && (
        <div className="mb-3">
          <p className="text-xs text-slate-400 mb-1.5">
            {loadingCleanings ? "Carico pulizie…" :
              cleanings.length > 0 ? "Pulizie in programma (tocca per consegnare insieme):" :
              selectedProperty?.usesOwnLinen ? "Nessuna pulizia in programma — questa casa usa biancheria propria." :
              "Nessuna pulizia in programma per questa proprietà."}
          </p>
          {cleanings.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {cleanings.map(c => {
                const key = toInputDate(c.date);
                return (
                  <button
                    key={c.id}
                    onClick={() => setDate(key)}
                    className={`px-2.5 py-1 rounded-lg text-xs border transition ${
                      date === key ? "bg-sky-500 text-white border-sky-500" : "bg-white text-slate-600 border-slate-200 hover:border-sky-300"
                    }`}
                  >
                    {c.date.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Data libera */}
      <label className="block text-sm font-medium text-slate-600 mb-1">Data di consegna</label>
      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
      />
      {date && (
        <p className={`text-xs mt-1.5 ${chosenHasCleaning ? "text-sky-600" : "text-slate-500"}`}>
          {chosenHasCleaning
            ? "🔗 Quel giorno c'è una pulizia: i prodotti viaggeranno in un unico ordine biancheria+prodotti."
            : "📦 Nessuna pulizia quel giorno: verrà creata una spedizione dedicata."}
        </p>
      )}

      {/* Prodotti */}
      <label className="block text-sm font-medium text-slate-600 mb-1 mt-3">Prodotti</label>
      <ProductPicker catalog={catalog} selected={selected} setSelected={setSelected} />

      {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}

      <div className="flex gap-2 mt-5">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium">Annulla</button>
        <button
          onClick={submit}
          disabled={submitting}
          className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-medium disabled:opacity-50"
        >
          {submitting ? "Creo…" : "Crea spedizione"}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Modale: MODIFICA spedizione ────────────────────────────────────────────
function EditShipmentModal({
  order, catalog, onClose,
}: { order: Order; catalog: CatalogProduct[]; onClose: () => void }) {
  const pure = isPureStandalone(order);
  const initialSelected: Record<string, { name: string; qty: number }> = {};
  for (const p of getProductItems(order)) {
    const id = p.itemId ?? p.id ?? "";
    if (id) initialSelected[id] = { name: p.name ?? "Prodotto", qty: p.quantity ?? 1 };
  }
  const initDate = tsToDate(order.scheduledDate);

  const [selected, setSelected] = useState<Record<string, { name: string; qty: number }>>(initialSelected);
  const [date, setDate] = useState(initDate ? toInputDate(initDate) : "");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    const items = Object.entries(selected).map(([id, v]) => ({ itemId: id, name: v.name, quantity: v.qty }));
    const payload: Record<string, any> = { items };
    if (pure && date) payload.scheduledDate = date;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/products`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Errore durante il salvataggio."); setSubmitting(false); return; }
      onClose();
    } catch {
      setError("Errore di rete.");
      setSubmitting(false);
    }
  };

  const remove = async () => {
    setError("");
    setDeleting(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/products`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Errore durante l'eliminazione."); setDeleting(false); return; }
      onClose();
    } catch {
      setError("Errore di rete.");
      setDeleting(false);
    }
  };

  return (
    <ModalShell title="Modifica spedizione" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        {order.propertyName} · consegna {fmtDate(order.scheduledDate)}
      </p>

      <label className="block text-sm font-medium text-slate-600 mb-1">Data di consegna</label>
      <input
        type="date"
        value={date}
        disabled={!pure}
        onChange={e => setDate(e.target.value)}
        className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ${
          pure ? "border-slate-200" : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
        }`}
      />
      {!pure && (
        <p className="text-xs text-slate-500 mt-1.5">
          🔒 Questa consegna è legata a una pulizia: la data si modifica dalla pulizia, non da qui. Puoi comunque modificare i prodotti.
        </p>
      )}

      <label className="block text-sm font-medium text-slate-600 mb-1 mt-3">Prodotti</label>
      <ProductPicker catalog={catalog} selected={selected} setSelected={setSelected} />
      {pure && Object.keys(selected).length === 0 && (
        <p className="text-xs text-amber-600 mt-1.5">Salvando senza prodotti la spedizione verrà eliminata.</p>
      )}

      {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}

      <div className="flex gap-2 mt-5">
        {pure && (
          <button
            onClick={remove}
            disabled={deleting || submitting}
            className="px-4 py-2.5 rounded-xl border border-rose-200 text-rose-600 font-medium disabled:opacity-50"
          >
            {deleting ? "Elimino…" : "Elimina"}
          </button>
        )}
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium">Annulla</button>
        <button
          onClick={save}
          disabled={submitting || deleting}
          className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-medium disabled:opacity-50"
        >
          {submitting ? "Salvo…" : "Salva"}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Shell modale ──────────────────────────────────────────────────────────
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl max-h-[90vh] overflow-y-auto p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
