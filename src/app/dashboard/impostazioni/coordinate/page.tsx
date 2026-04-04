"use client";

import { useState, useEffect, useRef } from "react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { geocodeAddress } from "~/lib/geo";

interface Prop {
  id: string;
  name: string;
  address: string;
  coordinates?: { lat: number; lng: number };
  verified?: boolean;
}

const ROMA = { lat: 41.9028, lng: 12.4964 };
const inRoma = (lat: number, lng: number) =>
  lat >= 41.65 && lat <= 42.05 && lng >= 12.20 && lng <= 12.85;

export default function CoordinatePage() {
  const [props, setProps] = useState<Prop[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "no" | "yes">("all");
  const [tempCoords, setTempCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const mapDiv = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  const layerGrp = useRef<any>(null);
  const tempMarker = useRef<any>(null);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  // ── Load properties ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "properties"), (snap) => {
      setProps(snap.docs.map(d => {
        const p = d.data() as Record<string, any>;
        return {
          id: d.id, name: p.name || "", address: p.address || "",
          coordinates: p.coordinates?.lat && p.coordinates?.lng ? { lat: p.coordinates.lat, lng: p.coordinates.lng } : undefined,
          verified: !!p.coordinatesVerified,
        };
      }).sort((a, b) => {
        if (!a.coordinates && b.coordinates) return -1;
        if (a.coordinates && !b.coordinates) return 1;
        return a.name.localeCompare(b.name);
      }));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Init map ──
  useEffect(() => {
    const el = mapDiv.current;
    if (!el) return;
    let map: any = null;

    // Ensure CSS loaded
    if (!document.querySelector('link[href*="leaflet"]')) {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(l);
    }

    const create = () => {
      const L = (window as any).L;
      if (!L || !el || map) return;
      try {
        map = L.map(el).setView([ROMA.lat, ROMA.lng], 13);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OSM", maxZoom: 19,
        }).addTo(map);
        layerGrp.current = L.layerGroup().addTo(map);
        mapObj.current = map;
        map.on("click", (e: any) => setTempCoords({ lat: e.latlng.lat, lng: e.latlng.lng }));
        // Forza resize
        setTimeout(() => map?.invalidateSize(), 100);
        setTimeout(() => map?.invalidateSize(), 500);
        setTimeout(() => map?.invalidateSize(), 1500);
        setMapReady(true);
      } catch (err) {
        console.error("Leaflet init error:", err);
      }
    };

    if ((window as any).L) {
      // Leaflet già caricato (dalla pagina assegnazioni)
      setTimeout(create, 50);
    } else if (!document.querySelector('script[src*="leaflet"]')) {
      // Mai caricato — carica lo script
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = () => setTimeout(create, 50);
      s.onerror = () => console.error("Leaflet script load failed");
      document.head.appendChild(s);
    } else {
      // Script esiste ma L non ancora disponibile — aspetta
      const iv = setInterval(() => {
        if ((window as any).L) { clearInterval(iv); create(); }
      }, 100);
      setTimeout(() => clearInterval(iv), 10000); // timeout 10s
    }

    return () => {
      if (map) { try { map.remove(); } catch {} }
      mapObj.current = null;
      layerGrp.current = null;
    };
  }, []);

  // ── Render markers ──
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapObj.current || !layerGrp.current || !mapReady) return;
    layerGrp.current.clearLayers();

    props.forEach(p => {
      if (!p.coordinates) return;
      const isSel = p.id === sel;
      const cm = L.circleMarker([p.coordinates.lat, p.coordinates.lng], {
        radius: isSel ? 14 : 9,
        fillColor: p.verified ? "#10b981" : "#3b82f6",
        color: isSel ? "#f59e0b" : "#fff",
        weight: isSel ? 4 : 2,
        fillOpacity: 0.9,
      }).addTo(layerGrp.current);
      cm.bindTooltip(`<b>${p.name}</b><br>${p.address}`, { direction: "top", offset: [0, -10] });
      cm.on("click", () => setSel(p.id));
    });
  }, [props, sel, mapReady]);

  // ── Temp marker (draggable) ──
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapObj.current) return;
    if (tempMarker.current) { mapObj.current.removeLayer(tempMarker.current); tempMarker.current = null; }
    if (!tempCoords || !sel) return;

    tempMarker.current = L.marker([tempCoords.lat, tempCoords.lng], { draggable: true }).addTo(mapObj.current);
    tempMarker.current.bindTooltip("📍 Trascina per spostare", { permanent: true, direction: "top", offset: [0, -30] });
    tempMarker.current.on("dragend", (e: any) => setTempCoords({ lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng }));
  }, [tempCoords, sel]);

  // ── Centra su selezione ──
  useEffect(() => {
    if (!sel || !mapObj.current) return;
    const p = props.find(x => x.id === sel);
    if (p?.coordinates) mapObj.current.setView([p.coordinates.lat, p.coordinates.lng], 16, { animate: true });
  }, [sel]);

  // ── Geocoda ──
  const handleGeocode = async (id: string) => {
    const p = props.find(x => x.id === id);
    if (!p?.address) { flash("Nessun indirizzo"); return; }
    setBusy(id);
    try {
      const r = await geocodeAddress(p.address + ", Roma, RM, Italia");
      if (r?.coordinates && inRoma(r.coordinates.lat, r.coordinates.lng)) {
        setTempCoords({ lat: r.coordinates.lat, lng: r.coordinates.lng });
        mapObj.current?.setView([r.coordinates.lat, r.coordinates.lng], 17);
        flash(`📍 Trovato — Verifica la posizione e Salva`);
      } else {
        flash("⚠️ Non trovato — posiziona manualmente");
      }
    } catch { flash("Errore geocoding"); }
    setBusy(null);
  };

  // ── Salva ──
  const handleSave = async (id: string) => {
    if (!tempCoords) { flash("Posiziona prima il pin"); return; }
    setBusy(id);
    try {
      await updateDoc(doc(db, "properties", id), {
        coordinates: { lat: tempCoords.lat, lng: tempCoords.lng },
        coordinatesVerified: true,
        coordinatesUpdatedAt: new Date(),
      });
      setTempCoords(null);
      flash("✅ Coordinate salvate!");
    } catch (e) { flash(`Errore: ${e instanceof Error ? e.message : "?"}`); }
    setBusy(null);
  };

  const list = props.filter(p => filter === "no" ? !p.coordinates : filter === "yes" ? !!p.coordinates : true);
  const nWith = props.filter(p => p.coordinates).length;
  const nNo = props.length - nWith;

  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full" /></div>;

  // Altezza mappa = viewport - header dashboard (~64px) - header pagina (~56px)
  const mapHeight = "calc(100vh - 130px)";

  return (
    <>
      {/* Header pagina */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-base font-bold text-slate-800">📍 Coordinate Proprietà</h1>
          <p className="text-[11px] text-slate-400">{nWith}/{props.length} posizionate · <span className={nNo > 0 ? "text-red-500 font-bold" : "text-emerald-500"}>{nNo} da fare</span></p>
        </div>
        <div className="flex gap-1.5">
          {([["all", `Tutte (${props.length})`], ["no", `❌ Senza (${nNo})`], ["yes", `✅ Con (${nWith})`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k as any)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${filter === k ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content: split lista + mappa */}
      <div className="flex" style={{ height: mapHeight }}>
        {/* Lista */}
        <div className="w-80 min-w-[320px] border-r border-slate-200 bg-white overflow-y-auto flex-shrink-0">
          {sel && (
            <div className="p-2.5 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-700">
              <b>Click sulla mappa</b> per posizionare — <b>trascina</b> il pin — poi <b>Salva</b>
            </div>
          )}
          {list.map(p => {
            const isSel = p.id === sel;
            return (
              <div key={p.id} onClick={() => { setSel(isSel ? null : p.id); setTempCoords(null); }}
                className={`px-3 py-2.5 border-b border-slate-100 cursor-pointer transition-all ${
                  isSel ? "bg-violet-50 border-l-4 border-l-violet-500" : "hover:bg-slate-50"
                }`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 ${
                    p.coordinates ? (p.verified ? "bg-emerald-500" : "bg-blue-500") : "bg-red-400"
                  }`}>
                    {p.coordinates ? (p.verified ? "✓" : "?") : "✕"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[13px] text-slate-800 truncate">{p.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">{p.address}</div>
                    {p.coordinates && <div className="text-[10px] text-emerald-600">{p.coordinates.lat.toFixed(4)}, {p.coordinates.lng.toFixed(4)}{p.verified ? " ✓" : ""}</div>}
                    {!p.coordinates && <div className="text-[10px] text-red-500 font-bold">Senza coordinate</div>}
                  </div>
                </div>
                {isSel && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <button onClick={(e) => { e.stopPropagation(); handleGeocode(p.id); }}
                      disabled={busy === p.id}
                      className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-[11px] font-bold disabled:opacity-50">
                      {busy === p.id ? "⏳" : "🔍 Geocoda"}
                    </button>
                    {tempCoords && (
                      <button onClick={(e) => { e.stopPropagation(); handleSave(p.id); }}
                        disabled={busy === p.id}
                        className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-[11px] font-bold disabled:opacity-50">
                        💾 Salva
                      </button>
                    )}
                    <div className="w-full text-[10px] text-slate-400">
                      {tempCoords ? `📍 ${tempCoords.lat.toFixed(5)}, ${tempCoords.lng.toFixed(5)}` : "Click mappa per posizionare"}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Mappa — altezza fissa, position relative per il div absolute interno */}
        <div className="flex-1" style={{ position: "relative", minWidth: 0 }}>
          <div ref={mapDiv} style={{ position: "absolute", inset: 0, zIndex: 1 }} />
          {!mapReady && (
            <div style={{ position: "absolute", inset: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
              <div className="animate-spin w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full" />
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-2xl z-[9999]">
          {toast}
        </div>
      )}
    </>
  );
}
