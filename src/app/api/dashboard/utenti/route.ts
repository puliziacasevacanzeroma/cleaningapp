import { NextResponse } from "next/server";
import { getUsers } from "~/lib/firebase/firestore-data-admin";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { resend, FROM_EMAIL, logResendWarning } from "~/lib/email/config";
import { welcomeUserEmail } from "~/lib/email/templates";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, UserCreateSchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

// Genera ID univoco
function generateId(): string {
  return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Verifica se email esiste già
async function emailExists(email: string): Promise<boolean> {
  const usersRef = adminDb.collection("users");
  const snapshot = await usersRef.get();
  const exists = snapshot.docs.some(doc => (doc.data() as Record<string, any>).email?.toLowerCase() === email.toLowerCase());
  return exists;
}

export async function GET(request: Request) {
  const user = await getApiUser();
  
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");

    const users = await getUsers(role || undefined);

    return NextResponse.json({ 
      users: users.map(u => ({
        ...u,
        _count: { properties: 0 },
        properties: [],
      }))
    });
  } catch (error) {
    console.error("Errore fetch utenti:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

// POST - Crea nuovo utente
export async function POST(request: Request) {
  const currentUser = await getApiUser();
  
  // Solo ADMIN può creare utenti
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const body = await validateBody(request, UserCreateSchema);
    if (body instanceof Response) return body;
    const { name, surname, email, phone, role, password } = body;

    // Validazione
    if (!name || !email || !role || !password) {
      return NextResponse.json({ error: "Nome, email, ruolo e password sono obbligatori" }, { status: 400 });
    }

    // Verifica ruolo valido
    const validRoles = ['ADMIN', 'PROPRIETARIO', 'OPERATORE_PULIZIE', 'RIDER', 'LAVANDERIA'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Ruolo non valido" }, { status: 400 });
    }

    // Verifica se email esiste già
    const emailAlreadyExists = await emailExists(email);
    if (emailAlreadyExists) {
      return NextResponse.json({ error: "Esiste già un utente con questa email" }, { status: 400 });
    }

    // Genera ID
    const odUserId = generateId();
    let firebaseAuthUid: string | null = null;

    // Prova a creare utente in Firebase Auth (se Admin SDK è configurato)
    if (process.env.FIREBASE_ADMIN_PROJECT_ID) {
      try {
        // Import dinamico per evitare errori se non configurato
        const { createAuthUser } = await import("~/lib/firebase/admin");
        const authUser = await createAuthUser(email, password, name);
        firebaseAuthUid = authUser.uid;
      } catch (authError: any) {
        console.error("Errore creazione Firebase Auth:", authError);
        // Se l'email esiste già in Auth, continuiamo comunque
        if (authError.code !== 'auth/email-already-exists') {
          return NextResponse.json({ 
            error: `Errore Firebase Auth: ${authError.message}` 
          }, { status: 400 });
        }
      }
    }

    // Hash password per Firestore (backup per login custom)
    const bcrypt = await import("bcryptjs");
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crea utente in Firestore
    const userData = {
      name,
      surname: surname || '',
      email: email.toLowerCase().trim(),
      phone: phone || '',
      role,
      status: 'ACTIVE',
      password: hashedPassword,
      firebaseAuthUid: firebaseAuthUid,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await adminDb.collection("users").doc(odUserId).set(userData);

    // Invia email con credenziali
    let emailSent = false;
    let emailError = null;

    if (resend) {
      try {
        const roleLabels: Record<string, string> = {
          ADMIN: 'Amministratore',
          PROPRIETARIO: 'Proprietario',
          OPERATORE_PULIZIE: 'Operatore Pulizie',
          RIDER: 'Rider',
          LAVANDERIA: 'Lavanderia',
        };

        await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: '🎉 Benvenuto in CleaningApp - Le tue credenziali di accesso',
          html: welcomeUserEmail({ name, email, password, roleLabel: roleLabels[role] || role }),
        });
        emailSent = true;
      } catch (err) {
        console.error("Errore invio email:", err);
        emailError = err instanceof Error ? err.message : 'Errore sconosciuto';
      }
    } else {
      emailError = 'Resend non configurato (RESEND_API_KEY mancante)';
    }

    return NextResponse.json({ 
      success: true, 
      userId: odUserId,
      firebaseAuthUid,
      emailSent,
      emailError,
    });

  } catch (error) {
    console.error("Errore creazione utente:", error);
    return NextResponse.json({ error: "Errore durante la creazione dell'utente" }, { status: 500 });
  }
}