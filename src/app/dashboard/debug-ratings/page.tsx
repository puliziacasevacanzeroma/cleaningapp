"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, query, where, limit, doc, getDoc, addDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export default function DebugRatingsPage() {
  const [ratings, setRatings] = useState<any[]>([]);
  const [cleanings, setCleanings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiResult, setApiResult] = useState<any>(null);
  const [testResult, setTestResult] = useState<string>("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Carica ratings dalla collezione propertyRatings
      const ratingsSnap = await getDocs(collection(db, "propertyRatings"));
      const ratingsData = ratingsSnap.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null
      }));
      setRatings(ratingsData);

      // Carica pulizie completate con ratingScore
      const cleanSnap = await getDocs(query(
        collection(db, "cleanings"),
        where("status", "==", "COMPLETED"),
        limit(20)
      ));
      const cleanData = cleanSnap.docs.map(doc => ({ 
        id: doc.id, 
        propertyName: doc.data().propertyName,
        propertyId: doc.data().propertyId,
        ratingScore: doc.data().ratingScore,
        ratingId: doc.data().ratingId,
        status: doc.data().status,
        completedAt: doc.data().completedAt?.toDate?.()?.toISOString() || null
      }));
      setCleanings(cleanData);

    } catch (err) {
      console.error("Errore:", err);
      setTestResult("Errore: " + (err as any).message);
    }
    setLoading(false);
  }

  async function testApiGet(propertyId: string) {
    try {
      const res = await fetch(`/api/property-ratings?propertyId=${propertyId}&months=3`);
      const data = await res.json();
      setApiResult({ 
        endpoint: `GET /api/property-ratings?propertyId=${propertyId}`,
        status: res.status, 
        data 
      });
    } catch (err: any) {
      setApiResult({ error: err.message });
    }
  }

  async function testApiGetCleaning(cleaningId: string) {
    try {
      const res = await fetch(`/api/property-ratings?cleaningId=${cleaningId}`);
      const data = await res.json();
      setApiResult({ 
        endpoint: `GET /api/property-ratings?cleaningId=${cleaningId}`,
        status: res.status, 
        data 
      });
    } catch (err: any) {
      setApiResult({ error: err.message });
    }
  }

  async function createTestRating(propertyId: string, cleaningId: string, propertyName: string) {
    try {
      const testRating = {
        cleaningId,
        propertyId,
        propertyName,
        scores: {
          guestCleanliness: 4,
          checkoutPunctuality: 5,
          propertyCondition: 4,
          damages: 5,
          accessEase: 4,
        },
        notes: "Test rating creato da debug page",
        issues: [],
      };

      const res = await fetch("/api/property-ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testRating),
      });
      
      const data = await res.json();
      setTestResult(`✅ Rating creato! Response: ${JSON.stringify(data)}`);
      loadData(); // Ricarica
    } catch (err: any) {
      setTestResult(`❌ Errore: ${err.message}`);
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Caricamento...</div>;
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6 pb-24">
      <h1 className="text-2xl font-bold text-center">🔧 Debug Valutazioni</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <p className="text-3xl font-bold text-amber-600">{ratings.length}</p>
          <p className="text-sm text-slate-500">Ratings in propertyRatings</p>
        </div>
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <p className="text-3xl font-bold text-emerald-600">{cleanings.filter(c => c.ratingScore).length}</p>
          <p className="text-sm text-slate-500">Cleanings con ratingScore</p>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-800 break-all">{testResult}</p>
        </div>
      )}

      {/* API Result */}
      {apiResult && (
        <div className="bg-slate-50 border rounded-xl p-4">
          <p className="text-xs font-mono text-slate-600 mb-2">{apiResult.endpoint}</p>
          <p className="text-xs mb-2">Status: {apiResult.status}</p>
          <pre className="text-xs bg-white p-3 rounded overflow-auto max-h-60 border">
            {JSON.stringify(apiResult.data, null, 2)}
          </pre>
        </div>
      )}

      {/* Ratings nel DB */}
      <div className="bg-white p-4 rounded-xl border shadow-sm">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <span className="text-xl">⭐</span>
          Collezione propertyRatings ({ratings.length})
        </h2>
        {ratings.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center">Nessun rating trovato nella collezione propertyRatings</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-auto">
            {ratings.map(r => (
              <div key={r.id} className="text-xs bg-slate-50 p-3 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold">{r.propertyName || "N/A"}</p>
                    <p className="text-slate-500">CleaningID: {r.cleaningId?.slice(0,12)}...</p>
                    <p className="text-slate-500">PropertyID: {r.propertyId?.slice(0,12)}...</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-amber-600">⭐ {r.averageScore || "N/A"}</p>
                    <p className="text-slate-400">{r.createdAt?.slice(0,10)}</p>
                  </div>
                </div>
                <button 
                  onClick={() => testApiGet(r.propertyId)}
                  className="mt-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded"
                >
                  Test API Property
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cleanings completate */}
      <div className="bg-white p-4 rounded-xl border shadow-sm">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <span className="text-xl">🧹</span>
          Pulizie Completate (ultime 20)
        </h2>
        <div className="space-y-2 max-h-80 overflow-auto">
          {cleanings.map(c => (
            <div key={c.id} className={`text-xs p-3 rounded-lg ${c.ratingScore ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold">{c.propertyName || "N/A"}</p>
                  <p className="text-slate-500">ID: {c.id?.slice(0,12)}...</p>
                </div>
                <div className="text-right">
                  {c.ratingScore ? (
                    <p className="font-bold text-emerald-600">⭐ {c.ratingScore}</p>
                  ) : (
                    <p className="text-rose-500">❌ No rating</p>
                  )}
                  <p className="text-slate-400">{c.completedAt?.slice(0,10)}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button 
                  onClick={() => testApiGetCleaning(c.id)}
                  className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded"
                >
                  Test API Cleaning
                </button>
                {!c.ratingScore && (
                  <button 
                    onClick={() => createTestRating(c.propertyId, c.id, c.propertyName)}
                    className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded"
                  >
                    + Crea Test Rating
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Refresh */}
      <button 
        onClick={loadData}
        className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold"
      >
        🔄 Ricarica Dati
      </button>
    </div>
  );
}
