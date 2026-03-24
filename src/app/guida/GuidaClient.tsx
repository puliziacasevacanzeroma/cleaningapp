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
    <div ref={containerRef} style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:50}}>
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
        <p className="text-[12px] text-slate-500 text-center leading-relaxed mb-4">L'admin verificherà i tuoi dati. Riceverai una notifica appena approvato.</p>
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
  const showPropPage = phase >= 2;
  const showModal = phase >= 4;
  const activeRef = phase===1?navPropRef:phase===3?plusRef:null;
  const clicking = phase===2||phase===4;

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
      {vis&&activeRef&&phase<5&&<SmartCursor targetRef={activeRef} clicking={clicking} visible={true}/>}
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
    const seq = [0,0,1200,2400,3600,4800,6000,8000,8800];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{
      setPhase(0);
      seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); });
    },12000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const plusOspitiRef = useRef(null);
  const plusBagniRef = useRef(null);
  const avantiBtnRef = useRef(null);

  const guests = phase>=4?4:phase>=3?3:phase>=2?2:phase>=1?2:4;
  const baths = phase>=6?2:1;
  const activeRef = phase<=4?plusOspitiRef:phase<=6?plusBagniRef:avantiBtnRef;
  const clicking = phase===1||phase===2||phase===3||phase===5||phase===6;
  const showComplete = phase >= 8;

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
              <p className="text-[8px] text-emerald-600">In attesa di approvazione admin.</p>
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
    0  = modal aperta, tipo "Pulizia" già selezionato
    1  = cursore su campo proprietà
    2  = click → dropdown aperto con risultati
    3  = click su "Appartamento Colosseo" → proprietà selezionata
    4  = cursore su campo data
    5  = click → data selezionata "Domani"
    6  = cursore su toggle biancheria
    7  = click → biancheria attivata
    8  = cursore su "Avanti"
    9  = click → passa a Step 2
    10 = cursore su numero ospiti "3"
    11 = click → ospiti=3, preview biancheria appare con singoli item
    12 = cursore su "Crea Pulizia"
    13 = click → done
    14 = overlay
  */
  useEffect(() => {
    if (!vis) { setStep(0); return; }
    const seq = [0,0,1200,2200,3200,4200,5200,6200,7200,8200,9400,10600,12000,13200,14000,14800];
    const timers = seq.map((t,i)=>setTimeout(()=>setStep(i),t));
    const loop = setInterval(()=>{ setStep(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setStep(i),t)); }); },18000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const propRef = useRef(null);
  const dateRef = useRef(null);
  const linenRef = useRef(null);
  const avantiRef = useRef(null);
  const guestsRef = useRef(null);
  const confermaRef = useRef(null);

  const propSelected = step>=3;
  const dateSet = step>=5;
  const linenOn = step>=7;
  const isStep2 = step>=9;
  const guestsSet = step>=11;
  const done = step>=13;

  const activeRef = step<=2?propRef:step<=3?propRef:step<=5?dateRef:step<=7?linenRef:step<=8?avantiRef:step<=11?guestsRef:confermaRef;
  const clicking = step===2||step===3||step===5||step===7||step===8||step===11||step===13;

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      <SmartCursor targetRef={activeRef} clicking={clicking} visible={vis&&step>=1&&step<14} />
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        {/* Header verde */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
              </div>
              <div>
                <h2 className="text-sm font-bold">Nuova Pulizia</h2>
                <p className="text-[9px] text-white/80">Step {isStep2?"2":"1"} di 2 · {isStep2?"Ospiti e Dotazioni":"Proprietà e Servizio"}</p>
              </div>
            </div>
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></div>
          </div>
          <div className="mt-2 flex gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-white"></div>
            <div className={`h-1 flex-1 rounded-full ${isStep2?'bg-white':'bg-white/30'}`}></div>
          </div>
        </div>

        <div className="px-3 py-3 space-y-2 bg-slate-50">
          {!isStep2?(
            <>
              {/* Tipo richiesta */}
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] font-semibold text-slate-800 mb-2">Cosa vuoi richiedere?</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg border-2 border-slate-800 bg-slate-50 text-center shadow-sm">
                    <span className="text-lg block">🧹</span>
                    <span className="text-[10px] font-semibold text-slate-800">Pulizia</span>
                  </div>
                  <div className="p-2 rounded-lg border-2 border-slate-200 bg-white text-center">
                    <span className="text-lg block">🧺</span>
                    <span className="text-[10px] font-semibold text-slate-500">Solo Biancheria</span>
                  </div>
                </div>
              </div>

              {/* Proprietà */}
              <div ref={propRef} className={`bg-white rounded-xl border-2 p-3 transition-all ${propSelected?'border-blue-200 bg-blue-50/50':'border-slate-200'}`}>
                <p className="text-[10px] font-semibold text-slate-700 mb-1.5">Proprietà *</p>
                {step===2?(
                  <div style={{animation:'fadeIn 0.2s'}}>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 mb-1">
                      <div className="flex items-center gap-2 px-2 py-1.5 bg-white rounded-md border border-blue-200 cursor-pointer">
                        <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-400 to-indigo-500 flex-shrink-0"/>
                        <div><p className="text-[9px] font-bold text-slate-800">Appartamento Colosseo</p><p className="text-[7px] text-slate-400">Via del Corso 100</p></div>
                      </div>
                      <div className="flex items-center gap-2 px-2 py-1.5 mt-1 rounded-md">
                        <div className="w-6 h-6 rounded bg-gradient-to-br from-emerald-400 to-teal-500 flex-shrink-0"/>
                        <div><p className="text-[9px] font-medium text-slate-600">Apt. Trastevere</p><p className="text-[7px] text-slate-400">Via della Scala 22</p></div>
                      </div>
                    </div>
                  </div>
                ):propSelected?(
                  <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-blue-200">
                    <div className="w-7 h-7 rounded bg-gradient-to-br from-blue-400 to-indigo-500 flex-shrink-0"/>
                    <div><p className="text-[10px] font-bold text-slate-800">Appartamento Colosseo</p><p className="text-[7px] text-slate-400">Via del Corso 100 · Max 4 · €45</p></div>
                  </div>
                ):(
                  <div className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-400 flex items-center gap-1.5">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    Cerca proprietà...
                  </div>
                )}
              </div>

              {/* Data */}
              <div ref={dateRef} className={`bg-white rounded-xl border-2 p-3 transition-all ${dateSet?'border-slate-300':'border-slate-200'}`}>
                <p className="text-[10px] font-semibold text-slate-700 mb-1.5">Data *</p>
                <div className={`px-3 py-2 rounded-lg text-[10px] font-medium ${dateSet?'bg-slate-800 text-white':'bg-slate-50 border border-slate-200 text-slate-400'}`}>
                  {dateSet?"Domani — Martedì 24 Marzo 2026":"Seleziona data..."}
                </div>
              </div>

              {/* Toggle biancheria */}
              <div ref={linenRef} className={`bg-white rounded-xl border-2 p-3 transition-all ${linenOn?'border-emerald-200 bg-emerald-50/50':'border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <div><p className="text-[10px] font-semibold text-slate-800">Includi Biancheria</p><p className="text-[8px] text-slate-400">{linenOn?"Inclusa nella pulizia":"Solo pulizia, senza biancheria"}</p></div>
                  <div className={`w-10 h-5 rounded-full transition-all relative ${linenOn?'bg-emerald-500':'bg-slate-300'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${linenOn?'left-5':'left-0.5'}`}/>
                  </div>
                </div>
              </div>

              <button ref={avantiRef} className={`w-full py-2.5 rounded-xl text-[11px] font-bold text-white transition-all ${propSelected&&dateSet?'bg-gradient-to-r from-emerald-500 to-teal-500':'bg-slate-300'}`}>
                {propSelected&&dateSet?"Avanti — Ospiti e Dotazioni →":"Completa i campi"}
              </button>
            </>
          ):(
            <>
              {/* Step 2: Ospiti */}
              <div ref={guestsRef} className="bg-white rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] font-semibold text-slate-800 mb-2">Numero ospiti *</p>
                <div className="flex gap-1.5">
                  {[1,2,3,4].map(n=>(
                    <button key={n} className={`w-9 h-9 rounded-lg text-[11px] font-bold transition-all ${n===(guestsSet?3:2)?'bg-emerald-500 text-white shadow scale-105':'bg-slate-100 text-slate-600'}`}>{n}</button>
                  ))}
                </div>
              </div>

              {/* Preview biancheria dettagliata */}
              {guestsSet && (
                <div className="bg-white rounded-xl border border-blue-200 p-3" style={{animation:'fadeIn 0.3s'}}>
                  <p className="text-[10px] font-bold text-blue-800 mb-2">📦 Biancheria per 3 ospiti:</p>
                  <div className="space-y-1">
                    {[
                      {name:"Lenz. Matrimoniale",qty:2,price:"€2.50"},
                      {name:"Lenz. Singolo",qty:1,price:"€2.00"},
                      {name:"Federe",qty:3,price:"€1.00"},
                      {name:"Asciugamano Viso",qty:3,price:"€1.50"},
                      {name:"Asciugamano Bagno",qty:3,price:"€2.00"},
                      {name:"Tappetino Bagno",qty:1,price:"€1.50"},
                    ].map((item,i)=>(
                      <div key={i} className="flex items-center justify-between py-1 px-2 bg-blue-50 rounded-md">
                        <span className="text-[9px] text-slate-700">{item.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-blue-600">×{item.qty}</span>
                          <span className="text-[8px] text-slate-400">{item.price}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Riepilogo prezzo */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                <div className="flex justify-between text-[10px] mb-0.5"><span className="text-slate-600">Pulizia</span><span className="font-bold text-slate-800">€45,00</span></div>
                {guestsSet&&<div className="flex justify-between text-[10px] mb-0.5"><span className="text-slate-600">Biancheria (3 ospiti)</span><span className="font-bold text-slate-800">€24,50</span></div>}
                <div className="flex justify-between text-[10px] font-bold text-emerald-700 border-t border-emerald-200 pt-1.5 mt-1"><span>Totale</span><span>€{guestsSet?"69,50":"45,00"}</span></div>
              </div>

              <button ref={confermaRef} className={`w-full py-2.5 rounded-xl text-[11px] font-bold text-white transition-all ${done?'bg-emerald-600':step===13?'scale-95 bg-emerald-700':'bg-gradient-to-r from-emerald-500 to-teal-500'}`}>
                {done?"✓ Pulizia Creata!":"Crea Pulizia →"}
              </button>
            </>
          )}
        </div>
      </div>
      <CompletionOverlay visible={step >= 14} message="Pulizia Creata!" />
    </div>
  );
}

/* ─── SCREEN: Richiedi Solo Biancheria ─── */
function ScreenSoloBiancheria() {
  const [ref, vis] = useVis(0.1);
  const [step, setStep] = useState(0);
  /*
    0  = modal aperta, nessun tipo selezionato
    1  = cursore su "Solo Biancheria"
    2  = click → Solo Biancheria selezionato
    3  = cursore su campo proprietà
    4  = click → proprietà selezionata
    5  = cursore su campo data
    6  = click → data selezionata
    7  = cursore su "Avanti"
    8  = click → Step 2: selezione letti e articoli
    9  = letti selezionati con quantità
    10 = cursore su toggle Preparazione Letti
    11 = click → preparazione letti attivata, mostra €5/letto + €10 consegna
    12 = cursore su "Crea Ordine"
    13 = click → done
    14 = overlay
  */
  useEffect(() => {
    if (!vis) { setStep(0); return; }
    const seq = [0,0,1200,2200,3200,4200,5200,6200,7200,8200,9600,10800,12000,13200,14000,14800];
    const timers = seq.map((t,i)=>setTimeout(()=>setStep(i),t));
    const loop = setInterval(()=>{ setStep(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setStep(i),t)); }); },18000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const linenTabRef = useRef(null);
  const propRef2 = useRef(null);
  const dateRef2 = useRef(null);
  const avantiRef2 = useRef(null);
  const bedMakingRef = useRef(null);
  const confermaRef2 = useRef(null);

  const linenSelected = step>=2;
  const propSelected = step>=4;
  const dateSet = step>=6;
  const isStep2 = step>=8;
  const bedsReady = step>=9;
  const bedMaking = step>=11;
  const done = step>=13;

  const activeRef = step<=2?linenTabRef:step<=4?propRef2:step<=6?dateRef2:step<=7?avantiRef2:step<=11?bedMakingRef:confermaRef2;
  const clicking = step===2||step===4||step===6||step===7||step===11||step===13;

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      <SmartCursor targetRef={activeRef} clicking={clicking} visible={vis&&step>=1&&step<14} />
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18"/></svg>
              </div>
              <div>
                <h2 className="text-sm font-bold">{linenSelected?"Richiedi Biancheria":"Nuova Richiesta"}</h2>
                <p className="text-[9px] text-white/80">Step {isStep2?"2":"1"} di 2</p>
              </div>
            </div>
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></div>
          </div>
          <div className="mt-2 flex gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-white"></div>
            <div className={`h-1 flex-1 rounded-full ${isStep2?'bg-white':'bg-white/30'}`}></div>
          </div>
        </div>

        <div className="px-3 py-3 space-y-2 bg-slate-50">
          {!isStep2?(
            <>
              {/* Tipo — cursore va su Solo Biancheria */}
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] font-semibold text-slate-800 mb-2">Cosa vuoi richiedere?</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className={`p-2 rounded-lg border-2 text-center ${!linenSelected?'border-slate-200':'border-slate-200'}`}>
                    <span className="text-lg block">🧹</span>
                    <span className="text-[10px] font-semibold text-slate-500">Pulizia</span>
                  </div>
                  <div ref={linenTabRef} className={`p-2 rounded-lg border-2 text-center transition-all ${linenSelected?'border-slate-800 bg-slate-50 shadow-sm':'border-slate-200'}`}>
                    <span className="text-lg block">🧺</span>
                    <span className={`text-[10px] font-semibold ${linenSelected?'text-slate-800':'text-slate-500'}`}>Solo Biancheria</span>
                  </div>
                </div>
              </div>

              {/* Proprietà */}
              <div ref={propRef2} className={`bg-white rounded-xl border-2 p-3 transition-all ${propSelected?'border-blue-200 bg-blue-50/50':'border-slate-200'}`}>
                <p className="text-[10px] font-semibold text-slate-700 mb-1.5">Proprietà *</p>
                {propSelected?(
                  <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-blue-200">
                    <div className="w-7 h-7 rounded bg-gradient-to-br from-blue-400 to-indigo-500 flex-shrink-0"/>
                    <div><p className="text-[10px] font-bold text-slate-800">Appartamento Colosseo</p><p className="text-[7px] text-slate-400">Via del Corso 100</p></div>
                  </div>
                ):(
                  <div className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-400">Cerca proprietà...</div>
                )}
              </div>

              {/* Data */}
              <div ref={dateRef2} className={`bg-white rounded-xl border-2 p-3 transition-all ${dateSet?'border-slate-300':'border-slate-200'}`}>
                <p className="text-[10px] font-semibold text-slate-700 mb-1.5">Data consegna *</p>
                <div className={`px-3 py-2 rounded-lg text-[10px] font-medium ${dateSet?'bg-slate-800 text-white':'bg-slate-50 border border-slate-200 text-slate-400'}`}>
                  {dateSet?"Martedì 24 Marzo 2026":"Seleziona data..."}
                </div>
              </div>

              <button ref={avantiRef2} className={`w-full py-2.5 rounded-xl text-[11px] font-bold text-white ${linenSelected&&propSelected&&dateSet?'bg-gradient-to-r from-emerald-500 to-teal-500':'bg-slate-300'}`}>
                {linenSelected&&propSelected&&dateSet?"Avanti →":"Completa i campi"}
              </button>
            </>
          ):(
            <>
              {/* Step 2: Letti da preparare con biancheria */}
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] font-bold text-slate-800 mb-2">📦 Biancheria da consegnare:</p>
                <div className="space-y-1">
                  {[
                    {name:"Lenz. Matrimoniale",qty:2,price:"€2.50"},
                    {name:"Lenz. Singolo",qty:1,price:"€2.00"},
                    {name:"Federe",qty:3,price:"€1.00"},
                    {name:"Asciugamano Viso",qty:3,price:"€1.50"},
                    {name:"Asciugamano Bagno",qty:3,price:"€2.00"},
                  ].map((item,i)=>(
                    <div key={i} className={`flex items-center justify-between py-1 px-2 rounded-md transition-all ${bedsReady?'bg-blue-50':'bg-slate-50'}`}>
                      <span className="text-[9px] text-slate-700">{item.name}</span>
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-0.5">
                          <div className="w-4 h-4 rounded border border-slate-300 bg-white flex items-center justify-center text-[7px] text-slate-500">−</div>
                          <span className="w-3 text-center text-[9px] font-bold text-slate-800">{bedsReady?item.qty:0}</span>
                          <div className="w-4 h-4 rounded bg-slate-800 flex items-center justify-center text-[7px] text-white">+</div>
                        </div>
                        <span className="text-[8px] text-slate-400">{item.price}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preparazione letti */}
              <div ref={bedMakingRef} className={`bg-white rounded-xl border-2 p-3 transition-all ${bedMaking?'border-amber-200 bg-amber-50':'border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-800">🛏️ Preparazione Letti</p>
                    <p className="text-[8px] text-slate-400">€5,00/letto — operatore prepara i letti</p>
                  </div>
                  <div className={`w-10 h-5 rounded-full relative transition-all ${bedMaking?'bg-amber-500':'bg-slate-300'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${bedMaking?'left-5':'left-0.5'}`}/>
                  </div>
                </div>
                {bedMaking && (
                  <p className="text-[8px] text-amber-700 mt-1.5 bg-amber-100 rounded-md p-1.5" style={{animation:'fadeIn 0.3s'}}>
                    3 letti × €5,00 = <b>€15,00</b> per la preparazione
                  </p>
                )}
              </div>

              {/* Riepilogo */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                <div className="flex justify-between text-[10px] mb-0.5"><span className="text-slate-600">Biancheria</span><span className="font-bold">€{bedsReady?"21,50":"0,00"}</span></div>
                {bedMaking&&<div className="flex justify-between text-[10px] mb-0.5"><span className="text-slate-600">Preparazione letti (3)</span><span className="font-bold">€15,00</span></div>}
                <div className="flex justify-between text-[10px] mb-0.5"><span className="text-slate-600">Consegna</span><span className="font-bold">€10,00</span></div>
                <div className="flex justify-between text-[10px] font-bold text-emerald-700 border-t border-emerald-200 pt-1.5 mt-1"><span>Totale</span><span>€{bedMaking?"46,50":"31,50"}</span></div>
              </div>

              <button ref={confermaRef2} className={`w-full py-2.5 rounded-xl text-[11px] font-bold text-white transition-all ${done?'bg-emerald-600':step===13?'scale-95 bg-emerald-700':'bg-gradient-to-r from-emerald-500 to-teal-500'}`}>
                {done?"✓ Ordine Creato!":"Crea Ordine Biancheria →"}
              </button>
            </>
          )}
        </div>
      </div>
      <CompletionOverlay visible={step >= 14} message="Ordine Creato!" />
    </div>
  );
}


function ScreenIcal() {
  const [ref, vis] = useVis(0.1);
  const [step, setStep] = useState(0);
  // 0=idle,1=cursor su Booking field,2=typing url,3=typed,4=cursor VRBO,5=typing ok,6=typed ok,7=cursor btn,8=click,9=saved
  useEffect(() => {
    if (!vis) { setStep(0); return; }
    const seq = [0,0,1400,2800,4200,5600,7000,8400,9400,10600,11400,13000];
    const timers = seq.map((t,i) => setTimeout(() => setStep(i), t));
    const loop = setInterval(() => {
      setStep(0);
      seq.forEach((t,i) => { timers.push(setTimeout(() => setStep(i), t)); });
    }, 16000);
    return () => { timers.forEach(clearTimeout); clearInterval(loop); };
  }, [vis]);

  const bookingUrl = "https://admin.booking.com/hotel/ical/...";
  const okUrl = "https://www.vrbo.com/ical/...";
  const bookingVal = step >= 3 ? bookingUrl : step === 2 ? bookingUrl.slice(0, 12) + "..." : "";
  const okVal = step >= 6 ? okUrl : step === 5 ? okUrl.slice(0, 10) + "..." : "";
  const saved = step >= 9;
  const clicking = step === 8;

  const cpMap = [{x:50,y:50},{x:50,y:50},{x:55,y:52},{x:55,y:52},{x:55,y:66},{x:55,y:66},{x:55,y:66},{x:50,y:85},{x:50,y:85},{x:50,y:50},{x:50,y:50}];
  const cp = cpMap[Math.min(step, cpMap.length-1)];

  const platforms = [
    { n:"Airbnb", c:"from-rose-500 to-red-600", val:"https://www.airbnb.it/calendar/ical/...", active: step>=1 },
    { n:"Booking.com", c:"from-blue-600 to-blue-700", val: bookingVal, active: step>=2 && step<4 },
    { n:"VRBO", c:"from-blue-700 to-indigo-800", val: okVal, active: step>=5 && step<7 },
  ];

  return (
    <div ref={ref} style={{position:"relative"}}>
      {vis && <LiveCursor x={cp.x} y={cp.y} clicking={clicking} />}
      <AppScreen>
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
          <CompletionOverlay visible={step >= 11} message="Calendari Collegati!" />
        </div>
      </AppScreen>
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
    0  = Pagina proprietà con card + bottone "Firma ora"
    1  = cursore su "Firma ora"
    2  = click → modal step 1 Leggi
    3  = scroll → documento letto
    4  = click "Procedi alla Firma" → step 2
    5  = checkbox 1
    6  = checkbox 2
    7  = firma disegnata
    8  = click "Firma e Attiva"
    9  = successo
    10 = overlay
  */
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1400,2600,4000,5200,6200,7200,8200,9400,10400,11200];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },14500);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const firmaBtnRef = useRef(null);
  const procediRef = useRef(null);
  const confirmRef = useRef(null);
  const showModal = phase >= 2;
  const showSign = phase >= 4;
  const scrolled = phase >= 3;

  const activeRef = phase===1||phase===2?firmaBtnRef:phase===3||phase===4?procediRef:phase===8||phase===9?confirmRef:null;
  const clicking = phase===2||phase===4||phase===5||phase===6||phase===8;

  /* ── PAGINA PROPRIETÀ ── */
  if (!showModal) {
    return (
      <div ref={ref} style={{height:"100%",display:"flex",flexDirection:"column",background:"#f8fafc"}}>
        {vis && activeRef && phase<10 && <SmartCursor targetRef={activeRef} clicking={clicking} visible={true} />}
        <CompletionOverlay visible={phase>=10} message="Allegato D Firmato!" />
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
        {/* Navbar in fondo */}
        <div style={{borderTop:"1px solid #e2e8f0",background:"white",display:"flex",justifyContent:"space-around",alignItems:"center",padding:"5px 0 3px",flexShrink:0}}>
          {[{l:"Dashboard",a:false},{l:"Proprietà",a:true},{l:"Pulizie",a:false},{l:"Calendario",a:false},{l:"Menu",a:false}].map((item,i)=>(
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"3px 5px"}}>
              <div style={{width:18,height:18,borderRadius:4,background:item.a?"#dbeafe":"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontSize:10}}>{["🏠","🏢","✨","📅","☰"][i]}</span>
              </div>
              <span style={{fontSize:7,marginTop:1,fontWeight:item.a?700:400,color:item.a?"#0284c7":"#94a3b8"}}>{item.l}</span>
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
        {vis && activeRef && phase<10 && <SmartCursor targetRef={activeRef} clicking={clicking} visible={true} />}
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
        {/* Scroll indicator */}
        <div style={{padding:"5px 14px",borderBottom:"1px solid #e2e8f0",flexShrink:0}}>
          <p style={{fontSize:9,color:scrolled?"#16a34a":"#d97706",display:"flex",alignItems:"center",gap:3,margin:0,fontWeight:500}}>
            {scrolled?"✅ Documento letto — Puoi procedere":"⬇️ Scorri fino in fondo per procedere"}
          </p>
        </div>
        {/* Contenuto contratto */}
        <div style={{flex:1,padding:"8px 14px",fontSize:9,color:"#475569",lineHeight:1.7,overflow:"hidden"}}>
          <p style={{margin:"0 0 4px",fontWeight:700,fontSize:10}}>ALLEGATO D — SCHEDA SERVIZIO</p>
          <p style={{margin:"0 0 4px"}}><b>Proprietà:</b> Appartamento Colosseo — Via del Corso 100, Roma</p>
          <p style={{margin:"0 0 4px"}}><b>Prezzo:</b> €45,00 per pulizia standard</p>
          <p style={{margin:"0 0 4px"}}><b>Servizi:</b> pulizia completa, sanificazione bagni, cambio biancheria, rifacimento letti.</p>
          <p style={{margin:0}}><b>Pagamento:</b> fatturazione mensile posticipata entro il 10 del mese successivo.</p>
        </div>
        {/* Bottone in fondo */}
        <div style={{padding:"8px 14px",borderTop:"1px solid #e2e8f0",flexShrink:0}}>
          <button ref={procediRef} style={{width:"100%",padding:"11px 0",borderRadius:12,border:"none",fontSize:12,fontWeight:600,color:scrolled?"white":"#94a3b8",background:scrolled?"#0ea5e9":"#e2e8f0",transition:"all 0.3s"}}>
            Procedi alla Firma
          </button>
        </div>
      </div>
    );
  }

  /* ── MODAL STEP 2: FIRMA ── */
  return (
    <div ref={ref} style={{height:"100%",display:"flex",flexDirection:"column"}}>
      {vis && activeRef && phase<10 && <SmartCursor targetRef={activeRef} clicking={clicking} visible={true} />}
      <CompletionOverlay visible={phase>=10} message="Allegato D Firmato!" />
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
        <label style={{display:"flex",alignItems:"flex-start",gap:6,padding:"7px 10px",borderRadius:10,border:phase>=5?"2px solid #22c55e":"2px solid #e2e8f0",background:phase>=5?"#f0fdf4":"white",cursor:"pointer",transition:"all 0.3s"}}>
          <div style={{width:16,height:16,borderRadius:4,border:phase>=5?"none":"2px solid #cbd5e1",background:phase>=5?"#22c55e":"white",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
            {phase>=5&&<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" style={{width:10,height:10}}><path d="M5 13L9 17L19 7"/></svg>}
          </div>
          <span style={{fontSize:9,color:"#334155",lineHeight:1.4}}>Dichiaro di aver letto e accetto <b>integralmente</b> le condizioni dell'Allegato D</span>
        </label>
        {/* Checkbox 2 */}
        <label style={{display:"flex",alignItems:"flex-start",gap:6,padding:"7px 10px",borderRadius:10,border:phase>=6?"2px solid #22c55e":"2px solid #e2e8f0",background:phase>=6?"#f0fdf4":"white",cursor:"pointer",transition:"all 0.3s"}}>
          <div style={{width:16,height:16,borderRadius:4,border:phase>=6?"none":"2px solid #cbd5e1",background:phase>=6?"#22c55e":"white",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
            {phase>=6&&<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" style={{width:10,height:10}}><path d="M5 13L9 17L19 7"/></svg>}
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
          <div style={{border:phase>=7?"1.5px solid #0ea5e9":"1.5px dashed #cbd5e1",borderRadius:10,flex:1,minHeight:30,display:"flex",alignItems:"center",justifyContent:"center",background:phase>=7?"#f0f9ff":"white",transition:"all 0.3s"}}>
            {phase>=7 ? (
              <svg width="100" height="20" viewBox="0 0 160 36"><path d="M8,26 Q22,6 42,20 Q62,34 82,12 Q102,0 128,20 Q142,30 154,16" stroke="#0ea5e9" strokeWidth="2.5" fill="none" strokeLinecap="round"/></svg>
            ) : (
              <span style={{fontSize:9,color:"#94a3b8"}}>✒ Tocca per firmare</span>
            )}
          </div>
        </div>
      </div>
      {/* Bottone in fondo */}
      <div style={{padding:"8px 12px",borderTop:"1px solid #e2e8f0",flexShrink:0}}>
        <button ref={confirmRef} style={{width:"100%",padding:"11px 0",borderRadius:12,border:"none",fontSize:11,fontWeight:700,color:"white",background:phase>=9?"#10b981":phase>=7?"linear-gradient(135deg,#0ea5e9,#0284c7)":"#e2e8f0",transition:"all 0.3s"}}>
          {phase>=9?"✓ Contratto Firmato — Proprietà Attiva!":"Firma e Attiva Proprietà →"}
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
    const seq = [0,0,1400,2600,3800,5000,6000,7200,8400,9600,10800,12000,12800];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },16000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const annuncioRef = useRef(null);
  const settingsRef = useRef(null);
  const dispTabRef = useRef(null);
  const collegaRef = useRef(null);
  const copiaRef = useRef(null);

  const activeRef = phase===1?annuncioRef:phase===3?settingsRef:phase===5?dispTabRef:phase===7?collegaRef:phase===9?copiaRef:null;
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
    <div ref={ref} style={{position:"relative"}}>
      {vis&&activeRef&&phase<11&&<SmartCursor targetRef={activeRef} clicking={clicking} visible={true}/>}
      <CompletionOverlay visible={phase>=11} message="Link iCal Copiato!" />
      <AppScreen>
        <div style={{background:"white",height:"100%",display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {phase<=1 ? (
            /* ═══ SCREEN 1: Lista "Calendari" — fedele allo screenshot ═══ */
            <>
              <div style={{padding:"6px 14px 0",display:"flex",justifyContent:"flex-end"}}><span style={{fontSize:14,color:"#222"}}>🔍</span></div>
              <div style={{padding:"4px 14px 10px"}}><p style={{fontSize:18,fontWeight:800,color:"#222",margin:0}}>Calendari</p></div>
              <div style={{flex:1,padding:"0 10px",overflow:"hidden"}}>
                {[
                  {n:"Vicolo di Monte del Gallo 24",col:"#c9a87c"},
                  {n:"Vicolo dell'Atleta 23 (Garden in Tr...",col:"#2847a0"},
                  {n:"Angelico 70 (Amazing flat ne...",col:"#2847a0"},
                ].map((item,i)=>(
                  <div key={i} ref={i===0?annuncioRef:null} style={{
                    display:"flex",alignItems:"center",border:"1px solid #e5e5e5",borderRadius:14,padding:8,marginBottom:8,gap:10,
                    background:phase>=1&&i===0?"#f9f9f9":"white"
                  }}>
                    <div style={{width:52,height:52,borderRadius:8,background:item.col,flexShrink:0}}/>
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
            /* ═══ SCREEN 2: Calendario annuncio — header con ← nome ✏️📅⚙️ ═══ */
            <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",flexShrink:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:14,color:"#222"}}>←</span>
                  <span style={{fontSize:12,fontWeight:700,color:"#222"}}>Vicolo dell'Atle...</span>
                </div>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{fontSize:13}}>✏️</span>
                  <span style={{fontSize:13}}>📅</span>
                  <span ref={settingsRef} style={{fontSize:13,background:phase>=3?"#f0f0f0":"transparent",borderRadius:6,padding:"3px 5px",cursor:"pointer"}}>⚙️</span>
                </div>
              </div>
              {/* Giorni settimana */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",padding:"0 6px",textAlign:"center",fontSize:8,color:"#717171",fontWeight:600,flexShrink:0}}>
                {["L","M","M","G","V","S","D"].map((d,i)=><div key={i}>{d}</div>)}
              </div>
              {/* Griglia calendario con prenotazioni */}
              <div style={{flex:1,padding:"4px 4px",overflow:"hidden"}}>
                {[[null,null,null,null,null,null,1],[2,3,4,5,6,7,8],[9,10,11,12,13,14,15],[16,17,18,19,20,21,22],[23,24,25,26,27,28,29],[30,31,null,null,null,null,null]].map((w,wi)=>(
                  <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:1}}>
                    {w.map((d,di)=>{
                      const booked = d&&((d>=5&&d<=8)||(d>=9&&d<=13)||(d>=18&&d<=22)||(d>=23&&d<=25)||(d>=28&&d<=31));
                      const isToday = d===22||d===23;
                      return (
                        <div key={di} style={{height:22,position:"relative",display:"flex",flexDirection:"column",alignItems:"center",paddingTop:1}}>
                          {d&&<span style={{fontSize:7,fontWeight:isToday?700:400,color:booked?"white":"#222",zIndex:1,
                            ...(isToday?{background:"#FF385C",borderRadius:"50%",width:14,height:14,display:"flex",alignItems:"center",justifyContent:"center"}:{})
                          }}>{d}</span>}
                          {booked&&<div style={{position:"absolute",left:0,right:0,top:8,height:14,background:"#333",borderRadius:d===5||d===9||d===18||d===23||d===28?"7px 0 0 7px":d===8||d===13||d===22||d===25||d===31?"0 7px 7px 0":"0"}}/>}
                          {!booked&&d&&d>=3&&d<=4&&<span style={{fontSize:5,color:"#717171"}}>107€</span>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
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
      </AppScreen>
    </div>
  );
}
/* ─── SCREEN: Come trovare iCal su Booking.com Extranet ─── */
function ScreenIcalBooking() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1800,3200,4800,6400,8000,9500,10300];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },13500);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  return (
    <div ref={ref} style={{position:"relative"}}>
      <CompletionOverlay visible={phase>=7} message="Link iCal Copiato!" />
      <AppScreen>
        <div style={{background:"white",height:"100%"}}>
          {/* Header Booking-style */}
          <div style={{background:"#003580",padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
            <div style={{background:"white",borderRadius:4,padding:"2px 6px"}}>
              <span style={{fontSize:10,fontWeight:800,color:"#003580"}}>B.</span>
            </div>
            <span style={{fontSize:12,fontWeight:700,color:"white"}}>Booking.com — Extranet</span>
          </div>
          <div style={{padding:10}}>
            {/* Step 1 */}
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:phase>=1?"#003580":"#e2e8f0",transition:"all 0.3s"}}/>
              <p style={{fontSize:9,fontWeight:600,color:phase>=1?"#003580":"#94a3b8",margin:0}}>1. Accedi all'<b>Extranet</b> di Booking.com</p>
            </div>
            {/* Step 2 */}
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:phase>=2?"#003580":"#e2e8f0",transition:"all 0.3s"}}/>
              <p style={{fontSize:9,fontWeight:600,color:phase>=2?"#003580":"#94a3b8",margin:0}}>2. Vai su <b>Tariffe e disponibilità</b> → <b>Sincronizzazione calendari</b></p>
            </div>
            {/* Simulated Booking extranet page */}
            {phase>=2 && (
              <div style={{background:"#f5f5f5",border:"1px solid #e0e0e0",borderRadius:10,padding:10,marginBottom:8,animation:"fadeIn 0.3s"}}>
                <p style={{fontSize:10,fontWeight:700,color:"#333",margin:"0 0 6px"}}>Sincronizzazione calendari</p>
                <p style={{fontSize:8,color:"#6b6b6b",margin:"0 0 8px"}}>Esporta il tuo calendario per usarlo su altre piattaforme</p>
                <div style={{background:"white",border:"1px solid #ccc",borderRadius:8,padding:8}}>
                  <p style={{fontSize:8,fontWeight:600,color:"#333",margin:"0 0 4px"}}>Link iCal della tua struttura</p>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{flex:1,background:"#fafafa",border:"1px solid #ddd",borderRadius:6,padding:"5px 8px",fontSize:7,color:"#333",fontFamily:"monospace",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
                      {phase>=3?"https://admin.booking.com/hotel/hoteladmin/ical.html?t=abc123...":""}
                      {phase===2&&<span style={{color:"#b0b0b0"}}>Caricamento link...</span>}
                    </div>
                    <button style={{
                      background:phase>=4?"#008009":"#003580",color:"white",border:"none",
                      borderRadius:6,padding:"5px 10px",fontSize:8,fontWeight:600,
                      whiteSpace:"nowrap",transition:"all 0.3s"
                    }}>
                      {phase>=4?"✓ Copiato":"Copia"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* Steps 3-4 */}
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:phase>=3?"#003580":"#e2e8f0",transition:"all 0.3s"}}/>
              <p style={{fontSize:9,fontWeight:600,color:phase>=3?"#003580":"#94a3b8",margin:0}}>3. Clicca <b>"Copia"</b> per copiare il link iCal</p>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:phase>=5?"#003580":"#e2e8f0",transition:"all 0.3s"}}/>
              <p style={{fontSize:9,fontWeight:600,color:phase>=5?"#003580":"#94a3b8",margin:0}}>4. Incolla in <b>CleaningApp</b> nel campo "Link iCal Booking"</p>
            </div>
            {phase>=5 && (
              <div style={{background:"#ecfdf5",border:"1px solid #a7f3d0",borderRadius:8,padding:8,animation:"fadeIn 0.3s"}}>
                <p style={{fontSize:8,fontWeight:600,color:"#065f46",margin:0}}>✅ Link iCal pronto! Incollalo nel campo "Link iCal Booking" della proprietà su CleaningApp.</p>
              </div>
            )}
          </div>
        </div>
      </AppScreen>
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
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Leggi il contratto fino alla fine</b> — Scorri il testo del contratto fino in fondo. Quando arrivi alla fine, apparirà un flag verde che conferma la lettura completa.</p>
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
          Riceverai una <b>notifica push</b> e una <b>email</b> appena l'admin approva il tuo account dopo aver verificato la firma del contratto quadro. L'email conterrà anche una copia del contratto quadro firmato. A quel punto potrai accedere a tutte le funzionalità della piattaforma e iniziare ad aggiungere le tue proprietà.
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
          Dal pannello Proprietario, vai nella sezione "Proprietà". Quando non hai ancora nessuna struttura, vedrai una pagina vuota con l'indicazione di cliccare il pulsante + in alto a destra. Si aprirà un wizard guidato in 6 passaggi.
        </TipBox>

        {/* Step 0: Pagina vuota → Click + → Modal */}
        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#a78bfa",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>COME INIZIARE · Apri la modal di creazione</span>
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
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>Si aprirà la modal <b>"Richiedi Nuova Proprietà"</b> con un wizard di 6 step che ti guiderà nella configurazione completa.</p>
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
          <DemoPhone fixedH={670}>
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
          <DemoPhone fixedH={900}>
            <ScreenStep5 />
          </DemoPhone>
        </FadeUp>
        <div style={{maxWidth:520,margin:"0 auto 48px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            Questo step ti permette di configurare <b>quali letti preparare e quale biancheria portare per ogni possibile numero di ospiti</b>. È la parte più importante:
          </p>

          {/* Box scelta biancheria nostra vs propria */}
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
            <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:12,padding:"14px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <span style={{fontSize:20}}>🧺</span>
                <p style={{fontSize:14,fontWeight:700,color:"#0c4a6e",margin:0}}>Opzione 1: Biancheria della Nostra Ditta</p>
              </div>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>
                Selezionando questa opzione, ad ogni pulizia il sistema <b>ordinerà automaticamente</b> la biancheria necessaria in base al numero di ospiti. Un rider consegnerà lenzuola, federe e asciugamani puliti direttamente alla proprietà. Questo è il modo più comodo e consigliato.
              </p>
            </div>
            <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:12,padding:"14px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <span style={{fontSize:20}}>🏠</span>
                <p style={{fontSize:14,fontWeight:700,color:"#78350f",margin:0}}>Opzione 2: Biancheria Propria</p>
              </div>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}>
                Se preferisci usare la tua biancheria personale, seleziona questa opzione. <b>Non verrà creato nessun ordine automatico</b> di biancheria — la pulizia verrà eseguita normalmente ma senza consegna di biancheria. Dovrai assicurarti tu di avere la biancheria disponibile in loco.
              </p>
            </div>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>2️⃣</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Configurazione "2 ospiti"</b> — Se arrivano 2 ospiti, quali letti vanno preparati? Es. solo il letto matrimoniale. Per ogni letto selezionato il sistema inserisce una dotazione di base (es. 2 lenzuola matrimoniali + 2 federe per un letto matrimoniale).</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>3️⃣</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Configurazione "3 ospiti"</b> — Per 3 ospiti magari servono il matrimoniale + il singolo. Seleziona i letti e personalizza la dotazione per ogni configurazione.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>✏️</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Personalizzabile</b> — La dotazione di base è solo un punto di partenza per velocizzare la configurazione. Puoi sempre modificare le quantità di ogni singolo articolo per adattarle alle tue esigenze reali.</p>
            </div>
          </div>
          <div style={{background:"#ECFDF5",border:"1px solid #A7F3D0",borderRadius:12,padding:"12px 16px"}}>
            <p style={{fontSize:13,color:"#065F46",margin:0,lineHeight:1.6}}>
              <b>Come funziona in pratica?</b> Quando crei una pulizia e indichi "3 ospiti", il sistema guarda il configuratore biancheria per quella proprietà e sa esattamente quali letti preparare e quale biancheria portare.
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
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Foto</b> — Carica una foto della proprietà (JPG o PNG, max 10MB). Questa foto verrà mostrata nelle liste e nelle card delle pulizie.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>📤</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Crea Proprietà</b> — Clicca il bottone finale e la proprietà verrà inviata all'admin per l'approvazione.</p>
            </div>
          </div>
        </div>

        <TipBox icon="⏱️" title="Cosa succede dopo?" color="#8B5CF6">
          La proprietà rimane "in attesa di approvazione" finché l'admin non la verifica e definisce il prezzo del servizio. Una volta approvata, riceverai una <b>notifica push e un'email</b> con il prezzo concordato. A quel punto dovrai firmare l'<b>Allegato D</b> (Scheda Servizio Proprietà) che troverai nella sezione Proprietà. Solo dopo la firma dell'Allegato D la proprietà sarà online e potrai iniziare a creare pulizie e richiedere biancheria.
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
            Dopo che l'admin approva la proprietà e definisce il prezzo, nella sezione <b>Proprietà</b> vedrai un bottone <b>"Firma ora"</b> arancione. Ecco i passaggi:
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>🔔</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Notifica</b> — Ricevi una notifica push e un'email con il prezzo concordato per la proprietà.</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,lineHeight:1,flexShrink:0}}>✍️</span>
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Firma Allegato D</b> — Tocca "Firma ora" sulla card della proprietà. Si apre la modal con il contratto specifico che include il prezzo concordato.</p>
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
        <DemoPhone fixedH={340}>
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

        {/* Guide animate: come trovare iCal su Airbnb e Booking */}
        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#FF5A5F",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>GUIDA · Come trovare il link iCal su Airbnb</span>
          </div>
          <DemoPhone fixedH={480}>
            <ScreenIcalAirbnb />
          </DemoPhone>
        </FadeUp>

        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#003580",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>GUIDA · Come trovare il link iCal su Booking.com</span>
          </div>
          <DemoPhone fixedH={450}>
            <ScreenIcalBooking />
          </DemoPhone>
        </FadeUp>

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
          Il prezzo della pulizia è determinato dall'<b>Allegato D</b> dove è concordato il prezzo contrattuale per ciascuna proprietà. Se includi la biancheria, il costo viene aggiunto automaticamente in base al numero di ospiti e alla configurazione delle dotazioni (Step 5 della proprietà). I pagamenti avvengono con <b>fatturazione mensile posticipata</b> e devono essere saldati entro il 10 del mese successivo. In caso di mancato pagamento, il servizio verrà <b>sospeso automaticamente</b> e l'unico modo per riattivarlo sarà saldare il dovuto. Non saranno ammesse richieste di pagamento dilazionato o in ritardo.
        </TipBox>

        <TipBox icon="🚫" title="Pagamento in sospeso — cosa succede?" color="#EF4444">
          Se il pagamento non viene saldato entro la scadenza, al login apparirà una <b>modal di avviso</b> che mostra i mesi arretrati con gli importi da saldare. Il servizio verrà sospeso e non sarà possibile creare nuove pulizie né richiedere biancheria fino al saldo completo. Trovi un esempio animato nella sezione Pagamenti più in basso.
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
        <DemoPhone fixedH={680}>
          <ScreenSoloBiancheria />
        </DemoPhone>
        <div style={{maxWidth:520,margin:"24px auto 16px",padding:"0 4px"}}>
          <p style={{fontSize:14,color:"#334155",lineHeight:1.7,margin:"0 0 12px"}}>
            L'ordine di sola biancheria è utile quando il cliente richiede un <b>rifacimento dei letti</b> o <b>biancheria aggiuntiva</b> per qualsiasi motivo (es. ospiti che restano più a lungo, biancheria sporcata). Non è pensato per fare le pulizie in autonomia — le pulizie vengono eseguite esclusivamente dalla ditta.
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
              <p style={{fontSize:13,color:"#475569",margin:0,lineHeight:1.6}}><b>Orario</b> — L'ora di inizio della pulizia, che viene assegnata dall'admin in base al turno. Non coincide necessariamente con il check-out: le pulizie possono partire alle 10, alle 12 o in altri orari a seconda dell'organizzazione dei turni.</p>
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
              <p style={{fontSize:13,color:"#64748b",margin:0,lineHeight:1.6}}>Se il pagamento non viene saldato entro la scadenza, il servizio verrà <b>sospeso automaticamente</b>. Al login apparirà una modal con il riepilogo dei pagamenti arretrati. L'unico modo per riattivare il servizio è saldare l'importo dovuto.</p>
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

