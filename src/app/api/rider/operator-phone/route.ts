import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

// 📞 Restituisce il numero di telefono di un operatore (campo `phone` su users),
// usato dalla card "In Consegna" del rider per il pulsante "Chiama".
//
// Perché un'API server (Admin SDK) e non una lettura client:
//  - funziona a prescindere dalle regole Firestore;
//  - NON espone l'intera collezione users al client;
//  - restituisce SOLO telefono + nome del singolo operatore richiesto.
//
// Accesso ristretto: solo RIDER e ADMIN autenticati (privilegio minimo).
const ALLOWED_ROLES = ["RIDER", "ADMIN"];

export async function GET(req: Request) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  if (!ALLOWED_ROLES.includes((user.role || "").toUpperCase())) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const operatorId = new URL(req.url).searchParams.get("operatorId");
  if (!operatorId) {
    return NextResponse.json({ error: "operatorId mancante" }, { status: 400 });
  }

  try {
    const snap = await adminDb.collection("users").doc(operatorId).get();
    if (!snap.exists) {
      return NextResponse.json({ phone: null, name: null }, { status: 200 });
    }
    const data = snap.data() || {};
    return NextResponse.json(
      { phone: data.phone || null, name: data.name || null },
      { status: 200 }
    );
  } catch (e) {
    console.error("❌ operator-phone error:", e);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
