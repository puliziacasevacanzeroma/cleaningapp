"use client";

/**
 * 🔬 PERFORMANCE DEBUG TOOL
 * 
 * Misura i tempi esatti di ogni fase della navigazione.
 * Mostra un overlay in basso a destra con i risultati.
 * 
 * COME USARE:
 * 1. Importa in layout.tsx: import "~/lib/debug/perfDebug"
 * 2. Naviga tra le pagine
 * 3. Guarda l'overlay con i tempi
 * 4. Quando finito, rimuovi l'import
 */

// Singleton state
const perfState = {
  navClickTime: 0,
  routeChangeStart: 0,
  componentMountStart: 0,
  componentFirstRender: 0,
  componentFullRender: 0,
  currentPage: "",
  measurements: [] as string[],
};

// Crea overlay UI
function createOverlay(): HTMLDivElement {
  let overlay = document.getElementById("perf-debug-overlay") as HTMLDivElement;
  if (overlay) return overlay;
  
  overlay = document.createElement("div");
  overlay.id = "perf-debug-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(0,0,0,0.9);
    color: #0f0;
    font-family: monospace;
    font-size: 11px;
    padding: 10px;
    border-radius: 8px;
    z-index: 99999;
    max-width: 320px;
    max-height: 50vh;
    overflow-y: auto;
    pointer-events: auto;
    line-height: 1.4;
  `;
  
  // Close button
  const closeBtn = document.createElement("div");
  closeBtn.textContent = "✕ Chiudi Debug";
  closeBtn.style.cssText = "color: #f66; cursor: pointer; margin-bottom: 6px; font-weight: bold;";
  closeBtn.onclick = () => overlay.remove();
  overlay.appendChild(closeBtn);
  
  document.body.appendChild(overlay);
  return overlay;
}

function addMeasurement(msg: string) {
  perfState.measurements.push(msg);
  
  if (typeof window === "undefined") return;
  
  const overlay = createOverlay();
  
  // Rimuovi vecchi contenuti tranne close button
  while (overlay.children.length > 1) {
    overlay.removeChild(overlay.lastChild!);
  }
  
  // Aggiungi tutte le misurazioni
  perfState.measurements.forEach(m => {
    const line = document.createElement("div");
    line.style.cssText = m.includes("🔴") ? "color: #f66;" : m.includes("🟢") ? "color: #6f6;" : m.includes("🟡") ? "color: #ff6;" : m.includes("📊") ? "color: #6cf; font-weight: bold; margin-top: 4px;" : "";
    line.textContent = m;
    overlay.appendChild(line);
  });
}

function clearMeasurements() {
  perfState.measurements = [];
}

// ════════════════════════════════════════════
// 1. INTERCETTA CLICK SU LINK NAVBAR
// ════════════════════════════════════════════
if (typeof window !== "undefined") {
  // Intercetta tutti i click su link nella bottom nav
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const link = target.closest("a[href]") as HTMLAnchorElement;
    if (link && link.href) {
      const url = new URL(link.href, window.location.origin);
      const path = url.pathname;
      
      // Solo per navigazione interna
      if (path.startsWith("/dashboard") || path.startsWith("/proprietario")) {
        clearMeasurements();
        perfState.navClickTime = performance.now();
        perfState.currentPage = path;
        addMeasurement(`📊 NAV → ${path}`);
        addMeasurement(`⏱️ Click: ${new Date().toLocaleTimeString()}`);
      }
    }
  }, true); // capture phase per intercettare prima di React

  // ════════════════════════════════════════════
  // 2. MISURA ROUTE CHANGE (pathname change)
  // ════════════════════════════════════════════
  let lastPathname = window.location.pathname;
  
  const checkPathChange = () => {
    if (window.location.pathname !== lastPathname) {
      const now = performance.now();
      const sinceClick = perfState.navClickTime ? (now - perfState.navClickTime).toFixed(0) : "?";
      lastPathname = window.location.pathname;
      perfState.routeChangeStart = now;
      addMeasurement(`🟡 Route change: +${sinceClick}ms`);
    }
    requestAnimationFrame(checkPathChange);
  };
  requestAnimationFrame(checkPathChange);
  
  // ════════════════════════════════════════════
  // 3. MISURA LONG TASKS (>50ms che bloccano UI)
  // ════════════════════════════════════════════
  if ("PerformanceObserver" in window) {
    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50 && perfState.navClickTime) {
            const sinceClick = (performance.now() - perfState.navClickTime).toFixed(0);
            addMeasurement(`🔴 Long task: ${entry.duration.toFixed(0)}ms (at +${sinceClick}ms)`);
          }
        }
      });
      longTaskObserver.observe({ type: "longtask", buffered: false });
    } catch {}
  }
  
  // ════════════════════════════════════════════
  // 4. MISURA PAINT EVENTS
  // ════════════════════════════════════════════
  if ("PerformanceObserver" in window) {
    try {
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (perfState.navClickTime && (performance.now() - perfState.navClickTime) < 5000) {
            const sinceClick = (performance.now() - perfState.navClickTime).toFixed(0);
            addMeasurement(`🟢 ${entry.name}: +${sinceClick}ms`);
          }
        }
      });
      paintObserver.observe({ type: "paint", buffered: false });
    } catch {}
  }
}

// ════════════════════════════════════════════
// 5. EXPORT PER COMPONENTI
// ════════════════════════════════════════════

/** Chiama all'inizio del componente (prima riga della funzione) */
export function perfMarkMount(componentName: string) {
  if (typeof window === "undefined") return;
  const now = performance.now();
  perfState.componentMountStart = now;
  const sinceClick = perfState.navClickTime ? (now - perfState.navClickTime).toFixed(0) : "?";
  addMeasurement(`🟡 ${componentName} mount: +${sinceClick}ms`);
}

/** Chiama nel primo useEffect([]) */
export function perfMarkFirstRender(componentName: string) {
  if (typeof window === "undefined") return;
  const now = performance.now();
  perfState.componentFirstRender = now;
  const sinceClick = perfState.navClickTime ? (now - perfState.navClickTime).toFixed(0) : "?";
  const sinceMountStr = perfState.componentMountStart ? (now - perfState.componentMountStart).toFixed(0) : "?";
  addMeasurement(`🟢 ${componentName} 1st render: +${sinceClick}ms (mount→render: ${sinceMountStr}ms)`);
}

/** Chiama quando il contenuto completo è visibile */
export function perfMarkFullRender(componentName: string) {
  if (typeof window === "undefined") return;
  const now = performance.now();
  perfState.componentFullRender = now;
  const sinceClick = perfState.navClickTime ? (now - perfState.navClickTime).toFixed(0) : "?";
  addMeasurement(`🟢 ${componentName} FULL: +${sinceClick}ms`);
  
  // Summary
  if (perfState.navClickTime) {
    const total = (now - perfState.navClickTime).toFixed(0);
    addMeasurement(`📊 TOTALE click→visible: ${total}ms`);
  }
}

export default perfState;
