/**
 * API: POST /api/auth/register
 * 
 * Registra un nuovo utente proprietario.
 * - Hasha la password con bcrypt
 * - Crea utente in Firestore
 * - Invia notifica all'admin
 * - Ritorna utente per login automatico
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import bcrypt from "bcryptjs";
import { validateBody, RegisterSchema } from "~/lib/validation/schemas";

interface RegisterRequest {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await validateBody(request, RegisterSchema);
    if (body instanceof Response) return body;
    const { name, email, phone, password } = body;

    if (password.length < 6) {
      return NextResponse.json(
        { error: "La password deve avere almeno 6 caratteri" },
        { status: 400 }
      );
    }

    // Normalizza email
    const normalizedEmail = email.trim().toLowerCase();

    // Verifica se l'email esiste già
    const existingUserQuery = adminDb.collection("users").where("email", "==", normalizedEmail);
    
    const existingUsers = await existingUserQuery.get();
    
    if (!existingUsers.empty) {
      return NextResponse.json(
        { error: "Questa email è già registrata. Prova ad accedere." },
        { status: 409 }
      );
    }

    // Hash password con bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Crea utente in Firestore
    const userData = {
      email: normalizedEmail,
      name: name.trim(),
      phone: phone.trim(),
      password: hashedPassword, // Password hashata con bcrypt
      role: "PROPRIETARIO",
      status: "PENDING_BILLING", // Primo step onboarding: fatturazione prima del contratto
      contractAccepted: false,
      billingCompleted: false,
      registrationMethod: "self",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await adminDb.collection("users").add(userData);
    const userId = docRef.id;

    // Invia notifica all'admin
    try {
      await adminDb.collection("notifications").add({
        title: "Nuova Registrazione",
        message: `${name.trim()} (${normalizedEmail}) si è registrato e sta completando l'onboarding.`,
        type: "NEW_REGISTRATION",
        recipientRole: "ADMIN",
        senderId: userId,
        senderName: name.trim(),
        senderEmail: normalizedEmail,
        relatedEntityId: userId,
        relatedEntityType: "USER",
        relatedEntityName: name.trim(),
        actionRequired: false, // Diventerà true quando completa onboarding
        status: "UNREAD",
        link: `/dashboard/utenti`,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    } catch (notifError) {
      console.warn("⚠️ Errore invio notifica:", notifError);
    }

    // Ritorna utente per login automatico (senza password!)
    const userResponse = {
      id: userId,
      email: normalizedEmail,
      name: name.trim(),
      phone: phone.trim(),
      role: "PROPRIETARIO",
      status: "PENDING_BILLING",
      contractAccepted: false,
      billingCompleted: false,
    };

    return NextResponse.json({
      success: true,
      message: "Registrazione completata",
      user: userResponse,
    });

  } catch (error) {
    console.error("❌ Errore registrazione:", error);
    return NextResponse.json(
      { error: "Errore durante la registrazione. Riprova." },
      { status: 500 }
    );
  }
}
