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
const BOUNDS = { minLat: 41.65, maxLat: 42.05, minLng: 12.20, maxLng: 12.85 };
const inRoma = (lat: number, lng: number) =>
  lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat && lng >= BOUNDS.minLng && lng <= BOUNDS.maxLng;

export default function CoordinatePage() {
  const [props, setProps] = useState<Prop[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "no" | "yes">("all");
  const [tempCoords, setTempCoords] = useState<{ lat: number; lng: number } | null>(null);

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
    if (!mapDiv.current) return;
    let cancelled = false;

    // Load Leaflet
    const loadCSS = () => {
      if (!document.getElementById("lf-c")) {
        const l = document.createElement("link");
        l.id = "lf-c"; l.rel = "stylesheet"; l.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(l);
      }
    };
    const loadJS = (): Promise<void> => new Promise(res => {
      if ((window as any).L) return res();
      if (document.getElementById("lf-j")) {
        const iv = setInterval(() => { if ((window as any).L) { clearInterval(iv); res(); } }, 50);
        return;
      }
      const s = document.createElement("script");
      s.id = "lf-j"; s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = () => res();
      document.head.appendChild(s);
    });

    loadCSS();
    loadJS().then(() => {
      if (cancelled || !mapDiv.current) return;
      const L = (window as any).L;
      if (mapObj.current) return;

      const map = L.map(mapDiv.current, { zoomControl: true }).setView([ROMA.lat, ROMA.lng], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap", maxZoom: 19,
      }).addTo(map);
      layerGrp.current = L.layerGroup().addTo(map);
      mapObj.current = map;

      // Click → posiziona pin
      map.on("click", (e: any) => {
        setTempCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
      });

      // Force resize dopo montaggio (fix per container nascosto)
      setTimeout(() => map.invalidateSize(), 200);
      setTimeout(() => map.invalidateSize(), 500);
    });

    return () => { cancelled = true; };
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
        radius: isSel ? 14 : 8,
        fillColor: p.verified ? "#10b981" : "#3b82f6",
        color: isSel ? "#f59e0b" : "#fff",
        weight: isSel ? 4 : 2,
        fillOpacity: 0.9,
      }).addTo(layerGrp.current);
      cm.bindTooltip(`<b>${p.name}</b><br><span style="font-size:11px">${p.address}</span>`, { direction: "top", offset: [0, -10] });
      cm.on("click", () => setSel(p.id));
    });
  }, [props, sel]);

  // ── Temp marker (click sulla mappa) ──
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapObj.current) return;
    if (tempMarker.current) { mapObj.current.removeLayer(tempMarker.current); tempMarker.current = null; }
    if (!tempCoords || !sel) return;

    tempMarker.current = L.marker([tempCoords.lat, tempCoords.lng], {
      draggable: true, // TRASCINABILE!
    }).addTo(mapObj.current);

    tempMarker.current.bindTooltip("📍 Trascina per posizionare — poi Salva", {
      permanent: true, direction: "top", offset: [0, -20],
    });

    // Aggiorna coords quando trascinato
    tempMarker.current.on("dragend", (e: any) => {
      const { lat, lng } = e.target.getLatLng();
      setTempCoords({ lat, lng });
    });
  }, [tempCoords, sel]);

  // ── Centra mappa su selezione ──
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
        flash(`📍 Trovato: ${r.coordinates.lat.toFixed(4)}, ${r.coordinates.lng.toFixed(4)} (${r.confidence}) — Verifica e Salva`);
      } else if (r?.coordinates) {
        flash(`⚠️ Risultato fuori Roma — posiziona manualmente sulla mappa`);
      } else {
        flash(`⚠️ Indirizzo non trovato — posiziona manualmente`);
      }
    } catch { flash("Errore geocoding"); }
    setBusy(null);
  };

  // ── Salva ──
  const handleSave = async (id: string) => {
    const coords = tempCoords;
    if (!coords) { flash("Nessuna posizione da salvare"); return; }
    setBusy(id);
    try {
      await updateDoc(doc(db, "properties", id), {
        coordinates: { lat: coords.lat, lng: coords.lng },
        coordinatesVerified: true,
        coordinatesUpdatedAt: new Date(),
      });
      setTempCoords(null);
      flash(`✅ Salvato!`);
    } catch (e) { flash(`Errore: ${e instanceof Error ? e.message : "?"}`); }
    setBusy(null);
  };

  // ── Filtro ──
  const list = props.filter(p => filter === "no" ? !p.coordinates : filter === "yes" ? !!p.coordinates : true);
  const nWith = props.filter(p => p.coordinates).length;
  const nWithout = props.length - nWith;

  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full" /></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", background: "white", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#1e293b" }}>📍 Coordinate Proprietà</h1>
            <p style={{ fontSize: 12, color: "#94a3b8" }}>
              {nWith}/{props.length} posizionate · <span style={{ color: nWithout > 0 ? "#ef4444" : "#10b981", fontWeight: 700 }}>{nWithout} da fare</span>
            </p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {([["all", `Tutte (${props.length})`], ["no", `❌ Senza (${nWithout})`], ["yes", `✅ Con (${nWith})`]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k as any)}
                style={{ padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                  background: filter === k ? "#7c3aed" : "#f1f5f9", color: filter === k ? "white" : "#475569" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content: lista + mappa */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Lista */}
        <div style={{ width: 380, minWidth: 380, borderRight: "1px solid #e2e8f0", overflowY: "auto", background: "white" }}>
          {sel && (
            <div style={{ padding: 10, background: "#fffbeb", borderBottom: "1px solid #fde68a", fontSize: 12, color: "#92400e" }}>
              <b>Click sulla mappa</b> per posizionare il pin — poi <b>Salva</b>
            </div>
          )}
          {list.map(p => {
            const isSel = p.id === sel;
            return (
              <div key={p.id} onClick={() => { setSel(isSel ? null : p.id); setTempCoords(null); }}
                style={{ padding: 12, borderBottom: "1px solid #f1f5f9", cursor: "pointer",
                  background: isSel ? "#f5f3ff" : "white",
                  outline: isSel ? "2px solid #8b5cf6" : "none", outlineOffset: -2 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: p.coordinates ? (p.verified ? "#10b981" : "#3b82f6") : "#ef4444", color: "white", fontSize: 12, fontWeight: 700 }}>
                    {p.coordinates ? (p.verified ? "✓" : "?") : "✕"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.address}</div>
                    {p.coordinates && <div style={{ fontSize: 10, color: "#10b981", marginTop: 2 }}>{p.coordinates.lat.toFixed(5)}, {p.coordinates.lng.toFixed(5)}{p.verified ? " ✓" : ""}</div>}
                    {!p.coordinates && <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, marginTop: 2 }}>Nessuna coordinata</div>}
                  </div>
                </div>
                {isSel && (
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button onClick={(e) => { e.stopPropagation(); handleGeocode(p.id); }}
                      disabled={busy === p.id}
                      style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#3b82f6", color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: busy === p.id ? 0.5 : 1 }}>
                      {busy === p.id ? "⏳..." : "🔍 Geocoda"}
                    </button>
                    {(tempCoords || p.coordinates) && (
                      <button onClick={(e) => { e.stopPropagation(); handleSave(p.id); }}
                        disabled={busy === p.id || !tempCoords}
                        style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: tempCoords ? "#10b981" : "#94a3b8", color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: busy === p.id || !tempCoords ? 0.5 : 1 }}>
                        💾 Salva
                      </button>
                    )}
                    {tempCoords && (
                      <div style={{ width: "100%", fontSize: 10, color: "#7c3aed", marginTop: 4 }}>
                        📍 Nuova posizione: {tempCoords.lat.toFixed(5)}, {tempCoords.lng.toFixed(5)} — trascina il pin o click altrove
                      </div>
                    )}
                    {!tempCoords && <div style={{ width: "100%", fontSize: 10, color: "#94a3b8", marginTop: 4 }}>Click sulla mappa per posizionare</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Mappa */}
        <div style={{ flex: 1, position: "relative" }}>
          <div ref={mapDiv} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }} />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#1e293b", color: "white", padding: "10px 24px", borderRadius: 12,
          fontSize: 14, fontWeight: 700, zIndex: 9999, boxShadow: "0 8px 30px rgba(0,0,0,0.3)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
