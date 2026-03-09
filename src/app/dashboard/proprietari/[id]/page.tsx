"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Proprietario {
  id: string;
  name: string;
  surname: string;
  email: string;
  phone: string;
  status: string;
  role: string;
}

export default function ProprietarioDetailPage() {
  const params = useParams();
  const [proprietario, setProprietario] = useState<Proprietario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      fetch(`/api/dashboard/utenti/${params.id}`)
        .then(res => res.json())
        .then(data => {
          setProprietario(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-48 mb-4"></div>
          <div className="h-64 bg-slate-200 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (!proprietario) {
    return (
      <div className="p-4 lg:p-8">
        <div className="text-center py-12">
          <p className="text-slate-500">Proprietario non trovato</p>
          <Link href="/dashboard/proprietari" className="text-sky-500 hover:underline mt-2 inline-block">
            Torna ai proprietari
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <Link href="/dashboard/proprietari" className="text-sky-500 hover:underline text-sm">
          ← Torna ai proprietari
        </Link>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 mt-2">
          {proprietario.name} {proprietario.surname}
        </h1>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
            <span className="text-xl font-bold text-white">
              {proprietario.name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {proprietario.name} {proprietario.surname}
            </h2>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              proprietario.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}>
              {proprietario.status === "ACTIVE" ? "Attivo" : "In attesa"}
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-slate-800 mb-2">Email</h3>
            <p className="text-slate-600">{proprietario.email || "-"}</p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 mb-2">Telefono</h3>
            <p className="text-slate-600">{proprietario.phone || "-"}</p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 mb-2">Ruolo</h3>
            <p className="text-slate-600">{proprietario.role || "-"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}