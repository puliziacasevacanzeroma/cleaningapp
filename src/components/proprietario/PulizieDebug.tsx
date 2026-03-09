"use client";

/**
 * 🔬 DEBUG: Incolla questo componente TEMPORANEAMENTE nella pagina pulizie
 * per misurare cosa blocca la UI.
 * 
 * Uso: importa e metti <PulizieDebug /> dentro il return di PulizieView
 */

import { useEffect, useRef } from "react";

export function PulizieDebug() {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const logsRef = useRef<string[]>([]);

  useEffect(() => {
    // Crea overlay
    const overlay = document.createElement("div");
    overlay.id = "perf-overlay";
    overlay.style.cssText = `
      position: fixed; top: 8px; right: 8px; z-index: 99999;
      background: rgba(0,0,0,0.92); color: #0f0; font-family: monospace;
      font-size: 11px; padding: 10px; border-radius: 8px;
      max-width: 340px; max-height: 50vh; overflow-y: auto;
      pointer-events: auto; line-height: 1.5;
    `;
    
    const close = document.createElement("div");
    close.textContent = "✕ Chiudi Debug";
    close.style.cssText = "color: #f66; cursor: pointer; margin-bottom: 6px; font-weight: bold;";
    close.onclick = () => overlay.remove();
    overlay.appendChild(close);
    
    document.body.appendChild(overlay);
    overlayRef.current = overlay;

    const addLog = (msg: string) => {
      logsRef.current.push(msg);
      const line = document.createElement("div");
      if (msg.includes("🔴")) line.style.color = "#f66";
      else if (msg.includes("🟢")) line.style.color = "#6f6";
      else if (msg.includes("🟡")) line.style.color = "#ff6";
      else if (msg.includes("📊")) { line.style.color = "#6cf"; line.style.fontWeight = "bold"; }
      line.textContent = msg;
      overlay.appendChild(line);
    };

    // 1. Misura TUTTI i click nella pagina
    const clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      const cls = target.className?.toString().slice(0, 50) || "";
      const text = target.textContent?.slice(0, 20) || "";
      const clickTime = performance.now();
      
      addLog(`📊 CLICK: <${tag}> "${text}" at ${new Date().toLocaleTimeString()}`);
      
      // Misura quanto tempo passa prima del prossimo paint
      requestAnimationFrame(() => {
        const paintTime = performance.now();
        const delta = (paintTime - clickTime).toFixed(0);
        if (parseInt(delta) > 100) {
          addLog(`🔴 Paint dopo: ${delta}ms (LENTO!)`);
        } else if (parseInt(delta) > 50) {
          addLog(`🟡 Paint dopo: ${delta}ms`);
        } else {
          addLog(`🟢 Paint dopo: ${delta}ms`);
        }
      });
    };
    
    document.addEventListener("click", clickHandler, true);
    
    // 2. Misura Long Tasks
    let longTaskObserver: PerformanceObserver | null = null;
    if ("PerformanceObserver" in window) {
      try {
        longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              addLog(`🔴 Long Task: ${entry.duration.toFixed(0)}ms`);
            }
          }
        });
        longTaskObserver.observe({ type: "longtask", buffered: false });
      } catch {}
    }

    // 3. Misura ogni setState (patching React)
    addLog("🟢 Debug attivo — clicca qualsiasi cosa");

    return () => {
      document.removeEventListener("click", clickHandler, true);
      longTaskObserver?.disconnect();
      overlay.remove();
    };
  }, []);

  return null;
}
