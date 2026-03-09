/**
 * GET  /api/auth/reset-password?token=xxx  → valida token (per preflight dal client)
 * POST /api/auth/reset-password            → { token, password } → aggiorna password
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

// ── GET: verifica token valido ────────────────────────────────
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();

  if (!token || token.length !== 64) {
    return NextResponse.json({ valid: false, error: "Token non valido" }, { status: 400 });
  }

  try {
    const snap = await adminDb
      .collection("passwordResets")
      .where("token", "==", token)
      .where("used", "==", false)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ valid: false, error: "Token non trovato o già utilizzato" }, { status: 404 });
    }

    const data = snap.docs[0]!.data() as Record<string, any>;
    const expiresAt = (data.expiresAt as any)?.toDate?.() as Date | undefined;

    if (!expiresAt || expiresAt < new Date()) {
      return NextResponse.json({ valid: false, error: "Il link è scaduto. Richiedi un nuovo reset." }, { status: 410 });
    }

    // Maschera l'email (es: ma***@gmail.com)
    const email: string = data.email ?? "";
    const [localPart, domain] = email.split("@");
    const maskedEmail = localPart && domain
      ? `${localPart.substring(0, 2)}***@${domain}`
      : email;

    const minutesLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 60000));

    return NextResponse.json({ valid: true, maskedEmail, minutesLeft });
  } catch (err) {
    console.error("[reset-password GET] Errore:", err);
    return NextResponse.json({ valid: false, error: "Errore server" }, { status: 500 });
  }
}

// ── POST: aggiorna password ───────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { token?: string; password?: string };
    const token = (body.token ?? "").trim();
    const password = body.password ?? "";

    // Validazione input
    if (!token || token.length !== 64) {
      return NextResponse.json({ error: "Token non valido" }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "La password deve avere almeno 8 caratteri" }, { status: 400 });
    }
    if (password.length > 128) {
      return NextResponse.json({ error: "Password troppo lunga" }, { status: 400 });
    }

    // Cerca token
    const snap = await adminDb
      .collection("passwordResets")
      .where("token", "==", token)
      .where("used", "==", false)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ error: "Token non trovato o già utilizzato" }, { status: 404 });
    }

    const resetDoc = snap.docs[0]!;
    const resetData = resetDoc.data() as Record<string, any>;

    // Verifica scadenza
    const expiresAt = (resetData.expiresAt as any)?.toDate?.() as Date | undefined;
    if (!expiresAt || expiresAt < new Date()) {
      return NextResponse.json({ error: "Il link è scaduto. Richiedi un nuovo reset." }, { status: 410 });
    }

    // Verifica utente esiste ancora
    const userDoc = await adminDb.collection("users").doc(resetData.userId as string).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    // Hash nuova password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Aggiorna in batch atomico
    const batch = adminDb.batch();

    // 1. Nuova password utente
    batch.update(userDoc.ref, {
      password:          hashedPassword,
      updatedAt:         Timestamp.now(),
      passwordChangedAt: Timestamp.now(),
    });

    // 2. Invalida token usato
    batch.update(resetDoc.ref, {
      used:   true,
      usedAt: Timestamp.now(),
      usedIp: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
    });

    // 3. Invalida TUTTI gli altri token attivi di questo utente
    const otherTokensSnap = await adminDb
      .collection("passwordResets")
      .where("userId", "==", resetData.userId)
      .where("used", "==", false)
      .get();

    otherTokensSnap.docs.forEach((d: QueryDocumentSnapshot) => {
      if (d.id !== resetDoc.id) {
        batch.update(d.ref, { used: true, invalidatedAt: Timestamp.now() });
      }
    });

    await batch.commit();

    return NextResponse.json({ ok: true, message: "Password aggiornata con successo" });
  } catch (err) {
    console.error("[reset-password POST] Errore:", err);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}
