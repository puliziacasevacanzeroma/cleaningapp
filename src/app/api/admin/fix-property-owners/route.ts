/**
 * POST /api/admin/fix-property-owners
 * 
 * Corregge TUTTE le proprietà con ownerId="pending" o ownerId=""
 * cercando l'utente corrispondente per ownerEmail.
 * Solo admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    let fixed = 0;
    let notFound = 0;
    let errors = 0;
    const results: string[] = [];

    // Carica tutte le proprietà con ownerId problematico
    const [pendingSnap, emptySnap] = await Promise.all([
      adminDb.collection("properties").where("ownerId", "==", "pending").get(),
      adminDb.collection("properties").where("ownerId", "==", "").get(),
    ]);

    const problemProps = [
      ...pendingSnap.docs.map(d => ({ id: d.id, ...d.data() as any })),
      ...emptySnap.docs.map(d => ({ id: d.id, ...d.data() as any })),
    ];

    if (problemProps.length === 0) {
      return NextResponse.json({
        success: true,
        fixed: 0, notFound: 0, errors: 0,
        message: "Nessuna proprietà con ownerId problematico trovata",
        results: [],
      });
    }

    // Cache utenti per email (evita query duplicate)
    const userByEmail = new Map<string, { id: string; name: string; email: string }>();

    for (const prop of problemProps) {
      try {
        const ownerEmail = (prop.ownerEmail || "").toLowerCase().trim();

        if (!ownerEmail) {
          results.push(`❌ ${prop.name}: ownerEmail vuota — impossibile trovare il proprietario`);
          notFound++;
          continue;
        }

        // Cerca in cache prima
        let ownerUser = userByEmail.get(ownerEmail);

        if (!ownerUser) {
          // Cerca utente per email
          const userSnap = await adminDb.collection("users")
            .where("email", "==", ownerEmail)
            .limit(1)
            .get();

          if (userSnap.empty) {
            results.push(`❌ ${prop.name}: utente con email "${ownerEmail}" non trovato`);
            notFound++;
            continue;
          }

          const userDoc = userSnap.docs[0];
          ownerUser = {
            id: userDoc.id,
            name: (userDoc.data() as any).name || "",
            email: ownerEmail,
          };
          userByEmail.set(ownerEmail, ownerUser);
        }

        // Aggiorna ownerId sulla proprietà
        await adminDb.collection("properties").doc(prop.id).update({
          ownerId: ownerUser.id,
          ownerName: ownerUser.name || prop.ownerName || "",
          updatedAt: Timestamp.now(),
        });

        results.push(`✅ ${prop.name} [${prop.status}]: ownerId aggiornato a ${ownerUser.id} (${ownerEmail})`);
        fixed++;

        // Se la proprietà è PENDING_SIGNATURE, invia notifica al proprietario
        if (prop.status === "PENDING_SIGNATURE") {
          try {
            await adminDb.collection("notifications").add({
              title: "Proprietà Approvata! 🎉",
              message: `La tua proprietà "${prop.name}" è stata approvata con prezzo pulizia di €${prop.cleaningPrice || 0}. Vai nella sezione Proprietà e firma l'Allegato D per attivarla.`,
              type: "SUCCESS",
              recipientRole: "PROPRIETARIO",
              recipientId: ownerUser.id,
              senderId: "system",
              senderName: "Sistema",
              relatedEntityId: prop.id,
              relatedEntityType: "PROPERTY",
              relatedEntityName: prop.name,
              link: "/proprietario/proprieta",
              status: "UNREAD",
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            });
            results.push(`  📬 Notifica PENDING_SIGNATURE inviata a ${ownerUser.name}`);
          } catch (notifErr) {
            results.push(`  ⚠️ Notifica non inviata: ${notifErr}`);
          }
        }

      } catch (err: any) {
        results.push(`❌ ${prop.name}: errore — ${err.message}`);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      fixed,
      notFound,
      errors,
      total: problemProps.length,
      results,
    });

  } catch (error: any) {
    console.error("Errore fix-property-owners:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
