"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * ModalPortal v2 — monta i figli su document.body, MA solo dall'istanza visibile.
 *
 * PROBLEMA 1 (iPhone, 02/09/2026)
 * Il <main> di DashboardLayoutClient ha `overflow-y-auto` +
 * `WebkitOverflowScrolling: "touch"`. Su iOS/WebKit un contenitore cosi' diventa
 * BLOCCO CONTENITORE per i figli `position: fixed`: la modale si ancora al <main>
 * invece che al viewport e il suo z-index vale solo dentro quel contesto. La
 * bottom-nav (z-50) finiva sopra la modale (z-[100]) nascondendone il footer.
 * Rimedio: portale su document.body.
 *
 * PROBLEMA 2, causato dal rimedio al primo (stesso giorno)
 * DashboardLayoutClient renderizza `{children}` DUE VOLTE: una nel layout desktop
 * e una in quello mobile, alternate via CSS. Ogni pagina e' quindi montata due
 * volte. Finche' la modale restava dentro il suo contenitore, quella dell'istanza
 * nascosta era invisibile. Portandola su document.body diventavano DUE modali
 * identiche impilate: chiudendo quella sopra ricompariva quella sotto, e il
 * salvataggio sembrava non funzionare (in realta' partivano due richieste).
 *
 * SOLUZIONE
 * Un ancoraggio invisibile resta nel punto in cui la modale e' dichiarata.
 * `offsetParent` e' null quando un antenato ha `display: none`: in quel caso
 * l'istanza e' quella nascosta e il portale non monta nulla. Il controllo viene
 * rifatto al cambio di dimensioni della finestra, perche' passando fra le
 * larghezze desktop e mobile cambia quale delle due istanze e' visibile.
 *
 * SSR-safe: al primo render non monta, cosi' non rompe l'idratazione.
 */
export default function ModalPortal({ children }: { children: React.ReactNode }) {
  const ancoraRef = useRef<HTMLSpanElement>(null);
  const [visibile, setVisibile] = useState(false);

  useEffect(() => {
    const verifica = () => {
      const el = ancoraRef.current;
      // offsetParent === null → un antenato ha display:none → istanza nascosta.
      setVisibile(!!el && el.offsetParent !== null);
    };

    verifica();

    // Il breakpoint puo' cambiare: ricontrolla al resize e al cambio orientamento.
    window.addEventListener("resize", verifica);
    window.addEventListener("orientationchange", verifica);
    return () => {
      window.removeEventListener("resize", verifica);
      window.removeEventListener("orientationchange", verifica);
    };
  }, []);

  return (
    <>
      {/* Ancoraggio: resta nell'albero originale e dice se questa istanza e' visibile.
          Niente display:none, altrimenti offsetParent sarebbe sempre null. */}
      <span ref={ancoraRef} aria-hidden="true" style={{ width: 0, height: 0, overflow: "hidden" }} />
      {visibile && typeof document !== "undefined"
        ? createPortal(<>{children}</>, document.body)
        : null}
    </>
  );
}
