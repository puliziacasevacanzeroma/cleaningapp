/**
 * API: POST /api/contract/generate-pdf
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export async function POST(request: NextRequest) {
  try {
    const _user = await getApiUser();
    if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const body = await validateBody(request, GenericBodySchema);
    if (body instanceof Response) return body;
    const { acceptanceId } = body;

    if (!acceptanceId) return NextResponse.json({ error: "acceptanceId richiesto" }, { status: 400 });

    // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
    const acceptanceDoc = await adminDb.collection("contractAcceptances").doc(acceptanceId).get();
    if (!acceptanceDoc.exists) return NextResponse.json({ error: "Documento non trovato" }, { status: 404 });

    const acceptanceData = acceptanceDoc.data()!;

    let documentContent = acceptanceData.documentContent || "";
    let documentTitle = acceptanceData.documentTitle || "Documento";

    if (!documentContent) {
      try {
        const regDoc = await adminDb.collection("regulationDocuments").doc(acceptanceData.documentId).get();
        if (regDoc.exists) {
          documentContent = regDoc.data()!.content || "";
          documentTitle = regDoc.data()!.title || documentTitle;
        }
      } catch { /* documento non trovato */ }
    }

    let signedAt = new Date().toISOString();
    try {
      if (acceptanceData.createdAt?.toDate) {
        signedAt = acceptanceData.createdAt.toDate().toISOString();
      } else if (acceptanceData.createdAt?.seconds) {
        signedAt = new Date(acceptanceData.createdAt.seconds * 1000).toISOString();
      }
    } catch { /* usa default */ }

    const tsFormatted = new Date(signedAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" });
    const ipAddr = acceptanceData.metadata?.ipAddress || "N/A";
    documentContent = documentContent.replace(/\[Firma tramite Gestionale\]/g, "✓ Firmato digitalmente da " + (acceptanceData.fullName || "—"));
    documentContent = documentContent.replace(/\[FIRMA DIGITALE HOST – Gestionale\]/g, "✓ Firmato digitalmente da " + (acceptanceData.fullName || "—"));
    documentContent = documentContent.replace(/<span style="color:#999;font-style:italic">\[La tua firma\]<\/span>/g, "✓ Firmato digitalmente da " + (acceptanceData.fullName || "—"));
    documentContent = documentContent.replace(/\[La tua firma\]/g, "✓ Firmato digitalmente da " + (acceptanceData.fullName || "—"));
    documentContent = documentContent.replace(/\[FIRMA DIGITALE AUTO – Gestionale\]/g, "✓ Firma digitale – Puliziacasevacanze.it S.r.l.s.");
    documentContent = documentContent.replace(/\[timestamp: AUTO \| IP: AUTO\]/g, "Timestamp: " + tsFormatted + " | IP: " + ipAddr);
    documentContent = documentContent.replace(/\[timestamp: AUTO \| IP:AUTO\]/g, "Timestamp: " + tsFormatted + " | IP: " + ipAddr);
    documentContent = documentContent.replace(/\[AUTO_SIG_HOST\]/g, "✓ Firmato digitalmente da " + (acceptanceData.fullName || "—"));
    documentContent = documentContent.replace(/\[AUTO_SIG_COMPANY\]/g, "✓ Firma digitale – Puliziacasevacanze.it S.r.l.s.");
    documentContent = documentContent.replace(/\[AUTO_SIG_TIMESTAMP\]/g, tsFormatted + " | IP: " + ipAddr);
    documentContent = documentContent.replace(/Nome \/ Ragione Sociale: \[AUTO – Gestionale\]/g, "Nome / Ragione Sociale: " + (acceptanceData.fullName || "—"));
    documentContent = documentContent.replace(/C\.F\. \/ P\.IVA: \[AUTO – Gestionale\]/g, "C.F. / P.IVA: " + (acceptanceData.fiscalCode || "—"));
    documentContent = documentContent.replace(/Email: \[AUTO – Gestionale\]/g, "Email: " + (acceptanceData.userEmail || "—"));
    documentContent = documentContent.replace(/\[AUTO – Gestionale\]/g, "—");
    documentContent = documentContent.replace(/\[AUTO\]/g, "—");

    const pdfData = {
      title: documentTitle,
      version: acceptanceData.documentVersion || "1.0",
      content: documentContent,
      signer: {
        fullName: acceptanceData.fullName || "",
        fiscalCode: acceptanceData.fiscalCode || "",
        signatureImage: acceptanceData.signatureImage || "",
      },
      metadata: {
        signedAt,
        ipAddress: acceptanceData.metadata?.ipAddress || "N/A",
        userAgent: acceptanceData.metadata?.userAgent || "N/A",
        geolocation: acceptanceData.metadata?.geolocation || null,
      },
    };

    const htmlContent = generatePDFHtml(pdfData);

    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${documentTitle.replace(/[^\x20-\x7E]/g, "_").replace(/\s+/g, "_")}_firmato.html"`,
      },
    });
  } catch (error) {
    console.error("Errore generazione PDF:", error);
    return NextResponse.json({ error: "Errore durante la generazione: " + (error instanceof Error ? error.message : "Errore sconosciuto") }, { status: 500 });
  }
}

function generatePDFHtml(data: { title: string; version: string; content: string; signer: { fullName: string; fiscalCode: string; signatureImage: string }; metadata: { signedAt: string; ipAddress: string; userAgent: string; geolocation: { latitude: number; longitude: number } | null } }): string {
  const signedDate = new Date(data.metadata.signedAt);
  const formattedDate = signedDate.toLocaleDateString("it-IT", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Europe/Rome" });
  const formattedTime = signedDate.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome" });
  const safeContent = data.content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>${data.title} - Documento Firmato</title>
  <style>
    @page { size: A4; margin: 15mm 12mm 20mm 12mm; }
    @media print { body { margin: 0; padding: 0; } .no-print { display: none !important; } }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; font-size: 11px; line-height: 1.5; color: #1e293b; background: #f0f0f0; margin: 0; padding: 0; }
    .page { max-width: 210mm; margin: 0 auto; background: white; padding: 20px 24px; min-height: 100vh; }
    @media screen { .page { box-shadow: 0 2px 20px rgba(0,0,0,0.12); margin: 10px auto; } }
    .signature-section { margin: 30px 20px 0; padding-top: 20px; border-top: 2px solid #0f2a4a; }
    .signature-section h2 { font-size: 14px; font-weight: 700; color: #0f2a4a; text-align: center; margin-bottom: 16px; }
    .sig-grid { display: flex; gap: 12px; margin-bottom: 14px; }
    .sig-field { flex: 1; padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
    .sig-field .label { font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 3px; }
    .sig-field .value { font-size: 13px; font-weight: 700; color: #0f2a4a; }
    .sig-img-box { text-align: center; padding: 16px; margin: 16px auto; max-width: 350px; border: 2px solid #0f2a4a; border-radius: 10px; background: #fafbfc; }
    .sig-img-box img { max-width: 280px; max-height: 90px; }
    .sig-img-box .caption { font-size: 9px; color: #94a3b8; margin-top: 8px; text-transform: uppercase; letter-spacing: 1px; }
    .legal-footer { margin: 20px 20px 0; padding: 12px 16px; background: #f1f5f9; border-left: 3px solid #0f2a4a; border-radius: 0 6px 6px 0; font-size: 9px; color: #64748b; line-height: 1.5; }
    .legal-footer strong { color: #0f2a4a; }
    .meta-footer { margin: 14px 20px 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 8px; color: #94a3b8; }
    .meta-footer p { margin: 2px 0; }
    .print-btn { position: fixed; bottom: 20px; right: 20px; padding: 12px 28px; background: #0f2a4a; color: white; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 15px rgba(15,42,74,0.4); z-index: 1000; }
  </style>
</head>
<body>
  <div class="page">
    ${safeContent}
    <div class="signature-section">
      <h2>Attestazione di Firma Digitale</h2>
      <div class="sig-grid">
        <div class="sig-field"><div class="label">Nome e Cognome</div><div class="value">${data.signer.fullName}</div></div>
        <div class="sig-field"><div class="label">Codice Fiscale</div><div class="value">${data.signer.fiscalCode}</div></div>
      </div>
      <div class="sig-grid">
        <div class="sig-field"><div class="label">Data di Firma</div><div class="value">${formattedDate}</div></div>
        <div class="sig-field"><div class="label">Ora di Firma</div><div class="value">${formattedTime}</div></div>
      </div>
      <div class="sig-img-box">
        <img src="${data.signer.signatureImage}" alt="Firma Digitale">
        <div class="caption">Firma Digitale Autografa</div>
      </div>
    </div>
    <div class="legal-footer">
      <p><strong>DICHIARAZIONE DI AUTENTICITÀ</strong></p>
      <p>Il sottoscritto ${data.signer.fullName}, codice fiscale ${data.signer.fiscalCode}, dichiara di aver letto integralmente il presente documento e di accettarne tutti i termini e le condizioni.</p>
    </div>
    <div class="meta-footer">
      <p><strong>Metadati Tecnici</strong></p>
      <p>Data firma: ${data.metadata.signedAt} &bull; IP: ${data.metadata.ipAddress}</p>
      ${data.metadata.geolocation ? `<p>Geolocalizzazione: ${data.metadata.geolocation.latitude.toFixed(4)}, ${data.metadata.geolocation.longitude.toFixed(4)}</p>` : ""}
      <p>Puliziacasevacanze.it S.r.l.s. &mdash; Via della Cava Aurelia 84/N &ndash; 00165 Roma (RM)</p>
    </div>
  </div>
  <button class="print-btn no-print" onclick="window.print()">&#128424; Stampa / Salva PDF</button>
</body>
</html>`;
}
