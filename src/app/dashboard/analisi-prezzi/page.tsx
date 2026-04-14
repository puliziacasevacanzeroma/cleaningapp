'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '~/lib/firebase/config';
import { useAuth } from '~/lib/firebase/AuthContext';
import { useRouter } from 'next/navigation';

export default function AnalisiPrezziPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'ADMIN') { router.replace('/dashboard'); return; }

    getDocs(collection(db, 'properties')).then(snap => {
      const rows = snap.docs.map(d => {
        const x = d.data();
        return {
          id: d.id,
          nome: x.name ?? '—',
          mq: x.squareMeters ?? x.mq ?? null,
          camere: x.bedrooms ?? x.camere ?? null,
          bagni: x.bathrooms ?? x.bagni ?? null,
          ospiti: x.maxGuests ?? x.ospiti ?? null,
          prezzo: x.cleaningPrice ?? x.prezzoPulizia ?? null,
          status: x.status ?? null,
        };
      }).sort((a, b) => (a.prezzo ?? 999) - (b.prezzo ?? 999));
      setData(rows);
      setLoading(false);
    });
  }, [user]);

  const json = JSON.stringify(data, null, 2);

  const copy = () => {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-500">Caricamento proprietà...</p>
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Analisi Prezzi Proprietà</h1>
          <p className="text-xs text-red-500 mt-0.5">⚠️ Pagina temporanea — da eliminare dopo l'uso</p>
        </div>
        <button
          onClick={copy}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
        >
          {copied ? '✓ Copiato!' : 'Copia JSON'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Nome</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Mq</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Camere</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Bagni</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Ospiti max</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">€ Pulizia</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2.5 font-medium text-gray-800">{r.nome}</td>
                <td className="px-4 py-2.5 text-center text-gray-600">{r.mq ?? '—'}</td>
                <td className="px-4 py-2.5 text-center text-gray-600">{r.camere ?? '—'}</td>
                <td className="px-4 py-2.5 text-center text-gray-600">{r.bagni ?? '—'}</td>
                <td className="px-4 py-2.5 text-center text-gray-600">{r.ospiti ?? '—'}</td>
                <td className="px-4 py-2.5 text-center font-bold text-blue-700">
                  {r.prezzo != null ? `€${r.prezzo}` : <span className="text-gray-300 font-normal">—</span>}
                </td>
                <td className="px-4 py-2.5 text-center text-xs text-gray-400">{r.status ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-gray-900 rounded-xl p-4">
        <p className="text-xs text-gray-400 mb-2">JSON — clicca "Copia JSON" e incollalo a Claude</p>
        <pre className="text-xs text-green-400 overflow-auto max-h-64 whitespace-pre-wrap">{json}</pre>
      </div>
    </div>
  );
}
