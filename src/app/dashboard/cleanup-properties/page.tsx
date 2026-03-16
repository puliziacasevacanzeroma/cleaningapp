"use client";

import { useState, useEffect } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, getDocs, deleteDoc, doc, query, where } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export default function CleanupPropertiesPage() {
  const { user } = useAuth();
  const [props, setProps] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const ADMIN_IDS = ["user_1771880429101_d8ugbdoil", "XYv7zMlHi2bGiO5KoXvC"];

  const load = async () => {
    setLoading(true);
    const [propsSnap, usersSnap] = await Promise.all([
      getDocs(collection(db, "properties")),
      getDocs(collection(db, "users")),
    ]);
    const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    setUsers(allUsers);

    const allProps = propsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    // Proprietà orfane = ownerId mancante, "pending", o intestate all'admin
    const orphans = allProps.filter(p => {
      const oid = p.ownerId || "";
      if (!oid || oid === "pending" || oid === "unknown") return true;
      if (ADMIN_IDS.includes(oid)) return true;
      // Controlla se l'utente esiste
      const ownerExists = allUsers.find(u => u.id === oid);
      if (!ownerExists) return true;
      // Controlla se è un admin
      const ownerRole = ownerExists.role?.toUpperCase();
      if (ownerRole === "ADMIN" || ownerRole === "SUPERADMIN") return true;
      return false;
    });

    setProps(orphans);
    setLoading(false);
  };

  const deleteProperty = async (propId: string, propName: string) => {
    if (!confirm(`Eliminare definitivamente "${propName}"? Questa azione è irreversibile.`)) return;
    setDeleting(propId);
    try {
      await deleteDoc(doc(db, "properties", propId));
      setProps(prev => prev.filter(p => p.id !== propId));
      alert(`✅ "${propName}" eliminata`);
    } catch (e) {
      alert("Errore: " + e);
    }
    setDeleting(null);
  };

  if (!user || user.role !== "ADMIN") return <div className="p-8 text-red-500">Accesso negato</div>;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">🗑️ Proprietà Orfane / Fantasma</h1>
      <p className="text-gray-500 text-sm mb-4">
        Proprietà senza proprietario valido, intestate all'admin, o con ownerId mancante
      </p>

      <button onClick={load} disabled={loading}
        className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium mb-6 disabled:opacity-50">
        {loading ? "Caricamento..." : "🔍 Trova proprietà orfane"}
      </button>

      {props.length === 0 && !loading && (
        <p className="text-gray-400 text-sm">Clicca il pulsante per cercare</p>
      )}

      {props.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-red-600 mb-2">
            Trovate {props.length} proprietà orfane
          </p>
          {props.map(p => {
            const owner = users.find(u => u.id === p.ownerId);
            return (
              <div key={p.id} className="bg-white border-2 border-red-100 rounded-xl p-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-800">{p.name || "—"}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.status === "ACTIVE" ? "bg-green-100 text-green-700" :
                      p.status === "PENDING_SIGNATURE" ? "bg-blue-100 text-blue-700" :
                      p.status === "PENDING" ? "bg-amber-100 text-amber-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>{p.status}</span>
                  </div>
                  <p className="text-xs text-gray-500">{p.address}, {p.city}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    ownerId: <code className="bg-gray-100 px-1 rounded">{p.ownerId || "—"}</code>
                    {owner && <span className="ml-2 text-amber-600">({owner.name} — {owner.role})</span>}
                  </p>
                </div>
                <button
                  onClick={() => deleteProperty(p.id, p.name)}
                  disabled={deleting === p.id}
                  className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-xl hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                >
                  {deleting === p.id ? "..." : "🗑️ Elimina"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
