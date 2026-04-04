"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { geocodeAddress } from "~/lib/geo";

interface Prop {
  id: string;
  name: string;
  address: string;
  coordinates?: { lat: number; lng: number };
  verified?: boolean;
  floor?: string;
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
  photo?: string; // images.building o images.door
}

const ROMA = { lat: 41.9028, lng: 12.4964 };
const inRoma = (lat: number, lng: number) =>
  lat >= 41.65 && lat <= 42.05 && lng >= 12.20 && lng <= 12.85;

const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";

// ── Tile layers disponibili ──
const TILE_LAYERS = {
  positron: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    label: "Pulita",
    icon: "🗺️",
    attr: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CARTO</a>',
    filter: "saturate(1.5) contrast(1.25) brightness(0.92)",
  },
  positronNoLabels: {
    url: "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
    label: "Minimal",
    icon: "◻️",
    attr: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CARTO</a>',
    filter: "saturate(1.25) contrast(1.08) brightness(0.97)",
  },
  voyager: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    label: "Colori",
    icon: "🎨",
    attr: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CARTO</a>',
    filter: "saturate(1.15) contrast(1.05)",
  },
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    label: "Classica",
    icon: "🌍",
    attr: "© OpenStreetMap",
    filter: "saturate(1.1) contrast(1.03)",
  },
} as const;

type TileKey = keyof typeof TILE_LAYERS;

function loadLeaflet(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!document.querySelector('link[href*="leaflet"]')) {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = LEAFLET_CSS;
      document.head.appendChild(l);
    }
    if ((window as any).L) return resolve((window as any).L);
    const existing = document.querySelector('script[src*="leaflet"]');
    if (existing) {
      const iv = setInterval(() => {
        if ((window as any).L) { clearInterval(iv); resolve((window as any).L); }
      }, 100);
      setTimeout(() => { clearInterval(iv); reject("Timeout"); }, 15000);
    } else {
      const s = document.createElement("script");
      s.src = LEAFLET_JS;
      s.onload = () => {
        const iv = setInterval(() => {
          if ((window as any).L) { clearInterval(iv); resolve((window as any).L); }
        }, 50);
        setTimeout(() => { clearInterval(iv); reject("Timeout after load"); }, 5000);
      };
      s.onerror = () => reject("Script load error");
      document.head.appendChild(s);
    }
  });
}

export default function CoordinatePage() {
  const [props, setProps] = useState<Prop[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "no" | "yes">("all");
  const [tempCoords, setTempCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapStatus, setMapStatus] = useState("Inizializzazione...");
  const [tileKey, setTileKey] = useState<TileKey>("positron");

  const mapObj = useRef<any>(null);
  const layerGrp = useRef<any>(null);
  const tempMarker = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  // ── Load properties ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "properties"), (snap) => {
      setProps(snap.docs.map(d => {
        const p = d.data() as Record<string, any>;
        return {
          id: d.id, name: p.name || "", address: p.address || "",
          coordinates: p.coordinates?.lat && p.coordinates?.lng
            ? { lat: p.coordinates.lat, lng: p.coordinates.lng } : undefined,
          verified: !!p.coordinatesVerified,
          floor: p.floor || undefined,
          bedrooms: p.bedrooms || undefined,
          bathrooms: p.bathrooms || undefined,
          maxGuests: p.maxGuests || undefined,
          photo: p.images?.building || p.images?.door || undefined,
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

  // ── Callback ref per il container mappa ──
  const mapContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node || mapObj.current) return;

    console.log("🗺️ Container montato, dimensioni:", node.offsetWidth, "x", node.offsetHeight);
    setMapStatus("Caricamento Leaflet...");

    loadLeaflet().then(L => {
      console.log("🗺️ Leaflet caricato v" + L.version);
      setMapStatus("Creazione mappa...");

      const tryCreate = () => {
        if (node.offsetWidth === 0 || node.offsetHeight === 0) {
          console.log("🗺️ Container ancora 0x0, riprovo...");
          setTimeout(tryCreate, 200);
          return;
        }

        try {
          const map = L.map(node, {
            zoomControl: false,
          }).setView([ROMA.lat, ROMA.lng], 13);

          // Zoom control in alto a destra
          L.control.zoom({ position: "topright" }).addTo(map);

          // Tile layer iniziale: CartoDB Positron (pulito, digitale)
          const tile = TILE_LAYERS.positron;
          tileLayerRef.current = L.tileLayer(tile.url, {
            attribution: tile.attr,
            maxZoom: 19,
          }).addTo(map);

          // Filtro CSS iniziale per più contrasto/saturazione
          const pane = map.getPane("tilePane");
          if (pane) pane.style.filter = tile.filter;

          layerGrp.current = L.layerGroup().addTo(map);
          mapObj.current = map;

          map.on("click", (e: any) => setTempCoords({ lat: e.latlng.lat, lng: e.latlng.lng }));

          setTimeout(() => map.invalidateSize(), 300);
          setTimeout(() => map.invalidateSize(), 1000);

          setMapStatus("");
          console.log("🗺️ ✅ Mappa creata!");
        } catch (err) {
          console.error("🗺️ Errore:", err);
          setMapStatus("Errore creazione mappa");
        }
      };

      setTimeout(tryCreate, 100);
    }).catch(err => {
      console.error("🗺️ Leaflet load failed:", err);
      setMapStatus("Errore caricamento libreria mappa");
    });
  }, []);

  // ── Cambio tile layer ──
  useEffect(() => {
    if (!mapObj.current || !tileLayerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    mapObj.current.removeLayer(tileLayerRef.current);
    const tile = TILE_LAYERS[tileKey];
    tileLayerRef.current = L.tileLayer(tile.url, {
      attribution: tile.attr,
      maxZoom: 19,
    }).addTo(mapObj.current);

    // Applica filtro CSS ai tile per più contrasto/saturazione
    const pane = mapObj.current.getPane("tilePane");
    if (pane) pane.style.filter = tile.filter;
  }, [tileKey]);

  // ── Render markers ──
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapObj.current || !layerGrp.current) return;
    layerGrp.current.clearLayers();

    props.forEach(p => {
      if (!p.coordinates) return;
      const isSel = p.id === sel;

      const markerColor = p.verified ? "#10b981" : "#3b82f6";
      const borderColor = isSel ? "#f59e0b" : "#ffffff";
      const size = isSel ? 18 : 12;
      const borderW = isSel ? 3 : 2;

      const icon = L.divIcon({
        className: "",
        iconSize: [size * 2, size * 2],
        iconAnchor: [size, size],
        html: `<div style="
          width:${size * 2}px;height:${size * 2}px;
          border-radius:50%;
          background:${markerColor};
          border:${borderW}px solid ${borderColor};
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
          ${isSel ? 'animation:pulse-marker 1.5s ease infinite;' : ''}
          cursor:pointer;
          transition:all 0.2s;
        "><span style="color:white;font-size:${isSel ? 11 : 8}px;font-weight:800;">${p.verified ? '✓' : '?'}</span></div>`,
      });

      const marker = L.marker([p.coordinates.lat, p.coordinates.lng], { icon }).addTo(layerGrp.current);

      // Tooltip ricco con foto, piano, letti, bagni
      const photoHtml = p.photo
        ? `<img src="${p.photo}" style="width:100%;height:80px;object-fit:cover;border-radius:6px 6px 0 0;display:block;" onerror="this.style.display='none'" />`
        : "";
      const detailParts: string[] = [];
      if (p.floor) detailParts.push(`🏢 Piano ${p.floor}`);
      if (p.bedrooms) detailParts.push(`🛏️ ${p.bedrooms} ${p.bedrooms === 1 ? "camera" : "camere"}`);
      if (p.bathrooms) detailParts.push(`🚿 ${p.bathrooms} ${p.bathrooms === 1 ? "bagno" : "bagni"}`);
      if (p.maxGuests) detailParts.push(`👥 Max ${p.maxGuests}`);
      const detailsHtml = detailParts.length > 0
        ? `<div style="display:flex;flex-wrap:wrap;gap:6px 10px;margin-top:4px;">${detailParts.map(d => `<span style="font-size:10px;color:#475569;white-space:nowrap;">${d}</span>`).join("")}</div>`
        : "";

      marker.bindTooltip(
        `<div style="min-width:160px;max-width:220px;">${photoHtml}<div style="padding:${p.photo ? "6px 8px 8px" : "4px 6px"};">`
        + `<div style="font-size:12px;font-weight:700;color:#1e293b;line-height:1.3;">${p.name}</div>`
        + `<div style="font-size:10px;color:#64748b;margin-top:1px;">${p.address}</div>`
        + `${detailsHtml}</div></div>`,
        { direction: "top", offset: [0, -size - 4], className: "rich-tooltip" }
      );
      marker.on("click", () => setSel(p.id));
    });
  }, [props, sel]);

  // ── Temp marker ──
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapObj.current) return;
    if (tempMarker.current) { try { mapObj.current.removeLayer(tempMarker.current); } catch {} tempMarker.current = null; }
    if (!tempCoords || !sel) return;

    const pinIcon = L.divIcon({
      className: "",
      iconSize: [32, 42],
      iconAnchor: [16, 42],
      html: `<div style="position:relative;">
        <svg width="32" height="42" viewBox="0 0 32 42">
          <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 26 16 26s16-14 16-26C32 7.16 24.84 0 16 0z" fill="#ef4444"/>
          <circle cx="16" cy="16" r="7" fill="white"/>
          <circle cx="16" cy="16" r="4" fill="#ef4444"/>
        </svg>
      </div>`,
    });

    tempMarker.current = L.marker([tempCoords.lat, tempCoords.lng], { draggable: true, icon: pinIcon }).addTo(mapObj.current);
    tempMarker.current.bindTooltip("📍 Trascina per posizionare", { permanent: true, direction: "top", offset: [0, -44], className: "clean-tooltip" });
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
      {/* Stili globali per tooltip e animazioni */}
      <style>{`
        .clean-tooltip {
          background: white !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 8px !important;
          padding: 6px 10px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
        }
        .clean-tooltip::before {
          border-top-color: white !important;
        }
        .rich-tooltip {
          background: white !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 10px !important;
          padding: 0 !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important;
          overflow: hidden !important;
        }
        .rich-tooltip::before {
          border-top-color: white !important;
        }
        .leaflet-control-attribution {
          font-size: 9px !important;
          background: rgba(255,255,255,0.7) !important;
        }
        @keyframes pulse-marker {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
        <div>
          <h1 className="text-base font-bold text-slate-800">📍 Coordinate Proprietà</h1>
          <p className="text-[11px] text-slate-400">{nWith}/{props.length} posizionate · <span className={nNo > 0 ? "text-red-500 font-bold" : "text-emerald-500"}>{nNo} da fare</span></p>
        </div>
        <div className="flex gap-1.5">
          {([["all", `Tutte (${props.length})`], ["no", `❌ Senza (${nNo})`], ["yes", `✅ Con (${nWith})`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k as any)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${filter === k ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
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
            <div style={{ padding: "8px 12px", background: "#fffbeb", borderBottom: "1px solid #fde68a", fontSize: 11, color: "#92400e", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14 }}>💡</span>
              <span><b>Click sulla mappa</b> per posizionare — <b>trascina</b> il pin — poi <b>Salva</b></span>
            </div>
          )}
          {list.map(p => {
            const isSel = p.id === sel;
            return (
              <div key={p.id} onClick={() => { setSel(isSel ? null : p.id); setTempCoords(null); }}
                style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", cursor: "pointer",
                  background: isSel ? "#f5f3ff" : "white", borderLeft: isSel ? "4px solid #8b5cf6" : "4px solid transparent",
                  transition: "all 0.15s" }}>
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
                      style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#3b82f6", color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "opacity 0.15s" }}>
                      {busy === p.id ? "⏳" : "🔍 Geocoda"}
                    </button>
                    {tempCoords && (
                      <button onClick={(e) => { e.stopPropagation(); handleSave(p.id); }}
                        style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#10b981", color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "opacity 0.15s" }}>
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
          <div ref={mapContainerRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }} />

          {/* Tile layer switcher — in basso a sinistra sopra la mappa */}
          {!mapStatus && (
            <div style={{
              position: "absolute", bottom: 28, left: 10, zIndex: 1000,
              display: "flex", gap: 4, background: "white", borderRadius: 10,
              padding: 4, boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
              border: "1px solid #e2e8f0",
            }}>
              {(Object.keys(TILE_LAYERS) as TileKey[]).map(k => {
                const t = TILE_LAYERS[k];
                const active = tileKey === k;
                return (
                  <button key={k} onClick={() => setTileKey(k)}
                    title={t.label}
                    style={{
                      padding: "4px 8px", borderRadius: 7, border: "none",
                      background: active ? "#7c3aed" : "transparent",
                      color: active ? "white" : "#64748b",
                      fontSize: 11, fontWeight: 600, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 3,
                      transition: "all 0.15s",
                    }}>
                    <span style={{ fontSize: 13 }}>{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {mapStatus && (
            <div style={{ position: "absolute", inset: 0, zIndex: 10,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              background: "rgba(248,250,252,0.9)" }}>
              <div style={{ width: 32, height: 32, border: "4px solid #e2e8f0", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: 12 }} />
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>{mapStatus}</div>
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
