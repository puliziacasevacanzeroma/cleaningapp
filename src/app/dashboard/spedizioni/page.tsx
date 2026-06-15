"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ════════════════════════════════════════════════════════════════════════
// /dashboard/spedizioni — Gestione spedizioni PRODOTTI pulizia (ADMIN-ONLY)
// v2: grafica allineata alla modal "Richiedi Servizio" (NewCleaningModal),
//     ordinamento crescente (prossima consegna in alto), filtri (testo/stato/
//     tipo/data), selezione proprietà con RICERCA testuale.
// Letture realtime via onSnapshot; scritture via endpoint server (requireAdmin):
//   POST /api/orders/products-shipment · PATCH/DELETE /api/orders/[id]/products
// ════════════════════════════════════════════════════════════════════════

interface OrderItem { id?: string; itemId?: string; name?: string; quantity?: number; type?: string; categoryId?: string; }
interface Order {
  id: string; propertyId?: string; propertyName?: string; propertyAddress?: string;
  cleaningId?: string; type?: string; status?: string; isProductsOnly?: boolean;
  hasCleaningProducts?: boolean; items?: OrderItem[]; linenItems?: OrderItem[];
  cleaningProducts?: OrderItem[]; scheduledDate?: any; createdAt?: any;
}
interface Property { id: string; name?: string; address?: string; city?: string; status?: string; usesOwnLinen?: boolean; imageUrl?: string; photos?: string[]; maxGuests?: number; }
interface CatalogProduct { id: string; name: string; unit?: string; }

// ─── Icone (coerenti con la modal del sito) ─────────────────────────────────
const I = {
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-full h-full"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.5-4.5" /></svg>,
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-full h-full"><path d="M3 10l9-7 9 7v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M9 21V12h6v9" /></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-full h-full"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="w-full h-full"><path d="M5 13l4 4L19 7" /></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-full h-full"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>,
  box: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-full h-full"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  bed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-full h-full"><path d="M3 18v-6a2 2 0 012-2h14a2 2 0 012 2v6M3 18v2M21 18v2M3 12V8a2 2 0 012-2h6v6" /></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="w-full h-full"><path d="M12 4v16m8-8H4" /></svg>,
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function tsToDate(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts?.toDate === "function") return ts.toDate();
  if (ts instanceof Date) return ts;
  const d = new Date(ts); return isNaN(d.getTime()) ? null : d;
}
function fmtDate(ts: any): string {
  const d = tsToDate(ts);
  return d ? d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "long" }) : "—";
}
function fmtShort(ts: any): string {
  const d = tsToDate(ts);
  return d ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}
function toInputDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  if (o.isProductsOnly === true || o.hasCleaningProducts === true) return true;
  return getProductItems(o).length > 0;
}
function isPureStandalone(o: Order): boolean {
  return !o.cleaningId && !orderHasLinen(o) && (o.isProductsOnly === true || String(o.type ?? "").toUpperCase() === "PRODUCTS");
}
function isDelivered(o: Order): boolean { return String(o.status ?? "").toUpperCase() === "DELIVERED"; }
function propImg(p?: Property | null): string | null { return p?.imageUrl || p?.photos?.[0] || null; }

// ════════════════════════════════════════════════════════════════════════
export default function SpedizioniPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);

  // Filtri
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todeliver" | "delivered" | "all">("todeliver");
  const [typeFilter, setTypeFilter] = useState<"all" | "withlinen" | "productsonly">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "orders"), where("hasCleaningProducts", "==", true)),
      snap => { setOrders(snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) } as Order))); setLoading(false); },
      err => { console.error("Errore listener orders:", err); setLoading(false); },
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "properties"),
      snap => setProperties(
        snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) } as Property))
          .filter(p => String(p.status ?? "").toUpperCase() !== "DELETED")
          .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
      ),
      err => console.error("Errore listener properties:", err),
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    fetch("/api/product-requests/available")
      .then(r => r.json())
      .then(d => setCatalog((d.products ?? []).map((p: any) => ({ id: p.id, name: p.name, unit: p.unit }))))
      .catch(() => setCatalog([]));
  }, []);

  const shipments = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom + "T00:00:00") : null;
    const toTs = dateTo ? new Date(dateTo + "T23:59:59") : null;
    const s = search.trim().toLowerCase();
    return orders
      .filter(isProductShipment)
      .filter(o => String(o.status ?? "").toUpperCase() !== "CANCELLED")
      .filter(o => statusFilter === "all" ? true : statusFilter === "delivered" ? isDelivered(o) : !isDelivered(o))
      .filter(o => typeFilter === "all" ? true : typeFilter === "withlinen" ? orderHasLinen(o) : !orderHasLinen(o))
      .filter(o => {
        if (!s) return true;
        return (o.propertyName ?? "").toLowerCase().includes(s) || (o.propertyAddress ?? "").toLowerCase().includes(s);
      })
      .filter(o => {
        const d = tsToDate(o.scheduledDate);
        if (fromTs && (!d || d < fromTs)) return false;
        if (toTs && (!d || d > toTs)) return false;
        return true;
      })
      // 🔼 ordine CRESCENTE: prossima consegna in alto
      .sort((a, b) => (tsToDate(a.scheduledDate)?.getTime() ?? 0) - (tsToDate(b.scheduledDate)?.getTime() ?? 0));
  }, [orders, search, statusFilter, typeFilter, dateFrom, dateTo]);

  const resetFilters = () => { setSearch(""); setStatusFilter("todeliver"); setTypeFilter("all"); setDateFrom(""); setDateTo(""); };
  const activeFilters = !!search || statusFilter !== "todeliver" || typeFilter !== "all" || !!dateFrom || !!dateTo;
  const propMap = useMemo(() => { const m = new Map<string, Property>(); properties.forEach(p => m.set(p.id, p)); return m; }, [properties]);

  return (
    <div className="max-w-4xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Spedizioni Prodotti</h1>
          <p className="text-slate-500 text-sm mt-0.5">{shipments.length} {shipments.length === 1 ? "spedizione" : "spedizioni"}</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-semibold text-sm shadow-lg shadow-blue-500/30"
          style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)" }}
        >
          <span className="w-4 h-4">{I.plus}</span>
          Nuova spedizione
        </button>
      </div>

      {/* Filtri */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 space-y-3">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
          <span className="w-4 h-4 text-slate-400 flex-shrink-0">{I.search}</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca per proprietà o indirizzo…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-400">
            <option value="todeliver">Da consegnare</option>
            <option value="delivered">Consegnate</option>
            <option value="all">Tutti gli stati</option>
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-400">
            <option value="all">Tutti i tipi</option>
            <option value="withlinen">Con biancheria</option>
            <option value="productsonly">Solo prodotti</option>
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Dal" className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-400" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="Al" className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-400" />
        </div>
        {activeFilters && (
          <button onClick={resetFilters} className="text-xs font-medium text-blue-600 hover:text-blue-700">Azzera filtri</button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-28 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
      ) : shipments.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-2xl border border-slate-200">
          <div className="w-12 h-12 mx-auto text-slate-300 mb-3">{I.box}</div>
          <p className="text-slate-500 text-sm">Nessuna spedizione con questi filtri.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shipments.map(o => <ShipmentCard key={o.id} order={o} property={propMap.get(o.propertyId ?? "")} onEdit={() => setEditing(o)} />)}
        </div>
      )}

      {showNew && <NewShipmentModal properties={properties} catalog={catalog} onClose={() => setShowNew(false)} />}
      {editing && <EditShipmentModal order={editing} catalog={catalog} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ─── Card spedizione ──────────────────────────────────────────────────────
function ShipmentCard({ order, property, onEdit }: { order: Order; property?: Property; onEdit: () => void }) {
  const products = getProductItems(order);
  const withLinen = orderHasLinen(order);
  const delivered = isDelivered(order);
  const img = propImg(property);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 border border-slate-100" style={{ background: delivered ? "#ecfdf5" : "#eff6ff" }}>
          {img
            ? <img src={img} alt="" className="w-full h-full object-cover" />
            : <span className={`w-5 h-5 ${delivered ? "text-emerald-500" : "text-blue-500"}`}>{withLinen ? I.bed : I.box}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-slate-800 truncate">{order.propertyName || "Proprietà"}</p>
            <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${delivered ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {delivered ? "Consegnata" : "Da consegnare"}
            </span>
          </div>
          {order.propertyAddress && <p className="text-xs text-slate-400 truncate">{order.propertyAddress}</p>}

          <div className="flex items-center gap-1.5 mt-2 text-sm">
            <span className="w-4 h-4 text-slate-400">{I.calendar}</span>
            <span className="text-slate-600">Consegna <strong className="text-slate-800 capitalize">{fmtDate(order.scheduledDate)}</strong></span>
            {withLinen && <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">con biancheria</span>}
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {products.length === 0
              ? <span className="text-xs text-slate-400">Nessun prodotto</span>
              : products.map((p, i) => (
                  <span key={p.itemId ?? p.id ?? i} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-xs">{p.name} ×{p.quantity ?? 1}</span>
                ))}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Creata il {fmtShort(order.createdAt)}</span>
            {!delivered && <button onClick={onEdit} className="text-sm font-semibold text-blue-600 hover:text-blue-700">Modifica</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sezione "card bianca" riutilizzabile (stile sito) ──────────────────────
function CardSection({ icon, title, required, children }: { icon: React.ReactNode; title: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
          <span className="w-4 h-4 text-slate-600">{icon}</span>
        </div>
        <span className="text-sm font-semibold text-slate-800">{title}{required && <span className="text-red-500"> *</span>}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Selettore prodotti ─────────────────────────────────────────────────────
function ProductPicker({ catalog, selected, setSelected }: {
  catalog: CatalogProduct[];
  selected: Record<string, { name: string; qty: number }>;
  setSelected: (s: Record<string, { name: string; qty: number }>) => void;
}) {
  const toggle = (p: CatalogProduct) => {
    const next = { ...selected };
    if (next[p.id]) delete next[p.id]; else next[p.id] = { name: p.name, qty: 1 };
    setSelected(next);
  };
  const changeQty = (id: string, delta: number) => {
    const next = { ...selected }; if (!next[id]) return;
    next[id] = { ...next[id], qty: Math.max(1, Math.min(99, next[id].qty + delta)) };
    setSelected(next);
  };
  return (
    <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
      {catalog.length === 0 && <p className="text-sm text-slate-400 p-3">Nessun prodotto in inventario.</p>}
      {catalog.map(p => {
        const sel = selected[p.id];
        return (
          <div key={p.id} className={`flex items-center justify-between gap-2 p-2.5 ${sel ? "bg-blue-50/40" : ""}`}>
            <button onClick={() => toggle(p)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
              <span className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center ${sel ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                {sel && <span className="w-3 h-3 text-white">{I.check}</span>}
              </span>
              <span className="text-sm text-slate-700 truncate">{p.name}</span>
            </button>
            {sel && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => changeQty(p.id, -1)} className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 font-bold">−</button>
                <span className="w-6 text-center text-sm font-semibold">{sel.qty}</span>
                <button onClick={() => changeQty(p.id, +1)} className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 font-bold">+</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Modale shell (stile sito) ──────────────────────────────────────────────
function ModalShell({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-slate-50 w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white sm:rounded-t-2xl">
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <span className="w-5 h-5">{I.close}</span>
          </button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto flex-1">{children}</div>
        <div className="p-4 border-t border-slate-200 bg-white flex gap-2">{footer}</div>
      </div>
    </div>
  );
}

// ─── Modale: NUOVA spedizione (ricerca proprietà testuale) ───────────────────
function NewShipmentModal({ properties, catalog, onClose }: { properties: Property[]; catalog: CatalogProduct[]; onClose: () => void }) {
  const [propSearch, setPropSearch] = useState("");
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [date, setDate] = useState("");
  const [selected, setSelected] = useState<Record<string, { name: string; qty: number }>>({});
  const [cleanings, setCleanings] = useState<Array<{ id: string; date: Date }>>([]);
  const [loadingCleanings, setLoadingCleanings] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const filteredProperties = useMemo(() => {
    const s = propSearch.trim().toLowerCase();
    if (!s) return properties.slice(0, 50);
    return properties.filter(p => (p.name ?? "").toLowerCase().includes(s) || (p.address ?? "").toLowerCase().includes(s));
  }, [properties, propSearch]);

  useEffect(() => {
    if (!selectedProperty) { setCleanings([]); return; }
    setLoadingCleanings(true);
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "cleanings"), where("propertyId", "==", selectedProperty.id)));
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const active = new Set(["SCHEDULED", "ASSIGNED", "PENDING", "IN_PROGRESS"]);
        const list = snap.docs
          .map(d => { const data = d.data() as Record<string, any>; return { id: d.id, date: tsToDate(data.scheduledDate), status: String(data.status ?? "").toUpperCase() }; })
          .filter(c => c.date && c.date >= today && active.has(c.status))
          .map(c => ({ id: c.id, date: c.date as Date }))
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .slice(0, 12);
        setCleanings(list);
      } catch (e) { console.error("Errore pulizie:", e); setCleanings([]); }
      finally { setLoadingCleanings(false); }
    })();
  }, [selectedProperty]);

  const cleaningDayKeys = useMemo(() => new Set(cleanings.map(c => toInputDate(c.date))), [cleanings]);
  const chosenHasCleaning = date ? cleaningDayKeys.has(date) : false;

  const submit = async () => {
    setError("");
    const items = Object.entries(selected).map(([id, v]) => ({ itemId: id, name: v.name, quantity: v.qty }));
    if (!selectedProperty) return setError("Seleziona una proprietà.");
    if (!date) return setError("Scegli una data di consegna.");
    if (items.length === 0) return setError("Seleziona almeno un prodotto.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders/products-shipment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: selectedProperty.id, scheduledDate: date, items }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Errore durante la creazione."); setSubmitting(false); return; }
      onClose();
    } catch { setError("Errore di rete."); setSubmitting(false); }
  };

  return (
    <ModalShell
      title="Nuova spedizione prodotti"
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm bg-white">Annulla</button>
        <button onClick={submit} disabled={submitting} className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50" style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)" }}>
          {submitting ? "Creo…" : "Crea spedizione"}
        </button>
      </>}
    >
      {/* Proprietà con ricerca */}
      <CardSection icon={I.home} title="Proprietà" required>
        {selectedProperty ? (
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white shadow-sm overflow-hidden flex-shrink-0 flex items-center justify-center">
              {propImg(selectedProperty) ? <img src={propImg(selectedProperty) as string} alt="" className="w-full h-full object-cover" /> : <span className="w-5 h-5 text-blue-400">{I.home}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{selectedProperty.name}</p>
              <p className="text-xs text-slate-500 truncate">{selectedProperty.address}</p>
              {selectedProperty.usesOwnLinen && <span className="text-[10px] text-amber-600">biancheria propria</span>}
            </div>
            <button onClick={() => { setSelectedProperty(null); setPropSearch(""); setDate(""); }} className="w-9 h-9 rounded-full bg-white border border-red-200 flex items-center justify-center hover:bg-red-50 flex-shrink-0">
              <span className="w-4 h-4 text-red-400">{I.close}</span>
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="w-4 h-4 text-slate-400 flex-shrink-0">{I.search}</span>
              <input value={propSearch} onChange={e => setPropSearch(e.target.value)} placeholder="Cerca proprietà…" className="flex-1 bg-transparent outline-none text-sm" autoFocus />
            </div>
            <div className="mt-1.5 max-h-52 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100">
              {filteredProperties.length === 0
                ? <p className="p-3 text-center text-sm text-slate-500">Nessuna proprietà trovata.</p>
                : filteredProperties.map(prop => (
                  <button key={prop.id} onClick={() => { setSelectedProperty(prop); setPropSearch(""); }} className="w-full p-3 flex items-center gap-3 hover:bg-blue-50 text-left">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {propImg(prop) ? <img src={propImg(prop) as string} alt="" className="w-full h-full object-cover" /> : <span className="w-5 h-5 text-slate-400">{I.home}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate text-sm">{prop.name}</p>
                      <p className="text-xs text-slate-500 truncate">{prop.address}</p>
                    </div>
                    {prop.usesOwnLinen && <span className="text-[10px] text-amber-600 shrink-0">propria</span>}
                  </button>
                ))}
            </div>
          </>
        )}
      </CardSection>

      {/* Data */}
      {selectedProperty && (
        <CardSection icon={I.calendar} title="Data di consegna" required>
          {loadingCleanings ? (
            <div className="h-9 bg-slate-100 rounded-lg animate-pulse mb-3" />
          ) : cleanings.length > 0 ? (
            <div className="mb-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0">{I.calendar}</span>
                <div>
                  <p className="text-xs font-semibold text-blue-800">Giorni con una pulizia già in programma</p>
                  <p className="text-[11px] text-blue-600 leading-snug mt-0.5">Toccane uno: i prodotti viaggiano con quella consegna, <strong>senza un giro extra del rider</strong>.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {cleanings.map(c => {
                  const key = toInputDate(c.date);
                  const on = date === key;
                  return (
                    <button key={c.id} onClick={() => setDate(key)} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${on ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-blue-700 border-blue-200 hover:border-blue-400"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${on ? "bg-white" : "bg-blue-400"}`} />
                      {c.date.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
              <p className="text-xs text-amber-800 leading-snug">{selectedProperty.usesOwnLinen ? "🧺 Casa con biancheria propria: nessuna consegna in programma. I prodotti partiranno come spedizione dedicata." : "Nessuna pulizia in programma: scegli una data, partirà una spedizione dedicata."}</p>
            </div>
          )}

          <p className="text-[11px] font-medium text-slate-400 mb-1">{cleanings.length > 0 ? "Oppure scegli un'altra data:" : "Data di consegna:"}</p>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-blue-400 outline-none" />

          {date && (
            <div className={`mt-2.5 flex items-start gap-2 p-2.5 rounded-xl text-xs ${chosenHasCleaning ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-slate-50 text-slate-600 border border-slate-200"}`}>
              <span className="text-sm leading-none">{chosenHasCleaning ? "🔗" : "📦"}</span>
              <span>{chosenHasCleaning ? "C'è una pulizia quel giorno: i prodotti finiranno in un unico ordine biancheria + prodotti." : "Nessuna pulizia quel giorno: verrà creata una spedizione dedicata di soli prodotti."}</span>
            </div>
          )}
        </CardSection>
      )}

      {/* Prodotti */}
      {selectedProperty && (
        <CardSection icon={I.box} title="Prodotti" required>
          <ProductPicker catalog={catalog} selected={selected} setSelected={setSelected} />
        </CardSection>
      )}

      {error && <p className="text-sm text-rose-600 px-1">{error}</p>}
    </ModalShell>
  );
}

// ─── Modale: MODIFICA spedizione ────────────────────────────────────────────
function EditShipmentModal({ order, catalog, onClose }: { order: Order; catalog: CatalogProduct[]; onClose: () => void }) {
  const pure = isPureStandalone(order);
  const initSelected: Record<string, { name: string; qty: number }> = {};
  for (const p of getProductItems(order)) { const id = p.itemId ?? p.id ?? ""; if (id) initSelected[id] = { name: p.name ?? "Prodotto", qty: p.quantity ?? 1 }; }
  const initDate = tsToDate(order.scheduledDate);

  const [selected, setSelected] = useState(initSelected);
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
      const res = await fetch(`/api/orders/${order.id}/products`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Errore durante il salvataggio."); setSubmitting(false); return; }
      onClose();
    } catch { setError("Errore di rete."); setSubmitting(false); }
  };

  const remove = async () => {
    setError(""); setDeleting(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/products`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Errore durante l'eliminazione."); setDeleting(false); return; }
      onClose();
    } catch { setError("Errore di rete."); setDeleting(false); }
  };

  return (
    <ModalShell
      title="Modifica spedizione"
      onClose={onClose}
      footer={<>
        {pure && <button onClick={remove} disabled={deleting || submitting} className="px-4 py-2.5 rounded-xl border border-rose-200 text-rose-600 font-semibold text-sm bg-white disabled:opacity-50">{deleting ? "…" : "Elimina"}</button>}
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm bg-white">Annulla</button>
        <button onClick={save} disabled={submitting || deleting} className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50" style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)" }}>{submitting ? "Salvo…" : "Salva"}</button>
      </>}
    >
      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <p className="font-bold text-slate-800 text-sm">{order.propertyName}</p>
        <p className="text-xs text-slate-500">{order.propertyAddress}</p>
      </div>

      <CardSection icon={I.calendar} title="Data di consegna">
        <input type="date" value={date} disabled={!pure} onChange={e => setDate(e.target.value)} className={`w-full px-4 py-3 border rounded-xl text-sm font-medium outline-none focus:border-blue-400 ${pure ? "bg-slate-50 border-slate-200" : "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"}`} />
        {!pure && <p className="text-xs text-slate-500 mt-2">🔒 Consegna legata a una pulizia: la data si modifica dalla pulizia. Qui puoi cambiare solo i prodotti.</p>}
      </CardSection>

      <CardSection icon={I.box} title="Prodotti">
        <ProductPicker catalog={catalog} selected={selected} setSelected={setSelected} />
        {pure && Object.keys(selected).length === 0 && <p className="text-xs text-amber-600 mt-2">Salvando senza prodotti la spedizione verrà eliminata.</p>}
      </CardSection>

      {error && <p className="text-sm text-rose-600 px-1">{error}</p>}
    </ModalShell>
  );
}
