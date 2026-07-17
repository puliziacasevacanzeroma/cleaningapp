"use client";

/**
 * SplashOverlay — splash globale che SOPRAVVIVE al cambio pagina.
 *
 * Montato in AppProviders (fuori dalle pagine), non muore con router.push:
 * la pagina di destinazione si monta e carica DIETRO lo splash, e solo
 * quando è pronta lo splash fa il fade rivelandola già renderizzata.
 *
 * Pilotaggio via API `splashOverlay` (store a livello di modulo):
 *   splashOverlay.show()            → mostra (fase auth, "Accesso in corso...")
 *   splashOverlay.load(nome)        → fase load ("Bentornato {nome}")
 *   splashOverlay.setText(testo)    → aggiorna il testo di caricamento
 *   splashOverlay.finish()          → barra a 100% → fade → nascondi
 *
 * Watchdog interno: se resta visibile oltre 12s si chiude da solo.
 */

import { useState, useEffect, useRef, useMemo, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';

// 🚀 PERF v2: asset come file in /public (prima erano ~117KB di base64 inline
// nel bundle JS di OGNI pagina, essendo questo componente nel root layout).
const LOGO_SRC = '/splash-logo.png';
const WORD_SRC = '/splash-wordmark.png';

/* ───────── MISURE LOGO ───────── */
const LOGO_W = 150;
const WORD_W = 200;
const GAP = 4;
/* ─────────────────────────────── */

const OVERLAY_WATCHDOG_MS = 6000;
const FADE_MS = 300;

// ============================================
// STORE A LIVELLO DI MODULO
// ============================================
type OverlayState = {
  visible: boolean;
  phase: 'auth' | 'load';
  userName: string;
  text: string;
  finishing: boolean;
};

let state: OverlayState = { visible: false, phase: 'auth', userName: '', text: 'Accesso in corso...', finishing: false };
const listeners = new Set<() => void>();
const emit = () => { listeners.forEach(l => l()); };
const setState = (patch: Partial<OverlayState>) => { state = { ...state, ...patch }; emit(); };

export const splashOverlay = {
  show() { setState({ visible: true, phase: 'auth', userName: '', text: 'Accesso in corso...', finishing: false }); },
  load(userName: string) { setState({ phase: 'load', userName, text: 'Caricamento...' }); },
  setText(text: string) { setState({ text }); },
  finish() { if (state.visible) setState({ finishing: true }); },
  hide() { setState({ visible: false, finishing: false }); },
  isVisible() { return state.visible; },
};

function useOverlayState(): OverlayState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
    () => state
  );
}

// ============================================
// COMPONENTE HOST (montato in AppProviders)
// ============================================
const rand = (a: number, b: number) => a + Math.random() * (b - a);
type Bubble = { size: number; left: number; bottom: number; wob: number; dur: number; delay: number };
type Spark = { size: number; left: number; top: number; dur: number; delay: number };
type Foam = { size: number; left: number; bottom: number; dur: number; delay: number };

export function SplashOverlayHost() {
  const ov = useOverlayState();
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  const phaseRef = useRef(ov.phase);
  phaseRef.current = ov.phase;

  const firstName = (ov.userName || '').split(' ')[0];

  // particelle (rigenerate a ogni apertura)
  const parts = useMemo(() => {
    if (!ov.visible) return null;
    const bubbles: Bubble[] = Array.from({ length: 26 }, () => ({
      size: rand(10, 42), left: rand(0, 100), bottom: rand(-10, -2),
      wob: rand(-26, 26), dur: rand(7, 15), delay: -rand(0, 15),
    }));
    const sparks: Spark[] = Array.from({ length: 22 }, () => ({
      size: rand(8, 18), left: rand(3, 97), top: rand(6, 92),
      dur: rand(1.6, 3.4), delay: -rand(0, 3),
    }));
    const foam: Foam[] = Array.from({ length: 20 }, (_, i) => ({
      size: rand(30, 78), left: (i / 20) * 100 + rand(-3, 3), bottom: rand(-40, -18),
      dur: rand(3, 6), delay: -rand(0, 4),
    }));
    return { bubbles, sparks, foam };
  }, [ov.visible]);

  // reset a ogni apertura
  useEffect(() => {
    if (ov.visible) { setProgress(0); setFadeOut(false); }
  }, [ov.visible]);

  // barra continua: cap 15% in auth, 90% in load
  useEffect(() => {
    if (!ov.visible) return;
    const t = setInterval(() => {
      setProgress(prev => {
        const cap = phaseRef.current === 'auth' ? 15 : 90;
        if (prev >= cap) return prev;
        const next = prev + Math.max(0.4, (cap - prev) * 0.06);
        return Math.min(cap, next);
      });
    }, 120);
    return () => clearInterval(t);
  }, [ov.visible]);

  // finishing: 100% → fade → hide
  useEffect(() => {
    if (!ov.visible || !ov.finishing) return;
    setProgress(100);
    const t1 = setTimeout(() => {
      setFadeOut(true);
      const t2 = setTimeout(() => splashOverlay.hide(), FADE_MS);
      return () => clearTimeout(t2);
    }, 100);
    return () => clearTimeout(t1);
  }, [ov.visible, ov.finishing]);

  // watchdog: mai bloccati sull'overlay
  useEffect(() => {
    if (!ov.visible) return;
    const t = setTimeout(() => {
      console.warn('⏱️ SPLASH OVERLAY: watchdog scattato, chiudo');
      splashOverlay.finish();
    }, OVERLAY_WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [ov.visible]);

  if (!ov.visible) return null;

  return (
    <div className={`splash ${fadeOut ? 'is-out' : ''}`}>
      <div className="bg">
        {parts?.bubbles.map((b, i) => (
          <div key={`b${i}`} className="bubble" style={{
            width: b.size, height: b.size, left: `${b.left}%`, bottom: `${b.bottom}%`,
            animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s`,
            '--wob': `${b.wob}px`,
          } as CSSProperties} />
        ))}
        {parts?.sparks.map((s, i) => (
          <div key={`s${i}`} className="spark" style={{
            width: s.size, height: s.size, left: `${s.left}%`, top: `${s.top}%`,
            animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s`,
          }} />
        ))}
        {parts?.foam.map((f, i) => (
          <div key={`f${i}`} className="foam" style={{
            width: f.size, height: f.size, left: `${f.left}%`, bottom: f.bottom,
            animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s`,
          }} />
        ))}
      </div>

      <div className="fx"><div className="sweep" /></div>

      <div className="scene">
        <div className="lockinner">
          <div className="logo-stack">
            <div className="halo" />
            <img className="logo" src={LOGO_SRC} alt="CleaningApp" />
          </div>
          <img className="wordmark" src={WORD_SRC} alt="Puliziacasevacanze.it" />
          {/* Un'unica barra di luce che attraversa logo E scritta (maschera doppia) */}
          <div className="shineMask" style={{
            WebkitMaskImage: `url(${LOGO_SRC}), url(${WORD_SRC})`,
            maskImage: `url(${LOGO_SRC}), url(${WORD_SRC})`,
          }}>
            <div className="shine" />
          </div>
        </div>

        <div className={`hello ${ov.phase === 'load' && firstName ? 'show' : ''}`}>
          <h1 className="welcome">Bentornato</h1>
          <p className="name">{firstName}</p>
        </div>

        <div className="progress">
          <div className="track"><div className="fill" style={{ width: `${progress}%` }} /></div>
          <div className="pct">{Math.round(progress)}%</div>
        </div>

        <p className="loading">{ov.phase === 'auth' ? 'Accesso in corso...' : ov.text}</p>
        <div className="dots"><i /><i /><i /></div>
      </div>

      <style jsx>{`
        .splash {
          position: fixed; inset: 0; z-index: 2147483000; overflow: hidden; padding: 24px;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(180deg, #63cef2 0%, #3aa9e0 50%, #2a83c8 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
          transition: opacity ${FADE_MS}ms ease; opacity: 1;
        }
        .splash.is-out { opacity: 0; }
        .bg { position: absolute; inset: 0; z-index: 1; overflow: hidden; }
        .fx { position: absolute; inset: 0; z-index: 8; overflow: hidden; pointer-events: none; }

        .bubble { position: absolute; border-radius: 50%; border: 1px solid rgba(255,255,255,.4);
          background: radial-gradient(circle at 32% 28%, rgba(255,255,255,.95), rgba(255,255,255,.12) 42%, rgba(255,255,255,0) 64%);
          animation: bubbleUp linear infinite; }
        @keyframes bubbleUp { 0% { transform: translate(0,0); opacity: 0; } 8% { opacity: .9; }
          50% { transform: translate(var(--wob,14px), -58vh); } 90% { opacity: .9; } 100% { transform: translate(0,-116vh); opacity: 0; } }
        .spark { position: absolute; color: #fff; background: currentColor;
          clip-path: polygon(50% 0,60% 40%,100% 50%,60% 60%,50% 100%,40% 60%,0 50%,40% 40%);
          filter: drop-shadow(0 0 6px rgba(255,255,255,.7)); animation: sparkPop ease-in-out infinite; }
        @keyframes sparkPop { 0%,100% { transform: scale(0) rotate(0); opacity: 0; } 50% { transform: scale(1) rotate(35deg); opacity: 1; } }
        .foam { position: absolute; border-radius: 50%; background: rgba(255,255,255,.92); animation: foamBob ease-in-out infinite; }
        @keyframes foamBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }

        .sweep { position: absolute; top: -20%; left: -30%; width: 35%; height: 140%; transform: skewX(-16deg);
          background: linear-gradient(100deg, transparent, rgba(255,255,255,.35), transparent);
          animation: screenSweep 1.4s ease-out .1s both; }
        @keyframes screenSweep { 0% { opacity: 0; transform: translateX(0) skewX(-16deg); } 15% { opacity: 1; } 100% { opacity: 0; transform: translateX(360%) skewX(-16deg); } }

        .scene { position: relative; z-index: 5; display: flex; flex-direction: column; align-items: center; text-align: center; }
        /* 🎬 Logo + scritta = UN'UNICA COSA: entrano insieme (stesso pop) e
           fluttuano insieme. Nessuna animazione separata sui singoli pezzi. */
        .lockinner { position: relative; display: flex; flex-direction: column; align-items: center; gap: ${GAP}px;
          animation: logoin .8s cubic-bezier(.22,1,.36,1) both, floaty 5s ease-in-out infinite 2.2s; }
        .logo-stack { position: relative; display: inline-flex; align-items: center; justify-content: center; }
        .logo { width: ${LOGO_W}px; height: auto; display: block; position: relative; z-index: 3;
          filter: drop-shadow(0 8px 16px rgba(0,15,40,.28)); }
        @keyframes logoin { 0% { opacity: 0; transform: scale(.55); } 60% { transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }
        .halo { position: absolute; inset: -42px; border-radius: 50%; z-index: 1; opacity: .32;
          background: radial-gradient(circle, rgba(200,235,255,.6) 0%, rgba(200,235,255,0) 62%); }
        /* Maschera DOPPIA (sagoma logo in alto + sagoma scritta in basso):
           la stessa barra di luce attraversa entrambi come un pezzo solo. */
        .shineMask { position: absolute; inset: 0; z-index: 6; pointer-events: none; overflow: hidden;
          -webkit-mask-repeat: no-repeat, no-repeat; mask-repeat: no-repeat, no-repeat;
          -webkit-mask-position: center top, center bottom; mask-position: center top, center bottom;
          -webkit-mask-size: ${LOGO_W}px auto, ${WORD_W}px auto; mask-size: ${LOGO_W}px auto, ${WORD_W}px auto; }
        .shine { position: absolute; top: -25%; left: -70%; width: 45%; height: 150%; transform: skewX(-18deg);
          background: linear-gradient(100deg, transparent, rgba(255,255,255,.9), transparent);
          animation: shine 3.4s ease-in-out infinite 1.4s; }
        @keyframes shine { 0% { transform: translateX(0) skewX(-18deg); } 22%,100% { transform: translateX(430%) skewX(-18deg); } }
        .wordmark { width: ${WORD_W}px; height: auto; display: block; position: relative; z-index: 5;
          filter: drop-shadow(0 3px 8px rgba(0,15,40,.3)); }

        .hello { max-height: 0; opacity: 0; overflow: hidden; transform: translateY(14px);
          transition: max-height .6s ease, opacity .6s ease, transform .6s ease; }
        .hello.show { max-height: 130px; opacity: 1; transform: translateY(0); }
        .welcome { color: #fff; font-weight: 800; font-size: 40px; margin: 30px 0 0; line-height: 1; letter-spacing: .3px; }
        .name { color: rgba(255,255,255,.85); font-size: 26px; margin: 8px 0 0; }

        .progress { width: min(360px,72vw); margin-top: 36px; animation: fadeUp .7s ease-out .4s both; }
        .track { height: 6px; border-radius: 999px; background: rgba(255,255,255,.24); overflow: hidden; }
        .fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg,#34d399,#2dd4bf); transition: width .5s ease; }
        .pct { text-align: right; color: rgba(255,255,255,.85); font-size: 13px; font-weight: 600; margin-top: 8px; }
        .loading { color: rgba(255,255,255,.62); font-size: 15px; margin-top: 22px; animation: fadeUp .7s ease-out .5s both; }
        .dots { display: flex; gap: 9px; justify-content: center; margin-top: 18px; animation: fadeUp .7s ease-out .55s both; }
        .dots i { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.8); animation: blink 1.4s infinite; }
        .dots i:nth-child(2) { animation-delay: .2s; } .dots i:nth-child(3) { animation-delay: .4s; }

        @keyframes fadeUp { 0% { opacity: 0; transform: translateY(16px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes blink { 0%,80%,100% { opacity: .3; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }
        @keyframes floaty { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }

        @media (prefers-reduced-motion: reduce) {
          .bubble, .spark, .foam, .sweep, .shine, .lockinner, .logo, .progress, .loading, .dots, .wordmark { animation: none !important; }
          .progress, .loading, .dots, .wordmark { opacity: 1 !important; }
        }
      `}</style>
    </div>
  );
}
