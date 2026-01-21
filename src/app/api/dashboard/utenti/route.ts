import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUsers } from "~/lib/firebase/firestore-data";
import { doc, setDoc, Timestamp, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { Resend } from "resend";

export const dynamic = 'force-dynamic';

// Inizializza Resend (la chiave va in .env come RESEND_API_KEY)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) {
      return JSON.parse(decodeURIComponent(userCookie.value));
    }
    return null;
  } catch {
    return null;
  }
}

// Genera ID univoco
function generateId(): string {
  return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Verifica se email esiste già
async function emailExists(email: string): Promise<boolean> {
  const usersRef = collection(db, "users");
  const snapshot = await getDocs(usersRef);
  const exists = snapshot.docs.some(doc => doc.data().email?.toLowerCase() === email.toLowerCase());
  return exists;
}

export async function GET(request: Request) {
  const user = await getFirebaseUser();
  
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
  const currentUser = await getFirebaseUser();
  
  // Solo ADMIN può creare utenti
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, surname, email, phone, role, password } = body;

    // Validazione
    if (!name || !email || !role || !password) {
      return NextResponse.json({ error: "Nome, email, ruolo e password sono obbligatori" }, { status: 400 });
    }

    // Verifica ruolo valido
    const validRoles = ['ADMIN', 'PROPRIETARIO', 'OPERATORE_PULIZIE', 'RIDER'];
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
      email,
      phone: phone || '',
      role,
      status: 'ACTIVE',
      password: hashedPassword,
      firebaseAuthUid: firebaseAuthUid,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await setDoc(doc(db, "users", odUserId), userData);

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
        };

        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'CleaningApp <onboarding@resend.dev>',
          to: email,
          subject: '🎉 Benvenuto in CleaningApp - Le tue credenziali di accesso',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5;">
              <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 28px;">🏠 CleaningApp</h1>
                  <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Gestionale Pulizie Professionale</p>
                </div>
                
                <div style="background: white; border-radius: 0 0 16px 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                  <h2 style="color: #1f2937; margin: 0 0 20px 0;">Ciao ${name}! 👋</h2>
                  
                  <p style="color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
                    Il tuo account <strong>${roleLabels[role] || role}</strong> è stato creato con successo.
                    Ecco le tue credenziali per accedere alla piattaforma:
                  </p>
                  
                  <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0;">
                    <div style="margin-bottom: 16px;">
                      <span style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Email</span>
                      <p style="color: #1e293b; font-size: 18px; font-weight: 600; margin: 4px 0 0 0;">${email}</p>
                    </div>
                    <div>
                      <span style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Password</span>
                      <p style="color: #1e293b; font-size: 18px; font-weight: 600; margin: 4px 0 0 0; font-family: monospace; background: #fef3c7; padding: 8px 12px; border-radius: 6px; display: inline-block;">${password}</p>
                    </div>
                  </div>
                  
                  <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
                    <p style="color: #92400e; margin: 0; font-size: 14px;">
                      ⚠️ <strong>Importante:</strong> Ti consigliamo di cambiare la password al primo accesso.
                    </p>
                  </div>
                  
                  <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login" 
                     style="display: block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 600; text-align: center; margin-top: 24px;">
                    🚀 Accedi Ora
                  </a>
                  
                  <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 24px 0 0 0;">
                    Se non hai richiesto questo account, ignora questa email.
                  </p>
                </div>
                
                <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
                  © ${new Date().getFullYear()} CleaningApp. Tutti i diritti riservati.
                </p>
              </div>
            </body>
            </html>
          `,
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