'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/lib/firebase/AuthContext';
import { useRouter } from 'next/navigation';

export default function AnalisiPrezziPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') {
      router.replace('/dashboard');
      return;
    }
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
      }).sort((a, b) => (a.prezzo ?? 0) - (b.prezzo ?? 0));
      setData(rows);
      setLoading(false);
    });
  }, [user]);

  if (loading) return <div className="p-8 text-gray-500">Caricamento...</div>;

  const json = JSON.stringify(data, null, 2);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-2">Analisi Prezzi Proprietà (temp)</h1>
      <p className="text-xs text-red-500 mb-4">⚠️ Pagina temporanea — eliminarla dopo l'uso</p>

      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-3 py-2 text-left">Nome</th>
            <th className="border px-3 py-2">Mq</th>
            <th className="border px-3 py-2">Camere</th>
            <th className="border px-3 py-2">Bagni</th>
            <th className="border px-3 py-2">Ospiti</th>
            <th className="border px-3 py-2">€ Pulizia</th>
            <th className="border px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.map(r => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="border px-3 py-1.5 font-medium">{r.nome}</td>
              <td className="border px-3 py-1.5 text-center">{r.mq ?? '—'}</td>
              <td className="border px-3 py-1.5 text-center">{r.camere ?? '—'}</td>
              <td className="border px-3 py-1.5 text-center">{r.bagni ?? '—'}</td>
              <td className="border px-3 py-1.5 text-center">{r.ospiti ?? '—'}</td>
              <td className="border px-3 py-1.5 text-center font-bold text-blue-700">
                {r.prezzo != null ? `€${r.prezzo}` : '—'}
              </td>
              <td className="border px-3 py-1.5 text-center text-xs">{r.status ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <details>
        <summary className="cursor-pointer text-sm text-gray-500 mb-2">JSON grezzo (copia e incolla a Claude)</summary>
        <textarea
          className="w-full h-64 text-xs font-mono border rounded p-2"
          readOnly
          value={json}
          onClick={e => (e.target as HTMLTextAreaElement).select()}
        />
      </details>
    </div>
  );
}
