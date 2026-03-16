/**
 * POST /api/admin/fix-pending-now
 * Fix diretto di tutte le proprietà con ownerId sbagliato
 * usando gli ID noti dal debug JSON.
 * Solo admin. Da eliminare dopo l'uso.
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

    const results: string[] = [];
    let fixed = 0;

    // ── Cerca tutti gli utenti con role PROPRIETARIO o OWNER ──
    // per trovare a chi appartengono le proprietà senza email
    const usersSnap = await adminDb.collection("users").get();
    const allUsers = usersSnap.docs.map(d => ({
      id: d.id,
      ...(d.data() as Record<string, any>),
    }));

    // ── Carica tutte le proprietà con ownerId problematico ──
    const [pendingSnap, emptySnap] = await Promise.all([
      adminDb.collection("properties").where("ownerId", "==", "pending").get(),
      adminDb.collection("properties").where("ownerId", "==", "").get(),
    ]);

    // Carica anche proprietà con ownerId che inizia con "user_" (vecchio formato)
    const allPropsSnap = await adminDb.collection("properties").get();
    const oldFormatProps = allPropsSnap.docs.filter(d => {
      const ownerId = (d.data() as any).ownerId || "";
      return ownerId.startsWith("user_") || (ownerId.includes("_") && ownerId.length > 25 && ownerId !== "pending");
    });

    const problemProps = [
      ...pendingSnap.docs.map(d => ({ id: d.id, ...d.data() as any })),
      ...emptySnap.docs.map(d => ({ id: d.id, ...d.data() as any })),
      ...oldFormatProps.map(d => ({ id: d.id, ...d.data() as any })),
    ];

    // Deduplicazione
    const seen = new Set<string>();
    const uniqueProps = problemProps.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    if (uniqueProps.length === 0) {
      return NextResponse.json({
        success: true, fixed: 0,
        message: "Nessuna proprietà problematica trovata",
        results: [],
      });
    }

    for (const prop of uniqueProps) {
      // Strategie di ricerca del proprietario (in ordine di priorità):
      let foundUser: any = null;

      // 1. Cerca per ownerEmail (se presente)
      if (prop.ownerEmail) {
        foundUser = allUsers.find(u =>
          u.email?.toLowerCase() === prop.ownerEmail.toLowerCase()
        );
      }

      // 2. Cerca per ownerName (match esatto o parziale)
      if (!foundUser && prop.ownerName && prop.ownerName !== "—") {
        foundUser = allUsers.find(u =>
          u.name?.toLowerCase() === prop.ownerName.toLowerCase()
        );
        if (!foundUser) {
          // Match parziale
          foundUser = allUsers.find(u =>
            u.name && prop.ownerName &&
            (u.name.toLowerCase().includes(prop.ownerName.toLowerCase()) ||
             prop.ownerName.toLowerCase().includes(u.name.toLowerCase()))
          );
        }
      }

      // 3. Se ownerId era "user_XXX" cerca l'utente che ha quell'id nel campo interno
      if (!foundUser && prop.ownerId && prop.ownerId.startsWith("user_")) {
        foundUser = allUsers.find(u => u.id === prop.ownerId || (u as any).legacyId === prop.ownerId);
        // Cerca anche per ownerId come campo interno del documento
        if (!foundUser) {
          const byOldId = await adminDb.collection("users")
            .where("id", "==", prop.ownerId)
            .limit(1)
            .get();
          if (!byOldId.empty) {
            foundUser = { id: byOldId.docs[0].id, ...byOldId.docs[0].data() };
          }
        }
      }

      if (!foundUser) {
        results.push(`⚠️ ${prop.name} [${prop.status}]: proprietario non trovato (ownerEmail="${prop.ownerEmail}", ownerName="${prop.ownerName}", ownerId="${prop.ownerId}")`);
        continue;
      }

      // Aggiorna ownerId
      await adminDb.collection("properties").doc(prop.id).update({
        ownerId: foundUser.id,
        ownerName: foundUser.name || prop.ownerName || "",
        ownerEmail: foundUser.email || prop.ownerEmail || "",
        updatedAt: Timestamp.now(),
      });

      results.push(`✅ ${prop.name} [${prop.status}]: ownerId → ${foundUser.id} (${foundUser.email || foundUser.name})`);
      fixed++;

      // Invia notifica se PENDING_SIGNATURE
      if (prop.status === "PENDING_SIGNATURE") {
        try {
          await adminDb.collection("notifications").add({
            title: "Proprietà Approvata! 🎉",
            message: `La tua proprietà "${prop.name}" è stata approvata con prezzo pulizia di €${prop.cleaningPrice || 0}. Vai nella sezione Proprietà e firma l'Allegato D per attivarla.`,
            type: "SUCCESS",
            recipientRole: "PROPRIETARIO",
            recipientId: foundUser.id,
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
          results.push(`  📬 Notifica inviata a ${foundUser.name || foundUser.email}`);
        } catch (e) {
          results.push(`  ⚠️ Notifica non inviata: ${e}`);
        }
      }
    }

    // Mostra tutti gli utenti trovati (per debug)
    const proprietari = allUsers
      .filter(u => ["PROPRIETARIO", "OWNER", "CLIENTE"].includes((u.role || "").toUpperCase()))
      .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role }));

    return NextResponse.json({
      success: true,
      fixed,
      total: uniqueProps.length,
      results,
      proprietari_nel_db: proprietari,
    });

  } catch (error: any) {
    console.error("Errore fix-pending-now:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
