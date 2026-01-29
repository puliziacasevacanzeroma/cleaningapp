"use client";

import { useEffect, useState } from "react";
import { InventarioProdottiClient } from "./InventarioProdottiClient";

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  description?: string;
  items: any[];
}

interface Stats {
  totalItems: number;
  lowStock: number;
  outOfStock: number;
  totalValue: number;
}

export function InventarioProdottiWrapper() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<Stats>({ totalItems: 0, lowStock: 0, outOfStock: 0, totalValue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Usa l'API specifica per i prodotti pulizia
        const res = await fetch("/api/inventory/list?type=prodotti");
        const data = await res.json();
        
        // Filtra solo la categoria prodotti_pulizia
        const prodottiCategories = (data.categories || []).filter(
          (cat: Category) => cat.id === "prodotti_pulizia"
        );
        
        setCategories(prodottiCategories);
        
        // Calcola stats solo per prodotti pulizia
        let totalItems = 0, lowStock = 0, outOfStock = 0, totalValue = 0;
        prodottiCategories.forEach((cat: Category) => {
          cat.items.forEach((item: any) => {
            totalItems++;
            totalValue += item.quantity * item.sellPrice;
            if (item.quantity === 0) outOfStock++;
            else if (item.quantity <= item.minQuantity) lowStock++;
          });
        });
        
        setStats({ totalItems, lowStock, outOfStock, totalValue });
      } catch (error) {
        console.error("Errore caricamento inventario prodotti:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Caricamento prodotti...</p>
        </div>
      </div>
    );
  }

  return <InventarioProdottiClient categories={categories} stats={stats} />;
}
