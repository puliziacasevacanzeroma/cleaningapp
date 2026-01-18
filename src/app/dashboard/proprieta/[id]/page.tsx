"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  zone: string;
  type: string;
  bedrooms: number;
  bathrooms: number;
  maxGuests: number;
  cleaningPrice: number;
  status: string;
  ownerName: string;
  ownerEmail: string;
  notes: string;
}

export default function PropertyDetailPage() {
  const params = useParams();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      fetch(`/api/properties/${params.id}`)
        .then(res => res.json())
        .then(data => {
          setProperty(data);
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

  if (!property) {
    return (
      <div className="p-4 lg:p-8">
        <div className="text-center py-12">
          <p className="text-slate-500">Proprietà non trovata</p>
          <Link href="/dashboard/proprieta" className="text-sky-500 hover:underline mt-2 inline-block">
            Torna alle proprietà
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <Link href="/dashboard/proprieta" className="text-sky-500 hover:underline text-sm">
          ← Torna alle proprietà
        </Link>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 mt-2">
          {property.name}
        </h1>
        <p className="text-slate-500">{property.address}</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Dettagli</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-500">Città</span>
              <span className="font-medium text-slate-800">{property.city || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Zona</span>
              <span className="font-medium text-slate-800">{property.zone || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tipo</span>
              <span className="font-medium text-slate-800">{property.type || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Camere</span>
              <span className="font-medium text-slate-800">{property.bedrooms || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Bagni</span>
              <span className="font-medium text-slate-800">{property.bathrooms || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Max Ospiti</span>
              <span className="font-medium text-slate-800">{property.maxGuests || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Prezzo Pulizia</span>
              <span className="font-medium text-slate-800">€{property.cleaningPrice || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Stato</span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                property.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}>
                {property.status}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Proprietario</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-500">Nome</span>
              <span className="font-medium text-slate-800">{property.ownerName || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Email</span>
              <span className="font-medium text-slate-800">{property.ownerEmail || "-"}</span>
            </div>
          </div>

          {property.notes && (
            <div className="mt-6 pt-4 border-t border-slate-200">
              <h3 className="font-medium text-slate-700 mb-2">Note</h3>
              <p className="text-slate-600 text-sm">{property.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}