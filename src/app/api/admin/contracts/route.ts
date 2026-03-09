import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

async function generateHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const snapshot = await adminDb.collection("regulationDocuments").orderBy("createdAt", "desc").get();

    const documents = snapshot.docs.map((doc) => {
      const data = doc.data();
      const content = data.content || "";
      return {
        id: doc.id,
        type: data.type || "",
        title: data.title || "Senza titolo",
        version: data.version || "—",
        isActive: data.isActive === true,
        isDraft: data.isDraft === true,
        hash: data.hash || "",
        contentLength: content.length,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || "",
        publishedAt: data.publishedAt?.toDate?.()?.toISOString?.() || "",
        changelog: data.changelog || "",
        hasReverseCharge: content.includes("Reverse Charge"),
      };
    });

    return NextResponse.json({ success: true, documents });
  } catch (error) {
    return NextResponse.json({ error: "Errore: " + (error instanceof Error ? error.message : "sconosciuto") }, { status: 500 });
  }
}

/**
 * POST /api/admin/contracts
 * Upload di un file HTML come nuovo contratto.
 * Body: { content, type, title }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await request.json();
    const { content, type, title } = body;

    if (!content || content.length < 100) {
      return NextResponse.json({ error: "Contenuto HTML troppo corto o mancante" }, { status: 400 });
    }
    if (!type) {
      return NextResponse.json({ error: "Tipo documento mancante (contratto_quadro_servizio o allegato_d_template)" }, { status: 400 });
    }

    const hash = await generateHash(content);

    // Controlla se esiste già un documento con lo stesso hash
    const existingHash = await adminDb.collection("regulationDocuments").where("hash", "==", hash).get();
    if (!existingHash.empty) {
      return NextResponse.json({ success: false, error: "Questo contenuto è identico a un documento già presente. Nessuna modifica necessaria." }, { status: 409 });
    }

    // Disattiva i documenti precedenti dello stesso tipo
    const oldDocs = await adminDb.collection("regulationDocuments").where("type", "==", type).where("isActive", "==", true).get();
    let deactivated = 0;
    for (const doc of oldDocs.docs) {
      await doc.ref.update({ isActive: false, updatedAt: Timestamp.now(), updatedBy: user.id });
      deactivated++;
    }

    // Disattiva anche eventuali documenti legacy senza type (es. vecchio "current")
    if (type === "contratto_quadro_servizio") {
      const allActive = await adminDb.collection("regulationDocuments").where("isActive", "==", true).get();
      for (const doc of allActive.docs) {
        const docType = doc.data().type || "";
        if (!docType || docType === "NESSUN_TYPE") {
          await doc.ref.update({ isActive: false, updatedAt: Timestamp.now(), updatedBy: user.id });
          deactivated++;
        }
      }
    }

    // Determina versione
    let maxVersion = "2.0";
    const allOfType = await adminDb.collection("regulationDocuments").where("type", "==", type).orderBy("createdAt", "desc").limit(1).get();
    if (!allOfType.empty) {
      const lastVersion = allOfType.docs[0]!.data().version || "2.0";
      const parts = lastVersion.split(".");
      maxVersion = `${parts[0]}.${parseInt(parts[1] || "0") + 1}`;
    }

    // Applicabilità
    const applicableTo = type === "allegato_d_template"
      ? ["PROPRIETARIO", "OWNER", "CLIENTE"]
      : ["PROPRIETARIO", "OWNER", "CLIENTE", "ALL"];

    // Crea nuovo documento
    const ref = await adminDb.collection("regulationDocuments").add({
      type,
      version: maxVersion,
      title: title || (type === "contratto_quadro_servizio" ? "Contratto Quadro di Servizio e Allegati" : "Allegato D – Scheda Servizio Proprietà"),
      content,
      hash,
      applicableTo,
      effectiveFrom: Timestamp.now(),
      isActive: true,
      isDraft: false,
      createdAt: Timestamp.now(),
      createdBy: user.id,
      publishedAt: Timestamp.now(),
      publishedBy: user.id,
      changelog: `Caricato v${maxVersion} da ${user.name || user.email} il ${new Date().toLocaleDateString("it-IT")}`,
    });

    return NextResponse.json({
      success: true,
      message: `Documento caricato come v${maxVersion}. ${deactivated} versioni precedenti disattivate.`,
      documentId: ref.id,
      version: maxVersion,
    });
  } catch (error) {
    return NextResponse.json({ error: "Errore: " + (error instanceof Error ? error.message : "sconosciuto") }, { status: 500 });
  }
}
