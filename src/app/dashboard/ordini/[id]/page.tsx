import { redirect, notFound } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import Link from "next/link";

export default async function OrdineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const { id } = await params;

  const order = await db.order.findUnique({
    where: { id },
    include: { property: true, rider: { select: { id: true, name: true } }, items: true, booking: true },
  });

  if (!order) notFound();

  const riders = await db.user.findMany({ where: { role: "operator", operatorType: "delivery", status: "active" }, select: { id: true, name: true } });

  const states = [
    { key: "pending", label: "Da preparare", icon: "📋" },
    { key: "prepared", label: "Preparato", icon: "✅" },
    { key: "cargo", label: "Caricato", icon: "📥" },
    { key: "shipped", label: "In consegna", icon: "🚚" },
    { key: "delivered", label: "Consegnato", icon: "🏠" },
  ];

  const currentIdx = states.findIndex((s) => s.key === order.status);

  return (
    <div className="p-4 lg:p-8">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/ordini" className="p-2 hover:bg-slate-100 rounded-lg">
          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Ordine #{order.id.slice(-6).toUpperCase()}</h1>
          <p className="text-slate-500">{order.property.name} - {order.property.address}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Timeline */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-6">Stato Ordine</h2>
            <div className="flex items-center justify-between mb-2">
              {states.map((state, idx) => (
                <div key={state.key} className="flex-1 flex flex-col items-center">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl transition-all ${idx <= currentIdx ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30" : "bg-slate-100"}`}>
                    {state.icon}
                  </div>
                  <p className={`text-xs mt-2 font-medium ${idx <= currentIdx ? "text-emerald-600" : "text-slate-400"}`}>{state.label}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center mt-4">
              {states.map((_, idx) => (
                <div key={idx} className={`flex-1 h-1 ${idx < states.length - 1 ? (idx < currentIdx ? "bg-emerald-500" : "bg-slate-200") : ""}`} />
              ))}
            </div>
          </div>

          {/* Articoli */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Articoli ({order.items.length})</h2>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center">
                      <span className="text-lg">{item.type === "linen" ? "🛏️" : "🧴"}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.sku || "Nessun SKU"}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-slate-800">x{item.quantity}</p>
                    {item.unitPrice > 0 && <p className="text-sm text-slate-500">€{(item.unitPrice * item.quantity).toFixed(2)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Dettagli</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-500">Proprietà</p>
                <p className="font-medium text-slate-800">{order.property.name}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Indirizzo</p>
                <p className="font-medium text-slate-800">{order.property.address}, {order.property.city}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Data Consegna</p>
                <p className="font-medium text-slate-800">{order.scheduledDate ? new Date(order.scheduledDate).toLocaleDateString("it-IT") : "-"}</p>
              </div>
              {order.deliveredAt && (
                <div>
                  <p className="text-sm text-slate-500">Consegnato il</p>
                  <p className="font-medium text-emerald-600">{new Date(order.deliveredAt).toLocaleString("it-IT")}</p>
                </div>
              )}
            </div>
          </div>

          {/* Rider */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Rider</h2>
            {order.rider ? (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <span className="text-sm font-bold text-white">{order.rider.name.split(" ").map(n => n[0]).join("")}</span>
                </div>
                <p className="font-medium text-slate-800">{order.rider.name}</p>
              </div>
            ) : (
              <div>
                <p className="text-slate-500 mb-4">Nessun rider assegnato</p>
                <select className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-sky-500 outline-none">
                  <option value="">Seleziona rider</option>
                  {riders.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Azioni</h2>
            <div className="space-y-3">
              {order.status === "pending" && (
                <button className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-medium hover:shadow-lg transition-all">✅ Segna come Preparato</button>
              )}
              {order.status === "prepared" && (
                <button className="w-full py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-medium hover:shadow-lg transition-all">📥 Segna come Caricato</button>
              )}
              {order.status === "cargo" && (
                <button className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-medium hover:shadow-lg transition-all">🚚 Segna come Spedito</button>
              )}
              {order.status === "shipped" && (
                <button className="w-full py-3 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-medium hover:shadow-lg transition-all">🏠 Segna come Consegnato</button>
              )}
              {order.status === "delivered" && (
                <div className="text-center py-4">
                  <span className="text-emerald-600 font-medium">✓ Ordine completato</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
