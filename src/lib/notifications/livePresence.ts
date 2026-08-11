/**
 * ════════════════════════════════════════════════════════════════════
 * livePresence.ts — quando un avviso è "vivo"
 * ════════════════════════════════════════════════════════════════════
 *
 * Modulo PURO (zero react, zero firebase, zero DOM diretto): tutta la
 * logica che decide se un evento merita toast + suono oppure solo la
 * campanella. Vive qui, e non dentro il componente, perché è logica con
 * molti casi limite e va testata senza browser.
 *
 * ─── LA REGOLA ────────────────────────────────────────────────────
 * Un avviso vivo si vede SOLO se l'utente è davanti all'app NEL MOMENTO
 * in cui l'evento accade. App minimizzata, in background, chiusa,
 * sospesa, o un'altra finestra a fuoco → l'evento resta in campanella e
 * come push. Mai toast, mai suono.
 *
 * ─── PERCHÉ NON BASTANO LE FINESTRE DI TEMPO ──────────────────────
 * La versione precedente apriva al rientro una soppressione di 12s,
 * scommettendo che il backlog di Firestore arrivasse entro quel termine.
 * Dopo una notte il dispositivo si è disconnesso e la riconnessione su
 * rete mobile può impiegare molto di più: il blocco arrivava a finestra
 * chiusa e passava tutto. Allargare la finestra sarebbe la stessa
 * scommessa con un numero più grande.
 *
 * ─── LA SOLUZIONE: EPOCA DI PRIMO PIANO ───────────────────────────
 * Ogni rientro reale in primo piano incrementa l'epoca. Ogni listener
 * ricorda con quale epoca si è "seminato": se è cambiata, il PRIMO
 * snapshot successivo assorbe lo stato corrente come nuova baseline, in
 * silenzio — come fa al primo avvio. Nessun cronometro: non importa se
 * il backlog arriva dopo 3 secondi o dopo 5 minuti.
 *
 * Sopra ci sono due reti indipendenti: la presenza reale al momento di
 * emettere, e la freschezza dell'evento.
 */

// ══════════════════════════════════════════════════════════════════
// COSTANTI
// ══════════════════════════════════════════════════════════════════

/** Assenza minima perché il rientro conti come "sono stato via". */
export const MIN_HIDDEN_FOR_RESUME_MS = 3_000;

/** Tolleranza per lo sfasamento fra orologio client e timestamp server. */
export const CLOCK_SKEW_TOLERANCE_MS = 10_000;

/** Un evento è "vivo" solo se accaduto negli ultimi secondi. */
export const LIVE_MAX_AGE_MS = 15_000;

/** Assestamento dopo il rientro: nessun avviso nei primissimi istanti. */
export const FOREGROUND_SETTLE_MS = 1_500;

/** Distanza minima fra due suoni, anche a raffica residua. */
export const SOUND_MIN_GAP_MS = 2_500;

// ══════════════════════════════════════════════════════════════════
// AMBIENTE INIETTABILE (serve per i test senza browser)
// ══════════════════════════════════════════════════════════════════

export interface PresenceEnv {
  now(): number;
  /** La pagina è visibile? (document.visibilityState === "visible") */
  isVisible(): boolean;
  /**
   * La finestra ha il fuoco? Se la piattaforma non lo sa dire deve
   * rispondere `true`: l'incertezza non deve zittire l'app.
   */
  hasFocus(): boolean;
}

export class LivePresence {
  private env: PresenceEnv;
  private epoch = 0;
  private lastBecameVisibleAt: number;
  private lastBecameHiddenAt: number | null = null;
  private lastSoundAt = 0;

  constructor(env: PresenceEnv) {
    this.env = env;
    this.lastBecameVisibleAt = env.now();
  }

  /** Epoca corrente. I listener la confrontano con la propria. */
  currentEpoch(): number {
    return this.epoch;
  }

  /**
   * L'app è tornata in primo piano.
   * Se l'assenza è stata reale (>= MIN_HIDDEN_FOR_RESUME_MS) l'epoca
   * avanza e i listener ri-semineranno la baseline.
   */
  markForeground(): void {
    // Un evento di "rientro" mentre la pagina è dichiarata nascosta è
    // spurio (capita su alcuni browser): va ignorato.
    if (!this.env.isVisible()) return;
    const now = this.env.now();
    if (this.lastBecameHiddenAt !== null && now - this.lastBecameHiddenAt >= MIN_HIDDEN_FOR_RESUME_MS) {
      this.epoch++;
    }
    this.lastBecameHiddenAt = null;
    this.lastBecameVisibleAt = now;
  }

  /** L'app è andata in background (o ha perso il fuoco). */
  markBackground(): void {
    if (this.lastBecameHiddenAt === null) this.lastBecameHiddenAt = this.env.now();
  }

  /**
   * L'utente è davanti all'app adesso?
   * Non basta la visibilità: se un'altra finestra ha il fuoco, per
   * l'utente non siamo sullo schermo.
   */
  isInForeground(): boolean {
    return this.env.isVisible() && this.env.hasFocus();
  }

  /** Si può emettere un avviso vivo (toast/suono) proprio adesso? */
  canEmitLiveAlert(): boolean {
    if (!this.isInForeground()) return false;
    if (this.env.now() - this.lastBecameVisibleAt < FOREGROUND_SETTLE_MS) return false;
    return true;
  }

  /**
   * L'evento è accaduto MENTRE ero davanti all'app?
   *
   * @param tsMillis         istante dell'evento (ms), o null se assente
   * @param hasPendingWrites scrittura locale non ancora confermata dal
   *                         server: il timestamp non è ancora risolto ma
   *                         l'evento è appena avvenuto su questo device
   *
   * ⚠️ Timestamp assente ⇒ NON vivo (prima era il contrario, e il
   * backlog senza timestamp passava).
   */
  isLiveEvent(tsMillis: number | null | undefined, hasPendingWrites = false): boolean {
    if (tsMillis === null || tsMillis === undefined || !Number.isFinite(tsMillis)) {
      return hasPendingWrites === true;
    }
    // Precede l'ultimo rientro (al netto dello sfasamento orologi) → backlog
    if (tsMillis < this.lastBecameVisibleAt - CLOCK_SKEW_TOLERANCE_MS) return false;
    // Troppo vecchio in assoluto → backlog
    if (this.env.now() - tsMillis > LIVE_MAX_AGE_MS) return false;
    return true;
  }

  /**
   * Il listener deve ri-seminare la baseline senza emettere nulla?
   * Vero al primo avvio (epoca ricordata -1) e a ogni rientro reale.
   */
  shouldReseed(listenerEpoch: number): boolean {
    return listenerEpoch !== this.epoch;
  }

  /** Throttle del suono: al massimo uno ogni SOUND_MIN_GAP_MS. */
  canPlaySound(): boolean {
    const now = this.env.now();
    if (now - this.lastSoundAt < SOUND_MIN_GAP_MS) return false;
    this.lastSoundAt = now;
    return true;
  }
}

// ══════════════════════════════════════════════════════════════════
// ISTANZA REALE (collegata al browser)
// ══════════════════════════════════════════════════════════════════

const browserEnv: PresenceEnv = {
  now: () => Date.now(),
  isVisible: () => {
    if (typeof document === "undefined") return false;
    return document.visibilityState === "visible";
  },
  hasFocus: () => {
    if (typeof document === "undefined") return false;
    try {
      // Se la piattaforma non espone hasFocus, non è un motivo per zittire.
      if (typeof document.hasFocus !== "function") return true;
      return document.hasFocus();
    } catch {
      return true;
    }
  },
};

export const livePresence = new LivePresence(browserEnv);

/** Collega gli ascoltatori del ciclo di vita della pagina. Idempotente. */
let wired = false;
export function wireLivePresence(): void {
  if (wired) return;
  wired = true;

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") livePresence.markForeground();
      else livePresence.markBackground();
    });
    // Page Lifecycle (mobile/PWA): freeze/resume possono scattare da soli
    document.addEventListener("freeze", () => livePresence.markBackground());
    document.addEventListener("resume", () => livePresence.markForeground());
  }
  if (typeof window !== "undefined") {
    // Su mobile/PWA al risveglio a volte arriva focus/pageshow invece di
    // visibilitychange. `blur` copre il desktop: altra finestra davanti
    // mentre la nostra resta tecnicamente "visibile".
    window.addEventListener("focus", () => livePresence.markForeground());
    window.addEventListener("pageshow", () => livePresence.markForeground());
    window.addEventListener("blur", () => livePresence.markBackground());
  }
}

if (typeof window !== "undefined") wireLivePresence();
