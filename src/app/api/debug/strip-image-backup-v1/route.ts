/**
 * ════════════════════════════════════════════════════════════════════
 * PULIZIA imageUrlBackup — alleggerisce i documenti properties
 * ════════════════════════════════════════════════════════════════════
 *
 * GET/POST /api/debug/strip-image-backup-v1?cronSecret=XXX&dryRun=true
 *
 * Il campo 'imageUrlBackup' (vecchia base64 salvata durante la migrazione
 * immagini, ~146KB/doc, 11.5MB totali) è il 98% del peso delle properties
 * e rallenta OGNI caricamento. Non è letto dal funzionamento: era solo un
 * backup per rollback.
 *
 * Cosa fa (per sicurezza, in 2 mosse per property):
 *   1. ARCHIVIA imageUrlBackup in collection '_imageBackupArchive/{propId}'
 *      (così il rollback resta possibile, ma FUORI dal documento pesante).
 *   2. RIMUOVE il campo imageUrlBackup dal documento property.
 *
 * Risultato: properties ~150x più leggere → tutte le pagine che le caricano
 * diventano quasi istantanee.
 *
 * SICUREZZA: dryRun:true di DEFAULT (mostra solo). dryRun=false esegue.
 * Reversibile: il valore è in _imageBackupArchive.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  let body: any = {};
  try { body = await request.json(); } catch { /* GET */ }
  const { searchParams } = new URL(request.url);
  const providedSecret = body.cronSecret || searchParams.get("cronSecret");
  if (cronSecret && providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const qp = (k: string) => searchParams.get(k);
  const dryRunRaw = body.dryRun ?? qp("dryRun");
  const dryRun = dryRunRaw === false || dryRunRaw === "false" ? false : true;

  try {
    const snap = await adminDb.collection("properties").get();

    let conBackup = 0;
    let kbLiberati = 0;
    let archiviati = 0;
    let puliti = 0;
    const dettaglio: any[] = [];

    for (const d of snap.docs) {
      const data = d.data() as Record<string, any>;
      if (!data.imageUrlBackup) continue;
      conBackup++;
      const bytes = Buffer.byteLength(JSON.stringify(data.imageUrlBackup), "utf8");
      kbLiberati += bytes / 1024;

      dettaglio.push({
        id: d.id,
        name: data.name || d.id,
        backupKB: Math.round(bytes / 1024 * 10) / 10,
        eseguito: false,
      });

      if (!dryRun) {
        // 1. archivia in collection separata
        await adminDb.collection("_imageBackupArchive").doc(d.id).set({
          propertyId: d.id,
          propertyName: data.name || null,
          imageUrlBackup: data.imageUrlBackup,
          imageUrl: data.imageUrl || null,
          archiviatoIl: Timestamp.now(),
        });
        archiviati++;
        // 2. rimuovi il campo dal documento property
        await adminDb.collection("properties").doc(d.id).update({
          imageUrlBackup: FieldValue.delete(),
        });
        puliti++;
        dettaglio[dettaglio.length - 1].eseguito = true;
      }
    }

    return NextResponse.json({
      success: true,
      modalita: dryRun ? "DRY-RUN (nessuna modifica)" : "ESEGUITO",
      riepilogo: {
        propertiesConBackup: conBackup,
        spazioLiberatoKB: Math.round(kbLiberati * 10) / 10,
        spazioLiberatoMB: Math.round(kbLiberati / 1024 * 100) / 100,
        archiviati,
        puliti,
      },
      dettaglio: dettaglio.slice(0, 100),
      istruzioni: dryRun
        ? "Anteprima. Per eseguire: aggiungi dryRun=false all'URL. Il backup verrà copiato in _imageBackupArchive PRIMA di rimuoverlo (reversibile)."
        : "Fatto. imageUrlBackup archiviato in _imageBackupArchive e rimosso dalle properties. Ricarica la pagina Pagamenti: dovrebbe volare. Per ripristinare una property: copia _imageBackupArchive/{id}.imageUrlBackup → properties/{id}.imageUrl.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore server", message: error?.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) { return handler(request); }
export async function GET(request: NextRequest) { return handler(request); }
