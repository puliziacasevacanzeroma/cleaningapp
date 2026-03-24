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
  const [pos, setPos] = useState<{x:number,y:number}|null>(null);
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
        setPos(prev => prev === null ? newPos : newPos);
      }
    };
    // Set initial position to center on first render
    if (pos === null && containerRef.current) {
      const container = containerRef.current.getBoundingClientRect();
      setPos({ x: container.width / 2, y: container.height / 2 });
    }
    updatePos();
    const interval = setInterval(updatePos, 100);
    window.addEventListener('resize', updatePos);
    return () => { clearInterval(interval); window.removeEventListener('resize', updatePos); };
  }, [targetRef]);

  if (!visible) return <div ref={containerRef} style={{position:'absolute',inset:0,pointerEvents:'none'}}/>;

  return (
    <div ref={containerRef} style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:50}}>
      <div style={{
        position:'absolute',
        left: pos?.x ?? '50%',
        top: pos?.y ?? '50%',
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
              <div style={{height:'100%',position:'relative',animation:'fadeIn 0.5s'}}>
                <img src={PROP_IMG} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}} alt="" />
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

          {/* Card pulizia — replica esatta CleaningCardAdmin */}
          <div style={{padding:'8px 16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:8}}>
              <span style={{background:'#6366f1',color:'white',fontSize:9,fontWeight:800,padding:'3px 10px',borderRadius:8}}>Oggi</span>
              <div style={{flex:1,height:1,background:'#e2e8f0'}}/>
              <span style={{fontSize:9,color:'#94a3b8'}}>1 pulizia</span>
            </div>
            <div style={{background:'white',borderRadius:24,overflow:'hidden',display:'flex',height:128,boxShadow:'0 4px 20px rgba(0,0,0,0.08), 0 8px 40px rgba(0,0,0,0.04)'}}>
              {/* Foto con overlay, badge stato e prezzo */}
              <div style={{width:128,height:128,flexShrink:0,position:'relative',overflow:'hidden',borderRadius:'24px 0 0 24px'}}>
                <img src={PROP_IMG} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}} alt="" />
                <div style={{position:'absolute',inset:0,background:'linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 50%, transparent 100%)'}}/>
                {/* Badge Programmata */}
                <div style={{position:'absolute',top:10,left:10}}>
                  <span style={{padding:'4px 10px',fontSize:10,fontWeight:700,color:'white',borderRadius:8,display:'flex',alignItems:'center',gap:4,background:'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',boxShadow:'0 2px 8px rgba(59,130,246,0.4)'}}>
                    <svg style={{width:10,height:10}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    Programmata
                  </span>
                </div>
                {/* Prezzo */}
                <div style={{position:'absolute',bottom:8,right:8}}>
                  <span style={{fontSize:24,fontWeight:900,color:'white',textShadow:'0 2px 4px rgba(0,0,0,0.3)'}}>€71</span>
                </div>
              </div>
              {/* Contenuto */}
              <div style={{flex:1,padding:'14px 14px',display:'flex',flexDirection:'column',justifyContent:'space-between',minWidth:0}}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <svg style={{width:14,height:14,flexShrink:0}} fill="none" stroke="#a78bfa" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                    <span style={{fontSize:13,fontWeight:600,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>Angelico 70</span>
                  </div>
                  <p style={{fontSize:10,color:'#9ca3af',margin:'2px 0 0'}}>Viale Angelico 70</p>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  {/* Orario */}
                  <div style={{height:28,padding:'0 10px',borderRadius:12,display:'flex',alignItems:'center',gap:5,background:'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}}>
                    <svg style={{width:12,height:12}} fill="none" stroke="#6b7280" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span style={{fontSize:11,fontWeight:600,color:'#374151'}}>10:00</span>
                  </div>
                  {/* Ospiti */}
                  <div style={{height:28,padding:'0 10px',borderRadius:12,display:'flex',alignItems:'center',gap:5,background:'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)',border:'1.5px solid #f87171',boxShadow:'0 2px 12px rgba(239,68,68,0.25)'}}>
                    <svg style={{width:12,height:12}} fill="none" stroke="#dc2626" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    <span style={{fontSize:11,fontWeight:700,color:'#b91c1c'}}>4</span>
                    <span style={{fontSize:8,color:'#dc2626'}}>⚠</span>
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <span style={{fontSize:9,color:'#9ca3af'}}>👤 Da assegnare</span>
                  <div style={{flex:1}}/>
                  <svg style={{width:14,height:14}} fill="none" stroke="#d1d5db" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
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
                          <div style={{width:28,height:28,borderRadius:8,overflow:'hidden',flexShrink:0}}><img src={PROP_IMG} style={{width:28,height:28,objectFit:'cover',display:'block'}}/></div>
                          <div><p style={{fontSize:10,fontWeight:700,color:'#1e293b',margin:0}}>Angelico 70</p><p style={{fontSize:8,color:'#94a3b8',margin:0}}>Viale Angelico 70</p></div>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',marginTop:3,borderRadius:8}}>
                          <div style={{width:28,height:28,borderRadius:8,overflow:'hidden',flexShrink:0}}><img src={PROP_PHOTO_2} style={{width:28,height:28,objectFit:'cover',display:'block'}}/></div>
                          <div><p style={{fontSize:10,fontWeight:500,color:'#64748b',margin:0}}>Apt. Trastevere</p><p style={{fontSize:8,color:'#94a3b8',margin:0}}>Via della Scala 22</p></div>
                        </div>
                      </div>
                    </div>
                  ):propSelected?(
                    <div style={{display:'flex',alignItems:'center',gap:8,padding:8,background:'white',borderRadius:10,border:'1px solid #bfdbfe'}}>
                      <div style={{width:36,height:36,borderRadius:10,overflow:'hidden',flexShrink:0}}><img src={PROP_IMG} style={{width:36,height:36,objectFit:'cover',display:'block'}}/></div>
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
            <div style={{background:'white',borderRadius:24,overflow:'hidden',display:'flex',height:128,boxShadow:'0 4px 20px rgba(0,0,0,0.08), 0 8px 40px rgba(0,0,0,0.04)'}}>
              <div style={{width:128,height:128,flexShrink:0,position:'relative',overflow:'hidden',borderRadius:'24px 0 0 24px'}}>
                <img src={PROP_IMG} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}} alt="" />
                <div style={{position:'absolute',inset:0,background:'linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 50%, transparent 100%)'}}/>
                <div style={{position:'absolute',top:10,left:10}}>
                  <span style={{padding:'4px 10px',fontSize:10,fontWeight:700,color:'white',borderRadius:8,display:'flex',alignItems:'center',gap:4,background:'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',boxShadow:'0 2px 8px rgba(59,130,246,0.4)'}}>
                    <svg style={{width:10,height:10}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    Programmata
                  </span>
                </div>
                <div style={{position:'absolute',bottom:8,right:8}}>
                  <span style={{fontSize:24,fontWeight:900,color:'white',textShadow:'0 2px 4px rgba(0,0,0,0.3)'}}>€71</span>
                </div>
              </div>
              <div style={{flex:1,padding:'14px 14px',display:'flex',flexDirection:'column',justifyContent:'space-between',minWidth:0}}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <svg style={{width:14,height:14,flexShrink:0}} fill="none" stroke="#a78bfa" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                    <span style={{fontSize:13,fontWeight:600,color:'#111827'}}>Angelico 70</span>
                  </div>
                  <p style={{fontSize:10,color:'#9ca3af',margin:'2px 0 0'}}>Viale Angelico 70</p>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <div style={{height:28,padding:'0 10px',borderRadius:12,display:'flex',alignItems:'center',gap:5,background:'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}}>
                    <svg style={{width:12,height:12}} fill="none" stroke="#6b7280" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span style={{fontSize:11,fontWeight:600,color:'#374151'}}>10:00</span>
                  </div>
                  <div style={{height:28,padding:'0 10px',borderRadius:12,display:'flex',alignItems:'center',gap:5,background:'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)',border:'1.5px solid #f87171',boxShadow:'0 2px 12px rgba(239,68,68,0.25)'}}>
                    <svg style={{width:12,height:12}} fill="none" stroke="#dc2626" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    <span style={{fontSize:11,fontWeight:700,color:'#b91c1c'}}>4</span>
                    <span style={{fontSize:8,color:'#dc2626'}}>⚠</span>
                  </div>
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
                      <div style={{width:36,height:36,borderRadius:10,overflow:'hidden',flexShrink:0}}><img src={PROP_IMG} style={{width:36,height:36,objectFit:'cover',display:'block'}}/></div>
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


const PROP_IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAIAAgADASIAAhEBAxEB/8QAHQAAAgIDAQEBAAAAAAAAAAAABQYEBwIDCAEJAP/EAF8QAAECBAQDBAYFBQoLBQYFBQECAwAEBREGEiExB0FREyJhcQgUMoGRoSNCscHRFVJicoIJFiQzkqKjsuHwFyUmNENTY3ODs/FEZJPC0ic1VHSktBk2RVWEN2WFlOL/xAAbAQACAwEBAQAAAAAAAAAAAAACAwABBAUGB//EADQRAAICAQMDAgUEAQQBBQAAAAABAhEDBCExEjJBInEFEzNRgSNCYcE0FCRDsfAVRFJi0f/aAAwDAQACEQMRAD8AQXsRXuJcZ1W0dX9wiIla5hedxanHCLlRMQWBlIvtBFlO1r2jkWb0kjNABNj8YkIAPkdbR4hsLVoNenONyG7i1vGIlZTZ+Smw0JtzvG9CL2vob2j1lhbib2AB3O0SUIDaTqCRzMMUWxbkjWC20klaiTsEiKF4o+kBV5asVGhUBlFJRKOrlnZ1YC33FJNiU30QL+BPjF/jVwaaHe/OOM+KAycSMVJtY/lN+/8ALMa8OKLfqEymy0+HnpO44wVLy6JmaRiSmWH8GqVytIt9R0d5PvuPCOluHXpU4JxkpmXnJpeGak5YBipEBpauiXh3f5WWOEJKRm6lIoakZZ+afbbDqkSyCtQQkd5VhrYXF4XBiF2WecQ6hL6ASmytFf38xA5tDizb1TH49TKGx9g5WczNNrSoKbWMyVoIKVDqDsR5QSlqiU6E2j5f8P8Ai/ivhx2buH649KSiwFGnzCg7LLuL2LatL+KbHxjprh96a9HqBalMY0t2hzFgDPyKS/LE9VI9tHuzCODm+H5ce63R0sephLnZnXkpUiLamDUpVVIGhissN4tpeKqa3UKLUpWrSKh/HybocSPO2qT4Gxg9L1MoIBNx5xxsmGMtpI3wyNcFnU/EJSU5lQwydcQ4B3tYqKWqoGl7HpeCspWVJV3V2jnT0rhvA0rKpclwMzyVgWO8GZCuOy1k5u0b/NVy98VRTsRlNrmGaSrSXEjvC/nFY808LAnhhkVMOYm4eYZx9ndca9Rqix/nMvZDhP6Q2X79fERSuNeDNdwt2j/Y/lOnp19alEElI/TRunzFx4xcrE6lYGt4NyNfeYACj2zY5KOo8jHYw6yOTu2OZPT5MXY7RxxMUsOJuNQeYgPNUlQucp05iOw8S8MsNY5zvNI/JVUVqXpdITmP6SPZV56HxilcZ8I65hLtHHpb12RTf+GSoKkgfpJ3T79PGN93utxSmntLZlKPSS0Ei14huNqBtaHeYpiVJzAAg8xAmZpabnTURamE42LC0EHa8ai3e8HXKflJ6RFckiDbpy6wSmV0UCey2vb3c487LwggqVNjv7ojzjrclLuPvqDbDSStbijYJSBckk7AAQSmD0kcNEeHSMsh6fCFTC/FzB+MqounUavSlRnUpKuyZJzEDci4Fx5Xh5alysJsL+6ClcXuVFJ8EIMk8rx+LOoIHxEGG5FStflG4UxW2w3MB8yg+hgHsf8AoOcZplSeVifCHHD+BKzit7s6PS5qonYqZbu2PNZskfGLawt6KFWn8rleqUvS2jqZeUHbu+WY2SPdmgut0A3GPLOeRJfWNk25mGvCXDPEWMVD8j0aam2zp6wpHZsjzcVZPwjrShcHcBYAbQ+9JsTEwjX1qqLDy/MJPdHuTGWIuN9BoTZRKoXOKQnQJGRsWHU+XSETzwh3MkevJtjjZWGE/RLmV5HsRVhEuk2JlacnOryLihb4JMW7QeGmCuHraJhmnyrD6B/nk8vtHvMKVe3utFUu8fq5XG6iWPV6elh1LSUsgkgKQFXKjubX2tCDXeILiu0cmpwuuK+stRJveMU9X4ijTHR5JfUlXsdJVni9Q6YhXZLXNqTf2RlSfedflFZ4m481R8FuUU1Twq+jQuq3mY55r/FRhsuID99wLG19bQtJx2ZgFxSjkAOyr/8AWM0p5pGzHpsMPF+5aaMVzNdq1ZXNzLsw6z2ag64sq9q5tr4J+cDK/jRqmsuKCxmA3vsP+sV7g/FKVVzEyMx1all6/wDFv/fyituKGMVsKLSXMg21Nze/hv5QMcUsk6Zpk4xV+B0xJxXS26UtrBUD7WbUeHhCe5xGVOzBQo7W9q8VDMVxbr9wFG+5UdvxiRT5+yrhZNxYkR1I6NRiYnqW3sW7iDFalYZnDc3Wi+itrQz8RsVB5CUA5i4jNfppeKYrU2P3szShYHIVHXbTSGGtVNdSl5VaiopMuFE89RArT00H860Jtamit5xRVqrVRMAw/d0a3J5CJlYdJcKgbafGADjll6GOzjglE5c5tyHKjTGRxq508doh4kqC1yE3nIFnDlIPJJFr+P4Roo86DlCiQQLX/v5QExYpqXcWsLIDqLBO/LmPdEcN9yddFtVKdM1Ls2Nw4nOpR6dPjCHVXwt1auVyNYPevn8lNLKh/F306Qpznfuonra4teFQikxk5WiOX86io7xk2+q4PtJSdBEVZVc22GkYjvZwDbTTxh9Iz2ZVd4LYULhSSCL9IgYFmg1Up1RNrJQoqI8xG6fV9FbQ2B0vAjCTxTVHhf2kJv5XMMSVMvq3Q71NztHFZrq0sNNIBPA59Rb3QVmHLrIBvb8YFvXKjmJtARCf8mLabrOoGkS5ZzslDNvyMRmgFL1B1SSOUSWG1BYOhT1gZOwkPuFD2jjB2uRzv5x0HgtZcBFxYBJIEc9YVBcfaJOcWNgLxfuAVXUMt7lFgfAH/rHB1PcdPF2MsBAOUC/n4xtFwddIwb71ri56xvSixHOASM7ZynLtajkfsie0CNwR0j2m0Wam7LCOyat7bgOo8BvDA3TGZMgkF1XVY0v1Aj0aTZyHJIHysm46QoJsnfMYnpkkMC+XtF8idhEkkrOpJ635x+tGiMBDk2aVgqtf/pGCRodNdhG5Y2jEJ1uADDkqAME6FPTSOOOLicnFTF6elTeNvfHZqWjcDLfXQRxpxmGTi3i8f/3J3fyEPxcgscPRzV/l9KJBIUZCY20OgSfuit+J0qEcRMUpUBmFTmBp/vDFh+jef/aTTh9b1KZt/wCHCLxXFuJ2L0i+lVmB/PMOXcynwb8OYRquN0qkqS2y9MsSwmOyccCCtIypsknS91DQ25wnSVXnJOYS2FkozhJbc1A1sfL3ReXoygO46U2SO9TFaD9dqKQm2+zmnQRfI6ofBR/CLTvYofKVi6cwLV256kVSdos9qRMSiym46KtuPAgiOhuHvpq1iTS2ziumNVyV2/KNOyszAHUp9hf82OexgpnEOBcTVz1p1iZowQtDQSC26lW4N9QehHwhDwwVsYhkEklLa3kpWm/dUDuCOcZcumxZl6kaoZ5wdI+quAuMGFOJSEnD9aZmpm11ST12plHm2rU+abjxh6anFIUc24j5MVrELVDrzsuWHEBopW0+wshaCQCCOel+RBi7+GPpZYyw9LNh6aRjGjoOUtz5KZlsdEu+1/KzCOHm+HSiurG7R0IalXUj6FyVWKdCq8HJKuFBFjaOceH3pOYIxypuXVPqw/VFWHqVWIbCldEO+wr3kHwi325tSCk9RcHqOo8I4eXTVtNUb4Zvsy1afiQWF1EQxSdYS4BZY9xinJSrkAA3g9I1zLaxIttHMlp5R7TWsqfJbbE+FW1vBuRxA6zZLhDyNrKOvxirJHEBNgTrB+UrAVYX1PjFwzzwsCeHHlW6CmJOFuGsbZ3pVP5IqSte0l0gBR/SRsrzFj4xSmM+FFbwiVuTUt6zJDaclQVNgfpDdHv08Yuxiog21g5I4icaAS4e3b2sre3n+MdLHrMeRevYwS0+TF2bo48fp+bVOoOxED3qeRfQ/COr8T8IsPYxS5M0tSaRUTqeyR9Gs/pN/em3vilsU8PavhF21SlMjF7Jm2u+yr9rkfBVjGu9rW6FKak6ezKyMgbbfKINaw63W6TUKc9dDU5LOyy1AXIStBSSB1F/lD61SFzj6WJZlyZfV7LTLZWs+4Q7Yf4AYkrhSuaQzRJc63mjndt4IT95EUm3ugpOMO44N4Fei3NcOeJNSq83VJWZlqW4qWlmmErzPJclkEKWFaJt2l7d43G9o6hoeGJ2vTPq9MkJioPA2KZVort5kaD3kR0ZhTgJhHD1WqblSDlYfCmVkzirN37MDRtNgdEj2rxYC65I0WVEvTpJpllGiW0JDSE+SRDc2Zd+aQmDb2xRsonDXo1V6pBLlVmJeisndsfTvfAEJHxPlFnULgfgnCeR2cYFUmU6hypLDgv4NiyfkYmzeKn5gntZrs0fmM90fHeAs7iZllKuyIzcyNT8Y5j+I4l9NWalpc0++VDVXscymGaStyUki60zZKUCzSANtBbYeUVPiXj1UHApLTqJJsJuexFifebmNWKa8Z2lTjZVu0o/DWOMOInEmYl515pLqtVEWv8AdCI5c2pe+xshpsGLerf8l34p4vdoXC7OqWrW6lKvcwgzXEf19YbW9mS4n4i1j8Y50nsYTU6+SpxWVXjBymVpS2UkkGybXt841/6PpW4xZ1exeWEsY9qjFKc2rLsupIve30RH3RV+MOILynngh03BJGkQcB4iUp3FjTi7g+rqGtuSxCLiB1bk07rlBJOnONeDTLr9QnNmqNomO4rddczqWVG+u97wWpddsxlKrJvsTeEBs2Uq5BvygjLP9kwRmtbWw8to6M8EXwYYZmP+DsQLRimupz6LlGSQNb2WoffCrjqZ7efdWbqUQBcRAwJOJVjGphR7i5AAi/Rf9sfsYzRcUoJT3r2vbwhMcXTkQyWW4Cqp8KeIO/jE6Qf+kGUXtztAe9l9STvEmWWW1BQ098b2tjEnuF8Q1BwUZ1Gqs6FDfQe6GqWnx+92RXrnLKb8/q6QiVpwOUxy5As3ciGGmzWbD0mFex2SAFWtyhMo7IapbgiprUSBuLnUfZAxtN13OuvSJk2suOK235dY0IRnUOQHONMdkZ5O3YTkGU5s4VYC1wN4EYtYJbdWRmUEHvg9PCDEqS2mxI11gZiVwqknLbZSCq2+kX5IMso9mpUserQvpodLwHm+8qwUbgnfWJdIJXRpbUkFpOY8rWiK+jIonNureFJbhN2QyEgWVsdowLwaIISFG0blAWuba+6IryCtQNyEjXbeGFEWoKD0qogEHW3K0BqJ/A6wECxKm73Pn/bDFNSwXLEqJFxcQsyPaN15JIJR2RAJ6gwa4K+w5LJ1OxPSIZBKtiB0jeglRBVe/M9fGPHbBYF/jCt0M3NIvmGUa+UT5VouuAEHKdbWiMGgmyra7mCEqshYuM1xz3gGMQ4YWKGnQADdJAsOUXtgF3+FtJyjIUkAg8+cULh10pfsnS2o/ti8OHzmWalRpZVwT10ji6heo6WHtZazaSQCrflG0DYbRpbVonS400EbOe9vCAS2Mre5Q3rBy2BN9ozUvNe+0DClxu9gV22t7UZ9srmO8dDePTnFcQglQsnnfWMswJtfeISHe6LjU6G0bkuknS3kdYJOmLokBFwTpaPUpBsLW0jFtYHIW6fdG9BClC4BPSG2mUbGWTa+pUY4r45py8Y8YAi1qgo2HihMdvy6Ekg6AxxL6QKSjjVjAdZxKvi02Yfi5BYe9G+54n0kAEkys0Lf8JUJvF9vJxVxgnf/ABo/a3614avR4ZROcUaA04ntGyl9SmySAsJbWooJGtlWsbcjG/0rq9h3EHHPE7+G8MM4Skm3EMO0+XdK21PpSO0dTcDLmuO6OYvzjTSuwWwl6LaM3Ehkdaa5t+u1FLVcdnVZ5AIITMui45/SKi7PRTVfibKpze1TXQP5TZ+6KTrR/wAcVKw2mnv+YqAit2Si4sGtZ+EXFBJJumUaXr5K/CKfo1k1yRUdAH0/bFy4ASF8KOK2u1NaNv8AxIpenG1Vk/8Afo/rCIvKL4Y48UKTLik4WnW2W25iZbnEPOoTZTmR4BJUedgq3lAjCdOmajRJqRk2lPzkw+W2Gm9FKWpIAA+ENXElguYMwY4nUdrUk36/StmInCIhGJ6UDyqssbnlcgRX7A/3CXK4pn6Y4pibZE4htRStmZulYIJBTm3+N4vDCXG3EfCuYlZejYiU1IujOil1T6WXIvqADok6j2SmKWxnIpYxbXmh9SoTKRp/tVQexpRvXcLSVW7UhbDzUmWsuikraUvNfqCi3vgcuKOSk0HjySjdM7iwH6XdBqvZy2KZJ3Dc2rT1pq78oo9bjvoHmFDxi/aHiCSrMi3O0+dl6hJOatzMq6lxs+8fZHyLw3NzVLotQcacN27qQlfeSO7yBhs4c8ZqpQK3L/kuam6FUphaUB2QXdp1ROgWg6EHxBji5/hq5gbseq/+R9aJSfsQc1jyg7J1jLYE28YprhPiyexbw9w7WKgpHr05KBx8tpypUsKUkkDlfLD1Lzx08eUeayYVbizqxyNFkylWOUXNxBiWqWa1lRXEjU8pFjcHlB2UnwsjWx8I5WXTtcM1RyWPsvUDdJzEEbGDrGIs7KmZxCZphYyqCwDcdCDoYQZScOgJvBJM73bX90YlnzYPTFhTw48vchrkJ6n0Zkt0unS8i2dSGUBF/Ow1jXNYodsQVm3ROkLpnAE72gTOzqlA6/CGR1Wab2YtaXFHeja9ipf75aw2lQQoy8o4epv2yf8AywMm66VLJUsknneFV6bWnF9TudDISo/pJiNcxOBJupUbHheWnN2WpRxbRQZmaude8dYEzNWtcXuYFvz19Ad4HPzNyTD44YQWyFPJJkqfqCnW5hJVbM04B55Y4W4krV+X5keyA4q45nWOzVv9o8RyKFC19+6Y414jt563NKtqVmN2m+oDLsEdDlzc9bWgvLToYbFjlteAq7I5WF9IyLxSjYDQiO4o2YFJoZOH8/nqeJEA+0ywbjfdYiNXf49egI/RiDw5dAxBWU3N1SrZ/nn8Yn1ZIU47Yag6iCjGsgMncBcUvKoi+t9fGPVvLSysD3crRi+O/fbziPMr7oO3PrtGhozpkjBM0sYvfUVEFUooG3Oy0wTrqjMvGyxZJ35GFvB7xTi1JVbvSzib8zqmGGoAoChc2Hh8oXJepDU/SxcKO+oc+sb2VWIAHeMYKsDYco9QSXe6YZdoA2TYCpR0EjMUki50grRXwcOyQuVJ7JIseXjASedvKkaKXrcRMw+6r8hSWtu7Y330vAtbFJm5wBKlJG3UxqZNjfXyjIoVlGc5lb+JjxtJCrK0gkCyYhQQLnpe55CBNfsZFZvbukgffBJy5QoJsNLawIraO1klpUdciuW2kWuShnw+MtBkwnLdTadbak2iLMpu4q50vzGke0KYAodPBFwGASee1gIwm1gWA1UNSOmkL8hGlyyjdNiRziOUZnACFAakkRvDee2UBNx1j0NgXCrbe+LsJKwbMIPaZLk6coDsoBrMsknQoWPmINTSiHWze6dbgQES+RW5JWyiVeJtbkIOLIxmWgMqB6fVGt4wVYuDmByMavWFOzJFjdWt07WiQtBKwb3v0gWEj9YlPiTvEqUbAVcHQaXjQkBJSk2vytzjewkZja2nXlCXsGhooh+lQNSMwBEXLgV3+HSSBcKC+9ffb/pFKUlSUqSpR7oIN94t/As0pE3KqNz3gAOYjk6lHSwvYvBoXQkbC0ZE22ta+4MRGXFqaSb2uM1gb2PT4RtKrC5FwdLnWAS2EUjl5msz0sQC92yRyeGb56GJzGIm1AB9hTavz0HMn4biIKpc6aXHzjAy/PQ+HhHetnJ6Uw7LzstNX7F9CidcoVZXwMSlBaFDW/W6bQpmUBsSL6co2S8zNyOjUwsJ2yLOZPwMGpAOI3tzHZnvXHPwiW08FKGo98KbOI3UEB+WDhG62jl+RggxWJV83S6GlXvlcGX57QSkL6WNsq4BYA3010jiz0iSRxsxVfcvNH+gbjr2WdWADm7RPUWsfIiOQ/SFTfjHiJVspUWFAeHYN/hGzA7k0Kktgr6NzmXixhrQd4zCfiw5AH0gEhrjZjMDb1+58y2gn7YLej252HFXCir6GYcHxacgV6QH/wDWrF6uSpxKvi02Y0/vAHH0U1kcV6OD9aRmBYfqg/dFPYqT2eJq2gaBM/MjTwdXFueiu5l4sUM8jLTI1H+zMVPjNHZ4ur4GtqlNf85cXHuYTLe4anNwz4rtnUfkZC/h2kUnJKAqkqf9sj+sIu3hUkr4f8VE30NAB+Acij5U2nZYjT6VGv7QiRfJT5Lbxix23DnCjgHs1Cot/EtGAHDdfYYokjsE1KWJ/lw0VrXhlRc2yaxPAe9DZ+6FPCR7LECLcp5g/BYg2v0rJfroicQpJScd4kuLD8pTB+LhP3wZrff4c5CSbTsooacuxeES+IchnxvXnALpVOOKv1vGtyXVN4RdYGqvWJVVvc6IY49oEZXYJwPLkziUC91O7H9RUKeGWUoxBRFgWtMs6+8Q94ZZ9UqcmobLfSCbe4/bCVSk9nVaaQbEPtWI/WEBJbsKL2R9OOArmbhBhZV72l3E/B5wRY7L9vdFXej6/wBrwew+dO4ZlHwmHIsRtzUGPn+a1kl7npor0oNsTIvcaGDMlOWtY6wsS7ljvaCUs8UkRne5aY7SM7oNYLtzVxvaEuTm7W1tBhifBtrpGLJhTZrhMZFuwLnpgC4G/WPXJu6dDygVNzF76wGPBT3JOe1Cu84oYwqir91UhKgDycmL/bGqYWSSTEd5xacZzguOzXTGVeNw+8P/ADCMphwkR0KMzdvcjOuW3iC85vbSNr5N4huHMfCIQ1tqPrSPG4/mmOTOJSCKvMlI+udY6tBPrLQSSDnGt45i4kS4TVnwQLZibDTS8OwbZAmvQyrnG7ggkkk9N4izisjZG0E5lsIvte19NoEz5IRvbU6Wjvx8HOlwS+HLhViufSTe8lceNlj8YP1JtaXVkAnmeULnDNZ/fs6k69pIufJSTDdVs4dXfQjQDr0gpbTAW8BVfbzL2IHS8Cp6yEEiw0OkGJlrKrVRteBFRI7IjTUc+UMTFpA3DThTimWBI77bib+Fob6lcFVknXryhMoZy4sp9hrdy9/1TDhUVkKPwHn4wE+4uPaAl2BvtfW0YA94236xsWgKJ1MYBJSs7GCXBRrmEZ2lC9iRoYlYYB/Isukcrgg+ZtEclBSczgQpKSQCddolYWTalAk3AWoA219qLlwUiWtQAFuWlzziMy8tSypYJbtsYycbLk8FqICb2CSfnG0tBToSOtoqJbNqnUqZJHMXgbU0Zm1E+yR8YnoYLTOVVjuCOcQJptSWVDU9CYLyV4JWF1Z6bJWF8revhrp98S5xtWdRsRrEbCCj+QmEnVQVbTkLmCb7agSSdAfdCW6YaIjbKs4O1x5R+W3fvHU2iV2fseVrxryKzAgXGusC3YyKoFzKLuo08BfaFiZQRV5XKSjvKFwddodZpvKttRHO2sKc22BW5YbDOsX9xhsHbBmqQwSjSM2xtyEbyQVAW13jQLI1BJNraiNudSwm1tNLxTIfnAUKKgMxtt4RuQvs+8BcHaNdyo3GnlGbQJOt9/hC2FEY6O6UvJI6aRamDV/4wlSrYOJsfhFT0cqDiQNievKLOwqoJm5W9rpcST1GscvUbo6ODgvxgkNi4G3TeMwLEbnTaMJa4aToSY3aAg2200hUeBXDObewt3QQLx+7IEC425xvWACbneMkIznbb5x3TlMjGXsb8z1jWuXN9gT0tBDIMuibabxmGgo3IseUQqwQuUNyRz30jFMqRcW1HheDPZXABFwTrpHqJcZiAN+kQFg6XadY1acca/VVb5RzNx+W47xUqi3VBTi2ZYk7X+hSPujq5EsgixGoO8ctekU12HFWfTYj+Cyp/oxG3TbTE5N0aOCDyGOJOFVLX2aROEFXTuLiN6QBSrjHidSVBYU60rMNQbsNxhwiP+X2GepqCE387xlx4YDPFauAcwwr4sIjZf6lfwLrYYvRnf7DihQFAWPYzIHn2aorXHZCca4lA0Aqc1a/++VDxwFmVSfEHDziQlRHbDKrn9GuEfHhzY0xGogAqqMyogG9ruqMS/WwWWtwmcKsH8SWR/pcOq28lxSUur+Ey5tp2iNfeIuThO4RQcboBBK8POaX1JCVfjFLS6z2rGuyk/aIKHLIy6K26G+GVMvbu1uaF79WUfhCbh58JrLhCrWmGVan9OD2JZof4PZZq9iisuKt0BZEKFAe/hkwdT7B+CotS/TojXrLL4gD/Keq2tm9ZKifcNIg0EF2VmUKHdC2FX6AKVt8fnGniBOWxjVd7Z02F+qBGOFpgJamyQLFpBUT4OCNlpqH4MqVKRvdaEpVaeE3Qn1gK18VgwimV7CdkT+a6nQeCodJ6bD1RklJ+q8Bp5pgLVJRKVNKToA4f60SS9Ui4Ooo759G90L4NUXW4D84m/8A/IX+MWWDY/dFTei06HeCtMUTcevzqb8v44/jFq+yTHzjPtlkv5PXY94ImtOEbwQYe2te8B0LKQIlMvZecZgw+w7YA3ic3M8r2MAZd/S19YmB/TnAE4GcTRLabnlECZf36xqbmM0u3r9URHedve3zgiACbWEYybOU5nKUtObl3ZhBt59+N718utzA2oPLTjSlgW7JdPnM3mHJYj7TE11xRvv4Qb8Akdw2vEN026xIdOXci8RHDfX7YEI0hy0yzqb50gxzZxLRarzF06Z1b+e0dHKP0ze/tpPzjnriWgu1eaJJUnOo298MxbZEH+xlWziAm97AbbeEAKinKCb3JubHlDTNt5UG4FyIW60Bqdk5RoOcd7G90c6fB+4aLy4/YSrZUm/p490w6VhBS6oWzaAknrCPw2F+IsiNs8vMAfyIsCsn6WwOtjcn77wzI/X+AMauAoTzakAEHU6AHrASpKK29DqDYmD1QGbKbbEkQBqOjRtpa5vBR3AkCaSr/KqnW076hcH9Ew5z1lAnUje+99IR5F0tYhpzgNlF0i/mDD9NMLQhkqG6QTbrEycokd0Ly27KIAPO9zGCgLkjS8SJxKklNhpfURGKtbXtaLXALMHQFJN0jaxiXg1sLpqlJUdHlJIJ0teISwVtqsdLawQwIgmSmb2ypeUALeN/vi5duxS5CNQYSCk2AVzHSNTTCc6QCdOkT6i2Q6bgAkAjy5mI6E7BI15wlMI1OhICgU31gbP2S0pISQTr05wTdAISSPffaIk0gOIzDU2trzhiZKPcFtk0VJPsgkWPLvKgs73XFp5jUawJwaAqkKRa1nli52NlHSCk8LrPesbXtAS5CirR+StLgBvca3IjNKbNjTW2oH2xpZlynY+JHiYlJQVBFgOhJMLe45ECaQStrQb78oTamkpq0qonvdt3vgYfJ5hSlNJCync6C9oRq42pqpSqiAQX03A15H7YZj5BydofQjMoG+hG5jYoFPjHqCUob2ChyPlvGZSRY8usE2CjxZ1T1OkZsuAKAtv8o0uC5PMeUfm0O50adwbmAfAxIY6YoFYze63OLBw67aYZvpdSdLeXwitpMZS2rZXKH6hrJWMyiQCCLeG8czPwbMJ0fJuBTI087Rv3OU6DlEKmrK5ZCt7iJhuT47xlg2A+Tn4JAB5bmNjTJGuwPLnG8Jy/C4EbmmVKSCToeceio5FmptoaC976gRmloG9xfy0iY1Jq3tc7EjUxKapi1EEg28dINIW2DA2DuffePUMZT90FvyasN7aDpqI8TTlo0y5RzPWCoHqRBQwCANLb672jlH0mmuz4rvWFs9PlVeHskfdHYsvTnezTp4kRyV6WEuqW4rt5xlKqTKnbxcH3RpwbTBk1Qo8IDl4hYV5XqbQ+cTfSMbLfF+sgi12ZU36/QIgbwoURxBwpb/8Adpf5uAQwelAyGuMlTF95OUP9EPwjT/yAeCBwQJTj7D1he7ridR/s1wo8Q0dnjvEqNBlqMwP6RUN3As34jYZT/wB5cSBbmW1wscUG1N8RsVpIIKapMaH9cxOMj9iPtG7hejtJTEbe96I7p4Wipm+6WVdCk/ZFvcIEh5ytIPsmiPDUeA/GKgTfs2vEJgoPeQMtiyMQP3wSlGXUVXNe/VoiFigKPrM0b2+jH9YQxVnXBLxvompI+bRhUorhTOTA/wBkdPeIkewJ9478RHC3iueJIIUlpVxz+jTGugzARTJxROUdinX/AIqf7++ImPlZMSPC+7LSrfsCNVHezUqZG30RPwdQY0RdqImuSc3Mkz0urLls4lVuXtCMqo7dYQbZkurub796B8s+r1lpJ0AUk/MRuqzoTNupHJ1fu7xhl7tsXWyO6PRIV23BGUubkVSeGn66T98W+sWIBimPQ5dS5wPTY3KazOg+F+zP3xdDmp00j51q1Womv5PV4t8cTFCtTG5CuW8aQbEgxsB1jKhpKQ6U2iUmYuLE28TA0LuYxddATAhjUy7eWa1t3RGhxw6xDp72aQYJP1ecZOu673grB2QMnkXxTSnL6iTnE25aqlz90SXV6bQMqE0UYporenflp35ermJbz3d6Qb4RRocdKib6CIzjt7/bGTiwT1jQtZuSLRSVg3RgsgEHoofbFCcSmimqTR3s4bRfDqrC566iKR4lNg1SbFyfpCIOG2RDo9rKomUE+0QTe9xC3XG9TY2GXpuIbpxAHkBt0hVrRvpsSLR3MT3OfkWxF4d/RcQqSNRmQ8P6NX4RY1ZZBdUQAADbpFc4CIRxGoWuhccTod/o1RZGIj60+2SNA4bW0FtvvhmXaaF4+wUJ5JTYaGx5beFoW6m33VAC1736wz1JlxRVZRQCq55aXhdnmjlK76EQcWLlyLUunLW6b3b/AMITFm1JjsmEAghKSLnoSABFcJARXaVy/hSASeWsW3WEo9WCCARnCr/ZA5XugsfDEqod1ZATZKdPExCte94I1ROUuCxuVX8ffA5IJ35c4tcAyVM9DRyqtobaGCGCHLy863pYTKjf7YitG2pOm0TMBsJz1a+yX/uB0i5P0sqK3C86khetyCNLmIbXtWtYWO8F6i2hICt9LEb84GhF81rk3sRCkFJUyDMFSc9xcAxjMq0UkJB0He5RJcTfMnLfrGl9gpC9Nk2sTzglyUR8Kgfk9YvtMudzqc0HJtkOpBUCCNNeUQsCNFbM41lK8syrxtrvB+pS+dv2CSN7DxipvcOC2BjSRZJtcjpGxNk2KvZOusbEJSlskp9o6E6XjwIASLaFOp1+EBwhhjMHQKzZde6NoQ8QJAm5YknSYTrbSLCfAUUXsfE6wi4rl1MTActol1Kxz52i8TqRU+0ONCyAUgEG1iYxUlY0JzEbkRnJJ7RkZR3dBe+8b1oSlVybi255wbBiaENpIFxG1pIBTpHjagT89Y2WShXeN4U2NRJZQtxxCm1WWCbXh2o7pabF7ki14T5NQSrui9wYaaSkhq5t005xky7o0YmdK0NYVTpck7pBB66QSsb21FjygVhchykypBIBbSbc9oLAbRhjwVLllOy8ipQNxYW1PKCUvSs1hkBI+sYS+FXGjDnE0zMrLdtTqpJIDk1KTTZIQkqCQsODulOZSRc2NyNNYt5iRzGxB0Ot49Sob0zhuVAmWpNzZIGa/TSCTNHvqQQBbU84MSkkkDSx1vtvBFmXFh3dd40xihDkA26NceyD0Ija1RRe6k38bQwoY5adbmNqWOVtjzhvShLkL6KKhFroA1toLRxR6bkqJXi9TkpTlCqHLKty/jXh90d+JlyLD7Y4Y9PmXDHFfDyuaqAj5TL4g4RSZFKymuEw7TiPhJtJsVVmUTr4uphw9LqUMnxwqCSLZpCTV/RkfdCXwmcKeJeDyP8A98kf/uECLS9OaT9V48L7tkuUiUKb+BdH3QT7hv8ABXvA1duJWFuV6hl/mqH3wK4woLfFXF6elSd+6CXBMX4o4PTvmqzI+JjHj2wJbjRjJsDafJ+LaD98D+8gY4G9+qVNG6lUWYsB+zFOoP0DfPup+yLj4AArxY61YHPSZkD3BJinEA9ijloIkOWW+EWHOntMAz55ipMf1FQpU1R9ZdsDctKGnPaGhYCsAVg32npZWnkYUZBWWaUL2+jVr7ouPaynyOPEZOSvtq/1kkwsfyYHUly1NnACb9ivbpnRBDiQLVWmL5Lpkur5EQIo7oEjOJPtdi4R/NP3QzG/Sinyb2ZkuzaSTqAn5ERvrbw/KM1YjKH3LfyzA1pzK4T84k1/uVSdSBYB9z+sYamAzuf0JVl3gvPAn2K7M+67TBi8nCUq625xz/6DDxXwhrw/1dect75dkxf7yr622jwWsVaifuemw/TieBdzv/ZHoVa8aSpJ/sj8FJ6205xgHo3Z9dtI1Pvd38I1rcy87iNMy6Mt7wLCD1Of/gLVumpHnGa3CL6xAprv8BaHhv743rXt4QaBYLqq0IxNh9RBK1InWwQNB9G2rX+REx14WtvbnAysKc/LOHSkjIZmYSu/Qyrp+1MTHdfjvtBvhAmC3NbjTzjWOZPwj8oW1jErynrFxBZi/YpNtDFJcTE56tMm4F1m5tF2LHd11ij+I7t6rNEaC53i496Gx7GV3NqGVRNrAQp1ewTc3sRcGGqYNgq4FiNhyhZrCm1NnUXHO8dnFszFk4AmFSUY/wAOEXsZ1KPMEEffFw1xrsnnSUDIk2APxincNryY8w5YEWqLOvmq0XbiiwUoG6UXVa/PpDM79SF4u1iDUlB5DuUBZANhtC1PMOIlUhQ7xNinpDJOshC1kEBS+fTrAepXzglGXKN4kWSSsVJxARUZFQ3TMtHMNx3gIt+sg95xVslrg8jFQVdX8IYI+q82fgsGLorjKnGEgJsk2Ai8zuisa5EKeT2jixrqbg2tEBDQQLa25mDM41ZefZJ0v7oGuHN4AdYuLKkaw3pva/PpBDAreZ6rjo4k/wA2ISQcpNon4IA9eqzRJUolB8DpDH2gLkLzySXUgnrEUAZiQdrjWCU5KBD5AFrjMYihtKwskaDTaEphtWRG0hSLnkIjTORZUNAFC9+sEAlKUlPMix/GILqTda9FJCSSSOkEmWlsZYFN3KglIGjyiR4EJMM842paVd3lqb2ha4fqBnKoFHXtQSNvqjWG2aSEot1O8LyPcKPALS2CbHbodIwU2kkiwB+cS84BsRp4xGSgNuKCdSdzzhd2EjW93LWIJHICEXGSVJLhPJSLDwzCHlZOYgnS3WEXGBUUvKUSTpZXkqG43UgZ8BuRcKG2030sCSOkZrzPAApykbRpptyyi+mp0+yJaipBSToDyg2VHgjrBACb62tbrGdwnILFWoMaluXUkhNidST0jcklJz++0BIYEJIFCgfG1oaKeuzaSknQbdYU5ZYum9wOgg9JrKNRtl5coyZN0Oxvc6awe7noUmdb9mm+n6MH8/Q2EKuBni7huRUbqzNJ190MgOwOsYknQUuWcB+i1Oeq8QMcoA0foC0KB2Nphg28YO8J/SxqGAJhNMxcX6xhwPFpE4nvTckLmx/2qB+ae8OR5Qr+jWn/ANrOI0XIC6M+LDn9IxFS4rQEys74PrHzVHrYq9RP2X9nEk/0o/k+sVDm5WsyDM7JPJmJV5OZDjfsqHv1v1BsRfWDCJcWtbaONRxyqHBrF1Em0trn6BUJNpdRpwOqh2bdnWidnEj3KGh5Edi4VxHS8ZYfp9bos63UKVPNB6XmWtlp5i24UDcFJ1BBBhmKXXHqMmaDg6JXY964Ebmmcp25XjcpqydI/ISQry5RoRmfJm2xnAuI4Y/dDpTseJuEnLABdBUAf1Zlz8Y7wZHdAjiD90VZAxxgZzUE0aYFuWkz/bBrkuHccz8Opj1THmF3rX7OsSSjbwmG4vX90FlTLcdpLcBVEZsTzs++IoDCLvY4qoLnJNSlFfB9EdKfujbQTxsoarDvUP42m34F82OfKKL4KKDfFjBV761qVHxcA++CnpNSvqvHjGaBbWaaV8WGjAfg+cvFbBR2/wAeSX/ORDT6WcqZb0g8Xg2AWqWcHvlmvwiq3sLyR/RuQHeIbbZ3VTJwan9ERTxRlbtpppFy+jAM/F2mN7BcpNj+jv8AdFPzCcrjqei1D5mIuWWOEsc3D+ui/szEor5kQpSuj+vNJ190NdP72A8RDmFSp/nQqMfx48jFRZbHLiOLrw67/rKSzsOhML9KXlYmRbdpwfIQw8RATJYTXf2qSjfwP9sK8grKh7qULH82GY+1Avk3JVZSj4GJlbuanPAkAl1djy3MDgrur1t3T9kS6+vLVJywIu6SAfHWGAna/oHu5+FeJ27i6K6D8ZZr8I6HeNkkHWOcPQDV2nDrGQP1aywfjLD8I6OmAQY8Nrf8mR6PT/SiaFKtrGBVuY9Oh6jpGs6mw3jA1uaUeqXcbecR5hzu35R6VZYjzSu70sd4ANhqmOXkm+ov9sSHHtLDSBdKcvJpAOmv2xMKrxaAoF1x9aKnh0p1SagpKvAGVmPvETy7AvEKlpfoS0lIAqrINzyU08mw96hE86i+o90NfagfJ+Wo9bR5m98alDU/YI8SNfC0FFbAyNjitCNooriQsIqszlFgTr8YvOxIGmnUxRPEayaxN5yblVoJKpoOHDK2m3M4Nzcj6vSFyq3DBIB10090H5oFK12RqdTflAGo/wAX3iRpaOvjMct0A6MQjFWH3eYqLHP/AGgi+8RkrdISLoUpR28Occ+S7pZxHTVHZM9LqFh/tE3joTE6w3nVp3c2UE/GCzdyAxcMr6eBUparapNr7wGqCeatAYMTakvKKEnncJMDKg3naAB257RUWEJdcshSVnTK4lWnOyhF41Hu0suKupJQbX8opHErZDC1DRWh20MXNMLDtFaTc2UkKuYvLwgcfkTqicwSARbQaQNUjMokagbWidUEhtxKLm55CIjaLKKtRaLjsiS4IzjhQnT4QSwGCus1BO4KW1kk6cxA2YSVDqNrQSwFmar8+LmxYQTbzMHJ3Fio8jbPNWUbi9hvvAt4JbQoBOt9xBuaQCgrzaLtubGBL6Abjle2u8Z0zQwepIBB0CbWAAiDPFCVKAJuUHTqekFcgAWM2w+cQpuVDyhbvaEAw1FGrASizVamFA3ui4vsbQ4zYOZIJ2F7n7YTMHJ/x7VGr27qDptsYdJkAN9D1EBPkkeAU4sEhSNE8/xiOoqU+opV3SLZY3pBzrA1TbnEN1CjNdwgHTQ7XgAjJ1W5sNBtCNixwlt8ZrqAIF4eHu4FpUo3TpccjCRitgqYfVdJ7m4MMx9wM+0YKbLZJRKjYaDfePHV2eSOWxO8bJBK1SCNLAgaco1ziUlxOw+rfxhr5BjwRkPBa/C9hEgK7o1AiKE5CqwvrvGxKkrOmkA1YSCUqtQUg/KDsk6C4LfW7pFtoWZR4IHe0Ig7TnrHW2mvyjPNbDoPc6U4dKCsMSBJGbsxz87Q030tzhL4XuZsLSWoPd08bGHFSslibEnYdYxLgOT3Pn76NOvGKrIt7dImLD9pk/dFV4uA9Vnh/wB4WfmqLQ9G9wJ46LQL/TU2aR/MQr/yxWOMEdmKgi+0y4P5yo9XH/Il7L+zhy+kvdlv8a0KWzhZSibmks8ufZtxZ3oKYwfwxgqrqmX1ro35aLT7SiVCXzMoIdSOWvtAbjXdIiteNPepGC129ulNan/ctQ6eh3L9twsxLpm/x3Yi1/8As6LQWkV4V/55F6x1Jnd4cJNxYpOxG3xjJOp8IrzhPiUz9Meo0yu8zTsqWyTdS5cmyCf1SCn3JiwAqwuNCY0owck5saW2Fo4k/dFgP324CVob0mbH/wBQn8Y7UQ9muOUcY/uiLNq3w9mL3K5Gfbtbo60f/NBIKHcckUNWSuUo6aTsudf96iOp/wB0kZycXcLPgaOUV1N+Xdm3P/VHKMi52VTknBbuTDK/g4kx1r+6S3PEjBjlh3qTM+/+FE/fE8Dn3I5r4ZKKeJGD1DcVuR/+4bix/TRlvV/SKxGP9ZLSS/6BI+6Kw4euhrH2FllQSE1iSNzy/hDesW56cbXZ+kXWjawVT5Ei/P6Ij7oELyLHovOFHGrDyAfbRMo+LKz90VPUUFM/Np6Puix8Fqiw+AOJabg/ixQKvWJsSNMl1Pds+pClZQWVpGiQSbkgaDnCHWFtPVSecZVnYXMurbUdCUlaik28iIhPIwUVWfB2J0nk1Lq18FwqtH6YX2gvT6oZKkVSUyBQnWkN3N+7lVe8BxcOCKSpsIeuILZ/e3gd386mEfAp/GE6UUW8501BFj4i0SqjU5qflJFiYeW41KN9kwlSiQhPQDltEJkXzWi47KijaBmSodQREiuzaZuemH2xZC1AgEa+yB90RknaMJo6aw0pnav7n27fBuO2yboTUpNVul2Fi/yjpqYIIIBjlj9zzez0XiCzfQPyC9fFD4+6Oo30EJIIKRfSPFa9VqJHoNN9JERahr90alvW157R64N9N4jLuDb7I5r4NJs7TNvaI02crd97aER+KykEX8rRHmHbsqvvAjEwpSVn1QA/nH7YnFd7wHoz15M/rnaCGY/Da0QFgvGM7KUyRo0zOvNy7Sq5IMsuOqypU6t3KlIPMkFWkGHkKaUUrBSobhQtaOFPT5deHFjDaO0cDJoaFhvMcoUJh4ZgL6HbXeOn/RufXNcAMBuuuKccVTjmWtRUTZ5wbnyEdOen6dPDLfJljl6skoVwWITfUnlHqDZI6mPFDW5taPEq1AGh8YyoY9zaTpflFC8SVFNemhqbLOnui+SdDpyihuKDmXEE3+aF8vKDXcgo8MrabvlcuBre0AJ9HcNyLAWgzNrJKv73gPPajQED7I6kTLIVp0Fudk3B9WYa1HLvpjoLFzZdUQhYBvtfW0UDVj2baD0dQT/KEX1iModmgb2WNRYxebegcXkSJplLc0o6BVtrbQMn3FZRYXB12g3PIAfUq1+pPWA86wlSVqKiAoWIJOsBHkJoTcR9+UdJ1ISVfCLfdQpylyhF7FlB+MVLiBgqkpoXv9Gon+yLjYR6zhqSP+lVKosb/oiDy8ICHLEaaaU5OuL2AJA8LRHDQQogaDf3wXfY7MOKIIzKsfOBjySld+f2xIsuRFcZCyeZ3tEvBZT++SbKbkLYSPmY0BRbWFDUeEbcKWYxksouU9mSEnYm8G+Ba5Q+zYQ2gkWTc723gBUCpSlklKrEEEaXHODFUVnQnSxJ2O8ApgqU6EpuAeZEKiOZpaUcywQNeY1jVPtdxCkk5hsNheM+zUhSiD46HWP00+EsjMRptfeCreyiNg5GbFE8FXGZlKtOusN00MiHDlOnhe8J2F3Wzi2ZOp+gB/VNzvDq6kBKj7Q3udoqfJIgV4ZUocBPS4O/uiI5ZNwNNyRbaJzzRSLAAX1Om0RJlnPcg3ikyEMvBJXqQDreFrEmV2QfNiLtnUweWMyFpJ1Rprzhfrqimnu3BKcqvshsVuRvZhiguFVOaKlAiySB00jCYN3rX57iI+HF5qYgqyhJQkj4RIfAbIUNt9Yt8gRe1GKhkPUE3sY0KRbUW2vGxS72N/G0YXGnMCIGZy7uVQv74OyC8qhbQ226wCaTc290GZDTWx39q23jCJ8Bwe50ZwmdCsKy97EAq36gmHN5QGoObpcQgcIHM2G2xoVJWoXIvzh4fWSDufleMCVDJcnAXo4OJTx+kE3sVyc0m/iWD+EV9jdvLN1VJtpOupNv94oQ9ejwrL6QlAG2ZL6f/p1wlcQEFqt15B3TUXxbp9KuPVpf7h+y/s4j+kvdlo8YLKwfw8f5rpKL2/UbEWL6FiO04Z4tTfatNm1+suPwit+KCM3DThu7uVSJBPklIt8osb0J1kcP8aBVsoq7JFt79ifwETS/Sr3/AOxes5f4LpotUVhrGEhPEqDCnBLzFhp2bhCTfyOVX7MXtmykgnURztXkiYbeRsVpKRfxEXXhWrqrOG6XOqPfelkKXb86wCvmDGlM50NxiadF+kch/uiCM7nDt3YdlUUadby5jrZtVz49Y5Q/dC0lVL4eLsSA9UE35XyMfhBJjo9xxXoHGjyC0n+cI7C/dI7qxXgBRH/6dOi5/wB82fvjjibVkYUpJ1CSReOyv3RVfaK4ZuKN1qlJy5639XP3xBr5RyVhp/1bEtGeP+jqEsv4PIP3RfHp4ISn0gpoge3SpRWnW7o+6OfKevJUZRV7ATDRv5LTHRvp8NpHHRhxO7lFlyfc8+IovyVdwApsjWOMuE5CpSjM9IzM2pt2WmEZkLBaXYEeYB90JWKJREliWsyzSA20zPTDSEDZKUuqAHuAEOXAV1xnjVgxbSO0dFQSUoB9o9muw950hQxdMKm8V1x9TfZLdn5ham/zSXVEp917RC/JlSqR+U6dVJjtuy9Rlw/kKb9p3rEXvpAkizmmpvBzDqVuU6uhDqkASBUoD64ChoYB/XgSwtUKPNyNIps8+wUS06FqYcKkkLCTY6A3HvAga3a5hyxFR6fK8McJVBhoJnpl19Mw5muVBJNtOW0JiSLwSIbBcHrGM4CkWIsbA+4i8e87RnUjdSDa12m/6gg72KOuf3PGYTk4hs/Wy05y/vfTHWc1oDfXzjj/APc8HgKxxBYOhVIyLlx4Ouj/AM0dgTKcqT0jx/xBf7h/g72md4kDHBtYcojOnUxJc0JtEV7U2jms1I0KItrr74jzIHZq01HSN6r2I3HSI80Ltq8tLQDCRnR3D2SuVl/cIKJVz5c4DUk2S5ckd69uUF0r0tvA0U+Tib0+0W4lYScP16IR8Jhz8Y6O9F5wOejvgMg6CScSfdMOxzx6fqT+/nBbhGiqQ6n4TCj98X36JrnaejpgsXvlbmUW8pp2O9l30OP3/wD050P8if8A59i11quT4x4le1zbyjF5ZF/kTzjW2sKsBraOWkaybcgXBig+Kt04jmwNwr7hF9C5RfaKE4skDEs0Tqbg/wA0Q2K9SCXDK1mVErOhSdTaBk2CWzr/AGRPcJU6vTQQPmrrbI+6OjEzsU63rLq3vnTcctCD90XzWMqlAk2UpIII5X5fKKDrRtLvXvZSYveolKpRpSu84pCdU9LQWXhAY+WLUyA5m1I3uLQLmmw4iwGYWG8F5kAKusbjUeEDXklKd735iFRXkNihiRBErMJsAezUL25xbVEcC8LU5wgkerNg26WEVTiFClSrwFgrKb3PKLLw3MLOBqQQoJUZZItvsNIZPtQMe5gaqaFQ0JHKBDxKldCInT7qnHnAshTgNtNLxCKiEjMbknlFR4LZgpF06e10Oxj9hy6cYtqBAUphW3LWPc2ZRH11A2MY4dTmxTL5jr2DhF+gI/GGeBdUO1RKnLqJABA+MCXGzlJBJ6wcnLGTCj7uhgU53UGwsByOkIToawbkCTYWHjEefl1ut5Qopt3r9YmrOT2tP0o0LIVsqx1FyNoYnZQPwm32GL3UqXquWHv70PkwEgGwyi9iIQsOBTWM0Kvcqlza3gRcQ/TBSpQvormL6xU+SR4BT+gKhqNrCITgug5dLnWJr7gzWSLanf8AvrEN1N05r2vAFg52VSkK5A7crQt1mXKJVwKGYKCue0NMwSQtKbKI6wCrbQEusAG5Fhfyh0WDLg14dQDSZRV9C2PsiU+b20BiFhYhVGlQtZ7qbeES1p+lPMX98E+WBF7EZSiCQdukeAWHURuWmyjcWjSCc1vtiDDY0qygb6eItBaSdNrA6nS/2QGRqoC9oIyRsSSoWvz5QuatBJ7l/wDBx4fkFYKgkBxQFjD+8vS4J0Ol4rLg9M2o7gsQe2Ve/kP7++LCcct0jClVjJPc4E4DqKPSCwsb+06tJt4sLha4lpKMRYjSR/8Aqcx/zVQe4JqycecJG9iZoD4tqEBOKicmK8TpttU5jQ8vpVR6lL9d+y/7Zxf+L8lkcS0D/BDw0WbXEs4mHr0IrjCuOeafylLC19AS05r8oReIIL/A/h26Rqjtm/fZX4fOHj0JnAMM4+b1BFRlFfFt4RNN9P8AL/7Favd/hFy1uyVX0B6++LL4Xu58F09JObJ2qddxZ1YtFbVpWpum8WDwsX/klLi97OvD+kP4w4wYx6aNiNhyjl/90Dt+9DAJvr+Upwf0DcdONL18Y5n9P5vPgPBDt9E1eYRfzlv/APmLQ+PJwvPd2WdN/qK+yOzP3Q1suU/hc/8AUMvNIv49nLGOM6gD6k8Db2F6+4x2X6ej3rOA+ET25caeVfqDKyp++CQx8o45v2agrmFA398dKenmhX+GCjvK9l2gskHyfev9sc0TN/VniDqEE/KOl/TnJXj7B7p1z4cb73U9ssn7Yoj5Ki4JOlnjLghSTYisS4+KrffAriox6pxMxczuEViaGv8AvVH74l8Inew4s4Lc5prMr83APvjzjI2UcW8aJOpFZmtf+IYovyD8JpC5LEI6UxZ0/WEL50hiwYe7X0g70l4/AiFpRsBFLksa6pdXD2hK6TLyf60LCTZUNNQRfhnRl9J50a/twqg6xIcFM2g2V4RtqegYJ5y7R0/ViOFfDrEmpXCJUq+tKtEX6WI+6DLOof3PNdsW48Te96TKn4TB/GOyptW+4tHFf7ny5k4h4xbvoqhNk+6aR+Mdpzi7HQm3jHkfiP8AkP8AB29L9JAxehPSIkwRfx5RKcN1EbiIc0oJJGwEc41rY0m9jEWYJLKraG28SCdNYiTKj2a9jpeAaCMaSo2c3PeGvugulRHO0AKU6brBNtfODaF2tqDpFJFs4/8AT/Sf3x4DV1kJobf7ZP4xdPoguBz0dcKg65HJ1H/1Tn4xTvp/oH5S4eL5mWnk/Bxo/fFt+hwu/o80IX9mdnk/05P3x3Z/4EPf+2cxf5Ev/PsXA/so87WjCXI110EevODKo+EaZdY105aGOWjYwo04Cm14oTjDYYlmj1CTvv3Yu5D1hbpFIcYe9iN87ns0kH3Q2HciLhlYuKIWQBbziBNAgEggix3ibp2p8bxoeRdJI1uOcdJGcUq60RIzRJI7htflpF2rUpymya7A3YQon9kRS+IE3kpjKP8ARn7IuWXUHKBTtwkyrfeH6oisvCJj5YInU2zlQ1gXMLCQMwsAPnBady5VknbygQ+oNKVkSVOEaDkICNUE+RbrKO0lnrjvKSSIdsIq9awhTUagerpFxy/vaE6qo7NlwKsVFJuOl4bcDKIwVT7EFXZDy3MFNekqPcR6gwSsrUmwvuDAlxndYta/KDlRSl5xSTmK7XsIDuuhteRSD79oGJbIoGbnqDGdBSRi+QQTZCmXE6b8ozSyAtWU6HpzMeUhQbxbSVXuCVg2/V0hgDH6aQSwGybWGXTQGAUyoNLF9Uke74wxTpCWQcvj74Xp5AL1iNQb2hIxg9wLceXvtHhl7JI1IA5cokOIUpalKURpoBGlwKyEXUYagQRRCf35ME85deh5aiHdYKVk5dhvCZTED9+coFKPeaWNORFtod5i2pPdvbu3ip8okQTMZitRAsb7RHUTk07wOu0bp14oUNcoJ1AjQ6/lbTa2gNrwNENCwpTqlDS46wDrYJZCiDba3Xygy65ZOwGmpgHWHT2KUAa5gSb7f3vDYreinwRMMXTS2bEbEE8t4IOCxJAG+/WB+F12piBYXAUNvExPI130vBy5FJmGUZrG4vzjUpGugJEb1JJNhysdIwNwk878olF2aUEDW9/EwQlgUpsdSYgI1XYjW8T5fukW1tC5DkXLwgdP5OmQTcJdPnsLRYy19wc+QEVdwiWpMvOAakuAnN5CLLUomxOh3I6RifJcuTgTgsf/AG7YPJ5zqN/1VQO4upy40xYm97VSY/5hiZwdVl434QO5E81v74jcZgG8fYwQLWFVf/rmPT1/uH7f2cj/AIvyWLjs34EYCUDYIfeT77Lht9CXvSXEMX/7TIm3umIUcdAq9HzA5/74780rhn9CRwlXEFq+gVJOWHm+PvitN9N+7/7A1S3/AAi+K2AQoA8oeOFKs+FUg3Fpl4W/bhJrCALg/AQ4cKlgYfcSbnLNve/Y/fDDFDZ0WC2rUa+cc1enzc8OcHG4uK47fTf+CqjpFk3sLadesc7+no0FcJ8NOEaorwA98s7+EEnuOSpnB07/AJq+NPZV9hjsT01EhzgnwXe1KgykX8DT2D90cdTYzMuJ6hX2R2B6XrpnfRx4KTWXLnaY+dOb/CDCfKOQJtVpN48+zV9kdMem08X63w6mFWHbYdBJHXMk/wDmjmabsZRz/dq+wx056ZxDslwnfCSA5h61z+qwfviyPko/hcoJ4n4ON7f45k/+cmJ/HhHZcaMcIta1Xf8AtEA8DPdhjnDbl7ZKrKK/p0Qz+kbL+r8dsdoG35UWq/mlJ++KL8gHh+gPTdYbNu9SZkEe4QqA5kg+EOHDRIVWKiOtKmv6ohNbUMiPIQC7mEx2mO/wmkFk95uqLT8Qo/fCgRcCHBff4PtL/Nq5HxSYT+WkSHn3Iz9sIl1IlTMhf/4RAA8lrEQ4nVP/ADSmnb+CAfB1wQZR0V6ADvZ8UMTN6/SUBX82ZZ/GO25g3Bjhv0CHez4v1hP59AmBr4PsGO35lR1vHlfiX1/wjtaX6ZCc0J0iDMgXva58IlrVb8YhzGq7aCOYabNKhrESaJ7JdtTaJi9Be9zEKasW1C/KKYxEKQXlWvnqBbrvBxo2b03hekFAOrFrnS0HWXLjUwJGcqen02e34dOfVyz6L+N2TFm+h2QeAFIsblNRngR/xQfviu/T0IckeHhGtpifH8xmHr0NFFXAhkH6tYngPi2Y7rV6GN/f+2c5f5D9i7JhX0S/L4RHYX3lAkWtpGb6u4oa7aiI7CvpDa2iY5aNbJSja/ev5RS/GBQ/Lq1EBR7NHu0/si4lKzAixMU3xeTmrAvrdlGu1jrDI9yKj5K1ABNtrxpeFk7Ru1D/AIx48jMjpaOiJfAs11sqkpkXy2Qo6c9ItSkudrhukE3/AM0a0vr7Iir60nNKPpuT3DyixKA4ThWjfWJlW/6oiT7UVDZsxqKkpSVG2U2gI4rMCoadYLVK5CrjMANgPuge82k5d0i2ggEqQbAFXN0KtexBN7Q0YFOXB8gQPqFNz+sYWauChF9FHUD7IPYIVmwjK2V7OZNh+sYKS9IC7iXP5vWU8731+6B0w0FqsRqfCJs2rM9fcDmRENxQKr30EVGgmRgyEOdTfQRpl19li+klNrBa06fqmJINlA321BtETtCrFNGNgEl4jz7pg0Cyx5hZUnNvpsIBzqUh0W5DUQXcKgCE9L+RgTOqAWCdwLac4QGwa4sLJsdPCI76jmQnW5sTG/6p2vGp1Wg0v5w1V4KBtNJRjOnr1IKHR8hDjNuAgnLck3PhCY0oIxTS1KGpLl7crp/shxmQV3uNL8ucSXKBQFqDil3IByg31EakKBBsf7ImOnIFH6x3MaTZN7C0WERHQMpAuSN7QAqhzaHS41hiWTk0Nrc4X6mkKQFK3I0sb2glyU+DThcXkLZtApXxzGCzhGcA2uTbpAjC+kk8La9orbrmgwr27Xvflzgp7MVE0lIbJGW+usaVi6ibn37RsUs7bi8YKvaImE1RrCbGJTSsqtDEdItzuI2sqBXe1jtC2MRa/CFZHriL7qSR01EWgVA3Nzl5WipuEawmanAmwJCT79YtJTlwL28bRlaVhS5OBOFT3Y8ZsJLOv8PZG3Uxs46IA4lYzSBltVHjr+tA/h8vs+KuFVjcTzH9eC3pAt9lxVxqgX/95LVbzCT98em/9x+P7OP/AMX5HfGpv6OWCiND66r+q5B30J1gVHiCm9yWpM2/4jo++AWLhm9GrBpHKfULfsuQW9CpdsQ47RprJyyjfweUPvgNP9OXu/8AsrUc/hHRFYWcqgrloOVoaOE6s1InE29idc3/AFUmFarG4UNtLeUMnCdeWTqTZOgm+fi2iLMUd2WO0si3wigvTpb7XgxSXL6M4gY0/WYfH3RfbZ5kiKI9OPXgbKK5CvSn/KfEMXKHHAcz7Cra3vHX/pUWX6KXBVYFwESYv507+yOQnTdPv1jrv0hz2voUcIVnVSPyfqeX8EdBhnlFvwchPC8uv9RW/lHT3pepz4F4MPWupVEUM1v9hKG3zjmI6tEfokR036VP8K4PcDpsH2qSUb/91lT90StyPk53w46WsSUZegKJ+WVfyeRDx6TaCn0gMdp1ANQuB5tNxXkg4W5+UcSdUPtqHuWDFlelQLcf8YEC2d5lfxYb1iyxd4WDPXpxO6lUubAH7IhHQn6Nv9UQ9cH09pi9tPNcnMj+jMI6D9GnwAhf7mWx6ZbKuDkwfzKun3XCfxhNSOsWVIU5Lvo8Vecv9IxXW0nxSoNfeYrVHtAHWKgqsh5sYm1IfwKmnrLn/nORBVva/OCNWbW3TKQtXsrYdy69H1g/MwwheXoKOBHGx8H69DnR8Fsn7o7nmV5r844O9CJ0p46yguRnpdQT5/RoP3R3fMkhJ+MeY+JL9Zex2NL9MiL58vCITyiFiJTjlhbSILx717xyGbUjFR0/CIz6TkVcWFoklWnMxpe1QQdLiAb3DAssvJMLAPTSDLKwoDWACV5J5QB3F4LsqATofGDQLObfTu1pnD5VtBNTwvy9hmHD0MX83BBaN8lcnR5XDRg1x34Nq400mhyaa21RfyZMuzBccli/2mdCU2sFJtbLfeJvBPhmeD2DZigKqyayXZ92eD7cuWbZ0ITlylSvzN7846/zYf6RYr3v+zD0S+c5+CxHHb5j4GI7DgCtOh06RgpSl3AQtWh2SY1sNvleku8RbT6M/hGBGglrcFzfWKk4si9VZUdyyL/Exai2Zix/g7l+V0GKs4sSkyqdYKmXD9FzT4mGwq0ReSs2u/OJz2A3jJ5BSCB3jextHjbLqX7lpSeV7RtINyVJtbe/ON4oXKui7DxGvcVr7odMMAHCdHIJBMsiFSphJaWnqk6Q0YVJcwhSbAk9gBt0JEXLeIK2kzdNEKVvsIhvd/TQkfOJkyi6xmJB6RBmEgN3J052ML5CAFZSFaEm1zvBPA5WMLsJCu6HXE/zz+MQKqApo6Akag78on4BXeg5FAqAmHNQP0oJ9oC7iZOLyqsB1JiGO9e2thG+eVmWobE8+sRgm6Vb9IiVBtn5ACjb2rgi0DU9yu0dwaD1i1t7XBgiVls3G9rQGcKxXqWVAZRNJtfxvBLkCT2LNmVllpd+XTaAc5MjtEItoRe45GDFRfbBU3mCQE3IA5GF+bZHaZwbpAGnOErkI1uXA5XPSNLhISLajfbePVBShqNLR4pF0Ac4YlQLbaBqVhNfpWlvpVDb9Aw8TQyoKuRFyOkIjlhW6Xmucr9rnl3TD28CEgWJSoW03EVLwSIHmBlVfqPfEdywvz98TJpu7hIve1tY0LbClhJBAtuBpFoMGPuHMoAf2QLnBZlWlgL+6GASBU6q4v0iO5S1KaX3MwII84tOmU1Yv4T0TMgm30qxoPEQXKTmJsdDAfCt1JmwNy+sm23LlDRKyyXlJBvZUMnyBBAz1Zaj7NhuPGPwkXnAAlB1htl6QFk/R+4wWp1C1TZAG3KEOaQ9RbYhy2Hpt/MLbeG8EZXBc44dD7wItOlYZGW5TmFhoRDhTsKoyo7gsk9NoyTztGiGG+RN4VYAnTNTmZegSg2Hvi22OHLzqbKfVa1tBaGbhjh1Lc9OgJ3aQb/tH4RacvQkEez8YXGTaticqqVI+KGCrI4mYYN/+3Mf14YvSPSUcW8aAjedCh70IMKeG3C3jvDyxqUzbWg/Xh19JpsjjHjK4se3bNj/ALpuPXO/nr2OGvp/kZ8RoCvRgwqvSyahbTxDkT/QsdCcX42TuVU9k79H4g1JvtPRSoDh9lFUA/rj742ehk6pOPcXNjQKpaCQfCYR+MDg7Je7B1H9I6WqepOp01tvDBwqFkVVJ1/hKdb7XbTAGo2U2rUE6kQZ4VkJcqyej7XL/ZwdGWL3LKYXci/zikPTbN+A21x+XJM36d12LrT9XcxTnplyvb+j7UFlRBZqsg4P/EUn/wA0FHkcfPlW+19Y694zL9b9Anhm8pJKkLpwBPLuzCfsEchHVRvveOweJ4Lv7nvgVVxZCqd/zn0/fDPJH4OPkC6cvK0dMekhaa9HbgZOJNkpkuyItqf4I1/6DHM7BuRaOluPne9Frgaq1/orf/Tf2RCM5rZX2awvoQr4G8Wp6VpP+HbEZ07zcou/nLNxVPsodI1ISTFqelMvtONVWc3DknIL9xlWzE8li/wYH+XElvqzMJ/ozCIq4A0tpD/wX/8AzxSzzIfTr/u1QhTHdLg6FQ+cL5kyy4qE1m9GfGIP+jrUqqx/4MVRKtl10JG9ot3D4z+jpj5u2iKhJufNr8IqqhoC6kgHYoVFrayEJVw4QPzvvg5iNJbodAbP1ETY93bk/fAKY7k04ALfSEfOGbF+U0OhEDvByeSetu0bI+0wVk8FpehNKqc430d1O6mKg0R1/gxP3R9AXKKXMwIIubxwT6DyrcZ8OgfXfnGzboZNf4R9IhKBVtI8t8T3zL2OzpfpignDeYG4NutrxrOEQom6SIfGpJJsSLRLbpyTqExyaNfVRXZwikC2TWIUzhOydifK8WsacnL7OkQZumgp0HnFNF9RSM1hktzrahcWumDEnhwLAzJ12hvqNKSHEG31onU6nhNtBFx3Kb2AlPwahwg9nrDdSMAyyyCWU+doL0uSSlSdBvDpSJNIANrmGNqKASbYAkeHsqED6BA06RO/eDLoToyn4Q7SrAyi4iUWRl20jM8zT2HfLTKsn8FMpv8ARAe6Kd4rYEZem2VdmO61vbxMdRT0skhWgir+I1MS4UWT9Q/bDfmdSKjHpkcb1bBqGpklKAOVrdITqvSQwF6ADod/jF/4lpiELUbC9zr0ipsVSwQVkEc9PvjdhyN7MHJFcopqqIyhxPIXtD3gOSD/AA7orvMpWD5BxQ+6Empt53XhY6EjeLQ4ZShc4SUV0C9lTCT4/TLjbkfTFe5nirkLdSYcQu6Rmyp5jfXlAt36Rsm231SNobKhLA3TbUC4Hv3hanWeyzaG3O+8DFpkaoXKnqk32HXpBThygroLoSAQJpwG/nEGo2yE/MnWCnClztaXUUAd9EwqwtteGPtAXcbqhLkunQC/OIpYISdO7yJ5wZnkBp1YPeIVqTA19vQ63vt4QFhMgONm1wDeBU3rVJHOO8maa0/ahgaGVF7dICVpOSdYXcf5y3e3LvCCi9wZLYdakha6msC687QsOgvA+Y0bsdFeMME5LtqfbdKSlZay2Go+MCJpiwLdswGmvKBTVlogZSq+XSMky5WnQe+NzIAdynobgRLYaSGhm3vawgmyxSqADdYpmh/zlP2GHsgOIGYkDy2hJxE32NYkgNE9s0d9rkw3KcW602nMEtJvc7X8IvlJgrlkZ0hC7K0J2tGSGEqOYjTaxjelAcmEaCydbmJkvLBVzfN7/wC/SBbDRDalFJXmyHU6X2ia1S+2ZsbZxqQDfpYwRl2Um5CQkgb23ghTm+1HRN79QYS3QxIorDKQh2pAbJmVpv0OkOdDQlzuHQ3uDCjRSGqhWU2zZZxY/v8ACHnDjSXAFfX0JF9LXjXl4EQ53GOTlc4ITe5IG94a6TTkoCOu2iecDKZJFRQQSCeQOhMN1Ka13A6gDaOZJtI3xCtLkGyUWTaxBtvaHak05CmRyJ1gHSmASAmwJIvYQ301oNNkA3GptGJ3yOuuBs4dSYFSmk5f9CP60WYzKgDaELAFkVh1PVjl5iLJZsLQyMqiZpJOR8CqGT+/Og6a+tNaftxY3pWS3qvGzGCORWwseRZbiuMOq/y4w7r/ANuYB/8AEH4xa3pkN9lx1xSOrMqR/wCEmPZt/rR9n/R55fT/ACE3mw56HlOc5JrCB8zED0PXg3xHxOk2uqjkj3PtfjBZhBX6FjC7XCa0j3d4CF/0SXw1xRrKB7S6O6Pg6yYrBvGfuwdRul7HVM7qk3NvCDXC/wCjm6um9yVMka73SqAM8ogG19dILcMl2q1XSBuhg/8AMEG+DLHktBtZJAzGwGxipfTAN/R3rovtPSB8vpxFqsmw13HWKp9LpBe9HnERSPZmpFZ8vWEj74qLtocfPQb6b3jrvGQXM/ud2GSVFRYelLnokTryQPnHIYjr+p5539zqlOjCmzvyTUlD7xDn4LZyDLe2ge+Oj+Lh7f0O+Drigczc0psEnlkmB9iRHN0sbOI++Ok+I6A76FPDNw6lqqKSPC6psfdFkZzYLFmYHPszt5GLT9J0BfFUup0DtGpjm295VP4RVqBdL/8Au1fZFo+kkUqxvRXhp22GaUu/X6C33RCMCcGzbG1H8XXE6+KFQk1Fvs5qaTtldcHwUYceEKinGdD5fws6n9UwpVlOWpT41uJh3+uqFruZZcGGFFXALiOka2VJL/nJ/CKpoRH5WZvtZWnui08Erz8FOJiDqPVJRVv2j+EVTRlWqrBNt1fYYtbpk8kGoEiamf11faYacZItRaM4Ff6WaRl6fxJ++FepC03M22zq+0wyYmUXaDTVfVS+8AOQu2yfugvKL8FrehNOFnjhhRu189RdRt+dKOj7o+nzbebblvHyz9DBxLfH3BgJ9qrga+Ms6I+qTIsgW6R5r4n9VHW0n0zay0LxMQkRHb0ESm17COOzUkbcgsIiTTQyxMKukRphemnxii2khZqrVrHooRnItapPKNlVAKfEKH2x5JqGg5xFyUMdOFimG2nOZUiEyRdtbWGSnzOwvpBTVoKI2MO22iT2t0wFl5qwiQZrTTSMTjbH3RlNu5jCBj1Q7FBP5phxmZjQ3MIuPZgJlUqBsLEfZD0qQO1lH4obQrPpfW9hFQY0ZQGVlI2v7Ii2MSzV1KG1zzG0VXiwdo2vQFR/veNmAmTgpKqpJfe1+seUXDwelw7wZp1x7M1Nouf96T98VFWO5Nu5gQSqLn4GJC+DDBIHdqM4Lf8AEB++N2d/p/kzY+4D1aXDbxSBYAHfrClV03SoDTXWHivnK6tIIF7777wlVYgtqJtpZJBG0DjexJipVDlYWrKNYN8GW+0lK4bXKXk6DyvAWqC7BvtsYYuBrSTI4mzD2X29By7pjTLsYpd6C9SYBecSoX719t9ICvI7xypvyF4P1Q2dO52G3hAR50JBPK14VENkNKEi6dgTc2EAsRIDL6Cbq+maNrb95MHmnMzitusA8WudkonTuluw94g48i5cFjzCs0lLkg6CBEwAvPrpf+5gq6srpUsQkAFIvfpAx7LYgDl84pIIhpau8QCSLROlwEp1GsaNM6V2GvO28S0MggEjQkc7RT5LQn41Vlq0mo+0Vsn+dDihN5Vk5bX5Ec+cJ2P02qUipOoIbFr/AKdocmzmlGiNhpYf33hv7UAu5nrTSQ6nYDbU2gjLpBUOh5RCYvnTcacxBJgAbCwPSEyGImMNhxQQm4Og00g7RpFKC0ARlDgAA0gTIJBcy6DWwhno7YK2gdy5sB0N4yzY+JzRIEN4gxCgJ1E85tsBcw94VWMqdLKJ36f30hJfQGscYpa2tPuWA/WVDjhjupIFr3tY63jpZN0ZIPcsiktjMAFA66EecNtMQAUpJCh0T98KNLCVpQbX1BFoa5BQUtoiybA3vbSOXM3xGyQWAlAAtYjaGiRX7JHKFGQWO6PIWvDHIvgo0VbqBGNjR+wG9/lARfQsK+0RZaHhbTeKjwPMWxC34tOD5RZrT9x4w3GrRmm6kfByhEN40w8ek+x/zUxb/pmpP+HLESjrmlZVX9GB90U3TFhrFdDcJ0TOMq8vpExdPpnIvxrrRFrKp8sq/XuH8I9k/rx9n/RwF9Jhaj/S+hEcpFxV9f8Ax0CE30WUg8XZ9Kja9ImTpp9Zow34SX2/oV1Ju2Yt1c7cvpmT98JvoxL7LjHMC989JmQfgj8IHDxP3YOdbL2Oq5pzKgBStLbwZ4ZOH8t1UdWGCP5TkAJl0BBIF4McL1g4gqaTYkS7Wu9u+uCvYxw5RarVlEHlvaK29KZrtvR2xkOSESzg9001FkIsm1rxX3pLNF30fMcpH1ZJte/R9o/dFLk0nzhAsSOV47BQc37nS/oLpChf/wDygjj3dZPSOv6EpUz+561lBIKWhM26i1QQR9sPbKZx9LqPbI3GsdI4yu96D2Cl79lXVIH/AIs2Pvjm1jR9PnHSdaUua9BWi2GkviIgkch27w+1UE2RnOLGq1pHNJEWZ6QRS/UsETKde3whTVfyUrT90VnK/wCc78jFkccT2ktw4WN1YRkwfcpwRCMX+FrnZ4toyjynAL+YhexEMldqiek28P6RUGOHbvY4mpJPKeb+ekB8UHLiKrD/AL29/XML4kWWjgRd+DvE5OutPlVAe8xVtMWU1Bkjlm+wxZnDl8L4X8S27e1SWFfAqir5BYE+yqx9o/YYKPkrya6h/nczcfXVv5wdrTnaYbkTsPWVG/my3+EAagq83Ma37xgxUVXwrLJttNJI97H9kX9gvBYXoivFv0gcBgG167Lj3FDgj6xNqskeUfI70WJgyvH7Aa9wK/Jj4qUn74+trZskeUec+J/UR1dJ2EpCyLAmN6XIgpVrG0LtbWOMa7om9tpa9ojPPWFtowU7EWYd31iX4JdkCpO3QfP741SrtrG+kap9fcVr/e8aWHDewiF0MUrM2I1g3JTuW28KTD2XaCcrOAEQdWgLoVcXceaxhTF1Uo8rS6W+xJpbUH5tTwUQpsLN8psN/fGnDfpJVar4soVJmqTR0sVOYLClyjj/AGjYFxm7xtuLWMKvErh3iTEGK6xPUmWknWZ5DIRMOFBeaythKgkKWAL21uDcbQu4V4UYzpONsOVOdlErl5GaStwo7EWSVkqUcqzffkOW0GoQrfkLrZ1W/PlRJJ+EJuPJomnCxG5390F3JkEnUQpY7fBkG781ED4QuaqOxcHckU5iSaPaqJPkDFbYlfu2QDflYQ8YhmQ46baHYmEKvuaEWBhuDgdkKmrCbzLxO6T1i5OBThRwZAuNKlO2/lpim6ySqZfO17neLX4DLvwpnWzsirTI+KWzG7N9P8mbH3nmJjkcUrS4vmO1usI0++p9pIPcTufGHbEixnWDcm2vSE2eADK0k2Frk2gMfBcxaqilFhwXCQffeD3BF/LK4pbSbqD7KgCN9CIXZ1vMy857KCLAH7YM8FjmmsSJOxDRsT4Q+X05CY7TQxVRw5rBQN72HlAOcUOzUd+7r4QXrjq21FScgA5k7e7xgMo9om+dW1rHSFw4DkRZRRU6gC9+ZgTjM2vmAH8Xy31EGWmyh+1gNLWgLjcENud0hQbQQYZHuFy4LDU7akSA1zqbHLoTvAt8EFXTnzguG+2osmu5Fka5TpAx1KVJAFxbmIr+C0am1G9tTfUGCDSVrYvckjeICBl5+UFZJJU3lNtRpblFNUGJfEhvsDIOgZCbEgeDghqllgyCbE6K1NoV+J4UJCQP5qFabWssQxSLmanJFjoreG/tTFfuZMZV9Ignc9InsuAlOut9fKBrRsQb67A3iUwSpwA7Wv5awmSGoPyS7vZfIgH5w2UgJLirEGyRltyMJkooKWi+ovuOYhuoROpPK3LwjJND4nO9eYMtxTxi0LAeuFXlck/fDJh1zKSlOggRi5oJ4wYvPV5C7dbpB++CtITZy6SLjQ6a2jpS7V7GNL1MsKlPlJT3e6OQ3hkk5sqDYFknN8IT5B1SCjTXmRzhilXSAjoOojnyRui7HWRmQpCcxv7oPSr5Tax1tyhJk5nu2Fzbx5Qck5olIKrG52EY5ocmWJgqdtiWXTqLpcHh7Ji1ETJSIpDBEyTimQ3Cbrv490xcSXO7DMStGTNtI+LPCzCDOPuMuBcOTMw7KS9Vq0vKreZALiEqWO8m4Iv5iLw/dAsDDA/GkNInHJ1M9QZeazOoSkoOZ1GXTcdwG/jFQcD33JD0heFrzJAWMQyQSSNLF5A+wmOif3TUOHjPSC5lF8MNgWO9n5iPYS+tH2ZxF2OgHg7hXiKW9A6oYnQqRmaNNPLqJCHyl5htMyho5kKSATmbJ7pOhEVF6N5DXGlAI9qmzVx/wwfujr7h+0XP3LGdzLyf4onSL87VFRtHHfo/LKeNbBBt/i6bHd/3RheH9/uDmdxXsdSzswAn3agwa4TTHbYmqRBun1VsDQ/6w/jCfUZk9mo5iBbkNYO8GpknFdSBN7yiT/SDX5w3wY4cl5IFyNDruIRvSGTm4AcQLDalKOnOziIegrU6n3wj8fwp7gRj9CTqaO6bHwKSfsgVyaD5q/XPnHY2Bcj/AKAGKUakpYqJsOREykj7RHHP1z5x17wvJf8AQSxszzSmqcuim1fjDmUzj5kWmEnqqOke0Mx6DcwkbM4gury9ZB/88c2tm7ySNrx0VS1l30K8Qtp1LVcB93bsfjBN8EZz7Kj+Ep6a3MPPFetSlXo3DxErNNTD0nhxuVmUNquplxLzncUORsQYRJdVptF76gw1Y7p0nJYdwPMy0q3LuzlLccmXGxYvOB9ScyuptYe6JyWB8IzHqlVk3yCoNzTayE7mxB0iBX3BMV2pOhJQHJlxYSdxdRMZUsp7wULpzC4HSIs8lCJx5LYIQlZCQTfSK82QfcD1hchhDGcoGO09cpIbKs1soBVrtrvCNJqPrTRJv3vuMMWH6aKnR6wv1p+XMtTS+EsKsHSPqL6iFmUVaZav+dFohlPKvNP/AKxglNug4bl0ZRft0qzX/wBmoWgXO/5y7b877okzDpVTpdN+6LEjxsf7YhB19HSaEpxxwIs6AV+Q+bwH3x9e75bjePjpwRX2fGHBSgbf4+p3/wByiPsI85ZxXLvH3R574ovXFnU0nazdn31j0O2EQi9c848U/wCMcS6N5NU/YHWIb7/U2jU7MaW2iE9ME89YFsqjCddzJWOUamXLCIs2/dC/KMpZS3QMiSsW3AvFJlhVtywuIkIfsYWajjGg0E5KnXKdIKvbJMTbaVfC941y/ELC8yqzeJqOs9PX2v8A1RoinXADQ6NTRBGsSEzlhvCvK4no8yPoaxT3R1bnGlfYqCSJ1lwgIebWTtkWFE/Aw5b+AGguZrNzhXx7MWpjRB+udTttEv8AKrHrAlxMM+sHZntU9odL+xe508IA4+mT+RQCkp7/AE8D1heRPpDx9yKcrc1dxyx531GkJddcQMxzX577wfrs3ZbnK+thCfXJyzSzzyweJIdkYgVdVluXvqTe8WZwIcKuG1VbB1/LDxBPK7TUVTXJr6VR3udDD5wMngjAVcZUogiqqPd8WURszfSsz436wxW3brIKtRe598Ks+4FNrOvuEGatPhLhzXF7awvzc1mBtqD8YViCmgVPLtLOHfSJ3BOxnsSpO3ZNG37UBJ6Zu24m97X0ESuDc2RWsQjYerovc7d+141SX6bEfvQ51YJXublStQYCvXQve5+yCtVfurUDTXSArz1zvcbXhUVsMZ5cEjN74C43Xml15TnHYjXpa8FismwEAsWnNKOa2+iJ198NiqYuXBYcmpqYoUgspC1oQcir2KTEN1XeJuB4XjVTXAMPySibZUHQDrEVbxUpQ3G+vOArctcIktqAJVvzvBamu6ZRa21z+ML6Xrai2vIRMknihVtwREkgkCOLDaRTpcgahDpJP7JgxTnB+TAScuo1O20L/FF7tqbLqOl0OE256CCFMfvTwL6ab+QhivoQD7g0HEkAixTfcGJDbqFaKUPI84EtzHcGum+kbWpoA6wtxCQySkzmUDcp13ttDbQnwlNyq+Ym1zyhClZrMtN/hDNSp0NoKiDlFiQBcxlmjRFlU45s1xgxLY3ztsrt5oTBGkqAdQSoAK3SOcCsdOhXFmouJOZL0mysHqMoglSgq+YJGmmsbv2L2M37mPMg8UWFwRpBmXcvaxuIWJBZbUBe6QL26GDkorLbw6RiZqjwMco/ZPTrbnBmVfuAQRcbiFWTfWh1wLtlz9y3Mf8AWDUm8ANDp0jNNDkx3wXMgYop9lZT2hBT10MXW29dIjnvCUyBiulK7w+mFrnzi9m3hk3i8XlGfUK2j4+cIJtmS488MZl4hDTOIpFTl+Q9YRHTH7p5VZao8XsOGXAARhohemp/hL1o5R4bEnizgM942rsh7Iuf84b2EdMfulMsZPi5hzuTCC7h9d1TKu+oiafF7ct49bL60fZnCXayxOGGInP/AMMCryagbCm1NlJSOQnSbk/tRyFwGctxok7aBUjNj+gV+EdK8L5ZJ/c5sSPKNsspUrKWsaH1pNkpFvfHMfAM5uMtNPNUpODw/wA3XCsDt5PcmZelex0fPOEBSr5tdbnSGHgkrNjSaTqR6ne1+jiYUa9UpamypemHkS7dwCt1QSkX8TGv0W8ey+MuINZYYlXZdTFPzXeIOb6ZI0tpGitjFBOzqsnflbTXlChxr14L48BNv8RzWn7EN6gDcc4UeMLfbcIccJsTmok5oP8AdH8IWnuaD5oD2uvjHXvBpYc9C3HSNDkaq49/ZIMcgpVcx1xwGbVM+iLj9gEAH8qjX/5Vsw+VlM5CQfpE3POOgMMrzeiLjNI1Capfb9OVMc+tq0SetjF/YLV23op8QWzs3O5hf/8AjH7otojKIYITMI84csfLz4H4fK3tJzbfkBMH8YSmyA+m+14b8ZL7Xh9gc7ZBPt/0wP3wRBWpyyCsW5iI89/nTw/SjOSVkLmvKNDys7i1A76gwJY4YKc/xbXk3HepTghTl/49rzEFqBVU0yXnLoLgmZRyXsDaxPOAzRIcb8xFpkNk7/nCrcwPsjaSFU9sc7/jGmaVmfJHxjIK/giE+MUQYOFMwZXihhF4borUgoe6Zbj7FzaimYeH6avtj4z4AeTL4+w28dEoq0ko+6Ybj7Hzz38KmBvZ1f2mPP8AxTmH5Oro+GeKdtGpT9jERyZN4jOTFx16xxLN9EyZmgkE30tvAx2fOaw1HhGmZmSUk3gY7M6+B5QtsKhN9ILGlYwRwbxRX6DNpkatJIYUy+tpLoTmfbQruqBB7qzy0jhKpeknxGrBUmpV78pJJ1Q8lSUH9lKkj5R2b6TBTNej/jxtSrWkW3B5pmGlD7I+cxWLnrHovhsITxNyV7nN1UpRkqY+s8bK4wq5pVGcJ3IacST7wuJ7HHmcSPp8LUp79V9xN/jeKzK7iwjHaOs8GN/tMPzZ/ctKd45NzMg+2zhRmTm1Js3MomEuhCupQtuyh4XgPL8WKs+4n1ucnabpZJoDEvJqURzLmqgfEQjg3EYqIDjX61oJYoR4RTyzfLGx/iC/KVVNUkZRSashOVNUqM69OTQFraLUoAaaaDaLg9FXiliCuY4xHKVutTtTYXSczTMw8pSELDyNUpvYGxIv0Mc3TTm4i+vQm4VYu4icQ6jNUKnK/IyJNctOVeZuiUl1KKVJCl/WV3fYTc+Q1hGpxqWGSodhyOORNsv6tT2d42IJI3he9TqGJJhUnR6dOVicP+hkJdTyh55Qbe+0ddYX9GnBVGCHKs5NYwnk79sosyiTzs2k6j9ZSotGQakKJIokafKStOlEaJlZJpKED3JA1jjQwSW7N09RHhHz3f8ARZ4rVlJy4XRJpVqBPVFhojzAUTDfw39GXiRhigVWTqFNpocmZwPthqqNrGXIE6m2huI7ZW8lWto1l5ChyMaJQco9LELM4vqRxHVPR/4lOFQGH2HEgmxbqLJv8VCFmf4E8TGQT+86dcJH+ieYX9jkd/LUlWoEaVtoVuLmBWJxWxfzmz5qVjhvjqn9oJvBGIGkhJutMgtY3/RBgHw1m3KTiSvtTbDso6ZRB7KZbU0vReuigDH1AXKgaJsnygbVqA1VGVNTkpL1Fm1sky2l0W8lCCd9LjRFPdNnz5maj2g1WCdTobi/nEIzQKiSbADryjsqv+j5gKtKUXMNNSTyt3Ke4uWUPck5flFX4n9ECUfQtWHsTTUms6iXqrQeQfDOjKofAwCG9aZQyHc9ikhXPwgLil9LrTyPZ+hO/PfWH3EvAviBgtwuqoKq5JJBKn6Kvt8oHMt6LH8kxVmJKi2p9SSFIdQyULacSUrQb7KSdQfMQcVbI5KixqZMJ/e7JrvYFsXPuiI4/dwZRvrvA/DdRbOE5Ja1pCUoCbk6DQWHzhsw5wwxnjdAmKLh6ZflVEATT5Euz7lOEXHiAYFrctOkAEvJBvcRJYm06EHw8otOn+iPjWdSFTNQosgTuCt14/zUAfODDXoY4h0JxVTB4epO/wDqiiutHOfEaYvRWFZ/9YPLuiJNInQ5Skkm2ZKT8hF8Yh9BrENek0MDGdMZykkk091Q1FvzxGyn+g1iGSkEsHGdNWUgAEU50DQW/wBZBbdNAOS6rKQROZQANIlMz6UkAqCSeoi43/QnxegXYxPRX7ahLku+3f4BUBJ70QeJkur6AUSdSObU+UFXuWgfbAh9aEdibsARY8weUMVLnFFk5TqRoTrGyY4BcTqMjKvB81NNp0zSb7L/AMAF3+UQkYfxLQEXqOGq3IJQSFKmKc6kD35bfOETjY6MkIWNXieJ61Ei6pBq/TQCClNcylGYm9vcDChjmuMniSkqeSHDJJTkvZQ9x1g/S5xKlJv0FheNPEF7Cv3Oh5k3CEpsQCOvKCks/wBqlK0kEX3vp8YASjqXGFAGxULXG+0EZCaAeLWZJSLJSkEaADmPOMUlZoQwsKso97W8FJea2TmF97HeALDidwSfOJsq6nMFC2+8Jkh0WN2FXf8AKSma6CYTz8Yvxt2yddY5acxhIYTeZqc0pSmpZxLpQyLqVY7DXf8AGGOV9LmjOIBdw3WEaa5HGV/+YQWLHKVtITma2s+bFJnFyeJKLMNPLl3WZ1hxDrftIIcSQoeIteLl9LXFTuK8dU6YXUJupJZpy2kOTiUJKR2zirDKNiTfW51ikGDaoyJ6Ptm37aYsbju6XcSSSr5s0of+YqPTz+rF+5xI9kidhavNs8AajT1STD7ilzIS+4talt3WjVKb5R7hzgLwFcCeMFLUf/h5sD//AF1xhhpY/wAFVVTbULd9w7kecBQP8L9GJOhbmv8A7dyKxKnP3Jmdxj7Fo8c3P8h58EhWYtWSRexzpjX6CzhRxPrjZUbLo5IF+j7f4x5xuSteCp8G5I7Ndz+umInoQOhPFypJOmajufJ1sw79plhwd4r0J1uOphZ4opz8LsYgHeiTt/H6BcMazcjU6coX8fp7fh/ilvcro84LX/2C4QuRh8xGz3U+IEdbejcpU16M3EKWG4XUQB5yKDHJDP8AFNnqgfZHXHosKzcAsfp59vOfOQTGqXBTOP2dW0Ha4Bi9cAziUejbxIZV3gZgeO6GbfMRRMuPoWv1E/ZFycPnL8DuIjdxZSgbf8IH7otFMqBJs8DpvEuoVB2akZKTUpZblSsoBUSkZyCbDlqNYh6hfvj11wKVlzAqGuW+oi7CMpdIs4CdxzjUtASbAgiNsuqxV4iMX9HDoAOidoohKkGgphYUoJAbUoXMQk+0jrcRuayqasoFWh2No1D2hfrFEPz+jhjIf5umMZjVUfkmzVohCXhhzssU0dZ0CZ+WPweRH2OqLwE7NAH/AEy/f3jHxlkHizU5RxOhQ+2oe5aTH2Lqb9puYJO7ivtjgfFf2fn+jqaLiRpdfFyAbeURXZgA3vEd+ZtmtrEJ2bvfW5jgI6RvnZqyFX12gLMTR1BJt5xtnJnuGAkxMhWpNoKrImRMV0CRxxhuqYeqanxIVJnsHzLLCXAnMlXdJBAN0jkYpie9CHBLjbrktibEMlkSVfSpl3gAB+ok/OLmanMr4N73IG8eV6pdlS3UA9505N+XOHYs2XDtjlQueOE95I5TqvojNy7PayeMlHomapuu190ufdCVUfR4rsmCWa1S5oDmpLrf3GOp6pNXYSna5O3lCXPLSRe9iOsa4a/UJ7u/whD02J+Dm+a4PYolr5EU9/8A3c2B9oETME+jvxH4i4iZpNBw2uemQQp15L7fYS6fz3XL2Qnz1PIExcs64ACSqwA1O1ourgtxnrNAwhK4cw3w6ma+UOrdfnpWaU2l91RvnUotlKSBlTqrQJjoY9bkk6kZp6aMV6TZwi/c+8IYKDNR4guLxvWE2V+TmguXpbKuh2cft45En80x1HINop9Ol6dTZSTptMlk5GZOVZSzLsjolCQAPhC1QMaVxVPVMVxhNBcOqJJioLnnfDMpDYbT5ZiYltcQae+4W5mpMKIPsTIyq+Jt8jGpT63bZjlFxGNbwAvNTxcA2bZBAER1VhLdxLNBA/OVqTEVmekJ1Bdl0NzCf+7zBP4x+7SSvfs5ls310SsfdDFEA3hTr47R+YyDkDr8o8NQQg2aC3FD6y9vhEcmUc19YWevaMq+4xtQqXA7kwyoDlcp+0RdIhLRMvGxWrTmTGJrBSopSCANNYjEuukWyKT+i8D98a35TukkFN+vWL6USwo1VQoa2iS1Mh0XBCh4QtJV2hyXyujkdjHl3pZV7KT4iKeNMlsaHS2tBzDMnoofZ0MDKlLJS0VA3sQdRrYm2kRGK04kWcsseI1iXUXM1JmVqBZDYvdwWtfS32RnyQSVjcctwFNvdmFKRpl1vzhUxpwWw9xnkCmsUhtx/IW0VVr6OZYNtChwaq/VVceEMVDAq7i3lhSKek5StehdV+akfaYbmauJdKUIQgNJFktgaAQjHBvcfkmo7Ir7hd6M+DOF0hKtS8qqrTzIH+MKoUvOZrbpTbIj9ke+LYRKtt2vqq26jeB7U2xOJdDd0kpPcPIwP9cfSog/bD1jTZnc2MmUDkPhHqVJGw+IhaFReCjmcPkN4zFUWb94m3WL+WV1sZkqSByjchaD0hWl6p60ezzdm5bS5jx+bmpdWl7g6gagwHywuocAU2jNJSDrCIvEEwySUFTZ3yqF9YJSeJxMFDbgyLOh6RHjJ1jaG0+EbUMZtEkgeBgBI1ntJt6UWSlxK8zd/rDwgiZ1SFFBORYspJtuIU4BqaIGJuG2G8YsKaruH6ZWEKFv4bJtuqt4KULj3GKKx56EuGKglyZwjNu4WnLEiWWVTEks9Mqjnb/ZJH6MdISNZbes299G58jEmZaDiAUEHXflCGnEepXuj5v4p4f4p4XT4ZxLTlS0uVBDU8yrtZV0/ouAaH9FVj4QPYDCJhQb7rygXDb6523j6J1aQlKjKvS82yhxh1JQ4262FoUOi0G4UPAxzrxD9GCVzuTuE1op0yoFSaY6u8o/4NOG5aV+iolP6sLcG+DRHL4kUM1NEvpT7KVIC0nn4xJ9YVqM1rbAxEnZebo1Rep9QlH6fPMd1yVmWihxHuPLoRcHkYxQ6M4A0trc/ZCWjUitOPeJ6hQJCiLknUt9q84HUrbC82VII0PS5+MVjKcZMTSoFmpB0DbPKj7lCGH0ial6xV6dIBWZMq0pav1l/wBgEVWCShPkI9BpccflK0cjUZGsjpgxgn8oSdzb6Zv+sIsHjMrtKzIE/wDwywep+kVFeqX2LzDgFyhxKgBzsQYZ8cT1Uqz0pOVKkTFKbdQsMKfbWnthmuSCoC9iRt1h0l60/czp1BonYbfA4a1Noaqccd0G9glJJ8o94FC3GCgEcy+LeHq7kZ4NwZiyv8O6xUqfOS8th2TL6phC1WcdUlCVLSLJJ2tuQI18Eh/7XsO9Ct3/AJDkVjaudPyVkT6Vf2LW4z3OC6mnRX0QNx+umA/oSrKeM0wAL5qRMD4LbMHOL6FPYRqaAm6gyABt9ZP9/dAH0MW3GeNaLpUkOUuaTmULDQoP3QxdoiHB3u7ZPkN9PCBWJ0h7C9ba1UHKdNJNj1ZWIJTCu+oEi22kC60+n8hVMAa+pzOv/BXCfIZ8u5c2lmT/ALNP2R1n6Ibge4TY/YXfKZhY0/SkiD9kcmsaSrN/9Wn7BHUvoeO3wDj1o97NMIsPOVcEaHwQ5Rlf4hnpkT9kWxw+fI4RcQUDXupP9Efwip2L+rtfqD7ItDhysf4NsdoBuS2CR/wl/hBIGRWROu1onzFYnH6NLUtbqTIy7y5hpsNICkrWAFHOBmIIA0JIHICIB3jcqUmBJibLDwlS4WhMdmrsysC5TmtbNbW17xAjU2bKidiKekanV35mnUpNEknAnJIomXJhLZCQFWW53iCQTY7XtygeDZUfnN9YogUw5LUubm3G6tU3aVLCXdWh9mUMyVOhN0IKApJAUdCq/d3sYFpuoJKhZRtcX2j1B7ukeHWIQ/PnUdI8Se5H5wZgI8CgEmIQ1JWG5hCybBKgSeliDH1/qM4FOqUFCytRbx1j48zKiG3D0STH1omZ8OJYSgFxbiGwhCBcqJSLAAbxwvii2h+f6Opon3Gb80ST98aGETNQccRKSr82tCcy0S7anCkdSE3tFj4Q4LOzbaZzEji5Vk6pkGVgLt/tFfV8hr1Ii16XJSOH5NMtTpRuRlk6hLSMoPiTuT4mE6f4Xkyrqn6UVm1+PG6huzk2Ym0uMmytDAOYmrkbkRcPH7BgZAxLS2R2ROWoNtIINye67a1uoUfInnFM0ijVjFTobotLnKmea5ZolA81nuj3mOfl088OR42jXDNHLBTTIyZi0yg3O8QMST2eZS2LlLaTfoCYtbD3o3YlqLzb9XnpShsggltCvWXz4WSQkfyjFkUf0ecF0hwPzko/XZu9y5UncyL+DSbJ+N4Zj0uSTtqgJZ4La7OQWZKoYheblaRITdUmSq3ZSbCnSNOeUae+0O2FfRSxtiZ5KqyZbCsjcFSppYfmCP0WkGwP6yhHYstIy9OlUy8mw3KS6dAzLtpbQPckARipvob+AjXHRpO5CHqX4K3wZ6MnDvBqGXF0ZOIqigaztaPb3PUNH6NPllPnFsoU0WEMpab7FOgbQnup8hsIELzDWwHnqY1lavHzUdI1xgo8GZzcuWFXZOSdWQZVi/i2k/dEGaotMmklL1PlXE7WW2BEcTTqU2DiiPgIxM+sCwN/1Rb5wzcWDJrhvhuYUXPyQhhfJyVcUyoe9JERxgKTZ/iKpWmegVMpeSP5aD9sGVVBWW2VJ8Em5+ca3Kke6C2sefePwBg1Jk2YGcwnNNj6GtBahsJqQSfmhSfsjWugVhtOiqXM+ALjJ+xUGHay0kXUVtpTuVoUkfZGCa7KOLARMN9O8Qn7YLra8ldIFMjVWj3qY07fm1NoUP52Uxsamp5tQS/SZkDn2aL/ADSTBoziFL9oEHmkg/fGKZlAJ8fGI5tldIMdlqdN5lPNvSzn6bSkEHztA+frFLoCCZmZcOtgM9x8tTDImZSPrkHrePwcQtV73PU6xXUydIvUesy1clUzcqxll81kOODVSh4XuLeNoU8W46qWIAadRJRuZaKzmeceCG0KBsCd1KO+iR5mLHckpN5SlLZRnO6kjKT52398QThSlEAhjIAQRkNud4XN9Sqw4NRdsX6lWJGjSMpKMdqFSY7NTqEXSeqjvzv8Y0SOKQ+EB1uXebUbIeSAQT0JFrGG53DFLmitTrRWtWqlKO56mBE1wtorys8oFU50+25KjIV+epgotIp7mDNWl2Xc/q6kkAj6N3Q+43iX+V5B0WWh5s9QAfvgUvhdPNKzSeKJxtN/4qYabeR5apv848VgfEjKSUT1LnB+k04yfkpQ+UHcRdMLl2nPDuzuQ9FtqEZJlpdwEJnZc32AXa/xtABeH8TMi5pUvMf/AC86PsUkfbGhxiry4+moVQSOrKUPD+aq/wAovnyShlXh+aUc8uEuDlkWFH5RvYeeCSxNtraeQLpKk2vCWuqCWV9M1OySursq6i3vy2iTLYvmmh/B6ykjbK6sH7Ym/BY1PIZm0ZHUlLgtqk/ZAyo05yQKFglTK/ZWeR6RGbxzUSLLaps8k+ISfiIIymL5Wal1ys9Snm2XBbOw4l1KTyNtCLeEUrIRUTzinULKiVoAAXz8IcaPVE1SWLTlhMt/OFFqfoT7aEqnzIzA0ImGlJB+VoIUpxpibSUTTLqCLdoy4FDwOkRq+Chgd9skwUpEyGiWlHMhY9kwDqMyy0kF2bbav9Ze5HluYlyeIaNkQl6pSrb19FuqDRPxtCJq0NjaYbnGhkS6LKv3V9D0MC3mm1pU0UpU0sWIOov/AH5wTedDTzSSUuMPpJSpJCkn3iNLdPUgLQghQNzdWwHjGPdM1coqDjTwpmsdYVmCtxht2ktqmpGpzCkI9XsO826s7NKGhubA2Vyjj2SfEy0hzQ3Tve9uu0WF6Z+G8WyWPqXOv4sq0/gWokKNEdftLS040nRAQkAKQpJKxmuQQvXYxT0zUxJUuaXfJlasnob6ReSKlVGjE3FMpHilM/lGrzc5mulyYKQeeUCw+yExB+jSbchDvX5NE8yEOlQAXmBTveGqi8BpOuU6XmW69OyqnU3IVLocAPTcR14ZYY4JSZz545Tk2imaUyHa7SEKuAucYSfIuJjp3056HLUip4RMsrO2tM8CbEahbekcuSlQ/J9Rkpoth31V9t7Ko6KyrCrG3W0Wfxs47Vj0gqpT1rpDMq3IF4MS9OacWfpCkqzKJUT7I6c4HJinLPjyLhXf5LxzjHHOD5dFsejxIzE36LOOw2E9mFVK6uzuR/BWydeUUHwacSni1hlQ9kvqTpyu0sQZwzgDiLM0FdOlpWZptJfUXS3MTHZoUVAAkt5uYSN08oM4Z4KTtCq7E1PzqC42HB2cu2SO8hSdSSD9bpA48ccU8knLudg5JvJCMa4Qx8VcR0wUmclBPyxmnEhIaS6lSirTSwJPKAnoj1Eo42U6WAOYSk7c/sX+6P1L4HYdkGiJmcnnJoJ7jjhS2lKuuUA38iYb+CfD+QwlxXpFRlJ56ZdKX2lBxCQO80rW4222h6yRqkZlFo66nJi6iSbdBA6eKn6fNNDQuSzyBfxbUPvjGdmO9blbSIjjy+zXY3ORY9+UwKZbPm0lOWWbBFyEAfKOm/Q3WP3s4zQfrTcvv/uHBHMwJLKNdcsdFeh04pVOxi0BcdrKKv0JQ8I0S4BZzUkWbSOgAiwOHTlsH42STZJlUk/yHYr8gpFumkPfDd9LdAxe2q5C5ROn7LkM8FMQ/qiN5npkyXqXrL/qfadt6t2iuyz2tny3tmtpe17RH0snyEbwJcyqiXbTWcANW3RbVV/OBCI5FwoXsSNxyghXaoxV54TEvS5Ojo7Jtsy0hn7IqSLFyy1KIUrcgG19gIgDe8eZgoXBuOsQgRw/L0yaqSGqxPzFNkChwqmZaW9YWlYSSgZMybgqsCb6Ak2NrQPSSUJKhY2Fx0jxMYuuJbTdSglPUm0QhkpUaiqwMGqXgzEeIXJVqlYdq9SdmzaXRKU95wvfqWTY+6Op+Af7nDjPGNUl6jxGYdwjh1tQWunBxJqE2N8oCSQyk81K73RPMElfBTajuzm3hLwUxbx2xQKDhOmqmnBYzU65dEtJNk27R5zZI6DVStgDH2e4fcOKdgiSYdUsVGqtsobVUHk5UpskJPZp+qDbz135RIwRw8w/w2w5L0LDdHlKJSZfVuUlEZU5ua1knMtZ5qUST1gi/UUpUENIMw5yOyRDPkxtSkraMjzyaai6TCqplSu8lIUQLZ3DYDyECnKil6cDKZhUw7bMoj2AOg8YHzS3ZkgTL/aX2ab0SPhHkrmD6EgtNNp5qNkj8YaKSoYHn1erm6irS1jzjTIzSfVwylIbS3oG0DKkDlZI0EaJhCg1ftUOC2zZIv8AGBcvUkNVNpiYW8G1HMW0osdDt/feMWZK7ZqxXVDEXADuRGHbeOsETLsPNpWhIAULi4tEZcggm9tOZBhDxt8DlNEZSrDX5xqUonqflG9cgAe67bwVrGmbZTJsl16YbCRrrAODD6jSrfSwPQRpWLdB56mPyZkOtJWknKoXFtIxKrbafOAaaLMVgcxmHVZsI0rQCCLZx0AsI2qUL6i/iqNS7KN7FXyEC0FZqUhI0sB4JH3xpW2EnZKPLcxJUBsTb9FMayLbWR8zFURMjlBT7N0D84nWNagVc1KA5r2iQpFzcAE9VRrUnXvErPQRVEsjdmL/AJx8BYRl9Ik+3bwEG5KguzCUuOjsWzsnmfPpEyew/LhBLZDaxsRt7xD44JyVgPLFOmKbofOqXOz8ShJjJtbg0VZZ/OCcvyuYkOsFlwpWnvjoYwKDzNh0jO4+GMtPgxC7ciT0Eeh3Le90+YjIJtsI/ZQDcjXzgKZRj682hIJeQkHTvKt9sb2pnOm6FpWnqk3HyjUtAWNdR0OsakSbDSittlttR3KEBJPnaJRZPbfUkkG94zS+SbEm0DGqWy05nSt9s3uUNvLA+F7fKN5bWlKsj60qJJC1AKt4ajaKC6ggJkpO5SB1EbEzeW4SbkwISJlBv27Th/SaI+xUbC9OEC6GFW/NWoX+KTELtBlMz2QuVEk+MeAtv951pCweS0g/bApibcdUUKlshA9rOlQjY1OpVdLjTySDsUfZYmL3LtEtVMpsyolVOlFJ5lTCPwjI4eoahkFJkiT0ZSPsjBmaCLBRLSVa6iNrcwhCrpUCDzMWrB9LNLuBsOuN/SUxrXkha0/YYgOcJMNzV1tompRVtCzMq09xvB8mxBKr+ESEuFxGhAEVbJsV+/weSl0+qVKbeSdg4+Un7IgzHB6YBOZn1lR/Pyuk/fFqMqsdNTEpoqCrkawL35CT+xV9CkajgNaEuSzyKWFZltJbIS3+kkbDxA3iyUzSHJREw06FNOo7iknum/O33wVRMZWzmN021B2MJWJplqTluzkkJYS0okNNiwuTc2HLeETSSGxdnP8A6XEs/WcCzDjIzfk2Yanlg7hKSULPuC7+QjjHFUwpMsxLpV7RKla7gR9D8bUZitScxKTKc7U8l2UdSR9V1KkfaofCPmpOTSnn0IWorW0ns1X6jQxeNW7NCdRA863dJNv+kXhgNIVh2UtySL6aiKYmEDIbfjF08P7fvflUnRSki3nF53siQ3YryHBTCVMmEGXkW5gpULKnFdrc+IUbfCHeYwSmkyaDLy8syu2UNNWQnwKgn7IsSY4fuIcWpxpguk2CsmbIetja8CKvgFbZuzPuMOHWwRluPKNDlJ8sxpLwJUlSahLy7qypJdzXzKvqfL4Rg2/NtzSApgPAbXQAQffDjT8OzcoyoPTClC5spKT3tOekanKUylz6UOJ0z5rWHneBLboX56YlH21IeZKCbpINtPKI2FJKVlcXUZ9gAL9Y7M23IKFwzTlOk1yoU4Ls751KAT7zC23iTCdBrkm/MVySliwvtCXZhJCQBa9x4GCim3sKk0XNNE5tAAdNtY0JsVJzHTUWHW3OKaxV6WGCaTmRTnJ2vPAbSLWRq/8AvHLfIGKsq3pW4wxK8ZXDVGlqcpRsnsm1Tsx9mUH9mN0YuhLKZcFk22IuItr0euJ1C4byWJV1qcMv6yuWUw2hpTjjuUOXygDlmG9txFSu5hcKBCgTmB3vfX5w88FOHFL4iVOot1VU12MmlhSUSzgRnzqUDmNr27vK0PlSVsor51QW4tYBCVKKgD0JvBCiStcn0TsvRu27ItZ5wNKCR2abnvE8t9BvEGebEtPTTKQQlp5xsA66JUQPsh24PqeenMQy8shTzzlPyhpoFS1XKhokAk77RTdKy6ELMkgEbHUR4lsqPa5SQO7m5CLt4fehjxVx2zLvOUNGFpFaUkTWIHPV1EdQyAXT70jzjpzh9+58YMolOKMY1mexPMrcS6UyIMgymwtkvdS1A+afdASyxjyyUfPQrHapbBu4o2SgC6j5DcxavD30U+K/EYIXS8Gz0lIuKB/KFZAkZfKfrAu2UofqpMfTjAvCrA/DNsDCmFKZRFjT1lhgKmFeby8zh/lQ2rnlLcLi3VE8yrUxmlqa7UGonE2AP3Nh9mZamcZY5l0pRqZOgSxWTcWILzwAG/JBjpHAvo2cLeFwaNFwbTXpxu3+MqmkT00T+dmduEn9UJ8osRU7nO2e2l7RrcfQof8ApjFkyzl5GRSQr8Ycd1LC2CfWKZUHqfUH5yXlJd9lQu0FKusgEEewhXLnCp6O+NsZcSOINUk6niuqVPDlPQhlwTRaAcmFnNlBQgWCEJvv9YQq+k1itFNXQJVtYAlETFUdzpCh7JabuD4lz4RZ/oY0REpgtCiG2Zp9lqp1DskgFuZfSpaEncfxQbJHh4x0tFskn5M+opRbLhrNGlZHskmfmMri8rcurUrtzJ5DzgTUZoNNZEkAGwuOY6RBmK65M4inXZmYRMpacLMtlTlIFhmzdTe405W8YjTU42XLpcClb92Oi5owqDNszU00yWzrIBOtr8/jGrBFQertWmnkgJSypKQ8pGbLcG+UdT8h5wOw4mQxfX6gmc7OalpBtKFsrVYBxzVANiLHKCfeIT+NvGZr0dqxgejYcobVUnsU1UqmpF15wqMsMrWZtVzkVnWnLoU9xVxqTARbe74D6b9K5L9qEs76uSXc4A17VoDTzELcvLhVabzlN8ugWu3PbxHjFfcVccLf4icL8K0qrOMTM9WzVp9Em9ldFOlGlrIWAbhDrqm0aiygFDlD7V8QStEq8uqayoW633ARYKsdbHrztvaByJXuHBNIfQ82ltKEpQ4LACz0AMQ1p1qYakmCJdYSXX1rObs0crDmTr8IS6vxGpMshSg1LN30Lingzr1uTvCm7xBpcrMImpiosBuYUGVPqmUrCFWNhm8r/AwvJlglSChjldsfH5szziXi2tQ+qpb69R1sNLxodS5MNZUkt6+00hbih5FWgPjCwzXZaZdS5SanKzWYZrpmc6CgaEoy3zEGwKdN+UEJak1+szSS5NusS4N8gsFqFtrfVHmSYz9W1o0UOkiyUyjVxyJ0849WMp5jziRSsPqlJdJW6skaar0iSuWH1U5j1ib+SrBShm8fONak+R8BBFyVFzfTwEavVeYFh1iUSyApBt+aPCNdiPZF/ExOXLW21MajLLVpa19gInSiWRSlRIBuo9BBqn0gMgPPAdodQnfL/bGdPpyJQ9o6R2lrpHIRsmZ4DuhQzcrRrx4Ut2ZsmTwiQubS0mySm45HnASs19inNB195LKSbJzH2j0HjEabnXitTMsjtH+ebRCetz90LszPdi84mXbNUnEj6R5xQDLXx0+GsazOtya1WHKjMBExKmUQr+JfdIGc39nLe8MLdER2N1FbjhHPQCK9oUxLVLGYZU65MTUkgvurP8UFk5U5Ael1a+EWkw6Q3sQB+cIz/LjJttDnNx2QAnJRUqsAnfcHlEa19hEmqOFyoAEZrkAAb3jDsFpNi2pJ8UmMGXH0y2NMJWrNOX3R+AHO4jZk1v8AbHvZ6XtfxhFMZZhra2w6R4E31MbOzPjHuSKoJM1lNrWj0IK7AEi25jYG9YzyW8PKJ0k6jXYITkSLR4hsJ7xNyI2eyb3jwJJVcwXQTqPUIKyFK2jeCVgWPc28/KMUJvqod2+iRufwEbQSCDpfYDkIvoZXUbEJCLXA02ja2SVaXSI1oSVWJ58o3pTtaJ8tl9RIaOxBiU2/2dyRfyiIjupj8pyySTokbwDjRae5lP1VLaTZVjyivq3Usz/aZ7oF0kk9Tb7bfOCeJaw2wpKlrCSVBABNtzpC5PAOMrYzDOs6K38R84xZWa8aIeKKsZekqm3VZAwpp5Z8ir/0x8yq84iVxPVmZZ4PsIm3UtObZ0ZzlV7xHdXF+tflbCrNAbUsOVmdLLymlZVJl2kEr15ElSE/tRzpxa4VyuHqLKTcqEpbVZLadM7KrXy3tqk2MJx5oxl0vya3jbhZUSV9o0TfXpFz4CJGH5QgDMlIVcjnFLMD6K1ik31HjF3YBWBh6SST7SfdDc3CAx7FyOT80HAUOh1O+pIV8uUTp6vS1Op4eq8zK0yXTqXZx9CLjfS+scN4o9K3H+JXuzlZ1mioUbJaprIS4f2tVGAdP4UcS+JkwJpymVKZQs3M3VnCyjzus3PuEdFYGu5nJv7HVWM/Sf4dYbaWiWm3cQToGjcmnKgHxWR9gMUDi70ra1Vi4mnSjNLYJ7pQAFW8VquT7gIacL+hTMKShzEde7PYmWpbXyLi/uEXRhLgBgbBYbVL4dafnU/9rnD60u/W6tE+4CCSxQ/kL1eTkCRkOJPFd3PT6dVqo2s27VttSWh/xFm3zh2oXofYunyHq7PSlJTuUJUZh346JHxMdnMspZbQWSWUhIsCvKE+6NqJ+SecyPPJddIFglNiffzinmf7VRaiuWcx0X0aaFhlSHp6TXXVDcvuFSf5AsD84szDeHqdJGVblJBunMlafommux5j6v8AZFmvyUu8CnMnLtlVY/Ixrl6IhudYUG02S6mxCR1EIlkk+RqS8Hzbqn/vSe6esOj+eqLj9EeSmatiKvSEgy/NT0wiURLy8unMt1faOWA91z0sCToIqHETfY4gq6DcZJ6YT8HVR2p+5n4WZp9MxfjN1sGafnGqRKuEaoQhvtHbeZcQD4Jt1jrKPzF0sxyl0psN8M/3MBqZn3KlxHxI44t19b35EoCglKApZUEuzKgbmx1DafJRjrTAXo98PeGEkJTDWE6dTRlCVPtIUX3Lc1uklaj5mCycROB0JCyCdTaJUpiJRSoBV19q2i/gUkx0o48aVHInkyy3kyU5gikKvaVUwTzZeWPfqTAuZ4duXzSdSH6k21cfykEfYYZZarIeVb61wLfD8RE5uZZWL5h0HjAz0+OXKJHNOPkrOfwjXZMFSZNE4kc5N5KlH9leU/C8A33lSTmSeafkDtaaaW0L+agAfcYuxspdva1oyKLpyXKk7EcowT0MH27GuGql5KcbW243mQCpP5yTdPxjTNOjLZJubXtfcRZ87gmhzqsy6TLodJJ7WXT2K79botf3wGm+F7areqVWaYUnZM0hMwn4kJV/OjLLQzXG49amL5OAfSPVXcQ8XZqhtUKvTEu8zJS7UxJSa3ZZbAupw50ghKsy3B3rWjqfh1xDovD7h9PSUyG6fieb7WorpKEd/RPZstC26siEDQczaH2b4fYjlCoMeo1BvcJamFy6lfsqBT/Oga/QatIlRfodQaUBfOyymYSn3tlR+UUoZcO6iG5wyJJsQqPOY3qdBlwilUijzi2wp9+becfAcV7ZShISSL3tdQNopjj7NV7B0rS5GcxpNVCoVNZedl5WXblWWWEEd4BF16rsBdZvlVHRyqzLsO9iuZQy6TlDUxdpRP6qwCfhCHxE4MYd4j1YVOqon0VDsEsB6UmC3ZCb5QEnu/WPLW8ZHKV+o1QcU7oRPRdksRf4RZKXl8TsGhzQmqnPU+XmGyudcSES7anWzc3WpYIVfNZg7DcDQGqfxh9OTFVYk1GYpmGPoZfM7mDj7KRLhSUk6J7QOqASLd0HmYmr9CnANUnXJyszdbrEwAEMLMwJfsEjkOzTqb3OY/CGDD3olcKqA0pC8NCsLUbmYqr6ph33L7pT7rRqWphGKX2AlHqk2vKFviVx7wxwv9LiuTFSoNWqLlIoUrQUOUWUS4tD5V6w/wBpci5GdCBrplMWbXce/wCHCVbkqNSFy2HnWWXFzVda7J1DoWScrJBJVawuSBqoaxPwxwzwtggPChUaVpxecLjnZZlqWo81LWSSffDeLJAKGQ0o2uGwNYy5NRLI9thkYpJCRLcLDTQhco5RmwDmKn6FLuhQ6bg38d408QeFtG4kIYla4zKvUiXWl1mmSssGGO0CSntFBJuo6q3NhfQc4fdFA3ypP6VwYjvy4BVZTQB/OVf5QiU5VyHFU7FXC2A6NgthqVokmzTWUXARK/QpF99BDrKV2oyAyMTz6Tzuu6fgbwPJbaSQMtyfE/bGpTrmyUjLz1uYSpOPDGNXyNMvj6rs2LzkvMI2s41lPxFjBFniexfLNSS2yN1MLBHwVb7YQnFuKUQFHz+t8d4y7JZyqFiT15fdDVnmvIPy4ss6VxxRJtIPrZZJ39YbKfnt84Ky03L1BOaXmWZhP+ycCvsMU4lBJupABH1gNvhGtcnLkqWDmUNRlTl+Zhi1T8oX8peGXS6gpHs284zlWggFawM3ido+ZvH5yXc4v4uVNLTNIkXm2ArtFKCQ2w2CAT+lce6O1vRUw8/hnglh6XeBQ8+0Z11B2Sp1Rct7goD3R2MC6t2jDmXSuS33UB1J72nnAKfpj0wlSm3vV5dOq3ibKI/RH3wSmnUsMl6YOWXTrlsbq/s+2A1UraEsGYnm8jKdWpZRsb8iR90bTElZDmZpTkm53vUKWgHM7azjo8CdR5kfjCRWsSoSyhssuyVOSCW0p7rr4PPXYfpb9IzxZVnX5hL9Rc7VXtsSCe6GuinPHw+2KyxPi+ZfV6kAqoTjneCANEX2JPIeAhGTIoo0Qg2O/D3ELVSxpUGwtphIlWipKd22wpetvMgC/OL0km0CXCm5QG49p5XeV8Y5Y4V4Ym8P43RUH0lyZnE9ksq1u5mCkjySBfwjq6UlGTLHtEqdNvaWux/sgcMnKNsrIkmLrskhmqsPpbdllB3MW3R3Ffqm+nu3hsl7TDaCUgEgHTpC9PSKZQdolx5IJ9hw50k+e484PSr+RACQg90WGa1oko7kUqWxsdkEK9tII6kRoXR5dzTswPGxEFWnCtI7oHTvXtGLzZezJAyHmpPet0ivl2TraAjtAbI+iduon2QQQPMxCmKSqVRmW6jQ7WtE+blG6aM6plbKRsSYresYgm8QVZ1qXfWuQZORakqypWRvdX/lGphfy0MjOTG1CAoBQ1BjLs9NY/U5lSZFoKFiBa2u3vjb2Z6XhTjvQ5M0BsE7Rn2esbMtto/BB98H0g9SR4EW8/GM0ovHqQTG5DZ3+UToJ1o9bavytGwpy+cepFiBGaWys2+MX0EU0YpSVeXMwNq88mWZIBtYbwQnZhMowq5tYRXeKK0UtLUDYnRKdoTOPShsX1C9U5ldYnHwspLbQJTm9nONU/C14xnp1xlpKyQp1SgR4m//AEiLLKCZjIogkq18jvCTxKxeMI0NThWlM2ECWYSTqpxWibfC/uMcTK9rOrBbpIRKbU14+x3NTT7o/JUs85KSMuEXztpVZbhO/fWm/wCqlMB+Ns61NST8kjVErly3VzJ59YeMF0WUoOF11QtqQ+00dOSQBsPxipMVzC56TqLrts7pKzp7/hHMjLqyWdJ7QopmaZ7GcJtYOjN79j84trAoc/e5JOdkspynKoC/PSKyqbJUwV5SVsqzfs8/x90W5w4ethWn2J9lViP1jHUybpHPvpG/CXC+gYDk0ppdBYYmcurrjSQ8dfztdYaEVj1CyZhpaSDbOFaKHX7IzarcvN5VPXSdy7a1vDw98ZuSEvMo7Rp25I2cFrn3aGNjk3yzD00Zqqcmt1shS2nU6gglJJ6G2/vES3JltSQl6ygRfuq1hafp3ZuAkFLgNwQSUxHU87T1qWElxgk3SbqAHvOnuiki2HXZBpxeduYyHl2qSr7NY1O01bqVBwNva37qr29+hgKrEmUpKWwlAHe719PC/wCMSJWvsKV3czazqQsam3iYtlBFMx6qjul9KQCBdOZIPXrBCkVoNzsujtW3MziTYd1Vr9Dv7ogpngsqSopzJOmZRvr4iMfyexNOtqLSEOBQ5ePUawJEcAY6ObG+I7C16rN/89cfRX0QaF+9T0bsDKyBDtRW/WHbDVXbTJSm/wDw20x87OKDIpePsXMgWDFTmwBfo6qPqngOjpw7wkwNTkJ7MSmHpBsi/wBYMtqV/OJjtQ4swz+wwO1QtVAoUojL3T8xE+kVbtpxxAOilNrBG1xmH2EQs1pN6qtaFFJVtr4n8Y00ebcYrqErOUG41HvhsZtMS8aaH2nVtxtp5x03XLpbcWeoCyFH4C8F5OsCziQq5RnUD1sIRZSeDVU7FfsPIcYVc8lAkfMfOPKRUVyjSW3FnO0pxtV+Yy/2RqWUyyxFjy2IycwSq4AF/tglI4kzDLcGxtf3GKqk6koS9yrKVFRN+ltInUSsXcQlRNnE6eYFz9sEslgvEy3Wqu0lIUrW6bgDpaJTU406QCrKYrGkVkzEtLBS75mh7zmtE2VrhW+Rm3J5+cFaFODRY2ZK1WSQTGRTltY6wjtYiUysJza2+0QTbxH2agFKBI0+X/WLpMrdDDNMNTzKmpthuaZULFD6A4kjyVcQtznDegzRJYlnKYo85F0tpH7Buj+bBWWrzcyEm41Aia3OMuoBSrUgGFSxqXKsNTlHhla1XhTPIKlSNUanDyROILS/5SLj+aIUanQarQmyqfpU8ygbvNN+sNDzU1mt7wIv1KUui99Y9DeU3BII5iMOTRY5fwao6ma2ZznJTMpPXEvMsTSwdUNuBa0+aRqPfG90O+ylakjmi9v7Yu2v4SouI27VWkSNSI2VNS6VqHkoi49xhUXwcoSATT5ipUpPJticU60P+G9nHwtGOWgku1muOqi+UV0U/RiwVm05/ZGqxSSdweu8OFQ4WVaWCvUp6SqKPzJhtUs4f2klaT8BC/P4dq9KuqbpE9LtjUvNN+sNj9psqt7wIxZNNljyjVDNB+QapJIvlI8OcaFJVc6k+BjE1aQLpQalKBYOXI7MIbVfplUQb+ES3kLat2jSgSNMwtp1EYpJrlGhST4IoJQCLWHONnbX0yhQ8biMb92+46CPQ82L3Ub9AL3iFtklh9DZSezJQfa1yxIQpkuC7aC0VC5JN0jneB4cSoA2yKGwOo/shV4oVtyhcPsSVBtSW1Ssg84gg/WKClPzUIiTbohx1VqmrGOLJhoSjL669V31psk5glbiiDcakJSQbfox9RMItS0nhyRDK0qlEsI7Io1Ck5RlOnK1o+VOCW3pvGLK2wZUUqQceDgUTkWUZEm/I3UY6j9DriDxDcq8xhZigzlew+0hxxEyiXt6o8pQNnHlqCQnew3F9rR3sObpyfLo5+oxOUepM6rrU8G3wtaVOOXu02RcA8jaErEVYXS1qfdV2lQOxIFmL/K5ixk01dIl1TNaMuueCS46zLLKwyjpmsNT4DXyF4UOKkrN13BlYp1FlpSUmXJN0yTjZzgPhBU2pSSBfvBPM7xtnKlZij9jn3G2Nm5CcRKNPJmKrMa5bXyJOy19B0HPyhl4ZcOapPyzdbbpjtRZdcUkOqeSVqUD3lEE33/vpHJdB4H8RJ+eeq81WJ9menF9q4646lZUs9QQR0FuUfSXA1BGAsE0GhOvOzTshJtsuzRRcuOgXcWcvNSio6COdirPN77I15f0oquSPh7AgU21UpplySmm3FltgJFkJ9kEi2+5v4w3TlZptEpUzNT7xl5eUYW+/MLTcJbQkqUo25AAmOP/AEg+MFWqfpU8K8KYIrnZzNIeU5UlSrmZCXHVfTMvJ2OWXZOZCtu0Gxhw9LHinKSHCCoYblZhTOKcX2o9Okt3CHHUIfVdNwAlCyNSLlVheOkqSMvS21fk6IlJyTr1GkKpS5tM3T51hEyxMMnM260tIUlQJ5EG8RWp9po9iqUmlLTdOZCVEEjmCDb7IjYKpjeH8IUeiMlbLNOlGZRCUOJPdbQEDT3fOKX4ucc6Xw/xvM0ep1uUpS3JdubbTNTKWStBzJKkgnXVJB8QeUBOSirYcYXsi8ZnFbcnNMS7VMmHHnOQaKso8STYQRlMSSb+zqpV2+ra08+llW+IjljCfpIYUq2K0yEpiBisz0w0lLfqb/a5NdSopNhy9wiyJvEE6vuuJTMtk2PaIUdD0O8LWaJfyWMHEbEjs9WWqe++y3TkJC9VKAdvprl1tytAh7EiJcyctT5Yzb6lhLaGmwltkDcgb3MVxijHVRXjdVAl8OTcyG5dt81R6cS3KNIWDZJtdaiCk9wDle9jDRg6qzlDHbIlpdx11V1nIVX62JNwOgGwjPLPBPdmlYn0rYuGluzKpRv1gJSvKAUJGx6XielOblr1hRkuIjDuj1OcQRuW1Xt7iIMSWN6K7YrfdZv/AKxo2+IvBxnB8MTKMvsGBL2BNtIwU3rtGbOIaRM91moyy1HYZwD87RKaSh4/RqQ4D+YoKv8ACHKnwxTsioZPONmTIABvEtTQRy16RiGSpXL8IYolGpDZVt7zGxZDKCokADUkxIUkMo6QuVWphZKEq7g28YPpLVA6vVEuhXesgHQRXFSnS9MrJ1CCd+vSGPEFT9Wl1uK1P1B4wly6y+7cm59o+N94yZlsa8RsLgaKJojRaSkX+Uc249qD+M+ONUCuzdp9EmUSUqwq5St/IjtXD4gnIPAK/OMX5jHEchhmlTc5PPtStPp6FTD8w+qyEoGttNypWVAA1JUAIpbgRSHq7Pqqs8ykzEw6udmCobOOKK1eZuSPCPP5vTFnXwq3Y/47mxRsMy9PQkJVMIOfKPDwilq2ntKfMIFwez+yLG4lVIztYXrdlsZR06RXU6olxaFXJUDvyjlwVHQe6K0dN1G4uk6EfbD9w7cVL4fl2SojslLSbcxmNj8IRJlORxSTrY2IhowPUVFtyXucyFXF+d46Sd7GCa2LgmXHc3ddQlxJ/jEJKVW6HcRpYn3GHQlTbmUDRSALH3bfCJMyC4o9iM4UbAOJ257iILkmu5Ks7ZV9Vz2T5HnDkmZicnEqEOlCg2ojXIoWV+ESPylITndWnslq63tfy2hbnZNSEjsAlR3yKFri+tiYgrccVctHJYgKCFafOGLYqrGd7C8o+6XUKb17xIAUR+EY/vZmkjMwoqSBf6JVx8CYFSk9MMJFnALixyne3hBuUrq0lLiVrB5lJBiWV0mAptRYaKljOLXCTbvdPKMGqlNMr7KYS7KhNgHJc3B8zDDL13OlOdpt245aKiYhmQnjorKoG9nBa33RfJVUfO/jAc/ELGZzZ81SmjmPPvqj61TVRk5rDNMekXQ8wmnypQrSykqZbWlQ8Ckg++PlZxSok7VeN2KaNTZF+fqT9ZfbYk5VpS3XSVm2VA1NxY9I7e4BYvfo/CzD+AMSVeSexrIy7i6bJyyw6qYk2yomTUoEhT7Qz5bbpSALlOvYi6jRgmrZclSX2y2HeV8pt1MQw6UzaHQLlshUAKbiKXrDJMu8jtEOZim+m1j8x84KpmS6VpIyOZDYHnpApkom1NSlvOPtqykd9Met1ATcq9Neyq3eA62jFn+FsJtqHG7wKkVKSiaSD3VItBqVA9KYck5wOSal3sEKKT5ERhTZwy7KnAoLEu5mN97EG32mBss6ENOhCvbAIPjaI8q+ppL3RQyk/wB/KC+YyukbqZVQlpBSRlaczg9Uk6/bEmn1MKeWQbCxUPMm8J9LmB6m80TZTbmdPkRqIyp9TKVqFyDa9vG8MWQBwHgVErnQL3Fhz6G8SpmsKR2dlaWv8yPvhOlaoBUUqNwCkmxHhG56ePapBN7JA06QxZLFOCfI8prCpeWTrqAkHWCdLr6g2CVa3tfwEIk9PZWbE6FYiZKzwaYSbiwTvDFOhbxllU/FPbrbbURrcgjyvBiVrSCpoFVwtVtf7+EVFR6mQ/KruLZLE356iCCa+UTssgr1S+lv4g/jDFNCnjfJa4qbL5SL6FZSPIRITMsKTe4JPOKxYrpQSgKutClfCN7FeV2jqM2iQAIK0DTLJQpp3YD47RkW0k6HWK+lsUKTMoRn3cCQB5QalsSJCUlZBv4wNJl7oIYjwfRMVyqpet0an1phW7VRlG5hJ/lpMIqPR2whTc35DYncMJJv2FHnXES1/wD5dZW18ECLBl6+y8kaiJbU209soQqUFJVJDIzceCp6nwgqjCD6hU5WeAGjc40phZ/aRmT/ADRCrO4TxBS1L9boM6lCf9PJhM22fH6MlQ96BHQqkIJ0MfizbUbxhnosUt6o1Q1M15OZWJph98tIfQp4bsk5XP5Bsr5QNxvg2UxrheqYfqXaNSc+wWXCBZVjqCL8wQCD1Ajp2q0WRrjJaqUlLVBsi2WaZS7/AFgbe6Eqc4HYZWpS6d+UqA4o3Ipk8sNe9lzO18EiMU9BJbwkaVqk+5HInDP0V6Nw3mJx5FeqdZXMBKB6/ks2kEkeyNdTz6R0LQ+IzuBcOy9PYlag82lIQ1T5OUU6W1JFiRlGQJVvcqF79bwYqPCDEkvc0+u0+rNpvlaqcoqVc8g6yVJ+LUL07TcTYeQfX8JVQtg6v0ns6g2PGzag5b/hwEcefFJy5YTnjyKmyPMYmxfiWTfalpVnDrTyVXmqm56zMknQq7JshAP6zh22jfR6FNSiWPX69Uai+0EAKzplmrgb5WwPmTA+WxpR5qYMsKrLomQQlUtNEyrwPTs3QhXwEbcbUio13CdWptNnW6XOzkuplqbeSSlAVoo+9OYXG17wmU8jfqY1RjWxzNiHidWqnxCqtRwtUn5KQYcySTbbqQ0tto+2UL7qipWZW17ERd/ArjVjjH+PpHDFep0pOyjki9PTM8JNTDrLSSEIcNjkUFOHLcD6qjfSOearwex1ghaXBSVTsu2dJqjudpYWtfIbG1uWsL83wT4q8b69LYtGI5nCTcvJopdKS4h2WdRJN3CRkbylAUSpRBF1FRJ3jRiyRhu3SGZYRlDZFiei/T5Lir6SfE7iFIyLbdKZm3xJBhJyIVMOqSFH9JTTalE9XDBb0wuIFLpXGbhjRZlSUNUVl6tzDraBnDjpyMIKgLgWaUrzUIA8PvQpawdLJmGcZ4ipFfUQpdSoEyZNItskI1un9Y/CH6iej+qWxVPYnxLieoY0xDNttsevVNhDakNNpCUJsjQmwAJ0v01MNlq8fS0uTNDE+pNgzDnpI4eqU2GGZedlgps9nMSiXHSlY3SUpvfzG94ZJmUp/GKYk6rWKCl0syplS5VpEJWsZ8wsFJukaq+MPdNw+3KBIQkNpGgyd0D4QWalGmCSVFw+JMYZ53PYdGKRVdQ9HfA06hK14XpzGUaLlW+yX5gpsb+MQE+jBhjMpctNYikwde7WX8vwzRcxRYjIQLbERl2xAN1a+MBYW/3E/DuApKgyzMrLredCBq7MOlxbh6rUdSYONyzrawlCb5frJF4Ny7YdBPaJuNLAbRg60G1FKj3uYQALfCIkC2yJLds0nJla31Ktz8I8dzOLsEJNh9UGJLkqlbQXfJfYnrGtk9gSFBLqfFN7QQBHDZVYKTmJ8I/NtpYUpSFBtV7hSTlN/MRKd7BV8rSb20IJT98a22lZFFLSuzG5ve0EkQLyWK63LgBM8p4DQIfAWPidfnDVRcelKQKnLobB3dZJ08Sk8vKEFDjGQKeKkEaZlC1xE9opU0EFeZKvZcUND4X5GNWPLOL5FyimWLWao24ynsXErbWkKC0m4IO1oTZybtnUT3QdYgydQck0/k1y4GqmSTsNyn7x74g1KcFilJ0vYDrHag1NdRl6el0AsR1NU4+UDUDW1/lA1lRalw3cBx1BSPO3OCHq4L4cVoCTuNzFc8VOIUrw2wjO4lec7NyTbc9VbULhx8AhAsdxmKfOMmZWzXjpbFFcbcTzvELjD+8liZKMP0Fxlc60j/tM5bMlB6pRmGn51z0tf+FJBOE8IPPKAQQ2Rtb3xzP6M+EpqtTC63VHC/UZ99U48657S3VkkqPx0846R4kzokKRLU5KslwLp52jzerfq6VwjsadbWysKnO+uuPu667Ewv1JeVRBJukA6coLKGZtSRoq/wD0EAqnZbaxc2NtQN453k2eBJrKS3OvDbMc4v0MRJeuDD63J5SVuNMoLjiUblIFzbqYK4mlyFoeNkBXdKSdQRpC5MtGYk3kFJIcQpvNyFwQY6EKaVmWa5OpkOyy1gLcMuq2hTqT7oxlVy7qiFLUUA6FSdD5g3jOcoyr94ZSrYJ5+R5RpFLKld1a0uItdBsSbcob1fYx1YSdw8xNNhbCkkbjW49w3HxiE9hpZutUuXgn67Ss3xFgYmSjb0uppTRF+YSRc26j8N4MSdUL5KXEFKkmxWk2J8BA9YaixKm2JSVYK3VNNpCsp1NhrtziW1REvtpLLxAy2CVgaG20OopzVQALqWnBayVoAC9fLSPP3qvtAoYdLrY17N3fw03gXL7BKLEdcrNSQWXVKWpAvokFJ+GvxiQidmmWluBKStsbKtudrn5w2qlVSiSh9BZUNBmTcH3wJrTkshhTqm0EMd42HtK0sD1F+sXCbtIjjStjZgnDVMoNPXPzXZPYmm5dSHZrs052EKH8WhW9gDc66nwAhFxV6PWE60/T5oyMxK1CUWwlifpUyZeZlbA5lpWNL3IOoItsIXZjGM4Z551twhQGYJJ3GxvBOl8Tly7SEvLUSk2CybkW2B847KaRyXGVgDEPB/H1Pn6hWcPYjl5+cQ4VOyU60pozNvr503TnNrk5QD0ESMI8bp+VnZehY4pMzhqsPqS1KvzIHq0yT+Y8LoN9NL38IsqhY6lKo6kOHsHjbUKtceNt9YKvSNNr8g9KzjTU5LuZg406Aoe9JEM2ZVtchHDNSZeS4zmDgYK0E5hdKSLpPyI0jUlKG1PKQrQ7eV94qg8JavgerzNTwZWfVmXhlNNm8zjG+bRJNxYjTKRoSLR+f4sz2HpxyUxLQJmTlCAE1GSu+031CgO+AOuXztEdrYiLZlm7LCbDLzPOM5VlKypJFwoA+IhZoGOJGrsl+TnGZ+WWjIh2XWFEHkdOsG6fVpQJKkvd4IvlO5N4HqQVGlhtTTq8pNjaxjW0FF0kanXu9DeCIaCllaQMqrm/v5RHydlOKKdO8dDz0idRDSZpTc2wsnKU3uVczEiYncjo/NCR9t41vJ7V7MAbZhcEfGNU/LZsqtlWOkFZVBubn86EC+YlfxieibvK6fmEEeMKz6nA2ySLjOnnG5M+pEqFA91SSnwuINTYtwQxUqc7NgquB2Tg8dL6x7NzZbnnFg3s8lQPkRAajzhc9ZbCgCvKpI6xtTOeuPls2zqVZQPIw1TAcaGWo1P1SelXEjure7NYvyUND8YnJe7CfWm5IcF94UJ6bC2GmnU5Hm1Cx/OAhhqTwU3KPjU2zCGKYvpP0tUSai0M2peBt8YmztXU0pDYUcxehWbeKXw6km6TeJtYcHrTCtgo5geWwi+vYjimONPrikpWAbgOFN7xPlsUqD6khZvmy7+MIss+Up9q4KiY0SU+oTrRCtCq+vvi+tAuCLhZxLkBJcv5wXlsRJdSdeQMU7N1sy7Cdbd4aRKpGIytCzmIAVluOekH1pi3jfguSXrDK1EEja94mKmWliwIMVCvEZacUM+qUjeGCUr/AHEd/wBtIVF7MFxaLBSArUGMi2CORhPlcT3UoBQULQWl66hdsytSPnFNFpvyT6vRadX5Qy1UkJapyp07GdYQ+i36qwRCargnhSXCvyVJzGHirXLSJlbLV/8Ackqa/mQ6MVBp0e0NRG5L6FnQ7wuUFLZoNTa4K1m+EtUl9adXJeaSP9FUpUtqP/EaNr/8OF2oYZxDTypU1QZl5IFlO055M2k+Nhlc/mReBQCN415MhtuIyS0mKfih8dRNHOjlVk2niyt/1SYvqzNXYcHhlcCTEgoctcpNjqFEbxf84wzUJcsTbDU2x/qphsOI+CgRClOcJMJzqipukimuH/SUuYdkz8G1BPxEZJfD77ZD1ql5RVodW3uVKt1tGIfzEEJJ1vZQveHmo8FlWBpuJ52XAJPZ1GVam0nwzDs1/wA4wEmOHGKZA92WplXR+fKzSpZf8l1JH8+M8tFmi9lY35+OXkFKqKrWDLd/ERoLhWSo38kiwjbOUmr08kzOHqtJptqv1cTCP5TJWPjaBzFRlpj+LmmSb/xZcyr96DY/KFvHOPKGqUXwyal0gkZ+zuOR1Maw5kVcEhR6HWMrm3slIO902jBsjPe4uOVoAIky6+3KsyQCNQVqJ1j15ARZIcSATyjDs0OrTrkHRI5xJTJt2v2guTtbSGJWLbNbCkFLgUjkNCmxPiOsZoLbOoUU6d49B4jpG4SiwLFSVJQdLaERl2ak+0rOF6E8h59IYkwWyEpIKSTlcZVzGo06eMQZtp+TSZqnud3dcuvVCwN7dILzaQw1dCQhQsMp2V4EQEmJ9Dbi1JFm1e2g6Hx98aIRaAYsYjxi41V5ZTYKFS6UPZVG+ZF7KF+dvvMNIcEy6rcpJ7t+nWETHLbedtxBDpSoKBHNKk2I8jcQ3UaZz0WVmlKNlsoJPhYCw+EdLT8tAS4skT6F9iltjVxSrJTf4X++OHvSXxU5xK4xSmB2HM9Boi+2msqu6t4gEg/qpKR5qPSO1ZhU89KuplAFTc0ksMD8xatL+4XjlCV4dM0fi3jOodmXkzNYeQy4r21obITcAcisLPkBFaj0qxmLdlt8G8PMyEmh49i12CNUtDQaXF+mkBcdVYVGtzKwruJIA1tpD6p0YcwkXCAmYdT3iRrY8vdFQTj6nFLOYHMb2MeXzLezr4iK6olknL3uRHKBFg/NMtkXT2lrctiYJOrAvY/OFeuGZekEyso4W52edEq0sH+KK1WK/ckLPujA+TZHfYrvEGJa3iuYflMK0kvSTLikKqkyLhagTcoHMDrr5QsN4TxA7MD8rz82pAV3mkpyp+AsI6dpPDiVkKfLtSDhYbbSENttOXAA8IJNYUqcsgZXEvJ/NcQNdOsD/wCoqHphFUPei6t5PctBh1Lag1NgS9+TguCPOJi8Pys2i6HuyWRolSe4fwiPLyq3U9nudB2atQfK+0EpSU9WQQ0MydlNqOwjR11wc/pQuz0g7THVJmEhtSbFL1th5/2wOanEzzo7BTcwAe883cED5a/hFionWFNhpeQIG7TwCkqJ8ecajS5R0WbbEvbUCXNr38OcRTstJC5JOvocBSVLGidQLk210/6wYlaxlIRNIXcbFQ38v7I/PUhyXCgAlaB+YbEe4mIUyw4QELSopFrJduNeo5RTk/ASSD4m5Z1sqCkuC1g26Lgnff3xWnFaZlqXIycpLNlp6bUpxaQq4CEkfaoj4QffmAk99GuoKs9z/wBIqjHtR9cxm7LhZWiUkm2xrexUoqP2CNOni5Tv7Cc/piCW5gocU+DmyG55XSdCI0TaRKTFwSth1NwqMFHIpQOmh0I3Bj1oCYlOzV3lNn5R0mc03MTTjKMgUFIGoJuCIM03F87KAKS8pBGhJ1B8+sLiF2IQLnbKSI2KObU2URvp9kRSa4JSZZNJ4qlQQ3NJCV31UNoama3SK6z2EwhAuLd61/nFEdqoghWqRqB0jY1UXmFJAdXlH1TDFk+4Lx/Yfq7wQkpuddqmHptynT5TdLso4WllX6RGih4KBhUqNU4jYEcR+VJCXxHIgAqLSewfA8FC6CfcmCFFxtNSahZfaKG4CiBbxh0pfEtmYAEy2Fg6EHWw+EFcZAVKIu4U9IigzU2xIuzy6XNqISmTrDfYEm/spWe6r3KMWcMRy7jqVOpLRtmAIuCLa28oSMQYAwXj1hwOy6ZZ532ihIsrzSQQfhCHUODGLsJt2wriCaXKs6olkr7RCR0DTl9PBKh4RfS12slp8nQIm25hSHJZYdQpPK1xrtaJM2lLraVJ0srWOZpLitinB8yWK/QHHFDRUxTgW3NxqWV77X7qj5RZOEePFBxQsS6KjLqm7ayrwMvMgjq2qxPmLxXU/JfTfBaHYhcqVZe8EiMqRIJqdHfYOiw6spJ63iHTMQU+eSGUOhLljZDgsSI3yNWTQWn3HApSQsKBGtwd/shsWgGnwCJJTsq+UJV2bzYvZW1r6RMqDq0TSZ1lOVKilSgnrpeCVVozdelUTkioImkgrRl+tztACgTK33JiQmQULVcpSd0m2oiW4ui+UOFTWxUqPLzCUpzpN78xvE8qVM4ZlnkWUW0DQ/CF2juZHJimu3S4F3AJ3SRpB7BL4fZmqW8bOMqIt1B1jVBpszyVC1LzllN2N84IsRextaCc7NJXLyWc2Iun7IETMiqm1hyUdHcU5mQVbc4/TuZ2TTYFZbUdR84XbWwdJjImxby5rKCTceEDJTMl9hQG322jEzqnJWRm06BaMq/1hpEORnip1tQIy5spETqIok+qTRKdR9bUxtpMwQw5Y271vlEKeczNouNQvUiMqabIWRqM2415ROrcjiEH51SVLF97A9TpDJJVC1OaIsC2AnU67QmzMwlM2UrVYWHu0g9KBSVKbGocSFJI62hkZMXKNEum4gUuaDZUe+MyQeesHEYkU0hwkm6AddOZivJN0y07LKNzZdrDlflBaZcU22+CqwVoM0GsjKcEPFMxQtyYQjPz+ItDJL4lyNklWxioaROn1ppR0KQoG3lBr8pd9TZX7VrXhinYtwLXk8UpcUUFWu4gm1VWnDbOPjFOUusKEyUBXeSDfx2/GC666tDQuoiygIYmmLcH4LYE63YHQpPQxkh9tZ6RWVOxSpKlIzX0zJAMF04n7pJUCSNL8jBKgGmh8CAecalICV6GFeSxWHMutzfKbwWl6whwG6tRveCSFtsKAEag2MQ6jSZOstFuoyUtUGyLFM2wl3T9oGNrc62uwvuI2hYVsYPpsDqYpzXCnDb7ZEuxM0o8jITKkJH7CsyP5sKlR4PVqTWpdLrsrUmQbiWqst2K/IPM6fFuLZFjtraMSqx0gXpsc+5DI55x4ZQ9TpdSw4hT9WpczIMo9qZCfWJYeJcbvYeKwmPZNbU620+06h5lYzNutLC0KHUKGhi/WXi0bpNj1BhLxLwypE689UKSlNEqq++tyWR9BMK/2zIISo/pDKv9LlGTJ8NVXiZohrPExFRosZL9deca6my65JP+rLLLhTmSUGxChr/cQpscQGaBjxrBmK5U4crs2SqmLccDklVUjf1Z+w+kF9WVhKxyzXBh2mEWdACrFQv3d9I5yxyxvpmjcpKStChPVibmJIocSkPBIIKdAsX0VblzuIWZ2pesIXMJWQOzDmU8ztbzN7Rtxu4uh1dDjalhTKwQ1furQd0jzBMDhJtzTTsqyVZXFjJZRBye0PlpD6KQJmnFrkG2HFgLBOdKhYi/sp92g90OGE1KqOHZFhsagqQkeIWYW8QIefcRllSgOthxbnJSgRp52EOvDpSaVQpupPov6m+4G2Tuta7ZE+8n5GNODvJPaNjrQqfJ0uZm5qYKUStIYK3Fq2uE513PwHuMcv4EpzlYqDE7NFbjzye3ccVoQVkrNjsdTrFm8ZcTvyGCWcJyz5XVK6SudWmxUmXBBdNv0iQgeaukB8KsfkeiF6YXmWsWCjp7vCFauV1FDcSrcAcTarmUiUSq6EC9hvtpFcuG6yCdLdNoL4in1T8/MLUdR3QSYDOK7+a+hGmmm0eezRpnWxcESYWbEaeNhASXnEu4qlJbs8yWW1TS1AZstyUIHwCzBSYWouGwBUB8Y/YKp8m/P1WceUQ84+G0m1xZCQAn+UVfExx9Q1CDZ0sEeqSGFc4haO64lAA+tcH7oMSFReabTlfU2CNL6iIrlCamSOyeSQoaXVp5axgaBMShSsIFjfVKcsefcrO0ky1nPVAFPCZSln2zoQpFxqL9I9k6pm7tvWU2uVJ7h+e/ygWWC0kKWAFZrhRGt/PnGlyZclzlCDlUNRa6T948xHpEebkNSnGZhJzhCb632Pv6xtYkgqwl5gC+uQd4D3QnSDk9KqB9ZWpq9gtRKh072vwMMDE+60HEqlw8E3OdtKUJWLbg3i0gbDIW6wfp0Jyg+0BfXyjxbSZhtYQ4hzS+W/s3gdJzqlPBbCw+3b2SdvEHmIyKmZp7MyVocSqxyiwvzNoNbFEZdITqtYSUDVQI08T8I51cn/yriuvzX+seQkW5iyiB8CI6HxTPTFMwpPzDpacHYlKHQNQVGw8945ow8S+5Unz9acy/BCfxjqaRbNmPO7aRPmLhSut9fGNLbplXkOEZkKNlDwiROAJX1uN/GI5bDrZGoIB2jS+TKb5xgNuKI1QrVN+X9saQskEXIA5RLkSidlFy7mjrRulRO48oh5SFEAbaawISW56HgBcgqjxSwTdOg3EeJWDcEnRNzGKmidU2gRlUZXTyTm99r+EZonHWVgo0G45xrCsoGYRloUk2+cQlWT5OsTMupNnVhwm9uUNMhxCnJEJStaVW00EI3ZEKzHePyla6wxTa4FOH3LkYxpRsQy3YVSXZfQrSzoCrC3jtC7ifgXhHGkr/AAcIQSbpS79IlJ8L6j3GK+beKVCxPvgjJ1yZkxdl46HeGrJ9xXQ1wapjhdjnhwpC6DV5mZkh3hLzJM1L28Ao50fsqg1h/jVVqLMqkcS0dySQtCkGal1GZYT+ukgOJFxbYjXeJ1I4kz8gkB67zd+8kjcc/fB1+qUPEa2W55tDaXjnbdtZK1HqobRfpfBVtbMM4D4r0VM5JtytVlp9h1oOFlDo7QciQgnMLbHTSGjFbslPoYrVImELXexCdCT4xUVV4OUirJT6y644GAVtPpaBW0OVlAg8+RB0hHRg/FGD23nZSvT7sg+sllxK0zKUq5XSpJUPjBU+npJtdnSs3UvX1ytSl+66Gwu3M2NlD3QQeqq6c/J4glblskNzKOVjsfu+Ec4yPEzFOFpV6XrFLRUkqWHZeapejjStlZmVG5SobhJPlD1w99IHDNblHpN6YRLsPnspiUmboXLO7agi4SeRMUnJMjimXzWJeWxLTJeoMDtFJso2Gu+0LU222y82ptYVLv6d36ptt4QFwdjtGH6guTWtLsrcXTmuQOo6i0OGJKTJzsuqoU17M2uzmRJ0v1tD+pZFa5F9Li6BlEUkyb8ivRSFkoCuV9YHMMhmo5Fad+3zjJieDcwhbiNCdSPhEucbQt1a0nVtYUR1TvAWFRrmWVNpUDfMFCx+MY01ZaW6hRBBIIPjBKpMlUo8oa2sSRy10MaJVvtG1rCrLABJPnBlEWp/xhUU3AAJMGJOcKZNl3MT2Vrq6i0QppgTCFEg5smov0jKlhOdDDhul1u4i06ZTVnk4oestuN6ocKVJsdjBeoKSqQDml1AEEeYgHMy7rDbSTqUkZb3POCko8qbprzSk6pOgV57QRVEKmvdk+/sVBKjcc4JTjoS1LTCTqHBmA0teF9L3qs882pJtYgXif2/aShbUdMwF/ECLUqKcUFUvBuprUBujSJM3PKcKAg6X118IFdoBLomDp3bKtEVudDnZnNc59QekH1UB0haQn1Nzi9TmbSdfCCE1VViU7iiAVBSTvpC6lzsJ14E8gbc7X3jdMTBEomxvlPy8oNToFxGGnVtRmQCbZrqsOREHGcSFCQtSr6WI6QgScwA4kg94AlJvEqYnD6u+CbBQ+cOjIW4WWJI4rUAO9dSDYkHaGWUxCCSCq/O5imJaoZVp10UQkwelKwoBBKz3TqPCHwmZ54/sXDKVppywzb84niYQ4NIqGQxBYFOfUnMmG+m1wOJQSv2he0bINS2McouI4Fel76RCmpjS4No0y08HwQbX6RFmngpCxysb35RsURV7lV8feHNL4rYGqNBqjQIcSVy0yn+MlX0i7byFbhSTbblcRTPoqcZqpjqm1LCmLnSrG+En/Up55XtTbOqW3z1VplUeZyq+tHQGI54BlxKjp0PlHz7xPjpjgv6cMriIuGWo1RDMvVjfQNPJCFLP6qghf7MYtdiUsSyeUbtLJ9Th9zr7ifIByuS8wFBQ7HMBuCQd/gYWKZUDJzUupYs8Vki5slSth5XB+UWHj2nIXNsWCbuNraCknQnfT7YQJulom0ktuJLjFgQOXMH3Rw0dRMnPzwqLT5eYCHsyShAO4IsbeMDBieXwvS5+qVZ5cvSJJJecUrYuDRNhuVEEgDmSBEipSa/yqzLovd0hJVyNxmB8xaCOJcKy+MsHTNGcZb7V3s3GHFC4S+ghbaz5KHziJuLtBc8lU4aTP43xE5X6u2W56bVYS6tfVWB/FtA9Ug9481KUYcOIVXTTpFMuCL5dVADp99414For9KQoTIW26wC2ttY1Ch7Q8wdISMdVf16rr5dmMo6dYyybbbZpitxeeUog5jqbX/GNDrmVA5W58o2lWl+v2RHmFdwgfV2tHLzI6GMA4graKHR5yovALEu2peUcz9Ue82HvgvgukT8lQJTt2w5MFAddU0vUrV3lH4kws4slhUpaTp6tUzM21nH6CVZ1D+aIsin9ohhKcy0nLmNrEfLWOFrFcVFHX02zbNQfDbyQpbjKr97tU6D3g/dExiqTUstK0PZj9YoXc+GkSZZ1t50Z1jLYgm1iPO41jd+TpZ1HfbLZtqAnLf37Rw3BnTUh/kKmpohl5v1ltHMmywPO2sS/VJecbU5KG5TqUKGo807+8XgGp1TTae1SlQA/jAe8PvESWHw8lIZdSl1PsKKsqgPMbx6Q881Zsdl7JKwkNKOqgfZP9sYS00uWbTdF0K3BAI8wImLmsybzDS5hIIupIssfHePzskFJU40Q4FeyL2I93KILIPqwCFFoKClX2ICgb7nkfMWPnBKTlSWUrdWouEd4p1U2f0uo8YDPqeQ4cywAAbIOl42y01lIW2hYJ1ChoCPDrFWywRxbrrbGFBLpcSe0eusotskHp4mKTw2Ffkd1ae6tc06voRoB90PnF6e9ZWxLNFCyyg5wNCpR19/KFDBTAmKEwpaChSluqIIvY5z+Ed/TQ6caObllcmbnlLXLoCkjOBeNLbgSuxt3tPKCbiQtTiQQpQRodgdYGPyy20k2uOf3QyaoXseqUqVmQ8m4ynbwjdOtpUpLyLgL6a7x+DBm5UKSSVt6b7mNkogzEuW1IPbNjTxhTDi9welpaklSTqBrpH5kk2CtRbfaJTbLgU4lQAym1xuI/FnNcJTa3MQA00Bq6sw8tYz7JZsojLblHqEd4psFWN7+MfnLqVkSSLcxEIaHV27oBJHMH5RgCQoFXtW2jd2YCiTfwtGCkZwdL21vEKMLjmRfpHmwBBGm/wjwpCARlub69Y/AApF+XSLJR72pIF+8DpE6QnGw2qmTWsm6btL5tqgcLWI3EePNh1rLoDuIl0A0htomOJzB80JWolbskTYPDWw8RDFPOZ1CqUGaQQq5Wymykq56j47RXcjPGdlzITaUugaNrVuPONMvMT2FJvNLruwT32lG6CL8ukOjP7inBD9Tq3RaotbFXp6UTKlFS7jQ+UDK3wewvjJntSstvpKg2pCspQDsAoaj42gaKvJVdANuweveytbHwMeMVJ+SdP02U32A0UOtoJTB6X4EqscN8X4QnG/yHXnnhLEllmfSHEix9lKxY5eoNxE0cdsU4VIRVqBUZRrswHXpFfrDJVzIA1A56iHmXrClzXbu5l3SEKSr2bA3vbkeV4JzMpTq83lF2nOSSm4VbbUeMEnZLa5B2BPSGpWLF9gioMOurulUs8OzdB6WNjFsyWKJGdCMy1MK7OxvsbabxQmLeC0hWQVPU9l1aEgh5vRYPUKGoN/GFViVxfgohNMrTk3Lo09SrDRdsPBQIWPeTAvZ8l7M7Klaq292jRdQoOIyFIIve3dPjG2lJImCysAlSSQT9aOWqFxxekEpaxNSHpNYFkzskS+0LdQBnT70nzix8I8X6bVSHqVV5edQFXLZcBynmCNx7xF/Ma5ROi+C4Xpcy1SQgkgLBKbnQ+EaZ6XU1Ky7iNFtk7HW1z8xASa4gStUlWlONKZmWTmSsWKT11hjk6hK1uUSgOoSUOWzrNtFaj8IYpKXDFuLXJnJuCo0xKybrQbaf30iOHlyM+v6ua1xyveMKbemVRbK7hiYJAtsFDW0Ea7Tj2a1ItmTcggb6bQxS2sGq2NGIqP2y25hlPfWAfPSBiUlTdxqbg2B084bMMvN1mkJQokuNaDra0BazT/AFFXVJIFxDJJdyAT8Mxk7uy7qdtNv7YFkqaX2aySb2FxrtBSmOFEypB+sLA++PKxKhpSV5Sk57axPARonHBmaWLAFux6mPUuBUsEgk67+6Nr0uHZFJI1T9l4j9hlaTYXuq3ygqBNEjNHtFgEXQCU2O4je/OZmnrnTdOvjA2TS4zOr0ugA+UYzTpDCwoWJN/nFp0SgimZCXWQT7WWwPIwTYqORWW+bTKYWVzAW4jUjYeQEbxNELzA3B3Ag1OgXGw1K1ZTRBvqk2IvygtL4xMo3uShoBZ6lPOEZqZKn2kk2I9o7XEeNvdp2zZ27MpBOoMOhla3FyxJlpV7GM5I0WZckTmWkJWHEqsQk/WHyhppmIfy7Qe1Scrr7BuByXaxHxio6BUFT9Hekl95aWVNjxFrp+y0NWC5z1dnsgq6UEKt4GOziy9STOZkx9NoHVGtKqFI7SxCglSDf61ha8fOf0uGVzWM6hPuAZXbJbPVCVlA+OVUfQnEqk09t+X/ADJh1AA009oD4GOD/S/lOzqCUa/QS8u0VW3UQXFfNcaNTHq00/wFgdZYnSXoycY/8KPAqkCfdXNVvDzgpE5e5WtKUXYdJ37yBlv1bPWLDXOJlkOtLsC4kvpBHeUQLW/sjkT9zwn3UYnxtTSoiVmqfLqWCdM6XiEm3WylR23+TKe88nO3l1zrVc3Fhew6ax5hcHYA9Op8wh+VRNqSVoLi2yne2XuhXj90NGHZRuYculN0qUkqSk+yeR8oGU7+G1T1pRSlLQKUW0Clcz5CGmgttuZ3WQWwhWljchV9R5eECyALjFKMU3DrdVlwGnVLEu8tO6gUnKT1Iy2v0MctTy1OzB176gVEx0dx+rSZXD8rTlf50/M9sEgXCkIQbn3FSR745tCirtFFI0XlAEZpI0Y+CROlLDUujRKt1W8tIFOklQuSCYn1JRStoHVRANt4HPKss8yNdecc7KjoYhfmJpS8XSzKVJHq0up0pUbDMs5Rr5JMObNReZQhxTSl5QO8kAi/LUGF3BtJXW6jVKgHGilyZ9XQy5sUNd3fxVmMNTlEUzYmTLaL3u2o2+UcDO4uVHWxNpWTJSvy7iFEzCkG+U503Tbra0FpV1ucSlbLjSwVWs2opPhpC07JpDWpGb815F/gRrEZthd1IBcSkjT1d4n5HXrGN4090aVkZaSaslZUh5s3Ave1rD7/ACjYVsOEFCk50jZOir+IjMUJllaUKztJOyAu+v8AflGk0zsX1MOqbS6LqbWdnE9QevK0bWzmk+RW48pIeUH7DVoaK5/DlBBHYqF0KUFanvG6get+ogbKvhtzs13Lh2WDY/2xtt2qy6VnRNypv2h+snnEUiqTJbyHXJS0w0XkjZTYBUDyuBuYhKpzneEq4HEq3BspV9NLfcYIomXGmQV5VoI0W2bgDyGoMbmww/8ASAJDmyXEqyq1HzvBpiypOIGB6pWJ56ZkA0txy3aMPq7M3A2So6a9NCLwAodLm6JTmJGcaVKvpBS6yVZlIVnJN7eBB8od+JuP28FS6kTzIm+0TdCEo71thc7A+MUaOPVFqK3DUmn2lE2OZrtUq62VuOXKO1pZyap8GDNBLdFipk1tzBUQoJV3EqWnKCdbRFellsTOV1qyXNUIBBudhqN94VjxowXUpNSXJ6XkH0WNil5DbwHK4HdVppyvDNh/E9PxHIoNMrLMw/e6+zdRMZEnY2PeHiI3SpoyLYkUlhCpsy7ikyzpUEpSoWSogExFnZZyk1ILyZUnVST0++Jk7JOzksn+Dl59lII7B2wuT9ZO42vpeNjFYTXZVVOnmVevNCyH0HRwcgRuDz8djGZhguYbWErdA7ilk38xeMC8FJASbE2ubbRJSkerOS7mcOMqzKI+ujYH3c4HJeBc1GZPK3TrAtDUyQ20QVA2A5nYmPOyQhW91fmnlHrRDilZTmINwPC8eqVndsNLC5ud4CqDs0nvG9joLRrVa1ki46jlGxX0ilJzAJt8I8dAaBAN9OUXZZHLeyRe5OvjH5bNrnQHfTWNjCe/qbLtuDHhIyDu7jaLKs0qbIy31O+gjxKSEkpAPURlmSu2lrbmPxIANvlpERTIcwnvZmxY73G8E5CaZrMsqWesJjdCr+1ERaLJ5kxAcQpuyk3SobG9iIl0V0m2alXqW+U37o1yq1jamdS4kalKuQVp8DBGWqcvU5ZMtOt3eGiXRuT1MD6hS1yDhyqzpI0VawPui7JRimdWFBJUpJP1onS9WellFSV3USL5dCPOBIW2tIS4Mumlhzj8UKQgZVlQ87+6JYPSPVIxm7LFPa2QQNQTaDH+LsQBRcsHVg3UTcecVYJlSQQTYHrrE2TqrksoZFFN/nB9f3AcBzqHD9stBQUlaFJNgBqIr3E/CGWcX6yEOMzIPdmmFFDqf2k2MOMhjd1otJUcwHtE8jDNTcRy85lDrKSTvY/3+EM6k+AN0UrK1nH2CyOxnGsQSg1Dc6ezd8bOAWPvHvh6wZ6R1Il5/wBRxFLv0JMwhTCzOJs2QdiHBdJINjvyh1mKNTp9RykIJubnYHy/vvC1XuGUvOIUXJdJS4DZQF0kcrjaIo73QXUWbTcXMzLYbbmkzLK+824VXUhQ535xY1NxG1VZFDhTdah2bqPzV2++OLKjwjmKI521En5ulPJJy+qulCRp+Ybp+UTKNxZx1gNRZqUoziCVGpca/g75HLQ3Qo+8RceqJGkzr7C1Wbo+IGmysoYmSUlCt0KhsrtPE9IzSEp+lbFwPsjl2g+klhbFo9Tn310eop9lueR2LgPVJOivcTF1UTHZqFObmRMds9LJCHiggh1sjRX9+cPhPboYqcP3IlyRVlLoPea7qgTY/wDWCtSCZyQzjQkgm3WBTT7bFVGV1L0lUElKFX2XbT8I3SVRS4H5J0KS7bOhJG5B1HmIOL2oFo2SX0tLfVYkpIJG/ONMwO42RoCeWxjOhPoeXOsIOYONFSeWo1/GP0+osMNGySgFJ+MOXamB5B7Ld5ty1tjryjRNouw5oTsAPfE9tq0y6bd21gesR5hALK+twPwgSwYtlK3AfKPCxpoeehtvEjKDMX3sL26R7YJyeMRkA7edEwVWOUJNyBzj9KuXm1KN9W72jcgAvOm59k6xhLI/hCLC121D5RcWWwhh+ZMnOJX9ULG/h/cw30h9UrPONE5UZSAR4QkytgVEkHvaQzrm0lbDiVHvtpUf1to3YZNRaMuSPU0YY1X6xVmcuocKVK8w3Y/dHFPpgnPLma0+nmMifG1xf4COyp+azMtuqF1BLluuhAEcZemHYvUSRC03QXnnAOQQhI+alER6HJ/hzb+yOfjVZ4oM/ueVHcE/jWsK/iUNy0qADurMpw/YmO1ZuVSooW4rs2i0q6+WY6addNY5O/c5G2l4Vxo4tViqoS6Fc9OyVb747Jm2C9IJCUiw7qjtYX3AjyS4Ow3uaZCmJmKHKthLanEC6FINibbHx8YMUeVS1L9oFBKQTcX0ChqTeMKdTEScq0UI1yCw98CeIU1UKbg1X5FMszMzE0mVeEykqCmFghzKAfbAvlPK9+UUykUxxXx4zjWqTE/KtKZpcmx2cq4tJSt46lTljqASRYEA92K0km0gsBdu0KSpQ566wS4m1VtM8zTmSOwSQSAdcum8Q5FgtyZmHAAVrCrdP7iESZsgqQPnnS/NOKIsRZMCqhM+pSU3Mr1Eu0p0352F7fZBFCe2W84vu5l/V3gXV5dM+hmT1SZyYaZsDqAVAn5AxzcvFm3HykNXD/CiqZhmnMu3be7IKcC03SVq7xNxtqecMaqdNS4UlDi0d2/5wMFadJJ7ABp4JN9QrQjpE4SiitsqQHkAXISq+nkY8xP1SbZ247IAOqnA2EGWlptIsCCmxt0MRU05h5R7Smrk3Ora9unUfZDetuWbbUn6Vs6HKu6h7r3iP6oopHZFFr91IvceFoDdBoK1bDNdnXg3Lz8tJM3JcU0yVuKNtgpR0+EYU/BsxIrHrNQmJxIVmyOLOUK62EHJHFrE1OKlZpKWXEoCg6VjKvXmN0+exg+7LhYUbEaDbn+PnHQqvBybaEyoySpdPauIMylewJBLYA3Tbe/nfpELIoNJfbvMyp7wW2qygPM8vAw2vMrUolQ0tyOgHlEJymBsoUyrsXbkpB2PW8Lqg1IDNzSpsFxKySDbO2LKT4KTGt5LgHaJLiLCwel7W/aTytHs9LKQ/wBotlDbqj/GoVkB6na/u2jAuqZcTm+lUR3SjQ/bY/bBJbgt2Aazhlmt9o9ML9aDyQl1JAUFcr5Ttp0ihuMXCWUlFH8gUszriRdY7ratuQHt28/dHSTxZdWhxLmVYVb6IZT43HMQMdaXNZC7lm0m5IKBcHbbr+EaoZHDgXKCkcB1LBdal3Fh2mzDKvzS2YW5mmzVOme+h2WfB9oXQoe/ePo9LU2SbULS7LzRULoWnW/P++kR6pwywviuVdQ9T2W16jI82FI9xPeHxjZHWU/UhD0/2ZwfQuL2LsOTIcRU1zregLU4M4I6ZvaHxi0cO+ktSp+oMHEFMmJHMcrr0uvtW+VlDZSSPC4h5xz6JVMcC3aW85TlAnVv6ZknxT7SfiYobFfA3FGGO0W5TjOy6L3fkj2qbdbbj4Rqjmw5PJnljlE64aVTcQU1qsUuqtTNOc7yHx302O4JBuCL63BjRUsNtMNBbUy0UOnM0Um4cH6Nt/dHE+HcVV7BUyt6i1KYkCo99tJu25+sg6H3i8WlhP0kn5d4N16QGRQsp+UBUi50zKaPP9U+6DcGuNxdl1lCpRopAuT3bqFvMxipCW2k2VZfLXWI9IxfRcSy/rdHqDUyMt1IzZgB0N9U++JDbTTi+8rs1kcz3T5GEsYtjSmaKsxGoO5I3jFzXWxt56RIdZQEhBWmxtziO5Lq7a6VWQRygaCUjFo3WddOkflgFOuttBGpxYKlAe0DqR9kYAmy+9sOukUwj25ASQnccxH62lyAPDnGJcVbKLWGw2j8EEJ+W+sXZD1RyptobfnCI8wjMkJTqvkkxklzTU5kjUAjaPH05lAG4PLWLJZDWlTRGYZSDfUQUk6kmcYUy9lJy27x1PlENaAVFKrnnrEJ1K2l5ki1tRfrFFhCalMg0GZI1BMRChKBY90bE3iRLzaZxgtqUUOAWBJjxSCFHO43e+oUR9sWCzSUK2Gt+e4Ma3CtoEpy3PI/hG4toSsZVba9zWPyWc1wLRCiH6xlOykK5W2iRL1V2XICSLbkg6k/dGT0qSklKSFpvfTSB621JN8oN9dtYgVJjPIYvmJWwUc6QNs1obKdxAzNobXZZvqBccvsiqUqAVZKiD+aY/FxxBuB87GDU2gHBMvlU1IVKRBWgZtTbaBk3hFmeKVMlBJGqVkEHT7YqWSxBOSKxkWQdtddIY6VxJmZdaQ4hNjyvYDr5wxTi+RTg1wfsR8LJOpMOomZFKk32WgEe8QpU7B+IuH06ibwxWZmTabBSZJxZdllpO6S2rYHwItyi3pDiBKVBoIfDac1tFHQW8bwReZptUKShaW1qI9nUA2/shq/gB2uSn5PjLxAwq641UaO3VqbnzpMm72bret7gK0PxEWVR/Stw1X1sGoTDtAqKVghuptlkhzYkK9kg87HQ+6Ns1g4OtKDRQ4Com2+nS0JVb4csTSVpmZVJSo6pA9o+WxikXafJ0FTOIFLnJ6Sqck8yqXdVZ1CFggXFlAeGxHgTB+vPt2W1KPiyAGg2o2JI1+75xxJNcJV0p15VCqk5RHCLH1RwoQddLo9nfoBB5nidxBoEpLNVCVYxCiXl0y5nJd3sph3JcIUsG6SoCwvcXtDVJ102A4q7R1tK1B1wKUlsKbNlbagWEeOzSVNOhSSLKCgrr4Ry7h/0qqfIzbcrVROUR9SS24ifaKUG/6YuOtjFsUPi/KVaktdg8xPMpSVJcZUF9ok7XI2It77GGdf3B6Swu0SZhZSQbJ6c42PEIUjwFyYU5TFkhOPLQ252ZeF2xfc+N+cGWag3NqSpuZTZXdN9CDBJ2iqo9bFlPdSi4vGEqO9Lqvsux+Yj1suobdcJGW1vIxrlLokVrKVdxYUk23i0RkuW7zTveuUr1t5QTZXmk2lKt3FLb+8CBDU0ltTjQsAuykgiJMtnmJCYab1KLLA5mx1+V404u5oXLg3vpK35dnmG7281f2RwP6VmKEz+N51ptQIQ32CPIrKlH+rHbOI6/8AkbC09U3DkelpZTDevtOKPc/rfKPmjxLrP5exhUZy5UhbmVsnTuJ0v7zc+Vo7+qn06Ff/AGo5+GP67/g6V/c4cWNymO8TYYdcAVU5JE5LoUbBbjCjnSPEtuKP7MfQZhhZbKFeyk2Seo6R8c+FWIqzwvxzh3GcgyrtKdMpmkoOgdbGi0HwWgqT74+yWGqxTMbYapmIKNM+s0ypyyJuVeH1kKFx5KBukjkQRyjzS4o6MtnYYdBQ01YXsBcX11hM4zK9QwTN1Nk/RyWV5Y8D3SfdmEMjk9ln22yLECx6EHaErjtUBI8IsU3SSqYZTKouoDVa0jn06RK2Bi90cjMOvYjxAp8pJUtz2TrYCHCuJRTKeEmwcDOcoPMnQCNWCKImRlhOOthRPc1tqOZgLiOomo1NxsLKkINrX3tv84zNUjoLkwlEgSyjbVRJFtbGA80tTmLKTKtryqYQ5OLN7ajuJ+ZV8IPNo7BlA07qQbbCE/DhVVsXV6dBJQHkyTJ5ZWx3tf11KjnajaDZswLqkW1J1WbZbF3e2Fte0QDb3iClLxT2cxd5JBGmZlWnwhTZVMSo0OxsLdPGJMpUCkWeaCvMamPPuKZ2VwWGxXZab7qZhpari6He4qJbjMu9craKDpZaFe+K6E6y8QCbja51v5AxLlZt1kAszK2SOSV6fAwlxossWfoDReRMthOdenaISCbaaxPk6q9JMhCgVIQk/SIGZP4jzHwiO6qalHCpCgtlQtmRYqPmPvEZS8kiaazuFQ7QEXzE3vvY9Y6uzOQ3QdYn5efR2QUEzGXUCyifC3ONU5LhF1pBNri41BJ+yFlmntUvKlnMon6iydSOY5/fBKRrbksQh1svC5IV9cDrf6wHTeAcC7MpiXKkKBZzoJuU3sr3eUBHaIltSikrRuACSSPGw0hqQmXqjedktkFWitUm/UdD4RHnJFZJStIW2jcpvmHievnC6oJMTpiVUDmdaLikgBKkJsQOXviE7NKl8xcUHGx3Q5axGv8AfWGxyWzJJKgpsb35D7YDzVJaeBcDJUoXUoqBvbwEQJGhAamiSmwWLAkaEG0fj20p/GguoTqFDRY933iJEvLtMN/RJJsnva97e97dYmyswEBLmYKb2K9iCBEbCI0vNvLQSl26droBzDzTz5aiPEUWXqTYWpgFZ0S40q1z4mN6pRl5xTrBAcA7q0WIGnPpGtU6ZcJTNAMOlJDcwnvDXe/SFuuSFU8S/RwouNlOzJZMpUVX/hckgIWT1cQdHPMa+McyY19HXFGGHHVMS4rUo2Ll2SBK0j9Js94e68d/tuF0JD7aXW1WHaNAk35k9I0TdOYm7nskvnSxt3geXeG/KNWPVTx/yZ54YyPlw0JqkTnbSzr0nMtG3aNKLa0kctNfdD1QuN9cpwS3U201Rm4Kl6IcI8eSvgI7Cx5wRw9jgkz1PQZxQOWZa+jfv4rA73koGOcMcei1WqK84qjPpqbd9JR4BqZHgB7K/MH3R0oajHl7jLLFKHA5YJ4hUjGDRTITiUzIF1yU1o4PK/LyJhk/KErLuG6Vod5oUnL8OvujkGo0ifoM+pt9l+Qnpc3yrBbcbPXqIszAHH+ao625PFMt+WZDQes5bvIHUjZXmLHzh7hfaKv7lymcQpV0iwJva9zG8KSULGZJITcpIsfKDmGJPC2P6Z6/h2caeWoXLDirkeAO4PgYh1ekzFHf7J6XUzvlDibXAPXYwmgrBoSknQ+JzCPFuIAABBOuoOsa3FgjvDJzuBeMEnKAbb635wNFpmWcG4JEas9lhJJUkbC2sek3IJOijrHjjX1Um4MWWuTaqy0Xv5X1IiKpeVVnAL6W8YzSS2Aqysp5jePXZZLyAsLvpcgCKoJEKZlltK7VBSsC5FjG6UUme+julL3+rVoT1tfSNXauyhISA6F7A7W8YxWluZJLYU2TY5V8vIxXBZJcl1s3GQpy6lOWxEZIcU0SdQRzMRW5t1pARMNlaQLhY0Kfx8jG9DiVjRRXcaK6xZCUZ5tWr1ws/Wv9sZLlw6LIWlxPz90Q1hBSbmyxrbe8fkhxq60d5N72Sb/KLKMXaepSSpAza6iIDkmsC4BJG4vqILs1JtFs4AO5SrnE8GXnk3TktbXKdYhV0J7jC21DKqxHNQ2jVZSNVJJ8UKhzcoACFqyBdtBc/KBUxRezyqSsAG90neJRSkmAAo3ulZJ8TrE+Tr8/TyA26SkD84xvXS7LIKbX3B2jQ9IKbFyDa9u8N4u2gtmMElxLqDCkk95QFtyNdoYqfxS7eyZhlKxmub7i+8VopgpI0sfujEpcChpYHwglNoU4IuRnElJqSMjtkAk91diRHs7SaNUU5mXA06QAQNyYqBsPgXSsFJN7axPlZ9+WWkkmw5DSGqYpxoaq9wyYnm1NutS882Rc5kiwispngZ+R54ztIXP0pzMFAyjykAEai1rg77GH6QqUw8R9O8PBtVtPfDVITK2k3bmHlnQlOf7RD0wXsU02xjzD688rWfygkG/ZVFkEj9pFj77Qy0rjfV6N/wC+KEtR2ceprxdI/S7NQCvheLY9Sp0+gJmEhyYIN12sr3Qu1DATUwlZYfQ4QL5HE/MGCSKsnYP450jEEutuUmGph0bo7TK6ANsyFC9xFj07GtMm2UIQlabNdqQq1lEa6eO8c84g4Ntzq0uOySFOpHcfZV309CFaEH3wIboGK8NqAlMQToZbN0NvoQ9YcxdQvbXa8EnRWzOlKnXGGlMTCFEAnKO9fVJOnwgnQa42aslsOJBULixsFpPLz1MclzvEfE1HYDVTpwn2m3c6XpG6XRpYlTZvyt7JO0ey3pI0qnTUsR6w47mHetkLZB1uD9kPxuppgySpovriow/Wpqm0sHJTnXnFTWVVjdAJOngm/wAT0ji3BWEGuIWMKnW51BTRG5lSw3sXiVWQ0n3WvH0BoE5QsV4VqOJH2wGafJP1CbnEd5GjKk5VdL3BA53jlLBOHXGZGkybTCkS0qhAzJ2K7XUT1JPOPR/FMuP/AE+HDDxu/wAnJ0UZPLknIfnOHtGdojs1WZVotrb7NtDKbFKhoG0Hw018Ysn0UKhWODfq2C61O9rhyuPuLoqXtHJKbsVlr9R5IUQOS07d+MsI4cbW6y/U0GZebSEy6CO43zBF+t76ww4zwrL1vDk9LpCmpwo7diazELZfQQtpxJ5FKwD7o81GSbOq0XYqpJFUQ6bKSskE/mi34xVvG/GTddmFYPDQLjSpeZcfUAU5FJJIBv7W3LYwcwtiuUxLgqk4qmn0SbM5JompvObIbVYhxIHKy0qHuihJ7Fv5XrlQrkyohU24paUq3CAMqE+5IAhsqSKgtyViapIp0gGmF+2iwBhPp7BmHhc3uQnfWPJ6oOVWcU8vbknkIJUxvs3O0GoSny1MZJbmxbIyqs2mSlpqac1Qy2pxXkBf7ow4aUQy+GJQTDRVMuoMw6Ra5Ws5zp74H4nR65TUyTRuqdmGpY/qqWM3yBi1KbJSymQ2UqYsBlA1FvIxy9WrVI3ad02wcJJlYsF9mom2twfhGz8iTPYI7MpcQEk2VrrBddKKj3EhwE2ABGp8j+MbDLqlkbLbF7XIIB8txHJeM6KmKc0wG1hLkquXUAApKVaE7FWumvSIpYyJIStaE/7TT+yHVbi1shLiUPIVoQsf3ERlMSqkjuuMX/NF0/DaEyiNUkz/2Q==";
const PROP_PHOTO_2 = "data:image/jpeg;base64,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";
const PROP_PHOTO_3 = "data:image/jpeg;base64,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";
const LOGO_AIRBNB = "data:image/png;base64,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";
const LOGO_BOOKING = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAFAElEQVR42u2bTWwUZRiAn/ebb3a2lC0gQSGKTXpAUAoBrAGF4MEoERMv4EFREr3pxYMcNDF69GTiQROjMZpoSAhoJcEgiaBBIiGARbShBMNfgCiQ0tb+7O7M93qYLgVDa7s/dJbOl2xm9rLfvM/7870/s0Lbu8oUXoYpvlIAKYAUQAogBZACmMLL1noDAYwxSBVRq1Mip8kHYIzgVIn6BqEQVY9oYJHGABRUNZkAxAguHyKRsH71IpYtmIsRuS7DhLU+fM0XIg4cP8/+X0/DNB/xTEUQbM00P1SkZfYMvnpvIyvbmqu+x/Zdx3nlnW/ocxFiDOUysLXweZzS6FnaP9xE68K5hJEbUWFVNoAN61tRhefe2IqZlUWj8jao+ingeQbXO8SGJxfTunAuhWKE9QzWVunjGTxjCCPHxmdaWb7kflx/AWMkGQCQ2ALWrmjGqZb9YGNuISNxYc3i+TAUlr1P1V1AAVSYFWQwIugotu+c4sbhuJ4RRGRU1hmvMh3W7BQYyyV12DLMOM8D1RGtj3Y6JO8YHFMY4fTZq+z8qYueMEJFbpZk2I3mNzWw4anFNDVlx4SQ6Ezwv2YvRvit8xKPv/QJ3T394Mmt1ShAPuSjrS3s/fxlcrksqjqqO9QNAGuEL9uP0d39D9l7ZxIWR88QjW840nGGnw+d5eknHiCKFM+rYwAlv4hCh1iPMIziHGG0AChgfEs+X7zzqsHxpq+uBmaflsMpgBRACmDSAYw3sBmRipseyTkGh+XwrEHDCGu9MXNZYw2FYkgQ+HcGAGMEBTY9u5RPvz5E96We/80EVyxrYfUjzahSk8ry9gNQWPLQPA7veI2dP3bRO0YtcF9Tlo3rWm+oBeocQKmWV1Vammfz+uZHK64G6w5AKQBWox9QtwBK7mCoTDBViJybunmACBw8cRECDy1zUDJpFqBa/nRHFXxr2PXDCQ52nMHkgrJ/67Z3hEp9AWMEW0Ftv2ffSV58cwc02OQNRhAIR8lwwshhPcOFSz3s2PM7+BMYagj0XitwuOMcO385CRmDWC9hADR+0KK6G5M/VDXuCHmGfQf+ZPNb2zl/4SpYjwmNdVTB9yCXRRI9G7zhPnKKZwTPEz747ABb3t9N0Rf8e5omHrwE1IFzrirDJlvrQBeGjmxgGRgs8urb7Xzx7WHkrmkYEYrFiMletZkNqlJwcSsrG1i6Tl3m+S3bONp5DjtnOlHoxpUE1WU5rChkPLZ99wd/Xexla3sHq174mKOnLmJnTycMHUl6NVWq8qqsMeDcSNLuGRgskvMz9A0MQtZiMhYXOZK2TFVsfnAwDvd+JgYxMIRkffoIMbkAsV4iha9ODCiE8PByWLIIMgEMDMLRY2jnCSSTwblkv4tdPgARGMrD2sdgzUoYGorPp1wjPLsOggx65Bg0BJBgCKZs4cMQ7p4DbUuhvz/+7hQKhRjGqjbI5SCMEm0Bpmy/D0OYNwc8GwteqtmNgchBQxZmzYQoql03Y3KDoMD1mZ3eOmUNw0QLXz4Ap5Dx4fwF6O2DIBNrWjW+ZrPw9xW4fAWsBdU70AKMiSP+7r2xJTQ2QhDA9Ea41gPf7wMXJd4CKkuERCBfiH39wQUwIwdXrkFnFwz0g+8nWvuV5wGqsfn39sL+g6WWb+wedSB8dRIh1djPfX+kGaBaF8JXrxq8SeD6+hdeOh1OAaQAUgApgBRACmDqrn8BQpYRTS/mEwcAAAAASUVORK5CYII=";
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
    10 = Click → Airbnb espansa (card aperta, campo vuoto)
    11 = Cursore → campo testo (textarea)
    12 = Click → URL incollato + tooltip "Incollato!"
    13 = Pausa — si vede il link incollato
    14 = Cursore → "Salva Link"
    15 = Click → salvato
    16 = Overlay
  */
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,2000,3600,5200,7000,8600,10200,11800,13400,15000,16200,17400,18400,19800,21000,22200,23000];
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
  const textareaRef = useRef(null);
  const saveBtnRef = useRef(null);

  const view = phase >= 8 ? 'modal' : phase >= 3 ? 'detail' : 'list';
  const activeTab = phase >= 5 ? 'impostazioni' : 'dashboard';
  const airbnbExpanded = phase >= 10 && phase < 15;
  const airbnbUrl = phase >= 12 ? "https://www.airbnb.it/calendar/ical/12345678.ics" : "";
  const showIncollato = phase === 12 || phase === 13;
  const saved = phase >= 15;

  const activeRef =
    phase<=1 ? navPropRef :
    phase<=3 ? cardRef :
    phase<=5 ? tabImpostazioniRef :
    phase<=8 ? configBtnRef :
    phase<=10 ? airbnbRowRef :
    phase<=12 ? textareaRef :
    saveBtnRef;
  const clicking = [3,5,8,10,12,15].includes(phase);

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
      {vis && activeRef && <SmartCursor targetRef={activeRef} clicking={clicking} visible={phase>=0&&phase<16} />}
      <CompletionOverlay visible={phase>=16} message="Calendari Collegati!" />
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
              <div style={{maxHeight:ota.expanded?150:0,opacity:ota.expanded?1:0,overflow:"hidden",transition:"max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease"}}>
                <div style={{padding:"6px 10px 10px",background:"#f8fafc",borderTop:"1px solid #f1f5f9"}}>
                  <p style={{fontSize:8,color:"#64748b",margin:"0 0 4px"}}>Incolla il link iCal di {ota.name}:</p>
                  <div style={{position:"relative"}}>
                    <div ref={ota.id==="airbnb"?textareaRef:undefined} style={{width:"100%",padding:"7px 8px",border:`1px solid ${ota.expanded&&phase>=11&&phase<=12?"#3b82f6":"#e2e8f0"}`,borderRadius:7,fontSize:7,fontFamily:"monospace",color:ota.url?"#1e293b":"#94a3b8",background:"white",minHeight:24,wordBreak:"break-all",lineHeight:1.4,transition:"border-color 0.2s"}}>
                      {ota.url || "https://www.airbnb.com/calendar/ical/..."}
                      {!ota.url && ota.expanded && <span style={{animation:"blink 1s infinite",color:"#3b82f6"}}>|</span>}
                    </div>
                    {ota.id==="airbnb" && showIncollato && (
                      <div style={{position:"absolute",top:-22,left:"50%",transform:"translateX(-50%)",background:"#059669",color:"white",fontSize:8,fontWeight:700,padding:"3px 10px",borderRadius:6,whiteSpace:"nowrap",animation:"fadeIn 0.2s",boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>
                        ✓ Incollato!
                      </div>
                    )}
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
    {name:"Appartamento Colosseo",addr:"Via del Corso 100",time:"10:00",guests:done?3:2,status:"pending",color:"#f59e0b",label:"IN ATTESA",img:PROP_IMG},
    {name:"Suite Trastevere",addr:"Via Lungaretta 22",time:"11:30",guests:4,status:"assigned",color:"#0ea5e9",label:"IN CORSO",img:PROP_PHOTO_2},
    {name:"Parioli Apartment",addr:"Viale Liegi 14",time:"14:00",guests:2,status:"done",color:"#10b981",label:"✓ FATTO",img:PROP_PHOTO_3},
  ];

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      <SmartCursor targetRef={activeRef} clicking={clicking} visible={vis&&step>=1&&!showComplete} />

      <div className="bg-white overflow-hidden w-full" style={{position:"relative"}}>
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

        {/* Lista card — stesse dimensioni CleaningCardAdmin */}
        <div style={{padding:"6px 6px 8px",display:"flex",flexDirection:"column",gap:8}}>
          {cards.map((c,i)=>{
            const isFirst = i===0;
            const statusGrad = c.status==="pending"?"linear-gradient(135deg,#f43f5e,#e11d48)":c.status==="assigned"?"linear-gradient(135deg,#3b82f6,#2563eb)":"linear-gradient(135deg,#10b981,#059669)";
            const statusShadow = c.status==="pending"?"rgba(244,63,94,0.4)":c.status==="assigned"?"rgba(59,130,246,0.4)":"rgba(16,185,129,0.4)";
            return (
              <div key={i} style={{background:"white",borderRadius:24,overflow:"hidden",display:"flex",height:110,boxShadow:"0 4px 20px rgba(0,0,0,0.08), 0 8px 40px rgba(0,0,0,0.04)"}}>
                {/* Foto grande a sinistra */}
                <div style={{width:110,height:110,flexShrink:0,position:"relative",overflow:"hidden",borderRadius:"24px 0 0 24px"}}>
                  <img src={c.img} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} alt="" />
                  <div style={{position:"absolute",inset:0,background:"linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 50%)"}}/>
                  <div style={{position:"absolute",top:8,left:8}}>
                    <span style={{padding:"3px 8px",fontSize:8,fontWeight:700,color:"white",borderRadius:7,display:"flex",alignItems:"center",gap:3,background:statusGrad,boxShadow:`0 2px 6px ${statusShadow}`}}>
                      {c.status==="done"?<svg style={{width:8,height:8}} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>:c.status==="pending"?<span style={{width:5,height:5,background:"white",borderRadius:"50%"}}/>:<svg style={{width:8,height:8}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>}
                      {c.label}
                    </span>
                  </div>
                </div>
                {/* Contenuto a destra */}
                <div style={{flex:1,padding:"12px 12px",display:"flex",flexDirection:"column",justifyContent:"space-between",minWidth:0}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      <svg style={{width:12,height:12,flexShrink:0}} fill="none" stroke="#a78bfa" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                      <span style={{fontSize:12,fontWeight:600,color:"#111827",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</span>
                    </div>
                    <p style={{fontSize:9,color:"#9ca3af",margin:"2px 0 0"}}>{c.addr}</p>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{height:26,padding:"0 8px",borderRadius:10,display:"flex",alignItems:"center",gap:4,background:"linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",boxShadow:"0 2px 6px rgba(0,0,0,0.06)"}}>
                      <svg style={{width:10,height:10}} fill="none" stroke="#6b7280" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      <span style={{fontSize:10,fontWeight:600,color:"#374151"}}>{c.time}</span>
                    </div>
                    <div ref={isFirst?guestsPillRef:null} style={{
                      height:26,padding:"0 8px",borderRadius:10,display:"flex",alignItems:"center",gap:4,
                      background:isFirst&&step>=1&&!done?"#ede9fe":"#f5f3ff",
                      border:isFirst&&step>=1&&!done?"2px solid #8b5cf6":"1px solid #ddd6fe",
                      transition:"all 0.3s",cursor:"pointer"
                    }}>
                      <svg style={{width:10,height:10}} fill="none" stroke="#7c3aed" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                      <span style={{fontSize:10,fontWeight:700,color:"#7c3aed"}}>{c.guests}</span>
                    </div>
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
                  {n:"Via del Corso 100 (Loft Panoramico)",img:PROP_IMG},
                  {n:"Via dei Coronari 45 (Suite Navona)",img:PROP_PHOTO_2},
                  {n:"Via del Pellegrino 12 (Campo Fiori)",img:PROP_PHOTO_3},
                ].map((item,i)=>(
                  <div key={i} ref={i===0?annuncioRef:null} style={{
                    display:"flex",alignItems:"center",border:"1px solid #e5e5e5",borderRadius:14,padding:8,marginBottom:8,gap:10,
                    background:phase>=1&&i===0?"#f9f9f9":"white"
                  }}>
                    <div style={{width:52,height:52,borderRadius:8,background:`url(${item.img}) center/cover`,flexShrink:0,overflow:"hidden"}}/>
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
  /*
    0 = Modal debiti scaduti
    1 = Pausa
    2 = Evidenzia debito febbraio
    3 = Appare debito marzo
    4 = Totale aggiornato
    5 = Cursore su "Vai ai Pagamenti"
    6 = Click → Pagina Pagamenti reale
    7 = Pausa pagina pagamenti
    8 = Cursore su proprietà (espandi)
    9 = Proprietà espansa con servizi
    10 = Overlay completamento
  */
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1500,3000,4500,5500,6500,7500,9000,10500,12000];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },15000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const btnRef = useRef<HTMLButtonElement>(null);
  const propRef = useRef<HTMLDivElement>(null);
  const showPage = phase >= 6;

  return (
    <div ref={ref} style={{position:"relative"}}>
      <CompletionOverlay visible={phase>=10} message="Pagamenti Consultati!" />

      {!showPage ? (
        /* ═══ VISTA 1: Modal Debiti Scaduti ═══ */
        <AppScreen>
          <div className="p-4" style={{position:"relative"}}>
            <SmartCursor targetRef={btnRef} clicking={phase===6} visible={vis&&phase>=5&&phase<6} />
            {/* Header rosso */}
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
            {/* Bottone */}
            <button ref={btnRef} className={`w-full py-2.5 rounded-xl text-center font-semibold text-sm transition-all ${phase>=5?"bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg scale-105":"bg-gradient-to-r from-red-500 to-red-600 text-white"}`}>
              Vai ai Pagamenti
            </button>
            <button className="w-full py-2 text-slate-500 text-xs font-medium mt-1.5 text-center">Ricordamelo dopo</button>
          </div>
        </AppScreen>
      ) : (
        /* ═══ VISTA 2: Pagina Pagamenti Reale ═══ */
        <div style={{background:"#f1f5f9",height:"100%",display:"flex",flexDirection:"column",fontSize:10,position:"relative"}}>
          <SmartCursor targetRef={propRef} clicking={phase===9} visible={vis&&phase>=8&&phase<10} />

          {/* Header scuro con stats — replica della pagina reale */}
          <div style={{background:"#0b0b18",color:"white",padding:"10px 12px",flexShrink:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div>
                <p style={{fontSize:8,color:"#94a3b8",margin:0}}>I tuoi</p>
                <h2 style={{fontSize:14,fontWeight:800,margin:0}}>Pagamenti</h2>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",background:"rgba(255,255,255,0.1)",borderRadius:10}}>
                <svg style={{width:10,height:10}} fill="none" stroke="#94a3b8" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                <span style={{fontSize:9,color:"#cbd5e1",fontWeight:500}}>Riepilogo</span>
              </div>
            </div>

            {/* Month selector */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:8}}>
              <div style={{width:24,height:24,borderRadius:8,background:"rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg style={{width:10,height:10}} fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg>
              </div>
              <span style={{fontSize:13,fontWeight:700}}>Mar 2026</span>
              <div style={{width:24,height:24,borderRadius:8,background:"rgba(255,255,255,0.05)",display:"flex",alignItems:"center",justifyContent:"center",opacity:0.3}}>
                <svg style={{width:10,height:10}} fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
              </div>
            </div>

            {/* Badge mese */}
            <div style={{display:"flex",justifyContent:"center",marginBottom:8}}>
              <span style={{padding:"3px 10px",borderRadius:8,fontSize:8,fontWeight:600,color:"#7dd3fc",background:"rgba(56,189,248,0.15)",border:"1px solid rgba(56,189,248,0.3)"}}>📅 Mese corrente</span>
            </div>

            {/* Stats grid */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:8}}>
              <div style={{background:"rgba(255,255,255,0.08)",borderRadius:10,padding:"6px 4px",textAlign:"center"}}>
                <p style={{fontSize:7,color:"#94a3b8",margin:0,textTransform:"uppercase",letterSpacing:0.5}}>Totale</p>
                <p style={{fontSize:12,fontWeight:700,color:"white",margin:0}}>€ 625</p>
              </div>
              <div style={{background:"rgba(16,185,129,0.15)",border:"1px solid rgba(16,185,129,0.3)",borderRadius:10,padding:"6px 4px",textAlign:"center"}}>
                <p style={{fontSize:7,color:"#6ee7b7",margin:0,textTransform:"uppercase",letterSpacing:0.5}}>Pagato</p>
                <p style={{fontSize:12,fontWeight:700,color:"#34d399",margin:0}}>€ 0</p>
              </div>
              <div style={{background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:10,padding:"6px 4px",textAlign:"center"}}>
                <p style={{fontSize:7,color:"#fca5a5",margin:0,textTransform:"uppercase",letterSpacing:0.5}}>Da pagare</p>
                <p style={{fontSize:12,fontWeight:700,color:"#f87171",margin:0}}>€ 625</p>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{background:"rgba(255,255,255,0.08)",borderRadius:10,padding:"6px 8px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                <span style={{fontSize:8,color:"#94a3b8"}}>Progresso</span>
                <span style={{fontSize:9,fontWeight:700,color:"#f87171"}}>0%</span>
              </div>
              <div style={{height:4,background:"#334155",borderRadius:4,overflow:"hidden"}}>
                <div style={{width:"0%",height:"100%",background:"linear-gradient(90deg,#10b981,#34d399)",borderRadius:4}}/>
              </div>
            </div>
          </div>

          {/* Content — lista proprietà */}
          <div style={{flex:1,padding:"8px 8px",overflow:"hidden"}}>
            {/* Card proprietà 1 */}
            <div ref={propRef} style={{background:"white",borderRadius:16,border:"1px solid #e2e8f0",overflow:"hidden",marginBottom:6,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
              <div style={{padding:"8px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",background:phase>=9?"#f8fafc":"white",cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <img src={PROP_IMG} style={{width:36,height:36,borderRadius:10,objectFit:"cover",border:"2px solid #ddd6fe"}} alt="" />
                  <div>
                    <p style={{fontSize:10,fontWeight:600,color:"#1e293b",margin:0}}>Angelico 70</p>
                    <p style={{fontSize:8,color:"#94a3b8",margin:0}}>4 servizi</p>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>€ 380</span>
                  <div style={{width:20,height:20,borderRadius:6,background:"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",transform:phase>=9?"rotate(180deg)":"",transition:"transform 0.2s"}}>
                    <svg style={{width:8,height:8}} fill="none" stroke="#64748b" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7"/></svg>
                  </div>
                </div>
              </div>
              {/* Servizi espansi */}
              {phase>=9 && (
                <div style={{borderTop:"1px solid #e2e8f0",padding:"6px 10px",animation:"fadeIn 0.3s"}}>
                  {[
                    {date:"01 Mar",type:"Pulizia",price:"€ 71"},
                    {date:"08 Mar",type:"Pulizia + Biancheria",price:"€ 102"},
                    {date:"15 Mar",type:"Pulizia",price:"€ 71"},
                    {date:"22 Mar",type:"Biancheria",price:"€ 31"},
                  ].map((s,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:i<3?"1px solid #f8fafc":"none"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:8,color:"#94a3b8",width:32}}>{s.date}</span>
                        <span style={{fontSize:9,fontWeight:500,color:"#334155"}}>{s.type}</span>
                      </div>
                      <span style={{fontSize:9,fontWeight:600,color:"#1e293b"}}>{s.price}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Card proprietà 2 */}
            <div style={{background:"white",borderRadius:16,border:"1px solid #e2e8f0",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
              <div style={{padding:"8px 10px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <img src={PROP_PHOTO_2} style={{width:36,height:36,borderRadius:10,objectFit:"cover",border:"2px solid #ddd6fe"}} alt="" />
                  <div>
                    <p style={{fontSize:10,fontWeight:600,color:"#1e293b",margin:0}}>Suite Trastevere</p>
                    <p style={{fontSize:8,color:"#94a3b8",margin:0}}>3 servizi</p>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>€ 245</span>
                  <div style={{width:20,height:20,borderRadius:6,background:"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <svg style={{width:8,height:8}} fill="none" stroke="#64748b" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7"/></svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── SCREEN: Install iPhone ─── */
function ScreenInstallIphone() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  const shareRef = useRef<HTMLDivElement>(null);
  const addHomeRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1800,3500,5500,7500,9000,10500];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },13500);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const startRef = useRef<HTMLDivElement>(null);
  const activeRef = phase<=2 ? shareRef : phase<=4 ? addHomeRef : addBtnRef;
  const clicking = [2,4,6].includes(phase);

  return (
    <div ref={ref} style={{position:"relative",height:"100%",background:"#f2f2f7",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <CompletionOverlay visible={phase>=7} message="App Installata!" />
      {vis && activeRef && <SmartCursor targetRef={activeRef} clicking={clicking} visible={phase>=1&&phase<7} />}

      {/* Safari URL bar */}
      <div style={{background:"#f8f8f8",padding:"6px 10px",display:"flex",alignItems:"center",gap:6,borderBottom:"0.5px solid #c6c6c8",flexShrink:0}}>
        <span style={{fontSize:10,color:"#007aff",fontWeight:500}}>aA</span>
        <div style={{flex:1,background:"#e8e8ed",borderRadius:10,padding:"5px 10px",textAlign:"center"}}>
          <span style={{fontSize:9,color:"#3c3c43"}}>gestionale.puliziacasevacanze.it</span>
        </div>
      </div>

      {/* Content */}
      <div style={{flex:1,padding:12,overflow:"hidden"}}>
        <div ref={startRef} style={{position:"absolute",top:20,left:20,width:1,height:1,pointerEvents:"none"}}/>
        <div style={{background:"white",borderRadius:14,padding:16,textAlign:"center",boxShadow:"0 0 1px rgba(0,0,0,0.1)"}}>
          <div style={{width:40,height:40,borderRadius:12,background:"linear-gradient(135deg,#0ea5e9,#6366f1)",margin:"0 auto 8px",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg style={{width:20,height:20}} fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5"/></svg>
          </div>
          <p style={{fontSize:12,fontWeight:600,color:"#1c1c1e",margin:0}}>CleaningApp</p>
          <p style={{fontSize:8,color:"#8e8e93",margin:"2px 0 0"}}>Gestionale Pulizie</p>
        </div>
      </div>

      {/* Safari bottom toolbar */}
      <div style={{background:"#f8f8f8",padding:"6px 16px 10px",borderTop:"0.5px solid #c6c6c8",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <svg style={{width:20,height:20,opacity:0.3}} fill="none" stroke="#007aff" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg>
        <svg style={{width:20,height:20,opacity:0.3}} fill="none" stroke="#007aff" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
        <div ref={shareRef} style={{padding:4}}>
          <svg style={{width:18,height:18,transition:"transform 0.3s",transform:phase===2?"scale(1.3)":"scale(1)"}} fill="none" stroke="#007aff" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12M8 7l4-4 4 4"/>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 10H5a1 1 0 00-1 1v9a1 1 0 001 1h14a1 1 0 001-1v-9a1 1 0 00-1-1h-2"/>
          </svg>
        </div>
        <svg style={{width:20,height:20,opacity:0.3}} fill="none" stroke="#007aff" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 6.25v13m0-13C10.83 5.48 9.25 5 7.5 5S4.17 5.48 3 6.25v13C4.17 18.48 5.75 18 7.5 18s3.33.48 4.5 1.25m0-13C13.17 5.48 14.75 5 16.5 5c1.75 0 3.33.48 4.5 1.25v13C19.83 18.48 18.25 18 16.5 18c-1.75 0-3.33.48-4.5 1.25"/></svg>
        <svg style={{width:20,height:20,opacity:0.3}} fill="none" stroke="#007aff" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
      </div>

      {/* iOS Share Sheet — mostra SOLO le azioni (no app row, per far vedere "Aggiungi") */}
      {phase>=3 && phase<5 && (
        <div style={{position:"absolute",bottom:0,left:0,right:0,top:"15%",background:"#f2f2f7",borderRadius:"12px 12px 0 0",boxShadow:"0 -8px 30px rgba(0,0,0,0.25)",zIndex:10,animation:"slideUp 0.3s ease-out",display:"flex",flexDirection:"column"}}>
          <div style={{width:36,height:5,background:"#c7c7cc",borderRadius:3,margin:"8px auto 6px",flexShrink:0}}/>
          {/* Header sito */}
          <div style={{padding:"6px 16px 8px",borderBottom:"0.5px solid #c6c6c8",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <div style={{width:28,height:28,borderRadius:6,background:"linear-gradient(135deg,#0ea5e9,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg style={{width:14,height:14}} fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16"/></svg>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <p style={{fontSize:10,fontWeight:600,color:"#1c1c1e",margin:0}}>CleaningApp</p>
              <p style={{fontSize:8,color:"#8e8e93",margin:0}}>gestionale.puliziacasevacanze.it</p>
            </div>
            <span style={{fontSize:9,color:"#007aff"}}>Opzioni &gt;</span>
          </div>
          {/* App row compatta */}
          <div style={{padding:"8px 12px",display:"flex",gap:12,borderBottom:"0.5px solid #c6c6c8",flexShrink:0,overflowX:"auto"}}>
            {["AirDrop","Messaggi","Mail","Note","Promemoria"].map((a,i)=>(
              <div key={i} style={{textAlign:"center",flexShrink:0}}>
                <div style={{width:36,height:36,borderRadius:10,background:["#e8e8ed","#34c759","#007aff","#ffd60a","#007aff"][i],margin:"0 auto 2px",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:14,color:"white"}}>{["📡","💬","✉️","📝","✅"][i]}</span>
                </div>
                <span style={{fontSize:6,color:"#8e8e93"}}>{a}</span>
              </div>
            ))}
          </div>
          {/* Lista azioni iOS — scrollabile */}
          <div style={{flex:1,overflow:"auto"}}>
            <div style={{background:"white",margin:"8px 10px",borderRadius:10,overflow:"hidden"}}>
              {[
                {t:"Copia",ic:"M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2z",hl:false},
                {t:"Aggiungi elenco di lettura",ic:"M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z",hl:false},
                {t:"Aggiungi segnalibro",ic:"M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z",hl:false},
                {t:"Aggiungi ai preferiti",ic:"M11.05 2.93c.3-.92 1.6-.92 1.9 0l1.52 4.67a1 1 0 00.95.69h4.91c.97 0 1.37 1.24.59 1.81l-3.98 2.89a1 1 0 00-.36 1.12l1.52 4.67c.3.92-.76 1.69-1.54 1.12l-3.98-2.89a1 1 0 00-1.18 0l-3.98 2.89c-.78.57-1.84-.2-1.54-1.12l1.52-4.67a1 1 0 00-.36-1.12L1.64 10.1c-.78-.57-.38-1.81.59-1.81h4.91a1 1 0 00.95-.69l1.52-4.67z",hl:false},
                {t:"Trova nella pagina",ic:"M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z",hl:false},
                {t:"Aggiungi alla schermata Home",ic:"",hl:true},
                {t:"Modifica",ic:"M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",hl:false},
                {t:"Stampa",ic:"M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z",hl:false},
              ].map((a,i)=>(
                <div key={i} ref={a.hl?addHomeRef:undefined} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 14px",borderBottom:i<7?"0.5px solid #e5e5ea":"none",background:a.hl&&phase>=4?"#e8f0fe":"white"}}>
                  <span style={{fontSize:10,color:a.hl&&phase>=4?"#007aff":"#1c1c1e",fontWeight:a.hl&&phase>=4?600:400}}>{a.t}</span>
                  {a.hl ? (
                    <svg style={{width:16,height:16}} fill="none" stroke={phase>=4?"#007aff":"#8e8e93"} strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>
                  ) : a.ic ? (
                    <svg style={{width:16,height:16}} fill="none" stroke="#8e8e93" strokeWidth="1.5" viewBox="0 0 24 24"><path d={a.ic}/></svg>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dialog Aggiungi a Home — stile iOS */}
      {phase>=5 && phase<7 && (
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",flexDirection:"column",zIndex:20,animation:"fadeIn 0.3s"}}>
          <div style={{flex:1}}/>
          <div style={{background:"#f2f2f7",borderRadius:"12px 12px 0 0",overflow:"hidden"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:"0.5px solid #c6c6c8"}}>
              <button style={{background:"none",border:"none",fontSize:12,color:"#007aff",fontWeight:400}}>Annulla</button>
              <span style={{fontSize:12,fontWeight:600,color:"#1c1c1e"}}>Aggiungi a Home</span>
              <button ref={addBtnRef} style={{background:"none",border:"none",fontSize:12,color:phase>=6?"#34c759":"#007aff",fontWeight:700}}>{phase>=6?"\u2713 Fatto":"Aggiungi"}</button>
            </div>
            <div style={{padding:"16px 16px 20px",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:44,height:44,borderRadius:10,background:"linear-gradient(135deg,#0ea5e9,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>
                <svg style={{width:22,height:22}} fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16"/></svg>
              </div>
              <div>
                <p style={{fontSize:12,fontWeight:500,color:"#1c1c1e",margin:0}}>CleaningApp</p>
                <p style={{fontSize:9,color:"#8e8e93",margin:"2px 0 0"}}>gestionale.puliziacasevacanze.it</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── SCREEN: Install Android ─── */
function ScreenInstallAndroid() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const addHomeRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const menuListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1800,3500,4500,6500,8000,9500,11000];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },14000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  // Auto-scroll menu to show "Aggiungi a schermata Home"
  useEffect(() => {
    if (phase === 4 && menuListRef.current) {
      menuListRef.current.scrollTo({ top: menuListRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [phase]);

  const activeRef = phase<=2 ? menuRef : phase<=5 ? addHomeRef : addBtnRef;
  const clicking = [2,5,7].includes(phase);
  const menuOpen = phase>=3 && phase<6;

  return (
    <div ref={ref} style={{position:"relative",height:"100%",background:"#fafafa",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <CompletionOverlay visible={phase>=8} message="App Installata!" />
      {vis && activeRef && <SmartCursor targetRef={activeRef} clicking={clicking} visible={phase>=1&&phase<8} />}

      {/* Chrome top bar */}
      <div style={{background:"white",padding:"6px 8px",display:"flex",alignItems:"center",gap:5,borderBottom:"1px solid #dadce0",flexShrink:0}}>
        <svg style={{width:16,height:16,opacity:0.5}} fill="none" stroke="#5f6368" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
        <div style={{flex:1,background:"#f1f3f4",borderRadius:20,padding:"5px 10px",display:"flex",alignItems:"center",gap:5}}>
          <svg style={{width:9,height:9}} fill="none" stroke="#5f6368" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          <span style={{fontSize:8,color:"#5f6368",flex:1}}>gestionale.puliziacasevacanze.it</span>
        </div>
        <svg style={{width:14,height:14,opacity:0.4}} fill="none" stroke="#5f6368" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M8.68 13.34a3 3 0 110-2.68m0 2.68l6.64 3.32m-6.64-6l6.64-3.32"/></svg>
        <div style={{width:16,height:16,border:"1.5px solid #5f6368",borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",opacity:0.5}}>
          <span style={{fontSize:7,fontWeight:700,color:"#5f6368"}}>3</span>
        </div>
        <div ref={menuRef} style={{padding:"2px 2px",cursor:"pointer"}}>
          <div style={{display:"flex",flexDirection:"column",gap:2,transform:phase===2?"scale(1.4)":"scale(1)",transition:"transform 0.3s"}}>
            <div style={{width:3,height:3,borderRadius:"50%",background:phase>=2&&phase<4?"#1a73e8":"#5f6368"}}/>
            <div style={{width:3,height:3,borderRadius:"50%",background:phase>=2&&phase<4?"#1a73e8":"#5f6368"}}/>
            <div style={{width:3,height:3,borderRadius:"50%",background:phase>=2&&phase<4?"#1a73e8":"#5f6368"}}/>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{flex:1,padding:12,overflow:"hidden"}}>
        <div style={{background:"white",borderRadius:12,padding:16,textAlign:"center",boxShadow:"0 1px 2px rgba(0,0,0,0.08)"}}>
          <div style={{width:40,height:40,borderRadius:12,background:"linear-gradient(135deg,#0ea5e9,#6366f1)",margin:"0 auto 8px",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg style={{width:20,height:20}} fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16"/></svg>
          </div>
          <p style={{fontSize:12,fontWeight:500,color:"#202124",margin:0}}>CleaningApp</p>
          <p style={{fontSize:8,color:"#5f6368",margin:"2px 0 0"}}>Gestionale Pulizie</p>
        </div>
      </div>

      {/* Chrome dropdown — scrollabile con auto-scroll */}
      {menuOpen && (
        <div ref={menuListRef} style={{position:"absolute",top:32,right:4,maxHeight:"calc(100% - 44px)",background:"white",borderRadius:4,boxShadow:"0 2px 12px rgba(0,0,0,0.2)",width:200,zIndex:10,animation:"fadeIn 0.15s",overflow:"auto",paddingTop:6,paddingBottom:6}}>
          {[
            {t:"Scheda in incognito",ic:"M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5z"},
            {t:"Aggiungi scheda a n...",ic:"M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"},
            {t:"Cronologia",ic:"M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.95 8.95 0 0013 21a9 9 0 000-18z"},
            {t:"Elimina dati navigazi...",ic:"M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"},
            {t:"Download",ic:"M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"},
            {t:"Preferiti",ic:"M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"},
            {t:"Schede recenti",ic:"M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6z"},
            {t:"Zoom",ic:"M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5z"},
            {t:"Condividi...",ic:"M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"},
            {t:"Trova nella pagina",ic:"M20.49 19l-5.73-5.73C15.53 12.2 16 10.91 16 9.5A6.5 6.5 0 109.5 16c1.41 0 2.7-.47 3.77-1.24L19 20.49 20.49 19z"},
            {t:"Traduci...",ic:"M12.87 15.07l-2.54-2.51.03-.03A17.5 17.5 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12z"},
            {t:"Aggiungi a schermat...",ic:"M18 1.01L6 1c-1.1 0-2 .9-2 2v3h2V5h12v14H6v-1H4v3c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM10 15h2V8H5v2h3.59L1 17.59 2.41 19 10 11.41V15z",hl:true},
            {t:"Sito desktop",ic:"M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7l-2 3v1h8v-1l-2-3h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"},
          ].map((m,i)=>(
            <div key={i} ref={m.hl?addHomeRef:undefined} style={{
              display:"flex",alignItems:"center",gap:10,padding:"9px 14px",
              color:m.hl&&phase>=5?"#1a73e8":"#3c4043",
              fontWeight:m.hl&&phase>=5?500:400,
              background:m.hl&&phase>=5?"#e8f0fe":"transparent",
            }}>
              <svg style={{width:16,height:16,flexShrink:0}} viewBox="0 0 24 24" fill={m.hl&&phase>=5?"#1a73e8":"#5f6368"}><path d={m.ic}/></svg>
              <span style={{fontSize:10}}>{m.t}</span>
            </div>
          ))}
        </div>
      )}

      {/* Install dialog Material Design */}
      {phase>=6 && phase<8 && (
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:20,animation:"fadeIn 0.2s"}}>
          <div style={{background:"white",borderRadius:28,padding:"24px 24px 16px",width:"85%",boxShadow:"0 8px 30px rgba(0,0,0,0.3)"}}>
            <p style={{fontSize:13,fontWeight:500,color:"#202124",margin:"0 0 16px"}}>Aggiungi a schermata Home</p>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,padding:12,background:"#f8f9fa",borderRadius:12}}>
              <div style={{width:36,height:36,borderRadius:8,background:"linear-gradient(135deg,#0ea5e9,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <svg style={{width:18,height:18}} fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16"/></svg>
              </div>
              <div>
                <p style={{fontSize:11,fontWeight:500,color:"#202124",margin:0}}>CleaningApp</p>
                <p style={{fontSize:8,color:"#5f6368",margin:"1px 0 0"}}>gestionale.puliziacasevacanze.it</p>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
              <button style={{padding:"8px 16px",borderRadius:20,border:"none",background:"transparent",fontSize:11,fontWeight:500,color:"#1a73e8"}}>Annulla</button>
              <button ref={addBtnRef} style={{padding:"8px 24px",borderRadius:20,border:"none",background:phase>=7?"#34a853":"#1a73e8",fontSize:11,fontWeight:500,color:"white",transition:"all 0.2s"}}>
                {phase>=7?"\u2713 Aggiunto":"Aggiungi"}
              </button>
            </div>
          </div>
        </div>
      )}
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
  { id:"installa", title:"Installa App", icon:"📲", color:"#059669" },
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
        padding:"48px 20px 40px", textAlign:"center", position:"relative", overflow:"hidden"
      }}>
        <Particles count={30} />
        {/* Glow orbs decorativi */}
        <div style={{position:"absolute",top:"-20%",left:"-10%",width:300,height:300,borderRadius:"50%",background:"radial-gradient(circle,rgba(56,189,248,0.12) 0%,transparent 70%)",filter:"blur(40px)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:"-15%",right:"-10%",width:250,height:250,borderRadius:"50%",background:"radial-gradient(circle,rgba(139,92,246,0.12) 0%,transparent 70%)",filter:"blur(40px)",pointerEvents:"none"}}/>

        <div style={{position:"relative",zIndex:1}}>
          {/* Logo/icona animata */}
          <div style={{
            width:64,height:64,borderRadius:20,margin:"0 auto 24px",
            background:"linear-gradient(135deg,#0ea5e9,#6366f1,#a855f7)",
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:"0 8px 32px rgba(99,102,241,0.4), 0 0 80px rgba(99,102,241,0.15)",
            animation:"heroFloat 3s ease-in-out infinite"
          }}>
            <svg style={{width:32,height:32}} fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
            </svg>
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

          {/* Pulsante Registrati con glow */}
          <a href="/register" style={{
            display:"inline-flex",alignItems:"center",gap:10,
            padding:"14px 36px",borderRadius:16,
            background:"linear-gradient(135deg,#0ea5e9 0%,#6366f1 50%,#a855f7 100%)",
            color:"white",fontSize:16,fontWeight:700,textDecoration:"none",
            boxShadow:"0 4px 24px rgba(99,102,241,0.5), 0 0 60px rgba(99,102,241,0.2), inset 0 1px 0 rgba(255,255,255,0.2)",
            transition:"all 0.3s ease",cursor:"pointer",
            border:"1px solid rgba(255,255,255,0.15)"
          }}>
            <svg style={{width:20,height:20}} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
            </svg>
            Registrati
          </a>

          {/* Stats */}
          <div style={{display:"flex",justifyContent:"center",gap:32,flexWrap:"wrap",marginTop:40}}>
            {[
              {n:<Counter end={11} />,l:"Passaggi"},
              {n:<Counter end={5} />,l:"Minuti"},
            ].map((s,i) => (
              <div key={i} style={{textAlign:"center"}}>
                <p style={{fontSize:28,fontWeight:800,color:"white",margin:"0 0 2px",textShadow:"0 0 20px rgba(99,102,241,0.3)"}}>{s.n}</p>
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
          subtitle="In questa sezione puoi consultare lo stato dei tuoi pagamenti mese per mese e verificare la tua situazione contabile."
          color="#EF4444"
          icon="💰"
        />
        <DemoPhone fixedH={580}>
          {/* Animazione della modal di pagamento in sospeso */}
          <ScreenPagamenti />
        </DemoPhone>
        <div style={{maxWidth:520,margin:"24px auto 16px",padding:"0 4px"}}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"white",border:"1px solid #fecaca",borderRadius:12,padding:"12px 16px"}}>
              <p style={{fontSize:13,fontWeight:700,color:"#991b1b",margin:"0 0 4px"}}>📅 Come funziona la fatturazione</p>
              <p style={{fontSize:13,color:"#64748b",margin:0,lineHeight:1.6}}>I costi di pulizie e biancheria di ciascun mese vengono conteggiati automaticamente dal gestionale. Per ricevere la <b>fattura</b> e procedere al pagamento, devi <b>contattare l'amministrazione</b>.</p>
            </div>
            <div style={{background:"white",border:"1px solid #fecaca",borderRadius:12,padding:"12px 16px"}}>
              <p style={{fontSize:13,fontWeight:700,color:"#991b1b",margin:"0 0 4px"}}>💳 Come saldare il debito</p>
              <p style={{fontSize:13,color:"#64748b",margin:0,lineHeight:1.6}}>Contatta l'amministrazione per ricevere la fattura → effettua il pagamento (bonifico o contanti) → l'admin registrerà il pagamento nel gestionale. Solo dopo la registrazione il debito risulterà saldato.</p>
            </div>
            <div style={{background:"white",border:"1px solid #fecaca",borderRadius:12,padding:"12px 16px"}}>
              <p style={{fontSize:13,fontWeight:700,color:"#991b1b",margin:"0 0 4px"}}>⚠️ Sospensione del servizio</p>
              <p style={{fontSize:13,color:"#64748b",margin:0,lineHeight:1.6}}>Se il pagamento non viene saldato entro la scadenza, il servizio verrà <b>sospeso automaticamente</b>. L'unico modo per riattivarlo è saldare l'importo dovuto contattando l'amministrazione.</p>
            </div>
          </div>
        </div>
        <TipBox icon="💳" title="Come eliminare un debito?" color="#EF4444">
          Contatta l'amministrazione per ricevere la fattura relativa al mese da saldare. Una volta effettuato il pagamento (bonifico o contanti), l'amministratore registrerà l'avvenuto pagamento nel gestionale e il debito verrà eliminato dalla tua situazione contabile.
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

      {/* ═══ SEZ: INSTALLA COME APP ═══ */}
      <SectionDivider number={13} color="#059669" />
      <GuidaSection id="installa" bg="linear-gradient(180deg, #ecfdf5 0%, #fafbfc 100%)">
        <SectionHeader
          title="Installa come App"
          subtitle="Aggiungi CleaningApp alla schermata home del tuo telefono per accedere con un solo tocco, proprio come un'app nativa."
          color="#059669"
          icon="📲"
        />

        {/* iPhone */}
        <div style={{maxWidth:520,margin:"0 auto 32px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#1e293b,#334155)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg style={{width:18,height:18}} fill="white" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            </div>
            <div>
              <p style={{fontSize:15,fontWeight:700,color:"#1e293b",margin:0}}>iPhone (Safari)</p>
              <p style={{fontSize:11,color:"#64748b",margin:0}}>3 semplici passaggi</p>
            </div>
          </div>
          <DemoPhone fixedH={480}>
            <ScreenInstallIphone />
          </DemoPhone>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:16}}>
            {[
              {n:"1",t:"Apri il sito con Safari",d:"Vai su gestionale.puliziacasevacanze.it usando il browser Safari (non Chrome)."},
              {n:"2",t:"Tocca il pulsante Condividi",d:"Tocca l'icona condividi (il quadrato con la freccia verso l'alto) nella barra in basso di Safari."},
              {n:"3",t:"Seleziona \"Aggiungi a Home\"",d:"Scorri le opzioni e tocca \"Aggiungi a Home\". Conferma con \"Aggiungi\" in alto a destra."},
            ].map((s,i)=>(
              <div key={i} style={{display:"flex",gap:10,padding:"10px 14px",background:"white",borderRadius:12,border:"1px solid #d1fae5"}}>
                <div style={{width:24,height:24,borderRadius:8,background:"linear-gradient(135deg,#059669,#10b981)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:11,fontWeight:800,color:"white"}}>{s.n}</span>
                </div>
                <div>
                  <p style={{fontSize:13,fontWeight:600,color:"#1e293b",margin:"0 0 2px"}}>{s.t}</p>
                  <p style={{fontSize:12,color:"#64748b",margin:0,lineHeight:1.5}}>{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Android */}
        <div style={{maxWidth:520,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <div style={{width:36,height:36,borderRadius:10,background:"white",display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid #e2e8f0"}}>
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAAEOUlEQVR42u1YTS9zWxR+9odo0PDmFAORigiiqWgiZsQ/MCFhRogfYGhiZEAHImYGGPgPTYgII4lIRFQnGBEkGiY+2nPOfu7knnPbV0vrI/fNzV3JzjnZn89ee61nrb0FSeIPEok/TMoGRBKlKPWzitflDhBCAACMMXlff4dS5n1/TEPeju/u7pBMJiGlhJQSWuu84tWfnp7i5uambG3pcjRjjEEwGMTBwQEqKyuRTqdxcnKCdDoNIQTq6+vR09ODuro6XFxcoLW1FcaY8rTFEsUYQ2MMSTIej7OmpoYACpba2lqurKyQJF3XZTmCUsG4rstMJsOhoSECYENDAwFQa51XctvGxsZo2zZd1/U38y2AHMchSc7MzBAAR0ZGSJJTU1N5oABwcnKSJDk8PEwAnJ2dzZvjy4A8lSeTSWqtqZRiLBZjIpHgwMAAAVBKSSklAbC/v5+JRIKxWIxKKVZWVvL8/Lzk48N7WrFtm5lMhiQ5NzdHpRQDgUCevXggvZLbFggEqJTi/Pw8STKTydC27Xe1hWI287vEYrGiRvxR6evrK2kNktSF+EYIgY2NDRwdHWF6ehrRaBRLS0t4fn6GEKJkXvH61tTUAABOTk6wurqK3t5ejI+P+2sV5SHXdaGUwu7uLiYmJgAAOzs7OD4+xu3tLdLpNKSUZQEyxsCyLGSzWYyOjiKVSgEAWlpaMDg46K9ZkIds2yZJrq2tUUpJrTUty+Lj4yPD4fCnjywcDvPx8ZGWZVFrTSkl19fX89YsemQAUFFRAWMMjDFQSkEIgVAohOvra0gp38SvonHp776hUAhCCCil4DiOv0bJoSP3SLx/13XhOM6nALmuW3Te/14+9K8AEkL47vi7W35FcucsNm9BQI7jgCS01rBtG9+RdpOEbdvQWvv/HwLy8pauri4fWEdHB6qrq33v+Iw4joPq6mq0t7f780QikcKZZTFK39raYjwe5/X1NUkyEon4gbRU/vH6RiIRkuTV1RXj8Ti3t7eLho+SY1l3dzeFEAUBCSEohCgISAjBaDT6+VjmGZ3ruiDpE2M2my1qS+/V59oLSbiu65NkWW6vlILW/+Btamry63M9xPOYQp7j9fXGAoDWuiiYknJqT7X39/dMJpPc29tjVVWVfyzLy8tMpVI8Ozvj5uamX6+UYiKR4NnZGe/v7/Ny8vdEl8odlmXBsiw8PDzktbe2tqKzsxMA8PT0lDcuEomgubn5Zy6KXvzyciJv0Uwm47e9vr76OZAQAi8vLzDG+Lb4raFDCAEpJYQQcBzHJzjv3uUFUo9QPXL1xvxILCOJX79+oa2tDY7joKKiwidRkgiHwwgGg3AcB83NzWhsbCyYFX7LRTHXwC8vL7m4uMj9/f03l8jDw0MuLCwwlUq9yzfFRHz1fShXA2Vr4ztePzwDN8a8ITgvh861q7Izgv9f0D6QvwDZLdsbhAE17AAAAABJRU5ErkJggg==" style={{width:24,height:24}} alt="Android" />
            </div>
            <div>
              <p style={{fontSize:15,fontWeight:700,color:"#1e293b",margin:0}}>Android (Chrome)</p>
              <p style={{fontSize:11,color:"#64748b",margin:0}}>3 semplici passaggi</p>
            </div>
          </div>
          <DemoPhone fixedH={480}>
            <ScreenInstallAndroid />
          </DemoPhone>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:16}}>
            {[
              {n:"1",t:"Apri il sito con Chrome",d:"Vai su gestionale.puliziacasevacanze.it usando il browser Chrome."},
              {n:"2",t:"Tocca il menu ⋮",d:"Tocca i tre puntini in alto a destra per aprire il menu di Chrome."},
              {n:"3",t:"Seleziona \"Aggiungi a schermata Home\"",d:"Tocca \"Aggiungi a schermata Home\" e conferma. L'icona apparirà nella tua home."},
            ].map((s,i)=>(
              <div key={i} style={{display:"flex",gap:10,padding:"10px 14px",background:"white",borderRadius:12,border:"1px solid #d1fae5"}}>
                <div style={{width:24,height:24,borderRadius:8,background:"linear-gradient(135deg,#059669,#10b981)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:11,fontWeight:800,color:"white"}}>{s.n}</span>
                </div>
                <div>
                  <p style={{fontSize:13,fontWeight:600,color:"#1e293b",margin:"0 0 2px"}}>{s.t}</p>
                  <p style={{fontSize:12,color:"#64748b",margin:0,lineHeight:1.5}}>{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <TipBox icon="📲" title="Perché installare come app?" color="#059669">
          Aggiungendo CleaningApp alla schermata home avrai accesso immediato con un solo tocco, riceverai le notifiche push e l'interfaccia sarà a schermo intero senza la barra del browser — esattamente come un'app scaricata dallo store.
        </TipBox>
      </GuidaSection>

      {/* ═══ SEZ 14: FAQ ═══ */}
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

