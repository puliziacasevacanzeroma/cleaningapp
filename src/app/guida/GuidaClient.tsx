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
    function run() {
      seq.forEach((t,i) => { timers.push(setTimeout(() => setStep(i), t)); });
      // step 8 = show completion overlay
      timers.push(setTimeout(() => setStep(8), 8800));
    }
    run();
    const loop = setInterval(() => {
      setStep(0);
      run();
    }, 12000);
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
  const showComplete = step >= 8;

  const cursorPos = [
    {x:45,y:60},{x:55,y:43},{x:55,y:53},{x:55,y:62},{x:55,y:71},{x:50,y:87},{x:50,y:87},{x:50,y:50},{x:50,y:50},
  ];
  const cp = cursorPos[Math.min(step, cursorPos.length-1)];

  return (
    <div ref={ref} style={{position:"relative"}}>
      {vis && !showComplete && <LiveCursor x={cp.x} y={cp.y} clicking={clicking} />}
      <LiveTooltip text="▶ Compilando..." color="#0EA5E9" visible={step>=1 && step<6 && !showComplete} x={2} y={2} />
      <AppScreen>
        <div className="p-5" style={{position:"relative"}}>
          <CompletionOverlay visible={showComplete} message="Account Creato!" />
          <div className="text-center mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center mx-auto mb-2 shadow-lg shadow-sky-200">
              <span className="text-white text-lg font-bold">C</span>
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Crea il tuo Account</h3>
            <p className="text-[10px] text-slate-400">Compila i dati per registrarti</p>
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
                ${phase >= 12 && phase <= 13 ? "border-purple-400 bg-purple-50/20" : phase >= 13 ? "border-purple-300 bg-purple-50/30" : "border-dashed border-slate-300 bg-slate-50"}`}
            >
              {phase >= 13 ? (
                <svg width="140" height="28" viewBox="0 0 160 36">
                  <path
                    d="M8,26 Q22,6 42,20 Q62,34 82,12 Q102,0 128,20 Q142,30 154,16"
                    stroke="#6366F1" strokeWidth="2.5" fill="none"
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
                      <div style={{ width: 44, height: 12, borderRadius: "22px 22px 0 0", background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }} />
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

        <InlineCaption
          icon={phase<=3?"📄":phase<=7?"☑️":phase<=9?"✍️":phase<=11?"🪪":phase<=13?"✒️":phase<=16?"📷":"✅"}
          text={phase<=1?"Scorri il contratto fino alla fine...":phase<=2?"Continua a leggere il contratto...":phase<=3?"Hai letto tutto — ora puoi procedere":phase<=5?"Accetta i termini e condizioni":phase<=7?"Accetta la privacy policy":phase<=9?"Inserisci il tuo nome completo":phase<=11?"Inserisci il codice fiscale":phase<=13?"Disegna la tua firma":phase<=16?"Scatta il selfie del volto":done?"Contratto firmato con successo!":"Conferma la firma"}
          color={done?"#10B981":phase>=14?"#10B981":phase>=4&&phase<=7?"#10B981":"#6366F1"}
          visible={vis}
        />
        <div className="px-3 pb-2">
          <button
            ref={btnRef}
            className={`w-full py-2 rounded-xl text-xs font-bold text-white shadow-lg transition-all duration-300
              ${done ? "bg-emerald-500 shadow-emerald-200/50" : phase === 18 ? "scale-95 bg-indigo-700" : "bg-gradient-to-r from-indigo-500 to-purple-600 shadow-indigo-200/40"}`}
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

        <InlineCaption
          icon={phase<=1?"💳":phase<=3?"🏢":phase<=4?"👤":phase<=6?"✍️":phase<=8?"🪪":"✅"}
          text={phase===0?"Scegli il tipo di fatturazione":phase<=2?"Modalità Azienda: inserisci P.IVA e SDI":phase<=3?"Torna a Persona Fisica":phase<=4?"Modalità Persona Fisica attiva":phase<=6?"Compila nome e cognome":phase<=8?"Inserisci il codice fiscale":done?"Dati salvati correttamente":"Clicca per salvare"}
          color={done?"#10B981":"#10B981"}
          visible={vis && !showComplete}
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
/* ── STEP 0: Pagina Proprietà vuota → Click + → Modal ── */
function ScreenStep0() {
  const [ref, vis] = useVis(0.1);
  const [phase, setPhase] = useState(0);
  // 0=Proprietà page, 1=hover +, 2=click→modal, 3=pause modal, 4=overlay
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1500,2800,4200,5600,6400];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },10000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const plusRef = useRef(null);
  const showModal = phase >= 2;
  const clicking = phase===2;

  /* Navbar fedele al gestionale: Dashboard, Proprietà, Pulizie, Prenotazioni, Menu */
  const Nav = () => (
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
  );

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      {vis&&phase>=1&&phase<4&&<SmartCursor targetRef={plusRef} clicking={clicking} visible={true}/>}

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100" style={{position:"relative",display:"flex",flexDirection:"column"}}>
        <CompletionOverlay visible={phase>=4} message="Modal Aperta!" />

        {!showModal ? (
          /* ═══ Pagina Proprietà — fedele pixel per pixel ═══ */
          <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
            {/* Banner scuro con foto sfondo */}
            <div style={{background:"#0b0b18",position:"relative",overflow:"hidden",minHeight:100}}>
              {/* Foto sfondo sfumata */}
              <div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,#2d1b69 0%,#1a1a2e 40%,#0b0b18 100%)",opacity:0.8}}/>
              {/* Gradient overlay */}
              <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(11,11,24,0.1) 0%,rgba(11,11,24,0.5) 60%,rgba(11,11,24,0.85) 100%)"}}/>
              {/* Content */}
              <div style={{position:"relative",zIndex:1,padding:"16px 16px 14px",display:"flex",flexDirection:"column",minHeight:100}}>
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
                    transform:phase>=1?"scale(1.1)":"scale(1)"
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 4v16m8-8H4"/></svg>
                  </button>
                </div>
              </div>
            </div>
            {/* Empty state */}
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 20px"}}>
              <div style={{width:44,height:44,borderRadius:12,background:"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" style={{width:22,height:22}}><path d="m3 9 9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </div>
              <p style={{fontSize:12,fontWeight:700,color:"#334155",margin:"0 0 4px"}}>Nessuna proprietà</p>
              <p style={{fontSize:9,color:"#94a3b8",margin:0,lineHeight:1.5,textAlign:"center"}}>Tocca il <b>+</b> viola per aggiungere la tua prima proprietà</p>
            </div>
            <Nav/>
          </div>
        ) : (
          /* ═══ Modal creazione proprietà overlay ═══ */
          <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
            {/* Sfondo sfocato */}
            <div style={{background:"#0b0b18",padding:8,opacity:0.2}}>
              <p style={{fontSize:12,color:"white"}}>Le Mie Proprietà</p>
            </div>
            {/* Modal */}
            <div style={{flex:1,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:4}}>
              <div style={{background:"white",borderRadius:14,width:"94%",boxShadow:"0 16px 48px rgba(0,0,0,0.3)",overflow:"hidden",animation:"fadeIn 0.3s"}}>
                <div style={{background:"linear-gradient(135deg,#1e293b,#0f172a)",padding:"8px 12px",color:"white"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                    <p style={{fontSize:11,fontWeight:700,margin:0}}>Nuova Proprietà</p>
                    <div style={{width:20,height:20,borderRadius:"50%",background:"rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9}}>✕</div>
                  </div>
                  <div style={{display:"flex",gap:2}}>{[0,1,2,3,4,5].map(i=><div key={i} style={{flex:1,height:3,borderRadius:2,background:i===0?"#10b981":"rgba(255,255,255,0.15)"}}/>)}</div>
                  <p style={{fontSize:7,color:"rgba(255,255,255,0.5)",marginTop:2}}>Step 1 di 6 · Info</p>
                </div>
                <div style={{padding:"8px 12px"}}>
                  <div style={{textAlign:"center",marginBottom:6}}>
                    <div style={{width:26,height:26,borderRadius:6,background:"linear-gradient(135deg,#38bdf8,#2563eb)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 3px"}}>
                      <svg style={{width:13,height:13,color:"white"}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                    </div>
                    <p style={{fontSize:10,fontWeight:700,color:"#1e293b",margin:0}}>Informazioni Base</p>
                  </div>
                  <div style={{marginBottom:5}}>
                    <label style={{fontSize:7,fontWeight:600,color:"#475569",display:"block",marginBottom:1}}>Nome Proprietà *</label>
                    <div style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 8px",fontSize:8,color:"#94a3b8",background:"#f8fafc"}}>es. Appartamento Colosseo</div>
                  </div>
                  <div style={{marginBottom:5}}>
                    <label style={{fontSize:7,fontWeight:600,color:"#475569",display:"block",marginBottom:1}}>Indirizzo *</label>
                    <div style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 8px",fontSize:8,color:"#94a3b8",background:"#f8fafc"}}>Inizia a digitare...</div>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    <div style={{flex:1}}>
                      <label style={{fontSize:7,fontWeight:600,color:"#475569",display:"block",marginBottom:1}}>Piano *</label>
                      <div style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 8px",fontSize:8,color:"#94a3b8",background:"#f8fafc"}}>—</div>
                    </div>
                    <div style={{flex:1}}>
                      <label style={{fontSize:7,fontWeight:600,color:"#475569",display:"block",marginBottom:1}}>Citofono *</label>
                      <div style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 8px",fontSize:8,color:"#94a3b8",background:"#f8fafc"}}>—</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <Nav/>
          </div>
        )}

        <InlineCaption
          icon={phase<=1?"🏘️":phase<=2?"✨":"📝"}
          text={phase===0?"Pagina Proprietà — tocca + per aggiungere":phase===1?"Clicca sul pulsante + viola":phase<=2?"Modal creazione proprietà aperta":"Compila i 6 step per creare la proprietà"}
          color={phase>=2?"#8B5CF6":"#0284c7"}
          visible={vis && phase<4}
        />
      </div>
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

        <InlineCaption
          icon={phase<=2?"🏠":phase<=4?"📍":phase<=5?"🏢":"➡️"}
          text={phase<=1?"Inserisci il nome della struttura":phase<=2?"Nome compilato":phase<=3?"Indirizzo: inizia a digitare...":phase<=4?"Coordinate GPS rilevate":phase<=5?"Piano e citofono compilati":"Tutti i campi completati"}
          color={phase>=4?"#10B981":"#6366F1"}
          visible={vis && !showComplete}
        />
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

        <CompletionOverlay visible={showComplete} message="Step 2 Completato!" />

        <InlineCaption
          icon={phase<=4?"👥":"🚿"}
          text={phase===0?"Imposta il numero massimo di ospiti":phase<=3?"Ospiti massimi: "+({1:2,2:3,3:4}[phase]||4):phase<=6?"Imposta il numero di bagni":"Capacità configurata"}
          color={phase>=5?"#10B981":"#8B5CF6"}
          visible={vis && !showComplete}
        />
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
  // 0=idle, 1-2=checkout, 3-4=checkin, 5=info box, 6=cursor on Avanti, 7=click, 8=overlay
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,2000,4000,6000,8000,9500,10500,11500,12300];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },15500);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const coRef = useRef(null);
  const ciRef = useRef(null);
  const avantiRef3 = useRef(null);

  const activeRef = phase<=2?coRef:phase<=4?ciRef:phase>=6?avantiRef3:null;
  const clicking = phase===7;

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      <SmartCursor targetRef={activeRef} clicking={clicking} visible={vis && phase>=1 && phase<8} />

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-2.5 text-white">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold">Nuova Proprietà</h2>
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M18 6L6 18M6 6L18 18"/></svg></div>
          </div>
          <div className="flex gap-1">{[0,1,2,3,4,5].map(i=><div key={i} className={`flex-1 h-1 rounded-full ${i<=2?'bg-emerald-400':'bg-white/20'}`}/>)}</div>
          <p className="text-[9px] text-white/60 mt-1">Step 3 di 6 · Orari</p>
        </div>

        <div className="p-3 space-y-2">
          <div className="text-center mb-0">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center mx-auto mb-1">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <h3 className="text-xs font-bold text-slate-800">Orari</h3>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className={`rounded-xl p-3 border-2 transition-all ${phase>=1&&phase<=2?"border-rose-400 bg-rose-50 shadow-sm":"border-rose-100 bg-rose-50"}`}>
              <label className="block text-[10px] font-semibold text-rose-700 mb-1.5">Check-out</label>
              <div ref={coRef} className={`w-full px-2 py-2 bg-white border-2 rounded-lg text-lg font-bold text-center transition-all ${phase>=1&&phase<=2?"border-rose-400":"border-rose-200"}`}>
                10:00
              </div>
              {phase>=2&&<p className="text-[8px] text-rose-600 font-bold text-center mt-1" style={{animation:'fadeIn 0.3s'}}>= Inizio pulizia 🧹</p>}
            </div>

            <div className={`rounded-xl p-3 border-2 transition-all ${phase>=3&&phase<=4?"border-emerald-400 bg-emerald-50 shadow-sm":"border-emerald-100 bg-emerald-50"}`}>
              <label className="block text-[10px] font-semibold text-emerald-700 mb-1.5">Check-in</label>
              <div ref={ciRef} className={`w-full px-2 py-2 bg-white border-2 rounded-lg text-lg font-bold text-center transition-all ${phase>=3&&phase<=4?"border-emerald-400":"border-emerald-200"}`}>
                15:00
              </div>
              {phase>=4&&<p className="text-[8px] text-emerald-600 font-bold text-center mt-1" style={{animation:'fadeIn 0.3s'}}>= Limite completamento</p>}
            </div>
          </div>

          {phase>=5&&(
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2.5 text-[10px] text-indigo-700" style={{animation:'fadeIn 0.3s'}}>
              <b>Finestra pulizia: 5 ore</b> (10:00→15:00). La pulizia deve essere completata prima del check-in.
            </div>
          )}
        </div>

        <CompletionOverlay visible={phase >= 8} message="Step 3 Completato!" />

        <InlineCaption
          icon={phase<=2?"🚪":phase<=4?"🔑":phase<=5?"📋":"➡️"}
          text={phase===0?"Imposta orari check-out e check-in":phase<=2?"Check-out ore 10:00":phase<=4?"Check-in ore 15:00":phase<=5?"Finestra pulizia: 5 ore":phase<=6?"Clicca Avanti per proseguire":"Step completato!"}
          color={phase>=5?"#10B981":"#EF4444"}
          visible={vis && phase < 8}
        />
        <div className="px-4 pb-3 flex gap-2">
          <button className="flex-1 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-500">Indietro</button>
          <button ref={avantiRef3}
            className={`flex-1 py-2 rounded-xl text-xs font-bold text-white transition-all ${phase>=7?"bg-emerald-500 scale-95":"bg-gradient-to-r from-blue-500 to-blue-600"}`}>
            {phase>=7?"✓ Salvato":"Avanti →"}
          </button>
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
    0  = vuoto, nessuna stanza
    1  = cursore su "Aggiungi Stanza"
    2  = click → dropdown aperto
    3  = cursore su "Camera Matrimoniale" nel dropdown
    4  = click → Camera Matr aggiunta, espansa
    5  = cursore sul + Matrimoniale
    6  = click + → Matrimoniale count=1, 2 posti
    7  = card si chiude, cursore torna su "Aggiungi Stanza"
    8  = click → dropdown aperto di nuovo
    9  = cursore su "Camera Singola"
    10 = click → Camera Singola aggiunta, espansa
    11 = cursore sul + Singolo
    12 = click + → Singolo count=1, totale 3 posti ✓
    13 = cursore su Avanti
    14 = click → done
    15 = overlay
  */
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1200,2200,3200,4200,5200,6200,7400,8400,9400,10400,11400,12400,13600,14600,15400];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },19000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const aggiungiRef = useRef(null);
  const camMatrRef = useRef(null);
  const camSingRef = useRef(null);
  const plusMatrRef = useRef(null);
  const plusSingRef = useRef(null);
  const avantiBtnRef4 = useRef(null);

  const showDropdown = phase===2||phase===3||phase===8||phase===9;
  const rooms = [];
  if(phase>=4) rooms.push({
    n:"Camera Matrimoniale", cap:phase>=6?2:0, matCount:phase>=6?1:0,
    expanded:phase>=4 && phase<7
  });
  if(phase>=10) rooms.push({
    n:"Camera Singola", cap:phase>=12?1:0, singCount:phase>=12?1:0,
    expanded:phase>=10 && phase<13
  });
  const totalCap = rooms.reduce((s,r)=>s+(r.cap||0),0);
  const enough = totalCap>=2;

  const activeRef =
    phase===1||phase===7 ? aggiungiRef :
    phase===3 ? camMatrRef :
    phase===5 ? plusMatrRef :
    phase===9 ? camSingRef :
    phase===11 ? plusSingRef :
    phase>=13 ? avantiBtnRef4 :
    aggiungiRef;
  const clicking = phase===2||phase===4||phase===6||phase===8||phase===10||phase===12||phase===14;

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      <SmartCursor targetRef={activeRef} clicking={clicking} visible={vis && phase>=1 && phase<15} />

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-2.5 text-white">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold">Nuova Proprietà</h2>
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M18 6L6 18M6 6L18 18"/></svg></div>
          </div>
          <div className="flex gap-1">{[0,1,2,3,4,5].map(i=><div key={i} className={`flex-1 h-1 rounded-full ${i<=3?'bg-emerald-400':'bg-white/20'}`}/>)}</div>
          <p className="text-[9px] text-white/60 mt-1">Step 4 di 6 · Stanze e Letti</p>
        </div>
        <div className="p-3 space-y-2">
          {/* Header posti */}
          <div className={`rounded-xl p-3 text-white transition-all ${enough?"bg-gradient-to-r from-violet-500 to-purple-600":"bg-gradient-to-r from-amber-500 to-orange-500"}`}>
            <div className="flex items-center justify-between">
              <div><p className="font-bold text-[11px]">Stanze e Letti</p><p className="text-[8px] text-white/80">Configura la struttura</p></div>
              <div className="text-right"><p className="text-2xl font-bold">{totalCap}</p><p className="text-[8px] text-white/80">posti letto</p></div>
            </div>
            <p className="text-[8px] text-white/90 mt-1 pt-1 border-t border-white/20">
              {enough?"✓ Sufficiente per 2 ospiti":"⚠️ Servono almeno 2 posti letto"}
            </p>
          </div>

          {/* Stanze aggiunte */}
          {rooms.map((r,i)=>(
            <div key={i} className="rounded-xl border border-slate-200 overflow-hidden bg-white" style={{animation:'fadeIn 0.3s'}}>
              <div className="p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5" className="w-3.5 h-3.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9H21M9 21V9"/></svg>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-[10px]">{r.n}</p>
                    <p className="text-[8px] text-slate-400">{r.cap>0?`🛏️ ${r.cap} posti`:"Nessun letto"}</p>
                  </div>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" className={`w-3.5 h-3.5 transition-transform ${r.expanded?"rotate-180":""}`}><path d="M6 9L12 15L18 9"/></svg>
              </div>
              {r.expanded&&(
                <div className="px-2.5 pb-2 border-t border-slate-100 bg-slate-50/50 space-y-1.5 pt-1.5" style={{animation:'fadeIn 0.2s'}}>
                  {[
                    {tipo:"Matrimoniale",cap:"2p",count:r.matCount||0,refEl:i===0?plusMatrRef:null},
                    {tipo:"Singolo",cap:"1p",count:r.singCount||0,refEl:i===1?plusSingRef:null},
                  ].map((b,j)=>(
                    <div key={j} className={`flex items-center justify-between p-2 rounded-lg ${b.count>0?"bg-violet-50 border border-violet-200":"bg-white border border-slate-100"}`}>
                      <div><p className={`text-[9px] font-semibold ${b.count>0?"text-violet-800":"text-slate-600"}`}>🛏️ {b.tipo}</p><p className="text-[7px] text-slate-400">{b.cap}</p></div>
                      <div className="flex items-center gap-1">
                        <div className="w-6 h-6 rounded border border-slate-200 bg-white flex items-center justify-center text-[8px] text-slate-400">−</div>
                        <span className="w-4 text-center font-bold text-[10px] text-slate-800">{b.count}</span>
                        <div ref={b.refEl} className="w-6 h-6 rounded bg-violet-600 flex items-center justify-center text-[8px] text-white cursor-pointer">+</div>
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
              <button ref={aggiungiRef} className="w-full py-2.5 border-2 border-dashed border-violet-300 rounded-xl text-violet-600 font-semibold flex items-center justify-center gap-1.5 text-[10px]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M12 5V19M5 12H19"/></svg>
                Aggiungi Stanza
              </button>
            ):(
              <div className="bg-violet-50 rounded-xl p-2.5 border border-violet-200" style={{animation:'fadeIn 0.2s'}}>
                <p className="text-[8px] font-bold text-violet-700 mb-2">Seleziona tipo stanza:</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    {n:"Camera Matrimoniale",ref:camMatrRef,hi:phase===3},
                    {n:"Camera Singola",ref:camSingRef,hi:phase===9},
                    {n:"Camera Doppia",ref:null,hi:false},
                    {n:"Soggiorno",ref:null,hi:false},
                  ].map((item,j)=>(
                    <button key={j} ref={item.ref}
                      className={`px-2 py-2 border rounded-lg text-[9px] font-medium text-center transition-all
                        ${item.hi?"bg-violet-500 text-white border-violet-500 shadow":"bg-white border-violet-200 text-violet-700"}`}>
                      {item.n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <CompletionOverlay visible={phase >= 15} message="Step 4 Completato!" />

        <InlineCaption
          icon={phase<=2?"➕":phase<=4?"🏠":phase<=6?"🛏️":phase<=8?"➕":phase<=10?"🏠":phase<=12?"🛏️":"✅"}
          text={phase===0?"Aggiungi le stanze della proprietà":phase<=1?"Clicca su Aggiungi Stanza":phase<=3?"Seleziona Camera Matrimoniale":phase<=5?"Clicca + per aggiungere un letto Matrimoniale":phase<=6?"Matrimoniale aggiunto — 2 posti":phase<=7?"Clicca di nuovo Aggiungi Stanza":phase<=9?"Seleziona Camera Singola":phase<=11?"Clicca + per aggiungere un letto Singolo":phase<=12?"Singolo aggiunto — totale 3 posti ✓":phase<=13?"Clicca Avanti per proseguire":"Struttura configurata!"}
          color={enough?"#10B981":"#F59E0B"}
          visible={vis && phase < 15}
        />
        <div className="px-4 pb-3 flex gap-2">
          <button className="flex-1 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-500">Indietro</button>
          <button ref={avantiBtnRef4}
            className={`flex-1 py-2 rounded-xl text-xs font-bold text-white transition-all ${phase>=14?"bg-emerald-500":enough?"bg-gradient-to-r from-blue-500 to-blue-600":"bg-slate-300"}`}>
            {phase>=14?"✓ Salvato":"Avanti →"}
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
    VALORI REALI DAL GESTIONALE:
    - Matrimoniale: 3 lenzuola matrimoniali + 2 federe
    - Singolo: 3 lenzuola singole + 1 federa

    FLUSSO ANIMAZIONE:
    0  = Pagina completa: "Nostra Ditta" selezionato, tab "2" ospiti,
         Matrimoniale espanso con: Lenz.Matr: 3, Federe: 2
    1  = Cursore su "Propria" — mostra alternativa
    2  = Click → Propria selezionata (box giallo)
    3  = Cursore torna su "Nostra Ditta"
    4  = Click → Nostra Ditta di nuovo
    5  = Cursore su - del Lenz.Matr per mostrare editabilità
    6  = Click → Lenz.Matr da 3 a 2 (mostra che si può ridurre)
    7  = Cursore su + del Lenz.Matr
    8  = Click → Lenz.Matr torna a 3 (ripristinato)
    9  = Cursore su tab "3" ospiti
    10 = Click → tab 3: Matr + Singolo. Singolo appare con 3 lenz.sing + 1 federa
    11 = Cursore su + federa del Singolo
    12 = Click → federa singolo da 1 a 2 (personalizzato)
    13 = Pausa — mostra riepilogo completo
    14 = Overlay completamento
  */
  useEffect(() => {
    if (!vis) { setPhase(0); return; }
    const seq = [0,0,1800,3200,4400,5600,6800,8000,9200,10400,11800,13200,14600,16000,17400,18200];
    const timers = seq.map((t,i)=>setTimeout(()=>setPhase(i),t));
    const loop = setInterval(()=>{ setPhase(0); seq.forEach((t,i)=>{ timers.push(setTimeout(()=>setPhase(i),t)); }); },22000);
    return ()=>{ timers.forEach(clearTimeout); clearInterval(loop); };
  },[vis]);

  const ownLinenRef = useRef(null);
  const nostraRef = useRef(null);
  const minusLenzRef = useRef(null);
  const plusLenzRef = useRef(null);
  const tab3Ref = useRef(null);
  const plusFederaSingRef = useRef(null);

  const usePropria = phase>=2 && phase<4;
  const tab = phase>=10 ? 3 : 2;
  const lenzMatr = phase>=6 && phase<8 ? 2 : 3; // default 3, ridotto a 2, poi torna 3
  const showSingolo = phase>=10;
  const federaSing = phase>=12 ? 2 : 1;

  const activeRef =
    phase===1 ? ownLinenRef :
    phase===3 ? nostraRef :
    phase===5 ? minusLenzRef :
    phase===7 ? plusLenzRef :
    phase===9 ? tab3Ref :
    phase===11 ? plusFederaSingRef :
    null;
  const clicking = phase===2||phase===4||phase===6||phase===8||phase===10||phase===12;

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block',width:'100%'}}>
      {vis && activeRef && phase<14 && <SmartCursor targetRef={activeRef} clicking={clicking} visible={true} />}

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full max-w-sm mx-auto border border-slate-100">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-2 text-white">
          <div className="flex items-center justify-between mb-1.5">
            <h2 className="text-[11px] font-bold">Nuova Proprietà</h2>
            <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-2.5 h-2.5"><path d="M18 6L6 18M6 6L18 18"/></svg></div>
          </div>
          <div className="flex gap-0.5">{[0,1,2,3,4,5].map(i=><div key={i} className={`flex-1 h-1 rounded-full ${i<=4?'bg-emerald-400':'bg-white/20'}`}/>)}</div>
          <p className="text-[8px] text-white/60 mt-0.5">Step 5 di 6 · Dotazioni Biancheria</p>
        </div>

        <div className="p-2.5 space-y-1.5">
          {/* 1. Chi fornisce la biancheria */}
          <div className={`rounded-lg p-2 border-2 transition-all ${usePropria ? 'border-amber-300 bg-amber-50' : 'border-sky-300 bg-sky-50'}`}>
            <p className="text-[8px] font-bold text-slate-800 mb-1.5">Chi fornisce la biancheria?</p>
            <div className="grid grid-cols-2 gap-1.5">
              <div ref={nostraRef} className={`p-1.5 rounded-md border-2 text-center transition-all ${!usePropria ? 'border-sky-500 bg-white shadow-sm' : 'border-slate-200 bg-white/50'}`}>
                <span className="text-xs block">🧺</span>
                <p className="text-[7px] font-bold text-slate-800">Nostra Ditta</p>
              </div>
              <div ref={ownLinenRef} className={`p-1.5 rounded-md border-2 text-center transition-all ${usePropria ? 'border-amber-500 bg-white shadow-sm' : 'border-slate-200 bg-white/50'}`}>
                <span className="text-xs block">🏠</span>
                <p className="text-[7px] font-bold text-slate-800">Propria</p>
              </div>
            </div>
          </div>

          {/* 2. Tab ospiti */}
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg p-2 text-white">
            <div className="flex items-center justify-between mb-1">
              <div><p className="font-bold text-[9px]">Dotazioni per Ospiti</p><p className="text-[6px] text-white/70">Pre-calcolati · modificabili</p></div>
              <p className="text-xs font-bold">€{showSingolo?"22.50":"14.00"}</p>
            </div>
            <div className="flex gap-1">
              {[1,2,3,4].map(n=>(
                <button key={n} ref={n===3?tab3Ref:null}
                  className={`flex-1 py-1 rounded text-[8px] font-bold transition-all ${n===tab?"bg-white text-indigo-600 shadow":"bg-white/20 text-white"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Biancheria Letto — SEMPRE VISIBILE */}
          <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
            <div className="px-2 py-1.5 flex items-center justify-between border-b border-slate-100">
              <span className="text-[8px] font-bold text-slate-800">🛏️ Biancheria Letto</span>
              <span className="text-[8px] font-bold text-blue-600">€{showSingolo?"22.50":"14.00"}</span>
            </div>

            {/* === MATRIMONIALE — sempre espanso === */}
            <div className="border-b border-blue-100">
              <div className="px-2 py-1 flex items-center gap-1.5 bg-blue-50/30">
                <div className="w-3 h-3 rounded border-2 bg-blue-600 border-blue-600 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-2 h-2"><path d="M5 13L9 17L19 7"/></svg>
                </div>
                <p className="text-[8px] font-bold text-blue-800 flex-1">Matrimoniale <span className="font-normal text-slate-400">· Camera Matr. · 2p</span></p>
              </div>
              <div className="px-2 py-1 bg-blue-50/20 space-y-0.5">
                {/* Lenz. Matrimoniale — default 3 */}
                <div className="flex items-center justify-between bg-white rounded p-1 border border-blue-100">
                  <span className="text-[7px] text-slate-700">Lenz. Matrimoniale <span className="text-blue-500 font-bold">€2.50</span></span>
                  <div className="flex items-center gap-0.5">
                    <div ref={minusLenzRef} className="w-4 h-4 rounded border border-slate-300 bg-white flex items-center justify-center text-[7px] text-slate-500 cursor-pointer">−</div>
                    <span className={`w-4 text-center text-[9px] font-bold ${lenzMatr<3?"text-amber-600":"text-slate-800"}`}>{lenzMatr}</span>
                    <div ref={plusLenzRef} className="w-4 h-4 rounded bg-slate-800 flex items-center justify-center text-[7px] text-white cursor-pointer">+</div>
                  </div>
                </div>
                {/* Federe — default 2 */}
                <div className="flex items-center justify-between bg-white rounded p-1 border border-blue-100">
                  <span className="text-[7px] text-slate-700">Federe <span className="text-blue-500 font-bold">€1.00</span></span>
                  <div className="flex items-center gap-0.5">
                    <div className="w-4 h-4 rounded border border-slate-300 bg-white flex items-center justify-center text-[7px] text-slate-500">−</div>
                    <span className="w-4 text-center text-[9px] font-bold text-slate-800">2</span>
                    <div className="w-4 h-4 rounded bg-slate-800 flex items-center justify-center text-[7px] text-white">+</div>
                  </div>
                </div>
                {/* Info default */}
                {phase>=6 && phase<8 && (
                  <p className="text-[6px] text-amber-600 font-bold px-1 py-0.5 bg-amber-50 rounded" style={{animation:'fadeIn 0.2s'}}>
                    ⚠️ Ridotto a 2 — il minimo consigliato è 3 per letto matrimoniale
                  </p>
                )}
                {phase>=8 && phase<10 && (
                  <p className="text-[6px] text-emerald-600 font-bold px-1 py-0.5 bg-emerald-50 rounded" style={{animation:'fadeIn 0.2s'}}>
                    ✓ Ripristinato a 3 — default consigliato
                  </p>
                )}
              </div>
            </div>

            {/* === SINGOLO — appare per 3 ospiti === */}
            {showSingolo && (
              <div className="border-b border-blue-100" style={{animation:'fadeIn 0.3s'}}>
                <div className="px-2 py-1 flex items-center gap-1.5 bg-blue-50/30">
                  <div className="w-3 h-3 rounded border-2 bg-blue-600 border-blue-600 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-2 h-2"><path d="M5 13L9 17L19 7"/></svg>
                  </div>
                  <p className="text-[8px] font-bold text-blue-800 flex-1">Singolo <span className="font-normal text-slate-400">· Camera Sing. · 1p</span></p>
                </div>
                <div className="px-2 py-1 bg-blue-50/20 space-y-0.5">
                  {/* Lenz. Singolo — default 3 */}
                  <div className="flex items-center justify-between bg-white rounded p-1 border border-blue-100">
                    <span className="text-[7px] text-slate-700">Lenz. Singolo <span className="text-blue-500 font-bold">€2.00</span></span>
                    <div className="flex items-center gap-0.5">
                      <div className="w-4 h-4 rounded border border-slate-300 bg-white flex items-center justify-center text-[7px] text-slate-500">−</div>
                      <span className="w-4 text-center text-[9px] font-bold text-slate-800">3</span>
                      <div className="w-4 h-4 rounded bg-slate-800 flex items-center justify-center text-[7px] text-white">+</div>
                    </div>
                  </div>
                  {/* Federa — default 1, editabile */}
                  <div className="flex items-center justify-between bg-white rounded p-1 border border-blue-100">
                    <span className="text-[7px] text-slate-700">Federa <span className="text-blue-500 font-bold">€1.00</span></span>
                    <div className="flex items-center gap-0.5">
                      <div className="w-4 h-4 rounded border border-slate-300 bg-white flex items-center justify-center text-[7px] text-slate-500">−</div>
                      <span className={`w-4 text-center text-[9px] font-bold ${federaSing>1?"text-blue-600":"text-slate-800"}`}>{federaSing}</span>
                      <div ref={plusFederaSingRef} className="w-4 h-4 rounded bg-slate-800 flex items-center justify-center text-[7px] text-white cursor-pointer">+</div>
                    </div>
                  </div>
                  {phase>=12 && (
                    <p className="text-[6px] text-blue-600 font-bold px-1 py-0.5 bg-blue-50 rounded" style={{animation:'fadeIn 0.2s'}}>
                      ✏️ Federa personalizzata: 1 → 2 per il letto singolo
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Divano letto — non selezionato */}
            <div className="px-2 py-1 flex items-center gap-1.5 opacity-35">
              <div className="w-3 h-3 rounded border-2 border-slate-300 flex-shrink-0"></div>
              <p className="text-[8px] text-slate-500">Divano Letto · Soggiorno · 2p</p>
            </div>
          </div>

          {/* Riepilogo */}
          {phase>=10 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2" style={{animation:'fadeIn 0.3s'}}>
              <p className="text-[7px] font-bold text-emerald-800 mb-1">📦 Riepilogo per {tab} ospiti:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[7px] text-emerald-700">
                <span>Lenz. Matrimoniali: <b>{lenzMatr}</b></span>
                <span>Federe Matr: <b>2</b></span>
                <span>Lenz. Singole: <b>3</b></span>
                <span>Federe Sing: <b>{federaSing}</b></span>
              </div>
            </div>
          )}
        </div>

        <CompletionOverlay visible={phase >= 14} message="Step 5 Completato!" />

        <InlineCaption
          icon={phase<=1?"🧺":phase<=2?"🏠":phase<=4?"🧺":phase<=6?"➖":phase<=8?"➕":phase<=10?"3️⃣":phase<=12?"✏️":"✅"}
          text={phase===0?"Nostra Ditta selezionata · Matr: 3 lenz + 2 federe":phase===1?"Alternativa: usa la tua biancheria":phase<=3?"Propria = nessun ordine automatico":phase<=4?"Torna a Nostra Ditta":phase<=5?"Prova a ridurre: clicca −":phase===6?"Lenzuola da 3 → 2 (modifica!)":phase<=7?"Clicca + per ripristinare":phase===8?"Ripristinato a 3 — il default":phase<=9?"Cambia a 3 ospiti":phase===10?"Tab 3: Singolo aggiunto (3 lenz + 1 fed)":phase<=11?"Personalizza federa singolo":phase===12?"Federa singolo: 1 → 2":"Config completa per tutti gli ospiti!"}
          color={phase>=10?"#10B981":"#3B82F6"}
          visible={vis && phase < 14}
        />
        <div className="px-3 pb-2 flex gap-1.5">
          <button className="flex-1 py-1.5 border border-slate-200 rounded-lg text-[10px] font-semibold text-slate-500">Indietro</button>
          <button className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold text-white ${phase>=10?"bg-gradient-to-r from-blue-500 to-blue-600":"bg-slate-300"}`}>Avanti →</button>
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

        <InlineCaption
          icon={phase<=1?"📸":phase===2?"⏳":phase<=3?"🖼️":phase<=4?"✅":"🎉"}
          text={phase===0?"Tocca l'area per caricare una foto":phase===1?"Clicca per aprire la galleria":phase===2?"Caricamento in corso...":phase===3?"Foto caricata con successo!":phase===4?"Clicca Crea Proprietà per completare":done?"Proprietà inviata — attesa approvazione":""}
          color={phase>=3?"#10B981":"#EC4899"}
          visible={vis && phase < 6}
        />
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
      <InlineCaption icon={step<=1?"🧹":step<=3?"🏠":step<=5?"📅":step<=7?"🧺":step<=8?"➡️":step<=11?"👥":done?"🎉":"📦"}
        text={step===0?"Tipo Pulizia già selezionato":step<=2?"Clicca su Proprietà e scegli dal menu":step===3?"Appartamento Colosseo selezionato":step<=5?"Seleziona la data della pulizia":step<=7?"Attiva il toggle Includi Biancheria":step===8?"Clicca Avanti per Step 2":step<=10?"Seleziona il numero di ospiti":step===11?"3 ospiti → biancheria calcolata automaticamente":done?"Pulizia creata con successo!":"Conferma e crea la pulizia"}
        color={done?"#10B981":step>=9?"#6366F1":"#10B981"} visible={vis && step < 14} />
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
      <InlineCaption icon={step<=2?"🧺":step<=4?"🏠":step<=6?"📅":step<=7?"➡️":step<=9?"📦":step<=11?"🛏️":done?"🎉":"✅"}
        text={step===0?"Scegli il tipo di richiesta":step<=2?"Seleziona Solo Biancheria":step<=4?"Scegli la proprietà dal menu":step<=6?"Seleziona la data di consegna":step<=7?"Clicca Avanti per Step 2":step<=9?"Biancheria calcolata per la proprietà":step<=11?"Preparazione Letti: €5/letto + €10 consegna":done?"Ordine biancheria creato!":"Conferma e crea l'ordine"}
        color={done?"#10B981":"#10B981"} visible={vis && step < 14} />
    </div>
  );
}


function ScreenIcal() {
  const [ref, vis] = useVis(0.1);
  const [step, setStep] = useState(0);
  // 0=idle,1=cursor su Booking field,2=typing url,3=typed,4=cursor Oktorate,5=typing ok,6=typed ok,7=cursor btn,8=click,9=saved
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

      <InlineCaption
        icon={step===0?"📋":step<=1?"👆":step<=2?"📝":step<=4?"➕":step<=5?"✅":done?"🎉":"📋"}
        text={step===0?"Lista pulizie del giorno":step<=1?"Tocca il bottone viola ospiti per modificare":step<=2?"Modal ospiti aperta al centro":step<=4?"Clicca + per aumentare a 3 adulti":step<=5?"Clicca Conferma per salvare":done?"Ospiti aggiornati — biancheria ricalcolata":"Lista aggiornata"}
        color={done?"#10B981":"#7C3AED"}
        visible={vis && !showComplete}
      />
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
    0  = Pagina proprietà con card scura + bottone "Firma ora" arancione
    1  = cursore su "Firma ora"
    2  = click → modal Allegato D si apre (fedele al vero)
         Header: icona doc + "Allegato D – Scheda Servizio" + nome proprietà
         Steps: 1.Leggi ● 2.Firma
         Price banner verde: €45,00
         Scroll indicator giallo "Scorri fino in fondo"
         Testo contratto
    3  = scroll contratto → indicator diventa verde "Documento letto"
    4  = click "Procedi alla Firma" → passa a step firma
         Riepilogo: proprietà + prezzo grande
         2 checkbox + campi nome/CF + firma
    5  = checkbox 1 spuntata
    6  = checkbox 2 spuntata (prezzo €45,00)
    7  = firma disegnata
    8  = click "Firma e Attiva"
    9  = successo — proprietà attiva
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

  const activeRef = phase===1?firmaBtnRef:phase===3?procediRef:phase>=8&&phase<9?confirmRef:null;
  const clicking = phase===2||phase===4||phase===5||phase===6||phase===8;

  return (
    <div ref={ref} style={{position:"relative"}}>
      {vis && activeRef && phase<10 && <SmartCursor targetRef={activeRef} clicking={clicking} visible={true} />}
      <CompletionOverlay visible={phase>=10} message="Allegato D Firmato!" />
      <AppScreen>
        <div style={{position:"relative",height:"100%"}}>
          {!showModal ? (
            /* === PAGINA PROPRIETÀ con card scura === */
            <div style={{padding:10}}>
              <div style={{background:"linear-gradient(145deg,#1c1917,#292524)",borderRadius:14,overflow:"hidden"}}>
                {/* Foto proprietà */}
                <div style={{height:55,background:"linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a78bfa 100%)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" style={{width:22,height:22}}><path d="m3 9 9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  {/* Badge notifica */}
                  <div style={{position:"absolute",top:4,right:4,width:8,height:8,borderRadius:"50%",background:"#ef4444",border:"2px solid #1c1917"}}/>
                </div>
                {/* Nome + indirizzo */}
                <div style={{padding:"8px 12px"}}>
                  <p style={{fontSize:13,fontWeight:800,color:"#fafaf9",margin:0,letterSpacing:"-0.2px"}}>Appartamento Colosseo</p>
                  <div style={{display:"flex",alignItems:"center",gap:3,marginTop:4}}>
                    <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:8,fontWeight:600,color:"#a8a29e",background:"rgba(255,255,255,0.08)",padding:"3px 8px",borderRadius:6}}>
                      <svg style={{width:7,height:7}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/></svg>
                      Via del Corso 100, Roma
                    </span>
                  </div>
                </div>
                {/* Separatore */}
                <div style={{margin:"0 12px",height:1,background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)"}}/>
                {/* Stato + bottone Firma */}
                <div style={{padding:"10px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div>
                    <p style={{fontSize:7,fontWeight:700,color:"#78716c",textTransform:"uppercase",letterSpacing:0.5,margin:0}}>Stato</p>
                    <p style={{fontSize:10,fontWeight:700,color:"#fbbf24",display:"flex",alignItems:"center",gap:3,margin:"2px 0 0"}}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:"#fbbf24",animation:"ringPulse 1.5s infinite"}}/>
                      Firma il contratto per iniziare
                    </p>
                  </div>
                  <button ref={firmaBtnRef} style={{
                    display:"flex",alignItems:"center",gap:4,padding:"7px 14px",
                    fontSize:10,fontWeight:800,color:"white",borderRadius:9,border:"none",
                    background:"linear-gradient(135deg,#f59e0b,#d97706)",
                    boxShadow:"0 4px 16px rgba(245,158,11,0.4)",letterSpacing:"-0.2px"
                  }}>
                    <svg style={{width:11,height:11}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    Firma ora
                  </button>
                </div>
              </div>
            </div>
          ) : !showSign ? (
            /* === MODAL ALLEGATO D — STEP 1: LEGGI === */
            <div style={{display:"flex",flexDirection:"column",height:"100%",animation:"fadeIn 0.3s"}}>
              {/* Header fedele */}
              <div style={{padding:"8px 12px",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:"#e0f2fe",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <svg style={{width:14,height:14,color:"#0284c7"}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                </div>
                <div style={{flex:1}}>
                  <p style={{fontSize:11,fontWeight:700,color:"#1e293b",margin:0}}>Allegato D – Scheda Servizio</p>
                  <p style={{fontSize:8,color:"#94a3b8",margin:0}}>Appartamento Colosseo</p>
                </div>
              </div>
              {/* Steps indicator */}
              <div style={{padding:"6px 12px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                <div style={{display:"flex",alignItems:"center",gap:3}}>
                  <div style={{width:18,height:18,borderRadius:"50%",background:"#0ea5e9",color:"white",fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>1</div>
                  <span style={{fontSize:9,fontWeight:600,color:"#0ea5e9"}}>Leggi</span>
                </div>
                <div style={{width:16,height:2,background:"#cbd5e1",borderRadius:1}}/>
                <div style={{display:"flex",alignItems:"center",gap:3}}>
                  <div style={{width:18,height:18,borderRadius:"50%",background:"#cbd5e1",color:"#64748b",fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>2</div>
                  <span style={{fontSize:9,fontWeight:600,color:"#94a3b8"}}>Firma</span>
                </div>
              </div>
              {/* Price banner verde */}
              <div style={{padding:"6px 12px",background:"#ecfdf5",borderBottom:"1px solid #a7f3d0",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
                <span style={{fontSize:9,color:"#047857",fontWeight:500}}>Prezzo pulizia contrattuale:</span>
                <span style={{fontSize:14,fontWeight:800,color:"#065f46"}}>€ 45,00</span>
              </div>
              {/* Scroll indicator */}
              <div style={{padding:"4px 12px",borderBottom:"1px solid #e2e8f0",flexShrink:0}}>
                <p style={{fontSize:8,color:scrolled?"#16a34a":"#d97706",display:"flex",alignItems:"center",gap:3,margin:0,fontWeight:500}}>
                  {scrolled ? (
                    <><svg style={{width:10,height:10}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg> Documento letto — Puoi procedere</>
                  ) : (
                    <><svg style={{width:10,height:10}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg> Scorri fino in fondo per procedere</>
                  )}
                </p>
              </div>
              {/* Testo contratto */}
              <div style={{flex:1,padding:"6px 10px",fontSize:7,color:"#475569",lineHeight:1.6,overflow:"hidden"}}>
                <p style={{margin:"0 0 4px",fontWeight:700,fontSize:8}}>ALLEGATO D — SCHEDA SERVIZIO</p>
                <p style={{margin:"0 0 3px"}}><b>Proprietà:</b> Appartamento Colosseo — Via del Corso 100, Roma</p>
                <p style={{margin:"0 0 3px"}}><b>Prezzo concordato:</b> €45,00 per intervento di pulizia standard</p>
                <p style={{margin:"0 0 3px"}}><b>Servizi inclusi:</b> pulizia completa, sanificazione bagni, cambio biancheria, rifacimento letti, prodotti cortesia.</p>
                <p style={{margin:"0 0 3px"}}><b>Pagamento:</b> fatturazione mensile posticipata entro il 10 del mese successivo.</p>
              </div>
              {/* Bottone Procedi */}
              <div style={{padding:"6px 12px",borderTop:"1px solid #e2e8f0",flexShrink:0}}>
                <button ref={procediRef} style={{
                  width:"100%",padding:"8px 0",borderRadius:10,border:"none",fontSize:10,fontWeight:600,
                  color:scrolled?"white":"#94a3b8",
                  background:scrolled?"#0ea5e9":"#e2e8f0",
                  transition:"all 0.3s"
                }}>Procedi alla Firma</button>
              </div>
            </div>
          ) : (
            /* === MODAL ALLEGATO D — STEP 2: FIRMA === */
            <div style={{display:"flex",flexDirection:"column",height:"100%",animation:"fadeIn 0.3s"}}>
              {/* Header */}
              <div style={{padding:"8px 12px",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:"#e0f2fe",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <svg style={{width:14,height:14,color:"#0284c7"}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                </div>
                <div style={{flex:1}}>
                  <p style={{fontSize:11,fontWeight:700,color:"#1e293b",margin:0}}>Allegato D – Scheda Servizio</p>
                  <p style={{fontSize:8,color:"#94a3b8",margin:0}}>Appartamento Colosseo</p>
                </div>
              </div>
              {/* Steps - step 2 attivo */}
              <div style={{padding:"6px 12px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                <div style={{display:"flex",alignItems:"center",gap:3}}>
                  <div style={{width:18,height:18,borderRadius:"50%",background:"#10b981",color:"white",fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>✓</div>
                  <span style={{fontSize:9,fontWeight:600,color:"#10b981"}}>Leggi</span>
                </div>
                <div style={{width:16,height:2,background:"#cbd5e1",borderRadius:1}}/>
                <div style={{display:"flex",alignItems:"center",gap:3}}>
                  <div style={{width:18,height:18,borderRadius:"50%",background:"#0ea5e9",color:"white",fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>2</div>
                  <span style={{fontSize:9,fontWeight:600,color:"#0ea5e9"}}>Firma</span>
                </div>
              </div>
              {/* Body firma */}
              <div style={{flex:1,padding:"8px 10px",overflow:"hidden"}}>
                {/* Riepilogo proprietà + prezzo */}
                <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"6px 10px",marginBottom:6,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div>
                    <span style={{fontSize:8,color:"#64748b"}}>Proprietà: </span>
                    <span style={{fontSize:9,fontWeight:700,color:"#1e293b"}}>Appartamento Colosseo</span>
                    <p style={{fontSize:7,color:"#94a3b8",margin:"1px 0 0"}}>Via del Corso 100, Roma</p>
                  </div>
                  <span style={{fontSize:13,fontWeight:800,color:"#047857"}}>€ 45,00</span>
                </div>
                {/* Checkboxes */}
                <div style={{display:"flex",flexDirection:"column",gap:3,marginBottom:6}}>
                  <label style={{display:"flex",alignItems:"flex-start",gap:5,padding:"5px 8px",borderRadius:8,border:phase>=5?"2px solid #22c55e":"2px solid #e2e8f0",background:phase>=5?"#f0fdf4":"white",cursor:"pointer",transition:"all 0.3s"}}>
                    <div style={{width:14,height:14,borderRadius:3,border:phase>=5?"none":"2px solid #cbd5e1",background:phase>=5?"#22c55e":"white",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                      {phase>=5&&<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" style={{width:9,height:9}}><path d="M5 13L9 17L19 7"/></svg>}
                    </div>
                    <span style={{fontSize:8,color:"#334155",lineHeight:1.4}}>Dichiaro di aver letto e accetto <b>integralmente</b> le condizioni dell'Allegato D</span>
                  </label>
                  <label style={{display:"flex",alignItems:"flex-start",gap:5,padding:"5px 8px",borderRadius:8,border:phase>=6?"2px solid #22c55e":"2px solid #e2e8f0",background:phase>=6?"#f0fdf4":"white",cursor:"pointer",transition:"all 0.3s"}}>
                    <div style={{width:14,height:14,borderRadius:3,border:phase>=6?"none":"2px solid #cbd5e1",background:phase>=6?"#22c55e":"white",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                      {phase>=6&&<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" style={{width:9,height:9}}><path d="M5 13L9 17L19 7"/></svg>}
                    </div>
                    <span style={{fontSize:8,color:"#334155",lineHeight:1.4}}>Accetto il prezzo di <b>€ 45,00</b> per la proprietà <b>Appartamento Colosseo</b></span>
                  </label>
                </div>
                {/* Nome e CF */}
                <div style={{display:"flex",gap:4,marginBottom:5}}>
                  <div style={{flex:1}}>
                    <p style={{fontSize:7,fontWeight:600,color:"#475569",margin:"0 0 2px"}}>Nome e Cognome *</p>
                    <div style={{border:"1px solid #e2e8f0",borderRadius:6,padding:"4px 6px",fontSize:8,color:"#1e293b",background:"#f8fafc"}}>Mario Rossi</div>
                  </div>
                  <div style={{flex:1}}>
                    <p style={{fontSize:7,fontWeight:600,color:"#475569",margin:"0 0 2px"}}>Codice Fiscale *</p>
                    <div style={{border:"1px solid #e2e8f0",borderRadius:6,padding:"4px 6px",fontSize:7,color:"#1e293b",background:"#f8fafc",fontFamily:"monospace"}}>RSSMRA80A01H501Z</div>
                  </div>
                </div>
                {/* Firma */}
                <div>
                  <p style={{fontSize:7,fontWeight:600,color:"#475569",margin:"0 0 2px"}}>Firma Digitale *</p>
                  <div style={{border:phase>=7?"1.5px solid #8b5cf6":"1.5px dashed #cbd5e1",borderRadius:8,height:30,display:"flex",alignItems:"center",justifyContent:"center",background:phase>=7?"#f5f3ff":"white"}}>
                    {phase>=7 ? (
                      <svg width="90" height="18" viewBox="0 0 160 36"><path d="M8,26 Q22,6 42,20 Q62,34 82,12 Q102,0 128,20 Q142,30 154,16" stroke="#6366F1" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
                    ) : (
                      <span style={{fontSize:7,color:"#94a3b8"}}>✒ Tocca per firmare</span>
                    )}
                  </div>
                </div>
              </div>
              {/* Bottone */}
              <div style={{padding:"6px 10px",borderTop:"1px solid #e2e8f0",flexShrink:0}}>
                <button ref={confirmRef} style={{
                  width:"100%",padding:"8px 0",borderRadius:10,border:"none",fontSize:10,fontWeight:700,color:"white",
                  background:phase>=9?"#10b981":phase>=7?"linear-gradient(135deg,#0ea5e9,#0284c7)":"#e2e8f0",
                  transition:"all 0.3s"
                }}>
                  {phase>=9?"✓ Contratto Firmato — Proprietà Attiva!":"Firma e Attiva Proprietà →"}
                </button>
              </div>
            </div>
          )}
        </div>
      </AppScreen>
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
      <InlineCaption
        icon={phase<=1?"📅":phase<=3?"⚙️":phase<=5?"📋":phase<=7?"🔗":phase<=9?"📋":"✅"}
        text={phase===0?"Airbnb → Calendario → seleziona annuncio":phase<=1?"Clicca sull'annuncio":phase<=2?"Calendario con prenotazioni":phase<=3?"Clicca ⚙️ Impostazioni":phase<=4?"Impostazioni → tab Prezzi":phase===5?"Clicca tab Disponibilità":phase<=6?"Scorri a Collega i calendari":phase<=7?"Clicca Esegui il collegamento":phase<=8?"Pagina link iCal Airbnb":phase<=9?"Clicca Copia":phase===10?"Link copiato! Incollalo nel gestionale":""}
        color={phase>=10?"#10B981":"#FF385C"} visible={vis && phase<11} />
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
          borderRadius:16, overflow:"hidden", background:"#f8fafc",
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
        <DemoPhone fixedH={440}>
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
        <DemoPhone fixedH={660}>
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
          <DemoPhone fixedH={460}>
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
          <DemoPhone fixedH={520}>
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
          <DemoPhone fixedH={510}>
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
          <DemoPhone fixedH={540}>
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
          <DemoPhone fixedH={740}>
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
          <DemoPhone fixedH={750}>
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
          <DemoPhone fixedH={440}>
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
          <DemoPhone fixedH={440}>
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

        {/* Guide animate: come trovare iCal su Airbnb e Booking */}
        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#FF5A5F",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>GUIDA · Come trovare il link iCal su Airbnb</span>
          </div>
          <DemoPhone fixedH={520}>
            <ScreenIcalAirbnb />
          </DemoPhone>
        </FadeUp>

        <FadeUp className="mb-6">
          <div style={{textAlign:"center",marginBottom:16}}>
            <span style={{background:"#003580",color:"white",fontSize:11,fontWeight:800,padding:"6px 16px",borderRadius:20}}>GUIDA · Come trovare il link iCal su Booking.com</span>
          </div>
          <DemoPhone fixedH={480}>
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

