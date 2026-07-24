import { describe, it, expect } from "vitest";
import { resolveEffectiveCheckIn, dayRome } from "./checkInClipGuard";

const D = (s: string) => new Date(s);

describe("checkInClipGuard — taglio quotidiano Booking", () => {
  it("replay Poerio 22→26 (dai backup): notte 22→23 alle 22:01 UTC protegge", () => {
    const r = resolveEffectiveCheckIn({ source: "booking", existingCheckIn: D("2026-07-22T12:00:00Z"), feedStart: D("2026-07-23T12:00:00Z"), now: D("2026-07-22T22:01:18Z") });
    expect(r.kept).toBe(true);
    expect(r.effectiveStart.toISOString()).toMatch(/^2026-07-22/);
  });

  it("notte successiva con storia già preservata: resta protetta", () => {
    const r = resolveEffectiveCheckIn({ source: "booking", existingCheckIn: D("2026-07-22T12:00:00Z"), feedStart: D("2026-07-24T12:00:00Z"), now: D("2026-07-23T22:01:19Z") });
    expect(r.kept).toBe(true);
  });

  it("la vecchia logica (mezzanotte UTC) falliva nello stesso istante — riproduzione bug", () => {
    const ci = D("2026-07-22T12:00:00Z");
    const now = D("2026-07-22T22:01:18Z");
    const todayStartUTC = new Date(now);
    todayStartUTC.setUTCHours(0, 0, 0, 0);
    expect(ci.getTime() < todayStartUTC.getTime()).toBe(false); // guard vecchia spenta
  });

  it("giorni liberati (feed parte dopo oggi, check-in passato): aggiorna + freedDays", () => {
    const r = resolveEffectiveCheckIn({ source: "booking", existingCheckIn: D("2026-07-20T12:00:00Z"), feedStart: D("2026-07-26T12:00:00Z"), now: D("2026-07-24T10:00:00Z") });
    expect(r.kept).toBe(false);
    expect(r.freedDays).toBe(true);
    expect(r.effectiveStart.toISOString()).toMatch(/^2026-07-26/);
  });

  it("sorgenti non-booking: mai guardia", () => {
    const r = resolveEffectiveCheckIn({ source: "airbnb", existingCheckIn: D("2026-07-22T12:00:00Z"), feedStart: D("2026-07-24T12:00:00Z"), now: D("2026-07-24T10:00:00Z") });
    expect(r.kept).toBe(false);
    expect(r.freedDays).toBe(false);
  });

  it("prenotazione futura modificata: aggiornamento normale", () => {
    const r = resolveEffectiveCheckIn({ source: "booking", existingCheckIn: D("2026-08-10T12:00:00Z"), feedStart: D("2026-08-12T12:00:00Z"), now: D("2026-07-24T10:00:00Z") });
    expect(r.kept).toBe(false);
    expect(r.freedDays).toBe(false);
  });

  it("feed che anticipa (LEFT_MERGE gestito a valle): aggiornamento normale", () => {
    const r = resolveEffectiveCheckIn({ source: "booking", existingCheckIn: D("2026-07-24T12:00:00Z"), feedStart: D("2026-07-22T12:00:00Z"), now: D("2026-07-24T10:00:00Z") });
    expect(r.kept).toBe(false);
    expect(r.freedDays).toBe(false);
  });

  it("DST: mezzanotte italiana corretta in estate, inverno e nei giorni di cambio ora", () => {
    expect(dayRome(D("2026-07-22T22:01:00Z"))).toBe("2026-07-23"); // estate UTC+2
    expect(dayRome(D("2026-07-22T21:59:00Z"))).toBe("2026-07-22");
    expect(dayRome(D("2026-01-15T23:00:00Z"))).toBe("2026-01-16"); // inverno UTC+1
    expect(dayRome(D("2026-01-15T22:30:00Z"))).toBe("2026-01-15");
    expect(dayRome(D("2026-03-29T01:30:00Z"))).toBe("2026-03-29"); // cambio ora legale
    expect(dayRome(D("2026-10-25T23:30:00Z"))).toBe("2026-10-26"); // cambio ora solare
  });

  it("fuzz 20.000 scenari: invariante mai violato", () => {
    let violations = 0;
    const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a));
    for (let i = 0; i < 20000; i++) {
      const base = Date.UTC(2026, rnd(0, 12), rnd(1, 28), rnd(0, 24), rnd(0, 60));
      const now = new Date(base);
      const ci = new Date(base - rnd(1, 20) * 86400000 + rnd(-12, 12) * 3600000);
      const feed = new Date(base + rnd(-3, 6) * 86400000 + rnd(-12, 12) * 3600000);
      const r = resolveEffectiveCheckIn({ source: "booking", existingCheckIn: ci, feedStart: feed, now });
      const ciPast = dayRome(ci) < dayRome(now);
      const movesFwd = ci.getTime() < feed.getTime();
      if (ciPast && movesFwd) {
        const expectKeep = dayRome(feed) <= dayRome(now);
        if (r.kept !== expectKeep) violations++;
        if (r.kept && r.effectiveStart.getTime() !== ci.getTime()) violations++;
        if (!expectKeep && !r.freedDays) violations++;
      } else {
        if (r.kept || r.effectiveStart.getTime() !== feed.getTime()) violations++;
      }
    }
    expect(violations).toBe(0);
  });
});
