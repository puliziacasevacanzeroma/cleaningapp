"use client";
// @ts-nocheck
import { useState, useEffect, useRef } from "react";

const REG = "https://gestionale.puliziacasevacanze.it/register";

/* ═══ HOOKS ═══ */
function useVis(t = 0.12) {
  const r = useRef(null);
  const [v, sV] = useState(false);
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => {
      // Bidirezionale: true quando entra, false quando esce
      sV(e.isIntersecting);
    }, { threshold: 0.05, rootMargin: "0px 0px 0px 0px" });
    if (r.current) o.observe(r.current);
    return () => o.disconnect();
  }, []);
  return [r, v];
}

function FadeUp({ children, delay = 0, className = "" }) {
  const [ref, vis] = useVis(0.1);
  return (
    <div ref={ref} className={className} style={{
      opacity: vis ? 1 : 0,
      transition: `opacity 0.6s ease ${delay}s`}}>{children}</div>
  );
}

function Counter({ end, s = "" }) {
  const [c, sC] = useState(0);
  const [r, v] = useVis();
  useEffect(() => {
    if (!v) return;
    let n = 0; const step = end / (1500 / 16);
    const t = setInterval(() => { n += step; if (n >= end) { sC(end); clearInterval(t) } else sC(Math.floor(n)) }, 16);
    return () => clearInterval(t);
  }, [v, end]);
  return <span ref={r}>{c}{s}</span>;
}

/* ═══ ANNOTATION COMPONENTS ═══ */

// Callout tooltip che appare con animazione
function Callout({ x, y, text, delay = 0, color = "#0EA5E9", side = "right" }) {
  const [ref, vis] = useVis(0.15);
  const isLeft = side === "left";
  return (
    <div ref={ref} style={{
      position: "absolute", left: `${x}%`, top: `${y}%`,
      opacity: vis ? 1 : 0,
      transform: vis ? "scale(1)" : "scale(0.7)",
      transition: `all 0.4s cubic-bezier(0.34,1.56,0.64,1) ${delay}s`,
      zIndex: 10, pointerEvents: "none"}}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexDirection: isLeft ? "row-reverse" : "row" }}>
        {/* Dot pulsante */}
        <div style={{ position: "relative", width: 10, height: 10, flexShrink: 0 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
          <div style={{
            position: "absolute", inset: -3, borderRadius: "50%",
            border: `2px solid ${color}`, opacity: 0.5,
            animation: "calloutPulse 1.5s ease-in-out infinite"}} />
        </div>
        {/* Linea */}
        <div style={{ width: 24, height: 2, background: color, opacity: 0.6 }} />
        {/* Label */}
        <div style={{
          background: "white", borderRadius: 8, padding: "4px 10px",
          fontSize: 10, fontWeight: 700, color: color,
          boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
          border: `1.5px solid ${color}22`,
          whiteSpace: "nowrap", lineHeight: 1.4}}>{text}</div>
      </div>
    </div>
  );
}

// Cursore animato che simula un click
function AnimCursor({ x, y, delay = 0 }) {
  const [ref, vis] = useVis(0.15);
  return (
    <div ref={ref} style={{
      position: "absolute", left: `${x}%`, top: `${y}%`,
      zIndex: 20, pointerEvents: "none",
      opacity: vis ? 1 : 0,
      transition: `opacity 0.3s ease ${delay}s`}}>
      <div style={{ animation: vis ? `cursorClick 1.8s ${delay + 0.3}s ease-in-out infinite` : "none" }}>
        <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
          <path d="M1 1L1 16L5 12L7.5 18L9.5 17L7 11L12 11Z" fill="white" stroke="#334155" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  );
}

// Highlight box che evidenzia un'area dello schermo
function HighlightBox({ x, y, w, h, delay = 0, color = "#0EA5E9" }) {
  const [ref, vis] = useVis(0.15);
  return (
    <div ref={ref} style={{
      position: "absolute", left: `${x}%`, top: `${y}%`,
      width: `${w}%`, height: h,
      border: `2px solid ${color}`,
      borderRadius: 8,
      boxShadow: `0 0 0 3px ${color}22`,
      zIndex: 8, pointerEvents: "none",
      opacity: vis ? 1 : 0,
      transform: vis ? "scale(1)" : "scale(0.95)",
      transition: `all 0.5s ease ${delay}s`,
      animation: vis ? `highlightPulse 2s ${delay + 0.5}s ease-in-out infinite` : "none"}} />
  );
}

// Wrapper schermo con annotazioni
function AnnotatedScreen({ children, style = {} }) {
  return (
    <div style={{ position: "relative", ...style }}>
      {children}
    </div>
  );
}

/* ═══ PARTICLES ═══ */
function Particles({ count = 20 }) {
  const pts = useRef(Array.from({ length: count }, (_, i) => ({
    x: Math.random() * 100, y: Math.random() * 100,
    size: Math.random() * 2.5 + 0.8,
    dur: Math.random() * 12 + 8,
    delay: Math.random() * -15,
  }))).current;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pts.map((p, i) => (
        <div key={i} style={{
          position: "absolute", left: `${p.x}%`, top: `${p.y}%`,
          width: p.size, height: p.size,
          borderRadius: "50%",
          background: "rgba(148,210,255,0.45)",
          animation: `particleDrift ${p.dur}s ${p.delay}s infinite ease-in-out alternate`}} />
      ))}
    </div>
  );
}

/* ═══ SVG ICONS ═══ */
const Icons = {
  user: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  mail: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/></svg>,
  phone: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>,
  lock: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
  home: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m3 9 9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  edit: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></svg>,
  id: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>,
  signature: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 17c1 0 2-1 3-3s2-4 3-4 2 6 3 6 2-8 3-8 1 4 2 4 2-2 3-2 1 1 2 1"/></svg>,
  building: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/></svg>,
  send: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>,
  clock: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  users: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  check: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="20 6 9 17 4 12"/></svg>,
  checkCircle: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  chevronDown: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="6 9 12 15 18 9"/></svg>,
  refresh: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>,
  dollar: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  chart: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  sparkle: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275z"/></svg>,
  calendar: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  bell: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  settings: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  creditCard: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  link: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>,
  alertTriangle: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  star: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={0.5} {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  bot: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>,
  messageCircle: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>,
  fileText: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  shield: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  bed: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>,
  arrowRight: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  thumbsUp: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>,
  target: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  zap: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  eye: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  award: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>,
  image: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  save: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  mapPin: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  clipboard: (p) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/></svg>,
};

/* ═══ COMPONENTS ═══ */
function AppScreen({ children, title, badge }) {
  return (
    <div className="w-full max-w-[380px] mx-auto">
      <div className="bg-slate-800 rounded-[22px] p-1.5 shadow-2xl shadow-slate-900/30">
        <div className="bg-white rounded-[18px] overflow-hidden">
          <div className="bg-slate-900 text-white px-4 py-1.5 flex justify-between items-center text-[10px]">
            <span className="font-semibold">9:41</span>
            <div className="flex gap-1.5 items-center">
              <div className="w-5 h-2.5 border border-white/60 rounded-sm relative">
                <div className="absolute inset-0.5 bg-emerald-400 rounded-sm" style={{ width: '70%' }} />
              </div>
            </div>
          </div>
          {children}
        </div>
      </div>
      {(title || badge) && (
        <div className="flex items-center justify-center gap-2 mt-3">
          {badge && <span className="px-2.5 py-1 bg-sky-100 text-sky-700 text-[10px] font-bold rounded-full tracking-wide">{badge}</span>}
          {title && <p className="text-sm text-slate-500 font-medium">{title}</p>}
        </div>
      )}
    </div>
  );
}

/* Cornice telefono per le screen che non usano AppScreen */
function PhoneFrame({ children, badge, caption, fixedHeight = 620 }) {
  return (
    <div className="w-full max-w-[380px] mx-auto select-none">
      {/* Cornice esterna telefono */}
      <div style={{
        background: "linear-gradient(145deg, #1e293b 0%, #0f172a 100%)",
        borderRadius: 36,
        padding: "10px 8px 14px",
        boxShadow: "0 25px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.1)",
        position: "relative"}}>
        {/* Notch / Dynamic Island */}
        <div style={{
          width: 90, height: 24,
          background: "#0f172a",
          borderRadius: 12,
          margin: "0 auto 6px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#1e293b",border:"1px solid #334155"}}/>
          <div style={{width:40,height:5,borderRadius:3,background:"#1e293b",border:"1px solid #334155"}}/>
        </div>
        {/* Schermo — altezza fissa per prevenire layout shift */}
        <div style={{
          borderRadius: 22,
          overflow: "hidden",
          background: "#f8fafc",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
          height: fixedHeight,
          display: "flex",
          flexDirection: "column"}}>
          {/* Status bar */}
          <div style={{
            background: "#0f172a",
            color: "white",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "5px 16px",
            fontSize: 10,
            fontWeight: 600,
            flexShrink: 0}}>
            <span>9:41</span>
            <div style={{display:"flex",gap:5,alignItems:"center"}}>
              {/* Signal */}
              <svg width="14" height="10" viewBox="0 0 14 10" fill="white">
                <rect x="0" y="6" width="2" height="4" rx="0.5" opacity="0.4"/>
                <rect x="3" y="4" width="2" height="6" rx="0.5" opacity="0.6"/>
                <rect x="6" y="2" width="2" height="8" rx="0.5" opacity="0.8"/>
                <rect x="9" y="0" width="2" height="10" rx="0.5"/>
              </svg>
              {/* Battery */}
              <div style={{width:20,height:10,border:"1.5px solid rgba(255,255,255,0.6)",borderRadius:2,position:"relative",display:"flex",alignItems:"center",padding:"1px"}}>
                <div style={{flex:1,height:"100%",background:"#4ade80",borderRadius:1}}/>
                <div style={{width:2,height:5,background:"rgba(255,255,255,0.5)",borderRadius:"0 1px 1px 0",marginLeft:1,flexShrink:0}}/>
              </div>
            </div>
          </div>
          {/* Contenuto — flex-1 con overflow hidden */}
          <div style={{flex:1,overflow:"hidden",position:"relative"}}>
            {children}
          </div>
        </div>
        {/* Pulsanti laterali */}
        <div style={{position:"absolute",left:-3,top:70,width:3,height:28,background:"#334155",borderRadius:"2px 0 0 2px"}}/>
        <div style={{position:"absolute",left:-3,top:108,width:3,height:44,background:"#334155",borderRadius:"2px 0 0 2px"}}/>
        <div style={{position:"absolute",left:-3,top:162,width:3,height:44,background:"#334155",borderRadius:"2px 0 0 2px"}}/>
        <div style={{position:"absolute",right:-3,top:100,width:3,height:60,background:"#334155",borderRadius:"0 2px 2px 0"}}/>
      </div>
      {/* Badge/caption sotto */}
      {(badge||caption) && (
        <div className="flex items-center justify-center gap-2 mt-3">
          {badge && <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full tracking-wide uppercase">{badge}</span>}
          {caption && <p className="text-xs text-slate-500 font-medium">{caption}</p>}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, icon: Ic }) {
  return (
    <div className="mb-2.5">
      <label className="text-[10px] font-semibold text-slate-500 block mb-1 tracking-wide uppercase">{label}</label>
      <div className="border border-slate-200 rounded-xl px-3 py-2.5 text-[12px] text-slate-700 bg-slate-50/80 flex items-center gap-2">
        {Ic && <span className="text-slate-400 flex-shrink-0"><Ic className="w-3.5 h-3.5" /></span>}
        <span>{value}</span>
      </div>
    </div>
  );
}

// Cursore che segue un ref reale
function SmartCursor({ targetRef, clicking = false, visible = true }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  useEffect(() => {
    if (!targetRef?.current || !containerRef.current) return;
    const updatePos = () => {
      const target = targetRef.current.getBoundingClientRect();
      const container = containerRef.current.getBoundingClientRect();
      setPos({
        x: target.left - container.left + target.width / 2,
        y: target.top - container.top + target.height / 2,
      });
    };
    updatePos();
    window.addEventListener('resize', updatePos);
    return () => window.removeEventListener('resize', updatePos);
  }, [targetRef]);

  if (!visible) return <div ref={containerRef} style={{position:'absolute',inset:0,pointerEvents:'none'}}/>;

  return (
    <div ref={containerRef} style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:20}}>
      <div style={{
        position:'absolute',
        left: pos.x,
        top: pos.y,
        transform: `translate(-4px,-2px) scale(${clicking?0.8:1})`,
        transition: 'left 0.5s cubic-bezier(0.34,1.3,0.64,1), top 0.5s cubic-bezier(0.34,1.3,0.64,1), transform 0.15s',
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'}}>
        <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
          <path d="M2 2L2 18L6.5 13L9 20L12 18.5L9.5 12H15Z" fill="white" stroke="#1e293b" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
        {clicking && (
          <div style={{
            position:'absolute', top:0, left:0, width:28, height:28,
            border:'2px solid #6366F1', borderRadius:'50%',
            animation:'ripple 0.5s ease-out forwards',
            transform:'translate(-3px,-3px)'}}/>
        )}
      </div>
    </div>
  );
}



// Didascalia sotto la screen — si aggiorna in sync con l'animazione
function StepCaption({ captions, phase, visible }) {
  const items = captions || [];
  if (!items.length) return null;
  const current = items[Math.min(phase, items.length - 1)];
  return (
    <div style={{
      marginTop: 12,
      minHeight: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.4s ease'}}>
      {/* Step dots */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {items.map((_, i) => (
          <div key={i} style={{
            width: i === Math.min(phase, items.length-1) ? 18 : 6,
            height: 6,
            borderRadius: 3,
            background: i === Math.min(phase, items.length-1) ? current.color : '#e2e8f0',
            transition: 'all 0.4s ease'}}/>
        ))}
      </div>
      {/* Testo */}
      <p style={{
        fontSize: 12,
        color: '#475569',
        fontWeight: 500,
        margin: 0,
        transition: 'opacity 0.3s ease'}}>
        <span style={{ color: current.color, fontWeight: 700 }}>{current.icon} </span>
        {current.text}
      </p>
    </div>
  );
}

// Alias per compatibilità (sarà rimosso dalle screen)
function FocusBadge() { return null; }

// Didascalia dentro la screen — barra colorata in basso

// Didascalia animata sotto ogni screen

// Highlight ring intorno a un ref
function HighlightRing({ targetRef, color = "#6366F1", visible, pulse = true }) {
  const [rect, setRect] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!targetRef?.current || !containerRef.current) return;
    const update = () => {
      const t = targetRef.current.getBoundingClientRect();
      const c = containerRef.current.getBoundingClientRect();
      setRect({ left: t.left-c.left-4, top: t.top-c.top-4, width: t.width+8, height: t.height+8 });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [targetRef, visible]);

  return (
    <div ref={containerRef} style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:15}}>
      {visible && rect && (
        <div style={{
          position:'absolute',
          left: rect.left, top: rect.top,
          width: rect.width, height: rect.height,
          borderRadius: 14,
          border: `2px solid ${color}`,
          boxShadow: `0 0 0 4px ${color}22`,
          animation: pulse ? 'ringPulse 1.5s ease-in-out infinite' : 'none',
          transition: 'all 0.4s ease'}}/>
      )}
    </div>
  );
}

function SectionTag({ n, label, color = "#0EA5E9", icon: Ic }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-lg" style={{ background: color }}>
        {Ic ? <Ic className="w-5 h-5" /> : n}
      </div>
      <span className="text-xs font-bold uppercase tracking-widest" style={{ color }}>{label}</span>
    </div>
  );
}

function TimelineStep({ n, title, desc, color = "#0EA5E9", last = false }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg flex-shrink-0" style={{ background: color }}>{n}</div>
        {!last && <div className="w-0.5 flex-1 bg-slate-200 mt-2 min-h-[24px]" />}
      </div>
      <div className={`${last ? "" : "pb-6"} flex-1`}>
        <h4 className="font-bold text-slate-800 text-[15px] leading-tight">{title}</h4>
        <p className="text-slate-500 text-[13px] mt-1.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function Accordion({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden mb-3 bg-white">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors">
        <span className="font-semibold text-slate-700 text-[14px]">{title}</span>
        <Icons.chevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-400 ease-in-out ${open ? "max-h-[400px]" : "max-h-0"}`}>
        <div className="px-5 pb-5 text-[13px] text-slate-500 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

/* ═══ APP MOCKUP SCREENS ═══ */
/* ═══ ANIMATED DEMO SCREENS ═══ */

// Cursore SVG animato che si sposta
function LiveCursor({ x, y, clicking = false }) {
  return (
    <div style={{ position:"absolute", left:`${x}%`, top:`${y}%`, zIndex:30, pointerEvents:"none",
      transition:"left 0.6s cubic-bezier(0.25,0.46,0.45,0.94), top 0.6s cubic-bezier(0.25,0.46,0.45,0.94)",
      transform: clicking ? "scale(0.75)" : "scale(1)", transitionProperty:"left,top,transform"}}>
      <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
        <path d="M1 1L1 15L4.5 11L6.5 16.5L8.5 15.5L6.5 10H11Z" fill="white" stroke="#1e293b" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

// Badge tooltip che appare sopra un elemento
function LiveTooltip({ text, color = "#0EA5E9", visible, x, y }) {
  return (
    <div style={{
      position:"absolute", left:`${x}%`, top:`${y}%`,
      background: color, color:"white", fontSize:9, fontWeight:700,
      padding:"3px 8px", borderRadius:6, whiteSpace:"nowrap",
      boxShadow:"0 2px 8px rgba(0,0,0,0.2)",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0) scale(1)" : "translateY(4px) scale(0.9)",
      transition:"all 0.3s ease",
      zIndex:25, pointerEvents:"none"}}>{text}</div>
  );
}

// Hook per timeline animata ciclica
function useTimeline(steps, loop = true) {
  const [step, setStep] = useState(0);
  const [ref, vis] = useVis(0.1);
  useEffect(() => {
    if (!vis) return;
    let s = 0;
    const run = () => {
      s = (s + 1) % steps.length;
      setStep(s);
    };
    const timers = [];
    let cumulative = 0;
    const schedule = (startFrom = 0) => {
      steps.forEach((dur, i) => {
        const t = setTimeout(() => { setStep(i); }, cumulative);
        timers.push(t);
        cumulative += dur;
      });
      if (loop) {
        const loopT = setTimeout(() => { cumulative = 0; setStep(0); schedule(); }, cumulative);
        timers.push(loopT);
      }
    };
    schedule();
    return () => timers.forEach(clearTimeout);
  }, [vis]);
  return [ref, step];
}

/* SCREEN REG — demo: cursore va su campo → appare testo → clicca registrati */
function ScreenReg() {
  const [ref, vis] = useVis(0.1);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!vis) return;
    const timers = [];
    const seq = [0,0,1200,2400,3600,4800,6000,7200,8400,10000];
    seq.forEach((t,i) => { timers.push(setTimeout(() => setStep(i), t)); });
    timers.push(setTimeout(() => setStep(0), 7200));
    const loop = setInterval(() => {
      setStep(0);
      seq.forEach((t,i) => { timers.push(setTimeout(() => setStep(i), t)); });
    }, 8000);
    return () => { timers.forEach(clearTimeout); clearInterval(loop); };
  }, [vis]);

  const fields = [
    { label:"Nome e Cognome *", value:"Mario Rossi", icon:Icons.user },
    { label:"Email *", value:"mario.rossi@email.com", icon:Icons.mail },
    { label:"Telefono *", value:"+39 333 123 4567", icon:Icons.phone },
    { label:"Password *", value:"••••••••", icon:Icons.lock },
  ];
  const activeField = step >= 1 && step <= 4 ? step - 1 : -1;
  const showValues = [step>=1, step>=2, step>=3, step>=4];
  const clicking = step === 6;
  const done = step >= 7;

  // Posizioni cursore per ogni step
  const cursorPos = [
    {x:45,y:60}, // 0 iniziale
    {x:55,y:43}, // 1 campo nome
    {x:55,y:53}, // 2 campo email
    {x:55,y:62}, // 3 telefono
    {x:55,y:71}, // 4 password
    {x:50,y:87}, // 5 verso bottone
    {x:50,y:87}, // 6 click
    {x:50,y:50}, // 7 done
  ];
  const cp = cursorPos[Math.min(step, cursorPos.length-1)];

  return (
    <div ref={ref} style={{position:"relative"}}>
      {vis && <LiveCursor x={cp.x} y={cp.y} clicking={clicking} />}
      <LiveTooltip text="▶ Compilando..." color="#0EA5E9" visible={step>=1 && step<6} x={2} y={2} />
      <LiveTooltip text="✓ Registrato!" color="#10B981" visible={done} x={2} y={2} />
      <AppScreen title="Form Registrazione" badge="STEP 1">
        <div className="p-5">
          <div className="text-center mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center mx-auto mb-2 shadow-lg shadow-sky-200">
              <span className="text-white text-lg font-bold">C</span>
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Crea il tuo Account</h3>
            <p className="text-[10px] text-slate-400">Nessuna verifica email — accesso immediato</p>
          </div>
          {fields.map((f, i) => (
            <div key={i} className="mb-2">
              <label className="text-[9px] font-semibold text-slate-500 block mb-0.5 uppercase tracking-wide pl-1">{f.label}</label>
              <div className={`border-2 rounded-xl px-3 py-2 text-[11px] flex items-center gap-2 transition-all ${activeField===i ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-slate-50/80 text-slate-700"}`}>
                <f.icon className="w-3 h-3 text-slate-400 flex-shrink-0" />
                <span className={showValues[i] ? "text-slate-800" : "text-transparent"} style={{minWidth:1}}>
                  {showValues[i] ? f.value : "‎"}
                </span>
                {activeField===i && <span style={{animation:"blink 1s infinite",marginLeft:"auto",color:"#0EA5E9",fontSize:12}}>|</span>}
              </div>
            </div>
          ))}
          <button className={`w-full text-white text-center py-2.5 rounded-xl text-[12px] font-bold mt-2 flex items-center justify-center gap-2 transition-all ${done ? "bg-emerald-500 shadow-lg shadow-emerald-200/50" : clicking ? "bg-blue-700 scale-95" : "bg-gradient-to-r from-sky-500 to-blue-600 shadow-lg shadow-sky-200/50"}`}>
            {done ? <><Icons.check className="w-3.5 h-3.5" /> Account creato!</> : <>Registrati <Icons.arrowRight className="w-3.5 h-3.5" /></>}
          </button>
        </div>
      </AppScreen>
    </div>
  );
}

function ScreenContratto() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  const scrollRef = useRef(null);
  const nomeRef = useRef(null);
  const cfRef = useRef(null);
  const firmaRef = useRef(null);
  const selfieRef = useRef(null);
  const btnRef = useRef(null);

  // Testo che appare carattere per carattere
  const nomeTarget = "Mario Rossi";
  const cfTarget = "RSSMRA80A01H501Z";
  const [nomeText, setNomeText] = useState("");
  const [cfText, setCfText] = useState("");

  useEffect(() => {
    if (!vis) { setPhase(0); setNomeText(""); setCfText(""); return; }
    const timers = [];
    const loop = setInterval(() => {
      setPhase(0);
      setNomeText("");
      setCfText("");
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      schedule(timers);
    }, 16000);
    schedule(timers);
    return () => { timers.forEach(t => { clearTimeout(t); clearInterval(t); }); clearInterval(loop); };
  }, [vis]);

  function schedule(timers) {
    // Fase 0 → 1: scroll automatico del contratto (lento, 2s)
    timers.push(setTimeout(() => {
      setPhase(1);
      if (scrollRef.current) scrollRef.current.scrollTo({ top: 220, behavior: "smooth" });
    }, 1200));
    // Fase 2: cursore su Nome
    timers.push(setTimeout(() => setPhase(2), 3200));
    // Fase 3: digita Nome lettera per lettera
    nomeTarget.split("").forEach((ch, i) => {
      timers.push(setTimeout(() => setNomeText(nomeTarget.slice(0, i + 1)), 3800 + i * 80));
    });
    timers.push(setTimeout(() => setPhase(3), 3800 + nomeTarget.length * 80));
    // Fase 4: cursore su CF
    timers.push(setTimeout(() => setPhase(4), 5200));
    // Fase 5: digita CF
    cfTarget.split("").forEach((ch, i) => {
      timers.push(setTimeout(() => setCfText(cfTarget.slice(0, i + 1)), 5800 + i * 60));
    });
    timers.push(setTimeout(() => setPhase(5), 5800 + cfTarget.length * 60));
    // Fase 6: cursore su firma
    timers.push(setTimeout(() => setPhase(6), 7500));
    // Fase 7: firma si disegna (strokeDashoffset)
    timers.push(setTimeout(() => setPhase(7), 8100));
    // Fase 8: cursore su selfie
    timers.push(setTimeout(() => setPhase(8), 9800));
    // Fase 9: camera aperta → cerchio verde pulsante
    timers.push(setTimeout(() => setPhase(9), 10400));
    // Fase 10: selfie acquisito
    timers.push(setTimeout(() => setPhase(10), 11600));
    // Fase 11: cursore su bottone
    timers.push(setTimeout(() => setPhase(11), 12400));
    // Fase 12: click
    timers.push(setTimeout(() => setPhase(12), 13000));
    // Fase 13: done
    timers.push(setTimeout(() => setPhase(13), 13600));
  }

  const done = phase >= 13;
  const activeRef =
    phase <= 1 ? null :
    phase <= 3 ? nomeRef :
    phase <= 5 ? cfRef :
    phase <= 7 ? firmaRef :
    phase <= 10 ? selfieRef :
    btnRef;

  const scrollOpacity = phase >= 1 ? 0 : 1;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", width: "100%" }}>
      {vis && activeRef && <SmartCursor targetRef={activeRef} clicking={phase === 2 || phase === 4 || phase === 6 || phase === 8 || phase === 11} visible={true} />}
      

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-3.5 text-white">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold">Firma Contratto Quadro</h2>
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6L18 18" /></svg>
            </div>
          </div>
          <div className="flex gap-1">
            {[0, 1, 2].map(i => <div key={i} className={`flex-1 h-1.5 rounded-full ${i === 0 ? "bg-sky-400" : "bg-white/20"}`} />)}
          </div>
          <p className="text-[10px] text-white/60 mt-1.5">Step 1 di 3 · Contratto</p>
        </div>

        <div className="p-4 space-y-2.5">
          {/* Testo contratto — si scrolla da solo */}
          <div
            ref={scrollRef}
            className="bg-slate-50 rounded-xl border border-slate-200 relative"
            style={{ height: 100, overflowY: "hidden", position: "relative" }}
          >
            <div className="p-3" style={{ minHeight: 300 }}>
              <p className="text-[8px] text-slate-700 font-bold mb-1.5">CONTRATTO QUADRO DI SERVIZIO</p>
              <p className="text-[8px] text-slate-500 leading-relaxed mb-1.5">
                <b>Art. 1 — Oggetto.</b> Il presente contratto regola i termini del servizio di pulizia professionale per immobili a uso turistico/ricettivo fornito da Pulizia Case Vacanze S.r.l.
              </p>
              <p className="text-[8px] text-slate-500 leading-relaxed mb-1.5">
                <b>Art. 2 — Obblighi del Proprietario.</b> Il proprietario si impegna a: (a) garantire l'accesso all'immobile nei tempi concordati; (b) comunicare il numero reale di ospiti entro le 20:00 del giorno precedente; (c) mantenere aggiornati i link iCal di tutte le piattaforme collegate.
              </p>
              <p className="text-[8px] text-slate-500 leading-relaxed mb-1.5">
                <b>Art. 3 — Corrispettivo.</b> Il corrispettivo per ogni pulizia è stabilito nell'Allegato D specifico per ciascun immobile. Il pagamento avviene tramite addebito mensile posticipato.
              </p>
              <p className="text-[8px] text-slate-500 leading-relaxed mb-1.5">
                <b>Art. 4 — Durata e Recesso.</b> Il contratto ha durata indeterminata. Ciascuna parte può recedere con preavviso scritto di 30 giorni. In caso di inadempimento grave il contratto si risolve con effetto immediato.
              </p>
              <p className="text-[8px] text-slate-500 leading-relaxed">
                <b>Art. 5 — Privacy.</b> I dati personali sono trattati nel rispetto del GDPR 679/2016. Il titolare del trattamento è Pulizia Case Vacanze S.r.l.
              </p>
            </div>
            {/* Fade che svanisce quando lo scroll arriva in fondo */}
            <div
              className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none"
              style={{ opacity: scrollOpacity, transition: "opacity 1s ease" }}
            />
          </div>

          {/* Nome */}
          <div>
            <label className="block text-[9px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Nome Firmatario *</label>
            <div
              ref={nomeRef}
              className={`border-2 rounded-xl px-3 py-2 text-[11px] flex items-center gap-2 transition-all duration-300
                ${phase >= 2 && phase <= 3 ? "border-indigo-400 bg-indigo-50/50" : phase > 3 ? "border-indigo-200 bg-slate-50" : "border-slate-200 bg-slate-50"}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3 text-slate-400 flex-shrink-0"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              <span className="text-slate-800">{nomeText}</span>
              {(phase === 2 || phase === 3) && <span style={{ animation: "blink 0.8s infinite", color: "#6366F1", fontSize: 14 }}>|</span>}
            </div>
          </div>

          {/* CF */}
          <div>
            <label className="block text-[9px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Codice Fiscale *</label>
            <div
              ref={cfRef}
              className={`border-2 rounded-xl px-3 py-2 text-[11px] flex items-center gap-2 transition-all duration-300
                ${phase >= 4 && phase <= 5 ? "border-indigo-400 bg-indigo-50/50" : phase > 5 ? "border-indigo-200 bg-slate-50" : "border-slate-200 bg-slate-50"}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3 text-slate-400 flex-shrink-0"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
              <span className="text-slate-800 font-mono text-[10px]">{cfText}</span>
              {(phase === 4 || phase === 5) && <span style={{ animation: "blink 0.8s infinite", color: "#6366F1", fontSize: 14 }}>|</span>}
            </div>
          </div>

          {/* Firma */}
          <div>
            <label className="block text-[9px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Firma Digitale *</label>
            <div
              ref={firmaRef}
              className={`border-2 rounded-xl h-14 flex items-center justify-center transition-all duration-300
                ${phase >= 6 && phase <= 7 ? "border-purple-400 bg-purple-50/20" : phase >= 7 ? "border-purple-300 bg-purple-50/30" : "border-dashed border-slate-300 bg-slate-50"}`}
            >
              {phase >= 7 ? (
                <svg width="160" height="36" viewBox="0 0 160 36">
                  <path
                    d="M8,26 Q22,6 42,20 Q62,34 82,12 Q102,0 128,20 Q142,30 154,16"
                    stroke="#6366F1"
                    strokeWidth="2.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="220"
                    strokeDashoffset={phase === 7 ? "220" : "0"}
                    style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)" }}
                  />
                </svg>
              ) : (
                <span className="text-[9px] text-slate-400 flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5"><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z" /></svg>
                  Firma con il dito o il mouse
                </span>
              )}
            </div>
          </div>

          {/* Selfie */}
          <div>
            <label className="block text-[9px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Selfie del volto *</label>
            <div
              ref={selfieRef}
              className={`border-2 rounded-xl overflow-hidden
                ${phase >= 8 ? "border-emerald-400" : "border-dashed border-slate-300"}`}
              style={{ height: 88, flexShrink: 0, flexGrow: 0 }}
            >
              {phase >= 10 ? (
                /* Selfie acquisito */
                <div style={{ height: "100%", background: "linear-gradient(160deg,#1e293b 0%,#0f172a 100%)", position: "relative", animation: "fadeIn 0.5s ease" }}>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    {/* Silhouette volto */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#fbbf24,#f59e0b)", border: "2px solid rgba(255,255,255,0.25)", marginBottom: 3 }} />
                      <div style={{ width: 52, height: 16, borderRadius: "26px 26px 0 0", background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }} />
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 9 }}>
                      <p style={{ fontWeight: 700, marginBottom: 2 }}>Mario Rossi</p>
                      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 8 }}>Selfie verificato</p>
                    </div>
                  </div>
                  <div style={{ position: "absolute", top: 6, right: 8, background: "#10B981", borderRadius: 20, padding: "2px 8px", fontSize: 9, fontWeight: 700, color: "white", display: "flex", alignItems: "center", gap: 3 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" style={{ width: 9, height: 9 }}><path d="M5 13L9 17L19 7" /></svg>
                    Acquisito
                  </div>
                </div>
              ) : phase >= 9 ? (
                /* Camera aperta */
                <div style={{ height: "100%", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <div style={{ width: 50, height: 50, borderRadius: "50%", border: "2.5px solid #10B981", display: "flex", alignItems: "center", justifyContent: "center", animation: "ringPulse 1s ease-in-out infinite" }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", border: "1.5px solid rgba(16,185,129,0.4)" }} />
                  </div>
                  <p style={{ position: "absolute", bottom: 5, fontSize: 8, color: "rgba(255,255,255,0.5)", textAlign: "center", width: "100%" }}>Inquadra il volto</p>
                </div>
              ) : phase >= 8 ? (
                /* Camera che si apre */
                <div style={{ height: "100%", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 0.3s" }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)" }} />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center gap-2 bg-slate-50">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-slate-400"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" /></svg>
                  <span className="text-[9px] text-slate-400">Scatta selfie del solo volto</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <InlineCaption
          icon={phase<=1?"📄":phase<=5?"✍️":phase<=7?"✒️":phase<=10?"📷":"✅"}
          text={phase<=1?"Il testo del contratto scorre automaticamente":phase<=3?"Inserisci il tuo nome completo":phase<=5?"Inserisci il codice fiscale":phase<=7?"Disegna la tua firma":phase<=9?"Scatta il selfie del solo volto":done?"Contratto firmato con successo!":"Clicca per confermare la firma"}
          color={done?"#10B981":phase>=8?"#10B981":"#6366F1"}
          visible={vis}
        />
        <div className="px-4 pb-4">
          <button
            ref={btnRef}
            className={`w-full py-3 rounded-xl text-sm font-bold text-white shadow-lg transition-all duration-300
              ${done ? "bg-emerald-500 shadow-emerald-200/50" : phase === 12 ? "scale-95 bg-indigo-700" : "bg-gradient-to-r from-indigo-500 to-purple-600 shadow-indigo-200/40"}`}
          >
            {done ? "✓ Contratto Firmato!" : "Firma e Continua →"}
          </button>
        </div>
      </div>

    </div>
  );
}

function ScreenFatturazione() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  const tabFisicaRef = useRef(null);
  const tabAziendaRef = useRef(null);
  const nomeRef = useRef(null);
  const cfRef = useRef(null);
  const pIvaRef = useRef(null);
  const btnRef = useRef(null);

  // phase:
  // 0 = idle, tab Persona Fisica attivo
  // 1 = cursore su tab Azienda
  // 2 = click — tab Azienda attivo, campi cambiano
  // 3 = cursore torna su tab Persona Fisica
  // 4 = click — torna a Persona Fisica
  // 5 = cursore su campo Nome
  // 6 = nome compilato
  // 7 = cursore su CF
  // 8 = CF compilato
  // 9 = cursore su bottone Salva
  // 10 = click — done

  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0, 0, 1400, 2600, 4000, 5200, 6400, 7600, 9000, 10200, 11400, 12400];
    const timers = seq.map((t,i) => setTimeout(() => setPhase(i), t));
    const loop = setInterval(() => {
      setPhase(0);
      seq.forEach((t,i) => { timers.push(setTimeout(() => setPhase(i), t)); });
    }, 15000);
    return () => { timers.forEach(clearTimeout); clearInterval(loop); };
  }, [vis]);

  const isAzienda = phase >= 2 && phase < 4;
  const done = phase >= 10;

  const activeRef =
    phase === 1 ? tabAziendaRef :
    phase >= 3 && phase < 5 ? tabFisicaRef :
    phase >= 5 && phase < 7 ? nomeRef :
    phase >= 7 && phase < 9 ? cfRef :
    phase >= 9 ? btnRef : null;

  const clicking = phase === 2 || phase === 4 || phase === 10;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", width: "100%" }}>
      {vis && activeRef && (
        <SmartCursor targetRef={activeRef} clicking={clicking} visible={true} />
      )}
      

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-3.5 text-white">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold">Dati di Fatturazione</h2>
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6L18 18"/></svg>
            </div>
          </div>
          <div className="flex gap-1">
            {[0,1,2].map(i => <div key={i} className={`flex-1 h-1.5 rounded-full ${i<=1?"bg-emerald-400":"bg-white/20"}`}/>)}
          </div>
          <p className="text-[10px] text-white/60 mt-1.5">Step 2 di 3 · Fatturazione</p>
        </div>

        <div className="p-4 space-y-3">
          {/* Titolo step */}
          <div className="text-center mb-1">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-xl flex items-center justify-center mx-auto mb-1.5">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
              </svg>
            </div>
            <h3 className="text-sm font-bold text-slate-800">Dati di Fatturazione</h3>
          </div>

          {/* Tab switch Persona Fisica / Azienda */}
          <div className="flex rounded-xl border border-slate-200 overflow-hidden">
            <button
              ref={tabFisicaRef}
              className={`flex-1 py-2.5 text-xs font-bold transition-all duration-300 ${!isAzienda ? "bg-slate-800 text-white" : "bg-white text-slate-500"}`}
            >
              Persona Fisica
            </button>
            <button
              ref={tabAziendaRef}
              className={`flex-1 py-2.5 text-xs font-bold transition-all duration-300 ${isAzienda ? "bg-slate-800 text-white" : "bg-white text-slate-500"}`}
            >
              Azienda
            </button>
          </div>

          {/* Campi — cambiano in base al tab */}
          {!isAzienda ? (
            <div className="space-y-2.5" style={{ animation: "fadeIn 0.3s ease" }}>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nome *</label>
                <div ref={nomeRef} className={`border-2 rounded-xl px-3 py-2.5 text-sm flex items-center gap-2 transition-all ${phase >= 5 && phase <= 6 ? "border-emerald-400 bg-emerald-50/30" : phase > 6 ? "border-emerald-200" : "border-slate-200"} bg-slate-50`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-slate-400 flex-shrink-0"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <span className="text-slate-800 text-sm">{phase >= 6 ? "Mario" : ""}</span>
                  {phase === 5 && <span style={{ animation: "blink 0.8s infinite", color: "#10B981", fontSize: 14 }}>|</span>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cognome *</label>
                <div className="border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-slate-400 flex-shrink-0"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <span className="text-slate-800">{phase >= 6 ? "Rossi" : ""}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Codice Fiscale *</label>
                <div ref={cfRef} className={`border-2 rounded-xl px-3 py-2.5 text-sm flex items-center gap-2 transition-all ${phase >= 7 && phase <= 8 ? "border-emerald-400 bg-emerald-50/30" : phase > 8 ? "border-emerald-200" : "border-slate-200"} bg-slate-50`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-slate-400 flex-shrink-0"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                  <span className="font-mono text-xs text-slate-800">{phase >= 8 ? "RSSMRA80A01H501Z" : ""}</span>
                  {phase === 7 && <span style={{ animation: "blink 0.8s infinite", color: "#10B981", fontSize: 14 }}>|</span>}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5" style={{ animation: "fadeIn 0.3s ease" }}>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-xs text-blue-700">📧 Il referente riceverà le credenziali di accesso via email.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Ragione Sociale *</label>
                <div ref={pIvaRef} className="border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-slate-400 flex-shrink-0"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01"/></svg>
                  <span className="text-slate-400 text-sm">es. Rossi Immobiliare S.r.l.</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Partita IVA *</label>
                <div className="border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-slate-400 flex-shrink-0"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                  <span className="text-slate-400 text-sm font-mono">IT00000000000</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Codice SDI / PEC</label>
                <div className="border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-slate-400 flex-shrink-0"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/></svg>
                  <span className="text-slate-400 text-sm">XXXXXXX</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <InlineCaption
          icon={phase<=1?"💳":phase<=3?"🏢":phase<=4?"👤":phase<=6?"✍️":phase<=8?"🪪":"✅"}
          text={phase===0?"Scegli il tipo di fatturazione":phase<=2?"Modalità Azienda: inserisci P.IVA e SDI":phase<=3?"Torna a Persona Fisica":phase<=4?"Modalità Persona Fisica attiva":phase<=6?"Compila nome e cognome":phase<=8?"Inserisci il codice fiscale":done?"Dati salvati correttamente":"Clicca per salvare"}
          color={done?"#10B981":"#10B981"}
          visible={vis}
        />
        <div className="px-4 pb-4">
          <button
            ref={btnRef}
            className={`w-full py-3 rounded-xl text-sm font-bold text-white shadow-lg transition-all duration-300 ${done ? "bg-emerald-500 shadow-emerald-200/50" : clicking && phase === 10 ? "scale-95 bg-teal-700" : "bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-200/40"}`}
          >
            {done ? "✓ Dati Salvati!" : "Salva Dati Fatturazione →"}
          </button>
        </div>
      </div>

    </div>
  );
}

function ScreenAttesa() {
  return (
    <AppScreen title="In attesa di approvazione" badge="STEP 4">
      <div className="p-6 flex flex-col items-center justify-center min-h-[260px]">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
          <Icons.clock className="w-8 h-8 text-amber-500" />
        </div>
        <h3 className="font-bold text-slate-800 text-[15px] text-center mb-2">Account in Revisione</h3>
        <p className="text-[12px] text-slate-500 text-center leading-relaxed mb-4">L'admin verificherà i tuoi dati entro 24 ore. Riceverai una notifica appena approvato.</p>
        <div className="w-full bg-slate-100 rounded-full h-1.5 mb-1.5">
          <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: "75%" }} />
        </div>
        <p className="text-[10px] text-slate-400">Verifica in corso...</p>
      </div>
    </AppScreen>
  );
}

/* ═══ 6 STEP PROPRIETÀ — APPROCCIO FOCUSATO ═══ */

/*
  Nuovo approccio: ogni screen mostra UNA SOLA AZIONE alla volta.
  Il cursore usa refs per posizionarsi esattamente sopra l'elemento reale.
  Niente scroll — ogni screen è autocontenuta e statica tra le animazioni.
*/

// Wrapper schermata con dimensione fissa — PREVIENE layout shift
function ScreenWrapper({ children, minH = 520 }) {
  return (
    <div style={{
      position: "relative",
      minHeight: minH,
      contain: "layout",
      willChange: "transform"}}>
      {children}
    </div>
  );
}


function InlineCaption({ text, icon, color, visible }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 16px",
      background: visible ? color + "12" : "transparent",
      borderTop: visible ? "1px solid " + color + "30" : "1px solid transparent",
      minHeight: 40,
      transition: "background 0.4s ease, border-color 0.4s ease"}}>
      <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
      <p style={{
        fontSize: 12,
        fontWeight: 600,
        color: visible ? color : "#94a3b8",
        margin: 0,
        transition: "color 0.4s ease",
        lineHeight: 1.4}}>{text}</p>
    </div>
  );
}

/* ── STEP 1: Info Base ── */
function ScreenStep1() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  /*
    0 = form vuoto, cursore sul campo Nome
    1 = Nome evidenziato, cursor sopra
    2 = Nome compilato "Appartamento Colosseo"
    3 = cursore si sposta su Indirizzo
    4 = Indirizzo compilato + badge verde "Coordinate salvate"
    5 = Piano/Citofono compilati
    6 = cursore su Avanti, bottone highlight
    7 = done
  */
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1400,2800,4200,5600,7000,8400,10500];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{
      setPhase(0);
      seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); });
    },9500);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const nomeRef = useRef(null);
  const indirizzoRef = useRef(null);
  const pianoRef = useRef(null);
  const avantiBtnRef = useRef(null);

  const activeRef = phase<=2 ? nomeRef : phase<=4 ? indirizzoRef : phase<=5 ? pianoRef : avantiBtnRef;
  const clicking = phase===6;
  const done = phase>=7;

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      <SmartCursor targetRef={activeRef} clicking={clicking} visible={vis && phase>=1} />
      

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-3.5 text-white">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold">Nuova Proprietà</h2>
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6L18 18"/></svg>
            </div>
          </div>
          <div className="flex gap-1">
            {[0,1,2,3,4,5].map(i=><div key={i} className={`flex-1 h-1.5 rounded-full ${i===0?'bg-emerald-400':'bg-white/20'}`}/>)}
          </div>
          <p className="text-[10px] text-white/60 mt-1.5">Step 1 di 6 · Info</p>
        </div>

        {/* Body */}
        <div className="px-5 pt-4 pb-3 space-y-3">
          <div className="text-center mb-1">
            <div className="w-10 h-10 bg-gradient-to-br from-sky-400 to-blue-600 rounded-xl flex items-center justify-center mx-auto mb-1.5">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
            </div>
            <h3 className="text-sm font-bold text-slate-800">Informazioni Base</h3>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nome Proprietà *</label>
            <input ref={nomeRef} readOnly
              value={phase>=2?"Appartamento Colosseo":""}
              placeholder="es. Appartamento Colosseo"
              className={`w-full px-3.5 py-2.5 bg-slate-50 border-2 rounded-xl text-sm transition-all outline-none
                ${phase>=1&&phase<=2?"border-indigo-400 bg-indigo-50/30":phase>=2?"border-indigo-200":"border-slate-200"}`}/>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Indirizzo *</label>
            <input ref={indirizzoRef} readOnly
              value={phase>=4?"Via del Corso 100, Roma":""}
              placeholder="Inizia a digitare..."
              className={`w-full px-3.5 py-2.5 bg-slate-50 border-2 rounded-xl text-sm transition-all outline-none
                ${phase>=3&&phase<=4?"border-indigo-400 bg-indigo-50/30":phase>=4?"border-indigo-200":"border-slate-200"}`}/>
            {phase>=4&&(
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1" style={{animation:'fadeIn 0.3s'}}>
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/></svg>
                Coordinate salvate
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Piano *</label>
              <input ref={pianoRef} readOnly
                value={phase>=5?"3":""}
                placeholder="3"
                className={`w-full px-3.5 py-2.5 bg-slate-50 border-2 rounded-xl text-sm outline-none transition-all
                  ${phase===5?"border-indigo-400 bg-indigo-50/30":phase>=5?"border-indigo-200":"border-slate-200"}`}/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Citofono *</label>
              <input readOnly
                value={phase>=5?"Rossi":""}
                placeholder="Rossi"
                className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm outline-none"/>
            </div>
          </div>
        </div>

        <InlineCaption
          icon={phase<=2?"🏠":phase<=4?"📍":phase<=5?"🏢":"➡️"}
          text={phase<=1?"Inserisci il nome della struttura":phase<=2?"Nome compilato":phase<=3?"Indirizzo: inizia a digitare...":phase<=4?"Coordinate GPS rilevate":phase<=5?"Piano e citofono compilati":"Tutti i campi completati"}
          color={phase>=4?"#10B981":"#6366F1"}
          visible={vis}
        />
        <div className="px-5 pb-4 flex gap-2.5">
          <button className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-500">Indietro</button>
          <button ref={avantiBtnRef}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all
              ${done?"bg-emerald-500 shadow-lg shadow-emerald-200":clicking?"bg-blue-700 scale-95":"bg-gradient-to-r from-blue-500 to-blue-600 shadow-lg shadow-blue-200/40"}`}>
            {done?"✓ Salvato":"Avanti →"}
          </button>
        </div>
      </div>

    </div>
  );
}

/* ── STEP 2: Capacità ── */
function ScreenStep2() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1200,2400,3600,4800,6000,8000];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{
      setPhase(0);
      seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); });
    },7800);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const plusOspitiRef = useRef(null);
  const plusBagniRef = useRef(null);
  const avantiBtnRef = useRef(null);

  const guests = phase>=4?4:phase>=3?3:phase>=2?2:phase>=1?2:4;
  const baths = phase>=6?2:1;
  const activeRef = phase<=4?plusOspitiRef:phase<=6?plusBagniRef:avantiBtnRef;
  const clicking = phase===1||phase===2||phase===3||phase===5||phase===6;

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      <SmartCursor targetRef={activeRef} clicking={clicking} visible={vis && phase>=1} />
      

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-3.5 text-white">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold">Nuova Proprietà</h2>
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6L18 18"/></svg></div>
          </div>
          <div className="flex gap-1">{[0,1,2,3,4,5].map(i=><div key={i} className={`flex-1 h-1.5 rounded-full ${i<=1?'bg-emerald-400':'bg-white/20'}`}/>)}</div>
          <p className="text-[10px] text-white/60 mt-1.5">Step 2 di 6 · Capacità</p>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-center mb-1">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-1.5">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            <h3 className="text-sm font-bold text-slate-800">Capacità</h3>
          </div>

          {/* Box ospiti */}
          <div className={`bg-gradient-to-r from-sky-500 to-blue-600 rounded-2xl p-4 text-white transition-all ${phase>=1&&phase<=4?"shadow-lg shadow-blue-300/50":""}`}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-base">Ospiti Massimi</h4>
                <p className="text-xs text-white/80">Capacità totale</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="w-9 h-9 rounded-xl border border-white/30 bg-white/20 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M5 12H19"/></svg>
                </button>
                <span className="w-8 text-center font-bold text-lg">{guests}</span>
                <button ref={plusOspitiRef} className="w-9 h-9 rounded-xl bg-white/30 flex items-center justify-center border border-white/40">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 5V19M5 12H19"/></svg>
                </button>
              </div>
            </div>
          </div>

          {/* Box bagni */}
          <div className={`bg-slate-100 rounded-2xl p-4 transition-all ${phase>=5&&phase<=6?"ring-2 ring-purple-300":""}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                </div>
                <div><h4 className="font-semibold text-slate-800 text-sm">Bagni</h4><p className="text-xs text-slate-500">Numero bagni</p></div>
              </div>
              <div className="flex items-center gap-2">
                <button className="w-9 h-9 rounded-xl border border-slate-300 bg-white flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-500"><path d="M5 12H19"/></svg>
                </button>
                <span className="w-8 text-center font-bold text-base text-slate-800">{baths}</span>
                <button ref={plusBagniRef} className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-white"><path d="M12 5V19M5 12H19"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <InlineCaption
          icon={phase<=4?"👥":"🚿"}
          text={phase===0?"Imposta il numero massimo di ospiti":phase<=3?"Ospiti massimi: "+({1:2,2:3,3:4}[phase]||4):phase<=6?"Imposta il numero di bagni":"Capacità configurata"}
          color={phase>=5?"#10B981":"#8B5CF6"}
          visible={vis}
        />
        <div className="px-5 pb-4 flex gap-2.5">
          <button className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-500">Indietro</button>
          <button ref={avantiBtnRef} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-blue-600 shadow-lg shadow-blue-200/40">Avanti →</button>
        </div>
      </div>

    </div>
  );
}

/* ── STEP 3: Orari ── */
function ScreenStep3() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1800,3600,5400,7500];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },7000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const coRef = useRef(null);
  const ciRef = useRef(null);

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      <SmartCursor targetRef={phase<=2?coRef:ciRef} clicking={false} visible={vis && phase>=1} />
      

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-3.5 text-white">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold">Nuova Proprietà</h2>
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6L18 18"/></svg></div>
          </div>
          <div className="flex gap-1">{[0,1,2,3,4,5].map(i=><div key={i} className={`flex-1 h-1.5 rounded-full ${i<=2?'bg-emerald-400':'bg-white/20'}`}/>)}</div>
          <p className="text-[10px] text-white/60 mt-1.5">Step 3 di 6 · Orari</p>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-center mb-1">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center mx-auto mb-1.5">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <h3 className="text-sm font-bold text-slate-800">Orari</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-2xl p-4 border-2 transition-all ${phase>=1&&phase<=2?"border-rose-400 bg-rose-50 shadow-lg shadow-rose-100":"border-rose-100 bg-rose-50"}`}>
              <label className="block text-xs font-semibold text-rose-700 mb-2">Check-out</label>
              <div ref={coRef} className={`w-full px-3 py-2.5 bg-white border-2 rounded-xl text-xl font-bold text-center transition-all ${phase>=1&&phase<=2?"border-rose-400":"border-rose-200"}`}>
                10:00
              </div>
              {phase>=2&&<p className="text-[9px] text-rose-600 font-bold text-center mt-1.5" style={{animation:'fadeIn 0.3s'}}>= Inizio pulizia 🧹</p>}
            </div>

            <div className={`rounded-2xl p-4 border-2 transition-all ${phase>=3&&phase<=4?"border-emerald-400 bg-emerald-50 shadow-lg shadow-emerald-100":"border-emerald-100 bg-emerald-50"}`}>
              <label className="block text-xs font-semibold text-emerald-700 mb-2">Check-in</label>
              <div ref={ciRef} className={`w-full px-3 py-2.5 bg-white border-2 rounded-xl text-xl font-bold text-center transition-all ${phase>=3&&phase<=4?"border-emerald-400":"border-emerald-200"}`}>
                15:00
              </div>
              {phase>=4&&<p className="text-[9px] text-emerald-600 font-bold text-center mt-1.5" style={{animation:'fadeIn 0.3s'}}>= Limite completamento</p>}
            </div>
          </div>

          {phase>=5&&(
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-700" style={{animation:'fadeIn 0.3s'}}>
              <b>Finestra pulizia: 5 ore</b> (10:00→15:00). La pulizia deve essere completata prima del check-in dei nuovi ospiti.
            </div>
          )}
          </div>

        <InlineCaption
          icon={phase<=2?"🚪":phase<=4?"🔑":"✅"}
          text={phase===0?"Imposta orari check-in e check-out":phase<=2?"Check-out ore 10:00 — la pulizia inizia qui":phase<=4?"Check-in ore 15:00 — limite completamento":"Finestra pulizia: 5 ore (10:00 → 15:00)"}
          color={phase>=3?"#10B981":"#EF4444"}
          visible={vis}
        />
        <div className="px-5 pb-4 flex gap-2.5">
          <button className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-500">Indietro</button>
          <button className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-blue-600">Avanti →</button>
        </div>
      </div>

    </div>
  );
}

/* ── STEP 4: Stanze e Letti ── */
function ScreenStep4() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  /*
    0  = vuoto
    1  = cursore su "Aggiungi Stanza"
    2  = click → dropdown aperto, cursore su "Camera Matrimoniale"
    3  = Camera Matrimoniale aggiunta, espansa, cursore sul + Matrimoniale
    4  = click + → Matrimoniale count=1, header=2 posti
    5  = chiude espansione, cursore su "Aggiungi Stanza"
    6  = click → dropdown, cursore su "Camera Singola"
    7  = Camera Singola aggiunta, espansa, cursore sul + Singolo
    8  = click + → Singolo count=1, header=3 posti ✓ (verde)
    9  = cursore su bottone Avanti
    10 = click Avanti → done
  */
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1800,3200,4600,6000,7400,8800,10200,11600,13000,15000];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },17000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const aggiungiRef = useRef(null);
  const camMatrRef = useRef(null);
  const camSingRef = useRef(null);
  const plusMatrRef = useRef(null);
  const plusSingRef = useRef(null);
  const avantiBtnRef4 = useRef(null);

  const showDropdown = phase===1||phase===2||phase===5||phase===6;
  const rooms = [];
  if(phase>=3) rooms.push({
    n:"Camera Matrimoniale",
    cap: phase>=4?2:0,
    matCount: phase>=4?1:0,
    expanded: phase>=3 && phase<5
  });
  if(phase>=7) rooms.push({
    n:"Camera Singola",
    cap: phase>=8?1:0,
    singCount: phase>=8?1:0,
    expanded: phase>=7 && phase<9
  });
  const totalCap = rooms.reduce((s,r)=>s+(r.cap||0),0);
  const enough = totalCap>=2;

  const activeRef = phase>=9 ? avantiBtnRef4
    : showDropdown ? (phase===2?camMatrRef:phase===6?camSingRef:aggiungiRef)
    : phase>=7&&phase<9 ? plusSingRef
    : phase>=3&&phase<5 ? plusMatrRef
    : aggiungiRef;

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      <SmartCursor targetRef={activeRef}
        clicking={phase===1||phase===2||phase===4||phase===5||phase===6||phase===8||phase===9||phase===10}
        visible={vis && phase>=1} />

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-3.5 text-white">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold">Nuova Proprietà</h2>
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6L18 18"/></svg></div>
          </div>
          <div className="flex gap-1">{[0,1,2,3,4,5].map(i=><div key={i} className={`flex-1 h-1.5 rounded-full ${i<=3?'bg-emerald-400':'bg-white/20'}`}/>)}</div>
          <p className="text-[10px] text-white/60 mt-1.5">Step 4 di 6 · Stanze</p>
        </div>
        <div className="p-4 space-y-3">
          {/* Header posti */}
          <div className={`rounded-2xl p-3.5 text-white transition-all ${enough?"bg-gradient-to-r from-violet-500 to-purple-600":"bg-gradient-to-r from-amber-500 to-orange-500"}`}>
            <div className="flex items-center justify-between">
              <div><p className="font-bold text-sm">Stanze e Letti</p><p className="text-xs text-white/80">Configura la struttura</p></div>
              <div className="text-right"><p className="text-3xl font-bold">{totalCap}</p><p className="text-xs text-white/80">posti letto</p></div>
            </div>
            <p className="text-xs text-white/90 mt-1.5 pt-1.5 border-t border-white/20">
              {enough?"✓ Sufficiente per 2 ospiti":"⚠️ Servono almeno 2 posti letto"}
            </p>
          </div>

          {/* Stanze */}
          {rooms.map((r,i)=>(
            <div key={i} className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
              <div className="p-3 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-violet-600"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9H21M9 21V9"/></svg>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{r.n}</p>
                    <p className="text-xs text-slate-500">{r.cap>0?`🛏️ ${r.cap} ${r.cap===1?"posto":"posti"} letto`:"🛏️ Nessun letto"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 text-red-400"><path d="M3 6H21M8 6V4C8 3 9 2 10 2H14C15 2 16 3 16 4V6M19 6V20C19 21 18 22 17 22H7C6 22 5 21 5 20V6H19Z"/></svg></button>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 text-slate-400 transition-transform ${r.expanded?"rotate-180":""}`}><path d="M6 9L12 15L18 9"/></svg>
                </div>
              </div>
              {r.expanded&&(
                <div className="px-3 pb-3 pt-2 border-t border-slate-100 bg-slate-50/50 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Letti:</p>
                  {[
                    {tipo:"Matrimoniale",icon:"🛏️",cap:"2p",count:r.matCount||0,isRef:true},
                    {tipo:"Singolo",icon:"🛏️",cap:"1p",count:r.singCount||0,isRef:r.n==="Camera Singola"},
                    {tipo:"Divano Letto",icon:"🛋️",cap:"2p",count:0,isRef:false},
                    {tipo:"Castello",icon:"🪜",cap:"2p",count:0,isRef:false},
                  ].map((b,j)=>(
                    <div key={j} className={`flex items-center justify-between p-2.5 rounded-xl ${b.count>0?"bg-violet-50 border border-violet-200":"bg-white border border-slate-100"}`}>
                      <div className="flex items-center gap-2"><span className="text-lg">{b.icon}</span>
                        <div><p className={`text-xs font-semibold ${b.count>0?"text-violet-800":"text-slate-700"}`}>{b.tipo}</p><p className="text-[10px] text-slate-400">{b.cap}</p></div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button className={`w-8 h-8 rounded-lg flex items-center justify-center ${b.count>0?"bg-white border border-violet-200 text-violet-600":"bg-slate-100 border border-slate-200 text-slate-300"}`}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M5 12H19"/></svg>
                        </button>
                        <span className={`w-6 text-center font-bold text-sm ${b.count>0?"text-violet-700":"text-slate-400"}`}>{b.count}</span>
                        <button
                          ref={b.isRef && j===0 ? plusMatrRef : b.isRef && j===1 ? plusSingRef : null}
                          className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shadow-sm">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-white"><path d="M12 5V19M5 12H19"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Bottone aggiungi / dropdown */}
          <div style={{position:'relative'}}>
            {!showDropdown?(
              <button ref={aggiungiRef} className="w-full py-3.5 border-2 border-dashed border-violet-300 rounded-2xl text-violet-600 font-semibold flex items-center justify-center gap-2 text-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 5V19M5 12H19"/></svg>
                Aggiungi Stanza
              </button>
            ):(
              <div className="bg-violet-50 rounded-2xl p-3.5 border border-violet-200">
                <p className="text-xs font-bold text-violet-700 mb-2.5">Seleziona tipo stanza:</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {n:"Camera Matrimoniale",ref:camMatrRef},
                    {n:"Camera Singola",ref:camSingRef},
                    {n:"Camera Doppia",ref:null},
                    {n:"Soggiorno",ref:null},
                  ].map((item,j)=>(
                    <button key={j} ref={item.ref}
                      className={`px-3 py-2.5 border rounded-xl text-xs font-medium text-center transition-all
                        ${(phase===2&&j===0)||(phase===6&&j===1)
                          ?"bg-violet-500 text-white border-violet-500 shadow-md"
                          :"bg-white border-violet-200 text-violet-700"}`}>
                      {item.n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <InlineCaption
          icon={phase===0?"🛏️":phase<=2?"➕":phase<=4?"🛏️":phase<=6?"➕":phase<=8?"🛏️":phase>=9?"➡️":"✅"}
          text={phase===0?"Aggiungi stanze e letti alla struttura":phase<=2?"Seleziona tipo di stanza dal menu":phase<=4?"Aggiungi il letto Matrimoniale (2 posti)":phase<=6?"Aggiungi una seconda stanza":phase<=8?"Aggiungi il letto Singolo (1 posto)":phase>=9?"Clicca Avanti per proseguire":"3 posti letto — struttura configurata"}
          color={enough&&phase>=9?"#10B981":enough?"#7C3AED":"#F59E0B"}
          visible={vis}
        />
        <div className="px-5 pb-4 flex gap-2.5 mt-1">
          <button className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-500">Indietro</button>
          <button ref={avantiBtnRef4}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all ${phase>=10?"bg-emerald-500":phase===9?"scale-95 bg-blue-700":enough?"bg-gradient-to-r from-blue-500 to-blue-600":"bg-slate-300"}`}>
            {phase>=10?"✓ Salvato":"Avanti →"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── STEP 5: Dotazioni Biancheria ── */
function ScreenStep5() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  /*
    0 = tab 1 osp, nessun letto selezionato
    1 = cursor su tab "2 osp", click
    2 = tab 2 attivo, cursor su checkbox Matrimoniale
    3 = Matrimoniale checked, riepilogo appare
    4 = cursor su checkbox Singolo
    5 = Singolo checked, riepilogo aggiornato
    6 = cursor su tab "3 osp"
    7 = tab 3 attivo con configurazione simile
    8 = stato finale
  */
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1600,3200,4800,6400,8000,9600,12000];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },9000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const tab2Ref = useRef(null);
  const tab3Ref = useRef(null);
  const check1Ref = useRef(null);
  const check2Ref = useRef(null);

  const tab = phase>=6?3:phase>=1?2:1;
  const ch1 = phase>=3;
  const ch2 = phase>=5;
  const linen = ch1&&ch2
    ?"1× Lenzuolo matrim · 1× Lenzuolo singolo · 3× Federe · 3× Asciugamani viso · 3× Asciugamani bagno"
    :ch1?"1× Lenzuolo matrimoniale · 2× Federe · 2× Asciugamani viso · 2× Asciugamani bagno"
    :null;

  const activeRef = phase===1?tab2Ref:phase===2||phase===3?check1Ref:phase===4||phase===5?check2Ref:tab3Ref;

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      <SmartCursor targetRef={activeRef} clicking={phase===1||phase===3||phase===5||phase===6} visible={vis && phase>=1} />
      

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-3.5 text-white">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold">Nuova Proprietà</h2>
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6L18 18"/></svg></div>
          </div>
          <div className="flex gap-1">{[0,1,2,3,4,5].map(i=><div key={i} className={`flex-1 h-1.5 rounded-full ${i<=4?'bg-emerald-400':'bg-white/20'}`}/>)}</div>
          <p className="text-[10px] text-white/60 mt-1.5">Step 5 di 6 · Dotazioni</p>
        </div>

        <div className="p-4 space-y-3">
          {/* Box gradiente blu con tab ospiti */}
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-4 text-white">
            <div className="flex items-center justify-between mb-3">
              <div><h3 className="font-bold text-sm">Dotazioni per Ospiti</h3><p className="text-xs text-white/70">Configura per ogni profilo</p></div>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5">
              <p className="text-xs text-white/70 mb-2">Seleziona numero ospiti:</p>
              <div className="flex gap-1.5">
                {[1,2,3,4].map(n=>(
                  <button key={n} ref={n===2?tab2Ref:n===3?tab3Ref:null}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${n===tab?"bg-white text-indigo-600 shadow-lg":"bg-white/20 text-white border border-white/30"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Lista letti */}
          <p className="text-xs font-semibold text-slate-500 px-1">Seleziona i letti da preparare per {tab} {tab===1?"ospite":"ospiti"}:</p>
          <div className="space-y-2">
            {[
              {n:"Camera Matrimoniale",sub:"Matrimoniale (2p)",checked:ch1,ref:check1Ref},
              {n:"Camera Singola",sub:"Singolo (1p)",checked:ch2,ref:check2Ref},
              {n:"Soggiorno",sub:"Divano Letto (2p)",checked:false,ref:null},
            ].map((b,i)=>(
              <div key={i} className={`border-2 rounded-xl p-3 flex items-center gap-3 transition-all ${b.checked?"border-blue-300 bg-blue-50":"border-slate-200 bg-white"}`}>
                <div ref={b.ref} className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all ${b.checked?"bg-blue-600 shadow-sm":"border-2 border-slate-300"}`}>
                  {b.checked&&<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-3 h-3"><path d="M5 13L9 17L19 7"/></svg>}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${b.checked?"text-blue-800":"text-slate-700"}`}>{b.n}</p>
                  <p className="text-xs text-slate-400">{b.sub}</p>
                </div>
                {b.checked&&<span className="text-xs text-blue-500 font-bold">✓</span>}
              </div>
            ))}
          </div>

          {/* Riepilogo automatico */}
          <div className={`rounded-xl border-2 p-3 transition-all ${linen?"border-emerald-200 bg-emerald-50":"border-slate-100 bg-slate-50"}`}>
            <p className={`text-xs font-bold mb-1 ${linen?"text-emerald-700":"text-slate-400"}`}>📦 Ordine biancheria automatico:</p>
            {linen
              ?<p className="text-xs text-emerald-600 leading-relaxed" style={{animation:'fadeIn 0.3s'}}>{linen}</p>
              :<p className="text-xs text-slate-400">Spunta almeno un letto...</p>
            }
          </div>
        </div>

        <InlineCaption
          icon={phase<=1?"2️⃣":phase<=3?"☑️":phase<=5?"📦":phase<=6?"3️⃣":"✅"}
          text={phase===0?"Configura biancheria per ogni numero di ospiti":phase<=1?"Seleziona profilo per 2 ospiti":phase<=3?"Seleziona i letti da preparare per 2 ospiti":phase<=5?"Biancheria calcolata automaticamente":phase<=6?"Ora configura il profilo per 3 ospiti":"Dotazioni configurate per tutti i profili"}
          color={phase>=4?"#10B981":"#3B82F6"}
          visible={vis}
        />
        <div className="px-5 pb-4 flex gap-2.5">
          <button className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-500">Indietro</button>
          <button className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white ${linen?"bg-gradient-to-r from-blue-500 to-blue-600":"bg-slate-300"}`}>Avanti →</button>
        </div>
      </div>

    </div>
  );
}

/* ── STEP 6: Foto ── */
function ScreenStep6() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,2000,4000,6000,9000];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },7500);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const uploadAreaRef = useRef(null);
  const creBtnRef = useRef(null);
  const uploaded = phase>=2, saved = phase>=4;
  const activeRef = phase<=2?uploadAreaRef:creBtnRef;

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      <SmartCursor targetRef={activeRef} clicking={phase===1||phase===3} visible={vis && phase>=1} />
      

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-3.5 text-white">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold">Nuova Proprietà</h2>
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6L18 18"/></svg></div>
          </div>
          <div className="flex gap-1">{[0,1,2,3,4,5].map(i=><div key={i} className="flex-1 h-1.5 rounded-full bg-emerald-400"/>)}</div>
          <p className="text-[10px] text-white/60 mt-1.5">Step 6 di 6 · Foto — Ultimo step!</p>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-center mb-1">
            <div className="w-10 h-10 bg-gradient-to-br from-pink-400 to-rose-500 rounded-xl flex items-center justify-center mx-auto mb-1.5">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
            <h3 className="text-sm font-bold text-slate-800">Foto Proprietà</h3>
          </div>

          <div ref={uploadAreaRef} className={`border-2 rounded-2xl overflow-hidden transition-all ${uploaded?"border-slate-200":"border-dashed border-slate-300"}`} style={{height:140}}>
            {uploaded?(
              <div style={{height:'100%',background:'linear-gradient(135deg,#667eea,#764ba2)',position:'relative',animation:'fadeIn 0.5s'}}>
                <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                  <div style={{width:44,height:44,borderRadius:'50%',background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:8}}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                  </div>
                  <p style={{color:'white',fontSize:11,fontWeight:700}}>Appartamento Colosseo</p>
                  <p style={{color:'rgba(255,255,255,0.7)',fontSize:9}}>Via del Corso 100, Roma</p>
                </div>
                <span style={{position:'absolute',top:8,right:8,background:'rgba(255,255,255,0.95)',borderRadius:20,padding:'3px 10px',fontSize:10,fontWeight:700,color:'#10B981'}}>✓ Caricata</span>
              </div>
            ):(
              <div style={{height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}} className="bg-slate-50">
                {phase===1
                  ?<div className="w-7 h-7 rounded-full border-2 border-pink-400 border-t-transparent" style={{animation:'spin 0.8s linear infinite'}}/>
                  :<><svg className="w-10 h-10 text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  <p className="text-sm text-slate-400 font-medium">Tocca per caricare foto</p>
                  <p className="text-xs text-slate-300 mt-0.5">JPG · PNG · max 10MB</p></>
                }
              </div>
            )}
          </div>

          {saved&&(
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3" style={{animation:'fadeIn 0.3s'}}>
              <p className="text-sm font-bold text-emerald-700">✓ Proprietà creata con successo!</p>
              <p className="text-xs text-emerald-600 mt-0.5">In attesa di approvazione admin. Riceverai una notifica.</p>
            </div>
          )}
        </div>

        <InlineCaption
          icon={phase<=1?"📸":phase<=2?"🖼️":phase<=3?"✅":"🎉"}
          text={phase===0?"Carica una foto rappresentativa":phase<=1?"Tocca per scegliere dalla galleria":phase<=2?"Foto caricata correttamente":phase<=3?"Clicca Crea Proprietà per inviare":"Proprietà creata — in attesa di approvazione"}
          color={phase>=2?"#10B981":"#EC4899"}
          visible={vis}
        />
        <div className="px-5 pb-4 flex gap-2.5">
          <button className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-500">Indietro</button>
          <button ref={creBtnRef}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all ${saved?"bg-emerald-500 shadow-lg shadow-emerald-200":phase===3?"scale-95 bg-blue-700":"bg-gradient-to-r from-blue-500 to-blue-600"}`}>
            {saved?"✓ Inviato!":"Crea Proprietà →"}
          </button>
        </div>
      </div>

    </div>
  );
}

function ScreenProprieta() { return <ScreenStep3 />; }
function ScreenBiancheria() { return <ScreenStep5 />; }

/* ─── SCREEN: Nuova Pulizia Manuale ─── */
function ScreenNuovaPulizia() {
  const [ref, vis] = useVis(0.1);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!vis) { setStep(0); return; }
    const seq = [0,0,1600,3000,4400,5800,7200,8600,10200,12000,14500];
    const timers = seq.map((t,i)=>setTimeout(()=>setStep(i),t));
    const loop = setInterval(()=>{ setStep(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setStep(i),t)); }); },17000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const propSelected = step>=2;
  const dateSet = step>=3;
  const timeSet = step>=4;
  const guestsSet = step>=5;
  const linenToggle = step>=6; // biancheria inclusa
  const step2 = step>=7;
  const guestCountSet = step>=8;
  const confirmed = step>=9;
  const done = step>=10;

  const propRef = useRef(null);
  const dateRef = useRef(null);
  const avantiRef = useRef(null);
  const guestsRef = useRef(null);
  const confermaRef = useRef(null);

  const activeRef = step<=1?propRef:step<=2?propRef:step<=3?dateRef:step<=4?dateRef:step<=6?avantiRef:step<=8?guestsRef:confermaRef;

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      <SmartCursor targetRef={activeRef} clicking={step===1||step===3||step===5||step===7||step===9} visible={vis&&step>=1} />
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        {/* Header gradiente verde — come nell'app reale */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
              </div>
              <div>
                <h2 className="text-base font-bold">{step>=7?"Nuova Pulizia":"Nuova Pulizia"}</h2>
                <p className="text-xs text-white/80">Step {step>=7?"2":"1"} di 2 · {step>=7?"Ospiti e Dotazioni":"Proprietà e Servizio"}</p>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></div>
          </div>
          <div className="mt-3 flex gap-2">
            <div className="h-1 flex-1 rounded-full bg-white"></div>
            <div className={`h-1 flex-1 rounded-full ${step>=7?'bg-white':'bg-white/30'}`}></div>
          </div>
        </div>

        <div className="px-4 py-4 space-y-3 bg-slate-50" style={{overflow:'hidden'}}>
          {!step2?(
            <>
              {/* Tipo richiesta */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-800 mb-3">Cosa vuoi richiedere?</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-xl border-2 border-slate-800 bg-slate-50 text-center shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-slate-200 mx-auto mb-2 flex items-center justify-center"><svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg></div>
                    <span className="text-sm font-semibold text-slate-800">Pulizia</span>
                  </div>
                  <div className="p-3 rounded-xl border-2 border-slate-200 bg-white text-center">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 mx-auto mb-2 flex items-center justify-center"><svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18"/></svg></div>
                    <span className="text-sm font-semibold text-slate-600">Solo Biancheria</span>
                  </div>
                </div>
              </div>

              {/* Proprietà */}
              <div ref={propRef} className={`bg-white rounded-xl border-2 p-4 transition-all ${propSelected?'border-blue-200 bg-blue-50':'border-slate-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center"><svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7"/></svg></div>
                  <span className="text-sm font-semibold text-slate-800">Proprietà <span className="text-red-500">*</span></span>
                </div>
                {propSelected?(
                  <div className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-blue-200">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center flex-shrink-0"><svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7"/></svg></div>
                    <div><p className="font-bold text-slate-800 text-sm">Appartamento Colosseo</p><p className="text-xs text-slate-400">Via del Corso 100 · Max 4 ospiti · €65</p></div>
                  </div>
                ):(
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <span className="text-sm text-slate-400">Cerca proprietà...</span>
                  </div>
                )}
              </div>

              {/* Data */}
              <div ref={dateRef} className={`bg-white rounded-xl border-2 p-4 transition-all ${dateSet?'border-slate-300':'border-slate-200'}`}>
                <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"><svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div><span className="text-sm font-semibold text-slate-800">Data *</span></div>
                <div className={`px-4 py-3 rounded-xl text-sm font-medium ${dateSet?'bg-slate-800 text-white':'bg-slate-50 border border-slate-200 text-slate-400'}`}>{dateSet?"Domani — Martedì 23 Marzo":"Seleziona data..."}</div>
              </div>

              {/* Biancheria toggle */}
              <div className={`bg-white rounded-xl border-2 p-4 transition-all ${linenToggle?'border-emerald-200 bg-emerald-50':'border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center"><svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18"/></svg></div>
                    <div><p className="text-sm font-semibold text-slate-800">Includi Biancheria</p><p className="text-xs text-slate-400">{linenToggle?"Inclusa nella pulizia":"Solo pulizia"}</p></div>
                  </div>
                  <div className={`w-12 h-6 rounded-full transition-all ${linenToggle?'bg-emerald-500':'bg-slate-300'} relative`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${linenToggle?'left-6':'left-0.5'}`}/>
                  </div>
                </div>
              </div>

              <button ref={avantiRef} className={`w-full py-3 rounded-xl text-sm font-bold text-white transition-all ${propSelected&&dateSet?'bg-gradient-to-r from-emerald-500 to-teal-500':'bg-slate-300'}`}>
                {propSelected&&dateSet?"Avanti — Ospiti e Dotazioni →":"Completa i campi"}
              </button>
            </>
          ):(
            <>
              {/* Step 2: ospiti */}
              <div ref={guestsRef} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-800 mb-3">Numero ospiti *</p>
                <div className="flex gap-1.5 flex-wrap">
                  {[1,2,3,4].map(n=>(
                    <button key={n} className={`w-11 h-11 rounded-xl text-sm font-bold transition-all ${n===(guestCountSet?3:2)?'bg-emerald-500 text-white shadow-lg scale-110':'bg-slate-100 text-slate-600'}`}>{n}</button>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-800 mb-2">Note per l'operatore</p>
                <div className="bg-slate-50 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-400 min-h-[60px]">{confirmed?"Attenzione: finestra doccia da riparare":""}</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">Pulizia</span><span className="font-bold text-slate-800">€65,00</span></div>
                <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">Biancheria (3 ospiti)</span><span className="font-bold text-slate-800">€28,00</span></div>
                <div className="flex justify-between text-sm font-bold text-emerald-700 border-t border-emerald-200 pt-2 mt-2"><span>Totale</span><span>€93,00</span></div>
              </div>
              <button ref={confermaRef} className={`w-full py-3 rounded-xl text-sm font-bold text-white transition-all ${done?'bg-emerald-600 scale-100':confirmed?'scale-95 bg-emerald-700':'bg-gradient-to-r from-emerald-500 to-teal-500'}`}>
                {done?"✓ Pulizia Creata!":"Crea Pulizia →"}
              </button>
            </>
          )}
        </div>
      </div>
      <InlineCaption icon={step<=1?"🧹":step<=2?"🏠":step<=3?"📅":step<=5?"🧺":step<=6?"➡️":step<=8?"👥":done?"🎉":"✅"}
        text={step===0?"Apri il menu e tocca + Nuova Pulizia":step<=2?"Seleziona la proprietà da pulire":step<=3?"Scegli la data della pulizia":step<=5?"Attiva l'opzione biancheria se serve":step<=6?"Procedi al passo 2":step<=8?"Inserisci il numero di ospiti":done?"Pulizia creata con successo!":"Conferma e crea la pulizia"}
        color={done?"#10B981":step<=5?"#10B981":"#6366F1"} visible={vis} />
    </div>
  );
}

/* ─── SCREEN: Richiedi Solo Biancheria ─── */
function ScreenSoloBiancheria() {
  const [ref, vis] = useVis(0.1);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!vis) { setStep(0); return; }
    const seq = [0,0,1600,3000,4400,5800,7000,8400,10000,11800];
    const timers = seq.map((t,i)=>setTimeout(()=>setStep(i),t));
    const loop = setInterval(()=>{ setStep(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setStep(i),t)); }); },14000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const linenSelected = step>=2; // click su "Solo Biancheria"
  const propSelected = step>=3;
  const dateSet = step>=4;
  const goStep2 = step>=5;
  const bedsSelected = step>=6;
  const bedMaking = step>=7; // preparazione letti attivata
  const confirmed = step>=8;
  const done = step>=9;

  const linenTabRef = useRef(null);
  const propRef2 = useRef(null);
  const avantiRef2 = useRef(null);
  const bedRef = useRef(null);
  const confermaRef2 = useRef(null);

  const activeRef = step<=1?linenTabRef:step<=2?linenTabRef:step<=3?propRef2:step<=4?avantiRef2:step<=5?avantiRef2:step<=6?bedRef:confermaRef2;

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      <SmartCursor targetRef={activeRef} clicking={step===1||step===3||step===5||step===7||step===8} visible={vis&&step>=1} />
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18"/></svg>
              </div>
              <div>
                <h2 className="text-base font-bold">{linenSelected?"Richiedi Biancheria":"Nuova Pulizia"}</h2>
                <p className="text-xs text-white/80">Step {goStep2?"2":"1"} di 2</p>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></div>
          </div>
          <div className="mt-3 flex gap-2">
            <div className="h-1 flex-1 rounded-full bg-white"></div>
            <div className={`h-1 flex-1 rounded-full ${goStep2?'bg-white':'bg-white/30'}`}></div>
          </div>
        </div>

        <div className="px-4 py-4 space-y-3 bg-slate-50" style={{overflow:'hidden'}}>
          {!goStep2?(
            <>
              {/* Tipo — cursore va su Solo Biancheria */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-800 mb-3">Cosa vuoi richiedere?</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className={`p-3 rounded-xl border-2 text-center ${!linenSelected?'border-slate-200':'border-slate-200 bg-white'}`}>
                    <div className="w-10 h-10 rounded-xl bg-slate-100 mx-auto mb-2 flex items-center justify-center"><svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7"/></svg></div>
                    <span className="text-sm font-semibold text-slate-600">Pulizia</span>
                  </div>
                  <div ref={linenTabRef} className={`p-3 rounded-xl border-2 text-center transition-all ${linenSelected?'border-slate-800 bg-slate-50 shadow-sm':'border-slate-200 bg-white'}`}>
                    <div className={`w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center ${linenSelected?'bg-slate-200':'bg-slate-100'}`}><svg className={`w-5 h-5 ${linenSelected?'text-slate-700':'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18"/></svg></div>
                    <span className="text-sm font-semibold text-slate-800">Solo Biancheria</span>
                  </div>
                </div>
              </div>

              <div ref={propRef2} className={`bg-white rounded-xl border-2 p-4 transition-all ${propSelected?'border-blue-200 bg-blue-50':'border-slate-200'}`}>
                <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center"><svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7"/></svg></div><span className="text-sm font-semibold text-slate-800">Proprietà *</span></div>
                {propSelected?(<div className="flex items-center gap-2.5 p-2.5 bg-white rounded-xl border border-blue-200"><div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 flex-shrink-0"/><div><p className="font-bold text-slate-800 text-sm">Appartamento Colosseo</p><p className="text-xs text-slate-400">Via del Corso 100</p></div></div>):(<div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-400">Cerca proprietà...</div>)}
              </div>

              <div className={`bg-white rounded-xl border-2 p-4 transition-all ${dateSet?'border-slate-300':'border-slate-200'}`}>
                <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"><svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div><span className="text-sm font-semibold text-slate-800">Data consegna *</span></div>
                <div className={`px-4 py-3 rounded-xl text-sm font-medium ${dateSet?'bg-slate-800 text-white':'bg-slate-50 border border-slate-200 text-slate-400'}`}>{dateSet?"Martedì 23 Marzo 2026":"Seleziona data..."}</div>
              </div>

              <button ref={avantiRef2} className={`w-full py-3 rounded-xl text-sm font-bold text-white ${linenSelected&&propSelected&&dateSet?'bg-gradient-to-r from-emerald-500 to-teal-500':'bg-slate-300'}`}>
                {linenSelected&&propSelected&&dateSet?"Avanti →":"Completa i campi"}
              </button>
            </>
          ):(
            <>
              {/* Step 2: selezione articoli */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-800 mb-3">Seleziona articoli</p>
                <div className="space-y-2">
                  {[
                    {n:"Lenzuolo Matrimoniale",p:"€5,00",sel:bedsSelected,qty:2},
                    {n:"Lenzuolo Singolo",p:"€3,50",sel:bedsSelected,qty:1},
                    {n:"Asciugamano Viso",p:"€2,00",sel:bedsSelected,qty:3},
                    {n:"Asciugamano Bagno",p:"€3,00",sel:bedsSelected,qty:3},
                  ].map((item,i)=>(
                    <div ref={i===0?bedRef:null} key={i} className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${item.sel?'border-blue-300 bg-blue-50':'border-slate-200'}`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${item.sel?'bg-blue-600 border-blue-600':'border-slate-300'}`}>
                          {item.sel&&<svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                        </div>
                        <span className="text-sm font-medium text-slate-700">{item.n}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.sel&&<span className="text-xs text-blue-500 font-bold">×{item.qty}</span>}
                        <span className="text-sm font-bold text-slate-600">{item.p}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preparazione letti */}
              <div className={`bg-white rounded-xl border-2 p-4 transition-all ${bedMaking?'border-amber-200 bg-amber-50':'border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-semibold text-slate-800">Preparazione Letti</p><p className="text-xs text-slate-400">€5,00 per letto — operatore stende le lenzuola</p></div>
                  <div className={`w-12 h-6 rounded-full relative transition-all ${bedMaking?'bg-amber-500':'bg-slate-300'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${bedMaking?'left-6':'left-0.5'}`}/>
                  </div>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">Biancheria</span><span className="font-bold">€{bedsSelected?"38,00":"0,00"}</span></div>
                {bedMaking&&<div className="flex justify-between text-sm mb-1"><span className="text-slate-600">Preparazione letti (3)</span><span className="font-bold">€15,00</span></div>}
                <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">Consegna</span><span className="font-bold">€10,00</span></div>
                <div className="flex justify-between font-bold text-emerald-700 border-t border-emerald-200 pt-2 mt-1"><span>Totale</span><span>€{bedMaking?"63,00":"48,00"}</span></div>
              </div>

              <button ref={confermaRef2} className={`w-full py-3 rounded-xl text-sm font-bold text-white transition-all ${done?'bg-emerald-600':confirmed?'scale-95 bg-emerald-700':'bg-gradient-to-r from-emerald-500 to-teal-500'}`}>
                {done?"✓ Ordine Creato!":"Crea Ordine →"}
              </button>
            </>
          )}
        </div>
      </div>
      <InlineCaption icon={step<=1?"🧺":step<=2?"☑️":step<=3?"🏠":step<=4?"📅":step<=5?"➡️":step<=6?"📦":step<=7?"🛏️":done?"🎉":"✅"}
        text={step===0?"Tocca + e seleziona Solo Biancheria":step<=2?"Seleziona Solo Biancheria":step<=3?"Scegli la proprietà":step<=4?"Imposta la data di consegna":step<=5?"Procedi al passo 2":step<=6?"Seleziona gli articoli necessari":step<=7?"Attiva Preparazione Letti se vuoi":done?"Ordine biancheria creato!":"Conferma e crea l'ordine"}
        color={done?"#10B981":"#10B981"} visible={vis} />
    </div>
  );
}


function ScreenIcal() {
  const [ref, vis] = useVis(0.1);
  const [step, setStep] = useState(0);
  // 0=idle,1=cursor su Booking field,2=typing url,3=typed,4=cursor Oktorate,5=typing ok,6=typed ok,7=cursor btn,8=click,9=saved
  useEffect(() => {
    if (!vis) { setStep(0); return; }
    const seq = [0,0,1400,2800,4200,5600,7000,8400,9400,10600,13000];
    const timers = seq.map((t,i) => setTimeout(() => setStep(i), t));
    const loop = setInterval(() => {
      setStep(0);
      seq.forEach((t,i) => { timers.push(setTimeout(() => setStep(i), t)); });
    }, 9500);
    return () => { timers.forEach(clearTimeout); clearInterval(loop); };
  }, [vis]);

  const bookingUrl = "https://admin.booking.com/hotel/ical/...";
  const okUrl = "webcal://oktorate.com/ical/...";
  const bookingVal = step >= 3 ? bookingUrl : step === 2 ? bookingUrl.slice(0, 12) + "..." : "";
  const okVal = step >= 6 ? okUrl : step === 5 ? okUrl.slice(0, 10) + "..." : "";
  const saved = step >= 9;
  const clicking = step === 8;

  const cpMap = [{x:50,y:50},{x:50,y:50},{x:55,y:52},{x:55,y:52},{x:55,y:66},{x:55,y:66},{x:55,y:66},{x:50,y:85},{x:50,y:85},{x:50,y:50},{x:50,y:50}];
  const cp = cpMap[Math.min(step, cpMap.length-1)];

  const platforms = [
    { n:"Airbnb", c:"from-rose-500 to-red-600", val:"https://www.airbnb.it/calendar/ical/...", active: step>=1 },
    { n:"Booking.com", c:"from-blue-600 to-blue-700", val: bookingVal, active: step>=2 && step<4 },
    { n:"Oktorate", c:"from-purple-500 to-purple-600", val: okVal, active: step>=5 && step<7 },
  ];

  return (
    <div ref={ref} style={{position:"relative"}}>
      {vis && <LiveCursor x={cp.x} y={cp.y} clicking={clicking} />}
      <LiveTooltip text="Incolla URL da Booking.com" color="#3B82F6" visible={step>=1&&step<4} x={2} y={2} />
      <LiveTooltip text="✓ 3 piattaforme collegate!" color="#10B981" visible={saved} x={2} y={2} />
      <AppScreen title="Collega iCal" badge="iCal">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center">
              <Icons.link className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[12px] font-bold text-slate-800">Link Calendario</p>
              <p className="text-[9px] text-slate-500">Collega le piattaforme di prenotazione</p>
            </div>
          </div>
          {platforms.map((p, i) => (
            <div key={i} className="mb-2">
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className={`px-2 py-0.5 bg-gradient-to-r ${p.c} rounded-full text-[9px] font-bold text-white`}>{p.n}</div>
              </div>
              <div className={`border rounded-xl px-2.5 py-2 text-[10px] flex items-center gap-2 transition-all ${p.val ? "border-emerald-200 bg-emerald-50 text-emerald-700" : p.active ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
                {p.val ? (
                  <><Icons.check className="w-3 h-3 flex-shrink-0 text-emerald-500" /><span className="truncate">{p.val}</span></>
                ) : (
                  <><Icons.link className="w-3 h-3 flex-shrink-0" /><span>Incolla link iCal...</span>
                    {p.active && <span style={{animation:"blink 1s infinite",marginLeft:"auto",color:"#3B82F6"}}>|</span>}
                  </>
                )}
              </div>
            </div>
          ))}
          <button className={`w-full text-white text-center py-2.5 rounded-xl text-[11px] font-bold mt-2 flex items-center justify-center gap-1.5 transition-all ${saved ? "bg-emerald-500" : clicking ? "bg-teal-700 scale-95" : "bg-gradient-to-r from-emerald-500 to-teal-600 shadow-lg shadow-emerald-200/50"}`}>
            {saved ? <><Icons.check className="w-3.5 h-3.5" /> Sincronizzato!</> : <><Icons.save className="w-3.5 h-3.5" /> Salva e Sincronizza</>}
          </button>
        </div>
      </AppScreen>
    </div>
  );
}

function ScreenPulizia() {
  const [ref, vis] = useVis(0.1);
  const [step, setStep] = useState(0);
  /*
    0  = lista card, nessuna azione
    1  = cursore sul bottone ospiti (viola, pill) della prima card
    2  = click → modal ospiti si apre (bottom sheet)
    3  = cursore sul + adulti nella modal
    4  = click → adulti passa da 2 a 3, silhouette animata
    5  = cursore su bottone Conferma
    6  = click → modal si chiude, pill ospiti aggiornata a "3"
    7  = pausa
  */
  useEffect(() => {
    if (!vis) { setStep(0); return; }
    const seq = [0,0,1600,2800,4000,5200,6400,7600,9200];
    const timers = seq.map((t,i)=>setTimeout(()=>setStep(i),t));
    const loop = setInterval(()=>{ setStep(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setStep(i),t)); }); },11000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const guestsPillRef = useRef(null);
  const plusAdultiRef = useRef(null);
  const confermaRef = useRef(null);

  const showModal = step>=2 && step<7;
  const adults = step>=4 ? 3 : 2;
  const done = step>=6;

  const activeRef = step<=1 ? guestsPillRef : step<=3 ? guestsPillRef : step<=5 ? plusAdultiRef : confermaRef;

  // Card dati
  const cards = [
    {name:"Appartamento Colosseo", addr:"Via del Corso 100 · Max 4 ospiti", time:"10:00", guests: done?3:2, status:"pending", img:"🏛️", op:"MR"},
    {name:"Luxury Suite Trastevere", addr:"Via della Lungaretta 22 · Max 6 ospiti", time:"11:30", guests:4, status:"assigned", img:"🌿", op:"SF"},
    {name:"Parioli Apartment", addr:"Viale Liegi 14 · Max 2 ospiti", time:"14:00", guests:2, status:"completed", img:"🏠", op:"GP"},
  ];

  const statusStyle = {
    pending: {bg:"bg-amber-500", label:"IN ATTESA"},
    assigned: {bg:"bg-sky-500", label:"IN CORSO"},
    completed: {bg:"bg-emerald-500", label:"✓ FATTO"},
  };

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      <SmartCursor targetRef={activeRef} clicking={step===1||step===3||step===5||step===6} visible={vis&&step>=1} />

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        {/* Status bar */}
        <div className="bg-slate-900 text-white px-4 py-1.5 flex justify-between items-center text-[10px]">
          <span className="font-semibold">9:41</span>
          <div className="flex gap-1.5 items-center">
            <div className="w-5 h-2.5 border border-white/60 rounded-sm relative">
              <div className="absolute inset-0.5 bg-emerald-400 rounded-sm" style={{width:'70%'}}/>
            </div>
          </div>
        </div>

        {/* Header app */}
        <div className="bg-white px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-base">Pulizie Oggi</h2>
          <div className="flex gap-2">
            <button className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/></svg>
            </button>
            <button className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            </button>
          </div>
        </div>

        {/* Lista card */}
        <div className="divide-y divide-slate-100" style={{maxHeight:300,overflowY:'hidden'}}>
          {cards.map((c,i)=>{
            const st = statusStyle[c.status];
            const isDone = c.status==='completed';
            const isFirst = i===0;
            return (
              <div key={i} className="flex items-center bg-white">
                {/* Foto */}
                <div className="w-24 h-28 flex-shrink-0 relative bg-slate-100 flex items-center justify-center">
                  <span className="text-4xl">{c.img}</span>
                  <div className={`absolute top-2 left-2 px-2 py-0.5 ${st.bg} text-white text-[9px] font-bold rounded-lg`}>
                    {st.label}
                  </div>
                </div>
                {/* Contenuto */}
                <div className="flex-1 p-3">
                  <h3 className="font-bold text-slate-800 text-sm mb-0.5">{c.name}</h3>
                  <p className="text-[10px] text-slate-400 mb-2.5">{c.addr}</p>
                  <div className="flex items-center gap-2 mb-2">
                    {/* Orario */}
                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full ${isDone?"bg-slate-100 text-slate-500":"bg-sky-50 border border-sky-100 text-sky-600"}`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      <span className="text-xs font-semibold">{c.time}</span>
                    </div>
                    {/* Ospiti — bottone viola */}
                    <div
                      ref={isFirst?guestsPillRef:null}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full transition-all ${isDone?"bg-slate-100 text-slate-500":step>=1&&isFirst&&!done?"bg-violet-100 border-2 border-violet-400 text-violet-700":"bg-violet-50 border border-violet-100 text-violet-600"}`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                      <span className="text-xs font-semibold">{c.guests}</span>
                    </div>
                  </div>
                  {/* Operatore */}
                  <div className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full text-white text-[10px] font-bold ${isDone?"bg-slate-400":"bg-emerald-500"}`}>
                    <span>{c.op}</span>
                  </div>
                </div>
                {/* Freccia */}
                <div className="pr-3">
                  <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal ospiti (bottom sheet) */}
        <div style={{
          position:'absolute', left:0, right:0, bottom:0,
          background:'white',
          borderRadius:'20px 20px 0 0',
          boxShadow:'0 -4px 30px rgba(0,0,0,0.15)',
          transform: showModal?'translateY(0)':'translateY(100%)',
          transition:'transform 0.35s cubic-bezier(0.34,1.2,0.64,1)',
          zIndex:10,
          padding:'16px 20px 20px',
        }}>
          {/* Handle */}
          <div style={{width:40,height:4,background:'#e2e8f0',borderRadius:2,margin:'0 auto 16px'}}/>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-slate-800">Numero ospiti</h3>
            <span className="text-xs text-slate-400">Reset</span>
          </div>
          {/* Adulti */}
          <div className="flex items-center justify-between py-3.5 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
              </div>
              <p className="font-semibold text-slate-800 text-sm">Adulti</p>
            </div>
            <div className="flex items-center gap-4">
              <button className="w-10 h-10 rounded-full border-2 border-slate-200 flex items-center justify-center">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M20 12H4"/></svg>
              </button>
              <span className="text-xl font-bold text-slate-800 w-8 text-center">{adults}</span>
              <button ref={plusAdultiRef} className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 4v16m8-8H4"/></svg>
              </button>
            </div>
          </div>
          {/* Anteprima silhouette */}
          <div className="bg-slate-50 rounded-2xl p-3 my-3 flex items-end justify-center gap-1.5" style={{minHeight:60}}>
            {Array.from({length:adults}).map((_,i)=>(
              <div key={i} className="flex flex-col items-center" style={{animation:'fadeIn 0.2s ease'}}>
                <div className="w-5 h-5 rounded-full bg-indigo-200"/>
                <div className="w-7 h-9 bg-indigo-300 rounded-t-xl rounded-b-lg mt-0.5"/>
              </div>
            ))}
          </div>
          <button ref={confermaRef}
            className={`w-full py-3.5 rounded-2xl font-semibold text-base text-white transition-all ${step>=6?"bg-emerald-500":step===5?"scale-95 bg-slate-700":"bg-slate-800"}`}>
            {step>=6?"✓ Confermato":"Conferma"}
          </button>
        </div>
      </div>

      <InlineCaption
        icon={step<=1?"👆":step<=2?"📋":step<=4?"➕":step<=5?"✅":done?"🎉":"👁️"}
        text={step===0?"Tocca il bottone viola ospiti per aggiornare":step<=2?"Modal ospiti aperta — seleziona il numero":step<=4?"Tocca + per aumentare gli adulti":step<=5?"Conferma il numero di ospiti":done?"Ospiti aggiornati a 3 — biancheria ricalcolata":"La card mostra orario, ospiti e operatore"}
        color={done?"#10B981":"#7C3AED"}
        visible={vis}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   COMPONENTI UX PAGINA PRINCIPALE
   ════════════════════════════════════════════════════════════════ */

/* Progress bar sticky in alto */
function ProgressBar({ sections, activeIndex }) {
  return (
    <div style={{
      position:"sticky", top:0, zIndex:50,
      background:"rgba(255,255,255,0.85)",
      backdropFilter:"blur(16px)",
      WebkitBackdropFilter:"blur(16px)",
      borderBottom:"1px solid rgba(226,232,240,0.6)",
      padding:"10px 16px",
      transition:"all 0.3s ease"
    }}>
      <div style={{maxWidth:900,margin:"0 auto"}}>
        {/* Barra progresso */}
        <div style={{display:"flex",gap:3,marginBottom:6}}>
          {sections.map((_,i) => (
            <div key={i} style={{
              flex:1, height:3, borderRadius:2,
              background: i <= activeIndex ? sections[i]?.color || "#0EA5E9" : "#e2e8f0",
              transition:"background 0.5s ease"
            }}/>
          ))}
        </div>
        {/* Label corrente */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <p style={{fontSize:11,fontWeight:700,color:"#475569",margin:0}}>
            {sections[activeIndex]?.icon} {sections[activeIndex]?.title}
          </p>
          <span style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>
            {activeIndex + 1} / {sections.length}
          </span>
        </div>
      </div>
    </div>
  );
}

/* Divisore animato tra sezioni */
function SectionDivider({ number, color = "#0EA5E9", icon }) {
  const [ref, vis] = useVis(0.2);
  return (
    <div ref={ref} style={{
      display:"flex", flexDirection:"column", alignItems:"center",
      padding:"48px 0 32px", position:"relative"
    }}>
      {/* Linea superiore */}
      <div style={{
        width:2, height:48,
        background:`linear-gradient(to bottom, transparent, ${color})`,
        opacity: vis ? 1 : 0,
        transform: vis ? "scaleY(1)" : "scaleY(0)",
        transformOrigin:"top",
        transition:"all 0.8s cubic-bezier(0.34,1.56,0.64,1)"
      }}/>
      {/* Badge numero */}
      <div style={{
        width:48, height:48, borderRadius:"50%",
        background:`linear-gradient(135deg, ${color}, ${color}dd)`,
        display:"flex", alignItems:"center", justifyContent:"center",
        color:"white", fontWeight:800, fontSize:18,
        boxShadow:`0 8px 24px ${color}40`,
        opacity: vis ? 1 : 0,
        transform: vis ? "scale(1)" : "scale(0.5)",
        transition:"all 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.3s"
      }}>
        {icon || number}
      </div>
      {/* Linea inferiore */}
      <div style={{
        width:2, height:32,
        background:`linear-gradient(to bottom, ${color}, transparent)`,
        opacity: vis ? 1 : 0,
        transform: vis ? "scaleY(1)" : "scaleY(0)",
        transformOrigin:"top",
        transition:"all 0.6s ease 0.5s"
      }}/>
    </div>
  );
}

/* Header sezione con animazione */
function SectionHeader({ title, subtitle, color = "#0EA5E9", icon }) {
  const [ref, vis] = useVis(0.15);
  return (
    <div ref={ref} style={{
      textAlign:"center", padding:"0 20px 32px",
      opacity: vis ? 1 : 0,
      transform: vis ? "translateY(0)" : "translateY(20px)",
      transition:"all 0.7s cubic-bezier(0.34,1.56,0.64,1)"
    }}>
      {icon && (
        <div style={{
          fontSize:36, marginBottom:12,
          filter: vis ? "none" : "blur(8px)",
          transition:"filter 0.5s ease"
        }}>{icon}</div>
      )}
      <h2 style={{
        fontSize:28, fontWeight:800,
        background:`linear-gradient(135deg, ${color}, ${color}cc)`,
        WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
        backgroundClip:"text",
        margin:"0 0 8px", lineHeight:1.2
      }}>{title}</h2>
      {subtitle && (
        <p style={{fontSize:15,color:"#64748b",margin:0,lineHeight:1.6,maxWidth:480,marginLeft:"auto",marginRight:"auto"}}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

/* Wrapper per screen dentro PhoneFrame — NO scroll utente, altezza auto-adattiva */
function DemoPhone({ children, fixedH = 580 }) {
  return (
    <div className="w-full max-w-[380px] mx-auto select-none demophone-root">
      {/* Override: rimuovi bordi/shadow/rounded dalle screen figlie — il DemoPhone fa già la cornice */}
      <style>{`
        .demophone-root .demophone-content > div > div.rounded-3xl {
          border-radius: 0 !important;
          box-shadow: none !important;
          border: none !important;
        }
        .demophone-root .demophone-content > div > div.rounded-3xl > div:first-child {
          border-radius: 0 !important;
        }
      `}</style>
      <div style={{
        background:"linear-gradient(145deg, #334155 0%, #1e293b 100%)",
        borderRadius:28, padding:"6px 5px 8px",
        boxShadow:"0 20px 50px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.08)",
        position:"relative"
      }}>
        {/* Dynamic Island — più sottile */}
        <div style={{width:72,height:18,background:"#1e293b",borderRadius:10,margin:"0 auto 4px",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#0f172a",border:"0.5px solid #334155"}}/>
          <div style={{width:32,height:4,borderRadius:2,background:"#0f172a",border:"0.5px solid #334155"}}/>
        </div>
        {/* Schermo — altezza fissa, NO scroll */}
        <div style={{
          borderRadius:16, overflow:"hidden", background:"#f8fafc",
          boxShadow:"inset 0 0 0 0.5px rgba(255,255,255,0.06)",
          height: fixedH,
          display:"flex", flexDirection:"column"
        }}>
          {/* Status bar */}
          <div style={{background:"#0f172a",color:"white",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 14px",fontSize:9,fontWeight:600,flexShrink:0}}>
            <span>9:41</span>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              <svg width="12" height="9" viewBox="0 0 14 10" fill="white"><rect x="0" y="6" width="2" height="4" rx="0.5" opacity="0.4"/><rect x="3" y="4" width="2" height="6" rx="0.5" opacity="0.6"/><rect x="6" y="2" width="2" height="8" rx="0.5" opacity="0.8"/><rect x="9" y="0" width="2" height="10" rx="0.5"/></svg>
              <div style={{width:18,height:9,border:"1px solid rgba(255,255,255,0.5)",borderRadius:2,display:"flex",alignItems:"center",padding:"1px"}}>
                <div style={{flex:1,height:"100%",background:"#4ade80",borderRadius:1}}/>
              </div>
            </div>
          </div>
          {/* Contenuto — overflow HIDDEN, nessuno scroll utente */}
          <div className="demophone-content" style={{flex:1,overflow:"hidden",position:"relative"}}>
            {children}
          </div>
        </div>
        {/* Side buttons — più sottili */}
        <div style={{position:"absolute",left:-2,top:55,width:2,height:22,background:"#475569",borderRadius:"1.5px 0 0 1.5px"}}/>
        <div style={{position:"absolute",left:-2,top:85,width:2,height:36,background:"#475569",borderRadius:"1.5px 0 0 1.5px"}}/>
        <div style={{position:"absolute",left:-2,top:130,width:2,height:36,background:"#475569",borderRadius:"1.5px 0 0 1.5px"}}/>
        <div style={{position:"absolute",right:-2,top:82,width:2,height:48,background:"#475569",borderRadius:"0 1.5px 1.5px 0"}}/>
      </div>
    </div>
  );
}

/* Sezione con sfondo gradiente sottile */
function GuidaSection({ children, id, bg = "transparent" }) {
  return (
    <section id={id} style={{
      background: bg,
      position:"relative",
      overflow:"hidden",
      padding:"0 16px"
    }}>
      <div style={{maxWidth:900,margin:"0 auto",position:"relative",zIndex:1}}>
        {children}
      </div>
    </section>
  );
}

/* Tip box */
function TipBox({ icon = "💡", title, children, color = "#0EA5E9" }) {
  const [ref, vis] = useVis(0.15);
  return (
    <div ref={ref} style={{
      background:`${color}08`, border:`1px solid ${color}25`,
      borderRadius:16, padding:"16px 20px",
      margin:"20px auto", maxWidth:520,
      opacity: vis ? 1 : 0,
      transform: vis ? "translateY(0)" : "translateY(12px)",
      transition:"all 0.5s ease"
    }}>
      <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
        <span style={{fontSize:20,flexShrink:0,lineHeight:1}}>{icon}</span>
        <div>
          {title && <p style={{fontWeight:700,fontSize:14,color:"#1e293b",margin:"0 0 4px"}}>{title}</p>}
          <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>{children}</p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   COMPONENTE PAGINA PRINCIPALE — GUIDA
   ════════════════════════════════════════════════════════════════ */

const SECTIONS = [
  { id:"intro", title:"Benvenuto", icon:"👋", color:"#0EA5E9" },
  { id:"registrazione", title:"Registrazione", icon:"📝", color:"#3B82F6" },
  { id:"contratto", title:"Firma Contratto", icon:"✍️", color:"#6366F1" },
  { id:"fatturazione", title:"Dati Fatturazione", icon:"💳", color:"#10B981" },
  { id:"attesa", title:"Attesa Approvazione", icon:"⏳", color:"#F59E0B" },
  { id:"proprieta", title:"Crea Proprietà", icon:"🏠", color:"#8B5CF6" },
  { id:"ical", title:"Collega iCal", icon:"🔗", color:"#10B981" },
  { id:"pulizia", title:"Gestisci Pulizie", icon:"🧹", color:"#0EA5E9" },
  { id:"biancheria", title:"Richiedi Biancheria", icon:"🛏️", color:"#EC4899" },
  { id:"ospiti", title:"Aggiorna Ospiti", icon:"👥", color:"#7C3AED" },
  { id:"faq", title:"FAQ", icon:"❓", color:"#64748B" },
];

function GuidaPage() {
  const [activeSection, setActiveSection] = useState(0);

  useEffect(() => {
    const observers = [];
    SECTIONS.forEach((s, i) => {
      const el = document.getElementById(s.id);
      if (!el) return;
      const obs = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) setActiveSection(i);
      }, { threshold: 0.3, rootMargin: "-80px 0px -40% 0px" });
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach(o => o.disconnect());
  }, []);

  return (
    <div style={{minHeight:"100vh",background:"#fafbfc",fontFamily:"'Inter','system-ui',sans-serif"}}>
      {/* CSS animations */}
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0 } }
        @keyframes spin { to { transform:rotate(360deg) } }
        @keyframes calloutPulse { 0%,100% { transform:scale(1);opacity:0.5 } 50% { transform:scale(1.8);opacity:0 } }
        @keyframes cursorClick { 0%,100% { transform:scale(1) } 50% { transform:scale(0.8) } }
        @keyframes highlightPulse { 0%,100% { box-shadow:0 0 0 3px rgba(14,165,233,0.15) } 50% { box-shadow:0 0 0 6px rgba(14,165,233,0.08) } }
        @keyframes particleDrift { 0% { transform:translate(0,0) } 100% { transform:translate(20px,-30px) } }
        @keyframes ringPulse { 0%,100% { box-shadow:0 0 0 4px rgba(99,102,241,0.15) } 50% { box-shadow:0 0 0 8px rgba(99,102,241,0.05) } }
        @keyframes ripple { 0% { transform:translate(-3px,-3px) scale(1);opacity:1 } 100% { transform:translate(-3px,-3px) scale(2.5);opacity:0 } }
        @keyframes heroFloat { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-8px) } }
        @keyframes shimmer { 0% { background-position:-200% 0 } 100% { background-position:200% 0 } }
        @keyframes drawLine { from { stroke-dashoffset:200 } to { stroke-dashoffset:0 } }
        .guida-section { scroll-margin-top: 64px; }
      `}</style>

      {/* Progress bar sticky */}
      <ProgressBar sections={SECTIONS} activeIndex={activeSection} />

      {/* ═══ HERO ═══ */}
      <section id="intro" className="guida-section" style={{
        background:"linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        padding:"80px 20px 64px", textAlign:"center", position:"relative", overflow:"hidden"
      }}>
        <Particles count={30} />
        <div style={{position:"relative",zIndex:1}}>
          <div style={{
            display:"inline-flex", alignItems:"center", gap:8,
            background:"rgba(14,165,233,0.15)", border:"1px solid rgba(14,165,233,0.3)",
            borderRadius:20, padding:"6px 16px", marginBottom:24
          }}>
            <span style={{fontSize:12}}>📖</span>
            <span style={{fontSize:12,fontWeight:700,color:"#7dd3fc"}}>Guida Interattiva</span>
          </div>
          <h1 style={{
            fontSize:"clamp(28px,5vw,44px)", fontWeight:900, color:"white",
            lineHeight:1.15, margin:"0 auto 16px", maxWidth:600
          }}>
            Come usare<br/>
            <span style={{
              background:"linear-gradient(135deg,#38bdf8,#818cf8,#c084fc)",
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text"
            }}>CleaningApp</span>
          </h1>
          <p style={{fontSize:16,color:"#94a3b8",maxWidth:480,margin:"0 auto 32px",lineHeight:1.6}}>
            Segui questa guida passo-passo per configurare il tuo account, aggiungere proprietà e gestire pulizie e biancheria.
          </p>
          {/* Stats */}
          <div style={{display:"flex",justifyContent:"center",gap:32,flexWrap:"wrap"}}>
            {[
              {n:<Counter end={11} />,l:"Passaggi"},
              {n:<Counter end={5} />,l:"Minuti"},
              {n:"✓",l:"Tutto Gratis"},
            ].map((s,i) => (
              <div key={i} style={{textAlign:"center"}}>
                <p style={{fontSize:28,fontWeight:800,color:"white",margin:"0 0 2px"}}>{s.n}</p>
                <p style={{fontSize:11,color:"#64748b",fontWeight:600,textTransform:"uppercase",letterSpacing:1,margin:0}}>{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SEZ 1: REGISTRAZIONE ═══ */}
      <SectionDivider number={1} color="#3B82F6" />
      <GuidaSection id="registrazione" bg="linear-gradient(180deg, #f0f9ff 0%, #fafbfc 100%)">
        <SectionHeader
          title="Crea il tuo Account"
          subtitle="Il primo passo è la registrazione. Bastano pochi secondi per creare il tuo account — non è richiesta nessuna verifica email."
          color="#3B82F6"
          icon="📝"
        />
        <DemoPhone fixedH={500}>
          <ScreenReg />
        </DemoPhone>
        <div style={{maxWidth:520,margin:"24px auto 16px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Compila il form con i tuoi dati personali:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>👤</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Nome e Cognome</b> — Il tuo nome completo come apparirà nel sistema.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>📧</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Email</b> — L'email dove riceverai le notifiche e le comunicazioni.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>📱</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Telefono</b> — Il numero di cellulare per le notifiche push e il contatto diretto.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🔒</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Password</b> — Scegli una password sicura per proteggere il tuo account.</p>
            </div>
          </div>
        </div>
        <TipBox icon="ℹ️" title="Cosa succede dopo?" color="#3B82F6">
          Dopo la registrazione, verrai guidato alla firma del contratto e all'inserimento dei dati di fatturazione. L'account verrà poi verificato dall'amministratore prima di essere attivato.
        </TipBox>
      </GuidaSection>

      {/* ═══ SEZ 2: CONTRATTO ═══ */}
      <SectionDivider number={2} color="#6366F1" />
      <GuidaSection id="contratto" bg="linear-gradient(180deg, #eef2ff 0%, #fafbfc 100%)">
        <SectionHeader
          title="Firma il Contratto"
          subtitle="Dopo la registrazione, ti verrà chiesto di firmare il contratto quadro di servizio. Si fa tutto digitalmente dall'app."
          color="#6366F1"
          icon="✍️"
        />
        <DemoPhone fixedH={640}>
          <ScreenContratto />
        </DemoPhone>
        <div style={{maxWidth:520,margin:"24px auto 16px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Il contratto quadro regola i termini del servizio. Ecco i passaggi:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>📄</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Leggi il contratto</b> — Il testo scorre automaticamente ma puoi leggerlo con calma prima di procedere.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>✍️</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Nome e Codice Fiscale</b> — Inserisci i tuoi dati identificativi come richiesto.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>✒️</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Firma digitale</b> — Disegna la tua firma usando il dito (su mobile) o il mouse (su desktop).</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>📸</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Selfie di verifica</b> — Scatta un selfie del solo volto per la verifica dell'identità.</p>
            </div>
          </div>
        </div>
        <TipBox icon="🔐" title="È sicuro?" color="#6366F1">
          I tuoi dati sono protetti e il contratto viene conservato digitalmente. Puoi consultarlo in qualsiasi momento dal tuo pannello nelle impostazioni.
        </TipBox>
      </GuidaSection>

      {/* ═══ SEZ 3: FATTURAZIONE ═══ */}
      <SectionDivider number={3} color="#10B981" />
      <GuidaSection id="fatturazione" bg="linear-gradient(180deg, #ecfdf5 0%, #fafbfc 100%)">
        <SectionHeader
          title="Dati di Fatturazione"
          subtitle="Inserisci i tuoi dati fiscali per la fatturazione. Puoi scegliere tra Persona Fisica o Azienda."
          color="#10B981"
          icon="💳"
        />
        <DemoPhone fixedH={560}>
          <ScreenFatturazione />
        </DemoPhone>
        <div style={{maxWidth:520,margin:"24px auto 16px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Hai due opzioni per la fatturazione:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:12,padding:"12px 16px"}}>
              <p style={{fontSize:13,fontWeight:700,color:"#334155",margin:"0 0 4px"}}>👤 Persona Fisica</p>
              <p style={{fontSize:13,color:"#64748b",margin:0,lineHeight:1.6}}>Inserisci Nome, Cognome e Codice Fiscale. Ideale per proprietari individuali.</p>
            </div>
            <div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:12,padding:"12px 16px"}}>
              <p style={{fontSize:13,fontWeight:700,color:"#334155",margin:"0 0 4px"}}>🏢 Azienda</p>
              <p style={{fontSize:13,color:"#64748b",margin:0,lineHeight:1.6}}>Inserisci Ragione Sociale, Partita IVA, e Codice SDI o PEC per la fatturazione elettronica.</p>
            </div>
          </div>
        </div>
        <TipBox icon="💡" title="Puoi cambiare dopo?" color="#10B981">
          Sì, potrai modificare i dati di fatturazione in qualsiasi momento dalle impostazioni del tuo account.
        </TipBox>
      </GuidaSection>

      {/* ═══ SEZ 4: ATTESA ═══ */}
      <SectionDivider number={4} color="#F59E0B" />
      <GuidaSection id="attesa">
        <SectionHeader
          title="Attesa Approvazione"
          subtitle="Dopo aver completato registrazione, contratto e fatturazione, il tuo account verrà verificato dall'amministratore."
          color="#F59E0B"
          icon="⏳"
        />
        <DemoPhone fixedH={380}>
          <ScreenAttesa />
        </DemoPhone>
        <TipBox icon="🔔" title="Quando vengo approvato?" color="#F59E0B">
          Riceverai una notifica push e un'email appena l'admin approva il tuo account. A quel punto potrai accedere a tutte le funzionalità della piattaforma.
        </TipBox>
      </GuidaSection>

      {/* ═══ SEZ 5: CREA PROPRIETÀ (6 step) ═══ */}
      <SectionDivider number={5} color="#8B5CF6" />
      <GuidaSection id="proprieta" bg="linear-gradient(180deg, #f5f3ff 0%, #fafbfc 100%)">
        <SectionHeader
          title="Aggiungi una Proprietà"
          subtitle="Una volta approvato il tuo account, puoi aggiungere tutte le proprietà che gestisci. Ogni proprietà viene configurata in 6 step guidati — vediamoli uno per uno."
          color="#8B5CF6"
          icon="🏠"
        />

        <TipBox icon="📍" title="Dove trovo questa funzione?" color="#8B5CF6">
          Dal pannello Proprietario, clicca sul bottone "Nuova Proprietà". Si aprirà un wizard guidato in 6 passaggi. Puoi tornare indietro in qualsiasi momento prima dell'invio finale.
        </TipBox>

        {/* Step 1: Info Base */}
        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#8B5CF6",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>STEP 1 di 6 · Informazioni Base</span>
          </div>
          <DemoPhone fixedH={540}>
            <ScreenStep1 />
          </DemoPhone>
        </FadeUp>
        <div style={{maxWidth:520,margin:"0 auto 48px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Nel primo step inserisci le <b>informazioni fondamentali</b> della proprietà:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🏷️</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Nome proprietà</b> — Un nome identificativo (es. "Appartamento Colosseo"). Lo vedrai in tutte le liste e nelle pulizie.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>📍</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Indirizzo</b> — Inizia a digitare e il sistema ti suggerirà l'indirizzo completo. Le coordinate GPS vengono salvate automaticamente per calcolare le distanze.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🏢</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Piano e Citofono</b> — Informazioni utili per gli operatori che dovranno accedere alla proprietà il giorno della pulizia.</p>
            </div>
          </div>
        </div>

        {/* Step 2: Capacità */}
        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#7C3AED",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>STEP 2 di 6 · Capacità</span>
          </div>
          <DemoPhone fixedH={500}>
            <ScreenStep2 />
          </DemoPhone>
        </FadeUp>
        <div style={{maxWidth:520,margin:"0 auto 48px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Imposta la <b>capacità massima</b> dell'appartamento:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>👥</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Ospiti massimi</b> — Il numero massimo di persone che la proprietà può ospitare. Questo valore viene usato per la configurazione delle dotazioni di biancheria.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🚿</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Numero bagni</b> — Indica quanti bagni ha la proprietà. Serve per calcolare gli asciugamani e i prodotti necessari.</p>
            </div>
          </div>
        </div>

        {/* Step 3: Orari */}
        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#6D28D9",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>STEP 3 di 6 · Orari Check-in / Check-out</span>
          </div>
          <DemoPhone fixedH={460}>
            <ScreenStep3 />
          </DemoPhone>
        </FadeUp>
        <div style={{maxWidth:520,margin:"0 auto 48px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Configura gli <b>orari di check-out e check-in</b> della proprietà. Questi definiscono la finestra temporale in cui la pulizia deve essere completata:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🚪</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Orario Check-out</b> — L'ora in cui gli ospiti lasciano l'appartamento. Corrisponde all'inizio della pulizia (es. 10:00).</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🔑</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Orario Check-in</b> — L'ora in cui arrivano i nuovi ospiti. La pulizia deve essere completata entro questo orario (es. 15:00).</p>
            </div>
          </div>
          <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:12,padding:"12px 16px"}}>
            <p style={{fontSize:13,color:"#1E40AF",margin:0,lineHeight:1.6}}>
              <b>Esempio:</b> Con check-out alle 10:00 e check-in alle 15:00, la finestra per la pulizia è di <b>5 ore</b>. L'operatore riceverà queste informazioni nella sua app.
            </p>
          </div>
        </div>

        {/* Step 4: Stanze e Letti */}
        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#5B21B6",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>STEP 4 di 6 · Stanze e Letti</span>
          </div>
          <DemoPhone fixedH={700}>
            <ScreenStep4 />
          </DemoPhone>
        </FadeUp>
        <div style={{maxWidth:520,margin:"0 auto 48px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Questo è lo step più importante: configura <b>tutte le stanze e i letti</b> presenti nella proprietà. Il sistema usa queste informazioni per calcolare automaticamente la biancheria necessaria.
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>➕</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Aggiungi stanze</b> — Tocca "Aggiungi Stanza" e scegli il tipo: Camera Matrimoniale, Camera Singola, Camera Doppia, Soggiorno, etc.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🛏️</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Configura i letti</b> — Per ogni stanza, espandi e aggiungi i letti: Matrimoniale (2 posti), Singolo (1 posto), Divano Letto (2 posti) o Castello (2 posti).</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>✅</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Posti letto totali</b> — Il contatore in alto mostra i posti letto totali. Devono essere almeno pari al numero di ospiti massimi impostato nello Step 2.</p>
            </div>
          </div>
          <div style={{background:"#F5F3FF",border:"1px solid #DDD6FE",borderRadius:12,padding:"12px 16px"}}>
            <p style={{fontSize:13,color:"#5B21B6",margin:0,lineHeight:1.6}}>
              <b>Perché è importante?</b> La configurazione dei letti è fondamentale perché determina quale biancheria viene preparata per ogni pulizia — lenzuola matrimoniali, singole, federe, ecc.
            </p>
          </div>
        </div>

        {/* Step 5: Dotazioni Biancheria */}
        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#4C1D95",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>STEP 5 di 6 · Dotazioni Biancheria per Ospiti</span>
          </div>
          <DemoPhone fixedH={620}>
            <ScreenStep5 />
          </DemoPhone>
        </FadeUp>
        <div style={{maxWidth:520,margin:"0 auto 48px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Questo step ti permette di configurare <b>quali letti preparare per ogni possibile numero di ospiti</b>. È la parte più intelligente del sistema:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>2️⃣</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Profilo "2 ospiti"</b> — Se arrivano 2 ospiti, quali letti vanno preparati? Es. solo il letto matrimoniale.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>3️⃣</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Profilo "3 ospiti"</b> — Per 3 ospiti magari servono il matrimoniale + il singolo. Seleziona i letti per ogni profilo.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>📦</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Calcolo automatico</b> — Il sistema calcola automaticamente la biancheria necessaria (lenzuola, federe, asciugamani) in base ai letti selezionati per quel profilo.</p>
            </div>
          </div>
          <div style={{background:"#ECFDF5",border:"1px solid #A7F3D0",borderRadius:12,padding:"12px 16px"}}>
            <p style={{fontSize:13,color:"#065F46",margin:0,lineHeight:1.6}}>
              <b>Come funziona in pratica?</b> Quando crei una pulizia e indichi "3 ospiti", il sistema guarda il profilo "3 ospiti" di quella proprietà e sa esattamente quali letti preparare e quale biancheria portare.
            </p>
          </div>
        </div>

        {/* Step 6: Foto e Invio */}
        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#3B0764",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>STEP 6 di 6 · Foto e Invio</span>
          </div>
          <DemoPhone fixedH={540}>
            <ScreenStep6 />
          </DemoPhone>
        </FadeUp>
        <div style={{maxWidth:520,margin:"0 auto 32px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            L'ultimo passaggio: carica una <b>foto rappresentativa</b> della proprietà e invia il tutto.
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>📸</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Foto</b> — Carica una foto della proprietà (JPG o PNG, max 10MB). Questa foto verrà mostrata nelle liste e nelle card delle pulizie.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>📤</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Crea Proprietà</b> — Clicca il bottone finale e la proprietà verrà inviata all'admin per l'approvazione.</p>
            </div>
          </div>
        </div>

        <TipBox icon="⏱️" title="Cosa succede dopo?" color="#8B5CF6">
          La proprietà rimane "in attesa di approvazione" finché l'admin non la verifica. Una volta approvata, riceverai una notifica e potrai iniziare a creare pulizie e richiedere biancheria per quella proprietà.
        </TipBox>
      </GuidaSection>

      {/* ═══ SEZ 6: iCAL ═══ */}
      <SectionDivider number={6} color="#10B981" />
      <GuidaSection id="ical" bg="linear-gradient(180deg, #ecfdf5 0%, #fafbfc 100%)">
        <SectionHeader
          title="Collega i Calendari iCal"
          subtitle="Collega Airbnb, Booking.com, Oktorate e altre piattaforme per sincronizzare automaticamente le prenotazioni e creare pulizie in automatico."
          color="#10B981"
          icon="🔗"
        />
        <DemoPhone fixedH={440}>
          <ScreenIcal />
        </DemoPhone>
        <div style={{maxWidth:520,margin:"24px auto 16px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Il collegamento iCal è <b>fondamentale</b> per automatizzare tutto il flusso:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>1️⃣</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Vai nelle impostazioni della piattaforma (Airbnb, Booking, ecc.) e copia il <b>link iCal del calendario</b>.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>2️⃣</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Incolla il link nella scheda della proprietà su CleaningApp e salva.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>3️⃣</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Il sistema sincronizza automaticamente e <b>crea le pulizie</b> per ogni nuova prenotazione rilevata.</p>
            </div>
          </div>
        </div>
        <TipBox icon="🔄" title="Sincronizzazione automatica" color="#10B981">
          Il sistema controlla periodicamente i calendari collegati. Quando rileva una nuova prenotazione, crea automaticamente la pulizia corrispondente con la data del check-out. Puoi collegare più piattaforme contemporaneamente.
        </TipBox>
      </GuidaSection>

      {/* ═══ SEZ 7: PULIZIA ═══ */}
      <SectionDivider number={7} color="#0EA5E9" />
      <GuidaSection id="pulizia" bg="linear-gradient(180deg, #f0f9ff 0%, #fafbfc 100%)">
        <SectionHeader
          title="Crea una Pulizia Manuale"
          subtitle="Oltre alle pulizie create automaticamente dai calendari iCal, puoi anche creare pulizie manualmente quando serve."
          color="#0EA5E9"
          icon="🧹"
        />
        <DemoPhone fixedH={640}>
          <ScreenNuovaPulizia />
        </DemoPhone>
        <div style={{maxWidth:520,margin:"24px auto 16px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            La creazione di una pulizia manuale avviene in <b>2 step</b>:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>📋</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Step 1 — Proprietà e Servizio:</b> Seleziona la proprietà, scegli la data e decidi se includere anche la biancheria oltre alla pulizia.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>👥</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Step 2 — Ospiti e Note:</b> Indica il numero di ospiti (per il calcolo biancheria), aggiungi eventuali note per l'operatore e conferma.</p>
            </div>
          </div>
        </div>
        <TipBox icon="💰" title="Come funziona il prezzo?" color="#0EA5E9">
          Il prezzo della pulizia viene determinato in base alla proprietà. Se includi la biancheria, il costo viene aggiunto automaticamente in base al numero di ospiti e alla configurazione delle dotazioni (Step 5 della proprietà).
        </TipBox>
      </GuidaSection>

      {/* ═══ SEZ 8: BIANCHERIA ═══ */}
      <SectionDivider number={8} color="#EC4899" />
      <GuidaSection id="biancheria" bg="linear-gradient(180deg, #fdf2f8 0%, #fafbfc 100%)">
        <SectionHeader
          title="Richiedi Solo Biancheria"
          subtitle="Se hai bisogno solo di biancheria fresca senza la pulizia, puoi creare un ordine separato con consegna a domicilio."
          color="#EC4899"
          icon="🛏️"
        />
        <DemoPhone fixedH={640}>
          <ScreenSoloBiancheria />
        </DemoPhone>
        <div style={{maxWidth:520,margin:"24px auto 16px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            L'ordine di sola biancheria è utile quando la pulizia la fai tu ma hai bisogno che la biancheria venga consegnata:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🧺</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Seleziona "Solo Biancheria"</b> dallo stesso modal di creazione pulizia, scegli proprietà e data.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>📦</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Seleziona gli articoli</b> necessari: lenzuola, asciugamani, e le quantità per ciascuno.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🛏️</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Preparazione Letti (opzionale)</b> — Puoi anche richiedere che un operatore stenda le lenzuola e prepari i letti per gli ospiti.</p>
            </div>
          </div>
        </div>
        <TipBox icon="🚚" title="Come viene consegnata?" color="#EC4899">
          Un rider si occuperà di consegnare la biancheria alla proprietà nella data selezionata. Potrai seguire lo stato dell'ordine in tempo reale dall'app.
        </TipBox>
      </GuidaSection>

      {/* ═══ SEZ 9: OSPITI ═══ */}
      <SectionDivider number={9} color="#7C3AED" />
      <GuidaSection id="ospiti" bg="linear-gradient(180deg, #f5f3ff 0%, #fafbfc 100%)">
        <SectionHeader
          title="Aggiorna il Numero Ospiti"
          subtitle="Puoi aggiornare il numero di ospiti di una pulizia in qualsiasi momento. La biancheria verrà ricalcolata automaticamente."
          color="#7C3AED"
          icon="👥"
        />
        <DemoPhone fixedH={580}>
          <ScreenPulizia />
        </DemoPhone>
        <div style={{maxWidth:520,margin:"24px auto 16px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Dalla lista delle pulizie di oggi, ogni card mostra le informazioni principali:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🕐</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Orario</b> — L'ora di inizio della pulizia (coincide con il check-out della proprietà).</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>👥</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Bottone Ospiti (viola)</b> — Tocca questo bottone per aprire il pannello di modifica ospiti. Puoi aumentare o diminuire il numero.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🔄</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Ricalcolo automatico</b> — Quando confermi il nuovo numero, la biancheria viene ricalcolata in base alla configurazione delle dotazioni di quella proprietà.</p>
            </div>
          </div>
        </div>
        <TipBox icon="⚡" title="Aggiornamento in tempo reale" color="#7C3AED">
          La modifica viene propagata immediatamente a tutti: l'operatore che deve fare la pulizia e il rider che consegna la biancheria vedranno le quantità aggiornate nella loro app.
        </TipBox>
      </GuidaSection>

      {/* ═══ SEZ 10: FAQ ═══ */}
      <SectionDivider number="?" color="#64748B" />
      <GuidaSection id="faq">
        <SectionHeader
          title="Domande Frequenti"
          subtitle="Risposte rapide alle domande più comuni."
          color="#64748B"
          icon="❓"
        />
        <div style={{maxWidth:560,margin:"0 auto",paddingBottom:40}}>
          <Accordion title="Come ricevo le notifiche?">
            Ricevi notifiche push sul telefono e nell'app. Assicurati di abilitare le notifiche quando richiesto dal browser. Puoi anche ricevere notifiche via email.
          </Accordion>
          <Accordion title="Posso modificare una pulizia dopo averla creata?">
            Sì, puoi modificare data, numero ospiti e note. Se la pulizia è già stata assegnata a un operatore, le modifiche verranno notificate automaticamente.
          </Accordion>
          <Accordion title="Come funziona la fatturazione?">
            Le pulizie e la biancheria vengono addebitate con fatturazione mensile posticipata. Puoi consultare il riepilogo dei costi nel tuo pannello.
          </Accordion>
          <Accordion title="Posso aggiungere più proprietà?">
            Sì, puoi aggiungere tutte le proprietà che vuoi. Ogni proprietà deve essere approvata dall'admin prima di essere attiva.
          </Accordion>
          <Accordion title="Come collego un nuovo calendario iCal?">
            Vai nella scheda della proprietà e aggiungi i link iCal dalle piattaforme di prenotazione (Airbnb, Booking, ecc.). La sincronizzazione è automatica.
          </Accordion>
          <Accordion title="Cosa succede se non inserisco il numero ospiti?">
            La biancheria verrà calcolata con la configurazione predefinita. Ti consigliamo di aggiornare sempre il numero ospiti per avere la dotazione corretta.
          </Accordion>
        </div>
      </GuidaSection>

      {/* ═══ FOOTER CTA ═══ */}
      <section style={{
        background:"linear-gradient(135deg, #0f172a, #1e293b)",
        padding:"64px 20px", textAlign:"center"
      }}>
        <FadeUp>
          <h2 style={{fontSize:28,fontWeight:800,color:"white",margin:"0 0 12px"}}>Pronto per iniziare?</h2>
          <p style={{fontSize:15,color:"#94a3b8",margin:"0 0 28px"}}>Crea il tuo account e inizia a gestire le tue proprietà.</p>
          <a href={REG} style={{
            display:"inline-flex", alignItems:"center", gap:8,
            background:"linear-gradient(135deg,#3b82f6,#6366f1)",
            color:"white", fontWeight:700, fontSize:15,
            padding:"14px 32px", borderRadius:16,
            textDecoration:"none",
            boxShadow:"0 8px 32px rgba(59,130,246,0.4)"
          }}>
            Registrati Ora
            <Icons.arrowRight className="w-5 h-5" />
          </a>
        </FadeUp>
      </section>
    </div>
  );
}

export default GuidaPage;

