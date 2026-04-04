"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { geocodeAddress } from "~/lib/geo";

interface Property {
  id: string;
  name: string;
  address: string;
  city?: string;
  postalCode?: string;
  coordinates?: { lat: number; lng: number };
  coordinatesVerified?: boolean;
}

export default function CoordinatePage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<"tutte" | "con" | "senza">("tutte");

  const mapRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const tempMarkerRef = useRef<any>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── Carica proprietà ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "properties"), (snap) => {
      const data = snap.docs.map(d => {
        const p = d.data() as Record<string, any>;
        return {
          id: d.id,
          name: p.name || "Senza nome",
          address: p.address || "",
          city: p.city || "",
          postalCode: p.postalCode || "",
          coordinates: p.coordinates?.lat && p.coordinates?.lng
            ? { lat: p.coordinates.lat, lng: p.coordinates.lng }
            : undefined,
          coordinatesVerified: p.coordinatesVerified || false,
        };
      });
      data.sort((a, b) => {
        if (a.coordinates && !b.coordinates) return 1;
        if (!a.coordinates && b.coordinates) return -1;
        return a.name.localeCompare(b.name);
      });
      setProperties(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Inizializza mappa ──
  useEffect(() => {
    if (!mapRef.current) return;

    // CSS
    if (!document.getElementById("lf-css-coord")) {
      const link = document.createElement("link");
      link.id = "lf-css-coord"; link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const init = async () => {
      if (!(window as any).L) {
        await new Promise<void>((resolve) => {
          if (document.getElementById("lf-js-coord")) {
            const iv = setInterval(() => { if ((window as any).L) { clearInterval(iv); resolve(); } }, 50);
          } else {
            const s = document.createElement("script");
            s.id = "lf-js-coord"; s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
            s.onload = () => resolve();
            document.head.appendChild(s);
          }
        });
      }

      const L = (window as any).L;
      if (mapObjRef.current) return;

      const map = L.map(mapRef.current!).setView([41.9028, 12.4964], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap", maxZoom: 19,
      }).addTo(map);
      mapObjRef.current = map;

      // Click sulla mappa → posiziona pin temporaneo per la proprietà selezionata
      map.on("click", (e: any) => {
        if (!selected) return;
        const { lat, lng } = e.latlng;
        if (tempMarkerRef.current) map.removeLayer(tempMarkerRef.current);
        tempMarkerRef.current = L.circleMarker([lat, lng], {
          radius: 14, fillColor: "#f59e0b", color: "#fff", weight: 3, fillOpacity: 0.9,
        }).addTo(map);
        tempMarkerRef.current.bindTooltip("Nuova posizione — Salva per confermare", {
          permanent: true, direction: "top", offset: [0, -16],
          className: "coord-tooltip",
        });

        // Aggiorna stato locale
        setProperties(prev => prev.map(p =>
          p.id === selected ? { ...p, coordinates: { lat, lng } } : p
        ));
      });
    };

    init();
    return () => { if (mapObjRef.current) { mapObjRef.current.remove(); mapObjRef.current = null; } };
  }, []);

  // ── Aggiorna markers quando cambiano proprietà ──
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapObjRef.current) return;
    const map = mapObjRef.current;

    // Rimuovi vecchi markers
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current.clear();

    properties.forEach(p => {
      if (!p.coordinates) return;
      const isSelected = p.id === selected;
      const isVerified = p.coordinatesVerified;

      const cm = L.circleMarker([p.coordinates.lat, p.coordinates.lng], {
        radius: isSelected ? 16 : 10,
        fillColor: isVerified ? "#10b981" : "#3b82f6",
        color: isSelected ? "#f59e0b" : "#ffffff",
        weight: isSelected ? 4 : 2,
        fillOpacity: 0.9,
      }).addTo(map);

      cm.bindTooltip(`<b>${p.name}</b><br>${p.address}`, { direction: "top", offset: [0, -12] });
      cm.on("click", () => setSelected(p.id));

      markersRef.current.set(p.id, cm);
    });
  }, [properties, selected]);

  // ── Centra mappa sulla proprietà selezionata ──
  useEffect(() => {
    if (!selected || !mapObjRef.current) return;
    const prop = properties.find(p => p.id === selected);
    if (prop?.coordinates) {
      mapObjRef.current.setView([prop.coordinates.lat, prop.coordinates.lng], 16, { animate: true });
    }
  }, [selected]);

  // ── Salva coordinate ──
  const handleSave = async (propId: string) => {
    const prop = properties.find(p => p.id === propId);
    if (!prop?.coordinates) return;

    setSaving(propId);
    try {
      await updateDoc(doc(db, "properties", propId), {
        coordinates: { lat: prop.coordinates.lat, lng: prop.coordinates.lng },
        coordinatesVerified: true,
        coordinatesUpdatedAt: new Date(),
      });
      showToast(`✅ ${prop.name} — coordinate salvate`);
      if (tempMarkerRef.current && mapObjRef.current) {
        mapObjRef.current.removeLayer(tempMarkerRef.current);
        tempMarkerRef.current = null;
      }
    } catch (e) {
      showToast(`❌ Errore: ${e instanceof Error ? e.message : "Errore"}`);
    } finally {
      setSaving(null);
    }
  };

  // ── Geocoda indirizzo ──
  const handleGeocode = async (propId: string) => {
    const prop = properties.find(p => p.id === propId);
    if (!prop?.address) { showToast("⚠️ Nessun indirizzo"); return; }

    setGeocoding(propId);
    try {
      const query = `${prop.address}${prop.city ? `, ${prop.city}` : ", Roma"}, Italia`;
      const result = await geocodeAddress(query);

      if (result?.coordinates) {
        const { lat, lng } = result.coordinates;
        // Validazione Roma
        if (lat < 41.65 || lat > 42.05 || lng < 12.20 || lng > 12.85) {
          showToast(`⚠️ Risultato fuori Roma (${lat.toFixed(3)}, ${lng.toFixed(3)}) — posiziona manualmente`);
          setGeocoding(null);
          return;
        }

        setProperties(prev => prev.map(p =>
          p.id === propId ? { ...p, coordinates: { lat, lng } } : p
        ));

        if (mapObjRef.current) {
          mapObjRef.current.setView([lat, lng], 17, { animate: true });
        }

        showToast(`📍 ${prop.name} → ${lat.toFixed(4)}, ${lng.toFixed(4)} (${result.confidence}) — Verifica e salva`);
      } else {
        showToast(`⚠️ Geocoding fallito per "${prop.address}"`);
      }
    } catch (e) {
      showToast(`❌ Errore geocoding: ${e instanceof Error ? e.message : "Errore"}`);
    } finally {
      setGeocoding(null);
    }
  };

  // ── Rimuovi coordinate ──
  const handleRemove = async (propId: string) => {
    if (!confirm("Rimuovere le coordinate?")) return;
    try {
      await updateDoc(doc(db, "properties", propId), {
        coordinates: null,
        coordinatesVerified: false,
      });
      showToast("Coordinate rimosse");
    } catch (e) {
      showToast(`Errore: ${e instanceof Error ? e.message : "Errore"}`);
    }
  };

  // ── Filtro ──
  const filtered = properties.filter(p => {
    if (filter === "con") return !!p.coordinates;
    if (filter === "senza") return !p.coordinates;
    return true;
  });

  const withCoords = properties.filter(p => p.coordinates).length;
  const verified = properties.filter(p => p.coordinatesVerified).length;

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-40">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-800">📍 Gestione Coordinate Proprietà</h1>
            <p className="text-xs text-slate-400">
              {withCoords}/{properties.length} con coordinate · {verified} verificate ·
              {properties.length - withCoords > 0 && <span className="text-red-500 font-bold"> {properties.length - withCoords} da posizionare</span>}
            </p>
          </div>
          <div className="flex gap-2">
            {(["tutte", "senza", "con"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === f ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                {f === "tutte" ? `Tutte (${properties.length})` : f === "senza" ? `❌ Senza (${properties.length - withCoords})` : `✅ Con (${withCoords})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex" style={{ height: "calc(100vh - 140px)", minHeight: "500px" }}>
        {/* Lista proprietà */}
        <div className="w-96 min-w-[384px] border-r border-slate-200 bg-white overflow-y-auto flex-shrink-0">
          {selected && (
            <div className="p-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-700">
              <b>Modalità posizionamento:</b> clicca sulla mappa per piazzare il pin di &quot;{properties.find(p => p.id === selected)?.name}&quot;
            </div>
          )}
          {filtered.map(p => {
            const isSel = p.id === selected;
            return (
              <div key={p.id}
                onClick={() => setSelected(isSel ? null : p.id)}
                className={`p-3 border-b border-slate-100 cursor-pointer transition-all ${
                  isSel ? "bg-violet-50 ring-2 ring-violet-400 ring-inset" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                    p.coordinates ? (p.coordinatesVerified ? "bg-emerald-500" : "bg-blue-500") : "bg-red-400"
                  }`}>
                    {p.coordinates ? (p.coordinatesVerified ? "✓" : "?") : "✕"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-slate-800 truncate">{p.name}</div>
                    <div className="text-xs text-slate-400 truncate">{p.address}</div>
                    {p.coordinates ? (
                      <div className="text-[10px] text-emerald-600 mt-1">
                        {p.coordinates.lat.toFixed(5)}, {p.coordinates.lng.toFixed(5)}
                        {p.coordinatesVerified && " ✓ verificata"}
                      </div>
                    ) : (
                      <div className="text-[10px] text-red-500 font-bold mt-1">Nessuna coordinata</div>
                    )}
                  </div>
                </div>

                {/* Azioni */}
                {isSel && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <button onClick={(e) => { e.stopPropagation(); handleGeocode(p.id); }}
                      disabled={geocoding === p.id}
                      className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                      {geocoding === p.id ? "⏳ Cerco..." : "🔍 Geocoda"}
                    </button>
                    {p.coordinates && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); handleSave(p.id); }}
                          disabled={saving === p.id}
                          className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                          {saving === p.id ? "⏳..." : "💾 Salva"}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleRemove(p.id); }}
                          className="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs font-bold">
                          🗑 Rimuovi
                        </button>
                      </>
                    )}
                    <div className="w-full text-[10px] text-slate-400 mt-1">
                      💡 Clicca sulla mappa per posizionare manualmente
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">
              Nessuna proprietà {filter === "senza" ? "senza coordinate" : filter === "con" ? "con coordinate" : ""}
            </div>
          )}
        </div>

        {/* Mappa */}
        <div className="flex-1 relative" style={{ minHeight: "500px" }}>
          <div ref={mapRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
          <style>{`
            .coord-tooltip { font-family: system-ui !important; font-size: 11px !important; font-weight: 600 !important; }
          `}</style>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-2xl z-[9999]">
          {toast}
        </div>
      )}
    </div>
  );
}
