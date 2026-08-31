import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AUDIT LOOKUP v1 — lettura di `auditLog` SENZA indice composito.
 *
 * PERCHE' ESISTE:
 * `/api/admin/audit-log` combina where(timestamp>=) + where(action==) + orderBy(timestamp)
 * e Firestore per quella combinazione richiede un indice composito che in
 * firestore.indexes.json NON esiste per la collection `auditLog` → HTTP 500.
 * Qui la query usa SOLO orderBy(timestamp desc) + limit (indice singolo, sempre
 * disponibile) e ogni altro filtro e' applicato in memoria.
 *
 * READ-ONLY. Nessuna scrittura.
 *
 * AUTH: sessione ADMIN oppure ?cronSecret=XXX
 *
 * USO:
 *   /api/debug/audit-lookup-v1?scan=500
 *   /api/debug/audit-lookup-v1?action=LINEN_ORDER_RECALCULATED&scan=500
 *   /api/debug/audit-lookup-v1?entityId=cfJscvUOZRNTK8GxcgFo
 *   /api/debug/audit-lookup-v1?propertyName=trastevere&scan=1000
 *   /api/debug/audit-lookup-v1?cleaningId=iAVDVLsrASJYAYq6gE0L
 *
 * PARAMETRI (tutti opzionali):
 *   scan          quanti documenti leggere partendo dal piu' recente (default 300, max 2000)
 *   action        filtro esatto su action (es. LINEN_ORDER_RECALCULATED)
 *   entityId      filtro esatto su entityId (orderId o cleaningId)
 *   cleaningId    filtro su details.cleaningId
 *   propertyName  match parziale case-insensitive
 *   source        match parziale case-insensitive
 *   days          scarta i record piu' vecchi di N giorni (default: nessun limite)
 *   limit         max record restituiti (default 100)
 *   full          =1 per includere il documento grezzo completo
 */

function tsToIso(t: any): string | null {
  try {
    if (!t) return null;
    if (typeof t?.toDate === "function") return t.toDate().toISOString();
    if (typeof t === "string") return t;
    if (typeof t?._seconds === "number") return new Date(t._seconds * 1000).toISOString();
    if (typeof t?.seconds === "number") return new Date(t.seconds * 1000).toISOString();
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // ── Auth: sessione ADMIN oppure cronSecret ──────────────────────────────
  let authOk = false;
  let authMode = "none";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && searchParams.get("cronSecret") === cronSecret) {
    authOk = true;
    authMode = "cronSecret";
  } else {
    try {
      const user = await getApiUser();
      if (user && (user as any).role === "ADMIN") {
        authOk = true;
        authMode = "sessione ADMIN";
      }
    } catch {
      /* getApiUser puo' fallire fuori da un contesto con cookie: ignora */
    }
  }
  if (!authOk) {
    return NextResponse.json(
      { error: "Non autorizzato", hint: "Apri da browser loggato come ADMIN, oppure aggiungi &cronSecret=..." },
      { status: 403 }
    );
  }

  const scan = Math.min(parseInt(searchParams.get("scan") || "300", 10) || 300, 2000);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10) || 100, 500);
  const fAction = searchParams.get("action");
  const fEntityId = searchParams.get("entityId");
  const fCleaningId = searchParams.get("cleaningId");
  const fProperty = (searchParams.get("propertyName") || "").toLowerCase().trim();
  const fSource = (searchParams.get("source") || "").toLowerCase().trim();
  const daysRaw = searchParams.get("days");
  const days = daysRaw ? parseInt(daysRaw, 10) : null;
  const full = searchParams.get("full") === "1";

  try {
    // ── Query MINIMA: solo orderBy su timestamp. Nessun indice composito. ──
    let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let queryMode = "orderBy(timestamp desc)";
    try {
      const snap = await adminDb
        .collection("auditLog")
        .orderBy("timestamp", "desc")
        .limit(scan)
        .get();
      docs = snap.docs;
    } catch (errOrder: any) {
      // Fallback estremo: se anche l'orderBy fallisce (campo assente su tutti i
      // doc, collection vuota, indice singolo disabilitato) leggo senza ordine.
      queryMode = `fallback senza orderBy (orderBy fallito: ${errOrder?.message || errOrder})`;
      const snap = await adminDb.collection("auditLog").limit(scan).get();
      docs = snap.docs;
    }

    // ── Diagnostica: cosa c'e' davvero dentro auditLog ─────────────────────
    const azioni: Record<string, number> = {};
    const sorgenti: Record<string, number> = {};
    const proprieta: Record<string, number> = {};
    let piuVecchio: string | null = null;
    let piuRecente: string | null = null;

    const tutti = docs.map((d) => {
      const x = d.data() as any;
      const iso = tsToIso(x.timestamp);
      if (iso) {
        if (!piuVecchio || iso < piuVecchio) piuVecchio = iso;
        if (!piuRecente || iso > piuRecente) piuRecente = iso;
      }
      const a = String(x.action || "(senza action)");
      azioni[a] = (azioni[a] || 0) + 1;
      const s = String(x.source || "(senza source)");
      sorgenti[s] = (sorgenti[s] || 0) + 1;
      const p = String(x.propertyName || "(senza propertyName)");
      proprieta[p] = (proprieta[p] || 0) + 1;
      return { docId: d.id, iso, raw: x };
    });

    // ── Filtri in memoria ─────────────────────────────────────────────────
    let sogliaIso: string | null = null;
    if (days && days > 0) {
      const dt = new Date();
      dt.setDate(dt.getDate() - days);
      sogliaIso = dt.toISOString();
    }

    const filtrati = tutti.filter(({ iso, raw }) => {
      if (sogliaIso && iso && iso < sogliaIso) return false;
      if (fAction && String(raw.action || "") !== fAction) return false;
      if (fEntityId && String(raw.entityId || "") !== fEntityId) return false;
      if (fCleaningId && String(raw?.details?.cleaningId || "") !== fCleaningId) return false;
      if (fProperty && !String(raw.propertyName || "").toLowerCase().includes(fProperty)) return false;
      if (fSource && !String(raw.source || "").toLowerCase().includes(fSource)) return false;
      return true;
    });

    // ── Proiezione leggibile ──────────────────────────────────────────────
    const risultati = filtrati.slice(0, limit).map(({ docId, iso, raw }) => {
      const det = raw.details || {};
      const res = det.result || {};
      const cal = det.caller || {};
      const snapCle = det.snapshot || {};

      const base: Record<string, any> = {
        quando: iso,
        action: raw.action ?? null,
        entityType: raw.entityType ?? null,
        entityId: raw.entityId ?? null,
        propertyName: raw.propertyName ?? null,
        source: raw.source ?? null,
        docId,
      };

      // Campi che contano per il caso biancheria
      if (res.itemsCountBefore !== undefined || res.itemsCountAfter !== undefined) {
        base.RISULTATO = {
          itemsCountBefore: res.itemsCountBefore ?? null,
          itemsCountAfter: res.itemsCountAfter ?? null,
          configSource: res.configSource ?? null,
          itemsBefore: res.itemsBefore ?? null,
          itemsAfter: res.itemsAfter ?? null,
        };
      }
      if (Object.keys(snapCle).length > 0) base.SNAPSHOT_PULIZIA = snapCle;
      if (Object.keys(cal).length > 0) {
        base.CHI = {
          userId: cal.userId ?? null,
          userEmail: cal.userEmail ?? null,
          userRole: cal.userRole ?? null,
          ip: cal.ip ?? null,
          userAgent: cal.userAgent ?? null,
        };
      }
      if (det.cleaningId) base.cleaningId = det.cleaningId;
      if (det.isSuspicious !== undefined) base.isSuspicious = det.isSuspicious;
      if (det.suspiciousReasons) base.suspiciousReasons = det.suspiciousReasons;

      if (full) base.RAW = raw;
      else if (!base.RISULTATO && !base.SNAPSHOT_PULIZIA) base.details = det;

      return base;
    });

    const vuota = tutti.length === 0;

    return NextResponse.json({
      success: true,
      authMode,
      DIAGNOSTICA: {
        collectionVuota: vuota,
        documentiLetti: tutti.length,
        scanRichiesto: scan,
        queryMode,
        recordPiuRecente: piuRecente,
        recordPiuVecchio: piuVecchio,
        azioniPresenti: azioni,
        sorgentiPresenti: sorgenti,
        proprietaPresenti: Object.keys(proprieta).length <= 40 ? proprieta : "(oltre 40 proprieta', omesse)",
      },
      filtriApplicati: {
        action: fAction,
        entityId: fEntityId,
        cleaningId: fCleaningId,
        propertyName: fProperty || null,
        source: fSource || null,
        days: days ?? null,
        limit,
      },
      trovati: filtrati.length,
      mostrati: risultati.length,
      risultati,
      nota: vuota
        ? "auditLog e' VUOTA: nessun percorso ha mai scritto un record. L'attribuzione a posteriori non e' possibile."
        : filtrati.length === 0
        ? "Nessun record corrisponde ai filtri. Se il periodo cercato e' oltre i documenti letti, alza &scan= (max 2000)."
        : null,
    });
  } catch (err: any) {
    // Mai piu' un 500 cieco: l'errore vero torna nella risposta.
    return NextResponse.json(
      {
        success: false,
        error: err?.message || String(err),
        code: err?.code ?? null,
        stack: process.env.NODE_ENV !== "production" ? err?.stack : undefined,
        hint: "Se l'errore cita un indice mancante, il link per crearlo e' dentro il messaggio.",
      },
      { status: 500 }
    );
  }
}
