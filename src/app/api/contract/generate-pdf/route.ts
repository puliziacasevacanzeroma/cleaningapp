/**
 * API: POST /api/contract/generate-pdf
 * 
 * Genera un PDF del documento firmato con tutti i dati.
 * Include: contenuto documento, dati firmatario, firma digitale, timestamp
 */

import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { acceptanceId } = body;

    if (!acceptanceId) {
      return NextResponse.json(
        { error: "acceptanceId richiesto" },
        { status: 400 }
      );
    }

    // Recupera i dati dell'accettazione
    const acceptanceDoc = await getDoc(doc(db, "contractAcceptances", acceptanceId));
    
    if (!acceptanceDoc.exists()) {
      return NextResponse.json(
        { error: "Documento non trovato" },
        { status: 404 }
      );
    }

    const acceptanceData = acceptanceDoc.data();

    // Recupera il contenuto del documento originale
    let documentContent = "";
    let documentTitle = acceptanceData.documentTitle || "Documento";
    
    try {
      const regDoc = await getDoc(doc(db, "regulationDocuments", acceptanceData.documentId));
      if (regDoc.exists()) {
        documentContent = regDoc.data().content || "";
        documentTitle = regDoc.data().title || documentTitle;
      }
    } catch {
      // Documento non trovato
    }

    // Prepara i dati per il PDF
    const pdfData = {
      title: documentTitle,
      version: acceptanceData.documentVersion || "1.0",
      content: documentContent,
      signer: {
        fullName: acceptanceData.fullName,
        fiscalCode: acceptanceData.fiscalCode,
        signatureImage: acceptanceData.signatureImage,
      },
      metadata: {
        signedAt: acceptanceData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        ipAddress: acceptanceData.metadata?.ipAddress || "N/A",
        userAgent: acceptanceData.metadata?.userAgent || "N/A",
        geolocation: acceptanceData.metadata?.geolocation || null,
      },
    };

    // Genera HTML per il PDF
    const htmlContent = generatePDFHtml(pdfData);

    // Per ora, restituiamo l'HTML come PDF (il client può stamparlo)
    // In produzione, si userebbe un servizio come Puppeteer o un'API PDF
    
    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${documentTitle.replace(/\s+/g, "_")}_firmato.html"`,
      },
    });

  } catch (error) {
    console.error("Errore generazione PDF:", error);
    return NextResponse.json(
      { error: "Errore durante la generazione" },
      { status: 500 }
    );
  }
}

function generatePDFHtml(data: {
  title: string;
  version: string;
  content: string;
  signer: {
    fullName: string;
    fiscalCode: string;
    signatureImage: string;
  };
  metadata: {
    signedAt: string;
    ipAddress: string;
    userAgent: string;
    geolocation: { latitude: number; longitude: number } | null;
  };
}): string {
  const signedDate = new Date(data.metadata.signedAt);
  const formattedDate = signedDate.toLocaleDateString("it-IT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedTime = signedDate.toLocaleTimeString("it-IT");

  // Rimuovi tag script e style pericolosi dal contenuto
  const safeContent = data.content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  return `
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title} - Documento Firmato</title>
  <style>
    @media print {
      body { margin: 0; padding: 20px; }
      .no-print { display: none; }
      .page-break { page-break-before: always; }
    }
    
    * {
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      background: white;
    }
    
    .header {
      text-align: center;
      border-bottom: 2px solid #333;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    
    .header h1 {
      font-size: 24pt;
      margin: 0 0 10px 0;
      color: #1a1a1a;
    }
    
    .header .version {
      font-size: 10pt;
      color: #666;
    }
    
    .content {
      margin-bottom: 40px;
    }
    
    .content h2 {
      font-size: 14pt;
      color: #1a1a1a;
      margin-top: 20px;
      margin-bottom: 10px;
    }
    
    .content p {
      margin-bottom: 10px;
      text-align: justify;
    }
    
    .content ul, .content ol {
      margin-bottom: 10px;
      padding-left: 20px;
    }
    
    .content li {
      margin-bottom: 5px;
    }
    
    .signature-section {
      border-top: 2px solid #333;
      padding-top: 30px;
      margin-top: 40px;
    }
    
    .signature-section h2 {
      font-size: 16pt;
      margin-bottom: 20px;
      color: #1a1a1a;
    }
    
    .signer-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .signer-info .field {
      margin-bottom: 10px;
    }
    
    .signer-info .label {
      font-size: 10pt;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .signer-info .value {
      font-size: 12pt;
      font-weight: bold;
      color: #1a1a1a;
    }
    
    .signature-image {
      margin-top: 20px;
      padding: 20px;
      border: 1px solid #ddd;
      background: #fafafa;
      text-align: center;
    }
    
    .signature-image img {
      max-width: 300px;
      max-height: 100px;
    }
    
    .signature-image .label {
      font-size: 10pt;
      color: #666;
      margin-top: 10px;
    }
    
    .legal-notice {
      margin-top: 40px;
      padding: 20px;
      background: #f5f5f5;
      border-left: 4px solid #333;
      font-size: 10pt;
      color: #666;
    }
    
    .legal-notice p {
      margin: 0 0 10px 0;
    }
    
    .legal-notice p:last-child {
      margin-bottom: 0;
    }
    
    .metadata {
      margin-top: 30px;
      font-size: 9pt;
      color: #999;
      border-top: 1px solid #ddd;
      padding-top: 15px;
    }
    
    .metadata p {
      margin: 5px 0;
    }
    
    .print-button {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 24px;
      background: #0ea5e9;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    
    .print-button:hover {
      background: #0284c7;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${data.title}</h1>
    <p class="version">Versione ${data.version}</p>
  </div>
  
  <div class="content">
    ${safeContent}
  </div>
  
  <div class="signature-section">
    <h2>Attestazione di Firma</h2>
    
    <div class="signer-info">
      <div class="field">
        <div class="label">Nome e Cognome</div>
        <div class="value">${data.signer.fullName}</div>
      </div>
      <div class="field">
        <div class="label">Codice Fiscale</div>
        <div class="value">${data.signer.fiscalCode}</div>
      </div>
      <div class="field">
        <div class="label">Data di Firma</div>
        <div class="value">${formattedDate}</div>
      </div>
      <div class="field">
        <div class="label">Ora di Firma</div>
        <div class="value">${formattedTime}</div>
      </div>
    </div>
    
    <div class="signature-image">
      <img src="${data.signer.signatureImage}" alt="Firma Digitale">
      <div class="label">Firma Digitale</div>
    </div>
  </div>
  
  <div class="legal-notice">
    <p><strong>DICHIARAZIONE DI AUTENTICITÀ</strong></p>
    <p>Il sottoscritto ${data.signer.fullName}, codice fiscale ${data.signer.fiscalCode}, dichiara di aver letto integralmente il presente documento e di accettarne tutti i termini e le condizioni ivi contenute.</p>
    <p>La firma digitale apposta è stata raccolta elettronicamente e costituisce espressione della volontà del firmatario ai sensi della normativa vigente.</p>
  </div>
  
  <div class="metadata">
    <p><strong>Metadati Tecnici</strong></p>
    <p>ID Documento: ${data.metadata.signedAt}</p>
    <p>Indirizzo IP: ${data.metadata.ipAddress}</p>
    ${data.metadata.geolocation ? `<p>Posizione: ${data.metadata.geolocation.latitude.toFixed(4)}, ${data.metadata.geolocation.longitude.toFixed(4)}</p>` : ""}
  </div>
  
  <button class="print-button no-print" onclick="window.print()">
    🖨️ Stampa / Salva PDF
  </button>
</body>
</html>
  `.trim();
}
