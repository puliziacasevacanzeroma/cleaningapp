/**
 * 🔍 DEBUG ENDPOINT — Stato foto proprietà
 *
 * GET /api/cron/check-property-image?secret=CRON_SECRET&propertyId=XXX
 * GET /api/cron/check-property-image?secret=CRON_SECRET (tutte le proprietà)
 *
 * READ-ONLY: zero scritture.
 *
 * Output: per ogni proprietà mostra:
 *   - id, name
 *   - tipo di imageUrl: "base64" | "storage_url" | "altro" | "missing"
 *   - dimensione (per base64) o URL (per storage)
 *   - se esiste imageUrlBackup
 *
 * Utile per:
 *   - Verificare che il fix endpoint upload funzioni (carica foto, controlla qui)
 *   - Pre-check prima della migrazione di massa
 *   - Verifica post-migrazione
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

function classifyImageUrl(imageUrl: any): {
  type: "base64" | "storage_url" | "external_url" | "missing" | "other";
  sizeBytes?: number;
  preview?: string;
} {
  if (!imageUrl || typeof imageUrl !== "string") {
    return { type: "missing" };
  }
  if (imageUrl.startsWith("data:image/")) {
    return {
      type: "base64",
      sizeBytes: imageUrl.length,
      preview: imageUrl.substring(0, 80) + "...",
    };
  }
  if (imageUrl.startsWith("https://storage.googleapis.com/")) {
    return { type: "storage_url", preview: imageUrl };
  }
  if (imageUrl.startsWith("https://") || imageUrl.startsWith("http://")) {
    return { type: "external_url", preview: imageUrl };
  }
  return {
    type: "other",
    preview: imageUrl.substring(0, 80),
  };
}

export async function GET(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get("secret");
  if (!CRON_SECRET || urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const propertyId = req.nextUrl.searchParams.get("propertyId");

    // ─── Modalità A: singola proprietà ───────────────────────────
    if (propertyId) {
      const doc = await adminDb.collection("properties").doc(propertyId).get();
      if (!doc.exists) {
        return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
      }
      const data = doc.data() as Record<string, any>;
      const imageUrlInfo = classifyImageUrl(data.imageUrl);
      const backupInfo = classifyImageUrl(data.imageUrlBackup);
      return NextResponse.json({
        propertyId,
        name: data.name,
        address: data.address,
        status: data.status,
        ownerId: data.ownerId,
        imageUrl: imageUrlInfo,
        imageUrlBackup: backupInfo,
        imageUrlUpdatedAt: data.imageUrlUpdatedAt,
      });
    }

    // ─── Modalità B: tutte le proprietà (riassunto) ──────────────
    const snap = await adminDb.collection("properties").get();
    const stats = {
      total: snap.size,
      base64: 0,
      storageUrl: 0,
      externalUrl: 0,
      missing: 0,
      other: 0,
      withBackup: 0,
      totalBase64Bytes: 0,
    };
    const byType: Record<string, Array<{ id: string; name: string; sizeBytes?: number }>> = {
      base64: [],
      storageUrl: [],
      externalUrl: [],
      missing: [],
      other: [],
    };

    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, any>;
      const info = classifyImageUrl(data.imageUrl);
      const entry = { id: doc.id, name: data.name || "?", sizeBytes: info.sizeBytes };
      switch (info.type) {
        case "base64":
          stats.base64++;
          stats.totalBase64Bytes += info.sizeBytes || 0;
          byType.base64!.push(entry);
          break;
        case "storage_url":
          stats.storageUrl++;
          byType.storageUrl!.push(entry);
          break;
        case "external_url":
          stats.externalUrl++;
          byType.externalUrl!.push(entry);
          break;
        case "missing":
          stats.missing++;
          byType.missing!.push(entry);
          break;
        case "other":
          stats.other++;
          byType.other!.push(entry);
          break;
      }
      if (data.imageUrlBackup) stats.withBackup++;
    }

    return NextResponse.json({
      stats: {
        ...stats,
        totalBase64MB: parseFloat((stats.totalBase64Bytes / 1024 / 1024).toFixed(2)),
      },
      byType,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Errore", details: errMsg }, { status: 500 });
  }
}
