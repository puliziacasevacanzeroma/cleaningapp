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

/* ═══ COMPLETION OVERLAY — mostra successo e segnala il riavvio ═══ */
function CompletionOverlay({ visible, message = "Completato!", onPhase = "done" }) {
  return (
    <div style={{
      position:"absolute", inset:0, zIndex:50,
      background:"rgba(255,255,255,0.92)",
      backdropFilter:"blur(6px)",
      WebkitBackdropFilter:"blur(6px)",
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? "auto" : "none",
      transition:"opacity 0.5s ease"
    }}>
      {/* Cerchio successo animato */}
      <div style={{
        width:56, height:56, borderRadius:"50%",
        background:"linear-gradient(135deg,#10B981,#059669)",
        display:"flex", alignItems:"center", justifyContent:"center",
        boxShadow:"0 8px 24px rgba(16,185,129,0.3)",
        transform: visible ? "scale(1)" : "scale(0.5)",
        transition:"transform 0.4s cubic-bezier(0.34,1.56,0.64,1) 0.1s",
        marginBottom:12
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" style={{
            strokeDasharray:24,
            strokeDashoffset: visible ? 0 : 24,
            transition:"stroke-dashoffset 0.5s ease 0.3s"
          }}/>
        </svg>
      </div>
      <p style={{fontSize:15,fontWeight:700,color:"#10B981",margin:"0 0 6px"}}>{message}</p>
      {/* Indicatore riavvio */}
      <div style={{
        display:"flex", alignItems:"center", gap:6,
        opacity: visible ? 1 : 0,
        transition:"opacity 0.4s ease 1s"
      }}>
        <div style={{
          width:16, height:16, borderRadius:"50%",
          border:"2px solid #cbd5e1",
          borderTopColor:"#64748b",
          animation: visible ? "spin 1s linear infinite" : "none"
        }}/>
        <span style={{fontSize:11,color:"#94a3b8",fontWeight:500}}>Replay tra poco...</span>
      </div>
    </div>
  );
}

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
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const updatePos = () => {
      if (!targetRef?.current || !containerRef.current) return;
      const target = targetRef.current.getBoundingClientRect();
      const container = containerRef.current.getBoundingClientRect();
      const newPos = {
        x: target.left - container.left + target.width / 2,
        y: target.top - container.top + target.height / 2,
      };
      if (newPos.x !== lastPos.current.x || newPos.y !== lastPos.current.y) {
        lastPos.current = newPos;
        setPos(newPos);
      }
    };
    updatePos();
    // Poll every 100ms to catch DOM changes
    const interval = setInterval(updatePos, 100);
    window.addEventListener('resize', updatePos);
    return () => { clearInterval(interval); window.removeEventListener('resize', updatePos); };
  }, [targetRef]);

  if (!visible) return <div ref={containerRef} style={{position:'absolute',inset:0,pointerEvents:'none'}}/>;

  return (
    <div ref={containerRef} style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:50}}>
      <div style={{
        position:'absolute',
        left: pos.x,
        top: pos.y,
        transform: `translate(-2px,-2px) scale(${clicking?0.8:1})`,
        transition: 'left 0.7s cubic-bezier(0.34,1.1,0.64,1), top 0.7s cubic-bezier(0.34,1.1,0.64,1), transform 0.15s',
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
  // 0=idle, 1=cursor→nome, 2=nome filled, 3=cursor→email, 4=email filled,
  // 5=cursor→tel, 6=tel filled, 7=cursor→pwd, 8=pwd filled,
  // 9=cursor→registrati, 10=click, 11=done, 12=overlay
  useEffect(() => {
    if (!vis) { setStep(0); return; }
    const seq = [0,0,1200,2400,3400,4600,5600,6800,7800,9000,10000,10800,11600];
    const timers = seq.map((t,i)=>setTimeout(()=>setStep(i),t));
    const loop = setInterval(()=>{ setStep(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setStep(i),t)); }); },15000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  }, [vis]);

  const nomeRef2 = useRef(null);
  const emailRef = useRef(null);
  const telRef = useRef(null);
  const pwdRef = useRef(null);
  const btnRef2 = useRef(null);

  const activeRef = step===1||step===2?nomeRef2:step===3||step===4?emailRef:step===5||step===6?telRef:step===7||step===8?pwdRef:step>=9&&step<11?btnRef2:null;
  const clicking = step===10;
  const done = step >= 11;
  const showComplete = step >= 12;

  const filled = [step>=2, step>=4, step>=6, step>=8];
  const active = [step===1||step===2, step===3||step===4, step===5||step===6, step===7||step===8];

  const fields = [
    { label:"NOME E COGNOME *", value:"Mario Rossi", icon:Icons.user, ref:nomeRef2 },
    { label:"EMAIL *", value:"mario.rossi@email.com", icon:Icons.mail, ref:emailRef },
    { label:"TELEFONO *", value:"+39 333 123 4567", icon:Icons.phone, ref:telRef },
    { label:"PASSWORD *", value:"••••••••", icon:Icons.lock, ref:pwdRef },
  ];

  return (
    <div ref={ref} style={{position:"relative"}}>
      {vis && activeRef && !showComplete && <SmartCursor targetRef={activeRef} clicking={clicking} visible={true} />}
      <AppScreen>
        <div className="p-4" style={{position:"relative"}}>
          <CompletionOverlay visible={showComplete} message="Account Creato!" />
          <div className="text-center mb-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center mx-auto mb-1.5 shadow-lg shadow-sky-200">
              <span className="text-white text-base font-bold">C</span>
            </div>
            <h3 className="font-bold text-slate-800 text-[13px]">Crea il tuo Account</h3>
            <p className="text-[9px] text-slate-400">Compila i dati per registrarti</p>
          </div>
          {fields.map((f, i) => (
            <div key={i} className="mb-2">
              <label className="text-[8px] font-semibold text-slate-500 block mb-0.5 uppercase tracking-wide pl-1">{f.label}</label>
              <div ref={f.ref} className={`border-2 rounded-xl px-3 py-2 text-[11px] flex items-center gap-2 transition-all ${active[i] ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-slate-50/80 text-slate-700"}`}>
                <f.icon className="w-3 h-3 text-slate-400 flex-shrink-0" />
                <span className={filled[i] ? "text-slate-800" : "text-transparent"} style={{minWidth:1}}>
                  {filled[i] ? f.value : "‎"}
                </span>
                {active[i] && <span style={{animation:"blink 1s infinite",marginLeft:"auto",color:"#0EA5E9",fontSize:12}}>|</span>}
              </div>
            </div>
          ))}
          <button ref={btnRef2} className={`w-full text-white text-center py-2.5 rounded-xl text-[12px] font-bold mt-1 flex items-center justify-center gap-2 transition-all ${done ? "bg-emerald-500 shadow-lg shadow-emerald-200/50" : clicking ? "bg-blue-700 scale-95" : "bg-gradient-to-r from-sky-500 to-blue-600 shadow-lg shadow-sky-200/50"}`}>
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
  const nomeRef = useRef(null);
  const cfRef = useRef(null);
  const check1Ref = useRef(null);
  const check2Ref = useRef(null);
  const firmaRef = useRef(null);
  const selfieRef = useRef(null);
  const btnRef = useRef(null);

  const nomeTarget = "Mario Rossi";
  const cfTarget = "RSSMRA80A01H501Z";
  const [nomeText, setNomeText] = useState("");
  const [cfText, setCfText] = useState("");

  /*
    Fasi:
    0  = idle
    1  = scroll contratto inizia (lento)
    2  = scroll a metà
    3  = scroll arriva in fondo → appare flag verde ✅
    4  = cursore su checkbox 1 "Accetto i termini"
    5  = checkbox 1 spuntata
    6  = cursore su checkbox 2 "Accetto la privacy"
    7  = checkbox 2 spuntata
    8  = cursore su campo Nome
    9  = nome digitato
    10 = cursore su CF
    11 = CF digitato
    12 = cursore su firma
    13 = firma si disegna
    14 = cursore su selfie
    15 = camera aperta
    16 = selfie acquisito
    17 = cursore su bottone
    18 = click bottone
    19 = done
    20 = overlay completamento + replay
  */
  useEffect(() => {
    if (!vis) { setPhase(0); setNomeText(""); setCfText(""); return; }
    const timers = [];
    function schedule() {
      // Scroll contratto — 3 fasi per scrollare fino in fondo
      // Scroll contratto — 3 fasi con translateY (gestito dallo state phase)
      timers.push(setTimeout(() => {
        setPhase(1);
      }, 800));
      timers.push(setTimeout(() => {
        setPhase(2);
      }, 2200));
      timers.push(setTimeout(() => {
        setPhase(3);
      }, 3400));
      // Checkbox termini
      timers.push(setTimeout(() => setPhase(4), 4800));
      timers.push(setTimeout(() => setPhase(5), 5400));
      // Checkbox privacy
      timers.push(setTimeout(() => setPhase(6), 6000));
      timers.push(setTimeout(() => setPhase(7), 6600));
      // Nome
      timers.push(setTimeout(() => setPhase(8), 7200));
      nomeTarget.split("").forEach((ch, i) => {
        timers.push(setTimeout(() => setNomeText(nomeTarget.slice(0, i + 1)), 7800 + i * 80));
      });
      timers.push(setTimeout(() => setPhase(9), 7800 + nomeTarget.length * 80));
      // CF
      timers.push(setTimeout(() => setPhase(10), 9200));
      cfTarget.split("").forEach((ch, i) => {
        timers.push(setTimeout(() => setCfText(cfTarget.slice(0, i + 1)), 9800 + i * 55));
      });
      timers.push(setTimeout(() => setPhase(11), 9800 + cfTarget.length * 55));
      // Firma
      timers.push(setTimeout(() => setPhase(12), 11500));
      timers.push(setTimeout(() => setPhase(13), 12100));
      // Selfie
      timers.push(setTimeout(() => setPhase(14), 13400));
      timers.push(setTimeout(() => setPhase(15), 14000));
      timers.push(setTimeout(() => setPhase(16), 15200));
      // Bottone
      timers.push(setTimeout(() => setPhase(17), 16000));
      timers.push(setTimeout(() => setPhase(18), 16600));
      timers.push(setTimeout(() => setPhase(19), 17200));
      // Overlay completamento
      timers.push(setTimeout(() => setPhase(20), 17800));
    }
    schedule();
    const loop = setInterval(() => {
      setPhase(0); setNomeText(""); setCfText("");
      timers.length = 0;
      schedule();
    }, 21000);
    return () => { timers.forEach(clearTimeout); clearInterval(loop); };
  }, [vis]);

  const done = phase >= 19;
  const showComplete = phase >= 20;
  const scrolledToBottom = phase >= 3;
  const ch1 = phase >= 5;
  const ch2 = phase >= 7;

  const activeRef =
    phase <= 3 ? null :
    phase <= 5 ? check1Ref :
    phase <= 7 ? check2Ref :
    phase <= 9 ? nomeRef :
    phase <= 11 ? cfRef :
    phase <= 13 ? firmaRef :
    phase <= 16 ? selfieRef :
    btnRef;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", width: "100%" }}>
      {vis && activeRef && !showComplete && <SmartCursor targetRef={activeRef} clicking={phase === 4 || phase === 6 || phase === 8 || phase === 10 || phase === 12 || phase === 14 || phase === 17} visible={true} />}

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100" style={{position:"relative"}}>
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-2.5 text-white" style={{flexShrink:0}}>
          <div className="flex items-center justify-between mb-1.5">
            <h2 className="text-xs font-bold">Firma Contratto Quadro</h2>
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6L18 18" /></svg>
            </div>
          </div>
          <div className="flex gap-1">
            {[0, 1, 2].map(i => <div key={i} className={`flex-1 h-1.5 rounded-full ${i === 0 ? "bg-sky-400" : "bg-white/20"}`} />)}
          </div>
          <p className="text-[10px] text-white/60 mt-1.5">Step 1 di 3 · Contratto</p>
        </div>

        <div className="p-3 space-y-1.5">
          {/* Testo contratto — simula scroll con translateY */}
          <div style={{position:"relative"}}>
            <div
              className="bg-slate-50 rounded-xl border border-slate-200"
              style={{ height: 130, overflow: "hidden", position: "relative" }}
            >
              <div className="p-3" style={{ 
                transform: `translateY(${phase>=3 ? -180 : phase>=2 ? -90 : phase>=1 ? -40 : 0}px)`,
                transition: "transform 1.5s cubic-bezier(0.4,0,0.2,1)"
              }}>
                <p className="text-[8px] text-slate-700 font-bold mb-1.5">CONTRATTO QUADRO DI SERVIZIO</p>
                <p className="text-[8px] text-slate-500 leading-relaxed mb-1.5">
                  <b>Art. 1 — Oggetto.</b> Servizio di pulizia professionale per immobili turistici fornito da Pulizia Case Vacanze S.r.l.
                </p>
                <p className="text-[8px] text-slate-500 leading-relaxed mb-1.5">
                  <b>Art. 2 — Obblighi.</b> Garantire accesso, comunicare ospiti entro le 20:00 del giorno prima, aggiornare i link iCal.
                </p>
                <p className="text-[8px] text-slate-500 leading-relaxed mb-1.5">
                  <b>Art. 3 — Corrispettivo.</b> Stabilito nell'Allegato D. Pagamento mensile posticipato entro il 10 del mese successivo.
                </p>
                <p className="text-[8px] text-slate-500 leading-relaxed mb-1.5">
                  <b>Art. 4 — Recesso.</b> Preavviso scritto di 30 giorni.
                </p>
                <p className="text-[8px] text-slate-500 leading-relaxed mb-1.5">
                  <b>Art. 5 — Privacy.</b> GDPR 679/2016.
                </p>
                <p className="text-[8px] text-slate-500 leading-relaxed mb-1.5">
                  <b>Art. 6 — Foro.</b> Roma.
                </p>
                <p className="text-[8px] text-slate-500 leading-relaxed mb-1.5">
                  <b>Art. 7 — Sospensione.</b> Mancato pagamento = sospensione.
                </p>
                <p className="text-[8px] text-slate-500 leading-relaxed mb-1.5">
                  <b>Art. 8 — Disposizioni Finali.</b> Sostituisce ogni accordo precedente.
                </p>
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,paddingTop:6,paddingBottom:4}}>
                  <div style={{height:1,flex:1,background:"#cbd5e1"}}/>
                  <span style={{fontSize:8,color:"#64748b",fontWeight:700}}>— FINE DEL CONTRATTO —</span>
                  <div style={{height:1,flex:1,background:"#cbd5e1"}}/>
                </div>
              </div>
              <div
                className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none"
                style={{ opacity: scrolledToBottom ? 0 : 1, transition: "opacity 0.8s ease" }}
              />
            </div>
            {/* Flag verde che appare quando si arriva in fondo */}
            <div style={{
              position:"absolute", bottom:4, right:8,
              background:"#10B981", borderRadius:12, padding:"2px 8px",
              fontSize:8, fontWeight:700, color:"white",
              display:"flex", alignItems:"center", gap:3,
              opacity: scrolledToBottom ? 1 : 0,
              transform: scrolledToBottom ? "scale(1)" : "scale(0.5)",
              transition:"all 0.4s cubic-bezier(0.34,1.56,0.64,1)",
              zIndex:5
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" style={{width:8,height:8}}><path d="M5 13L9 17L19 7"/></svg>
              Letto tutto
            </div>
          </div>

          {/* 2 Checkbox — Accettazione termini e Privacy */}
          <div className="space-y-1">
            <label ref={check1Ref} style={{
              display:"flex", alignItems:"flex-start", gap:6, padding:"4px 8px",
              borderRadius:8, border: ch1 ? "1.5px solid #10B981" : "1.5px solid #e2e8f0",
              background: ch1 ? "#ecfdf5" : "white",
              cursor:"pointer", transition:"all 0.3s ease"
            }}>
              <div style={{
                width:16, height:16, borderRadius:4, flexShrink:0, marginTop:1,
                border: ch1 ? "none" : "2px solid #cbd5e1",
                background: ch1 ? "#10B981" : "white",
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"all 0.2s ease"
              }}>
                {ch1 && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" style={{width:10,height:10}}><path d="M5 13L9 17L19 7"/></svg>}
              </div>
              <span style={{fontSize:9,color:"#334155",lineHeight:1.4}}>
                Accetto i <b>termini e condizioni</b> del contratto quadro di servizio
              </span>
            </label>
            <label ref={check2Ref} style={{
              display:"flex", alignItems:"flex-start", gap:6, padding:"4px 8px",
              borderRadius:8, border: ch2 ? "1.5px solid #10B981" : "1.5px solid #e2e8f0",
              background: ch2 ? "#ecfdf5" : "white",
              cursor:"pointer", transition:"all 0.3s ease"
            }}>
              <div style={{
                width:16, height:16, borderRadius:4, flexShrink:0, marginTop:1,
                border: ch2 ? "none" : "2px solid #cbd5e1",
                background: ch2 ? "#10B981" : "white",
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"all 0.2s ease"
              }}>
                {ch2 && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" style={{width:10,height:10}}><path d="M5 13L9 17L19 7"/></svg>}
              </div>
              <span style={{fontSize:9,color:"#334155",lineHeight:1.4}}>
                Accetto l'<b>informativa sulla privacy</b> (GDPR 679/2016)
              </span>
            </label>
          </div>

          {/* Nome */}
          <div>
            <label className="block text-[9px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Nome Firmatario *</label>
            <div
              ref={nomeRef}
              className={`border-2 rounded-xl px-3 py-1.5 text-[11px] flex items-center gap-2 transition-all duration-300
                ${phase >= 8 && phase <= 9 ? "border-indigo-400 bg-indigo-50/50" : phase > 9 ? "border-indigo-200 bg-slate-50" : "border-slate-200 bg-slate-50"}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3 text-slate-400 flex-shrink-0"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              <span className="text-slate-800">{nomeText}</span>
              {(phase === 8 || phase === 9) && <span style={{ animation: "blink 0.8s infinite", color: "#6366F1", fontSize: 14 }}>|</span>}
            </div>
          </div>

          {/* CF */}
          <div>
            <label className="block text-[9px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Codice Fiscale *</label>
            <div
              ref={cfRef}
              className={`border-2 rounded-xl px-3 py-1.5 text-[11px] flex items-center gap-2 transition-all duration-300
                ${phase >= 10 && phase <= 11 ? "border-indigo-400 bg-indigo-50/50" : phase > 11 ? "border-indigo-200 bg-slate-50" : "border-slate-200 bg-slate-50"}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3 text-slate-400 flex-shrink-0"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
              <span className="text-slate-800 font-mono text-[10px]">{cfText}</span>
              {(phase === 10 || phase === 11) && <span style={{ animation: "blink 0.8s infinite", color: "#6366F1", fontSize: 14 }}>|</span>}
            </div>
          </div>

          {/* Firma */}
          <div>
            <label className="block text-[9px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Firma Digitale *</label>
            <div
              ref={firmaRef}
              className={`border-2 rounded-xl h-10 flex items-center justify-center transition-all duration-300
                ${phase >= 12 && phase <= 13 ? "border-sky-400 bg-sky-50/20" : phase >= 13 ? "border-sky-300 bg-sky-50/30" : "border-dashed border-slate-300 bg-slate-50"}`}
            >
              {phase >= 13 ? (
                <svg width="140" height="28" viewBox="0 0 160 36">
                  <path
                    d="M8,26 Q22,6 42,20 Q62,34 82,12 Q102,0 128,20 Q142,30 154,16"
                    stroke="#0ea5e9" strokeWidth="2.5" fill="none"
                    strokeLinecap="round" strokeLinejoin="round"
                    strokeDasharray="220"
                    strokeDashoffset={phase === 13 ? "220" : "0"}
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
              className={`border-2 rounded-xl overflow-hidden ${phase >= 14 ? "border-emerald-400" : "border-dashed border-slate-300"}`}
              style={{ height: 48, flexShrink: 0 }}
            >
              {phase >= 16 ? (
                <div style={{ height: "100%", background: "linear-gradient(160deg,#1e293b,#0f172a)", position: "relative", animation: "fadeIn 0.5s" }}>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#fbbf24,#f59e0b)", border: "2px solid rgba(255,255,255,0.25)", marginBottom: 2 }} />
                      <div style={{ width: 44, height: 12, borderRadius: "22px 22px 0 0", background: "linear-gradient(135deg,#0ea5e9,#0284c7)" }} />
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 8 }}>
                      <p style={{ fontWeight: 700, marginBottom: 1 }}>Mario Rossi</p>
                      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 7 }}>Selfie verificato</p>
                    </div>
                  </div>
                  <div style={{ position: "absolute", top: 4, right: 6, background: "#10B981", borderRadius: 16, padding: "1px 6px", fontSize: 7, fontWeight: 700, color: "white", display: "flex", alignItems: "center", gap: 2 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" style={{ width: 7, height: 7 }}><path d="M5 13L9 17L19 7" /></svg>
                    OK
                  </div>
                </div>
              ) : phase >= 15 ? (
                <div style={{ height: "100%", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", border: "2px solid #10B981", display: "flex", alignItems: "center", justifyContent: "center", animation: "ringPulse 1s ease-in-out infinite" }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid rgba(16,185,129,0.4)" }} />
                  </div>
                </div>
              ) : phase >= 14 ? (
                <div style={{ height: "100%", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 0.3s" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)" }} />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center gap-2 bg-slate-50">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 text-slate-400"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" /></svg>
                  <span className="text-[8px] text-slate-400">Scatta selfie del volto</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <CompletionOverlay visible={showComplete} message="Contratto Firmato!" />
        <div className="px-3 pb-2">
          <button
            ref={btnRef}
            className={`w-full py-2 rounded-xl text-xs font-bold text-white shadow-lg transition-all duration-300
              ${done ? "bg-emerald-500 shadow-emerald-200/50" : phase === 18 ? "scale-95 bg-sky-700" : "bg-gradient-to-r from-sky-500 to-blue-600 shadow-sky-200/40"}`}
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
    const seq = [0, 0, 1400, 2600, 4000, 5200, 6400, 7600, 9000, 10200, 11400, 12400, 13200];
    const timers = seq.map((t,i) => setTimeout(() => setPhase(i), t));
    const loop = setInterval(() => {
      setPhase(0);
      seq.forEach((t,i) => { timers.push(setTimeout(() => setPhase(i), t)); });
    }, 16500);
    return () => { timers.forEach(clearTimeout); clearInterval(loop); };
  }, [vis]);

  const isAzienda = phase >= 2 && phase < 4;
  const done = phase >= 10;
  const showComplete = phase >= 11;

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

        <div className="p-3 space-y-2">
          {/* Titolo step — compatto */}
          <div className="text-center mb-0">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-lg flex items-center justify-center mx-auto mb-1">
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

          {/* Campi — cambiano in base al tab — altezza fissa per evitare layout shift */}
          <div style={{minHeight:200}}>
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
        </div>

        <CompletionOverlay visible={showComplete} message="Dati Salvati!" />
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
    <AppScreen>
      <div className="p-6 flex flex-col items-center justify-center min-h-[260px]">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
          <Icons.clock className="w-8 h-8 text-amber-500" />
        </div>
        <h3 className="font-bold text-slate-800 text-[15px] text-center mb-2">Account in Revisione</h3>
        <p className="text-[12px] text-slate-500 text-center leading-relaxed mb-4">L'amministratore verificherà i tuoi dati. Riceverai una notifica appena approvato.</p>
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
      padding: "8px 14px",
      margin: "6px 0",
      background: visible ? color + "12" : "transparent",
      borderTop: visible ? "1px solid " + color + "30" : "1px solid transparent",
      minHeight: 36,
      transition: "background 0.4s ease, border-color 0.4s ease"}}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <p style={{
        fontSize: 11,
        fontWeight: 600,
        color: visible ? color : "#94a3b8",
        margin: 0,
        transition: "color 0.4s ease",
        lineHeight: 1.4}}>{text}</p>
    </div>
  );
}

/* ── STEP 1: Info Base ── */
/* ── STEP 0: Pagina Proprietà vuota → Click + → Modal ── */
function ScreenStep0() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  /*
    0  = Dashboard con navbar → Dashboard attivo
    1  = cursore sulla voce "Proprietà" nella navbar
    2  = click → pagina Proprietà si apre, Proprietà attivo nella navbar
    3  = cursore sul + viola in alto a destra
    4  = click → modal "Nuova Proprietà" si apre
    5  = overlay
  */
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1600,3000,4400,5800,7200,8000];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },11500);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const navPropRef = useRef(null);
  const plusRef = useRef(null);
  const startRef = useRef(null);
  const showPropPage = phase >= 2;
  const showModal = phase >= 4;
  const activeRef = phase===0?startRef:phase===1?navPropRef:phase===3?plusRef:null;
  const clicking = phase===2||phase===4;
  const cursorVisible = vis && phase<5 && (phase===0||phase===1||phase===3||phase===4);

  const navItems = [
    {d:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",l:"Dashboard"},
    {d:"M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",l:"Proprietà"},
    {d:"M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",l:"Pulizie"},
    {d:"M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",l:"Prenotazioni"},
    {d:"M4 6h16M4 12h16M4 18h16",l:"Menu"},
  ];

  const activeNav = showPropPage ? "Proprietà" : "Dashboard";

  return (
      <div ref={ref} style={{position:"relative",display:"flex",flexDirection:"column",height:"100%",background:"white"}}>
      {/* Punto di partenza cursore — angolo in alto a sinistra */}
      <div ref={startRef} style={{position:"absolute",left:20,top:20,width:1,height:1,pointerEvents:"none"}}/>
      {cursorVisible&&activeRef&&<SmartCursor targetRef={activeRef} clicking={clicking} visible={true}/>}
        <CompletionOverlay visible={phase>=5} message="Modal Aperta!" />

        {!showPropPage ? (
          /* ═══ DASHBOARD ═══ */
          <>
            <div style={{background:"linear-gradient(135deg,#1c1917,#292524)",padding:"14px 16px"}}>
              <p style={{fontSize:14,fontWeight:800,color:"white",margin:0}}>CleaningApp</p>
              <p style={{fontSize:8,color:"#a8a29e",margin:"2px 0 0"}}>Area Proprietario</p>
            </div>
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
              <div style={{width:44,height:44,borderRadius:12,background:"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" style={{width:22,height:22}}><path d="m3 9 9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </div>
              <p style={{fontSize:11,fontWeight:600,color:"#64748b",margin:0}}>Benvenuto! Inizia aggiungendo una proprietà</p>
            </div>
          </>
        ) : !showModal ? (
          /* ═══ PAGINA PROPRIETÀ ═══ */
          <>
            <div style={{background:"#0b0b18",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,#2d1b69 0%,#1a1a2e 40%,#0b0b18 100%)",opacity:0.8}}/>
              <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(11,11,24,0.1) 0%,rgba(11,11,24,0.5) 60%,rgba(11,11,24,0.85) 100%)"}}/>
              <div style={{position:"relative",zIndex:1,padding:"18px 16px 16px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div>
                    <p style={{fontSize:15,fontWeight:800,color:"white",margin:0,letterSpacing:"-0.3px",textShadow:"0 1px 6px rgba(0,0,0,0.4)"}}>Le Mie Proprietà</p>
                    <p style={{fontSize:9,fontWeight:500,color:"rgba(255,255,255,0.5)",margin:"3px 0 0"}}>0 proprietà · 0 attive</p>
                  </div>
                  <button ref={plusRef} style={{
                    width:36,height:36,borderRadius:10,border:"none",
                    background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    cursor:"pointer",transition:"transform 0.2s",
                    transform:phase===3?"scale(1.15)":"scale(1)"
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 4v16m8-8H4"/></svg>
                  </button>
                </div>
              </div>
            </div>
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px"}}>
              <div style={{width:44,height:44,borderRadius:12,background:"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" style={{width:22,height:22}}><path d="m3 9 9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </div>
              <p style={{fontSize:12,fontWeight:700,color:"#334155",margin:"0 0 4px"}}>Nessuna proprietà</p>
              <p style={{fontSize:9,color:"#94a3b8",margin:0,textAlign:"center"}}>Tocca il <b>+</b> viola per aggiungere</p>
            </div>
          </>
        ) : (
          /* ═══ MODAL NUOVA PROPRIETÀ — identica a Step1 ═══ */
          <>
            {/* Header identico a Step1 */}
            <div style={{background:"linear-gradient(to right,#1e293b,#0f172a)",padding:"12px 16px",color:"white",flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <p style={{fontSize:13,fontWeight:700,margin:0}}>Nuova Proprietà</p>
                <div style={{width:24,height:24,borderRadius:"50%",background:"rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>✕</div>
              </div>
              <div style={{display:"flex",gap:3}}>{[0,1,2,3,4,5].map(i=><div key={i} style={{flex:1,height:5,borderRadius:3,background:i===0?"#10b981":"rgba(255,255,255,0.15)"}}/>)}</div>
              <p style={{fontSize:8,color:"rgba(255,255,255,0.5)",marginTop:4}}>Step 1 di 6 · Info</p>
            </div>
            {/* Body identico a Step1 */}
            <div style={{flex:1,background:"white",padding:"14px 18px",display:"flex",flexDirection:"column"}}>
              <div style={{textAlign:"center",marginBottom:10}}>
                <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#38bdf8,#2563eb)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 6px"}}>
                  <svg style={{width:18,height:18}} fill="none" stroke="white" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                </div>
                <p style={{fontSize:13,fontWeight:700,color:"#1e293b",margin:0}}>Informazioni Base</p>
              </div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:10,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Nome Proprietà *</label>
                <div style={{border:"2px solid #e2e8f0",borderRadius:10,padding:"9px 12px",fontSize:12,color:"#94a3b8",background:"#f8fafc"}}>es. Appartamento Colosseo</div>
              </div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:10,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Indirizzo *</label>
                <div style={{border:"2px solid #e2e8f0",borderRadius:10,padding:"9px 12px",fontSize:12,color:"#94a3b8",background:"#f8fafc"}}>Inizia a digitare...</div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:10,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Piano *</label>
                  <div style={{border:"2px solid #e2e8f0",borderRadius:10,padding:"9px 12px",fontSize:12,color:"#94a3b8",background:"#f8fafc"}}>—</div>
                </div>
                <div style={{flex:1}}>
                  <label style={{fontSize:10,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Citofono *</label>
                  <div style={{border:"2px solid #e2e8f0",borderRadius:10,padding:"9px 12px",fontSize:12,color:"#94a3b8",background:"#f8fafc"}}>—</div>
                </div>
              </div>
              <div style={{flex:1}}/>
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button style={{flex:1,padding:"10px 0",border:"1px solid #e2e8f0",borderRadius:10,fontSize:12,fontWeight:600,color:"#64748b",background:"white"}}>Indietro</button>
                <button style={{flex:1,padding:"10px 0",border:"none",borderRadius:10,fontSize:12,fontWeight:700,color:"white",background:"linear-gradient(135deg,#3b82f6,#2563eb)"}}>Avanti →</button>
              </div>
            </div>
          </>
        )}

        {/* Caption SOPRA la navbar, dentro il telefono */}
        {vis && phase<5 && !showModal && (
          <div style={{padding:"4px 10px",background:phase>=2?"#f5f3ff":"#f0f9ff",borderTop:"1px solid #e2e8f0",flexShrink:0}}>
            <p style={{fontSize:8,fontWeight:600,color:phase>=2?"#7c3aed":"#0284c7",margin:0,textAlign:"center"}}>
              {phase===0?"📱 Dashboard — tocca Proprietà nella navbar"
              :phase===1?"👆 Clicca su Proprietà"
              :phase===2?"🏘️ Pagina Proprietà aperta"
              :phase===3?"👆 Clicca sul pulsante + viola"
              :"✨ Modal creazione proprietà aperta"}
            </p>
          </div>
        )}

        {/* Navbar attaccata al bordo inferiore — nascosta quando modal aperta */}
        {!showModal && <div style={{borderTop:"1px solid #e2e8f0",background:"white",display:"flex",justifyContent:"space-around",alignItems:"center",padding:"4px 2px 3px",flexShrink:0}}>
          {navItems.map((item,i)=>{
            const isActive = item.l===activeNav;
            return (
              <div key={i} ref={item.l==="Proprietà"?navPropRef:null} style={{
                display:"flex",flexDirection:"column",alignItems:"center",
                padding:"4px 6px",borderRadius:10,
                background:isActive?"#eff6ff":"transparent",
                transition:"all 0.2s"
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={isActive?"#0284c7":"#64748b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}>
                  <path d={item.d}/>
                </svg>
                <span style={{fontSize:8,marginTop:2,fontWeight:isActive?600:400,color:isActive?"#0284c7":"#64748b"}}>{item.l}</span>
              </div>
            );
          })}
        </div>}
      </div>
  );
}
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
    const seq = [0,0,1800,3600,5400,7200,9000,10800,11600,13000];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{
      setPhase(0);
      seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); });
    },16500);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const nomeRef = useRef(null);
  const indirizzoRef = useRef(null);
  const pianoRef = useRef(null);
  const avantiBtnRef = useRef(null);

  const activeRef = phase<=2 ? nomeRef : phase<=4 ? indirizzoRef : phase<=5 ? pianoRef : avantiBtnRef;
  const clicking = phase===6;
  const done = phase>=7;
  const showComplete = phase >= 8;

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

        <CompletionOverlay visible={showComplete} message="Step 1 Completato!" />
        <div className="px-4 pb-3 flex gap-2">
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
    const seq = [0,0,1200,2400,3600,5000,5800];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{
      setPhase(0);
      seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); });
    },9000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const plusOspitiRef = useRef(null);
  const plusBagniRef = useRef(null);
  const avantiBtnRef = useRef(null);

  const guests = phase>=3?3:phase>=2?2:phase>=1?1:3;
  const baths = 1;
  const activeRef = phase<=3?plusOspitiRef:phase<=5?avantiBtnRef:avantiBtnRef;
  const clicking = phase===1||phase===2||phase===3;
  const showComplete = phase >= 6;

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
          <div className={`bg-slate-100 rounded-2xl p-4 transition-all ${phase>=5&&phase<=6?"ring-2 ring-sky-300":""}`}>
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

        <CompletionOverlay visible={showComplete} message="Step 2 Completato!" />
        <div className="px-4 pb-3 flex gap-2">
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
  /*
    0=idle
    1=cursor su campo checkout
    2=click campo → modal checkout aperta
    3=cursor si sposta su 10:00
    4=click 10:00 → modal chiude, checkout=10:00
    5=cursor su campo checkin
    6=click campo → modal checkin aperta
    7=cursor si sposta su 15:00
    8=click 15:00 → modal chiude, checkin=15:00
    9=cursor su Avanti
    10=click Avanti
    11=overlay
  */
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1400,2400,3400,4400,5600,6600,7600,8600,9800,10800,11600];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },14500);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const coRef = useRef(null);
  const ciRef = useRef(null);
  const pick10Ref = useRef(null);
  const pick15Ref = useRef(null);
  const avantiRef3 = useRef(null);

  const activeRef = phase<=1?coRef:phase===3?pick10Ref:phase===5?ciRef:phase===7?pick15Ref:phase===9?avantiRef3:null;
  const clicking = phase===2||phase===4||phase===6||phase===8||phase===10;
  const showCoModal = phase>=2 && phase<=3;
  const showCiModal = phase>=6 && phase<=7;
  const coVal = phase>=4?"10:00":"09:00";
  const ciVal = phase>=8?"15:00":"14:00";

  const coTimes = ["08:00","09:00","10:00","11:00"];
  const ciTimes = ["13:00","14:00","15:00","16:00"];

  return (
    <div ref={ref} style={{position:'relative',width:'100%',height:'100%'}}>
      <SmartCursor targetRef={activeRef} clicking={clicking} visible={vis && phase>=1 && phase<11} />

      <div className="bg-white overflow-hidden w-full h-full" style={{position:"relative",display:"flex",flexDirection:"column"}}>
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-2.5 text-white">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold">Nuova Proprietà</h2>
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M18 6L6 18M6 6L18 18"/></svg></div>
          </div>
          <div className="flex gap-1">{[0,1,2,3,4,5].map(i=><div key={i} className={`flex-1 h-1 rounded-full ${i<=2?'bg-emerald-400':'bg-white/20'}`}/>)}</div>
          <p className="text-[9px] text-white/60 mt-1">Step 3 di 6 · Orari</p>
        </div>

        <div className="px-3 pt-3" style={{flexShrink:0}}>
          <div className="text-center mb-0">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center mx-auto mb-1">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <h3 className="text-xs font-bold text-slate-800">Orari</h3>
          </div>
        </div>
        <div className="px-3 pb-3" style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <div className="grid grid-cols-2 gap-2.5">
            <div className={`rounded-xl p-2.5 border-2 transition-all ${phase>=1&&phase<=3?"border-rose-400 bg-rose-50 shadow-sm":"border-rose-100 bg-rose-50"}`}>
              <label className="block text-[10px] font-semibold text-rose-700 mb-1">Check-out</label>
              <div ref={coRef} className={`w-full px-2 py-1.5 bg-white border-2 rounded-lg text-base font-bold text-center transition-all cursor-pointer ${phase>=1&&phase<=3?"border-rose-400":"border-rose-200"} ${phase>=4?"text-slate-800":"text-slate-400"}`}>
                {coVal}
              </div>
            </div>

            <div className={`rounded-xl p-2.5 border-2 transition-all ${phase>=5&&phase<=7?"border-emerald-400 bg-emerald-50 shadow-sm":"border-emerald-100 bg-emerald-50"}`}>
              <label className="block text-[10px] font-semibold text-emerald-700 mb-1">Check-in</label>
              <div ref={ciRef} className={`w-full px-2 py-1.5 bg-white border-2 rounded-lg text-base font-bold text-center transition-all cursor-pointer ${phase>=5&&phase<=7?"border-emerald-400":"border-emerald-200"} ${phase>=8?"text-slate-800":"text-slate-400"}`}>
                {ciVal}
              </div>
            </div>
          </div>
        </div>

        <CompletionOverlay visible={phase >= 11} message="Step 3 Completato!" />
        <div className="px-3 pb-2.5 flex gap-2" style={{flexShrink:0}}>
          <button className="flex-1 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-500">Indietro</button>
          <button ref={avantiRef3}
            className={`flex-1 py-2 rounded-xl text-xs font-bold text-white transition-all ${phase>=10?"bg-emerald-500 scale-95":"bg-gradient-to-r from-blue-500 to-blue-600"}`}>
            {phase>=10?"✓ Salvato":"Avanti →"}
          </button>
        </div>

        {/* Modal scelta orario Check-out */}
        {showCoModal && (
          <div style={{position:"absolute",inset:0,zIndex:30,display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn 0.2s"}}>
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(3px)"}}/>
            <div style={{position:"relative",background:"white",borderRadius:14,padding:"12px 14px",width:"78%",boxShadow:"0 10px 30px rgba(0,0,0,0.25)"}}>
              <p style={{fontSize:12,fontWeight:700,color:"#1e293b",margin:"0 0 2px"}}>Orario Check-out</p>
              <p style={{fontSize:9,color:"#94a3b8",margin:"0 0 8px"}}>A che ora escono gli ospiti?</p>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {coTimes.map(t=>{
                  const sel = t==="10:00" && phase===3;
                  return (
                  <div key={t} ref={t==="10:00"?pick10Ref:null} style={{
                    padding:"9px 12px",borderRadius:10,fontSize:12,fontWeight:600,
                    cursor:"pointer",transition:"all 0.15s",
                    background:sel?"#fff1f2":"#f8fafc",
                    border:sel?"2px solid #f43f5e":"1px solid #e2e8f0",
                    color:sel?"#e11d48":"#475569"
                  }}>
                    {t}
                  </div>
                );})}
              </div>
            </div>
          </div>
        )}

        {/* Modal scelta orario Check-in */}
        {showCiModal && (
          <div style={{position:"absolute",inset:0,zIndex:30,display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn 0.2s"}}>
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(3px)"}}/>
            <div style={{position:"relative",background:"white",borderRadius:14,padding:"12px 14px",width:"78%",boxShadow:"0 10px 30px rgba(0,0,0,0.25)"}}>
              <p style={{fontSize:12,fontWeight:700,color:"#1e293b",margin:"0 0 2px"}}>Orario Check-in</p>
              <p style={{fontSize:9,color:"#94a3b8",margin:"0 0 8px"}}>A che ora arrivano i nuovi ospiti?</p>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {ciTimes.map(t=>{
                  const sel = t==="15:00" && phase===7;
                  return (
                  <div key={t} ref={t==="15:00"?pick15Ref:null} style={{
                    padding:"9px 12px",borderRadius:10,fontSize:12,fontWeight:600,
                    cursor:"pointer",transition:"all 0.15s",
                    background:sel?"#ecfdf5":"#f8fafc",
                    border:sel?"2px solid #10b981":"1px solid #e2e8f0",
                    color:sel?"#059669":"#475569"
                  }}>
                    {t}
                  </div>
                );})}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── STEP 4: Stanze e Letti ── */
function ScreenStep4() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  /*
    0  = stato iniziale, bottone "Aggiungi Stanza" visibile
    1  = cursore → "Aggiungi Stanza"
    2  = click → dropdown, cursore → "Camera Matrimoniale"
    3  = click → card ESPANSA, cursore → + Matrimoniale
    4  = click + → count=1, cursore → freccia ∧ (diventa viola)
    5  = click freccia → card si MINIMIZZA (transizione fluida)
    6  = cursore → "Aggiungi Stanza"
    7  = click → dropdown, cursore → "Camera Singola"
    8  = click → card ESPANSA, cursore → + Singolo
    9  = click + → count=1, cursore → freccia ∧ (diventa viola)
    10 = click freccia → card si minimizza
    11 = cursore → Avanti
    12 = click → done
    13 = overlay
  */
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,1600,3000,4400,5800,7200,8600,10000,11400,12800,14200,15600,17000];
    const timers: ReturnType<typeof setTimeout>[] = seq.map((t,i)=>setTimeout(()=>setPhase(i+1),t));
    const total = 20000;
    const loop = setInterval(()=>{
      setPhase(0);
      seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i+1),t)); });
    }, total);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const aggiungiRef = useRef<HTMLButtonElement>(null);
  const camMatrRef = useRef<HTMLButtonElement>(null);
  const camSingRef = useRef<HTMLButtonElement>(null);
  const plusMatrRef = useRef<HTMLDivElement>(null);
  const plusSingRef = useRef<HTMLDivElement>(null);
  const arrowMatrRef = useRef<HTMLDivElement>(null);
  const arrowSingRef = useRef<HTMLDivElement>(null);
  const avantiRef = useRef<HTMLButtonElement>(null);

  const showDropdown = phase===2 || phase===7;
  const matrExists = phase>=3;
  const matrExpanded = phase>=3 && phase<=4;
  const matrCount = phase>=4 ? 1 : 0;
  const singExists = phase>=8;
  const singExpanded = phase>=8 && phase<=9;
  const singCount = phase>=9 ? 1 : 0;
  const totalCap = (matrCount*2)+(singCount*1);
  const enough = totalCap>=2;

  const activeRef =
    phase===1||phase===6 ? aggiungiRef :
    phase===2 ? camMatrRef :
    phase===3 ? plusMatrRef :
    phase===4||phase===5 ? arrowMatrRef :
    phase===7 ? camSingRef :
    phase===8 ? plusSingRef :
    phase===9||phase===10 ? arrowSingRef :
    phase===11 ? avantiRef :
    null;
  const clicking = [2,3,4,5,7,8,9,10,12].includes(phase);

  const BedRow = ({name,icon,cap,count,refEl}:{name:string,icon:string,cap:string,count:number,refEl:React.RefObject<HTMLDivElement>|null}) => (
    <div className={`flex items-center justify-between p-2.5 rounded-xl transition-all ${count>0?"bg-violet-50 border border-violet-200":"bg-white border border-slate-100"}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <div>
          <p className={`text-xs font-semibold ${count>0?"text-violet-800":"text-slate-700"}`}>{name}</p>
          <p className="text-[10px] text-slate-400">{cap}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${count>0?"bg-white border border-violet-200 text-violet-600":"bg-slate-100 border border-slate-200 text-slate-300"}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M5 12H19"/></svg>
        </div>
        <span className={`w-6 text-center text-sm font-bold ${count>0?"text-violet-700":"text-slate-400"}`}>{count}</span>
        <div ref={refEl} className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shadow-sm cursor-pointer">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-3.5 h-3.5"><path d="M12 5V19M5 12H19"/></svg>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      <SmartCursor targetRef={activeRef} clicking={clicking} visible={vis && phase>=1 && phase<=12} />

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-2.5 text-white">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold">Nuova Proprietà</h2>
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M18 6L6 18M6 6L18 18"/></svg></div>
          </div>
          <div className="flex gap-1">{[0,1,2,3,4,5].map(i=><div key={i} className={`flex-1 h-1.5 rounded-full ${i<=3?'bg-emerald-400':'bg-white/20'}`}/>)}</div>
          <p className="text-[9px] text-white/60 mt-1">Step 4 di 6 · Stanze e Letti</p>
        </div>
        <div className="p-3 space-y-2.5">
          {/* Header posti */}
          <div className={`rounded-2xl p-4 text-white ${enough?"bg-gradient-to-r from-violet-500 to-purple-600":"bg-gradient-to-r from-amber-500 to-orange-500"}`}>
            <div className="flex items-center justify-between">
              <div><p className="font-bold text-sm">Stanze e Letti</p><p className="text-xs text-white/80">Configura la struttura</p></div>
              <div className="text-right"><p className="text-3xl font-bold">{totalCap}</p><p className="text-xs text-white/80">posti</p></div>
            </div>
          </div>

          {/* Camera Matrimoniale */}
          {matrExists && (
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm" style={{animation:'fadeIn 0.3s'}}>
              <div className="p-3 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5" className="w-4 h-4"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9H21M9 21V9"/></svg>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">Camera Matrimoniale</p>
                    <p className="text-xs text-slate-500">{matrCount>0?"🛏️ 2 posti letto":"🛏️ Nessun letto"}</p>
                  </div>
                </div>
                {/* Freccia ∧ per minimizzare */}
                <div ref={arrowMatrRef} style={{cursor:"pointer",padding:3}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke={phase===4?"#7c3aed":"#94a3b8"} strokeWidth="2" className="w-4 h-4" style={{transition:"stroke 0.2s"}}>
                    {matrExpanded ? <path d="M18 15L12 9L6 15"/> : <path d="M6 9L12 15L18 9"/>}
                  </svg>
                </div>
              </div>
              <div style={{
                maxHeight: matrExpanded ? 300 : 0,
                opacity: matrExpanded ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease'
              }}>
                <div className="px-3 pb-3 pt-2 border-t border-slate-100 bg-slate-50/50 space-y-2">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide px-1">Letti:</p>
                  <BedRow name="Matrimoniale" icon="🛏️" cap="2 posti" count={matrCount} refEl={plusMatrRef} />
                  <BedRow name="Singolo" icon="🛏️" cap="1 posto" count={0} refEl={null} />
                  <BedRow name="Divano Letto" icon="🛋️" cap="2 posti" count={0} refEl={null} />
                </div>
              </div>
            </div>
          )}

          {/* Camera Singola */}
          {singExists && (
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm" style={{animation:'fadeIn 0.3s'}}>
              <div className="p-3 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5" className="w-4 h-4"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9H21M9 21V9"/></svg>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">Camera Singola</p>
                    <p className="text-xs text-slate-500">{singCount>0?"🛏️ 1 posto letto":"🛏️ Nessun letto"}</p>
                  </div>
                </div>
                {/* Freccia ∧ per minimizzare */}
                <div ref={arrowSingRef} style={{cursor:"pointer",padding:3}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke={phase===9?"#7c3aed":"#94a3b8"} strokeWidth="2" className="w-4 h-4" style={{transition:"stroke 0.2s"}}>
                    {singExpanded ? <path d="M18 15L12 9L6 15"/> : <path d="M6 9L12 15L18 9"/>}
                  </svg>
                </div>
              </div>
              <div style={{
                maxHeight: singExpanded ? 300 : 0,
                opacity: singExpanded ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease'
              }}>
                <div className="px-3 pb-3 pt-2 border-t border-slate-100 bg-slate-50/50 space-y-2">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide px-1">Letti:</p>
                  <BedRow name="Matrimoniale" icon="🛏️" cap="2 posti" count={0} refEl={null} />
                  <BedRow name="Singolo" icon="🛏️" cap="1 posto" count={singCount} refEl={plusSingRef} />
                  <BedRow name="Divano Letto" icon="🛋️" cap="2 posti" count={0} refEl={null} />
                </div>
              </div>
            </div>
          )}

          {/* Aggiungi Stanza / Dropdown */}
          {!showDropdown && !matrExpanded && !singExpanded && (
            <button ref={aggiungiRef} className="w-full py-3.5 border-2 border-dashed border-violet-300 rounded-2xl text-violet-600 font-semibold flex items-center justify-center gap-2 text-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 5V19M5 12H19"/></svg>
              Aggiungi Stanza
            </button>
          )}
          {showDropdown && (
            <div className="bg-violet-50 rounded-2xl p-3.5 border border-violet-200" style={{animation:'fadeIn 0.2s'}}>
              <p className="text-xs font-bold text-violet-700 mb-2.5">Seleziona tipo stanza:</p>
              <div className="grid grid-cols-2 gap-2">
                {[{n:"Camera Matrimoniale",r:camMatrRef,hi:phase===2},{n:"Camera Singola",r:camSingRef,hi:phase===7},{n:"Camera Doppia",r:null,hi:false},{n:"Soggiorno",r:null,hi:false}].map((item,j)=>(
                  <button key={j} ref={item.r} className={`px-3 py-2.5 border rounded-xl text-xs font-medium text-center transition-all ${item.hi?"bg-violet-500 text-white border-violet-500 shadow-md":"bg-white border-violet-200 text-violet-700"}`}>
                    {item.n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <CompletionOverlay visible={phase >= 13} message="Step 4 Completato!" />

        <div className="px-4 pb-3 flex gap-2">
          <button className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-500">Indietro</button>
          <button ref={avantiRef}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all ${phase>=12?"bg-emerald-500":enough?"bg-gradient-to-r from-blue-500 to-blue-600":"bg-slate-300"}`}>
            {phase>=12?"✓ Salvato":"Avanti →"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── STEP 5: Dotazioni Biancheria ── */
/* ── STEP 5: Dotazioni Biancheria ── */
/* ── STEP 5: Dotazioni Biancheria ── */
function ScreenStep5() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  /*
    0  = Tab "1", Nostra Ditta sel., Matr ON + Sing OFF, 2 lenz matr + 2 federe
    1  = Cursore → "Propria"
    2  = Click → Propria selezionata (bordo ambra)
    3  = Cursore → "Nostra Ditta"
    4  = Click → Nostra Ditta di nuovo (bordo sky)
    5  = Cursore → checkbox Matrimoniale
    6  = Click → Matr si DESELEZIONA (scompare fluido)
    7  = Cursore → checkbox Singolo
    8  = Click → Sing si SELEZIONA (appare fluido, 2 lenz + 1 federa)
    9  = Cursore → + lenz singolo
    10 = Click → lenz sing da 2 a 3
    11 = Cursore → tab "2"
    12 = Click → tab 2, Matr riappare ON, lenz matr 2
    13 = Cursore → + lenz matr
    14 = Click → lenz matr da 2 a 3
    15 = Cursore → tab "3"
    16 = Click → tab 3, Sing appare ON, lenz matr 3, lenz sing 3
    17 = Pausa — tutto configurato
    18 = Cursore → Avanti
    19 = Click → done
    20 = Overlay
  */
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [
      0,     // → phase 1 @ 0ms
      2000,  // → phase 2 @ 2s
      3600,  // → phase 3 @ 3.6s
      5200,  // → phase 4 @ 5.2s
      6800,  // → phase 5 @ 6.8s
      8400,  // → phase 6 @ 8.4s
      10000, // → phase 7 @ 10s
      11600, // → phase 8 @ 11.6s
      13200, // → phase 9 @ 13.2s
      14800, // → phase 10 @ 14.8s
      16400, // → phase 11 @ 16.4s
      18000, // → phase 12 @ 18s
      19600, // → phase 13 @ 19.6s
      21200, // → phase 14 @ 21.2s
      22800, // → phase 15 @ 22.8s
      24400, // → phase 16 @ 24.4s
      26000, // → phase 17 @ 26s
      27600, // → phase 18 @ 27.6s
      29200, // → phase 19 @ 29.2s
      30400, // → phase 20 @ 30.4s
    ];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i+1),t));
    const total = 34000;
    const loop = setInterval(()=>{
      setPhase(0);
      seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i+1),t)); });
    }, total);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const propriaRef = useRef(null);
  const nostraRef = useRef(null);
  const checkMatrRef = useRef(null);
  const checkSingRef = useRef(null);
  const plusLenzSingRef = useRef(null);
  const tab2Ref = useRef(null);
  const plusLenzMatrRef = useRef(null);
  const tab3Ref = useRef(null);
  const avantiRef = useRef(null);

  // Biancheria provider
  const usePropria = phase >= 2 && phase < 4;

  // Tab: 1 fino a phase 12, 2 da phase 12, 3 da phase 16
  const tab = phase >= 16 ? 3 : phase >= 12 ? 2 : 1;

  // Matrimoniale: ON inizialmente, OFF da phase 6, ON di nuovo da phase 12 (tab 2)
  const matrOn = phase < 6 || phase >= 12;
  // Singolo: OFF inizialmente, ON da phase 8
  const singOn = phase >= 8;

  // Lenzuola singolo: 2 default, 3 da phase 10
  const lenzSing = phase >= 10 ? 3 : 2;
  // Lenzuola matr: 2 default, 3 da phase 14
  const lenzMatr = phase >= 14 ? 3 : 2;

  // Asciugamani = tab count
  const asciugamani = tab;

  const priceMatr = matrOn ? (lenzMatr * 2.50 + 2 * 1.00) : 0;
  const priceSing = singOn ? (lenzSing * 2.00 + 1 * 1.00) : 0;
  const priceBagno = asciugamani * 2.00 + 1.50;
  const totalPrice = (priceMatr + priceSing + priceBagno).toFixed(2);

  const activeRef =
    phase === 1 || phase === 2 ? propriaRef :
    phase === 3 || phase === 4 ? nostraRef :
    phase === 5 || phase === 6 ? checkMatrRef :
    phase === 7 || phase === 8 ? checkSingRef :
    phase === 9 || phase === 10 ? plusLenzSingRef :
    phase === 11 || phase === 12 ? tab2Ref :
    phase === 13 || phase === 14 ? plusLenzMatrRef :
    phase === 15 || phase === 16 ? tab3Ref :
    phase === 18 || phase === 19 ? avantiRef :
    null;
  const clicking = [2,4,6,8,10,12,14,16,19].includes(phase);

  const BedCheck = ({label,sub,on,refEl}) => (
    <div className={`px-3 py-2 flex items-center gap-2.5 transition-all ${on?"bg-blue-50/40":""}`}>
      <div ref={refEl} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 cursor-pointer transition-all ${on?"bg-blue-600 border-blue-600":"border-slate-300 bg-white"}`}>
        {on && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-3 h-3"><path d="M5 13L9 17L19 7"/></svg>}
      </div>
      <p className="text-[10px] font-semibold text-slate-800 flex-1">{label} <span className="font-normal text-slate-400">{sub}</span></p>
    </div>
  );

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      {vis && activeRef && phase<20 && <SmartCursor targetRef={activeRef} clicking={clicking} visible={true} />}

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-2.5 text-white">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold">Nuova Proprietà</h2>
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M18 6L6 18M6 6L18 18"/></svg></div>
          </div>
          <div className="flex gap-1">{[0,1,2,3,4,5].map(i=><div key={i} className={`flex-1 h-1.5 rounded-full ${i<=4?'bg-emerald-400':'bg-white/20'}`}/>)}</div>
          <p className="text-[9px] text-white/60 mt-1">Step 5 di 6 · Dotazioni Biancheria</p>
        </div>

        <div className="p-3 space-y-2.5">
          {/* Chi fornisce */}
          <div className={`rounded-2xl p-3 border-2 transition-all ${usePropria ? 'border-amber-300 bg-amber-50/50' : 'border-sky-300 bg-sky-50/50'}`}>
            <p className="text-[10px] font-bold text-slate-800 mb-2">Chi fornisce la biancheria?</p>
            <div className="grid grid-cols-2 gap-2">
              <div ref={nostraRef} className={`p-2.5 rounded-xl border-2 text-center transition-all cursor-pointer ${!usePropria ? 'border-sky-500 bg-white shadow-sm' : 'border-slate-200 bg-white/50'}`}>
                <span className="text-base block mb-0.5">🧺</span>
                <p className="text-[9px] font-bold text-slate-800">Nostra Ditta</p>
              </div>
              <div ref={propriaRef} className={`p-2.5 rounded-xl border-2 text-center transition-all cursor-pointer ${usePropria ? 'border-amber-500 bg-white shadow-sm' : 'border-slate-200 bg-white/50'}`}>
                <span className="text-base block mb-0.5">🏠</span>
                <p className="text-[9px] font-bold text-slate-800">Propria</p>
              </div>
            </div>
          </div>

          {/* Tab ospiti 1-2-3 */}
          <div className="bg-gradient-to-r from-sky-500 to-blue-600 rounded-2xl p-3 text-white">
            <div className="flex items-center justify-between mb-2">
              <div><p className="font-bold text-[11px]">Dotazioni per Ospiti</p><p className="text-[8px] text-white/70">Pre-calcolati · modificabili</p></div>
              <p className="text-sm font-bold">€{totalPrice}</p>
            </div>
            <div className="flex gap-1.5">
              {[1,2,3].map(n=>(
                <button key={n} ref={n===2?tab2Ref:n===3?tab3Ref:null}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${n===tab?"bg-white text-blue-600 shadow":"bg-white/20 text-white"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Biancheria Letto */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 flex items-center justify-between bg-slate-50 border-b border-slate-100">
              <span className="text-[10px] font-bold text-slate-800 flex items-center gap-1.5">🛏️ Biancheria Letto</span>
              <span className="text-[10px] font-bold text-blue-600">€{(priceMatr+priceSing).toFixed(2)}</span>
            </div>

            {/* Matrimoniale — toggle */}
            <BedCheck label="Matrimoniale" sub="· Camera Matr. · 2p" on={matrOn} refEl={checkMatrRef} />
            <div style={{maxHeight:matrOn?140:0,opacity:matrOn?1:0,overflow:'hidden',transition:'max-height 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease'}}>
              <div className="px-3 pb-2.5 pt-1 space-y-1.5 border-b border-slate-100">
                <div className="flex items-center justify-between bg-sky-50 rounded-xl px-3 py-2 border border-sky-100">
                  <div>
                    <span className="text-[10px] font-medium text-slate-700">Lenz. Matrimoniale</span>
                    <span className="text-[9px] text-sky-600 font-semibold ml-1.5">€2.50</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-7 h-7 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-sm font-bold text-slate-600">−</div>
                    <span className="w-6 text-center text-sm font-bold text-slate-800">{lenzMatr}</span>
                    <div ref={plusLenzMatrRef} className="w-7 h-7 rounded-lg bg-sky-500 text-white flex items-center justify-center text-sm font-bold cursor-pointer">+</div>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-sky-50 rounded-xl px-3 py-2 border border-sky-100">
                  <div>
                    <span className="text-[10px] font-medium text-slate-700">Federe</span>
                    <span className="text-[9px] text-sky-600 font-semibold ml-1.5">€1.00</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-7 h-7 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-sm font-bold text-slate-600">−</div>
                    <span className="w-6 text-center text-sm font-bold text-slate-800">2</span>
                    <div className="w-7 h-7 rounded-lg bg-sky-500 text-white flex items-center justify-center text-sm font-bold">+</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Singolo — toggle */}
            <BedCheck label="Singolo" sub="· Camera Sing. · 1p" on={singOn} refEl={checkSingRef} />
            <div style={{maxHeight:singOn?140:0,opacity:singOn?1:0,overflow:'hidden',transition:'max-height 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease'}}>
              <div className="px-3 pb-2.5 pt-1 space-y-1.5 border-b border-slate-100">
                <div className="flex items-center justify-between bg-sky-50 rounded-xl px-3 py-2 border border-sky-100">
                  <div>
                    <span className="text-[10px] font-medium text-slate-700">Lenz. Singolo</span>
                    <span className="text-[9px] text-sky-600 font-semibold ml-1.5">€2.00</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-7 h-7 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-sm font-bold text-slate-600">−</div>
                    <span className="w-6 text-center text-sm font-bold text-slate-800">{lenzSing}</span>
                    <div ref={plusLenzSingRef} className="w-7 h-7 rounded-lg bg-sky-500 text-white flex items-center justify-center text-sm font-bold cursor-pointer">+</div>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-sky-50 rounded-xl px-3 py-2 border border-sky-100">
                  <div>
                    <span className="text-[10px] font-medium text-slate-700">Federa</span>
                    <span className="text-[9px] text-sky-600 font-semibold ml-1.5">€1.00</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-7 h-7 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-sm font-bold text-slate-600">−</div>
                    <span className="w-6 text-center text-sm font-bold text-slate-800">1</span>
                    <div className="w-7 h-7 rounded-lg bg-sky-500 text-white flex items-center justify-center text-sm font-bold">+</div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Dotazioni Bagno */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 flex items-center justify-between bg-slate-50 border-b border-slate-100">
              <span className="text-[10px] font-bold text-slate-800 flex items-center gap-1.5">🛁 Dotazioni Bagno</span>
              <span className="text-[10px] font-bold text-emerald-600">€{priceBagno.toFixed(2)}</span>
            </div>
            <div className="p-2.5 space-y-1.5">
              <div className="flex items-center justify-between bg-emerald-50 rounded-xl px-3 py-2 border border-emerald-100">
                <div>
                  <span className="text-[10px] font-medium text-slate-700">Set Asciugamani</span>
                  <span className="text-[9px] text-emerald-600 font-semibold ml-1.5">€2.00</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-7 h-7 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-sm font-bold text-slate-600">−</div>
                  <span className="w-6 text-center text-sm font-bold text-slate-800">{asciugamani}</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center text-sm font-bold">+</div>
                </div>
              </div>
              <div className="flex items-center justify-between bg-emerald-50 rounded-xl px-3 py-2 border border-emerald-100">
                <div>
                  <span className="text-[10px] font-medium text-slate-700">Tappetino Bagno</span>
                  <span className="text-[9px] text-emerald-600 font-semibold ml-1.5">€1.50</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-7 h-7 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-sm font-bold text-slate-300">−</div>
                  <span className="w-6 text-center text-sm font-bold text-slate-800">1</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center text-sm font-bold">+</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <CompletionOverlay visible={phase >= 20} message="Step 5 Completato!" />

        <div className="px-4 pb-3 flex gap-2">
          <button className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-500">Indietro</button>
          <button ref={avantiRef}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all ${phase>=19?"bg-emerald-500":phase>=12?"bg-gradient-to-r from-blue-500 to-blue-600":"bg-slate-300"}`}>
            {phase>=19?"✓ Salvato":"Avanti →"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── STEP 6: Foto ── */
function ScreenStep6() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  /*
    0 = area upload vuota
    1 = cursore sull'area upload
    2 = click → spinner caricamento
    3 = caricamento completato → foto appare
    4 = cursore su "Crea Proprietà"
    5 = click → successo
    6 = overlay
  */
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1800,3200,5000,7000,8500,9500,10300];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },14000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const uploadRef = useRef(null);
  const creBtnRef = useRef(null);
  const loading = phase===2;
  const uploaded = phase>=3;
  const done = phase>=5;

  const activeRef = phase>=1&&phase<3?uploadRef:phase>=4&&phase<6?creBtnRef:null;
  const clicking = phase===2||phase===5;

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      {vis && activeRef && phase<6 && <SmartCursor targetRef={activeRef} clicking={clicking} visible={true} />}

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-2 text-white">
          <div className="flex items-center justify-between mb-1.5">
            <h2 className="text-[11px] font-bold">Nuova Proprietà</h2>
            <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-2.5 h-2.5"><path d="M18 6L6 18M6 6L18 18"/></svg></div>
          </div>
          <div className="flex gap-0.5">{[0,1,2,3,4,5].map(i=><div key={i} className="flex-1 h-1 rounded-full bg-emerald-400"/>)}</div>
          <p className="text-[8px] text-white/60 mt-0.5">Step 6 di 6 · Foto — Ultimo step!</p>
        </div>

        <div className="p-3 space-y-2">
          <div className="text-center">
            <div className="w-8 h-8 bg-gradient-to-br from-pink-400 to-rose-500 rounded-lg flex items-center justify-center mx-auto mb-1">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
            <h3 className="text-[11px] font-bold text-slate-800">Foto Proprietà</h3>
          </div>

          {/* Area upload */}
          <div ref={uploadRef} className={`border-2 rounded-xl overflow-hidden transition-all ${uploaded?"border-emerald-200":"border-dashed border-slate-300"}`} style={{height:120}}>
            {uploaded ? (
              <div style={{height:'100%',background:'linear-gradient(135deg,#667eea,#764ba2)',position:'relative',animation:'fadeIn 0.5s'}}>
                <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" style={{width:28,height:28,marginBottom:4}}><path d="m3 9 9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  <p style={{color:'white',fontSize:10,fontWeight:700}}>Appartamento Colosseo</p>
                </div>
                <span style={{position:'absolute',top:6,right:6,background:'white',borderRadius:12,padding:'2px 8px',fontSize:8,fontWeight:700,color:'#10B981'}}>✓ Caricata</span>
              </div>
            ) : loading ? (
              <div style={{height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#f8fafc'}}>
                <div style={{width:28,height:28,borderRadius:'50%',border:'3px solid #e2e8f0',borderTopColor:'#ec4899',animation:'spin 0.8s linear infinite',marginBottom:6}}/>
                <p style={{fontSize:9,color:'#64748b',fontWeight:500}}>Caricamento foto...</p>
                <div style={{width:'60%',height:3,background:'#e2e8f0',borderRadius:2,marginTop:4,overflow:'hidden'}}>
                  <div style={{width:'70%',height:'100%',background:'linear-gradient(90deg,#ec4899,#f472b6)',borderRadius:2,animation:'shimmer 1s ease infinite'}}/>
                </div>
              </div>
            ) : (
              <div style={{height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}} className="bg-slate-50">
                <svg className="w-8 h-8 text-slate-300 mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <p className="text-[10px] text-slate-400 font-medium">Tocca per caricare foto</p>
                <p className="text-[8px] text-slate-300 mt-0.5">JPG · PNG · max 10MB</p>
              </div>
            )}
          </div>

          {done && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2" style={{animation:'fadeIn 0.3s'}}>
              <p className="text-[10px] font-bold text-emerald-700">✓ Proprietà creata!</p>
              <p className="text-[8px] text-emerald-600">In attesa di approvazione.</p>
            </div>
          )}
        </div>

        <CompletionOverlay visible={phase >= 6} message="Proprietà Inviata!" />

        <div className="px-3 pb-2 flex gap-2">
          <button className="flex-1 py-1.5 border border-slate-200 rounded-lg text-[10px] font-semibold text-slate-500">Indietro</button>
          <button ref={creBtnRef}
            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold text-white transition-all ${done?"bg-emerald-500":phase===5?"scale-95 bg-blue-700":uploaded?"bg-gradient-to-r from-blue-500 to-blue-600":"bg-slate-300"}`}>
            {done?"✓ Inviato!":"Crea Proprietà →"}
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
  /*
    0  = Pagina Pulizie con banner e lista
    1  = Cursore su "Richiedi Servizio"
    2  = Click → modal si apre, Step 1
    3  = Cursore su campo proprietà
    4  = Click → dropdown aperto
    5  = Click su "Angelico 70" → proprietà selezionata
    6  = Cursore su campo data
    7  = Click → data selezionata
    8  = Cursore su "Avanti"
    9  = Click → Step 2
    10 = Cursore su ospiti "2"
    11 = Click → ospiti=2
    12 = Pausa → biancheria toggle già ON, sezione letti visibile
    13 = Cursore su "Crea Pulizia"
    14 = Click → done
    15 = overlay
  */
  useEffect(() => {
    if (!vis) { setStep(0); return; }
    const seq = [0,0,1400,2600,3600,4400,5400,6400,7400,8400,9600,10600,12000,13200,14400,15200,16000];
    const timers = seq.map((t,i)=>setTimeout(()=>setStep(i),t));
    const loop = setInterval(()=>{ setStep(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setStep(i),t)); }); },19500);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const ctaRef = useRef(null);
  const propRef = useRef(null);
  const dateRef = useRef(null);
  const avantiRef = useRef(null);
  const guestsRef = useRef(null);
  const confermaRef = useRef(null);
  const startRef = useRef(null);

  const modalOpen = step >= 2;
  const propSelected = step >= 5;
  const dateSet = step >= 7;
  const isStep2 = step >= 9;
  const guestsSet = step >= 11;
  const done = step >= 14;

  const activeRef = step===0?startRef:step<=1?ctaRef:step<=4?propRef:step<=5?propRef:step<=7?dateRef:step<=8?avantiRef:step<=11?guestsRef:confermaRef;
  const clicking = step===2||step===5||step===7||step===9||step===11||step===14;

  return (
    <div ref={ref} style={{position:'relative',width:'100%',height:'100%'}}>
      {/* Punto di partenza cursore — angolo in alto a sinistra */}
      <div ref={startRef} style={{position:'absolute',left:20,top:20,width:1,height:1,pointerEvents:'none',zIndex:0}}/>
      <SmartCursor targetRef={activeRef} clicking={clicking} visible={vis&&step>=0&&step<15} />

      {!modalOpen ? (
        /* ═══ PAGINA PULIZIE ═══ */
        <div style={{background:'#f8fafc',height:'100%',display:'flex',flexDirection:'column'}}>
          {/* Header bianco — identico all'app */}
          <div style={{background:'white',padding:'10px 16px',borderBottom:'1px solid #f1f5f9',flexShrink:0}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <p style={{fontSize:15,fontWeight:800,color:'#1e293b',margin:0}}>CleaningApp</p>
                <p style={{fontSize:9,color:'#94a3b8',margin:'1px 0 0',fontWeight:500}}>Area Proprietario</p>
              </div>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:22,padding:'5px 12px 5px 6px'}}>
                  <div style={{width:22,height:22,borderRadius:'50%',background:'linear-gradient(135deg,#a78bfa,#6366f1)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <span style={{fontSize:8,fontWeight:800,color:'white'}}>AI</span>
                  </div>
                  <span style={{fontSize:11,fontWeight:600,color:'#334155'}}>Assistente AI</span>
                </div>
                <div style={{position:'relative'}}>
                  <svg style={{width:22,height:22}} viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                </div>
              </div>
            </div>
          </div>

          {/* Banner */}
          <div style={{background:'linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)',padding:'16px',position:'relative',overflow:'hidden'}}>
            <div style={{position:'relative',zIndex:1}}>
              <p style={{fontSize:10,color:'rgba(255,255,255,0.5)',margin:'0 0 2px',fontWeight:600,letterSpacing:1,textTransform:'uppercase'}}>Prossima pulizia</p>
              <p style={{fontSize:13,fontWeight:800,color:'white',margin:'0 0 3px'}}>Angelico 70</p>
              <div style={{display:'flex',alignItems:'center',gap:6,fontSize:9,color:'rgba(255,255,255,0.55)'}}>
                <span>🏠 Pulizia</span>
                <span style={{color:'rgba(255,255,255,0.3)'}}>·</span>
                <span>👤 4 ospiti</span>
              </div>
            </div>
            <div style={{position:'absolute',right:16,top:'50%',transform:'translateY(-50%)',background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.12)',borderRadius:10,padding:'6px 12px',textAlign:'center'}}>
              <p style={{fontSize:16,fontWeight:800,color:'#a5b4fc',margin:0,lineHeight:1}}>10:00</p>
              <p style={{fontSize:7,fontWeight:700,color:'rgba(165,180,252,0.4)',margin:'1px 0 0',textTransform:'uppercase',letterSpacing:1}}>Oggi</p>
            </div>
          </div>

          {/* CTA Richiedi Servizio */}
          <div style={{display:'flex',justifyContent:'center',padding:'0 18px',marginTop:-16,position:'relative',zIndex:10}}>
            <button ref={ctaRef} style={{
              display:'flex',alignItems:'center',gap:10,
              background:'white',border:'none',borderRadius:16,
              padding:'11px 22px 11px 14px',
              boxShadow:'0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(99,102,241,0.08)',
              cursor:'pointer',fontSize:13,fontWeight:700,color:'#1e1b4b'
            }}>
              <div style={{width:32,height:32,borderRadius:10,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px rgba(99,102,241,0.3)'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M12 4v16m8-8H4"/></svg>
              </div>
              <span>Richiedi Servizio</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round"><path d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>

          {/* Toggle Lista/Calendario */}
          <div style={{padding:'12px 16px 6px'}}>
            <div style={{display:'flex',background:'#f1f5f9',borderRadius:12,padding:3}}>
              <div style={{flex:1,textAlign:'center',padding:'7px 0',borderRadius:9,background:'white',fontSize:10,fontWeight:700,color:'#334155',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>☰ Lista</div>
              <div style={{flex:1,textAlign:'center',padding:'7px 0',borderRadius:9,fontSize:10,fontWeight:500,color:'#94a3b8'}}>📅 Calendario</div>
            </div>
          </div>

          {/* Barra di ricerca */}
          <div style={{padding:'4px 16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:6,background:'white',border:'1px solid #e2e8f0',borderRadius:12,padding:'8px 12px'}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <span style={{fontSize:10,color:'#94a3b8'}}>Cerca proprietà...</span>
            </div>
          </div>

          {/* Card pulizia */}
          <div style={{padding:'8px 16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:8}}>
              <span style={{background:'#6366f1',color:'white',fontSize:9,fontWeight:800,padding:'3px 10px',borderRadius:8}}>Oggi</span>
              <div style={{flex:1,height:1,background:'#e2e8f0'}}/>
              <span style={{fontSize:9,color:'#94a3b8'}}>1 pulizia</span>
            </div>
            <div style={{background:'white',borderRadius:16,border:'1px solid #e2e8f0',overflow:'hidden',display:'flex'}}>
              <div style={{width:80,minHeight:80,background:'linear-gradient(135deg,#1e3a5f,#2563eb)',position:'relative',display:'flex',flexDirection:'column',justifyContent:'space-between',padding:6}}>
                <span style={{background:'rgba(59,130,246,0.8)',color:'white',fontSize:7,fontWeight:700,padding:'2px 6px',borderRadius:6,alignSelf:'flex-start'}}>📅 Programmata</span>
                <span style={{fontSize:16,fontWeight:900,color:'white'}}>€71</span>
              </div>
              <div style={{flex:1,padding:'10px 12px'}}>
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="m3 9 9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                  <span style={{fontSize:11,fontWeight:700,color:'#1e293b'}}>Angelico 70</span>
                </div>
                <p style={{fontSize:8,color:'#94a3b8',margin:'2px 0 0'}}>Viale Angelico 70</p>
                <div style={{display:'flex',alignItems:'center',gap:6,marginTop:6}}>
                  <span style={{fontSize:9,color:'#64748b'}}>🕐 10:00</span>
                  <span style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'1px 6px',fontSize:9,color:'#ef4444',fontWeight:600}}>👤 4 ⚠</span>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:4,marginTop:4}}>
                  <span style={{fontSize:8,color:'#94a3b8'}}>👤 Da assegnare</span>
                </div>
              </div>
            </div>
          </div>

          {/* Navbar — bordo inferiore */}
          <div style={{marginTop:'auto',borderTop:'1px solid #e2e8f0',background:'white',display:'flex',justifyContent:'space-around',alignItems:'center',padding:'6px 2px 4px',flexShrink:0}}>
            {[
              {d:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",l:"Dashboard",active:false},
              {d:"M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",l:"Proprietà",active:false},
              {d:"M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",l:"Pulizie",active:true},
              {d:"M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",l:"Prenotazioni",active:false},
              {d:"M4 6h16M4 12h16M4 18h16",l:"Menu",active:false},
            ].map((item,i)=>(
              <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'4px 6px',borderRadius:10,background:item.active?'#eff6ff':'transparent'}}>
                <svg viewBox="0 0 24 24" fill="none" stroke={item.active?'#6366f1':'#64748b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}><path d={item.d}/></svg>
                <span style={{fontSize:8,marginTop:2,fontWeight:item.active?700:400,color:item.active?'#6366f1':'#64748b'}}>{item.l}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ═══ MODAL NUOVA PULIZIA ═══ */
        <div style={{background:'white',height:'100%',display:'flex',flexDirection:'column'}}>
          {/* Header verde */}
          <div style={{background:'linear-gradient(to right,#10b981,#14b8a6)',padding:'14px 16px',flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:34,height:34,borderRadius:10,background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <svg style={{width:16,height:16}} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="m3 9 9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                </div>
                <div>
                  <p style={{fontSize:14,fontWeight:800,color:'white',margin:0}}>Nuova Pulizia</p>
                  <p style={{fontSize:9,color:'rgba(255,255,255,0.8)',margin:'1px 0 0'}}>Passaggio {isStep2?'2':'1'} di 2 · {isStep2?'Ospiti e Dotazioni':'Proprietà e Servizio'}</p>
                </div>
              </div>
              <div style={{width:26,height:26,borderRadius:'50%',background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <svg style={{width:12,height:12}} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </div>
            </div>
            <div style={{display:'flex',gap:6,marginTop:10}}>
              <div style={{flex:1,height:4,borderRadius:2,background:'white'}}/>
              <div style={{flex:1,height:4,borderRadius:2,background:isStep2?'white':'rgba(255,255,255,0.3)'}}/>
            </div>
          </div>

          {/* Contenuto scrollabile */}
          <div style={{flex:1,overflow:'auto',padding:'12px 14px',background:'#f8fafc',display:'flex',flexDirection:'column',gap:8}}>
            {!isStep2 ? (
              <>
                {/* Tipo richiesta */}
                <div style={{background:'white',borderRadius:14,border:'1px solid #e2e8f0',padding:12}}>
                  <p style={{fontSize:10,fontWeight:700,color:'#334155',margin:'0 0 8px'}}>Cosa vuoi richiedere?</p>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                    <div style={{padding:10,borderRadius:12,border:'2px solid #1e293b',background:'#f8fafc',textAlign:'center'}}>
                      <div style={{width:32,height:32,borderRadius:10,background:'#e2e8f0',margin:'0 auto 6px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <svg style={{width:16,height:16}} viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2"><path d="m3 9 9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                      </div>
                      <span style={{fontSize:11,fontWeight:700,color:'#1e293b'}}>Pulizia</span>
                    </div>
                    <div style={{padding:10,borderRadius:12,border:'2px solid #e2e8f0',background:'white',textAlign:'center'}}>
                      <div style={{width:32,height:32,borderRadius:10,background:'#f1f5f9',margin:'0 auto 6px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <svg style={{width:16,height:16}} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>
                      </div>
                      <span style={{fontSize:11,fontWeight:700,color:'#94a3b8'}}>Solo Biancheria</span>
                    </div>
                  </div>
                </div>

                {/* Proprietà */}
                <div style={{background:'white',borderRadius:14,border:`2px solid ${propSelected?'#bfdbfe':'#e2e8f0'}`,padding:12,transition:'all 0.3s',background:propSelected?'#eff6ff':'white'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                    <div style={{width:26,height:26,borderRadius:8,background:'#dbeafe',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <svg style={{width:12,height:12}} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="m3 9 9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,color:'#334155'}}>Proprietà <span style={{color:'#ef4444'}}>*</span></span>
                  </div>
                  {step===4?(
                    <div style={{animation:'fadeIn 0.2s'}}>
                      <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:4}}>
                        <div ref={propRef} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',background:'white',borderRadius:8,border:'1px solid #bfdbfe',cursor:'pointer'}}>
                          <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#1e3a5f,#2563eb)',flexShrink:0}}/>
                          <div><p style={{fontSize:10,fontWeight:700,color:'#1e293b',margin:0}}>Angelico 70</p><p style={{fontSize:8,color:'#94a3b8',margin:0}}>Viale Angelico 70</p></div>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',marginTop:3,borderRadius:8}}>
                          <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#059669,#10b981)',flexShrink:0}}/>
                          <div><p style={{fontSize:10,fontWeight:500,color:'#64748b',margin:0}}>Apt. Trastevere</p><p style={{fontSize:8,color:'#94a3b8',margin:0}}>Via della Scala 22</p></div>
                        </div>
                      </div>
                    </div>
                  ):propSelected?(
                    <div style={{display:'flex',alignItems:'center',gap:8,padding:8,background:'white',borderRadius:10,border:'1px solid #bfdbfe'}}>
                      <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#1e3a5f,#2563eb)',flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontSize:11,fontWeight:700,color:'#1e293b',margin:0}}>Angelico 70</p>
                        <p style={{fontSize:8,color:'#94a3b8',margin:0}}>Viale Angelico 70</p>
                        <div style={{display:'flex',gap:8,marginTop:2,fontSize:8,color:'#94a3b8'}}>
                          <span>2 letti</span><span>·</span><span>Max 4</span><span>·</span><span>€71</span>
                        </div>
                      </div>
                      <div style={{width:28,height:28,borderRadius:'50%',background:'white',border:'1px solid #fecaca',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <svg style={{width:12,height:12}} viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </div>
                    </div>
                  ):(
                    <div ref={propRef} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 10px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10}}>
                      <svg style={{width:12,height:12}} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                      <span style={{fontSize:10,color:'#94a3b8'}}>Cerca proprietà...</span>
                    </div>
                  )}
                </div>

                {/* Data */}
                <div ref={dateRef} style={{background:'white',borderRadius:14,border:`2px solid ${dateSet?'#cbd5e1':'#e2e8f0'}`,padding:12,transition:'all 0.3s'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                    <div style={{width:26,height:26,borderRadius:8,background:'#fef3c7',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <svg style={{width:12,height:12}} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,color:'#334155'}}>Data <span style={{color:'#ef4444'}}>*</span></span>
                  </div>
                  <div style={{padding:'8px 12px',borderRadius:10,fontSize:11,fontWeight:600,background:dateSet?'#1e293b':'#f8fafc',color:dateSet?'white':'#94a3b8',border:dateSet?'none':'1px solid #e2e8f0'}}>
                    {dateSet?'📅 Domani — Mercoledì 25 Marzo':'Seleziona data...'}
                  </div>
                </div>

                {/* Avanti — spacer */}
                <div style={{flex:1}}/>
              </>
            ) : (
              <>
                {/* Step 2: Seleziona ospiti */}
                <div style={{background:'white',borderRadius:14,border:'1px solid #e2e8f0',padding:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <span style={{fontSize:10,fontWeight:600,color:'#64748b'}}>Seleziona numero ospiti</span>
                    <span style={{fontSize:13,fontWeight:800,color:'#1e293b'}}>{guestsSet?'2':'—'} ospiti</span>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    {[1,2,3,4].map(n=>(
                      <div key={n} ref={n===2?guestsRef:null} style={{
                        flex:1,height:42,borderRadius:12,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                        border:`2px solid ${n===(guestsSet?2:0)?'#2563eb':'#e2e8f0'}`,
                        background:n===(guestsSet?2:0)?'#1e293b':'white',
                        color:n===(guestsSet?2:0)?'white':'#64748b',
                        transition:'all 0.2s'
                      }}>
                        <svg style={{width:14,height:14,marginBottom:1}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                        <span style={{fontSize:11,fontWeight:700}}>{n}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Toggle Biancheria */}
                <div style={{background:'white',borderRadius:14,border:'1px solid #e2e8f0',padding:12}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:32,height:32,borderRadius:10,background:'#e0f2fe',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <svg style={{width:16,height:16}} viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>
                      </div>
                      <div>
                        <p style={{fontSize:11,fontWeight:700,color:'#334155',margin:0}}>Biancheria</p>
                        <p style={{fontSize:8,color:'#64748b',margin:0}}>Inclusa nella pulizia</p>
                      </div>
                    </div>
                    <div style={{width:42,height:22,borderRadius:11,background:'#0ea5e9',position:'relative',padding:2}}>
                      <div style={{width:18,height:18,borderRadius:'50%',background:'white',boxShadow:'0 1px 3px rgba(0,0,0,0.2)',transform:'translateX(20px)',transition:'all 0.3s'}}/>
                    </div>
                  </div>
                </div>

                {/* Biancheria Letto — sezione espandibile */}
                {guestsSet && (
                  <div style={{background:'white',borderRadius:14,border:'1px solid #bfdbfe',overflow:'hidden',animation:'fadeIn 0.3s'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderBottom:'1px solid #e0f2fe'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:28,height:28,borderRadius:8,background:'#1e293b',display:'flex',alignItems:'center',justifyContent:'center'}}>
                          <svg style={{width:14,height:14}} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:'#1e293b'}}>Biancheria Letto</span>
                      </div>
                      <span style={{fontSize:11,fontWeight:700,color:'#1e293b'}}>€7.50</span>
                    </div>
                    <div style={{padding:'10px 14px'}}>
                      {/* Selezione letti */}
                      <p style={{fontSize:9,fontWeight:700,color:'#475569',margin:'0 0 6px'}}>🛏️ Seleziona i letti da preparare per 2 ospiti:</p>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:8}}>
                        <div style={{padding:8,borderRadius:10,border:'2px solid #3b82f6',background:'#eff6ff'}}>
                          <div style={{display:'flex',alignItems:'center',gap:4}}>
                            <div style={{width:16,height:16,borderRadius:4,background:'#2563eb',display:'flex',alignItems:'center',justifyContent:'center'}}>
                              <svg style={{width:10,height:10}} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                            <svg style={{width:16,height:16}} viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>
                          </div>
                          <p style={{fontSize:10,fontWeight:600,color:'#1e293b',margin:'4px 0 0'}}>Matrimoniale</p>
                          <p style={{fontSize:8,color:'#94a3b8',margin:0}}>Camera · 2p</p>
                        </div>
                        <div style={{padding:8,borderRadius:10,border:'2px solid #e2e8f0',background:'white'}}>
                          <div style={{display:'flex',alignItems:'center',gap:4}}>
                            <div style={{width:16,height:16,borderRadius:4,border:'2px solid #cbd5e1'}}/>
                            <svg style={{width:16,height:16}} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>
                          </div>
                          <p style={{fontSize:10,fontWeight:600,color:'#64748b',margin:'4px 0 0'}}>Matrimoniale</p>
                          <p style={{fontSize:8,color:'#94a3b8',margin:0}}>Camera · 2p</p>
                        </div>
                      </div>

                      <div style={{background:'#eff6ff',borderRadius:8,padding:'4px 8px',marginBottom:8}}>
                        <p style={{fontSize:9,color:'#2563eb',margin:0,fontWeight:600}}>✓ 1 letti selezionati = 2 posti</p>
                      </div>

                      {/* Biancheria necessaria */}
                      <p style={{fontSize:9,fontWeight:700,color:'#475569',margin:'0 0 6px'}}>📦 Biancheria necessaria:</p>
                      <div style={{display:'flex',flexDirection:'column',gap:5}}>
                        {[
                          {name:'Federe',price:'€0.90',qty:2},
                          {name:'Lenzuola Matrimoniali',price:'€1.90',qty:3},
                        ].map((item,i)=>(
                          <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'white',borderRadius:10,padding:'7px 10px',border:'1px solid #dbeafe'}}>
                            <span style={{fontSize:10,color:'#334155',fontWeight:500}}>{item.name} <span style={{color:'#3b82f6',fontWeight:600}}>{item.price}</span></span>
                            <div style={{display:'flex',alignItems:'center',gap:4}}>
                              <div style={{width:24,height:24,borderRadius:6,background:'#f1f5f9',border:'1px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:'#64748b'}}>−</div>
                              <span style={{width:20,textAlign:'center',fontSize:12,fontWeight:700,color:'#1e293b'}}>{item.qty}</span>
                              <div style={{width:24,height:24,borderRadius:6,background:'#1e293b',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:'white'}}>+</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p style={{fontSize:8,color:'#94a3b8',margin:'6px 0 0',fontStyle:'italic'}}>Quantità calcolate in base ai letti selezionati. Puoi modificarle.</p>
                    </div>
                  </div>
                )}

                {/* Biancheria Bagno */}
                {guestsSet && (
                  <div style={{background:'white',borderRadius:14,border:'1px solid #e2e8f0',padding:'10px 14px',animation:'fadeIn 0.3s'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:28,height:28,borderRadius:8,background:'#f1f5f9',display:'flex',alignItems:'center',justifyContent:'center'}}>
                          <svg style={{width:14,height:14}} viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
                        </div>
                        <span style={{fontSize:11,fontWeight:600,color:'#334155'}}>Biancheria Bagno</span>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                        <span style={{fontSize:11,fontWeight:700,color:'#334155'}}>€8.60</span>
                        <svg style={{width:12,height:12}} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                      </div>
                    </div>
                  </div>
                )}

                {/* Kit Cortesia */}
                {guestsSet && (
                  <div style={{background:'white',borderRadius:14,border:'1px solid #e2e8f0',padding:'10px 14px',animation:'fadeIn 0.3s'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:28,height:28,borderRadius:8,background:'#f1f5f9',display:'flex',alignItems:'center',justifyContent:'center'}}>
                          <span style={{fontSize:14}}>🧴</span>
                        </div>
                        <span style={{fontSize:11,fontWeight:600,color:'#334155'}}>Kit Cortesia</span>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                        <span style={{fontSize:11,fontWeight:700,color:'#334155'}}>€0.00</span>
                        <svg style={{width:12,height:12}} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                      </div>
                    </div>
                  </div>
                )}

                {/* Servizi Extra */}
                {guestsSet && (
                  <div style={{background:'white',borderRadius:14,border:'1px solid #e2e8f0',padding:'10px 14px',animation:'fadeIn 0.3s'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:28,height:28,borderRadius:8,background:'#f1f5f9',display:'flex',alignItems:'center',justifyContent:'center'}}>
                          <span style={{fontSize:14}}>⚙️</span>
                        </div>
                        <span style={{fontSize:11,fontWeight:600,color:'#334155'}}>Servizi Extra</span>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                        <span style={{fontSize:11,fontWeight:700,color:'#334155'}}>€0.00</span>
                        <svg style={{width:12,height:12}} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                      </div>
                    </div>
                  </div>
                )}

                {/* Note */}
                {guestsSet && (
                  <div style={{background:'white',borderRadius:14,border:'1px solid #e2e8f0',padding:'10px 14px',animation:'fadeIn 0.3s'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                      <div style={{width:28,height:28,borderRadius:8,background:'#f1f5f9',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <svg style={{width:14,height:14}} viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </div>
                      <span style={{fontSize:11,fontWeight:600,color:'#334155'}}>Note (opzionale)</span>
                    </div>
                    <div style={{padding:'8px 10px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,fontSize:10,color:'#94a3b8'}}>Istruzioni speciali...</div>
                  </div>
                )}

                {/* Spacer */}
              </>
            )}
          </div>

          {/* Bottoni fissi in basso */}
          <div style={{flexShrink:0,padding:'10px 14px',background:'#f8fafc',borderTop:'1px solid #e2e8f0'}}>
            {!isStep2 ? (
              <button ref={avantiRef} style={{width:'100%',padding:'12px 0',borderRadius:14,border:'none',fontSize:12,fontWeight:700,color:'white',background:propSelected&&dateSet?'linear-gradient(to right,#10b981,#14b8a6)':'#cbd5e1',cursor:'pointer'}}>
                {propSelected&&dateSet?'Avanti — Ospiti e Dotazioni →':'Completa i campi obbligatori'}
              </button>
            ) : (
              <div style={{display:'flex',gap:8}}>
                <button style={{flex:1,padding:'12px 0',border:'1px solid #e2e8f0',borderRadius:14,fontSize:12,fontWeight:600,color:'#64748b',background:'white',cursor:'pointer'}}>‹ Indietro</button>
                <button ref={confermaRef} style={{flex:1,padding:'12px 0',borderRadius:14,border:'none',fontSize:12,fontWeight:700,color:'white',background:done?'#059669':'linear-gradient(to right,#10b981,#14b8a6)',cursor:'pointer',transition:'all 0.2s',transform:step===14?'scale(0.96)':'scale(1)'}}>
                  {done?'✓ Pulizia Creata!':'✓ Crea Pulizia'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <CompletionOverlay visible={step >= 15} message="Pulizia Creata!" />
    </div>
  );
}

/* ─── SCREEN: Richiedi Solo Biancheria ─── */
function ScreenSoloBiancheria() {
  const [ref, vis] = useVis(0.1);
  const [step, setStep] = useState(0);
  /*
    0  = Pagina Pulizie
    1  = Cursore su "Richiedi Servizio"
    2  = Click → modal si apre, Step 1
    3  = Cursore su "Solo Biancheria"
    4  = Click → Solo Biancheria selezionato
    5  = Cursore su campo proprietà
    6  = Click → proprietà selezionata
    7  = Cursore su campo data
    8  = Click → data selezionata
    9  = Cursore su "Avanti"
    10 = Click → Step 2
    11 = Cursore su ospiti "2"
    12 = Click → ospiti=2, letti e biancheria visibili
    13 = Pausa — vede biancheria letto
    14 = Cursore su toggle Preparazione Letti
    15 = Click → preparazione letti attivata, mostra letti con €5
    16 = Pausa — vede preparazione letti
    17 = Cursore su "Crea Ordine"
    18 = Click → done
    19 = overlay
  */
  useEffect(() => {
    if (!vis) { setStep(0); return; }
    const seq = [0,0,1400,2600,3400,4200,5200,6200,7200,8200,9200,10400,11400,12800,14000,15000,16000,17200,18400,19200];
    const timers = seq.map((t,i)=>setTimeout(()=>setStep(i),t));
    const loop = setInterval(()=>{ setStep(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setStep(i),t)); }); },22500);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const startRef2 = useRef(null);
  const ctaRef2 = useRef(null);
  const linenTabRef = useRef(null);
  const propRef2 = useRef(null);
  const dateRef2 = useRef(null);
  const avantiRef2 = useRef(null);
  const guestsRef2 = useRef(null);
  const bedMakingRef = useRef(null);
  const confermaRef2 = useRef(null);

  const modalOpen = step >= 2;
  const linenSelected = step >= 4;
  const propSelected = step >= 6;
  const dateSet = step >= 8;
  const isStep2 = step >= 10;
  const guestsSet = step >= 12;
  const bedMaking = step >= 15;
  const done = step >= 18;

  const activeRef = step===0?startRef2:step<=1?ctaRef2:step<=3?linenTabRef:step<=5?propRef2:step<=7?dateRef2:step<=9?avantiRef2:step<=12?guestsRef2:step<=15?bedMakingRef:confermaRef2;
  const clicking = step===2||step===4||step===6||step===8||step===10||step===12||step===15||step===18;

  return (
    <div ref={ref} style={{position:'relative',width:'100%',height:'100%'}}>
      <div ref={startRef2} style={{position:'absolute',left:20,top:20,width:1,height:1,pointerEvents:'none',zIndex:0}}/>
      <SmartCursor targetRef={activeRef} clicking={clicking} visible={vis&&step>=0&&step<19} />

      {!modalOpen ? (
        /* ═══ PAGINA PULIZIE ═══ */
        <div style={{background:'#f8fafc',height:'100%',display:'flex',flexDirection:'column'}}>
          {/* Header bianco */}
          <div style={{background:'white',padding:'10px 16px',borderBottom:'1px solid #f1f5f9',flexShrink:0}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <p style={{fontSize:15,fontWeight:800,color:'#1e293b',margin:0}}>CleaningApp</p>
                <p style={{fontSize:9,color:'#94a3b8',margin:'1px 0 0',fontWeight:500}}>Area Proprietario</p>
              </div>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:22,padding:'5px 12px 5px 6px'}}>
                  <div style={{width:22,height:22,borderRadius:'50%',background:'linear-gradient(135deg,#a78bfa,#6366f1)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <span style={{fontSize:8,fontWeight:800,color:'white'}}>AI</span>
                  </div>
                  <span style={{fontSize:11,fontWeight:600,color:'#334155'}}>Assistente AI</span>
                </div>
                <svg style={{width:22,height:22}} viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
              </div>
            </div>
          </div>

          {/* Banner */}
          <div style={{background:'linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)',padding:'16px',position:'relative',overflow:'hidden'}}>
            <div style={{position:'relative',zIndex:1}}>
              <p style={{fontSize:10,color:'rgba(255,255,255,0.5)',margin:'0 0 2px',fontWeight:600,letterSpacing:1,textTransform:'uppercase'}}>Prossima pulizia</p>
              <p style={{fontSize:13,fontWeight:800,color:'white',margin:'0 0 3px'}}>Angelico 70</p>
              <div style={{display:'flex',alignItems:'center',gap:6,fontSize:9,color:'rgba(255,255,255,0.55)'}}>
                <span>🏠 Pulizia</span><span style={{color:'rgba(255,255,255,0.3)'}}>·</span><span>👤 4 ospiti</span>
              </div>
            </div>
            <div style={{position:'absolute',right:16,top:'50%',transform:'translateY(-50%)',background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.12)',borderRadius:10,padding:'6px 12px',textAlign:'center'}}>
              <p style={{fontSize:16,fontWeight:800,color:'#a5b4fc',margin:0,lineHeight:1}}>10:00</p>
              <p style={{fontSize:7,fontWeight:700,color:'rgba(165,180,252,0.4)',margin:'1px 0 0',textTransform:'uppercase',letterSpacing:1}}>Oggi</p>
            </div>
          </div>

          {/* CTA */}
          <div style={{display:'flex',justifyContent:'center',padding:'0 18px',marginTop:-16,position:'relative',zIndex:10}}>
            <button ref={ctaRef2} style={{display:'flex',alignItems:'center',gap:10,background:'white',border:'none',borderRadius:16,padding:'11px 22px 11px 14px',boxShadow:'0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(99,102,241,0.08)',cursor:'pointer',fontSize:13,fontWeight:700,color:'#1e1b4b'}}>
              <div style={{width:32,height:32,borderRadius:10,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px rgba(99,102,241,0.3)'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M12 4v16m8-8H4"/></svg>
              </div>
              <span>Richiedi Servizio</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round"><path d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>

          {/* Toggle + ricerca + card */}
          <div style={{padding:'12px 16px 6px'}}>
            <div style={{display:'flex',background:'#f1f5f9',borderRadius:12,padding:3}}>
              <div style={{flex:1,textAlign:'center',padding:'7px 0',borderRadius:9,background:'white',fontSize:10,fontWeight:700,color:'#334155',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>☰ Lista</div>
              <div style={{flex:1,textAlign:'center',padding:'7px 0',borderRadius:9,fontSize:10,fontWeight:500,color:'#94a3b8'}}>📅 Calendario</div>
            </div>
          </div>
          <div style={{padding:'4px 16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:6,background:'white',border:'1px solid #e2e8f0',borderRadius:12,padding:'8px 12px'}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <span style={{fontSize:10,color:'#94a3b8'}}>Cerca proprietà...</span>
            </div>
          </div>
          <div style={{padding:'8px 16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:8}}>
              <span style={{background:'#6366f1',color:'white',fontSize:9,fontWeight:800,padding:'3px 10px',borderRadius:8}}>Oggi</span>
              <div style={{flex:1,height:1,background:'#e2e8f0'}}/>
              <span style={{fontSize:9,color:'#94a3b8'}}>1 pulizia</span>
            </div>
            <div style={{background:'white',borderRadius:16,border:'1px solid #e2e8f0',overflow:'hidden',display:'flex'}}>
              <div style={{width:80,minHeight:80,background:'linear-gradient(135deg,#1e3a5f,#2563eb)',position:'relative',display:'flex',flexDirection:'column',justifyContent:'space-between',padding:6}}>
                <span style={{background:'rgba(59,130,246,0.8)',color:'white',fontSize:7,fontWeight:700,padding:'2px 6px',borderRadius:6,alignSelf:'flex-start'}}>📅 Programmata</span>
                <span style={{fontSize:16,fontWeight:900,color:'white'}}>€71</span>
              </div>
              <div style={{flex:1,padding:'10px 12px'}}>
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="m3 9 9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                  <span style={{fontSize:11,fontWeight:700,color:'#1e293b'}}>Angelico 70</span>
                </div>
                <p style={{fontSize:8,color:'#94a3b8',margin:'2px 0 0'}}>Viale Angelico 70</p>
                <div style={{display:'flex',alignItems:'center',gap:6,marginTop:6}}>
                  <span style={{fontSize:9,color:'#64748b'}}>🕐 10:00</span>
                  <span style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'1px 6px',fontSize:9,color:'#ef4444',fontWeight:600}}>👤 4 ⚠</span>
                </div>
              </div>
            </div>
          </div>

          {/* Navbar */}
          <div style={{marginTop:'auto',borderTop:'1px solid #e2e8f0',background:'white',display:'flex',justifyContent:'space-around',alignItems:'center',padding:'6px 2px 4px',flexShrink:0}}>
            {[
              {d:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",l:"Dashboard",active:false},
              {d:"M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",l:"Proprietà",active:false},
              {d:"M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",l:"Pulizie",active:true},
              {d:"M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",l:"Prenotazioni",active:false},
              {d:"M4 6h16M4 12h16M4 18h16",l:"Menu",active:false},
            ].map((item,i)=>(
              <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'4px 6px',borderRadius:10,background:item.active?'#eff6ff':'transparent'}}>
                <svg viewBox="0 0 24 24" fill="none" stroke={item.active?'#6366f1':'#64748b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}><path d={item.d}/></svg>
                <span style={{fontSize:8,marginTop:2,fontWeight:item.active?700:400,color:item.active?'#6366f1':'#64748b'}}>{item.l}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ═══ MODAL RICHIEDI BIANCHERIA ═══ */
        <div style={{background:'white',height:'100%',display:'flex',flexDirection:'column'}}>
          {/* Header verde */}
          <div style={{background:'linear-gradient(to right,#10b981,#14b8a6)',padding:'14px 16px',flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:34,height:34,borderRadius:10,background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <svg style={{width:16,height:16}} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>
                </div>
                <div>
                  <p style={{fontSize:14,fontWeight:800,color:'white',margin:0}}>{linenSelected?'Richiedi Biancheria':'Nuova Pulizia'}</p>
                  <p style={{fontSize:9,color:'rgba(255,255,255,0.8)',margin:'1px 0 0'}}>Passaggio {isStep2?'2':'1'} di 2 · {isStep2?'Ospiti e Dotazioni':'Proprietà e Servizio'}</p>
                </div>
              </div>
              <div style={{width:26,height:26,borderRadius:'50%',background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <svg style={{width:12,height:12}} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </div>
            </div>
            <div style={{display:'flex',gap:6,marginTop:10}}>
              <div style={{flex:1,height:4,borderRadius:2,background:'white'}}/>
              <div style={{flex:1,height:4,borderRadius:2,background:isStep2?'white':'rgba(255,255,255,0.3)'}}/>
            </div>
          </div>

          {/* Contenuto scrollabile */}
          <div style={{flex:1,overflow:'auto',padding:'12px 14px',background:'#f8fafc',display:'flex',flexDirection:'column',gap:8}}>
            {!isStep2 ? (
              <>
                {/* Tipo richiesta — cursore su Solo Biancheria */}
                <div style={{background:'white',borderRadius:14,border:'1px solid #e2e8f0',padding:12}}>
                  <p style={{fontSize:10,fontWeight:700,color:'#334155',margin:'0 0 8px'}}>Cosa vuoi richiedere?</p>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                    <div style={{padding:10,borderRadius:12,border:'2px solid #e2e8f0',background:'white',textAlign:'center'}}>
                      <div style={{width:32,height:32,borderRadius:10,background:'#f1f5f9',margin:'0 auto 6px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <svg style={{width:16,height:16}} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="m3 9 9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                      </div>
                      <span style={{fontSize:11,fontWeight:700,color:'#94a3b8'}}>Pulizia</span>
                    </div>
                    <div ref={linenTabRef} style={{padding:10,borderRadius:12,border:`2px solid ${linenSelected?'#1e293b':'#e2e8f0'}`,background:linenSelected?'#f8fafc':'white',textAlign:'center',transition:'all 0.2s'}}>
                      <div style={{width:32,height:32,borderRadius:10,background:linenSelected?'#e2e8f0':'#f1f5f9',margin:'0 auto 6px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <svg style={{width:16,height:16}} viewBox="0 0 24 24" fill="none" stroke={linenSelected?'#334155':'#94a3b8'} strokeWidth="2"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>
                      </div>
                      <span style={{fontSize:11,fontWeight:700,color:linenSelected?'#1e293b':'#94a3b8'}}>Solo Biancheria</span>
                    </div>
                  </div>
                </div>

                {/* Proprietà */}
                <div style={{background:'white',borderRadius:14,border:`2px solid ${propSelected?'#bfdbfe':'#e2e8f0'}`,padding:12,transition:'all 0.3s',background:propSelected?'#eff6ff':'white'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                    <div style={{width:26,height:26,borderRadius:8,background:'#dbeafe',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <svg style={{width:12,height:12}} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="m3 9 9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,color:'#334155'}}>Proprietà <span style={{color:'#ef4444'}}>*</span></span>
                  </div>
                  {propSelected?(
                    <div style={{display:'flex',alignItems:'center',gap:8,padding:8,background:'white',borderRadius:10,border:'1px solid #bfdbfe'}}>
                      <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#1e3a5f,#2563eb)',flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <p style={{fontSize:11,fontWeight:700,color:'#1e293b',margin:0}}>Angelico 70</p>
                        <p style={{fontSize:8,color:'#94a3b8',margin:0}}>Viale Angelico 70</p>
                      </div>
                    </div>
                  ):(
                    <div ref={propRef2} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 10px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10}}>
                      <svg style={{width:12,height:12}} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                      <span style={{fontSize:10,color:'#94a3b8'}}>Cerca proprietà...</span>
                    </div>
                  )}
                </div>

                {/* Data */}
                <div style={{background:'white',borderRadius:14,border:`2px solid ${dateSet?'#cbd5e1':'#e2e8f0'}`,padding:12,transition:'all 0.3s'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                    <div style={{width:26,height:26,borderRadius:8,background:'#fef3c7',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <svg style={{width:12,height:12}} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,color:'#334155'}}>Data consegna <span style={{color:'#ef4444'}}>*</span></span>
                  </div>
                  <div ref={dateRef2} style={{padding:'8px 12px',borderRadius:10,fontSize:11,fontWeight:600,background:dateSet?'#1e293b':'#f8fafc',color:dateSet?'white':'#94a3b8',border:dateSet?'none':'1px solid #e2e8f0'}}>
                    {dateSet?'📅 Domani — Mercoledì 25 Marzo':'Seleziona data...'}
                  </div>
                </div>

                <div style={{flex:1}}/>
              </>
            ) : (
              <>
                {/* Step 2: Seleziona ospiti */}
                <div style={{background:'white',borderRadius:14,border:'1px solid #e2e8f0',padding:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <span style={{fontSize:10,fontWeight:600,color:'#64748b'}}>Seleziona numero ospiti</span>
                    <span style={{fontSize:13,fontWeight:800,color:'#1e293b'}}>{guestsSet?'2':'—'} ospiti</span>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    {[1,2,3].map(n=>(
                      <div key={n} ref={n===2?guestsRef2:null} style={{
                        flex:1,height:42,borderRadius:12,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                        border:`2px solid ${n===(guestsSet?2:0)?'#2563eb':'#e2e8f0'}`,
                        background:n===(guestsSet?2:0)?'#1e293b':'white',
                        color:n===(guestsSet?2:0)?'white':'#64748b',
                        transition:'all 0.2s'
                      }}>
                        <svg style={{width:14,height:14,marginBottom:1}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                        <span style={{fontSize:11,fontWeight:700}}>{n}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Biancheria Letto */}
                {guestsSet && (
                  <div style={{background:'white',borderRadius:14,border:'1px solid #bfdbfe',overflow:'hidden',animation:'fadeIn 0.3s'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderBottom:'1px solid #e0f2fe'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:28,height:28,borderRadius:8,background:'#1e293b',display:'flex',alignItems:'center',justifyContent:'center'}}>
                          <svg style={{width:14,height:14}} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:'#1e293b'}}>Biancheria Letto</span>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                        <span style={{fontSize:11,fontWeight:700,color:'#1e293b'}}>€5.60</span>
                        <svg style={{width:12,height:12}} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
                      </div>
                    </div>
                    <div style={{padding:'10px 14px'}}>
                      <p style={{fontSize:9,fontWeight:700,color:'#475569',margin:'0 0 8px'}}>🛏️ Seleziona i letti da preparare per 2 ospiti:</p>
                      {/* 2 letti: Matrimoniale (selezionato) + Singolo (non selezionato) */}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
                        {/* Matrimoniale — selezionato */}
                        <div style={{padding:10,borderRadius:12,border:'2px solid #3b82f6',background:'#eff6ff'}}>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <div style={{width:18,height:18,borderRadius:4,background:'#2563eb',display:'flex',alignItems:'center',justifyContent:'center'}}>
                              <svg style={{width:11,height:11}} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                            <svg style={{width:18,height:18}} viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>
                          </div>
                          <p style={{fontSize:11,fontWeight:700,color:'#1e293b',margin:'6px 0 0'}}>Matrimoniale</p>
                          <p style={{fontSize:9,color:'#94a3b8',margin:'1px 0 0'}}>Camera · 2p</p>
                        </div>
                        {/* Singolo — non selezionato */}
                        <div style={{padding:10,borderRadius:12,border:'2px solid #e2e8f0',background:'white'}}>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <div style={{width:18,height:18,borderRadius:4,border:'2px solid #cbd5e1'}}/>
                            <svg style={{width:18,height:18}} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>
                          </div>
                          <p style={{fontSize:11,fontWeight:600,color:'#64748b',margin:'6px 0 0'}}>Singolo</p>
                          <p style={{fontSize:9,color:'#94a3b8',margin:'1px 0 0'}}>Camera · 1p</p>
                        </div>
                      </div>

                      <div style={{background:'#eff6ff',borderRadius:10,padding:'6px 10px',marginBottom:10}}>
                        <p style={{fontSize:10,color:'#2563eb',margin:0,fontWeight:600}}>✓ 1 letto selezionato = 2 posti</p>
                      </div>

                      <p style={{fontSize:9,fontWeight:700,color:'#475569',margin:'0 0 8px'}}>📦 Biancheria necessaria:</p>
                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                        {[
                          {name:'Lenzuola Matrimoniali',price:'€1.90',qty:2},
                          {name:'Federe',price:'€0.90',qty:2},
                        ].map((item,i)=>(
                          <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'white',borderRadius:10,padding:'8px 12px',border:'1px solid #dbeafe'}}>
                            <span style={{fontSize:11,color:'#334155',fontWeight:500}}>{item.name} <span style={{color:'#3b82f6',fontWeight:600}}>{item.price}</span></span>
                            <div style={{display:'flex',alignItems:'center',gap:5}}>
                              <div style={{width:26,height:26,borderRadius:7,background:'#f1f5f9',border:'1px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:'#64748b',lineHeight:1}}>−</div>
                              <span style={{width:22,textAlign:'center',fontSize:13,fontWeight:700,color:'#1e293b'}}>{item.qty}</span>
                              <div style={{width:26,height:26,borderRadius:7,background:'#1e293b',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:'white',lineHeight:1}}>+</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p style={{fontSize:8,color:'#94a3b8',margin:'8px 0 0',fontStyle:'italic'}}>Quantità calcolate in base ai letti selezionati. Puoi modificarle.</p>
                    </div>
                  </div>
                )}

                {/* Preparazione Letti */}
                {guestsSet && (
                  <div ref={bedMakingRef} style={{background:bedMaking?'linear-gradient(135deg,#f5f3ff,#ede9fe)':'white',borderRadius:14,border:`1px solid ${bedMaking?'#c4b5fd':'#e2e8f0'}`,padding:12,animation:'fadeIn 0.3s',transition:'all 0.3s'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:32,height:32,borderRadius:10,background:bedMaking?'#8b5cf6':'#f5f3ff',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.3s'}}>
                          <span style={{fontSize:16}}>🛏️</span>
                        </div>
                        <div>
                          <p style={{fontSize:11,fontWeight:700,color:'#334155',margin:0}}>Preparazione Letti</p>
                          <p style={{fontSize:8,color:'#64748b',margin:0}}>{bedMaking?'1 letto × €5.00 = €5.00':'Solo consegna biancheria, senza fare i letti'}</p>
                        </div>
                      </div>
                      <div style={{width:42,height:22,borderRadius:11,background:bedMaking?'#8b5cf6':'#cbd5e1',position:'relative',padding:2,transition:'all 0.3s'}}>
                        <div style={{width:18,height:18,borderRadius:'50%',background:'white',boxShadow:'0 1px 3px rgba(0,0,0,0.2)',transform:bedMaking?'translateX(20px)':'translateX(0)',transition:'all 0.3s'}}/>
                      </div>
                    </div>
                    {bedMaking && (
                      <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #c4b5fd',animation:'fadeIn 0.3s'}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 10px',background:'white',borderRadius:10,border:'1px solid #ede9fe'}}>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <span style={{fontSize:14}}>🛏️</span>
                            <span style={{fontSize:10,fontWeight:600,color:'#334155'}}>Matrimoniale</span>
                            <span style={{fontSize:8,color:'#94a3b8'}}>Camera</span>
                          </div>
                          <span style={{fontSize:10,fontWeight:700,color:'#7c3aed'}}>€5.00</span>
                        </div>
                        <div style={{display:'flex',justifyContent:'flex-end',marginTop:6}}>
                          <span style={{fontSize:11,fontWeight:700,color:'#7c3aed'}}>Totale letti: €5.00</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Biancheria Bagno */}
                {guestsSet && (
                  <div style={{background:'white',borderRadius:14,border:'1px solid #e2e8f0',padding:'10px 14px',animation:'fadeIn 0.3s'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:28,height:28,borderRadius:8,background:'#f1f5f9',display:'flex',alignItems:'center',justifyContent:'center'}}>
                          <svg style={{width:14,height:14}} viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
                        </div>
                        <span style={{fontSize:11,fontWeight:600,color:'#334155'}}>Biancheria Bagno</span>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                        <span style={{fontSize:11,fontWeight:700,color:'#334155'}}>€8.60</span>
                        <svg style={{width:12,height:12}} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                      </div>
                    </div>
                  </div>
                )}

                {/* Riepilogo prezzo */}
                {guestsSet && (
                  <div style={{background:'#0f172a',borderRadius:14,padding:'12px 14px',animation:'fadeIn 0.3s'}}>
                    <p style={{fontSize:9,color:'rgba(255,255,255,0.5)',margin:'0 0 4px',fontWeight:600}}>Totale per 2 ospiti</p>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div style={{fontSize:9,color:'rgba(255,255,255,0.7)'}}>
                        <span>Dotazioni €16.10</span>
                        {bedMaking && <><span style={{margin:'0 4px'}}>+</span><span>🛏️ Letti €5.00</span></>}
                        <span style={{margin:'0 4px'}}>+</span>
                        <span>🚚 Consegna €10.00</span>
                      </div>
                      <span style={{fontSize:18,fontWeight:800,color:'white'}}>€{bedMaking?'31.10':'26.10'}</span>
                    </div>
                    <div style={{marginTop:6,padding:'4px 8px',background:'rgba(59,130,246,0.15)',borderRadius:8,display:'flex',alignItems:'flex-start',gap:4}}>
                      <span style={{fontSize:8,color:'#60a5fa',flexShrink:0}}>ℹ</span>
                      <p style={{fontSize:7,color:'rgba(255,255,255,0.6)',margin:0,lineHeight:1.4}}>Alla richiesta di sola biancheria viene applicato un <b style={{color:'#60a5fa'}}>costo di consegna di €10.00</b> oltre al costo degli articoli.</p>
                    </div>
                  </div>
                )}

                {/* Spacer */}
              </>
            )}
          </div>

          {/* Bottoni fissi in basso */}
          <div style={{flexShrink:0,padding:'10px 14px',background:'#f8fafc',borderTop:'1px solid #e2e8f0'}}>
            {!isStep2 ? (
              <button ref={avantiRef2} style={{width:'100%',padding:'12px 0',borderRadius:14,border:'none',fontSize:12,fontWeight:700,color:'white',background:linenSelected&&propSelected&&dateSet?'linear-gradient(to right,#10b981,#14b8a6)':'#cbd5e1',cursor:'pointer'}}>
                {linenSelected&&propSelected&&dateSet?'Avanti — Ospiti e Dotazioni →':'Completa i campi obbligatori'}
              </button>
            ) : (
              <div style={{display:'flex',gap:8}}>
                <button style={{flex:1,padding:'12px 0',border:'1px solid #e2e8f0',borderRadius:14,fontSize:12,fontWeight:600,color:'#64748b',background:'white',cursor:'pointer'}}>‹ Indietro</button>
                <button ref={confermaRef2} style={{flex:1,padding:'12px 0',borderRadius:14,border:'none',fontSize:12,fontWeight:700,color:'white',background:done?'#059669':'linear-gradient(to right,#10b981,#14b8a6)',cursor:'pointer',transition:'all 0.2s',transform:step===18?'scale(0.96)':'scale(1)'}}>
                  {done?'✓ Ordine Creato!':'✓ Crea Ordine Biancheria'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <CompletionOverlay visible={step >= 19} message="Ordine Biancheria Creato!" />
    </div>
  );
}


const LOGO_AIRBNB = "data:image/png;base64,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";
const LOGO_BOOKING = "data:image/png;base64,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";
const LOGO_VRBO = "data:image/png;base64,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";
const LOGO_INRECEPTION = "data:image/png;base64,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";
const LOGO_KROSSBOOKING = "data:image/png;base64,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";

function ScreenIcal() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  /*
    0  = Lista proprietà, cursore sulla tab "Proprietà" in navbar
    1  = Cursore si sposta → card proprietà
    2  = Pausa sulla card (la si vede bene)
    3  = Click → Dettaglio proprietà, tab "Dashboard" attiva
    4  = Cursore → tab "Impostazioni"
    5  = Click → tab Impostazioni, contenuto impostazioni
    6  = Pausa — si vede tutto
    7  = Cursore → "Configura Link"
    8  = Click → Modal "Configura Link iCal"
    9  = Cursore → riga Airbnb
    10 = Click → Airbnb espansa
    11 = Typing URL
    12 = Cursore → "Salva Link"
    13 = Click → salvato
    14 = Overlay
  */
  const PROP_IMG = "data:image/jpeg;base64,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";
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,2000,3600,5200,7000,8600,10200,11800,13400,15000,16600,18200,19800,21400,22800];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i+1),t));
    const total = 26500;
    const loop = setInterval(()=>{
      setPhase(0);
      seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i+1),t)); });
    }, total);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const navPropRef = useRef(null);
  const cardRef = useRef(null);
  const tabImpostazioniRef = useRef(null);
  const configBtnRef = useRef(null);
  const airbnbRowRef = useRef(null);
  const saveBtnRef = useRef(null);

  const view = phase >= 8 ? 'modal' : phase >= 3 ? 'detail' : 'list';
  const activeTab = phase >= 5 ? 'impostazioni' : 'dashboard';
  const airbnbExpanded = phase >= 10 && phase < 13;
  const airbnbUrl = phase >= 11 ? "https://www.airbnb.it/calendar/ical/12345678.ics" : "";
  const saved = phase >= 13;

  const activeRef =
    phase<=1 ? navPropRef :
    phase<=3 ? cardRef :
    phase<=5 ? tabImpostazioniRef :
    phase<=8 ? configBtnRef :
    phase<=10 ? airbnbRowRef :
    saveBtnRef;
  const clicking = [3,5,8,10,13].includes(phase);

  const NavBar = () => (
    <div style={{borderTop:"1px solid #e2e8f0",background:"white",display:"flex",justifyContent:"space-around",padding:"5px 0 3px",flexShrink:0}}>
      {[
        {l:"Dashboard",d:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",a:false},
        {l:"Proprietà",d:"M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",a:true,ref:navPropRef},
        {l:"Pulizie",d:"M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",a:false},
        {l:"Prenotazioni",d:"M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",a:false},
        {l:"Menu",d:"M4 6h16M4 12h16M4 18h16",a:false},
      ].map((n,i)=>(
        <div key={i} ref={n.ref||undefined} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"3px 5px",borderRadius:8,background:n.a?"#eff6ff":"transparent"}}>
          <svg viewBox="0 0 24 24" fill="none" stroke={n.a?"#0284c7":"#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}><path d={n.d}/></svg>
          <span style={{fontSize:7,fontWeight:n.a?700:400,color:n.a?"#0284c7":"#94a3b8",marginTop:1}}>{n.l}</span>
        </div>
      ))}
    </div>
  );

  /* ── VISTA 1: Lista proprietà ── */
  if (view === 'list') {
    return (
      <div ref={ref} style={{height:"100%",display:"flex",flexDirection:"column",background:"#f8fafc",position:"relative"}}>
        {vis && activeRef && <SmartCursor targetRef={activeRef} clicking={clicking} visible={phase>=0&&phase<14} />}
        {/* Header app */}
        <div style={{padding:"10px 14px",background:"white",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <p style={{fontSize:13,fontWeight:800,color:"#1e293b",margin:0}}>CleaningApp</p>
            <p style={{fontSize:8,color:"#94a3b8",margin:0}}>Area Proprietario</p>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:8,padding:"3px 8px",background:"#e0f2fe",borderRadius:12,color:"#0284c7",fontWeight:600}}>🤖 Assistente AI</span>
            <span style={{fontSize:12}}>🔔</span>
          </div>
        </div>
        {/* Attive label */}
        <div style={{padding:"10px 14px 4px",display:"flex",alignItems:"center",gap:4}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#10b981"}}/>
          <span style={{fontSize:10,fontWeight:600,color:"#64748b"}}>Attive (1)</span>
        </div>
        {/* Card proprietà — stile reale */}
        <div style={{padding:"6px 12px",flex:1}}>
          <div ref={cardRef} style={{background:"white",borderRadius:16,overflow:"hidden",border:"1px solid rgba(0,0,0,0.06)",cursor:"pointer",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            {/* Foto reale con overlay */}
            <div style={{height:95,position:"relative",overflow:"hidden"}}>
              <img src={PROP_IMG} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="" />
              <div style={{position:"absolute",inset:0,background:"linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 40%, transparent 100%)"}}/>
              {/* Badge Attiva */}
              <span style={{position:"absolute",top:8,left:8,display:"inline-flex",alignItems:"center",gap:3,padding:"3px 9px",borderRadius:8,fontSize:9,fontWeight:700,color:"white",background:"#10b981",boxShadow:"0 2px 6px rgba(16,185,129,0.4)"}}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                Attiva
              </span>
              {/* Badge Accesso */}
              <div style={{position:"absolute",top:8,right:8,display:"flex",alignItems:"center",gap:4}}>
                <span style={{padding:"3px 8px",borderRadius:8,fontSize:8,fontWeight:700,color:"white",background:"rgba(0,0,0,0.3)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.15)"}}>Accesso</span>
                <div style={{width:24,height:24,borderRadius:"50%",background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M9 5l7 7-7 7"/></svg>
                </div>
              </div>
              {/* Nome + indirizzo */}
              <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"0 12px 8px",zIndex:1}}>
                <p style={{fontSize:14,fontWeight:800,color:"white",margin:0,textShadow:"0 1px 3px rgba(0,0,0,0.4)"}}>Appartamento Colosseo</p>
                <p style={{fontSize:9,color:"rgba(255,255,255,0.7)",margin:"2px 0 0"}}>Via del Corso 100, Roma</p>
              </div>
            </div>
            {/* Stats bar con icone SVG reali */}
            <div style={{display:"flex",padding:"5px 5px",gap:2}}>
              {[
                {icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,v:"3",l:"OSPITI"},
                {icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8"><path d="M2 4v16M2 8h18a2 2 0 012 2v10M2 17h20M6 8v3a2 2 0 002 2h8a2 2 0 002-2V8"/></svg>,v:"2",l:"LETTI"},
                {icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8"><path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z"/><path d="M6 12V5a2 2 0 012-2h1"/></svg>,v:"1",l:"BAGNI"},
                {icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01"/></svg>,v:"2°",l:"PIANO"},
              ].map((s,i)=>(
                <div key={i} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:4,padding:"6px 3px",background:"#f8fafc",borderRadius:8,border:"1px solid #f1f5f9",position:"relative",overflow:"hidden"}}>
                  <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,borderRadius:"8px 0 0 8px",background:"linear-gradient(to bottom,#dbeafe,#93c5fd)"}}/>
                  <span style={{opacity:0.55,flexShrink:0}}>{s.icon}</span>
                  <div style={{textAlign:"center"}}>
                    <span style={{fontSize:12,fontWeight:800,color:"#1e293b",display:"block",lineHeight:1}}>{s.v}</span>
                    <span style={{fontSize:5,fontWeight:700,color:"#94a3b8",letterSpacing:0.5}}>{s.l}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <NavBar />
      </div>
    );
  }

  /* ── VISTA 2: Dettaglio proprietà con tabs ── */
  if (view === 'detail') {
    return (
      <div ref={ref} style={{height:"100%",display:"flex",flexDirection:"column",background:"#f1f5f9",position:"relative"}}>
        {vis && activeRef && <SmartCursor targetRef={activeRef} clicking={clicking} visible={phase>=0&&phase<14} />}
        <div style={{position:"relative",height:65,overflow:"hidden",flexShrink:0}}>
          <img src={PROP_IMG} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="" />
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)"}}/>
          <div style={{position:"absolute",top:6,left:8,display:"flex",alignItems:"center",gap:5,zIndex:2}}>
            <div style={{width:22,height:22,borderRadius:"50%",background:"rgba(0,0,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{color:"white",fontSize:10}}>‹</span>
            </div>
            <span style={{fontSize:8,color:"white",fontWeight:500}}>Dettaglio Proprietà</span>
          </div>
          <span style={{position:"absolute",top:6,right:8,padding:"2px 7px",borderRadius:5,fontSize:7,fontWeight:700,color:"white",background:"#10b981",zIndex:2}}>● Attiva</span>
          <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"0 10px 6px",zIndex:1}}>
            <p style={{fontSize:12,fontWeight:800,color:"white",margin:0}}>Appartamento Colosseo</p>
            <p style={{fontSize:7,color:"rgba(255,255,255,0.7)",margin:0}}>Via del Corso 100, Roma</p>
          </div>
        </div>
        {/* Tabs */}
        <div style={{display:"flex",gap:4,padding:"6px 8px",background:"#f1f5f9",flexShrink:0,borderBottom:"1px solid #e2e8f0"}}>
          {[{l:"Dashboard",k:"dashboard"},{l:"Servizi",k:"servizi"},{l:"Impostazioni",k:"impostazioni"}].map(t=>(
            <button key={t.k} ref={t.k==="impostazioni"?tabImpostazioniRef:null}
              style={{flex:1,padding:"7px 0",borderRadius:10,border:activeTab===t.k?"none":"1px solid #e2e8f0",fontSize:9,fontWeight:700,
                background:activeTab===t.k?"#2563eb":"white",color:activeTab===t.k?"white":"#64748b",
                boxShadow:activeTab===t.k?"0 2px 8px rgba(37,99,235,0.3)":"none",transition:"all 0.3s",cursor:"pointer"}}>
              {t.l}
            </button>
          ))}
        </div>
        <div style={{flex:1,padding:"8px",overflow:"hidden"}}>
          {activeTab === 'dashboard' ? (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <div style={{display:"flex",gap:6}}>
                <div style={{flex:1,background:"linear-gradient(135deg,#059669,#10b981)",borderRadius:12,padding:"12px 10px",color:"white"}}>
                  <p style={{fontSize:22,fontWeight:800,margin:0}}>55€</p>
                  <p style={{fontSize:7,opacity:0.7,margin:"2px 0 0"}}>PREZZO PULIZIA</p>
                </div>
                <div style={{flex:1,background:"white",borderRadius:12,padding:"12px 10px",border:"1px solid #e2e8f0"}}>
                  <p style={{fontSize:22,fontWeight:800,color:"#1e293b",margin:0}}>4.9</p>
                  <p style={{fontSize:7,color:"#94a3b8",margin:"2px 0 0"}}>★★★★★ Valutazione</p>
                </div>
              </div>
              <div style={{background:"linear-gradient(135deg,#1e293b,#334155)",borderRadius:12,padding:"8px 10px"}}>
                <p style={{fontSize:9,fontWeight:700,color:"white",margin:"0 0 6px"}}>Info Proprietà</p>
                <div style={{display:"flex",gap:3}}>
                  {[{v:"4",l:"Ospiti"},{v:"2",l:"Camere"},{v:"1",l:"Bagni"},{v:"15:00",l:"Check-in"},{v:"10:00",l:"Check-out"}].map((s,i)=>(
                    <div key={i} style={{flex:1,textAlign:"center",padding:"5px 2px",background:"rgba(255,255,255,0.08)",borderRadius:6}}>
                      <p style={{fontSize:10,fontWeight:800,color:"white",margin:0}}>{s.v}</p>
                      <p style={{fontSize:5,color:"rgba(255,255,255,0.5)",margin:"2px 0 0",textTransform:"uppercase"}}>{s.l}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:6,animation:"fadeIn 0.3s"}}>
              <div style={{background:"white",borderRadius:10,border:"1px solid #e2e8f0",padding:"10px",display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:32,height:32,borderRadius:8,background:"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>✏️</div>
                <div style={{flex:1}}>
                  <p style={{fontSize:10,fontWeight:600,color:"#1e293b",margin:0}}>Modifica Informazioni Generali</p>
                  <p style={{fontSize:7,color:"#94a3b8",margin:0}}>Nome, indirizzo, orari, capacità</p>
                </div>
                <span style={{fontSize:10,color:"#94a3b8"}}>›</span>
              </div>
              <div style={{background:"white",borderRadius:10,border:"1px solid #e2e8f0",overflow:"hidden"}}>
                <div style={{padding:"10px",display:"flex",alignItems:"center",gap:8,borderBottom:"1px solid #f1f5f9"}}>
                  <div style={{width:32,height:32,borderRadius:8,background:"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>📦</div>
                  <div style={{flex:1}}>
                    <p style={{fontSize:10,fontWeight:600,color:"#1e293b",margin:0}}>Configurazione Dotazioni</p>
                    <p style={{fontSize:7,color:"#94a3b8",margin:0}}>Letti, biancheria, kit, extra</p>
                  </div>
                </div>
                <div style={{padding:"8px 10px",display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:28,height:28,borderRadius:6,background:"#e0f2fe",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11}}>🧺</div>
                  <div style={{flex:1}}>
                    <p style={{fontSize:9,fontWeight:600,margin:0}}>Servizio Biancheria</p>
                    <p style={{fontSize:7,color:"#94a3b8",margin:0}}>Fornita dalla ditta</p>
                  </div>
                  <div style={{width:28,height:14,borderRadius:7,background:"#0ea5e9",position:"relative"}}>
                    <div style={{width:12,height:12,borderRadius:"50%",background:"white",position:"absolute",top:1,right:1,boxShadow:"0 1px 2px rgba(0,0,0,0.2)"}}/>
                  </div>
                </div>
              </div>
              <div style={{background:"white",borderRadius:10,border:"1px solid #e2e8f0",padding:"10px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <div style={{width:32,height:32,borderRadius:8,background:"#dbeafe",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>📅</div>
                  <div style={{flex:1}}>
                    <p style={{fontSize:10,fontWeight:600,color:"#1e293b",margin:0}}>Sincronizzazione Calendario</p>
                    <p style={{fontSize:7,color:"#94a3b8",margin:0}}>iCal • Airbnb • Booking • Altri</p>
                  </div>
                </div>
                <div style={{borderTop:"1px solid #f1f5f9",paddingTop:8,display:"flex",gap:6}}>
                  <button ref={configBtnRef} style={{flex:1,padding:"8px 0",background:"#f1f5f9",border:"none",borderRadius:8,fontSize:9,fontWeight:600,color:"#475569",cursor:"pointer"}}>Configura Link</button>
                  <button style={{flex:1,padding:"8px 0",background:"#2563eb",border:"none",borderRadius:8,fontSize:9,fontWeight:600,color:"white"}}>Sincronizza Ora</button>
                </div>
              </div>
            </div>
          )}
        </div>
        <NavBar />
      </div>
    );
  }

  /* ── VISTA 3: Modal Configura Link iCal ── */
  const otas = [
    {id:"airbnb",name:"Airbnb",img:LOGO_AIRBNB,expanded:airbnbExpanded,url:airbnbUrl,done:airbnbUrl!=="",rowRef:airbnbRowRef},
    {id:"booking",name:"Booking.com",img:LOGO_BOOKING,expanded:false,url:"",done:false,rowRef:null},
    {id:"vrbo",name:"VRBO",img:LOGO_VRBO,expanded:false,url:"",done:false,rowRef:null},
    {id:"inreception",name:"InReception",img:LOGO_INRECEPTION,expanded:false,url:"",done:false,rowRef:null},
    {id:"krossbooking",name:"KrossBooking",img:LOGO_KROSSBOOKING,expanded:false,url:"",done:false,rowRef:null},
  ];

  return (
    <div ref={ref} style={{height:"100%",display:"flex",flexDirection:"column",background:"white",position:"relative"}}>
      {vis && activeRef && <SmartCursor targetRef={activeRef} clicking={clicking} visible={phase>=0&&phase<14} />}
      <CompletionOverlay visible={phase>=14} message="Calendari Collegati!" />
      <div style={{padding:"12px 14px",borderBottom:"1px solid #f1f5f9",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <p style={{fontSize:13,fontWeight:700,color:"#1e293b",margin:0}}>Configura Link iCal</p>
            <p style={{fontSize:8,color:"#94a3b8",margin:"2px 0 0"}}>Aggiungi i link da Airbnb, Booking e altri OTA</p>
          </div>
          <div style={{width:28,height:28,borderRadius:"50%",background:"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontSize:11,color:"#64748b"}}>✕</span>
          </div>
        </div>
      </div>
      <div style={{flex:1,padding:"8px 12px",overflow:"hidden"}}>
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          {otas.map(ota=>(
            <div key={ota.id} style={{borderRadius:10,border:ota.expanded?"1px solid #94a3b8":"1px solid #e2e8f0",overflow:"hidden",background:"white"}}>
              <div ref={ota.rowRef} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:30,height:30,borderRadius:8,overflow:"hidden",flexShrink:0}}>
                    <img src={ota.img} alt={ota.name} style={{width:30,height:30,objectFit:"cover",display:"block"}} />
                  </div>
                  <div>
                    <p style={{fontSize:10,fontWeight:600,color:"#1e293b",margin:0}}>{ota.name}</p>
                    <p style={{fontSize:7,color:ota.done?"#10b981":"#94a3b8",margin:0,fontWeight:ota.done?600:400}}>{ota.done?"✓ Configurato":"Non configurato"}</p>
                  </div>
                </div>
                <span style={{fontSize:9,color:"#94a3b8",transform:ota.expanded?"rotate(180deg)":"",transition:"transform 0.2s"}}>▼</span>
              </div>
              <div style={{maxHeight:ota.expanded?130:0,opacity:ota.expanded?1:0,overflow:"hidden",transition:"max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease"}}>
                <div style={{padding:"6px 10px 10px",background:"#f8fafc",borderTop:"1px solid #f1f5f9"}}>
                  <p style={{fontSize:8,color:"#64748b",margin:"0 0 4px"}}>Incolla il link iCal di {ota.name}:</p>
                  <div style={{width:"100%",padding:"7px 8px",border:"1px solid #e2e8f0",borderRadius:7,fontSize:7,fontFamily:"monospace",color:ota.url?"#1e293b":"#94a3b8",background:"white",minHeight:24,wordBreak:"break-all",lineHeight:1.4}}>
                    {ota.url || "https://www.airbnb.com/calendar/ical/..."}
                    {!ota.url && ota.expanded && <span style={{animation:"blink 1s infinite",color:"#3b82f6"}}>|</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{marginTop:6,padding:"6px 8px",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:7}}>
          <p style={{fontSize:7,color:"#1d4ed8",margin:0}}><b>💡</b> I link verranno sincronizzati automaticamente.</p>
        </div>
      </div>
      <div style={{padding:"8px 12px",borderTop:"1px solid #e2e8f0",flexShrink:0,display:"flex",gap:6}}>
        <button style={{flex:1,padding:"9px 0",background:"#f1f5f9",border:"none",borderRadius:10,fontSize:10,fontWeight:600,color:"#64748b"}}>Annulla</button>
        <button ref={saveBtnRef} style={{flex:1,padding:"9px 0",border:"none",borderRadius:10,fontSize:10,fontWeight:700,color:"white",background:saved?"#10b981":airbnbUrl?"linear-gradient(135deg,#2563eb,#1d4ed8)":"#cbd5e1",transition:"all 0.3s"}}>
          {saved?"✓ Salvato!":"Salva Link"}
        </button>
      </div>
    </div>
  );
}

function ScreenPulizia() {
  const [ref, vis] = useVis(0.1);
  const [step, setStep] = useState(0);
  /*
    0  = lista card pulizie
    1  = cursore sulla card "Apt Colosseo" (bottone ospiti viola)
    2  = click → modal ospiti si apre CENTRATA
    3  = cursore sul + adulti
    4  = click → adulti 2→3
    5  = cursore su Conferma
    6  = click → modal chiusa, ospiti aggiornato a 3
    7  = overlay completamento
  */
  useEffect(() => {
    if (!vis) { setStep(0); return; }
    const seq = [0,0,1800,3000,4200,5400,6600,7800,8600];
    const timers = seq.map((t,i)=>setTimeout(()=>setStep(i),t));
    const loop = setInterval(()=>{ setStep(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setStep(i),t)); }); },12000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const guestsPillRef = useRef(null);
  const plusRef = useRef(null);
  const confermaRef = useRef(null);

  const showModal = step>=2 && step<7;
  const adults = step>=4 ? 3 : 2;
  const done = step>=6;
  const showComplete = step>=7;

  const activeRef = step<=1?guestsPillRef:step<=3?plusRef:step<=5?confermaRef:null;
  const clicking = step===1||step===3||step===5;

  const cards = [
    {name:"Appartamento Colosseo",addr:"Via del Corso 100",time:"10:00",guests:done?3:2,status:"pending",color:"#f59e0b",label:"IN ATTESA",img:"linear-gradient(135deg,#fbbf24,#f59e0b)"},
    {name:"Suite Trastevere",addr:"Via Lungaretta 22",time:"11:30",guests:4,status:"assigned",color:"#0ea5e9",label:"IN CORSO",img:"linear-gradient(135deg,#38bdf8,#0284c7)"},
    {name:"Parioli Apartment",addr:"Viale Liegi 14",time:"14:00",guests:2,status:"done",color:"#10b981",label:"✓ FATTO",img:"linear-gradient(135deg,#34d399,#059669)"},
  ];

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      <SmartCursor targetRef={activeRef} clicking={clicking} visible={vis&&step>=1&&!showComplete} />

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100" style={{position:"relative"}}>
        <CompletionOverlay visible={showComplete} message="Ospiti Aggiornati!" />

        {/* Header */}
        <div style={{background:"linear-gradient(135deg,#1e293b,#334155)",padding:"12px 14px",color:"white"}}>
          <div className="flex items-center justify-between">
            <div>
              <h2 style={{fontSize:14,fontWeight:800,margin:0}}>Pulizie Oggi</h2>
              <p style={{fontSize:9,color:"rgba(255,255,255,0.5)",margin:"2px 0 0"}}>3 pulizie programmate</p>
            </div>
            <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            </div>
          </div>
        </div>

        {/* Lista card compatte */}
        <div style={{padding:"6px 10px 8px"}}>
          {cards.map((c,i)=>{
            const isFirst = i===0;
            return (
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:i<2?"1px solid #f1f5f9":"none"}}>
                {/* Foto con gradiente */}
                <div style={{width:52,height:52,borderRadius:10,background:c.img,flexShrink:0,position:"relative",display:"flex",alignItems:"flex-end",justifyContent:"center",overflow:"hidden"}}>
                  <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.3)" style={{width:22,height:22,marginBottom:4}}><path d="m3 9 9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22" fill="rgba(255,255,255,0.2)"/></svg>
                  <div style={{position:"absolute",top:3,left:3,background:c.color,borderRadius:4,padding:"1px 5px",fontSize:6,fontWeight:700,color:"white"}}>{c.label}</div>
                </div>
                {/* Info */}
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:11,fontWeight:700,color:"#1e293b",margin:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</p>
                  <p style={{fontSize:8,color:"#94a3b8",margin:"1px 0 4px"}}>{c.addr}</p>
                  <div style={{display:"flex",gap:4}}>
                    <span style={{display:"inline-flex",alignItems:"center",gap:2,background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:10,padding:"2px 6px",fontSize:8,color:"#0284c7",fontWeight:600}}>
                      🕐 {c.time}
                    </span>
                    <span ref={isFirst?guestsPillRef:null} style={{
                      display:"inline-flex",alignItems:"center",gap:2,
                      borderRadius:10,padding:"2px 6px",fontSize:8,fontWeight:700,
                      background:isFirst&&step>=1&&!done?"#ede9fe":"#f5f3ff",
                      border:isFirst&&step>=1&&!done?"2px solid #8b5cf6":"1px solid #ddd6fe",
                      color:"#7c3aed",
                      transition:"all 0.3s",
                      cursor:"pointer"
                    }}>
                      👥 {c.guests}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal ospiti CENTRATA con overlay */}
        {showModal && (
          <div style={{position:"absolute",inset:0,zIndex:20,display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn 0.25s"}}>
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(3px)"}}/>
            <div style={{position:"relative",background:"white",borderRadius:18,padding:"14px 16px",width:"85%",boxShadow:"0 12px 40px rgba(0,0,0,0.2)"}}>
              <div style={{width:28,height:3,background:"#e2e8f0",borderRadius:2,margin:"0 auto 10px"}}/>
              <p style={{fontSize:13,fontWeight:700,color:"#1e293b",margin:"0 0 3px"}}>Modifica ospiti</p>
              <p style={{fontSize:9,color:"#94a3b8",margin:"0 0 10px"}}>Appartamento Colosseo</p>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderTop:"1px solid #f1f5f9",borderBottom:"1px solid #f1f5f9"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:32,height:32,borderRadius:10,background:"#ede9fe",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <svg style={{width:16,height:16,color:"#7c3aed"}} fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                  </div>
                  <span style={{fontSize:13,fontWeight:600,color:"#1e293b"}}>Adulti</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:30,height:30,borderRadius:"50%",border:"2px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <svg style={{width:12,height:12,color:"#94a3b8"}} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" d="M20 12H4"/></svg>
                  </div>
                  <span style={{fontSize:18,fontWeight:800,color:"#1e293b",width:20,textAlign:"center"}}>{adults}</span>
                  <div ref={plusRef} style={{width:30,height:30,borderRadius:"50%",background:"#7c3aed",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                    <svg style={{width:12,height:12,color:"white"}} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 4v16m8-8H4"/></svg>
                  </div>
                </div>
              </div>
              {/* Mini avatar */}
              <div style={{display:"flex",justifyContent:"center",gap:6,padding:"10px 0"}}>
                {Array.from({length:adults}).map((_,i)=>(
                  <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",animation:"fadeIn 0.2s"}}>
                    <div style={{width:16,height:16,borderRadius:"50%",background:"#c4b5fd"}}/>
                    <div style={{width:20,height:10,background:"#a78bfa",borderRadius:"8px 8px 4px 4px",marginTop:2}}/>
                  </div>
                ))}
              </div>
              <button ref={confermaRef} style={{
                width:"100%",padding:"10px 0",borderRadius:12,border:"none",
                fontSize:12,fontWeight:700,color:"white",
                background:done?"#10B981":"#1e293b",
                cursor:"pointer",transition:"all 0.2s"
              }}>
                {done?"✓ Confermato":"Conferma"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   COMPONENTI UX PAGINA PRINCIPALE
   ════════════════════════════════════════════════════════════════ */

/* Progress bar sticky in alto */
/* ─── SCREEN: Firma Allegato D (dalla pagina Proprietà) ─── */
function ScreenAllegatoD() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  /*
    0  = Pagina proprietà con card
    1  = cursore su "Firma ora"
    2  = click → modal Leggi + scroll parte subito
    3  = scroll finito, badge piccolo "✓ Letto"
    4  = cursore su "Procedi alla Firma"
    5  = click → step 2 Firma, cursore su checkbox 1
    6  = click checkbox 1
    7  = cursore si sposta su checkbox 2
    8  = click checkbox 2
    9  = cursore su riquadro firma
    10 = click → firma si disegna
    11 = cursore su bottone "Firma e Attiva"
    12 = click
    13 = successo
    14 = overlay
  */
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1800,3200,5400,7000,8400,9600,10800,12000,13200,14600,16000,17400,18400,19400];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },22000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const firmaBtnRef = useRef(null);
  const procediRef = useRef(null);
  const check1Ref = useRef(null);
  const check2Ref = useRef(null);
  const firmaBoxRef = useRef(null);
  const confirmRef = useRef(null);
  const showModal = phase >= 2;
  const showSign = phase >= 5;
  const scrolled = phase >= 2;
  const scrollDone = phase >= 3;

  // Cursore sempre visibile, si sposta fluidamente
  const getActiveRef = () => {
    if (phase <= 1) return firmaBtnRef;
    if (phase === 4) return procediRef;
    if (phase === 5 || phase === 6) return check1Ref;
    if (phase === 7 || phase === 8) return check2Ref;
    if (phase === 9 || phase === 10) return firmaBoxRef;
    if (phase >= 11 && phase <= 12) return confirmRef;
    return null;
  };
  const activeRef = getActiveRef();
  const clicking = phase===2||phase===5||phase===6||phase===8||phase===10||phase===12;

  /* ── PAGINA PROPRIETÀ ── */
  if (!showModal) {
    return (
      <div ref={ref} style={{height:"100%",display:"flex",flexDirection:"column",background:"#f8fafc"}}>
        {vis && activeRef && phase<14 && <SmartCursor targetRef={activeRef} clicking={clicking} visible={phase>=1} />}
        <CompletionOverlay visible={phase>=14} message="Allegato D Firmato!" />
        {/* Header viola */}
        <div style={{background:"#0b0b18",position:"relative",overflow:"hidden",flexShrink:0}}>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,#2d1b69 0%,#1a1a2e 40%,#0b0b18 100%)",opacity:0.8}}/>
          <div style={{position:"relative",zIndex:1,padding:"16px 16px 14px"}}>
            <p style={{fontSize:15,fontWeight:800,color:"white",margin:0}}>Le Mie Proprietà</p>
            <p style={{fontSize:9,color:"rgba(255,255,255,0.5)",margin:"3px 0 0"}}>1 proprietà · In attesa di firma</p>
          </div>
        </div>
        {/* Card */}
        <div style={{padding:"10px 10px",flex:1}}>
          <div style={{background:"linear-gradient(145deg,#1c1917,#292524)",borderRadius:14,overflow:"hidden"}}>
            <div style={{height:65,background:"linear-gradient(135deg,#7c3aed,#a78bfa,#c4b5fd)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
              <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" style={{width:26,height:26}}><path d="m3 9 9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <div style={{position:"absolute",top:5,right:5,width:9,height:9,borderRadius:"50%",background:"#ef4444",border:"2px solid #1c1917"}}/>
            </div>
            <div style={{padding:"10px 12px"}}>
              <p style={{fontSize:13,fontWeight:800,color:"#fafaf9",margin:0}}>Appartamento Colosseo</p>
              <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:8,fontWeight:600,color:"#a8a29e",background:"rgba(255,255,255,0.08)",padding:"3px 8px",borderRadius:6,marginTop:4}}>
                📍 Via del Corso 100, Roma
              </span>
            </div>
            <div style={{margin:"0 12px",height:1,background:"rgba(255,255,255,0.06)"}}/>
            <div style={{padding:"10px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <p style={{fontSize:7,fontWeight:700,color:"#78716c",textTransform:"uppercase",margin:0}}>Stato</p>
                <p style={{fontSize:10,fontWeight:700,color:"#fbbf24",display:"flex",alignItems:"center",gap:3,margin:"2px 0 0"}}>
                  <span style={{width:5,height:5,borderRadius:"50%",background:"#fbbf24",animation:"ringPulse 1.5s infinite"}}/>
                  Firma il contratto
                </p>
              </div>
              <button ref={firmaBtnRef} style={{display:"flex",alignItems:"center",gap:4,padding:"8px 14px",fontSize:10,fontWeight:800,color:"white",borderRadius:9,border:"none",background:"linear-gradient(135deg,#f59e0b,#d97706)",boxShadow:"0 4px 12px rgba(245,158,11,0.35)"}}>
                ✏️ Firma ora
              </button>
            </div>
          </div>
        </div>
        {/* Navbar in fondo — stessa dello Step 0 */}
        <div style={{borderTop:"1px solid #e2e8f0",background:"white",display:"flex",justifyContent:"space-around",alignItems:"center",padding:"4px 2px 3px",flexShrink:0}}>
          {[
            {d:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",l:"Dashboard",a:false},
            {d:"M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",l:"Proprietà",a:true},
            {d:"M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",l:"Pulizie",a:false},
            {d:"M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",l:"Prenotazioni",a:false},
            {d:"M4 6h16M4 12h16M4 18h16",l:"Menu",a:false},
          ].map((item,i)=>(
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 6px",borderRadius:10,background:item.a?"#eff6ff":"transparent"}}>
              <svg viewBox="0 0 24 24" fill="none" stroke={item.a?"#0284c7":"#64748b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}>
                <path d={item.d}/>
              </svg>
              <span style={{fontSize:8,marginTop:2,fontWeight:item.a?600:400,color:item.a?"#0284c7":"#64748b"}}>{item.l}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── MODAL STEP 1: LEGGI ── */
  if (!showSign) {
    return (
      <div ref={ref} style={{height:"100%",display:"flex",flexDirection:"column"}}>
        {vis && activeRef && phase<14 && <SmartCursor targetRef={activeRef} clicking={clicking} visible={phase>=4} />}
        {/* Header */}
        <div style={{padding:"10px 14px",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:10,flexShrink:0,background:"white"}}>
          <div style={{width:30,height:30,borderRadius:"50%",background:"#e0f2fe",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontSize:14}}>📄</span>
          </div>
          <div>
            <p style={{fontSize:13,fontWeight:700,color:"#1e293b",margin:0}}>Allegato D – Scheda Servizio</p>
            <p style={{fontSize:9,color:"#94a3b8",margin:0}}>Appartamento Colosseo</p>
          </div>
        </div>
        {/* Steps */}
        <div style={{padding:"7px 14px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <div style={{width:20,height:20,borderRadius:"50%",background:"#0ea5e9",color:"white",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>1</div>
          <span style={{fontSize:10,fontWeight:600,color:"#0ea5e9"}}>Leggi</span>
          <div style={{width:16,height:2,background:"#cbd5e1",borderRadius:1}}/>
          <div style={{width:20,height:20,borderRadius:"50%",background:"#e2e8f0",color:"#94a3b8",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>2</div>
          <span style={{fontSize:10,fontWeight:600,color:"#94a3b8"}}>Firma</span>
        </div>
        {/* Prezzo */}
        <div style={{padding:"8px 14px",background:"#ecfdf5",borderBottom:"1px solid #a7f3d0",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <span style={{fontSize:10,color:"#047857"}}>Prezzo contrattuale:</span>
          <span style={{fontSize:16,fontWeight:800,color:"#065f46"}}>€ 45,00</span>
        </div>
        {/* Contenuto contratto con scroll animato — inizia subito */}
        <div style={{flex:1,overflow:"hidden",position:"relative"}}>
          <div style={{
            position:"absolute",left:0,right:0,
            padding:"8px 14px",fontSize:9,color:"#475569",lineHeight:1.7,
            transform:`translateY(${scrollDone ? "-155px" : "0px"})`,
            transition:"transform 2.5s cubic-bezier(0.25, 0.1, 0.25, 1)"
          }}>
            <p style={{margin:"0 0 5px",fontWeight:700,fontSize:10,color:"#1e293b"}}>ALLEGATO D — SCHEDA SERVIZIO PROPRIETÀ</p>
            <p style={{margin:"0 0 4px"}}><b>Proprietà:</b> Appartamento Colosseo</p>
            <p style={{margin:"0 0 4px"}}><b>Indirizzo:</b> Via del Corso 100, Roma</p>
            <p style={{margin:"0 0 4px"}}><b>Prezzo pulizia standard:</b> €45,00</p>
            <p style={{margin:"0 0 6px"}}><b>Servizi inclusi:</b> pulizia completa, sanificazione bagni, cambio biancheria, rifacimento letti.</p>
            <div style={{height:1,background:"#e2e8f0",margin:"4px 0 6px"}}/>
            <p style={{margin:"0 0 4px",fontWeight:600,fontSize:9,color:"#334155"}}>Art. 1 — Oggetto del contratto</p>
            <p style={{margin:"0 0 4px"}}>Il presente allegato disciplina il servizio di pulizia.</p>
            <p style={{margin:"0 0 4px",fontWeight:600,fontSize:9,color:"#334155"}}>Art. 2 — Corrispettivo</p>
            <p style={{margin:"0 0 4px"}}>€45,00 per ogni intervento di pulizia standard.</p>
            <p style={{margin:"0 0 4px",fontWeight:600,fontSize:9,color:"#334155"}}>Art. 3 — Pagamento</p>
            <p style={{margin:"0 0 4px"}}>Fatturazione mensile posticipata entro il 10 del mese successivo.</p>
            <p style={{margin:"0 0 4px",fontWeight:600,fontSize:9,color:"#334155"}}>Art. 4 — Recesso</p>
            <p style={{margin:"0 0 4px"}}>Preavviso scritto di 30 giorni.</p>
            <div style={{height:1,background:"#e2e8f0",margin:"4px 0 6px"}}/>
            <p style={{margin:"0 0 8px",textAlign:"center",fontWeight:600,fontSize:9,color:"#64748b"}}>— FINE DEL DOCUMENTO —</p>
            {/* Badge piccolo "Letto" sotto il contratto */}
            {scrollDone && (
              <div style={{display:"flex",justifyContent:"center",animation:"fadeIn 0.4s"}}>
                <span style={{background:"#10b981",color:"white",padding:"4px 12px",borderRadius:8,fontSize:9,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                  ✓ Contratto letto
                </span>
              </div>
            )}
          </div>
          {/* Scrollbar animata */}
          <div style={{position:"absolute",right:3,top:4,bottom:4,width:3,borderRadius:2,background:"#f1f5f9"}}>
            <div style={{
              width:3,height:30,borderRadius:2,background:"#94a3b8",
              transform:`translateY(${scrollDone ? "65px" : "0px"})`,
              transition:"transform 2.5s cubic-bezier(0.25, 0.1, 0.25, 1)"
            }}/>
          </div>
        </div>
        {/* Bottone in fondo */}
        <div style={{padding:"8px 14px",borderTop:"1px solid #e2e8f0",flexShrink:0}}>
          <button ref={procediRef} style={{width:"100%",padding:"11px 0",borderRadius:12,border:"none",fontSize:12,fontWeight:600,color:scrollDone?"white":"#94a3b8",background:scrollDone?"#0ea5e9":"#e2e8f0",transition:"all 0.4s"}}>
            Procedi alla Firma →
          </button>
        </div>
      </div>
    );
  }

  /* ── MODAL STEP 2: FIRMA ── */
  return (
    <div ref={ref} style={{height:"100%",display:"flex",flexDirection:"column"}}>
      {vis && activeRef && phase<14 && <SmartCursor targetRef={activeRef} clicking={clicking} visible={true} />}
      <CompletionOverlay visible={phase>=14} message="Allegato D Firmato!" />
      {/* Header */}
      <div style={{padding:"10px 14px",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:10,flexShrink:0,background:"white"}}>
        <div style={{width:30,height:30,borderRadius:"50%",background:"#e0f2fe",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:14}}>📄</span>
        </div>
        <div>
          <p style={{fontSize:13,fontWeight:700,color:"#1e293b",margin:0}}>Allegato D – Scheda Servizio</p>
          <p style={{fontSize:9,color:"#94a3b8",margin:0}}>Appartamento Colosseo</p>
        </div>
      </div>
      {/* Steps - step 2 */}
      <div style={{padding:"7px 14px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
        <div style={{width:20,height:20,borderRadius:"50%",background:"#10b981",color:"white",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>✓</div>
        <span style={{fontSize:10,fontWeight:600,color:"#10b981"}}>Leggi</span>
        <div style={{width:16,height:2,background:"#10b981",borderRadius:1}}/>
        <div style={{width:20,height:20,borderRadius:"50%",background:"#0ea5e9",color:"white",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>2</div>
        <span style={{fontSize:10,fontWeight:600,color:"#0ea5e9"}}>Firma</span>
      </div>
      {/* Body */}
      <div style={{flex:1,padding:"10px 12px",overflow:"hidden",display:"flex",flexDirection:"column",gap:6}}>
        {/* Riepilogo */}
        <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"8px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <p style={{fontSize:10,fontWeight:700,color:"#1e293b",margin:0}}>Appartamento Colosseo</p>
            <p style={{fontSize:8,color:"#94a3b8",margin:"1px 0 0"}}>Via del Corso 100, Roma</p>
          </div>
          <span style={{fontSize:16,fontWeight:800,color:"#047857"}}>€ 45,00</span>
        </div>
        {/* Checkbox 1 */}
        <label ref={check1Ref} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"7px 10px",borderRadius:10,border:phase>=6?"2px solid #22c55e":"2px solid #e2e8f0",background:phase>=6?"#f0fdf4":"white",cursor:"pointer",transition:"all 0.4s"}}>
          <div style={{width:16,height:16,borderRadius:4,border:phase>=6?"none":"2px solid #cbd5e1",background:phase>=6?"#22c55e":"white",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,transition:"all 0.3s"}}>
            {phase>=6&&<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" style={{width:10,height:10}}><path d="M5 13L9 17L19 7"/></svg>}
          </div>
          <span style={{fontSize:9,color:"#334155",lineHeight:1.4}}>Dichiaro di aver letto e accetto <b>integralmente</b> le condizioni dell'Allegato D</span>
        </label>
        {/* Checkbox 2 */}
        <label ref={check2Ref} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"7px 10px",borderRadius:10,border:phase>=8?"2px solid #22c55e":"2px solid #e2e8f0",background:phase>=8?"#f0fdf4":"white",cursor:"pointer",transition:"all 0.4s"}}>
          <div style={{width:16,height:16,borderRadius:4,border:phase>=8?"none":"2px solid #cbd5e1",background:phase>=8?"#22c55e":"white",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,transition:"all 0.3s"}}>
            {phase>=8&&<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" style={{width:10,height:10}}><path d="M5 13L9 17L19 7"/></svg>}
          </div>
          <span style={{fontSize:9,color:"#334155",lineHeight:1.4}}>Accetto il prezzo di <b>€ 45,00</b> per la proprietà <b>Appartamento Colosseo</b></span>
        </label>
        {/* Nome e CF */}
        <div style={{display:"flex",gap:6}}>
          <div style={{flex:1}}>
            <p style={{fontSize:8,fontWeight:600,color:"#475569",margin:"0 0 2px"}}>Nome e Cognome *</p>
            <div style={{border:"1px solid #e2e8f0",borderRadius:8,padding:"5px 8px",fontSize:9,color:"#1e293b",background:"#f8fafc"}}>Mario Rossi</div>
          </div>
          <div style={{flex:1}}>
            <p style={{fontSize:8,fontWeight:600,color:"#475569",margin:"0 0 2px"}}>Codice Fiscale *</p>
            <div style={{border:"1px solid #e2e8f0",borderRadius:8,padding:"5px 8px",fontSize:8,color:"#1e293b",background:"#f8fafc",fontFamily:"monospace"}}>RSSMRA80A01H501Z</div>
          </div>
        </div>
        {/* Firma */}
        <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>
          <p style={{fontSize:8,fontWeight:600,color:"#475569",margin:"0 0 2px"}}>Firma Digitale *</p>
          <div ref={firmaBoxRef} style={{border:phase>=10?"1.5px solid #0ea5e9":"1.5px dashed #cbd5e1",borderRadius:10,flex:1,minHeight:30,display:"flex",alignItems:"center",justifyContent:"center",background:phase>=10?"#f0f9ff":"white",transition:"all 0.4s"}}>
            {phase>=10 ? (
              <svg width="100" height="20" viewBox="0 0 160 36"><path d="M8,26 Q22,6 42,20 Q62,34 82,12 Q102,0 128,20 Q142,30 154,16" stroke="#0ea5e9" strokeWidth="2.5" fill="none" strokeLinecap="round"/></svg>
            ) : (
              <span style={{fontSize:9,color:"#94a3b8"}}>✒ Tocca per firmare</span>
            )}
          </div>
        </div>
      </div>
      {/* Bottone in fondo */}
      <div style={{padding:"8px 12px",borderTop:"1px solid #e2e8f0",flexShrink:0}}>
        <button ref={confirmRef} style={{width:"100%",padding:"11px 0",borderRadius:12,border:"none",fontSize:11,fontWeight:700,color:"white",background:phase>=13?"#10b981":phase>=10?"linear-gradient(135deg,#0ea5e9,#0284c7)":"#e2e8f0",transition:"all 0.4s"}}>
          {phase>=13?"✓ Contratto Firmato — Proprietà Attiva!":"Firma e Attiva Proprietà →"}
        </button>
      </div>
    </div>
  );
}


/* ─── SCREEN: Come trovare iCal su Airbnb ─── */
function ScreenIcalAirbnb() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  // 0=Calendari, 1=hover annuncio, 2=click→calendario, 3=hover ⚙️
  // 4=click→impostazioni Prezzi, 5=hover Disponibilità, 6=click→Disponibilità scrolled
  // 7=hover "Esegui collegamento", 8=click→modal link, 9=hover Copia, 10=click copiato, 11=overlay
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,2200,4000,5800,7600,9200,11000,12800,14600,16400,18200,19200];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },22000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const annuncioRef = useRef(null);
  const settingsRef = useRef(null);
  const dispTabRef = useRef(null);
  const collegaRef = useRef(null);
  const copiaRef = useRef(null);

  const getRef = () => {
    if (phase <= 2) return annuncioRef;
    if (phase <= 4) return settingsRef;
    if (phase <= 6) return dispTabRef;
    if (phase <= 8) return collegaRef;
    if (phase <= 10) return copiaRef;
    return copiaRef;
  };
  const activeRef = getRef();
  const clicking = phase===2||phase===4||phase===6||phase===8||phase===10;

  /* Airbnb bottom navbar — esatta */
  const AirbnbNav = ({active}:{active:string}) => (
    <div style={{borderTop:"1px solid #ebebeb",display:"flex",justifyContent:"space-around",padding:"7px 0 4px",background:"white",flexShrink:0}}>
      {[
        {l:"Oggi",icon:"M5 3v18M3 5h4m-4 12h4m4-16v18m-2-16h4m-4 12h4m4-16v18m-2-16h4m-4 12h4",a:false},
        {l:"Calendario",icon:"M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",a:active==="cal"},
        {l:"Annunci",icon:"M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5",a:false},
        {l:"Messaggi",icon:"M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",a:false,badge:true},
        {l:"Menu",icon:"M4 6h16M4 12h16M4 18h16",a:false},
      ].map((t,i)=>(
        <div key={i} style={{textAlign:"center",position:"relative"}}>
          <svg viewBox="0 0 24 24" fill="none" stroke={t.a?"#FF385C":"#717171"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18,display:"block",margin:"0 auto"}}>
            <path d={t.icon}/>
          </svg>
          {t.badge&&<div style={{position:"absolute",top:-1,right:4,width:6,height:6,borderRadius:"50%",background:"#FF385C"}}/>}
          <span style={{fontSize:8,color:t.a?"#FF385C":"#717171",fontWeight:t.a?600:400}}>{t.l}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div ref={ref} style={{position:"relative",height:"100%"}}>
      {vis&&activeRef&&phase<11&&<SmartCursor targetRef={activeRef} clicking={clicking} visible={true}/>}
      <CompletionOverlay visible={phase>=11} message="Link iCal Copiato!" />
      <div style={{height:"100%"}}>
        <div style={{background:"white",height:"100%",display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {phase<=1 ? (
            /* ═══ SCREEN 1: Lista "Calendari" — fedele allo screenshot ═══ */
            <>
              <div style={{padding:"6px 14px 0",display:"flex",justifyContent:"flex-end"}}><span style={{fontSize:14,color:"#222"}}>🔍</span></div>
              <div style={{padding:"4px 14px 10px"}}><p style={{fontSize:18,fontWeight:800,color:"#222",margin:0}}>Calendari</p></div>
              <div style={{flex:1,padding:"0 10px",overflow:"hidden"}}>
                {[
                  {n:"Via del Corso 100 (Loft Panoramico)",img:"linear-gradient(135deg,#d4a574 0%,#c9956a 40%,#8b6914 100%)"},
                  {n:"Via dei Coronari 45 (Suite Navona)",img:"linear-gradient(135deg,#4a7c8f 0%,#2c5f73 40%,#1a3d4e 100%)"},
                  {n:"Via del Pellegrino 12 (Campo Fiori)",img:"linear-gradient(135deg,#7a6b5d 0%,#5c4e42 40%,#3d342c 100%)"},
                ].map((item,i)=>(
                  <div key={i} ref={i===0?annuncioRef:null} style={{
                    display:"flex",alignItems:"center",border:"1px solid #e5e5e5",borderRadius:14,padding:8,marginBottom:8,gap:10,
                    background:phase>=1&&i===0?"#f9f9f9":"white"
                  }}>
                    <div style={{width:52,height:52,borderRadius:8,background:item.img,flexShrink:0,position:"relative",overflow:"hidden"}}>
                      {/* Mini house interior icon */}
                      <svg viewBox="0 0 52 52" style={{width:"100%",height:"100%",position:"absolute",inset:0}}>
                        {/* Window */}
                        <rect x="8" y="10" width="16" height="14" rx="2" fill="rgba(255,255,255,0.25)"/>
                        <line x1="16" y1="10" x2="16" y2="24" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                        <line x1="8" y1="17" x2="24" y2="17" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                        {/* Lamp */}
                        <circle cx="38" cy="14" r="4" fill="rgba(255,255,255,0.2)"/>
                        <line x1="38" y1="8" x2="38" y2="10" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                        {/* Sofa */}
                        <rect x="6" y="32" width="40" height="12" rx="4" fill="rgba(255,255,255,0.15)"/>
                        <rect x="4" y="36" width="6" height="10" rx="3" fill="rgba(255,255,255,0.12)"/>
                        <rect x="42" y="36" width="6" height="10" rx="3" fill="rgba(255,255,255,0.12)"/>
                      </svg>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{fontSize:10,fontWeight:600,color:"#222",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.n}</p>
                      <p style={{fontSize:8,color:"#717171",margin:"2px 0 0"}}>Pubblicato</p>
                    </div>
                    {/* Mini calendar dots */}
                    <div style={{width:40,height:30,display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1}}>
                      {Array.from({length:21}).map((_,j)=>(
                        <div key={j} style={{width:3,height:3,borderRadius:"50%",background:j%5===0?"#222":j%3===0?"#bbb":"#ddd"}}/>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <AirbnbNav active="cal"/>
            </>
          ) : phase<=3 ? (
            /* ═══ SCREEN 2: Calendario annuncio ═══ */
            <>
              {/* Header con ← nome e icone SVG fedeli */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px 6px",flexShrink:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#222" strokeWidth="2" strokeLinecap="round" style={{width:16,height:16}}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  <span style={{fontSize:13,fontWeight:700,color:"#222"}}>Vicolo dell'Atle...</span>
                </div>
                <div style={{display:"flex",gap:12,alignItems:"center"}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#222" strokeWidth="1.8" strokeLinecap="round" style={{width:16,height:16}}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#222" strokeWidth="1.8" strokeLinecap="round" style={{width:16,height:16}}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                  <svg ref={settingsRef} viewBox="0 0 24 24" fill="none" stroke="#222" strokeWidth="1.8" strokeLinecap="round" style={{width:16,height:16,cursor:"pointer",background:phase>=3?"#f0f0f0":"transparent",borderRadius:4,padding:1}}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                </div>
              </div>
              {/* Giorni settimana */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",padding:"4px 6px 2px",textAlign:"center",fontSize:10,color:"#717171",fontWeight:500,flexShrink:0,borderBottom:"1px solid #ebebeb"}}>
                {["L","M","M","G","V","S","D"].map((d,i)=><div key={i} style={{padding:"2px 0"}}>{d}</div>)}
              </div>
              {/* Griglia calendario — Settembre (Lun 1, 30 giorni) */}
              <div style={{flex:1,padding:"0 2px",overflow:"hidden",display:"flex",flexDirection:"column"}}>
                {[[1,2,3,4,5,6,7],[8,9,10,11,12,13,14],[15,16,17,18,19,20,21],[22,23,24,25,26,27,28],[29,30,null,null,null,null,null]].map((w,wi)=>(
                  <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",flex:1,minHeight:0}}>
                    {w.map((d,di)=>{
                      const booked = d&&((d>=3&&d<=7)||(d>=8&&d<=12)||(d>=17&&d<=21)||(d>=24&&d<=27));
                      const isToday = d===22;
                      const bookStart = d===3||d===8||d===17||d===24;
                      const bookEnd = d===7||d===12||d===21||d===27;
                      return (
                        <div key={di} style={{position:"relative",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",paddingTop:"15%",overflow:"hidden"}}>
                          {d&&<span style={{fontSize:8,fontWeight:isToday?700:400,color:"#222",zIndex:2,position:"relative",lineHeight:1,
                            ...(isToday?{background:"#FF385C",color:"white",borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center"}:{})
                          }}>{d}</span>}
                          {!booked&&d&&(d===1||d===2)&&<span style={{fontSize:6,color:"#717171",marginTop:2,zIndex:2}}>107€</span>}
                          {!booked&&d&&(d===13||d===14)&&<span style={{fontSize:6,color:"#717171",marginTop:2,zIndex:2}}>130€</span>}
                          {!booked&&d&&(d===15||d===16)&&<span style={{fontSize:6,color:"#717171",marginTop:2,zIndex:2}}>145€</span>}
                          {!booked&&d&&(d===28)&&<span style={{fontSize:6,color:"#717171",marginTop:2,zIndex:2}}>160€</span>}
                          {booked&&<div style={{position:"absolute",left:bookStart?2:0,right:bookEnd?2:0,bottom:"15%",height:"42%",background:"#333",borderRadius:bookStart?"8px 0 0 8px":bookEnd?"0 8px 8px 0":"0",zIndex:1}}/>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <AirbnbNav active="cal"/>
            </>
          ) : phase<=7 ? (
            /* ═══ SCREEN 3+4: Impostazioni → Disponibilità → Collega calendari ═══ */
            <>
              <div style={{padding:"8px 12px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:"#f5f5f5",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>✕</div>
              </div>
              <div style={{padding:"0 14px"}}><p style={{fontSize:18,fontWeight:800,color:"#222",margin:0}}>Impostazioni</p></div>
              <p style={{fontSize:8,color:"#717171",padding:"4px 14px 8px",margin:0,lineHeight:1.5}}>Queste impostazioni si applicano a tutti i pernottamenti, a meno che non scelga di personalizzarle in base alle date.</p>
              {/* Tabs Prezzi / Disponibilità */}
              <div style={{display:"flex",padding:"0 14px",borderBottom:"1px solid #ebebeb",flexShrink:0}}>
                <div style={{padding:"8px 14px 6px",fontSize:11,fontWeight:phase>=6?400:600,color:phase>=6?"#717171":"#222",borderBottom:phase>=6?"none":"3px solid #222"}}>Prezzi</div>
                <div ref={dispTabRef} style={{padding:"8px 14px 6px",fontSize:11,fontWeight:phase>=6?600:400,color:phase>=6?"#222":"#717171",borderBottom:phase>=6?"3px solid #222":"none",cursor:"pointer"}}>Disponibilità</div>
              </div>
              <div style={{flex:1,padding:"10px 14px",overflow:"hidden"}}>
                {phase>=6 ? (
                  /* Tab Disponibilità — scrolled fino a Collega calendari */
                  <div>
                    <p style={{fontSize:9,color:"#717171",margin:"0 0 1px"}}>Tempo di preparazione</p>
                    <p style={{fontSize:11,fontWeight:600,color:"#222",margin:"0 0 8px"}}>Nessuno</p>
                    <div style={{height:1,background:"#ebebeb",margin:"0 0 8px"}}/>
                    <p style={{fontSize:9,color:"#717171",margin:"0 0 1px"}}>Finestra di disponibilità</p>
                    <p style={{fontSize:11,fontWeight:600,color:"#222",margin:"0 0 12px"}}>Date non disponibili</p>
                    <div style={{height:1,background:"#ebebeb",margin:"0 0 10px"}}/>
                    <p style={{fontSize:13,fontWeight:700,color:"#222",margin:"0 0 3px"}}>Collega i calendari</p>
                    <p style={{fontSize:8,color:"#717171",margin:"0 0 8px",lineHeight:1.5}}>Sincronizza tutti i tuoi calendari di host in modo che rimangano automaticamente aggiornati.</p>
                    <div ref={collegaRef} style={{border:"1px solid #e0e0e0",borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",gap:8,background:phase>=7?"#f7f7f7":"white",cursor:"pointer",marginBottom:8}}>
                      <span style={{fontSize:14}}>🔗</span>
                      <p style={{fontSize:10,fontWeight:500,color:"#222",margin:0,flex:1}}>Esegui il collegamento a un altro sito web</p>
                      <span style={{fontSize:12,color:"#717171"}}>›</span>
                    </div>
                    <div style={{border:"1px solid #e0e0e0",borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:14}}>🏠</span>
                      <p style={{fontSize:10,fontWeight:500,color:"#222",margin:0,flex:1}}>Collega più annunci Airbnb</p>
                      <span style={{fontSize:12,color:"#717171"}}>›</span>
                    </div>
                  </div>
                ) : (
                  /* Tab Prezzi */
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{fontSize:11,fontWeight:600,color:"#222"}}>Prezzo di base</span>
                      <span style={{fontSize:9,color:"#717171",textDecoration:"underline"}}>EUR</span>
                    </div>
                    <div style={{border:"1px solid #e0e0e0",borderRadius:12,padding:"12px 14px",marginTop:6}}>
                      <p style={{fontSize:8,color:"#717171",margin:"0 0 2px"}}>A notte</p>
                      <p style={{fontSize:22,fontWeight:700,color:"#222",margin:0}}>180 €</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ═══ SCREEN 5: Modal "Esegui il collegamento a un altro sito web" ═══ */
            <div style={{display:"flex",flexDirection:"column",height:"100%",background:"white",animation:"fadeIn 0.3s"}}>
              <div style={{padding:"14px 16px 0",display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexShrink:0}}>
                <p style={{fontSize:14,fontWeight:700,color:"#222",margin:0,lineHeight:1.3,maxWidth:"85%"}}>Esegui il collegamento a un altro sito web</p>
                <span style={{fontSize:14,color:"#222",cursor:"pointer"}}>✕</span>
              </div>
              <div style={{padding:"8px 16px 0",flexShrink:0}}>
                <p style={{fontSize:8,color:"#717171",margin:0,lineHeight:1.6}}>Questo collegamento bidirezionale permette di aggiornare entrambi i calendari quando viene prenotato un soggiorno. Se è la prima volta che lo fai, puoi trovare istruzioni dettagliate nel <span style={{textDecoration:"underline"}}>Centro Assistenza</span>.</p>
              </div>
              <div style={{flex:1,padding:"12px 16px",overflow:"hidden"}}>
                <p style={{fontSize:13,fontWeight:700,color:"#222",margin:"0 0 4px"}}>Passaggio 1</p>
                <p style={{fontSize:9,color:"#717171",margin:"0 0 8px"}}>Aggiungi questo link all'altro sito web.</p>
                <div style={{border:"1px solid #e0e0e0",borderRadius:16,padding:"12px 14px",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:8,color:"#717171",margin:"0 0 2px"}}>Link al calendario Airbnb</p>
                    <p style={{fontSize:10,fontWeight:500,color:"#222",margin:0,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>https://www.airbnb.co...</p>
                  </div>
                  <button ref={copiaRef} style={{background:phase>=10?"#16a34a":"#222",color:"white",border:"none",borderRadius:8,padding:"8px 18px",fontSize:10,fontWeight:700,flexShrink:0,cursor:"pointer",transition:"all 0.3s"}}>
                    {phase>=10?"✓":"Copia"}
                  </button>
                </div>
                <p style={{fontSize:13,fontWeight:700,color:"#222",margin:"16px 0 4px"}}>Passaggio 2</p>
                <p style={{fontSize:9,color:"#717171",margin:"0 0 8px",lineHeight:1.5}}>Ottieni un link che termina con .ics dall'altro sito web e aggiungilo qui di seguito.</p>
                <div style={{border:"1px solid #e0e0e0",borderRadius:12,overflow:"hidden"}}>
                  <div style={{padding:"12px 14px",borderBottom:"1px solid #e0e0e0"}}>
                    <p style={{fontSize:10,color:"#b0b0b0",margin:0}}>Link a un altro sito web</p>
                  </div>
                  <div style={{padding:"12px 14px"}}>
                    <p style={{fontSize:10,color:"#b0b0b0",margin:0}}>Nome del calendario</p>
                  </div>
                </div>
              </div>
              {/* Bottone grigio in fondo */}
              <div style={{padding:"8px 16px 10px",flexShrink:0}}>
                <button style={{width:"100%",padding:"12px",borderRadius:10,border:"none",background:"#e5e5e5",fontSize:11,fontWeight:600,color:"#b0b0b0"}}>Aggiungi calendario</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
/* ─── SCREEN: Come trovare iCal su Booking.com Extranet ─── */
function ScreenIcalBooking() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  /*
    0 = Extranet home — navbar Booking
    1 = Cursore su "Tariffe e disponibilità"
    2 = Click → menu dropdown appare
    3 = Cursore su "Sincronizza i calendari"
    4 = Click → pagina importa calendario (campo vuoto)
    5 = Pausa — vede la pagina
    6 = Cursore su "Prossimo passaggio"
    7 = Click → pagina esporta con link Booking
    8 = Pausa — vede il link
    9 = Cursore su "Copia link"
    10 = Click → link copiato
    11 = Overlay completamento
  */
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1200,2200,3000,3800,5000,6000,7000,8200,9200,10200,11000];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },14500);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const calRef = useRef(null);
  const syncRef = useRef(null);
  const nextRef = useRef(null);
  const copyRef = useRef(null);

  const activeRef = phase<=1?calRef:phase<=3?syncRef:phase<=6?nextRef:copyRef;
  const clicking = phase===2||phase===4||phase===7||phase===10;

  const showDropdown = phase>=2 && phase<4;
  const showImport = phase>=4 && phase<7;
  const showExport = phase>=7;

  return (
    <div ref={ref} style={{position:"relative",minHeight:380}}>
      <SmartCursor targetRef={activeRef} clicking={clicking} visible={vis&&phase>=1&&phase<11} />
      <CompletionOverlay visible={phase>=11} message="Link iCal Copiato!" />

      {/* ═══ EXTRANET HOME ═══ */}
      {!showImport && !showExport && (
        <div style={{display:"flex",flexDirection:"column"}}>
          {/* Top bar — nome struttura */}
          <div style={{background:"#003580",padding:"6px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:11,fontWeight:900,color:"white",letterSpacing:"-0.3px"}}>Booking.com</span>
              <span style={{fontSize:7,color:"rgba(255,255,255,0.7)",maxWidth:100,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>Vicolo di Monte del Gallo 24</span>
              <span style={{background:"rgba(255,255,255,0.15)",borderRadius:3,padding:"1px 4px",fontSize:7,color:"rgba(255,255,255,0.8)",fontFamily:"monospace"}}>13162705</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:8,color:"rgba(255,255,255,0.5)"}}>🔍</span>
              <div style={{width:14,height:10,borderRadius:1,overflow:"hidden",display:"flex"}}><div style={{flex:1,background:"#009246"}}/><div style={{flex:1,background:"white"}}/><div style={{flex:1,background:"#ce2b37"}}/></div>
              <span style={{fontSize:8,color:"rgba(255,255,255,0.5)"}}>❓</span>
            </div>
          </div>
          {/* Navbar icone — sfondo blu, icone SVG bianche come l'originale */}
          <div style={{background:"#003580",padding:"2px 4px 0",display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
            {[
              {label:"Home",badge:"1",active:false,
                svg:<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" style={{width:15,height:15}}><path d="m3 9 9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>},
              {label:"Tariffe e disp.",badge:"",active:true,hasArrow:true,
                svg:<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" style={{width:15,height:15}}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>},
              {label:"Promozioni",badge:"",active:false,hasArrow:true,
                svg:<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" style={{width:15,height:15}}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>},
              {label:"Prenotazioni",badge:"",active:false,
                svg:<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" style={{width:15,height:15}}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>},
              {label:"Struttura",badge:"1",active:false,hasArrow:true,
                svg:<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" style={{width:15,height:15}}><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>},
              {label:"Performance",badge:"24",active:false,hasArrow:true,
                svg:<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" style={{width:15,height:15}}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>},
              {label:"Messaggi",badge:"16",active:false,hasArrow:true,
                svg:<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" style={{width:15,height:15}}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>},
              {label:"Altro",badge:"",active:false,hasArrow:true,
                svg:<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" style={{width:15,height:15}}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>},
            ].map((item,i)=>(
              <div key={i} ref={item.label==="Tariffe e disp."?calRef:null} style={{
                display:"flex",flexDirection:"column",alignItems:"center",padding:"5px 2px 5px",
                borderBottom:item.active?"3px solid white":"3px solid transparent",
                cursor:"pointer",position:"relative",flex:"1 1 0",minWidth:0
              }}>
                <div style={{position:"relative",marginBottom:2}}>
                  {item.svg}
                  {item.badge&&<div style={{position:"absolute",top:-5,right:-7,background:"#c62828",color:"white",fontSize:5,fontWeight:800,borderRadius:6,padding:"0 2.5px",minWidth:9,textAlign:"center",lineHeight:"10px"}}>{item.badge}</div>}
                </div>
                <span style={{fontSize:5.5,fontWeight:item.active?700:400,color:"white",whiteSpace:"nowrap",textAlign:"center",opacity:item.active?1:0.75}}>{item.label}{item.hasArrow?" ▾":""}</span>
              </div>
            ))}
          </div>

          {/* Dropdown menu */}
          {showDropdown && (
            <div style={{position:"relative",zIndex:20}}>
              <div style={{position:"absolute",left:40,top:0,background:"white",border:"1px solid #e2e8f0",borderRadius:4,boxShadow:"0 4px 16px rgba(0,0,0,0.15)",padding:2,minWidth:160,animation:"fadeIn 0.15s"}}>
                <div style={{padding:"6px 10px",fontSize:9,color:"#333",cursor:"pointer"}}>Calendario</div>
                <div ref={syncRef} style={{padding:"6px 10px",fontSize:9,color:"#003580",fontWeight:700,background:"#e3f2fd",borderRadius:2,cursor:"pointer"}}>Sincronizza i calendari</div>
                <div style={{padding:"6px 10px",fontSize:9,color:"#333",cursor:"pointer"}}>Piani tariffari</div>
                <div style={{padding:"6px 10px",fontSize:9,color:"#333",cursor:"pointer"}}>Tariffe per dispositivi mobili</div>
              </div>
            </div>
          )}

          {/* Contenuto Extranet Home */}
          <div style={{padding:12}}>
            <p style={{fontSize:10,fontWeight:700,color:"#333",margin:"0 0 3px"}}>Camera privata Roma <span style={{background:"#e8f5e9",color:"#2e7d32",fontSize:7,padding:"1px 5px",borderRadius:3,fontWeight:600}}>Aperto / Prenotabile</span></p>
            <div style={{background:"#fafafa",border:"1px solid #e0e0e0",borderRadius:6,padding:10,marginTop:8}}>
              <p style={{fontSize:9,fontWeight:600,color:"#333",margin:"0 0 6px"}}>Impostazioni di base (hai completato 1 su 7 azioni)</p>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {["Sincronizza la tua disponibilità sui vari siti","Aggiungi foto efficaci della tua struttura","Aggiungi i servizi e le dotazioni"].map((t,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:5,fontSize:8,color:"#555"}}>
                    <span style={{fontSize:9}}>{i===0?"📊":i===1?"📸":"🏠"}</span><span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PAGINA IMPORTA CALENDARIO — campo vuoto, si può saltare ═══ */}
      {showImport && (
        <div style={{display:"flex",flexDirection:"column",animation:"fadeIn 0.3s"}}>
          <div style={{background:"#003580",padding:"8px 14px",display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:12,fontWeight:900,color:"white"}}>Booking.com</span>
            <span style={{fontSize:8,color:"rgba(255,255,255,0.6)"}}>› Sincronizza calendari › Aggiungi</span>
          </div>
          <div style={{padding:14,background:"#f5f5f5"}}>
            <p style={{fontSize:11,fontWeight:700,color:"#333",margin:"0 0 2px"}}>❶ Importa calendario</p>
            <p style={{fontSize:8,color:"#666",margin:"0 0 10px"}}>Se vuoi importare un calendario esterno, incolla qui il link iCal. Altrimenti puoi andare avanti per esportare il link di Booking.</p>
            <div style={{background:"white",border:"1px solid #e0e0e0",borderRadius:6,padding:10,marginBottom:10}}>
              <div style={{marginBottom:8}}>
                <p style={{fontSize:8,fontWeight:600,color:"#555",margin:"0 0 3px"}}>Copia e incolla qui sotto il link al calendario</p>
                <div style={{background:"#fafafa",border:"1px solid #ccc",borderRadius:4,padding:"6px 8px",fontSize:8,color:"#bbb",fontFamily:"monospace"}}>
                  Per es.: https://www.airbnb.com/calendar/ical/...
                </div>
              </div>
              <div style={{marginBottom:8}}>
                <p style={{fontSize:8,fontWeight:600,color:"#555",margin:"0 0 3px"}}>Nome del calendario</p>
                <div style={{background:"#fafafa",border:"1px solid #ccc",borderRadius:4,padding:"6px 8px",fontSize:8,color:"#bbb"}}>
                  Per es.: Airbnb
                </div>
              </div>
              <div style={{background:"#fff8e1",border:"1px solid #ffe082",borderRadius:4,padding:"5px 8px",marginBottom:8}}>
                <p style={{fontSize:7,color:"#f57f17",margin:0}}>💡 Puoi lasciare il campo vuoto e cliccare "Prossimo passaggio" per passare direttamente all'esportazione del link Booking.</p>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button ref={nextRef} style={{background:"#003580",color:"white",border:"none",borderRadius:4,padding:"6px 14px",fontSize:9,fontWeight:600,cursor:"pointer"}}>
                  Prossimo passaggio
                </button>
                <button style={{background:"white",color:"#333",border:"1px solid #ccc",borderRadius:4,padding:"6px 14px",fontSize:9,cursor:"pointer"}}>Annulla</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PAGINA ESPORTA — COPIA LINK ═══ */}
      {showExport && (
        <div style={{display:"flex",flexDirection:"column",animation:"fadeIn 0.3s"}}>
          <div style={{background:"#003580",padding:"8px 14px",display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:12,fontWeight:900,color:"white"}}>Booking.com</span>
            <span style={{fontSize:8,color:"rgba(255,255,255,0.6)"}}>› Esporta calendario</span>
          </div>
          <div style={{padding:14,background:"#f5f5f5"}}>
            <p style={{fontSize:11,fontWeight:700,color:"#333",margin:"0 0 2px"}}>❷ Esporta calendario</p>
            <p style={{fontSize:8,color:"#666",margin:"0 0 10px"}}>Copia il link iCal qui sotto e incollalo su CleaningApp nella sezione Proprietà → Impostazioni → Link Calendario.</p>
            <div style={{background:"white",border:"1px solid #e0e0e0",borderRadius:6,padding:10}}>
              <p style={{fontSize:8,fontWeight:600,color:"#555",margin:"0 0 3px"}}>Il link al tuo calendario Booking.com</p>
              <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:8}}>
                <div style={{flex:1,background:"#fafafa",border:"1px solid #ccc",borderRadius:4,padding:"6px 8px",fontSize:7,color:"#333",fontFamily:"monospace",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
                  https://ical.booking.com/v1/export?t=f3f52f96-6b69-4ac3-b373...
                </div>
                <button ref={copyRef} style={{background:phase>=10?"#2e7d32":"#003580",color:"white",border:"none",borderRadius:4,padding:"6px 12px",fontSize:8,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",transition:"all 0.3s"}}>
                  {phase>=10?"✓ Copiato!":"Copia link"}
                </button>
              </div>
              {phase>=10 && (
                <div style={{background:"#ecfdf5",border:"1px solid #a7f3d0",borderRadius:4,padding:6,animation:"fadeIn 0.3s"}}>
                  <p style={{fontSize:7,fontWeight:600,color:"#065f46",margin:0}}>✅ Link copiato! Ora vai su CleaningApp → Proprietà → Impostazioni → incolla nel campo Booking.com → premi Salva e Sincronizza.</p>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:6,marginTop:10}}>
              <button style={{background:phase>=10?"#2e7d32":"#ccc",color:"white",border:"none",borderRadius:4,padding:"6px 14px",fontSize:9,fontWeight:600,cursor:"pointer",transition:"all 0.3s"}}>Fatto</button>
              <button style={{background:"white",color:"#333",border:"1px solid #ccc",borderRadius:4,padding:"6px 14px",fontSize:9,cursor:"pointer"}}>Annulla</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── SCREEN: Pagamenti in Sospeso ─── */
function ScreenPagamenti() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1500,3000,4500,6000,7500,8500];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },12000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  return (
    <div ref={ref} style={{position:"relative"}}>
      <CompletionOverlay visible={phase>=7} message="Pagamento Registrato!" />
      <AppScreen>
        <div className="p-4" style={{position:"relative"}}>
          {/* Header modal pagamento */}
          <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-2xl p-4 text-center text-white mb-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h3 className="font-bold text-base">Pagamenti scaduti!</h3>
            <p className="text-white/80 text-xs mt-0.5">Hai 1 pagamento scaduto</p>
          </div>
          <p className="text-sm text-slate-600 text-center mb-3">Ciao <b>Mario</b>, hai pagamenti da saldare:</p>
          {/* Debiti */}
          <div className="space-y-2 mb-3">
            <div className={`flex justify-between items-center py-2 px-3 rounded-xl border transition-all ${phase>=2?"border-red-200 bg-red-50":"border-slate-200 bg-white"}`}>
              <div className="flex items-center gap-2">
                <span>🔴</span>
                <div>
                  <span className="text-slate-700 font-medium text-sm">Febbraio 2026</span>
                  <span className="block text-xs text-red-600 font-medium">Scaduto da 15 giorni</span>
                </div>
              </div>
              <span className="font-bold text-base text-red-600">€ 380,00</span>
            </div>
            {phase>=3 && (
              <div className="flex justify-between items-center py-2 px-3 rounded-xl border border-amber-200 bg-amber-50" style={{animation:"fadeIn 0.3s"}}>
                <div className="flex items-center gap-2">
                  <span>🟡</span>
                  <div>
                    <span className="text-slate-700 font-medium text-sm">Marzo 2026</span>
                    <span className="block text-xs text-amber-600">Scade tra 5 giorni</span>
                  </div>
                </div>
                <span className="font-bold text-base text-amber-600">€ 245,00</span>
              </div>
            )}
          </div>
          {/* Totale */}
          <div className={`rounded-xl p-3 text-center mb-3 border-2 transition-all ${phase>=4?"bg-gradient-to-br from-red-50 to-red-100 border-red-200":"bg-slate-50 border-slate-200"}`}>
            <p className="text-xs text-slate-500 mb-0.5 uppercase tracking-wider font-medium">Totale da pagare</p>
            <p className={`text-2xl font-bold ${phase>=4?"text-red-600":"text-slate-800"}`}>€ {phase>=3?"625,00":"380,00"}</p>
          </div>
          {/* Buttons */}
          <button className={`w-full py-2.5 rounded-xl text-center font-semibold text-sm transition-all ${phase>=5?"bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg":"bg-slate-200 text-slate-500"}`}>
            {phase>=6?"✓ Pagamento Registrato":"Vai ai Pagamenti"}
          </button>
          <button className="w-full py-2 text-slate-500 text-xs font-medium mt-1.5 text-center">Ricordamelo dopo</button>
        </div>
      </AppScreen>
    </div>
  );
}

/* ─── SCREEN: Assistente AI ─── */
function ScreenAssistente() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1200,2400,3600,5000,6400,8000,9200,10400,11200];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },14500);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const suggestions = ["Prossime pulizie","Quanto devo pagare?","Inserisci nuova pulizia","Prossimi ospiti"];
  const typing = phase>=3 && phase<5;
  const msgSent = phase>=4;
  const botTyping = phase>=5 && phase<7;
  const botReply = phase>=7;
  const secondQ = phase>=8;
  const botReply2 = phase>=9;

  return (
    <div ref={ref} style={{position:"relative"}}>
      <CompletionOverlay visible={phase>=10} message="Chat completata!" />
      <AppScreen>
        <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#f8fafc"}}>
          {/* Header */}
          <div style={{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",padding:"10px 14px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Icons.bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <p style={{fontSize:11,fontWeight:700,color:"white",margin:0}}>Assistente AI</p>
              <p style={{fontSize:8,color:"rgba(255,255,255,0.7)",margin:0}}>Online — risposte in tempo reale</p>
            </div>
          </div>
          {/* Chat area */}
          <div style={{flex:1,padding:10,overflowY:"hidden",display:"flex",flexDirection:"column",gap:6}}>
            {/* Suggerimenti */}
            {phase<=2 && (
              <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>
                {suggestions.map((s,i)=>(
                  <div key={i} style={{
                    background:phase>=2&&i===0?"#6366f1":"white", color:phase>=2&&i===0?"white":"#6366f1",
                    border:"1px solid #c7d2fe", borderRadius:14, padding:"4px 10px",
                    fontSize:9, fontWeight:600, transition:"all 0.3s"
                  }}>{s}</div>
                ))}
              </div>
            )}
            {/* User message */}
            {msgSent && (
              <div style={{alignSelf:"flex-end",maxWidth:"75%",animation:"fadeIn 0.3s"}}>
                <div style={{background:"#6366f1",color:"white",borderRadius:"14px 14px 4px 14px",padding:"8px 12px",fontSize:10,fontWeight:500}}>
                  Prossime pulizie
                </div>
              </div>
            )}
            {/* Bot typing */}
            {botTyping && !botReply && (
              <div style={{alignSelf:"flex-start",display:"flex",alignItems:"center",gap:6,animation:"fadeIn 0.3s"}}>
                <div style={{width:22,height:22,borderRadius:"50%",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <Icons.bot className="w-3 h-3 text-white" />
                </div>
                <div style={{background:"white",borderRadius:"14px 14px 14px 4px",padding:"8px 12px",border:"1px solid #e2e8f0"}}>
                  <div style={{display:"flex",gap:3}}>
                    {[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:"50%",background:"#94a3b8",animation:`aiBounce 1s ${i*0.15}s infinite`}}/>)}
                  </div>
                </div>
              </div>
            )}
            {/* Bot reply */}
            {botReply && (
              <div style={{alignSelf:"flex-start",display:"flex",alignItems:"flex-start",gap:6,maxWidth:"85%",animation:"fadeIn 0.3s"}}>
                <div style={{width:22,height:22,borderRadius:"50%",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
                  <Icons.bot className="w-3 h-3 text-white" />
                </div>
                <div style={{background:"white",borderRadius:"14px 14px 14px 4px",padding:"8px 12px",border:"1px solid #e2e8f0",fontSize:9,color:"#334155",lineHeight:1.5}}>
                  Hai <b>2 pulizie</b> in programma:<br/>
                  • <b>Domani 10:00</b> — Apt. Colosseo (3 ospiti)<br/>
                  • <b>Ven 12:00</b> — Apt. Trastevere (2 ospiti)
                </div>
              </div>
            )}
            {/* Second question */}
            {secondQ && (
              <div style={{alignSelf:"flex-end",maxWidth:"75%",animation:"fadeIn 0.3s"}}>
                <div style={{background:"#6366f1",color:"white",borderRadius:"14px 14px 4px 14px",padding:"8px 12px",fontSize:10,fontWeight:500}}>
                  Quanto devo pagare?
                </div>
              </div>
            )}
            {/* Bot reply 2 */}
            {botReply2 && (
              <div style={{alignSelf:"flex-start",display:"flex",alignItems:"flex-start",gap:6,maxWidth:"85%",animation:"fadeIn 0.3s"}}>
                <div style={{width:22,height:22,borderRadius:"50%",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
                  <Icons.bot className="w-3 h-3 text-white" />
                </div>
                <div style={{background:"white",borderRadius:"14px 14px 14px 4px",padding:"8px 12px",border:"1px solid #e2e8f0",fontSize:9,color:"#334155",lineHeight:1.5}}>
                  Il saldo di <b>Marzo 2026</b> è:<br/>
                  • Pulizie: <b>€ 180,00</b><br/>
                  • Biancheria: <b>€ 65,00</b><br/>
                  Totale: <b>€ 245,00</b> — scadenza 10/04
                </div>
              </div>
            )}
          </div>
          {/* Input area */}
          <div style={{padding:"8px 10px",borderTop:"1px solid #e2e8f0",background:"white",display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
            <div style={{flex:1,background:"#f1f5f9",borderRadius:16,padding:"7px 12px",fontSize:10,color:typing?"#334155":"#94a3b8"}}>
              {typing?"Prossime pulizie":"Scrivi un messaggio..."}
              {typing && <span style={{animation:"blink 0.8s infinite",color:"#6366f1"}}>|</span>}
            </div>
            <div style={{width:28,height:28,borderRadius:"50%",background:typing||msgSent?"#6366f1":"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.3s"}}>
              <Icons.send className="w-3.5 h-3.5" style={{color:typing||msgSent?"white":"#94a3b8"}} />
            </div>
          </div>
        </div>
      </AppScreen>
    </div>
  );
}

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

/* Wrapper per screen dentro PhoneFrame — NO scroll utente, NO status bar propria */
function DemoPhone({ children, fixedH = 580 }) {
  return (
    <div className="w-full max-w-[380px] mx-auto select-none demophone-root">
      {/* Override: rimuovi bordi/shadow/rounded e cornici interne dalle screen figlie */}
      <style>{`
        .demophone-root .demophone-content > div > div.rounded-3xl,
        .demophone-root .demophone-content > div > div > div.rounded-3xl {
          border-radius: 0 !important;
          box-shadow: none !important;
          border: none !important;
        }
        .demophone-root .demophone-content .bg-slate-800.rounded-\\[22px\\] {
          background: transparent !important;
          border-radius: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .demophone-root .demophone-content .bg-white.rounded-\\[18px\\] {
          border-radius: 0 !important;
        }
        .demophone-root .demophone-content .bg-slate-900.text-white.px-4.py-1\\.5 {
          display: none !important;
        }
        .demophone-root .demophone-content {
          display: flex !important;
          flex-direction: column !important;
        }
        .demophone-root .demophone-content > * {
          flex: 1 !important;
          min-height: 0 !important;
        }
        .demophone-root .demophone-content > * > .bg-white {
          height: 100% !important;
          display: flex !important;
          flex-direction: column !important;
        }
      `}</style>
      <div style={{
        background:"linear-gradient(145deg, #334155 0%, #1e293b 100%)",
        borderRadius:28, padding:"6px 5px 8px",
        boxShadow:"0 20px 50px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.08)",
        position:"relative"
      }}>
        {/* Dynamic Island */}
        <div style={{width:72,height:18,background:"#1e293b",borderRadius:10,margin:"0 auto 4px",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#0f172a",border:"0.5px solid #334155"}}/>
          <div style={{width:32,height:4,borderRadius:2,background:"#0f172a",border:"0.5px solid #334155"}}/>
        </div>
        {/* Schermo — altezza fissa, NO scroll, con status bar unica */}
        <div style={{
          borderRadius:16, overflow:"hidden", background:"white",
          boxShadow:"inset 0 0 0 0.5px rgba(255,255,255,0.06)",
          height: fixedH,
          display:"flex", flexDirection:"column"
        }}>
          {/* Status bar unica del DemoPhone */}
          <div style={{background:"#0f172a",color:"white",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 14px",fontSize:9,fontWeight:600,flexShrink:0}}>
            <span>9:41</span>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              <svg width="12" height="9" viewBox="0 0 14 10" fill="white"><rect x="0" y="6" width="2" height="4" rx="0.5" opacity="0.4"/><rect x="3" y="4" width="2" height="6" rx="0.5" opacity="0.6"/><rect x="6" y="2" width="2" height="8" rx="0.5" opacity="0.8"/><rect x="9" y="0" width="2" height="10" rx="0.5"/></svg>
              <div style={{width:18,height:9,border:"1px solid rgba(255,255,255,0.5)",borderRadius:2,display:"flex",alignItems:"center",padding:"1px"}}>
                <div style={{flex:1,height:"100%",background:"#4ade80",borderRadius:1}}/>
              </div>
            </div>
          </div>
          {/* Contenuto — overflow HIDDEN */}
          <div className="demophone-content" style={{flex:1,overflow:"hidden",position:"relative"}}>
            {children}
          </div>
        </div>
        {/* Side buttons */}
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
  { id:"pagamenti", title:"Pagamenti", icon:"💰", color:"#EF4444" },
  { id:"assistente", title:"Assistente AI", icon:"🤖", color:"#6366F1" },
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
        .contract-scroll::-webkit-scrollbar { display: none; }
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
        <DemoPhone fixedH={420}>
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
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Telefono</b> — Il numero di cellulare per le notifiche sul telefono e il contatto diretto.</p>
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
        <DemoPhone fixedH={610}>
          <ScreenContratto />
        </DemoPhone>
        <div style={{maxWidth:520,margin:"24px auto 16px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Il contratto quadro regola i termini del servizio. Ecco i passaggi:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>📄</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Leggi il contratto fino alla fine</b> — Scorri il testo del contratto fino in fondo. Quando arrivi alla fine, apparirà un segno di spunta verde che conferma la lettura completa.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>☑️</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Accetta termini e privacy</b> — Spunta le due caselle: una per accettare i termini e condizioni del contratto, l'altra per accettare l'informativa sulla privacy (GDPR 679/2016).</p>
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
        <DemoPhone fixedH={530}>
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
          Riceverai una <b>notifica sul telefono</b> e una <b>email</b> appena l'amministratore approva il tuo account dopo aver verificato la firma del contratto quadro. L'email conterrà anche una copia del contratto quadro firmato. A quel punto potrai accedere a tutte le funzionalità della piattaforma e iniziare ad aggiungere le tue proprietà.
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
          Dal pannello Proprietario, vai nella sezione "Proprietà". Quando non hai ancora nessuna struttura, vedrai una pagina vuota con l'indicazione di cliccare il pulsante + in alto a destra. Si aprirà una procedura guidata in 6 passaggi.
        </TipBox>

        {/* Step 0: Pagina vuota → Click + → Modal */}
        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#a78bfa",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>COME INIZIARE · Apri la finestra di creazione</span>
          </div>
          <DemoPhone fixedH={480}>
            <ScreenStep0 />
          </DemoPhone>
        </FadeUp>
        <div style={{maxWidth:520,margin:"0 auto 48px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Per aggiungere la tua prima proprietà:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>1️⃣</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Vai nella sezione <b>Proprietà</b> dal menu del tuo pannello proprietario.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>2️⃣</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Tocca il pulsante <b>+</b> in alto a destra della pagina.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>3️⃣</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Si aprirà la finestra <b>"Richiedi Nuova Proprietà"</b> con una procedura guidata di 6 passaggi che ti accompagnerà nella configurazione completa.</p>
            </div>
          </div>
        </div>

        {/* Step 1: Info Base */}
        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#8B5CF6",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>STEP 1 di 6 · Informazioni Base</span>
          </div>
          <DemoPhone fixedH={510}>
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
          <DemoPhone fixedH={460}>
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
          <DemoPhone fixedH={370}>
            <ScreenStep3 />
          </DemoPhone>
        </FadeUp>
        <div style={{maxWidth:520,margin:"0 auto 48px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Imposta gli <b>orari di uscita (check-out) e arrivo (check-in) degli ospiti</b> della proprietà. Il tempo tra i due è la finestra operativa per preparare la casa.
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>💡</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Consiglio pratico</b> — Ti consigliamo di lasciare almeno 5 ore tra l'uscita e l'arrivo. Ospiti che escono in ritardo, un danno da riparare, una macchia ostinata da trattare: gli imprevisti capitano sempre nel momento peggiore. Con una finestra ampia, si risolve tutto senza correre e i nuovi ospiti trovano la casa impeccabile.</p>
            </div>
          </div>
          <div style={{background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:12,padding:"12px 16px"}}>
            <p style={{fontSize:13,color:"#9A3412",margin:0,lineHeight:1.6}}>
              <b>⚠️ Finestra ridotta?</b> Con meno di 3 ore a disposizione, in caso di imprevisti potrebbe essere difficile completare il servizio in tempo. Ti consigliamo di valutare se è possibile allargare la finestra per garantire sempre un risultato ottimale.
            </p>
          </div>
        </div>

        {/* Step 4: Stanze e Letti */}
        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#5B21B6",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>STEP 4 di 6 · Stanze e Letti</span>
          </div>
          <DemoPhone fixedH={670}>
            <ScreenStep4 />
          </DemoPhone>
        </FadeUp>
        <div style={{maxWidth:520,margin:"0 auto 48px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Indica <b>tutte le stanze e i letti presenti</b> nella proprietà. Queste informazioni servono al sistema per proporti automaticamente le dotazioni di biancheria nello step successivo.
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>➕</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Aggiungi stanze</b> — Tocca "Aggiungi Stanza" e scegli il tipo: Camera Matrimoniale, Camera Singola, Camera Doppia, Soggiorno, etc.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🛏️</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Configura i letti</b> — Per ogni stanza, espandi e aggiungi i letti presenti: Matrimoniale, Singolo, Divano Letto o Castello.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>✅</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Posti letto totali</b> — Il contatore in alto mostra i posti letto totali. Devono essere almeno pari al numero di ospiti massimi impostato nel Passaggio 2.</p>
            </div>
          </div>
          <div style={{background:"#F5F3FF",border:"1px solid #DDD6FE",borderRadius:12,padding:"12px 16px"}}>
            <p style={{fontSize:13,color:"#5B21B6",margin:0,lineHeight:1.6}}>
              <b>🔗 Questo passaggio è collegato al successivo.</b> I letti che inserisci qui compariranno nel Passaggio 5, dove potrai decidere quali preparare in base al numero di ospiti.
            </p>
          </div>
        </div>

        {/* Step 5: Dotazioni Biancheria */}
        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#4C1D95",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>STEP 5 di 6 · Dotazioni Biancheria per Ospiti</span>
          </div>
          <DemoPhone fixedH={900}>
            <ScreenStep5 />
          </DemoPhone>
        </FadeUp>
        <div style={{maxWidth:520,margin:"0 auto 48px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Ora configura <b>cosa preparare in base al numero di ospiti</b>. Prima di tutto, scegli come gestire la biancheria:
          </p>

          {/* Box scelta biancheria nostra vs propria */}
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
            <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:12,padding:"14px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <span style={{fontSize:20}}>🧺</span>
                <p style={{fontSize:14,fontWeight:700,color:"#0c4a6e",margin:0}}>Opzione 1: Biancheria fornita da noi <span style={{fontSize:11,fontWeight:600,color:"#0284c7",background:"#e0f2fe",padding:"2px 8px",borderRadius:8,marginLeft:6}}>consigliata</span></p>
              </div>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>
                Ad ogni pulizia, un rider consegnerà lenzuola, federe e asciugamani puliti direttamente alla proprietà. Il sistema calcola automaticamente cosa serve in base agli ospiti.
              </p>
            </div>
            <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:12,padding:"14px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <span style={{fontSize:20}}>🏠</span>
                <p style={{fontSize:14,fontWeight:700,color:"#78350f",margin:0}}>Opzione 2: Biancheria propria</p>
              </div>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>
                Usi la tua biancheria personale. La pulizia viene eseguita normalmente ma senza consegna. Dovrai assicurarti di avere tutto il necessario disponibile in casa.
              </p>
            </div>
          </div>

          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Poi, per ogni possibile numero di ospiti, indica <b>quali letti preparare</b>:
          </p>

          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>👥</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Esempio: 2 ospiti</b> → selezioni solo il letto matrimoniale. Il sistema propone in automatico la dotazione base (lenzuola, federe, asciugamani).</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>👥</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Esempio: 3 ospiti</b> → selezioni il matrimoniale + un singolo. La dotazione si aggiorna di conseguenza.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>✏️</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Tutto personalizzabile</b> — Le quantità proposte sono un punto di partenza. Puoi modificare ogni singolo articolo per adattarlo alle tue esigenze.</p>
            </div>
          </div>
          <div style={{background:"#ECFDF5",border:"1px solid #A7F3D0",borderRadius:12,padding:"12px 16px"}}>
            <p style={{fontSize:13,color:"#065F46",margin:0,lineHeight:1.6}}>
              <b>In sintesi:</b> quando crei una pulizia e indichi il numero di ospiti, il sistema sa già quali letti preparare e quale biancheria portare. Configura una volta, poi è tutto automatico.
            </p>
          </div>
        </div>

        {/* Step 6: Foto e Invio */}
        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#3B0764",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>STEP 6 di 6 · Foto e Invio</span>
          </div>
          <DemoPhone fixedH={400}>
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
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Foto</b> — Carica una foto della proprietà (JPG o PNG, max 10MB). Questa foto verrà mostrata nelle liste e nelle schede delle pulizie.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>📤</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Crea Proprietà</b> — Clicca il bottone finale e la proprietà verrà inviata all'amministratore per l'approvazione.</p>
            </div>
          </div>
        </div>

        <TipBox icon="⏱️" title="Cosa succede dopo?" color="#8B5CF6">
          La proprietà rimane "in attesa di approvazione" finché l'amministratore non la verifica e definisce il prezzo del servizio. Una volta approvata, riceverai una <b>notifica sul telefono e un'email</b> con il prezzo concordato. A quel punto dovrai firmare l'<b>Allegato D</b> (Scheda Servizio Proprietà) che troverai nella sezione Proprietà. Solo dopo la firma dell'Allegato D la proprietà sarà attiva e potrai iniziare a creare pulizie e richiedere biancheria.
        </TipBox>

        {/* Firma Allegato D — animazione */}
        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#D97706",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>DOPO L'APPROVAZIONE · Firma Allegato D</span>
          </div>
          <DemoPhone fixedH={470}>
            <ScreenAllegatoD />
          </DemoPhone>
        </FadeUp>
        <div style={{maxWidth:520,margin:"0 auto 32px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Dopo che l'amministratore approva la proprietà e definisce il prezzo, nella sezione <b>Proprietà</b> vedrai un bottone <b>"Firma ora"</b> arancione. Ecco i passaggi:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🔔</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Notifica</b> — Ricevi una notifica sul telefono e un'email con il prezzo concordato per la proprietà.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>✍️</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Firma Allegato D</b> — Tocca "Firma ora" sulla scheda della proprietà. Si apre la finestra con il contratto specifico che include il prezzo concordato.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>☑️</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Accetta termini e prezzo</b> — Spunta le caselle di accettazione, inserisci nome, codice fiscale e firma digitale.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>✅</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Proprietà Online</b> — Dal momento della firma, la proprietà è attiva e puoi creare pulizie e richiedere biancheria.</p>
            </div>
          </div>
        </div>
      </GuidaSection>

      {/* ═══ SEZ 6: iCAL ═══ */}
      <SectionDivider number={6} color="#10B981" />
      <GuidaSection id="ical" bg="linear-gradient(180deg, #ecfdf5 0%, #fafbfc 100%)">
        <SectionHeader
          title="Collega i Calendari iCal"
          subtitle="Collega Airbnb, Booking.com, VRBO e altre piattaforme per sincronizzare automaticamente le prenotazioni e creare pulizie in automatico."
          color="#10B981"
          icon="🔗"
        />
        <DemoPhone fixedH={500}>
          <ScreenIcal />
        </DemoPhone>
        <div style={{maxWidth:520,margin:"24px auto 16px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 16px"}}>
            Per collegare i calendari iCal alla tua proprietà, segui questi passaggi:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{background:"#10b981",color:"white",fontSize:10,fontWeight:800,width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>1</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Apri il menu <b>Proprietà</b> in basso.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{background:"#10b981",color:"white",fontSize:10,fontWeight:800,width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>2</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Clicca sulla <b>proprietà</b> che vuoi configurare.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{background:"#10b981",color:"white",fontSize:10,fontWeight:800,width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>3</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Seleziona la sezione <b>Impostazioni</b>.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{background:"#10b981",color:"white",fontSize:10,fontWeight:800,width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>4</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Nella sezione <b>Sincronizzazione Calendario</b>, clicca su <b>"Configura Link"</b>.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{background:"#10b981",color:"white",fontSize:10,fontWeight:800,width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>5</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Clicca sulla piattaforma che vuoi collegare (es. <b>Airbnb</b>).</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{background:"#10b981",color:"white",fontSize:10,fontWeight:800,width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>6</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Incolla il <b>link iCal</b> che hai copiato dalla piattaforma e premi <b>"Salva Link"</b>.</p>
            </div>
          </div>
        </div>

        <div style={{height:32}}/>

        {/* Guide animate: come trovare iCal su Airbnb e Booking */}
        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#FF5A5F",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>GUIDA · Come trovare il link iCal su Airbnb</span>
          </div>
          <p style={{fontSize:12,color:"#64748b",margin:"0 auto 12px",maxWidth:520,padding:"0 4px",lineHeight:1.6,fontStyle:"italic",textAlign:"center"}}>📱 Puoi farlo sia da <b>telefono</b> che da <b>PC</b> — l'esempio qui sotto è da app mobile.</p>
          <DemoPhone fixedH={540}>
            <ScreenIcalAirbnb />
          </DemoPhone>
        </FadeUp>
        <div style={{maxWidth:520,margin:"0 auto 40px",padding:"0 4px"}}>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{background:"#FF5A5F",color:"white",fontSize:10,fontWeight:800,width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>1</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Apri l'app Airbnb e vai nella sezione <b>Calendario</b> dal menu in basso.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{background:"#FF5A5F",color:"white",fontSize:10,fontWeight:800,width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>2</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Seleziona l'annuncio e tocca l'icona <b>⚙️ Impostazioni</b> in alto a destra.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{background:"#FF5A5F",color:"white",fontSize:10,fontWeight:800,width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>3</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Vai su <b>Disponibilità</b> → <b>Collega i calendari</b> → <b>Esegui il collegamento</b>.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{background:"#FF5A5F",color:"white",fontSize:10,fontWeight:800,width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>4</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Copia il <b>link al calendario Airbnb</b> (inizia con <code style={{background:"#f1f5f9",padding:"1px 4px",borderRadius:4,fontSize:11}}>https://www.airbnb.it/calendar/ical/...</code>). Vai su CleaningApp → <b>Proprietà</b> → apri la scheda della proprietà → sezione <b>Link Calendario</b> → incolla il link nel campo <b>Airbnb</b> e premi <b>Salva e Sincronizza</b>.</p>
            </div>
          </div>
        </div>

        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#003580",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>GUIDA · Come trovare il link iCal su Booking.com</span>
          </div>
          <p style={{fontSize:12,color:"#64748b",margin:"0 auto 12px",maxWidth:520,padding:"0 4px",lineHeight:1.6,fontStyle:"italic",textAlign:"center"}}>💻 Questa operazione si può fare <b>solo da computer</b> — l'Extranet di Booking non è disponibile da app mobile.</p>
          {/* Cornice monitor/laptop per Booking — stile desktop */}
          <div style={{maxWidth:560,margin:"0 auto",padding:"0 8px"}}>
            <div style={{
              background:"linear-gradient(145deg, #334155 0%, #1e293b 100%)",
              borderRadius:16, padding:"6px 6px 10px",
              boxShadow:"0 20px 50px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.08)",
              position:"relative"
            }}>
              {/* Barra titolo browser */}
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",marginBottom:4}}>
                <div style={{display:"flex",gap:4}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:"#ef4444"}}/>
                  <div style={{width:7,height:7,borderRadius:"50%",background:"#f59e0b"}}/>
                  <div style={{width:7,height:7,borderRadius:"50%",background:"#22c55e"}}/>
                </div>
                <div style={{flex:1,background:"rgba(255,255,255,0.08)",borderRadius:6,padding:"3px 10px",fontSize:8,color:"rgba(255,255,255,0.4)",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
                  🔒 admin.booking.com/hotel/hoteladmin/extranet_ng/manage/sync/...
                </div>
              </div>
              {/* Schermo */}
              <div style={{borderRadius:10,overflow:"hidden",background:"white"}}>
                <ScreenIcalBooking />
              </div>
            </div>
            {/* Piedistallo monitor */}
            <div style={{width:80,height:12,background:"linear-gradient(145deg, #334155, #1e293b)",margin:"0 auto",borderRadius:"0 0 6px 6px"}}/>
            <div style={{width:120,height:4,background:"linear-gradient(145deg, #475569, #334155)",margin:"0 auto",borderRadius:"0 0 4px 4px"}}/>
          </div>
        </FadeUp>
        <div style={{maxWidth:520,margin:"0 auto 40px",padding:"0 4px"}}>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{background:"#003580",color:"white",fontSize:10,fontWeight:800,width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>1</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Accedi all'<b>Extranet</b> di Booking.com dal browser del PC.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{background:"#003580",color:"white",fontSize:10,fontWeight:800,width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>2</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Vai su <b>Tariffe e disponibilità</b> → <b>Sincronizzazione calendari</b>.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{background:"#003580",color:"white",fontSize:10,fontWeight:800,width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>3</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Si aprirà la pagina <b>"Importa calendario"</b>. Puoi lasciare i campi vuoti e cliccare direttamente su <b>"Prossimo passaggio"</b> per andare avanti.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{background:"#003580",color:"white",fontSize:10,fontWeight:800,width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>4</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Nella pagina successiva troverai <b>"Esporta calendario"</b> con il link iCal di Booking. Clicca su <b>"Copia link"</b> per copiarlo.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{background:"#003580",color:"white",fontSize:10,fontWeight:800,width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>5</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Incolla il link (inizia con <code style={{background:"#f1f5f9",padding:"1px 4px",borderRadius:4,fontSize:11}}>https://ical.booking.com/v1/export?...</code>) su CleaningApp → <b>Proprietà</b> → apri la scheda della proprietà → sezione <b>Link Calendario</b> → campo <b>Booking.com</b> → premi <b>Salva e Sincronizza</b>.</p>
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
        <DemoPhone fixedH={680}>
          <ScreenNuovaPulizia />
        </DemoPhone>
        <div style={{maxWidth:520,margin:"24px auto 16px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            La creazione di una pulizia manuale avviene in <b>2 passaggi</b>:
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
          Il prezzo della pulizia è determinato dall'<b>Allegato D</b> dove è concordato il prezzo contrattuale per ciascuna proprietà. Se includi la biancheria, il costo viene aggiunto automaticamente in base al numero di ospiti e alla configurazione delle dotazioni (Step 5 della proprietà). I pagamenti avvengono con <b>fatturazione mensile posticipata</b> e devono essere saldati entro il 10 del mese successivo. In caso di mancato pagamento, il servizio verrà <b>sospeso automaticamente</b> e l'unico modo per riattivarlo sarà saldare il dovuto. Non saranno ammesse richieste di pagamento dilazionato o in ritardo.
        </TipBox>

        <TipBox icon="🚫" title="Pagamento in sospeso — cosa succede?" color="#EF4444">
          Se il pagamento non viene saldato entro la scadenza, all'accesso apparirà una <b>finestra di avviso</b> che mostra i mesi arretrati con gli importi da saldare. Il servizio verrà sospeso e non sarà possibile creare nuove pulizie né richiedere biancheria fino al saldo completo. Trovi un esempio animato nella sezione Pagamenti più in basso.
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
        <DemoPhone fixedH={820}>
          <ScreenSoloBiancheria />
        </DemoPhone>
        <div style={{maxWidth:520,margin:"24px auto 16px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            L'ordine di sola biancheria è utile quando il cliente richiede un <b>rifacimento dei letti</b> o <b>biancheria aggiuntiva</b> per qualsiasi motivo (es. ospiti che restano più a lungo, biancheria sporcata). Non è pensato per fare le pulizie in autonomia — le pulizie vengono eseguite esclusivamente dalla ditta.
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🧺</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Seleziona "Solo Biancheria"</b> dallo stesso pannello di creazione pulizia, scegli proprietà e data.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>📦</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Seleziona gli articoli</b> necessari: lenzuola, asciugamani, e le quantità per ciascuno.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🛏️</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Preparazione Letti (opzionale)</b> — Puoi richiedere che un operatore prepari i letti con un costo aggiuntivo di €5 per letto, oltre a €10 di spedizione per la consegna.</p>
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
        <DemoPhone fixedH={620}>
          <ScreenPulizia />
        </DemoPhone>
        <div style={{maxWidth:520,margin:"24px auto 16px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Dalla lista delle pulizie di oggi, ogni card mostra le informazioni principali:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🕐</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Orario</b> — L'ora di inizio della pulizia, che viene assegnata dall'amministratore in base al turno. Non coincide necessariamente con il check-out: le pulizie possono partire alle 10, alle 12 o in altri orari a seconda dell'organizzazione dei turni.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>👥</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Bottone Ospiti (viola)</b> — Tocca questo bottone per aprire il pannello di modifica ospiti. Puoi aumentare o diminuire il numero.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🔄</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Ricalcolo automatico</b> — Quando confermi il nuovo numero, la biancheria viene ricalcolata in base alla configurazione delle dotazioni di quella proprietà.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>⏰</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Scadenza inserimento</b> — Il numero di ospiti deve essere comunicato entro le <b>20:00 del giorno precedente</b> alla pulizia. Questo serve ai nostri operatori per preparare la quantità corretta di biancheria.</p>
            </div>
          </div>
          <div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:12,padding:"12px 16px",marginBottom:16}}>
            <p style={{fontSize:13,color:"#991B1B",margin:0,lineHeight:1.6}}>
              <b>⚠️ Cosa succede se non inserisci il numero ospiti in tempo?</b> Se entro le 20:00 del giorno prima non viene comunicato il numero di ospiti, la pulizia verrà eseguita per il <b>numero massimo di ospiti</b> configurato per quella proprietà. Questo significa che verrà preparata e addebitata la biancheria per la capienza massima. Ti consigliamo di aggiornare sempre il numero per evitare costi aggiuntivi.
            </p>
          </div>
        </div>
        <TipBox icon="⚡" title="Aggiornamento in tempo reale" color="#7C3AED">
          La modifica viene propagata immediatamente a tutti: l'operatore che deve fare la pulizia e il rider che consegna la biancheria vedranno le quantità aggiornate nella loro app.
        </TipBox>
      </GuidaSection>

      {/* ═══ SEZ 11: PAGAMENTI ═══ */}
      <SectionDivider number={11} color="#EF4444" />
      <GuidaSection id="pagamenti" bg="linear-gradient(180deg, #fef2f2 0%, #fafbfc 100%)">
        <SectionHeader
          title="Pagamenti e Fatturazione"
          subtitle="Il servizio prevede una fatturazione mensile posticipata. Ecco come funziona il ciclo di pagamento."
          color="#EF4444"
          icon="💰"
        />
        <DemoPhone fixedH={480}>
          {/* Animazione della modal di pagamento in sospeso */}
          <ScreenPagamenti />
        </DemoPhone>
        <div style={{maxWidth:520,margin:"24px auto 16px",padding:"0 4px"}}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"white",border:"1px solid #fecaca",borderRadius:12,padding:"12px 16px"}}>
              <p style={{fontSize:13,fontWeight:700,color:"#991b1b",margin:"0 0 4px"}}>📅 Ciclo di fatturazione</p>
              <p style={{fontSize:13,color:"#64748b",margin:0,lineHeight:1.6}}>Tutte le pulizie e consegne biancheria del mese vengono fatturate a fine mese. Il pagamento deve essere effettuato entro il <b>10 del mese successivo</b> tramite bonifico o contanti.</p>
            </div>
            <div style={{background:"white",border:"1px solid #fecaca",borderRadius:12,padding:"12px 16px"}}>
              <p style={{fontSize:13,fontWeight:700,color:"#991b1b",margin:"0 0 4px"}}>⚠️ Sospensione del servizio</p>
              <p style={{fontSize:13,color:"#64748b",margin:0,lineHeight:1.6}}>Se il pagamento non viene saldato entro la scadenza, il servizio verrà <b>sospeso automaticamente</b>. All'accesso apparirà una finestra con il riepilogo dei pagamenti arretrati. L'unico modo per riattivare il servizio è saldare l'importo dovuto.</p>
            </div>
            <div style={{background:"white",border:"1px solid #fecaca",borderRadius:12,padding:"12px 16px"}}>
              <p style={{fontSize:13,fontWeight:700,color:"#991b1b",margin:"0 0 4px"}}>🚫 Nessuna dilazione</p>
              <p style={{fontSize:13,color:"#64748b",margin:0,lineHeight:1.6}}>Non saranno ammesse richieste di pagamento dilazionato o in ritardo. Dopo la sospensione, il servizio ripartirà solo a pagamento avvenuto.</p>
            </div>
          </div>
        </div>
        <TipBox icon="💳" title="Dove vedo i miei pagamenti?" color="#EF4444">
          Dalla sezione "Pagamenti" del tuo pannello proprietario puoi consultare lo storico delle fatture, i saldi mensili e lo stato di ciascun pagamento. L'amministratore registrerà i pagamenti ricevuti e riceverai conferma automatica.
        </TipBox>
      </GuidaSection>

      {/* ═══ SEZ 12: ASSISTENTE AI ═══ */}
      <SectionDivider number={12} color="#6366F1" />
      <GuidaSection id="assistente" bg="linear-gradient(180deg, #eef2ff 0%, #fafbfc 100%)">
        <SectionHeader
          title="Assistente AI"
          subtitle="Il tuo assistente personale integrato nel gestionale. Disponibile dalla dashboard proprietario, ti aiuta a gestire pulizie, pagamenti e prenotazioni con comandi in linguaggio naturale."
          color="#6366F1"
          icon="🤖"
        />
        <DemoPhone fixedH={500}>
          <ScreenAssistente />
        </DemoPhone>
        <div style={{maxWidth:520,margin:"24px auto 16px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            L'assistente AI è accessibile dall'icona <b>🤖</b> nella barra superiore della dashboard proprietario. Basta toccarla per aprire la chat. Puoi scrivere in linguaggio naturale oppure usare i <b>4 suggerimenti rapidi</b> predefiniti:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
            <div style={{background:"white",border:"1px solid #c7d2fe",borderRadius:12,padding:"12px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <span style={{fontSize:18}}>📋</span>
                <p style={{fontSize:14,fontWeight:700,color:"#4338ca",margin:0}}>"Prossime pulizie"</p>
              </div>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>L'assistente consulta il calendario delle pulizie e ti mostra l'elenco delle prossime pulizie programmate con data, orario, nome proprietà e numero di ospiti attesi.</p>
            </div>
            <div style={{background:"white",border:"1px solid #c7d2fe",borderRadius:12,padding:"12px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <span style={{fontSize:18}}>💰</span>
                <p style={{fontSize:14,fontWeight:700,color:"#4338ca",margin:0}}>"Quanto devo pagare?"</p>
              </div>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Ti fornisce il riepilogo dei pagamenti in sospeso suddiviso per mese, con il dettaglio di pulizie e biancheria e il totale da saldare con la data di scadenza.</p>
            </div>
            <div style={{background:"white",border:"1px solid #c7d2fe",borderRadius:12,padding:"12px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <span style={{fontSize:18}}>🧹</span>
                <p style={{fontSize:14,fontWeight:700,color:"#4338ca",margin:0}}>"Inserisci nuova pulizia"</p>
              </div>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Puoi chiedere all'assistente di creare una nuova pulizia specificando proprietà, data e numero ospiti. L'assistente ti guiderà nei passaggi necessari direttamente dalla chat.</p>
            </div>
            <div style={{background:"white",border:"1px solid #c7d2fe",borderRadius:12,padding:"12px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <span style={{fontSize:18}}>👥</span>
                <p style={{fontSize:14,fontWeight:700,color:"#4338ca",margin:0}}>"Prossimi ospiti"</p>
              </div>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Ti mostra le prossime prenotazioni con le date di check-in/check-out e il numero di ospiti attesi per ciascuna delle tue proprietà.</p>
            </div>
          </div>
        </div>
        <TipBox icon="💡" title="Come si usa?" color="#6366F1">
          Tocca l'icona dell'assistente nella barra superiore della dashboard. Si apre una chat dove puoi scrivere qualsiasi domanda. Puoi anche usare i suggerimenti rapidi che appaiono all'apertura. L'assistente risponde in tempo reale basandosi sui dati reali delle tue proprietà, pulizie e pagamenti.
        </TipBox>
      </GuidaSection>

      {/* ═══ SEZ 13: FAQ ═══ */}
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
            Ricevi notifiche sul telefono e nell'app. Assicurati di abilitare le notifiche quando richiesto dal browser. Puoi anche ricevere notifiche via email.
          </Accordion>
          <Accordion title="Posso modificare una pulizia dopo averla creata?">
            Sì, puoi modificare data, numero ospiti e note. Se la pulizia è già stata assegnata a un operatore, le modifiche verranno notificate automaticamente.
          </Accordion>
          <Accordion title="Come funziona la fatturazione?">
            Le pulizie e la biancheria vengono addebitate con fatturazione mensile posticipata. Puoi consultare il riepilogo dei costi nel tuo pannello.
          </Accordion>
          <Accordion title="Posso aggiungere più proprietà?">
            Sì, puoi aggiungere tutte le proprietà che vuoi. Ogni proprietà deve essere approvata dall'amministratore prima di essere attiva.
          </Accordion>
          <Accordion title="Come collego un nuovo calendario iCal?">
            Vai nella scheda della proprietà e aggiungi i link iCal dalle piattaforme di prenotazione (Airbnb, Booking, ecc.). La sincronizzazione è automatica.
          </Accordion>
          <Accordion title="Cosa succede se non inserisco il numero ospiti in tempo?">
            Se il numero di ospiti non viene comunicato entro le 20:00 del giorno precedente alla pulizia, il servizio verrà eseguito per il numero massimo di ospiti configurato per quella proprietà. Ti consigliamo di aggiornare sempre il numero ospiti per avere la dotazione corretta e non pagare la biancheria in eccesso.
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

