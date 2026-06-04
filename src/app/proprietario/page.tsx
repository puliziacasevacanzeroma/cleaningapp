"use client";

import { useAuth } from "~/lib/firebase/AuthContext";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useOwnerDebts } from "~/hooks/useOwnerDebts";
import { useOwnerRealtimePayments } from "~/hooks/useOwnerRealtimePayments";
import { useOwnerMonthlyTrend } from "~/hooks/useOwnerMonthlyTrend";
import { buildDashboardViewModel, type IconKey, type CatVM } from "~/lib/proprietario/dashboardViewModel";

// ─────────────────────────── formatters ───────────────────────────
const fmtN = (n: number) => Math.round(n).toLocaleString("it-IT");
const fmtEur = (n: number) => (Math.abs(n % 1) < 0.005 ? `€${fmtN(n)}` : `€${n.toFixed(2).replace(".", ",")}`);
const fmtK = (n: number) => (n >= 1000 ? `€${(n / 1000).toFixed(1).replace(".0", "")}k` : `€${Math.round(n)}`);

// ─────────────────────────── inline icons ───────────────────────────
const PATHS: Record<IconKey, string> = {
  down: '<path d="M7 17l5-5 5 5"/>',
  up: '<path d="M7 7l5 5 5-5"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  check: '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
};
function Ico({ k, cls }: { k: IconKey; cls?: string }) {
  return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: PATHS[k] }} />;
}

// ═══════════════════════════ DONUT ═══════════════════════════
function CategoryDonut({ cats, total, monthLabel }: { cats: CatVM[]; total: number; monthLabel: string }) {
  const [drawn, setDrawn] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  useEffect(() => { const t = requestAnimationFrame(() => setDrawn(true)); return () => cancelAnimationFrame(t); }, []);
  const sum = cats.reduce((s, c) => s + c.value, 0) || 1;
  let off = 25;
  const segs = cats.map((c) => { const pct = (c.value / sum) * 100; const s = { c, pct, off }; off -= pct; return s; });
  const cur = active != null ? cats[active] : null;
  return (
    <div className="pd-donutwrap">
      <div className="pd-donut">
        <svg width="140" height="140" viewBox="0 0 42 42">
          <circle cx="21" cy="21" r="15.915" fill="none" stroke="#eef2f7" strokeWidth="4" />
          {segs.map((s, i) => (
            <circle key={i} cx="21" cy="21" r="15.915" fill="none" stroke={s.c.color}
              strokeWidth={active === i ? 5.4 : active == null ? 4.2 : 3.4}
              strokeLinecap="round"
              strokeDasharray={drawn ? `${Math.max(0, s.pct - 1.2)} ${100 - Math.max(0, s.pct - 1.2)}` : "0 100"}
              strokeDashoffset={s.off}
              style={{ opacity: active == null || active === i ? 1 : 0.32, transition: "stroke-dasharray 1.1s cubic-bezier(.22,1,.36,1),stroke-width .2s,opacity .2s", cursor: "pointer" }}
              onPointerEnter={() => { if (pinned == null) setActive(i); }}
              onPointerLeave={() => { if (pinned == null) setActive(null); }}
              onClick={() => { const n = pinned === i ? null : i; setPinned(n); setActive(n); }}
            />
          ))}
        </svg>
        <div className="pd-donutctr">
          <b style={{ color: cur ? cur.color : "var(--pd-ink)" }}>{fmtEur(cur ? cur.value : total)}</b>
          <small>{cur ? `${cur.name} · ${Math.round((cur.value / sum) * 100)}%` : "totale mese"}</small>
        </div>
      </div>
      <div className="pd-legend">
        {cats.map((c, i) => (
          <div key={i} className={`pd-lg${active === i ? " on" : ""}`}
            onPointerEnter={() => { if (pinned == null) setActive(i); }}
            onPointerLeave={() => { if (pinned == null) setActive(null); }}
            onClick={() => { const n = pinned === i ? null : i; setPinned(n); setActive(n); }}>
            <span className="pd-sw" style={{ background: c.color }} />
            <span className="pd-nm">{c.name}<small>{c.count} {c.count === 1 ? "servizio" : "servizi"}</small></span>
            <span className="pd-vl">{fmtEur(c.value)}</span>
            <span className="pd-pc">{Math.round((c.value / sum) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════ AREA (spend trend) ═══════════════════════════
function SpendArea({ trend }: { trend: { label: string; total: number; month: number; year: number }[] }) {
  const [period, setPeriod] = useState(6);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(320);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const lineRef = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 320));
    ro.observe(el); setWidth(el.clientWidth || 320);
    return () => ro.disconnect();
  }, []);

  const data = trend.slice(-period);
  const H = 148, padL = 32, padR = 12, padT = 14, padB = 22;
  const W = Math.max(240, width);
  const geom = useMemo(() => {
    const n = data.length || 1;
    const vals = data.map((d) => d.total);
    const max = Math.max(1, ...vals);
    const niceMax = Math.ceil((max * 1.12) / 100) * 100 || 100;
    const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    const X = (i: number) => padL + (n === 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
    const Y = (v: number) => padT + (1 - v / niceMax) * (H - padT - padB);
    const pts = data.map((d, i) => ({ x: X(i), y: Y(d.total), ...d }));
    let d = pts.length ? `M${pts[0].x} ${pts[0].y}` : "";
    for (let i = 0; i < pts.length - 1; i++) { const c = (pts[i].x + pts[i + 1].x) / 2; d += ` C${c} ${pts[i].y} ${c} ${pts[i + 1].y} ${pts[i + 1].x} ${pts[i + 1].y}`; }
    const areaD = pts.length ? `${d} L${pts[pts.length - 1].x} ${H - padB} L${pts[0].x} ${H - padB} Z` : "";
    return { pts, d, areaD, niceMax, avgY: Y(avg), grid: [niceMax, niceMax / 2, 0].map((g) => ({ v: g, y: Y(g) })) };
  }, [data, W]);

  // line draw-in animation
  useEffect(() => {
    const p = lineRef.current; if (!p) return;
    const len = p.getTotalLength(); p.style.transition = "none"; p.style.strokeDasharray = String(len); p.style.strokeDashoffset = String(len);
    // reflow
    void p.getBoundingClientRect();
    p.style.transition = "stroke-dashoffset 1.3s cubic-bezier(.22,1,.36,1)"; p.style.strokeDashoffset = "0";
  }, [geom]);

  const onMove = useCallback((clientX: number) => {
    const el = wrapRef.current; if (!el || !geom.pts.length) return;
    const rect = el.getBoundingClientRect(); const x = clientX - rect.left;
    let best = 0, bd = 1e9; geom.pts.forEach((p, i) => { const dd = Math.abs(p.x - x); if (dd < bd) { bd = dd; best = i; } });
    setHover(best);
  }, [geom]);

  const hp = hover != null ? geom.pts[hover] : null;
  const prevVal = hover != null && hover > 0 ? geom.pts[hover - 1].total : null;
  const dl = prevVal != null && prevVal > 0 ? Math.round(((geom.pts[hover!].total - prevVal) / prevVal) * 100) : null;

  return (
    <div className="pd-card">
      <div className="pd-ch">
        <div><div className="pd-ct">Andamento spesa</div><div className="pd-cs">Trascina sul grafico</div></div>
        <div className="pd-mseg">{[3, 6, 12].map((p) => (
          <button key={p} className={p === period ? "on" : ""} onClick={() => { setPeriod(p); setHover(null); }}>{p}M</button>
        ))}</div>
      </div>
      <div className="pd-areawrap" ref={wrapRef}
        onPointerMove={(e) => onMove(e.clientX)} onPointerDown={(e) => onMove(e.clientX)} onPointerLeave={() => setHover(null)}
        style={{ position: "relative", width: "100%", height: H, touchAction: "pan-y" }}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
          <defs>
            <linearGradient id="pd-ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6366f1" stopOpacity=".28" /><stop offset="1" stopColor="#6366f1" stopOpacity="0" /></linearGradient>
            <linearGradient id="pd-ls" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#6366f1" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient>
            <filter id="pd-gl" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="3" /></filter>
          </defs>
          {geom.grid.map((g, i) => (<g key={i}><line x1={padL} y1={g.y} x2={W - padR} y2={g.y} stroke="#eef2f7" strokeWidth="1" /><text x={padL - 6} y={g.y + 3} textAnchor="end" fontSize="8.5" fontWeight="700" fill="#94a3b8">{fmtK(g.v)}</text></g>))}
          <line x1={padL} y1={geom.avgY} x2={W - padR} y2={geom.avgY} stroke="#06b6d4" strokeOpacity=".55" strokeWidth="1.3" strokeDasharray="4 4" />
          {hp && <line x1={hp.x} y1={padT} x2={hp.x} y2={H - padB} stroke="#6366f1" strokeOpacity=".3" strokeWidth="1" strokeDasharray="3 3" />}
          <path d={geom.areaD} fill="url(#pd-ag)" />
          <path d={geom.d} fill="none" stroke="url(#pd-ls)" strokeWidth="5" strokeOpacity=".22" filter="url(#pd-gl)" strokeLinecap="round" />
          <path ref={lineRef} d={geom.d} fill="none" stroke="url(#pd-ls)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          {geom.pts.map((p, i) => (<circle key={i} cx={p.x} cy={p.y} r={i === geom.pts.length - 1 ? 4.5 : 2.6} fill="#fff" stroke={i === geom.pts.length - 1 ? "#4f46e5" : "#818cf8"} strokeWidth={i === geom.pts.length - 1 ? 3 : 2} />))}
          {hp && <circle cx={hp.x} cy={hp.y} r="5" fill="#4f46e5" stroke="#fff" strokeWidth="2.5" />}
          {geom.pts.map((p, i) => (<text key={i} x={p.x} y={H - 6} textAnchor="middle" fontSize="8.5" fontWeight={i === geom.pts.length - 1 ? 800 : 700} fill={i === geom.pts.length - 1 ? "#4f46e5" : "#94a3b8"}>{p.label}</text>))}
        </svg>
        {hp && (
          <div className="pd-tip" style={{ left: hp.x, top: hp.y }}>
            {hp.label} {hp.year}<b>{fmtEur(hp.total)}</b>
            {dl != null && <span className="pd-dl" style={{ background: dl > 0 ? "rgba(248,113,133,.25)" : "rgba(52,211,153,.25)", color: dl > 0 ? "#fca5a5" : "#6ee7b7" }}>{dl > 0 ? "▲ +" : "▼ "}{dl}% vs mese prec.</span>}
          </div>
        )}
      </div>
      <div className="pd-legmini">
        <i><b style={{ background: "#6366f1" }} />Spesa totale</i>
        <i><b style={{ background: "#06b6d4" }} />Media periodo</i>
      </div>
    </div>
  );
}

// ═══════════════════════════ MAIN ═══════════════════════════
export default function ProprietarioDashboard() {
  const { user } = useAuth();
  const now = useMemo(() => new Date(), []);
  const curMonth = now.getMonth() + 1, curYear = now.getFullYear();
  const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
  const prevYear = curMonth === 1 ? curYear - 1 : curYear;

  const balance = useOwnerDebts(user?.id);
  const cur = useOwnerRealtimePayments(user?.id, curMonth, curYear);
  const trendHook = useOwnerMonthlyTrend(user?.id, 12);
  // Totale del mese precedente: preso dal trend (gratis) → niente secondo hook pagamenti.
  const prevTotal = useMemo(() => {
    const pt = trendHook.trend.find(t => t.month === prevMonth && t.year === prevYear);
    return pt ? pt.total : 0;
  }, [trendHook.trend, prevMonth, prevYear]);

  const firstName = user?.name?.split(" ")[0] || "Utente";

  const vm = useMemo(() => buildDashboardViewModel({
    now, firstName,
    activeCount: cur.stats?.propertyCount ?? trendHook.activeCount,
    pendingCount: trendHook.pendingCount,
    cur: cur.stats, prevTotal, summary: cur.summary,
    debts: balance.debts, totalDebt: balance.totalDebt, creditoTotale: balance.creditoTotale,
    countScaduti: balance.countScaduti, countWarning: balance.countWarning, countDaPagare: balance.countDaPagare,
    trend: trendHook.trend,
  }), [now, firstName, cur.stats, prevTotal, cur.summary, balance.debts, balance.totalDebt, balance.creditoTotale, balance.countScaduti, balance.countWarning, balance.countDaPagare, trendHook.trend, trendHook.activeCount, trendHook.pendingCount]);

  // hero slider
  const [slide, setSlide] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startAuto = useCallback(() => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = setInterval(() => setSlide((p) => (p + 1) % 2), 5200); }, []);
  useEffect(() => { startAuto(); return () => { if (timerRef.current) clearInterval(timerRef.current); }; }, [startAuto]);
  const touchX = useRef(0), touchD = useRef(0);

  // mount-anim trigger for bars/rings
  const [anim, setAnim] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setAnim(true)); return () => cancelAnimationFrame(t); }, []);

  const dataReady = !!cur.stats || !cur.loading;
  if (!dataReady) {
    return (
      <div className="pdash"><Style />
        <div style={{ padding: 16 }}>
          <div className="pd-skel" style={{ height: 250, borderRadius: 0, marginInline: -16, marginTop: -16 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 18 }}>{[0, 1, 2].map((i) => <div key={i} className="pd-skel" style={{ height: 92, borderRadius: 18 }} />)}</div>
          <div className="pd-skel" style={{ height: 200, borderRadius: 22, marginTop: 14 }} />
        </div>
      </div>
    );
  }

  const p = vm.payments;
  const payColor = p.state === "danger" ? "#f87171" : p.state === "warning" ? "#fcd34d" : p.state === "ok" ? "#34d399" : "#a5b4fc";
  const payState = p.state === "ok" ? "Pagamenti in regola" : p.state === "danger" ? "Situazione critica" : p.state === "warning" ? "Pagamento in scadenza" : "Situazione pagamenti";

  return (
    <div className="pdash"><Style />

      {/* ───── HERO ───── */}
      <div className="pd-hero">
        <div className="pd-aurora" /><div className="pd-grain" /><div className="pd-fade" />
        <div className="pd-heroin">
          <div className="pd-greetrow">
            <div>
              <div className="pd-greet">{vm.greeting}, <b>{firstName}</b></div>
              <div className="pd-greetsub">{vm.activeCount} {vm.activeCount === 1 ? "proprietà attiva" : "proprietà attive"} · {vm.monthLabel}</div>
            </div>
            <div className="pd-live"><span>Live</span><span className="pd-dot" /></div>
          </div>

          <div className="pd-slider"
            onTouchStart={(e) => { touchX.current = e.touches[0].clientX; if (timerRef.current) clearInterval(timerRef.current); }}
            onTouchMove={(e) => { touchD.current = e.touches[0].clientX - touchX.current; }}
            onTouchEnd={() => { if (Math.abs(touchD.current) > 45) { if (touchD.current < 0 && slide < 1) setSlide(1); else if (touchD.current > 0 && slide > 0) setSlide(0); } touchD.current = 0; startAuto(); }}>
            <div className="pd-track" style={{ transform: `translateX(-${slide * 100}%)` }}>
              {/* slide 1 — pagamenti */}
              <div className="pd-slide"><div className={`pd-gcard${p.state === "danger" ? " danger" : p.state === "warning" ? " amber" : ""}`}>
                <div className="pd-tag" style={{ color: payColor }}><Ico k={p.state === "ok" ? "check" : p.state === "danger" || p.state === "warning" ? "alert" : "clock"} /> {payState}</div>
                <div className={`pd-big${p.netDebt > 0 ? " shine" : ""}`}>{p.netDebt > 0 ? <>€{fmtN(p.netDebt)}</> : <span style={{ color: "#34d399" }}>€0<span className="pd-c">,00</span></span>}</div>
                {p.state === "ok" ? (
                  <div className="pd-statusrow"><div className="pd-chip" style={{ background: "rgba(16,185,129,.18)", color: "#6ee7b7" }}><span className="pd-d" style={{ background: "#10b981" }} />Tutto saldato</div></div>
                ) : (
                  <>
                    <div className="pd-statusrow">
                      <div className="pd-chip" style={{ background: `${payColor}33`, color: payColor }}><span className="pd-d" style={{ background: payColor }} />
                        {p.counts.scaduti > 0 ? `${p.counts.scaduti} ${p.counts.scaduti === 1 ? "mese scaduto" : "mesi scaduti"}` : p.counts.warning > 0 ? `${p.counts.warning} in scadenza` : `${p.counts.daPagare} da pagare`}
                      </div>
                      {p.nearest && <div className="pd-scad">Scade <b>{p.nearest.scadenza.toLocaleDateString("it-IT", { day: "numeric", month: "short" })}</b></div>}
                    </div>
                    <div className="pd-bar"><i style={{ width: anim ? `${Math.max(4, p.paidPct)}%` : 0, background: p.state === "danger" ? "linear-gradient(90deg,#ef4444,#f87171)" : p.state === "warning" ? "linear-gradient(90deg,#f59e0b,#fcd34d)" : "linear-gradient(90deg,#6366f1,#818cf8)" }} /></div>
                    <div className="pd-barlabel"><span>Pagato {p.paidPct}%</span><span>Resta €{fmtN(p.remaining)}</span></div>
                  </>
                )}
              </div></div>
              {/* slide 2 — spesa */}
              <div className="pd-slide"><div className="pd-gcard">
                <div className="pd-tag" style={{ color: "#a5b4fc" }}><Ico k="up" /> Spesa del mese</div>
                <div className="pd-big">€{fmtN(vm.spend.total)}</div>
                {vm.spend.deltaDir !== 0 && (
                  <div className={`pd-delta ${vm.spend.deltaDir < 0 ? "down" : "up"}`}><Ico k={vm.spend.deltaDir < 0 ? "down" : "up"} />{Math.abs(vm.spend.deltaPct)}% vs {vm.spend.prevMonthName}</div>
                )}
                <Spark values={vm.spark} />
              </div></div>
            </div>
          </div>
          <div className="pd-dots">{[0, 1].map((i) => <button key={i} className={slide === i ? "on" : ""} onClick={() => { setSlide(i); startAuto(); }} />)}</div>
        </div>
      </div>

      {/* ───── BODY ───── */}
      <div className="pd-body">
        <div className="pd-seclabel">Panoramica</div>

        {/* countdown / in regola */}
        {vm.countdown ? (
          <div className="pd-card">
            <div className="pd-ch"><div><div className="pd-ct">Prossima scadenza</div><div className="pd-cs">Da saldare per primo</div></div>
              <span className="pd-pill">{vm.countdown.days < 0 ? `scaduto` : `${vm.countdown.days} giorni`}</span></div>
            <div className="pd-countdown">
              <div className="pd-ring">
                <svg width="98" height="98" viewBox="0 0 98 98" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="49" cy="49" r="42" fill="none" stroke="#eef2f7" strokeWidth="7" />
                  <circle cx="49" cy="49" r="42" fill="none" stroke={vm.countdown.days < 0 ? "url(#pd-cdR)" : "url(#pd-cd)"} strokeWidth="7" strokeLinecap="round" strokeDasharray="263.9"
                    strokeDashoffset={anim ? 263.9 - 263.9 * (vm.countdown.days < 0 ? 1 : Math.max(0.04, Math.min(1, (30 - vm.countdown.days) / 30))) : 263.9}
                    style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(.22,1,.36,1)" }} />
                  <defs>
                    <linearGradient id="pd-cd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6366f1" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient>
                    <linearGradient id="pd-cdR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ef4444" /><stop offset="1" stopColor="#f97316" /></linearGradient>
                  </defs>
                </svg>
                <div className="pd-rnum"><b>{Math.abs(vm.countdown.days)}</b><small>{vm.countdown.days < 0 ? "gg fa" : "giorni"}</small></div>
              </div>
              <div className="pd-cdinfo">
                <div className="pd-lbl">Importo dovuto</div>
                <div className="pd-amt">{fmtEur(vm.countdown.saldo)}</div>
                <div className="pd-date"><Ico k="clock" />{vm.countdown.dueLabel}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="pd-card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="pd-okic"><Ico k="check" /></div>
            <div><div className="pd-ct">Pagamenti in regola</div><div className="pd-cs">Nessuna scadenza in sospeso. Continua così.</div></div>
          </div>
        )}

        {/* KPI */}
        <div className="pd-kpis">
          <div className="pd-kpi"><div className="pd-kic" style={{ background: "#eef2ff", color: "#6366f1" }}><Ico k="home" /></div>
            <div className="pd-v">{vm.activeCount}</div><div className="pd-l">{vm.activeCount === 1 ? "Proprietà attiva" : "Proprietà attive"}</div>
            {vm.pendingCount > 0 && <span className="pd-tr" style={{ background: "#fffbeb", color: "#d97706" }}>+{vm.pendingCount} in attesa</span>}</div>
          <div className="pd-kpi"><div className="pd-kic" style={{ background: "#ecfeff", color: "#06b6d4" }}><Ico k="check" /></div>
            <div className="pd-v">{vm.kpis.servicesCount}</div><div className="pd-l">Servizi nel mese</div></div>
          <div className="pd-kpi"><div className="pd-kic" style={{ background: "#fef3c7", color: "#d97706" }}><Ico k="card" /></div>
            <div className="pd-v">{fmtEur(vm.kpis.avgCost)}</div><div className="pd-l">Costo medio servizio</div></div>
        </div>

        {/* categorie */}
        {vm.cats.length > 0 && (
          <>
            <div className="pd-seclabel">Analisi spesa</div>
            <div className="pd-card">
              <div className="pd-ch"><div><div className="pd-ct">Spesa per categoria</div><div className="pd-cs">{vm.monthLabel} · tocca una voce</div></div></div>
              <CategoryDonut cats={vm.cats} total={vm.monthBilled} monthLabel={vm.monthLabel} />
            </div>
          </>
        )}

        {/* andamento */}
        <SpendArea trend={vm.trend} />

        {/* ultimi servizi */}
        {vm.recent.length > 0 && (
          <>
            <div className="pd-seclabel">Attività</div>
            <div className="pd-card">
              <div className="pd-ch"><div><div className="pd-ct">Ultimi servizi</div><div className="pd-cs">Attività recente</div></div></div>
              {vm.recent.map((r, i) => (
                <div className="pd-rs" key={i}>
                  <div className="pd-rsic" style={{ background: `color-mix(in srgb,${r.color} 12%,#fff)`, color: r.color }}><Ico k="check" /></div>
                  <div className="pd-rsmid"><div className="pd-rst1">{r.typeLabel}</div><div className="pd-rst2">{r.property} · {r.dateLabel}</div></div>
                  <div className="pd-rspr">{fmtEur(r.price)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* spesa per proprietà (solo multi) */}
        {vm.properties.length > 1 && (
          <div className="pd-card">
            <div className="pd-ch"><div><div className="pd-ct">Spesa per proprietà</div><div className="pd-cs">{vm.monthLabel}</div></div></div>
            {vm.properties.map((pr, i) => (
              <div className="pd-prop" key={pr.id}>
                <div className="pd-avw">
                  {pr.image ? <img className="pd-av" src={pr.image} alt="" style={{ objectFit: "cover" }} /> : <div className="pd-av" style={{ background: pr.grad }}>{(pr.name || "?")[0]}</div>}
                  <div className="pd-rank">{pr.rank}</div>
                </div>
                <div className="pd-propmid"><div className="pd-pn">{pr.name}</div><div className="pd-ps">{pr.cleanings} pulizie · {pr.orders} consegne</div>
                  <div className="pd-track2"><i style={{ width: anim ? `${pr.pct}%` : 0, background: pr.grad }} /></div></div>
                <div className="pd-pright"><b>{fmtEur(pr.total)}</b><small>{pr.pct}%</small></div>
              </div>
            ))}
          </div>
        )}

        {/* metodi pagamento */}
        {vm.paySplit.length > 0 && (
          <div className="pd-card">
            <div className="pd-ch"><div><div className="pd-ct">Come hai pagato</div><div className="pd-cs">{vm.monthLabel}</div></div></div>
            <div className="pd-paybar">{vm.paySplit.map((s, i) => <i key={i} title={`${s.name}: ${fmtEur(s.eur)}`} style={{ width: anim ? `${s.pct}%` : 0, background: s.color }} />)}</div>
            <div className="pd-payleg">{vm.paySplit.map((s, i) => (
              <div className="pd-payit" key={i}><div className="pd-paytop"><span className="pd-d" style={{ background: s.color }} />{s.name}</div><div className="pd-payvv">{s.pct}%</div><div className="pd-payee">{fmtEur(s.eur)}</div></div>
            ))}</div>
          </div>
        )}

        {/* insights */}
        {vm.insights.length > 0 && (
          <>
            <div className="pd-seclabel">In sintesi</div>
            <div>{vm.insights.map((o, i) => (
              <div className="pd-ins" key={i} style={{ ["--pd-accent" as any]: o.accent }}>
                <div className="pd-insic" style={{ background: o.bg, color: o.accent }}><Ico k={o.icon} /></div>
                <div className="pd-instx"><b>{o.lead}</b><span>{o.rest}</span></div>
              </div>
            ))}</div>
          </>
        )}

        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

// ─────────────────── small bits ───────────────────
function Spark({ values }: { values: number[] }) {
  if (!values.length) return <div className="pd-spark" />;
  const max = Math.max(...values), min = Math.min(...values), W = 300, H = 38, n = values.length;
  const xy = values.map((v, i) => [i / (n - 1 || 1) * W, H - ((v - min) / (max - min || 1)) * (H - 8) - 4]);
  const d = xy.map((pp, i) => (i ? "L" : "M") + pp[0].toFixed(1) + " " + pp[1].toFixed(1)).join(" ");
  return (
    <svg className="pd-spark" viewBox="0 0 300 38" preserveAspectRatio="none">
      <defs><linearGradient id="pd-sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#818cf8" stopOpacity=".4" /><stop offset="1" stopColor="#818cf8" stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="url(#pd-sg)" />
      <path d={d} fill="none" stroke="#c7d2fe" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xy[n - 1][0]} cy={xy[n - 1][1]} r="3" fill="#fff" />
    </svg>
  );
}

// ─────────────────── scoped styles ───────────────────
function Style() {
  return <style>{`
.pdash{--pd-ink:#0f172a;--pd-muted:#64748b;--pd-muted2:#94a3b8;--pd-line:rgba(15,23,42,.055);--pd-bg:#f1f5f9;font-variant-numeric:tabular-nums;color:var(--pd-ink);min-height:100%;background:var(--pd-bg)}
.pdash *{box-sizing:border-box}
.pd-skel{background:linear-gradient(90deg,#eef1f5,#e2e8f0,#eef1f5);background-size:200% 100%;animation:pdsh 1.4s infinite}
@keyframes pdsh{0%{background-position:200% 0}100%{background-position:-200% 0}}
.pd-hero{position:relative;overflow:hidden;background:#0b0b18;padding:18px 17px 46px}
.pd-aurora{position:absolute;inset:-90% -90% auto -90%;height:340%;pointer-events:none;background:radial-gradient(ellipse 400px 300px at 15% 45%,rgba(99,102,241,.45),transparent 70%),radial-gradient(ellipse 350px 250px at 80% 30%,rgba(139,92,246,.32),transparent 70%),radial-gradient(ellipse 280px 200px at 52% 84%,rgba(59,130,246,.24),transparent 72%);animation:pdaur 17s ease-in-out infinite}
@keyframes pdaur{0%,100%{transform:translate(0,0)}33%{transform:translate(3%,-2%)}66%{transform:translate(-2%,2%)}}
.pd-grain{position:absolute;inset:0;opacity:.4;mix-blend-mode:overlay;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E")}
.pd-fade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,11,24,.1),rgba(11,11,24,.6))}
.pd-heroin{position:relative;z-index:2}
.pd-greetrow{display:flex;align-items:flex-start;justify-content:space-between}
.pd-greet{font-weight:700;font-size:18px;letter-spacing:-.3px;color:#fff}
.pd-greet b{font-weight:800;background:linear-gradient(135deg,#c7d2fe,#a5b4fc);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.pd-greetsub{font-size:10.5px;color:rgba(255,255,255,.55);margin-top:3px;font-weight:600}
.pd-live{display:flex;align-items:center;gap:5px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);padding:5px 9px;border-radius:20px}
.pd-dot{width:6px;height:6px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981;animation:pdblink 2s infinite}
@keyframes pdblink{0%,100%{opacity:1}50%{opacity:.35}}
.pd-live span{font-size:8.5px;letter-spacing:1.4px;text-transform:uppercase;color:rgba(255,255,255,.7);font-weight:800}
.pd-slider{margin-top:16px;overflow:hidden;border-radius:20px}
.pd-track{display:flex;transition:transform .6s cubic-bezier(.22,1,.36,1)}
.pd-slide{min-width:100%}
.pd-gcard{position:relative;border-radius:20px;padding:18px;backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.14);overflow:hidden;background:linear-gradient(150deg,rgba(255,255,255,.1),rgba(255,255,255,.02));min-height:156px;display:flex;flex-direction:column;box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 16px 40px -20px rgba(0,0,0,.6)}
.pd-gcard.amber{background:linear-gradient(150deg,rgba(245,158,11,.16),rgba(245,158,11,.03));border-color:rgba(245,158,11,.24)}
.pd-gcard.danger{background:linear-gradient(150deg,rgba(239,68,68,.16),rgba(239,68,68,.03));border-color:rgba(239,68,68,.26)}
.pd-tag{display:flex;align-items:center;gap:6px;font-size:9px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase}
.pd-tag svg{width:12px;height:12px}
.pd-big{position:relative;font-weight:800;font-size:42px;line-height:1;letter-spacing:-1.6px;margin-top:11px;color:#fff;display:inline-block}
.pd-big .pd-c{font-size:18px;color:rgba(255,255,255,.45);font-weight:700}
.pd-big.shine::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 32%,rgba(255,255,255,.6) 48%,transparent 60%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:pdshine 3.6s ease-in-out infinite}
@keyframes pdshine{0%{background-position:180% 0}55%,100%{background-position:-80% 0}}
.pd-delta{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:800;border-radius:7px;padding:3px 8px;margin-top:11px}
.pd-delta svg{width:11px;height:11px}
.pd-delta.down{background:rgba(16,185,129,.18);color:#34d399}.pd-delta.up{background:rgba(239,68,68,.18);color:#f87171}
.pd-spark{margin-top:auto;width:100%;height:38px}
.pd-statusrow{display:flex;align-items:center;justify-content:space-between;margin-top:12px}
.pd-chip{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:800;border-radius:8px;padding:5px 10px}
.pd-d{width:6px;height:6px;border-radius:50%}
.pd-scad{font-size:10px;color:rgba(255,255,255,.6);font-weight:700}.pd-scad b{color:#fff}
.pd-bar{position:relative;width:100%;height:7px;border-radius:5px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:auto}
.pd-bar i{display:block;height:100%;border-radius:5px;transition:width 1.3s cubic-bezier(.22,1,.36,1)}
.pd-barlabel{display:flex;justify-content:space-between;font-size:9px;font-weight:800;color:rgba(255,255,255,.55);margin-top:8px;text-transform:uppercase;letter-spacing:.5px}
.pd-dots{display:flex;justify-content:center;gap:6px;margin-top:14px}
.pd-dots button{height:6px;width:6px;border:0;border-radius:3px;background:rgba(255,255,255,.28);cursor:pointer;padding:0;transition:.4s}
.pd-dots button.on{width:22px;background:#fff}
.pd-body{position:relative;z-index:3;margin-top:-26px;border-radius:28px 28px 0 0;padding:22px 16px 30px;display:flex;flex-direction:column;gap:14px;background:var(--pd-bg);box-shadow:0 -12px 30px -12px rgba(0,0,0,.35)}
.pd-seclabel{font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--pd-muted2);padding:2px 4px 0}
.pd-card{position:relative;background:#fff;border:1px solid var(--pd-line);border-radius:22px;padding:17px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 14px 28px -18px rgba(15,23,42,.22),0 4px 10px -6px rgba(15,23,42,.1)}
.pd-ch{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px}
.pd-ct{font-weight:800;font-size:15px;letter-spacing:-.3px}
.pd-cs{font-size:10.5px;color:var(--pd-muted);margin-top:2px;font-weight:600}
.pd-pill{font-size:9.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6366f1;background:#eef2ff;border:1px solid rgba(99,102,241,.16);padding:4px 9px;border-radius:20px}
.pd-mseg{display:inline-flex;background:#f1f5f9;border-radius:9px;padding:2px}
.pd-mseg button{border:0;background:transparent;font-weight:800;font-size:10px;color:var(--pd-muted);padding:4px 9px;border-radius:7px;cursor:pointer;transition:.2s}
.pd-mseg button.on{background:#fff;color:#4f46e5;box-shadow:0 1px 2px rgba(15,23,42,.06)}
.pd-okic{width:46px;height:46px;border-radius:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#ecfdf5;color:#10b981}.pd-okic svg{width:22px;height:22px}
.pd-countdown{display:flex;align-items:center;gap:18px}
.pd-ring{position:relative;width:98px;height:98px;flex-shrink:0}
.pd-rnum{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.pd-rnum b{font-size:31px;font-weight:800;line-height:1}
.pd-rnum small{font-size:8.5px;color:var(--pd-muted);letter-spacing:1px;text-transform:uppercase;margin-top:2px;font-weight:800}
.pd-cdinfo .pd-lbl{font-size:10px;color:var(--pd-muted);font-weight:800;text-transform:uppercase;letter-spacing:1px}
.pd-amt{font-size:29px;font-weight:800;letter-spacing:-1px;margin-top:3px}
.pd-date{font-size:11.5px;color:#4f46e5;margin-top:6px;font-weight:800;display:flex;align-items:center;gap:6px}.pd-date svg{width:13px;height:13px}
.pd-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.pd-kpi{position:relative;background:#fff;border:1px solid var(--pd-line);border-radius:18px;padding:13px 12px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 14px 28px -18px rgba(15,23,42,.22);overflow:hidden}
.pd-kic{width:31px;height:31px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:9px}.pd-kic svg{width:15px;height:15px}
.pd-v{font-weight:800;font-size:24px;line-height:1;letter-spacing:-.6px}
.pd-l{font-size:9.5px;color:var(--pd-muted);margin-top:4px;font-weight:700;line-height:1.25}
.pd-tr{display:inline-flex;align-items:center;gap:2px;font-size:9px;font-weight:800;margin-top:6px;padding:2px 5px;border-radius:5px}
.pd-donutwrap{display:flex;align-items:center;gap:10px}
.pd-donut{position:relative;width:140px;height:140px;flex-shrink:0;filter:drop-shadow(0 10px 18px rgba(15,23,42,.12))}
.pd-donut svg{cursor:pointer}
.pd-donutctr{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;text-align:center;padding:0 22px}
.pd-donutctr b{font-size:23px;font-weight:800;letter-spacing:-1px;line-height:1;transition:color .2s}
.pd-donutctr small{font-size:8px;color:var(--pd-muted);margin-top:3px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;line-height:1.3}
.pd-legend{flex:1;display:flex;flex-direction:column;gap:8px;min-width:0}
.pd-lg{display:flex;align-items:center;gap:9px;cursor:pointer;padding:3px 4px;margin:-3px -4px;border-radius:8px;transition:background .2s}
.pd-lg:hover,.pd-lg.on{background:#f8fafc}
.pd-sw{width:10px;height:10px;border-radius:3px;flex-shrink:0;transition:transform .2s}.pd-lg.on .pd-sw{transform:scale(1.35)}
.pd-nm{font-size:11.5px;font-weight:700;flex:1;display:flex;flex-direction:column}.pd-nm small{font-size:9px;color:var(--pd-muted);font-weight:600}
.pd-vl{font-size:12px;font-weight:800}
.pd-pc{font-size:9.5px;color:var(--pd-muted);width:32px;text-align:right;font-weight:800}
.pd-areawrap{position:relative}
.pd-tip{position:absolute;pointer-events:none;background:#0f172a;color:#fff;border-radius:10px;padding:7px 10px;font-size:10px;font-weight:700;white-space:nowrap;transform:translate(-50%,-118%);box-shadow:0 10px 24px -10px rgba(15,23,42,.6);z-index:4}
.pd-tip b{font-size:13px;font-weight:800;display:block;margin-top:1px}
.pd-dl{display:inline-block;margin-top:3px;font-size:9px;font-weight:800;padding:1px 5px;border-radius:5px}
.pd-tip::after{content:"";position:absolute;left:50%;bottom:-5px;transform:translateX(-50%);border:5px solid transparent;border-top-color:#0f172a}
.pd-legmini{display:flex;gap:14px;margin-top:10px}
.pd-legmini i{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--pd-muted);font-weight:700}
.pd-legmini i b{width:8px;height:8px;border-radius:2px;display:inline-block}
.pd-rs{display:flex;align-items:center;gap:12px;padding:11px 0}.pd-rs+.pd-rs{border-top:1px solid var(--pd-line)}
.pd-rsic{width:40px;height:40px;border-radius:13px;flex-shrink:0;display:flex;align-items:center;justify-content:center}.pd-rsic svg{width:17px;height:17px}
.pd-rsmid{flex:1;min-width:0}.pd-rst1{font-size:12.5px;font-weight:800}
.pd-rst2{font-size:10px;color:var(--pd-muted);margin-top:1px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pd-rspr{font-size:15px;font-weight:800;letter-spacing:-.4px;flex-shrink:0}
.pd-prop{display:flex;align-items:center;gap:11px;padding:10px 0}.pd-prop+.pd-prop{border-top:1px solid var(--pd-line)}
.pd-avw{position:relative;flex-shrink:0}
.pd-av{width:42px;height:42px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;color:#fff;object-fit:cover}
.pd-rank{position:absolute;top:-5px;left:-5px;width:18px;height:18px;border-radius:50%;background:#fff;border:1px solid var(--pd-line);color:var(--pd-ink);font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.pd-propmid{flex:1;min-width:0}.pd-pn{font-size:12.5px;font-weight:800}
.pd-ps{font-size:9.5px;color:var(--pd-muted);margin-top:1px;font-weight:600}
.pd-track2{height:6px;border-radius:4px;background:#eef2f7;margin-top:7px;overflow:hidden}.pd-track2 i{display:block;height:100%;border-radius:4px;transition:width 1.2s cubic-bezier(.22,1,.36,1)}
.pd-pright{text-align:right;flex-shrink:0}.pd-pright b{font-size:15px;font-weight:800;letter-spacing:-.4px}.pd-pright small{font-size:9.5px;color:var(--pd-muted);display:block;font-weight:800}
.pd-paybar{height:16px;border-radius:9px;overflow:hidden;display:flex;background:#eef2f7;gap:2px}
.pd-paybar i{height:100%;transition:width 1.1s cubic-bezier(.22,1,.36,1),filter .2s;border-radius:3px;cursor:pointer}.pd-paybar i:hover{filter:brightness(1.12)}
.pd-payleg{display:flex;justify-content:space-between;margin-top:14px;gap:6px}
.pd-payit{text-align:center;flex:1}
.pd-paytop{display:flex;align-items:center;justify-content:center;gap:5px;font-size:10px;color:var(--pd-muted);font-weight:700}
.pd-payvv{font-size:17px;font-weight:800;margin-top:4px;letter-spacing:-.5px}
.pd-payee{font-size:9.5px;color:var(--pd-muted);font-weight:700;margin-top:1px}
.pd-ins{position:relative;display:flex;gap:12px;padding:14px;border-radius:16px;background:#fff;border:1px solid var(--pd-line);box-shadow:0 1px 2px rgba(15,23,42,.04),0 14px 28px -18px rgba(15,23,42,.22);overflow:hidden}.pd-ins+.pd-ins{margin-top:9px}
.pd-ins::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--pd-accent,#6366f1)}
.pd-insic{width:36px;height:36px;border-radius:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center}.pd-insic svg{width:17px;height:17px}
.pd-instx{font-size:12px;line-height:1.45;font-weight:500;align-self:center}.pd-instx b{font-weight:800}.pd-instx span{color:var(--pd-muted)}
`}</style>;
}
