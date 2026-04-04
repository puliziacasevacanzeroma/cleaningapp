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

// ── CDN URLs (Cloudflare = più affidabile di unpkg) ──
const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";

export default function CoordinatePage() {
  const [props, setProps] = useState<Prop[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "no" | "yes">("all");
  const [tempCoords, setTempCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapStatus, setMapStatus] = useState("Caricamento mappa...");

  const mapDiv = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  const layerGrp = useRef<any>(null);
  const tempMarker = useRef<any>(null);
  const initDone = useRef(false);

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
    if (initDone.current) return; // Prevent double init in React Strict Mode
    initDone.current = true;

    const el = mapDiv.current;
    if (!el) { setMapError("Container mappa non trovato"); return; }

    console.log("🗺️ [1] Inizio caricamento mappa...");
    setMapStatus("Caricamento CSS...");

    // 1. Load CSS
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
      console.log("🗺️ [2] CSS aggiunto");
    } else {
      console.log("🗺️ [2] CSS già presente");
    }

    setMapStatus("Caricamento Leaflet JS...");

    // 2. Load JS
    const tryInit = () => {
      const L = (window as any).L;
      if (!L) return false;
      console.log("🗺️ [3] Leaflet disponibile, versione:", L.version);
      setMapStatus("Creazione mappa...");

      try {
        // Check container dimensions
        const rect = el.getBoundingClientRect();
        console.log("🗺️ [4] Container dimensioni:", rect.width, "x", rect.height);

        if (rect.width === 0 || rect.height === 0) {
          console.warn("🗺️ Container ha dimensioni 0! Riprovo tra 500ms...");
          setTimeout(tryInit, 500);
          return false;
        }

        if (mapObj.current) {
          console.log("🗺️ Mappa già creata, skip");
          return true;
        }

        const map = L.map(el, { zoomControl: true }).setView([ROMA.lat, ROMA.lng], 13);
        console.log("🗺️ [5] L.map() creato");

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap", maxZoom: 19,
        }).addTo(map);
        console.log("🗺️ [6] TileLayer aggiunto");

        layerGrp.current = L.layerGroup().addTo(map);
        mapObj.current = map;

        map.on("click", (e: any) => setTempCoords({ lat: e.latlng.lat, lng: e.latlng.lng }));

        // Forza resize
        setTimeout(() => { map.invalidateSize(); console.log("🗺️ [7] invalidateSize 200ms"); }, 200);
        setTimeout(() => { map.invalidateSize(); console.log("🗺️ [8] invalidateSize 1s"); }, 1000);

        setMapStatus("");
        setMapError(null);
        console.log("🗺️ ✅ Mappa pronta!");
        return true;
      } catch (err) {
        console.error("🗺️ ❌ Errore creazione mappa:", err);
        setMapError(`Errore: ${err}`);
        return false;
      }
    };

    if ((window as any).L) {
      console.log("🗺️ Leaflet già in window.L");
      setTimeout(tryInit, 100);
    } else {
      // Check if script already exists
      const existingScript = document.querySelector(`script[src="${LEAFLET_JS}"]`) || document.querySelector('script[src*="leaflet"]');
      if (existingScript) {
        console.log("🗺️ Script Leaflet già nel DOM, aspetto...");
        const iv = setInterval(() => {
          if ((window as any).L) { clearInterval(iv); tryInit(); }
        }, 200);
        setTimeout(() => { clearInterval(iv); if (!(window as any).L) setMapError("Timeout caricamento Leaflet"); }, 15000);
      } else {
        console.log("🗺️ Carico Leaflet da CDN:", LEAFLET_JS);
        const s = document.createElement("script");
        s.src = LEAFLET_JS;
        s.onload = () => { console.log("🗺️ Script onload"); setTimeout(tryInit, 100); };
        s.onerror = (e) => { console.error("🗺️ Script error:", e); setMapError("Errore caricamento Leaflet da CDN"); };
        document.head.appendChild(s);
      }
    }

    return () => {
      // Don't destroy map on cleanup — it breaks React Strict Mode
    };
  }, []);

  // ── Render markers ──
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapObj.current || !layerGrp.current) return;
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
  }, [props, sel]);

  // ── Temp marker ──
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapObj.current) return;
    if (tempMarker.current) { try { mapObj.current.removeLayer(tempMarker.current); } catch {} tempMarker.current = null; }
    if (!tempCoords || !sel) return;

    tempMarker.current = L.marker([tempCoords.lat, tempCoords.lng], { draggable: true }).addTo(mapObj.current);
    tempMarker.current.bindTooltip("📍 Trascina", { permanent: true, direction: "top", offset: [0, -30] });
    tempMarker.current.on("dragend", (e: any) => setTempCoords({ lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng }));
  }, [tempCoords, sel]);

  // ── Centra ──
  useEffect(() => {
    if (!sel || !mapObj.current) return;
    const p = props.find(x => x.id === sel);
    if (p?.coordinates) mapObj.current.setView([p.coordinates.lat, p.coordinates.lng], 16, { animate: true });
  }, [sel]);

  // ── Actions ──
  const handleGeocode = async (id: string) => {
    const p = props.find(x => x.id === id);
    if (!p?.address) { flash("Nessun indirizzo"); return; }
    setBusy(id);
    try {
      const r = await geocodeAddress(p.address + ", Roma, RM, Italia");
      if (r?.coordinates && inRoma(r.coordinates.lat, r.coordinates.lng)) {
        setTempCoords(r.coordinates);
        mapObj.current?.setView([r.coordinates.lat, r.coordinates.lng], 17);
        flash("📍 Trovato — Verifica e Salva");
      } else { flash("⚠️ Non trovato — posiziona manualmente"); }
    } catch { flash("Errore geocoding"); }
    setBusy(null);
  };

  const handleSave = async (id: string) => {
    if (!tempCoords) { flash("Posiziona prima il pin"); return; }
    setBusy(id);
    try {
      await updateDoc(doc(db, "properties", id), {
        coordinates: { lat: tempCoords.lat, lng: tempCoords.lng },
        coordinatesVerified: true, coordinatesUpdatedAt: new Date(),
      });
      setTempCoords(null);
      flash("✅ Salvato!");
    } catch (e) { flash(`Errore: ${e instanceof Error ? e.message : "?"}`); }
    setBusy(null);
  };

  const list = props.filter(p => filter === "no" ? !p.coordinates : filter === "yes" ? !!p.coordinates : true);
  const nWith = props.filter(p => p.coordinates).length;
  const nNo = props.length - nWith;

  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full" /></div>;

  return (
    <>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
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

      {/* Split: lista + mappa */}
      <div style={{ display: "flex", height: "calc(100vh - 130px)", overflow: "hidden" }}>
        {/* Lista */}
        <div style={{ width: 340, minWidth: 340, borderRight: "1px solid #e2e8f0", overflowY: "auto", background: "white", flexShrink: 0 }}>
          {sel && (
            <div style={{ padding: 8, background: "#fffbeb", borderBottom: "1px solid #fde68a", fontSize: 11, color: "#92400e" }}>
              <b>Click sulla mappa</b> per posizionare — <b>trascina</b> il pin — poi <b>Salva</b>
            </div>
          )}
          {list.map(p => {
            const isSel = p.id === sel;
            return (
              <div key={p.id} onClick={() => { setSel(isSel ? null : p.id); setTempCoords(null); }}
                style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", cursor: "pointer",
                  background: isSel ? "#f5f3ff" : "white", borderLeft: isSel ? "4px solid #8b5cf6" : "4px solid transparent" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: p.coordinates ? (p.verified ? "#10b981" : "#3b82f6") : "#ef4444", color: "white", fontSize: 11, fontWeight: 700 }}>
                    {p.coordinates ? (p.verified ? "✓" : "?") : "✕"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.address}</div>
                  </div>
                </div>
                {isSel && (
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button onClick={(e) => { e.stopPropagation(); handleGeocode(p.id); }}
                      disabled={busy === p.id}
                      style={{ padding: "4px 10px", borderRadius: 8, border: "none", background: "#3b82f6", color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {busy === p.id ? "⏳" : "🔍 Geocoda"}
                    </button>
                    {tempCoords && (
                      <button onClick={(e) => { e.stopPropagation(); handleSave(p.id); }}
                        style={{ padding: "4px 10px", borderRadius: 8, border: "none", background: "#10b981", color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        💾 Salva
                      </button>
                    )}
                    <div style={{ width: "100%", fontSize: 10, color: "#7c3aed", marginTop: 2 }}>
                      {tempCoords ? `📍 ${tempCoords.lat.toFixed(5)}, ${tempCoords.lng.toFixed(5)}` : "Click sulla mappa →"}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Mappa */}
        <div style={{ flex: 1, position: "relative", minWidth: 0, background: "#f0f4f8" }}>
          <div ref={mapDiv} style={{ width: "100%", height: "100%", zIndex: 1 }} />
          {/* Overlay status/errore */}
          {(mapStatus || mapError) && (
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              background: "rgba(248,250,252,0.95)", pointerEvents: mapError ? "auto" : "none" }}>
              {!mapError && <div className="animate-spin" style={{ width: 32, height: 32, border: "4px solid #e2e8f0", borderTopColor: "#3b82f6", borderRadius: "50%", marginBottom: 12 }} />}
              <div style={{ fontSize: 14, color: mapError ? "#ef4444" : "#64748b", fontWeight: 600, textAlign: "center", padding: "0 20px" }}>
                {mapError || mapStatus}
              </div>
              {mapError && (
                <button onClick={() => window.location.reload()}
                  style={{ marginTop: 12, padding: "8px 20px", background: "#3b82f6", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  🔄 Ricarica pagina
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#1e293b", color: "white", padding: "10px 24px", borderRadius: 12,
          fontSize: 13, fontWeight: 700, zIndex: 9999, boxShadow: "0 8px 30px rgba(0,0,0,0.3)" }}>
          {toast}
        </div>
      )}
    </>
  );
}
