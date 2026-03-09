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

// GET /api/admin/contracts/[id] — Leggi documento completo
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const doc = await adminDb.collection("regulationDocuments").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Documento non trovato" }, { status: 404 });
    }

    const data = doc.data()!;
    return NextResponse.json({
      success: true,
      document: {
        id: doc.id,
        type: data.type || "",
        title: data.title || "",
        version: data.version || "",
        content: data.content || "",
        hash: data.hash || "",
        isActive: data.isActive === true,
        isDraft: data.isDraft === true,
        changelog: data.changelog || "",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Errore: " + (error instanceof Error ? error.message : "sconosciuto") }, { status: 500 });
  }
}

// PUT /api/admin/contracts/[id] — Aggiorna contenuto (crea nuova versione)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { content, title } = body;

    if (!content || content.length < 100) {
      return NextResponse.json({ error: "Contenuto troppo corto" }, { status: 400 });
    }

    const docRef = adminDb.collection("regulationDocuments").doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Documento non trovato" }, { status: 404 });
    }

    const oldData = doc.data()!;
    const newHash = await generateHash(content);

    // Se hash è uguale, non serve aggiornare
    if (newHash === oldData.hash) {
      return NextResponse.json({ success: true, message: "Nessuna modifica rilevata (stesso contenuto)" });
    }

    // Incrementa versione
    const oldVersion = oldData.version || "2.0";
    const versionParts = oldVersion.split(".");
    const newVersion = `${versionParts[0]}.${parseInt(versionParts[1] || "0") + 1}`;

    await docRef.update({
      content,
      title: title || oldData.title,
      hash: newHash,
      version: newVersion,
      updatedAt: Timestamp.now(),
      updatedBy: user.id,
      publishedAt: Timestamp.now(),
      publishedBy: user.id,
      changelog: `Aggiornato a v${newVersion} da ${user.name || user.email} il ${new Date().toLocaleDateString("it-IT")}`,
    });

    return NextResponse.json({
      success: true,
      message: `Contratto aggiornato a v${newVersion}. I clienti dovranno ri-accettare.`,
      newVersion,
      newHash: newHash.substring(0, 16) + "...",
    });
  } catch (error) {
    return NextResponse.json({ error: "Errore: " + (error instanceof Error ? error.message : "sconosciuto") }, { status: 500 });
  }
}

// PATCH /api/admin/contracts/[id] — Toggle attivo/inattivo
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { isActive } = body;

    const docRef = adminDb.collection("regulationDocuments").doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Documento non trovato" }, { status: 404 });
    }

    await docRef.update({
      isActive: isActive === true,
      updatedAt: Timestamp.now(),
      updatedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      message: `Documento ${isActive ? "attivato" : "disattivato"}`,
    });
  } catch (error) {
    return NextResponse.json({ error: "Errore: " + (error instanceof Error ? error.message : "sconosciuto") }, { status: 500 });
  }
}
