"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, query, orderBy, where, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { ProprietaClient } from "./ProprietaClient";

interface PropertyData {
  activeProperties: any[];
  pendingProperties: any[];
  suspendedProperties: any[];
  proprietari: any[];
}

// Skeleton component
function ProprietaSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 pb-4">
      <div className="bg-white px-4 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div className="h-7 w-28 bg-slate-200 rounded-lg animate-pulse"></div>
          <div className="w-10 h-10 bg-slate-200 rounded-xl animate-pulse"></div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-slate-100 rounded-xl p-3 animate-pulse">
              <div className="h-6 w-8 bg-slate-200 rounded mb-1 mx-auto"></div>
              <div className="h-3 w-12 bg-slate-200 rounded mx-auto"></div>
            </div>
          ))}
        </div>
        <div className="h-10 bg-slate-100 rounded-xl mb-3 animate-pulse"></div>
        <div className="flex gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-9 w-24 bg-slate-100 rounded-full animate-pulse"></div>
          ))}
        </div>
      </div>
      <div className="px-4 py-4">
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 overflow-hidden animate-pulse">
              <div className="h-14 bg-slate-200"></div>
              <div className="p-2">
                <div className="h-3 w-full bg-slate-100 rounded mb-1"></div>
                <div className="h-2 w-2/3 bg-slate-100 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProprietaClientWrapper() {
  const [data, setData] = useState<PropertyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [proprietari, setProprietari] = useState<any[]>([]);
  const [propertiesRaw, setPropertiesRaw] = useState<any[]>([]);
  const [cleaningsMap, setCleaningsMap] = useState<Map<string, { total: number; completed: number; monthlyTotal: number }>>(new Map());

  // 🆕 Carica proprietari dalla collection users
  useEffect(() => {
    const unsubUsers = onSnapshot(
      query(collection(db, "users"), where("role", "in", ["PROPRIETARIO", "CLIENTE"])),
      (snapshot) => {
        const owners = snapshot.docs
          .filter(doc => {
            const d = doc.data() as Record<string, any>;
            return !["ADMIN", "SUPERADMIN"].includes((d.role || "").toUpperCase());
          })
          .map(doc => {
            const d = doc.data() as Record<string, any>;
            const fullName = [d.name, d.surname].filter(Boolean).join(" ") || d.displayName || d.email || "Senza nome";
            return { id: doc.id, name: fullName, email: d.email || null };
          });
        setProprietari(owners);
      },
      (error) => { console.error("Errore caricamento proprietari:", error); }
    );
    return () => unsubUsers();
  }, []);

  // 🆕 Listener per cleanings del mese corrente → calcola totali per proprietà
  // 🚀 PERF v2: filtro server-side su scheduledDate dall'inizio del mese in poi.
  // Prima: collection(db, "cleanings") scaricava l'intero storico di pulizie (tutte
  // le proprietà, tutti i mesi) solo per calcolare i totali del mese in corso —
  // causa principale del caricamento lento della pagina proprietà al crescere dei dati.
  // Il filtro in memoria alla riga originale (schedDate < startOfMonth) già scartava
  // le pulizie fuori dal mese corrente, quindi il comportamento visibile è identico.
  // Indice singolo automatico su scheduledDate, nessun indice composito necessario.
  useEffect(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const unsubCleanings = onSnapshot(
      query(
        collection(db, "cleanings"),
        where("scheduledDate", ">=", Timestamp.fromDate(startOfMonth))
      ),
      (snapshot) => {
        const map = new Map<string, { total: number; completed: number; monthlyTotal: number }>();

        snapshot.docs.forEach(doc => {
          const d = doc.data() as Record<string, any>;
          const propId = d.propertyId;
          if (!propId) return;

          // Filtra solo pulizie del mese corrente
          let schedDate: Date | null = null;
          if (d.scheduledDate?.toDate) schedDate = d.scheduledDate.toDate();
          else if (d.scheduledDate) schedDate = new Date(d.scheduledDate);

          if (!schedDate || schedDate < startOfMonth) return;

          if (!map.has(propId)) map.set(propId, { total: 0, completed: 0, monthlyTotal: 0 });
          const entry = map.get(propId)!;
          entry.total++;
          if (d.status === "COMPLETED") {
            entry.completed++;
            entry.monthlyTotal += (d.price || 0);
          }
        });

        setCleaningsMap(map);
      },
      (error) => { console.error("Errore listener cleanings:", error); }
    );
    return () => unsubCleanings();
  }, []);

  // Listener proprietà
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "properties"), orderBy("name", "asc")),
      (snapshot) => {
        setPropertiesRaw(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })));
        setLoading(false);
      },
      (error) => {
        console.error("Errore listener proprietà:", error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // 🔥 Combina proprietà + dati cleanings in un unico effetto
  useEffect(() => {
    if (propertiesRaw.length === 0 && !loading) {
      setData({ activeProperties: [], pendingProperties: [], suspendedProperties: [], proprietari: [] });
      return;
    }
    if (propertiesRaw.length === 0) return;

    const activeProperties: any[] = [];
    const pendingProperties: any[] = [];
    const suspendedProperties: any[] = [];

    propertiesRaw.forEach(docData => {
      const cData = cleaningsMap.get(docData.id) || { total: 0, completed: 0, monthlyTotal: 0 };
      const property = {
        ...docData,
        status: docData.status,
        deactivationRequested: docData.deactivationRequested || false,
        ownerId: docData.ownerId || "",
        cleaningPrice: docData.cleaningPrice || 0,
        monthlyTotal: cData.monthlyTotal,
        cleaningsThisMonth: cData.total,
        completedThisMonth: cData.completed,
        _count: { bookings: 0, cleanings: cData.total },
        owner: { name: docData.ownerName || "", email: docData.ownerEmail || "" },
      };

      if (docData.deactivationRequested && docData.status === "ACTIVE") {
        pendingProperties.push(property);
      } else {
        switch (docData.status) {
          case "ACTIVE": activeProperties.push(property); break;
          case "PENDING":
          case "PENDING_SIGNATURE": pendingProperties.push(property); break;
          case "SUSPENDED":
          case "INACTIVE": suspendedProperties.push(property); break;
        }
      }
    });

    setData({ activeProperties, pendingProperties, suspendedProperties, proprietari: [] });
  }, [propertiesRaw, cleaningsMap, loading]);

  if (loading || !data) {
    return <ProprietaSkeleton />;
  }

  return (
    <ProprietaClient
      activeProperties={data.activeProperties}
      pendingProperties={data.pendingProperties}
      suspendedProperties={data.suspendedProperties}
      proprietari={proprietari}
    />
  );
}
