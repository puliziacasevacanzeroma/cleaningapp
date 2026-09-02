"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * ModalPortal — monta i figli su document.body invece che dove sta il componente.
 *
 * PERCHE' ESISTE (bug iPhone 31/08/2026, pagina Pagamenti)
 * Il <main> di DashboardLayoutClient ha `overflow-y-auto` +
 * `WebkitOverflowScrolling: "touch"` + `overscroll-none`. Su iOS/WebKit un
 * contenitore cosi' diventa BLOCCO CONTENITORE per i figli `position: fixed`:
 * la modale non si ancora piu' al viewport ma al <main>, e il suo z-index
 * vale solo DENTRO quel contesto di impilamento. La bottom-nav (z-50), che
 * sta fuori nel contesto radice, finisce sopra la modale (z-[100]) e ne
 * nasconde il footer con il bottone di conferma.
 * Su Android/Chrome il contenimento non scatta, per questo li' funzionava.
 *
 * Alzare lo z-index NON risolve: dentro un contesto figlio qualunque valore
 * resta sotto. L'unica correzione e' tirare la modale fuori dal <main>.
 *
 * SSR-safe: al primo render (server e idratazione) non monta nulla, cosi'
 * non si rompe la corrispondenza fra HTML del server e client.
 *
 * USO
 *   return (
 *     <ModalPortal>
 *       <div className="fixed inset-0 ... z-[100]" onClick={close} />
 *       <div className="fixed ... z-[100]">…</div>
 *     </ModalPortal>
 *   );
 */
export default function ModalPortal({ children }: { children: React.ReactNode }) {
  const [montato, setMontato] = useState(false);

  useEffect(() => {
    setMontato(true);
  }, []);

  if (!montato) return null;
  if (typeof document === "undefined") return null;

  return createPortal(<>{children}</>, document.body);
}
