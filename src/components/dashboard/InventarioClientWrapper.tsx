"use client";

import { useInventory } from "~/lib/queries";
import { InventarioClient } from "./InventarioClient";

// Skeleton component
function InventarioSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="bg-white px-4 pt-4 pb-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-5">
          <div className="h-8 w-32 bg-slate-200 rounded-lg animate-pulse"></div>
          <div className="h-10 w-24 bg-slate-200 rounded-full animate-pulse"></div>
        </div>
        <div className="bg-slate-100 rounded-2xl p-4 mb-4 animate-pulse">
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="text-center">
                <div className="h-8 w-10 bg-slate-200 rounded mx-auto mb-1"></div>
                <div className="h-3 w-14 bg-slate-200 rounded mx-auto"></div>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 pt-3">
            <div className="flex justify-between">
              <div className="h-4 w-32 bg-slate-200 rounded"></div>
              <div className="h-4 w-20 bg-slate-200 rounded"></div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 h-11 bg-slate-100 rounded-full animate-pulse"></div>
          <div className="h-11 w-20 bg-slate-100 rounded-full animate-pulse"></div>
        </div>
      </div>
      <div className="px-4 py-4 space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 animate-pulse">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="h-5 w-40 bg-slate-200 rounded mb-2"></div>
                <div className="h-3 w-20 bg-slate-100 rounded"></div>
              </div>
              <div className="h-5 w-16 bg-slate-200 rounded"></div>
            </div>
            <div className="flex items-center justify-between">
              <div className="h-6 w-20 bg-slate-100 rounded-full"></div>
              <div className="flex gap-2">
                <div className="h-9 w-9 bg-slate-100 rounded-xl"></div>
                <div className="h-9 w-14 bg-slate-200 rounded-xl"></div>
                <div className="h-9 w-9 bg-slate-100 rounded-xl"></div>
                <div className="h-9 w-9 bg-slate-100 rounded-xl"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InventarioClientWrapper() {
  // ⚡ USA REACT QUERY - cache automatica, navigazione istantanea!
  const { data, isLoading, error } = useInventory();

  if (isLoading && !data) {
    return <InventarioSkeleton />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-red-500">Errore: {error.message}</p>
      </div>
    );
  }

  if (!data) return null;

  // 🆕 FILTRA ESCLUDENDO PRODOTTI PULIZIA (vanno nella sezione separata)
  const filteredCategories = data.categories.filter(
    (cat: any) => cat.id !== "prodotti_pulizia"
  );

  // Ricalcola stats senza prodotti pulizia
  let totalItems = 0, lowStock = 0, outOfStock = 0, totalValue = 0;
  filteredCategories.forEach((cat: any) => {
    cat.items.forEach((item: any) => {
      totalItems++;
      totalValue += item.quantity * item.sellPrice;
      if (item.quantity === 0) outOfStock++;
      else if (item.quantity <= item.minQuantity) lowStock++;
    });
  });

  return (
    <InventarioClient
      categories={filteredCategories}
      stats={{ totalItems, lowStock, outOfStock, totalValue }}
    />
  );
}
