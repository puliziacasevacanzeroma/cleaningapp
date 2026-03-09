import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS } from "~/lib/firebase/collections";
import fs from "fs";
import path from "path";

export const dynamic = 'force-dynamic';

async function generateHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getAdminUser(): Promise<{ id: string; role: string } | null> {
  const user = await getApiUser();
  if (!user || user.role?.toUpperCase() !== "ADMIN") return null;
  return user;
}

async function readContractFile(filename: string, baseUrl: string): Promise<string> {
  const possiblePaths = [
    path.join(process.cwd(), "public", "contracts", filename),
    path.join(process.cwd(), ".next", "static", "contracts", filename),
    path.join("/app", "public", "contracts", filename),
  ];
  for (const filePath of possiblePaths) {
    try { if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf-8"); } catch (e) {}
  }
  const res = await fetch(`${baseUrl}/contracts/${filename}`);
  if (!res.ok) throw new Error(`File non trovato: ${filename}`);
  return res.text();
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) return NextResponse.json({ error: "Non autorizzato - solo admin" }, { status: 401 });

    const baseUrl = request.nextUrl.origin;
    let onboardingHtml: string, allegatoDHtml: string;
    try {
      [onboardingHtml, allegatoDHtml] = await Promise.all([
        readContractFile("onboarding_v2.html", baseUrl),
        readContractFile("allegato_d_template_v2.html", baseUrl),
      ]);
    } catch (fileError) {
      return NextResponse.json({ error: `File HTML non trovati: ${fileError instanceof Error ? fileError.message : "errore sconosciuto"}` }, { status: 500 });
    }

    const onboardingHash = await generateHash(onboardingHtml);
    const allegatoDHash = await generateHash(allegatoDHtml);
    const results: string[] = [];

    // 1. Contratto Quadro
    const existingDocs = await adminDb.collection(COLLECTIONS.REGULATION_DOCUMENTS).where("type", "==", "contratto_quadro_servizio").where("isActive", "==", true).get();
    let onboardingAlreadyExists = false;
    for (const existingDoc of existingDocs.docs) {
      if ((existingDoc.data() as Record<string, any>).hash === onboardingHash) { results.push(`⏭️ Contratto Quadro v2.0: già presente (ID: ${existingDoc.id})`); onboardingAlreadyExists = true; break; }
      await existingDoc.ref.update({ isActive: false, updatedAt: Timestamp.now(), updatedBy: admin.id });
      results.push(`🔄 Disattivato documento precedente: ${existingDoc.id}`);
    }
    if (!onboardingAlreadyExists) {
      const hashDocs = await adminDb.collection(COLLECTIONS.REGULATION_DOCUMENTS).where("hash", "==", onboardingHash).get();
      if (hashDocs.empty) {
        const ref = await adminDb.collection(COLLECTIONS.REGULATION_DOCUMENTS).add({ type: "contratto_quadro_servizio", version: "2.0", title: "Contratto Quadro di Servizio e Allegati", content: onboardingHtml, hash: onboardingHash, applicableTo: ["PROPRIETARIO", "OWNER", "CLIENTE", "ALL"], effectiveFrom: Timestamp.now(), isActive: true, isDraft: false, createdAt: Timestamp.now(), createdBy: admin.id, publishedAt: Timestamp.now(), publishedBy: admin.id, changelog: "Versione 2.0 - Contratto Quadro completo con Allegati A (Regolamento Operativo), B (Listino Biancheria), C (Privacy GDPR). Include clausole onerose ex artt. 1341-1342 c.c." });
        results.push(`✅ Contratto Quadro v2.0 creato: ${ref.id}`);
      } else {
        const existingDoc = hashDocs.docs[0];
        if (!(existingDoc.data() as Record<string, any>).isActive) await existingDoc.ref.update({ isActive: true, updatedAt: Timestamp.now() });
        results.push(`⏭️ Contratto Quadro v2.0: stesso hash già presente (ID: ${existingDoc.id})`);
      }
    }

    // 2. Allegato D
    const existingAllegatoDDocs = await adminDb.collection(COLLECTIONS.REGULATION_DOCUMENTS).where("type", "==", "allegato_d_template").where("isActive", "==", true).get();
    let allegatoDAlreadyExists = false;
    for (const existingDoc of existingAllegatoDDocs.docs) {
      if ((existingDoc.data() as Record<string, any>).hash === allegatoDHash) { results.push(`⏭️ Allegato D Template v2.0: già presente (ID: ${existingDoc.id})`); allegatoDAlreadyExists = true; break; }
      await existingDoc.ref.update({ isActive: false, updatedAt: Timestamp.now(), updatedBy: admin.id });
      results.push(`🔄 Disattivato Allegato D precedente: ${existingDoc.id}`);
    }
    if (!allegatoDAlreadyExists) {
      const hashDocsD = await adminDb.collection(COLLECTIONS.REGULATION_DOCUMENTS).where("hash", "==", allegatoDHash).get();
      if (hashDocsD.empty) {
        const ref = await adminDb.collection(COLLECTIONS.REGULATION_DOCUMENTS).add({ type: "allegato_d_template", version: "2.0", title: "Allegato D – Scheda Servizio Proprietà", content: allegatoDHtml, hash: allegatoDHash, applicableTo: ["PROPRIETARIO", "OWNER", "CLIENTE"], effectiveFrom: Timestamp.now(), isActive: true, isDraft: false, createdAt: Timestamp.now(), createdBy: admin.id, publishedAt: Timestamp.now(), publishedBy: admin.id, changelog: "Versione 2.0 - Scheda Servizio per singola proprietà." });
        results.push(`✅ Allegato D Template v2.0 creato: ${ref.id}`);
      } else {
        const existingDoc = hashDocsD.docs[0];
        if (!(existingDoc.data() as Record<string, any>).isActive) await existingDoc.ref.update({ isActive: true, updatedAt: Timestamp.now() });
        results.push(`⏭️ Allegato D Template v2.0: stesso hash già presente (ID: ${existingDoc.id})`);
      }
    }

    return NextResponse.json({ success: true, message: "Seed contratti completato", results, stats: { onboardingHtmlSize: onboardingHtml.length, allegatoDHtmlSize: allegatoDHtml.length, onboardingHash: onboardingHash.substring(0, 16) + "...", allegatoDHash: allegatoDHash.substring(0, 16) + "..." } });
  } catch (error) {
    console.error("❌ Errore seed contratti:", error);
    return NextResponse.json({ error: "Errore: " + (error instanceof Error ? error.message : "sconosciuto") }, { status: 500 });
  }
}
