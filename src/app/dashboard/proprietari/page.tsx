"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Proprietario {
  id: string;
  name: string;
  surname?: string;
  email: string;
  phone?: string;
  status: string;
  _count: { properties: number };
  properties: { cleaningFee: number; cleanings: any[] }[];
}

export default function ProprietariPage() {
  const [proprietari, setProprietari] = useState<Proprietario[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/dashboard/utenti?role=PROPRIETARIO")
      .then(res => res.json())
      .then(data => {
        setProprietari(data.users || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const calcTotale = (props: any[]) => {
    if (!props) return 0;
    return props.reduce((sum, p) => sum + ((p.cleanings?.length || 0) * (p.cleaningFee || 0)), 0);
  };

  const filteredProprietari = proprietari.filter(p => 
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-48 mb-4"></div>
          <div className="h-12 bg-slate-200 rounded-xl mb-6"></div>
          <div className="space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="h-20 bg-slate-200 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Proprietari</h1>
          <p className="text-slate-500 mt-1">{proprietari.length} proprietari registrati</p>
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-sky-500/30 hover:scale-105 transition-all">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nuovo Proprietario
        </button>
      </div>

      <div className="mb-6">
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input 
            type="text" 
            placeholder="Cerca proprietario..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all" 
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Proprietario</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Email</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Proprietà</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Stato</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filteredProprietari.map((prop) => (
                <tr key={prop.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
                        <span className="text-sm font-bold text-white">{prop.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{prop.name} {prop.surname || ""}</p>
                        <p className="text-xs text-slate-500">{prop.phone || "No telefono"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-slate-600">{prop.email}</td>
                  <td className="py-4 px-6">
                    <span className="px-3 py-1 bg-sky-100 text-sky-700 rounded-lg text-sm font-medium">{prop._count?.properties || 0}</span>
                  </td>
                  <td className="py-4 px-6">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${prop.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : prop.status === "PENDING" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                      {prop.status === "ACTIVE" ? "Attivo" : prop.status === "PENDING" ? "In attesa" : "Sospeso"}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <Link href={`/dashboard/proprietari/${prop.id}`} className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors inline-block">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredProprietari.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-500">Nessun proprietario trovato</p>
          </div>
        )}
      </div>
    </div>
  );
}