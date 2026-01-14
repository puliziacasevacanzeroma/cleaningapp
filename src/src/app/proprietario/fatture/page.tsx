import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export default async function FatturePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;

  // Recupera ordini/fatture del proprietario
  const orders = await db.order.findMany({
    where: {
      property: { ownerId: userId },
      status: "delivered"
    },
    include: {
      property: true,
      items: true,
      booking: true
    },
    orderBy: { createdAt: "desc" }
  });

  // Calcola totale per ogni ordine
  const ordersWithTotal = orders.map(order => ({
    ...order,
    total: order.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
  }));

  const totalPending = ordersWithTotal
    .filter(o => !o.booking?.isPaid)
    .reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Fatture</h1>
        <p className="text-slate-500 mt-1">Storico fatture e pagamenti</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Totale ordini</p>
          <p className="text-2xl font-bold text-slate-800">{orders.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Da pagare</p>
          <p className="text-2xl font-bold text-amber-600">{totalPending.toFixed(2)}€</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Ultimo ordine</p>
          <p className="text-2xl font-bold text-slate-800">
            {orders[0] 
              ? new Date(orders[0].createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "short" })
              : "-"
            }
          </p>
        </div>
      </div>

      {/* Lista Fatture */}
      {ordersWithTotal.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Data</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Proprietà</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Descrizione</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-slate-600">Importo</th>
                  <th className="text-center py-4 px-6 text-sm font-semibold text-slate-600">Stato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ordersWithTotal.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-6 text-slate-700">
                      {new Date(order.createdAt).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric"
                      })}
                    </td>
                    <td className="py-4 px-6 font-medium text-slate-800">{order.property.name}</td>
                    <td className="py-4 px-6 text-slate-600">
                      {order.items.length} articoli
                    </td>
                    <td className="py-4 px-6 text-right font-semibold text-slate-800">
                      {order.total.toFixed(2)}€
                    </td>
                    <td className="py-4 px-6 text-center">
                      {order.booking?.isPaid ? (
                        <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium">
                          Pagato
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium">
                          In attesa
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <p className="text-slate-600 font-medium">Nessuna fattura</p>
          <p className="text-sm text-slate-500 mt-1">Le fatture appariranno qui dopo gli ordini completati</p>
        </div>
      )}
    </div>
  );
}
