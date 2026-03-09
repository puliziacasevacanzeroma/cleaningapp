import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";


// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface IssueData {
  propertyId: string;
  propertyName: string;
  cleaningId: string;
  
  // Chi ha segnalato
  reportedBy: string;
  reportedByName: string;
  
  // Dettagli problema
  type: 'damage' | 'missing_item' | 'maintenance' | 'cleanliness' | 'safety' | 'other';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  photos: string[];
  
  // Stato
  status: 'open' | 'in_progress' | 'resolved';
  resolved: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET - Recupera issues (filtrati per propertyId o tutti)
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  // ─────────────────────────────────────────────────────

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const cleaningId = searchParams.get("cleaningId");
    const status = searchParams.get("status"); // open, resolved, all
    const onlyOpen = searchParams.get("onlyOpen") === "true";
    
    let q: FirebaseFirestore.Query;
    
    if (cleaningId) {
      // Issues per una specifica pulizia (senza orderBy per evitare indice composito)
      q = adminDb.collection("issues").where("cleaningId", "==", cleaningId);
    } else if (propertyId) {
      // Issues per una specifica proprietà
      if (onlyOpen) {
        q = adminDb.collection("issues").where("propertyId", "==", propertyId).where("resolved", "==", false).orderBy("reportedAt", "desc");
      } else {
        q = adminDb.collection("issues").where("propertyId", "==", propertyId).orderBy("reportedAt", "desc");
      }
    } else {
      // Tutti gli issues (per admin)
      if (status === "open") {
        q = adminDb.collection("issues").where("resolved", "==", false).orderBy("reportedAt", "desc");
      } else if (status === "resolved") {
        q = adminDb.collection("issues").where("resolved", "==", true).orderBy("resolvedAt", "desc");
      } else {
        q = adminDb.collection("issues").orderBy("reportedAt", "desc");
      }
    }
    
    const snapshot = await q.get();
    const issues = snapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as Record<string, any>),
      reportedAt: (doc.data() as Record<string, any>).reportedAt?.toDate?.()?.toISOString() || null,
      resolvedAt: (doc.data() as Record<string, any>).resolvedAt?.toDate?.()?.toISOString() || null,
    }));
    
    return NextResponse.json({ issues });
    
  } catch (error) {
    console.error("Errore GET issues:", error);
    return NextResponse.json(
      { error: "Errore nel recupero delle segnalazioni" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST - Crea nuovo issue
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  // ─────────────────────────────────────────────────────

    const body = await validateBody(request, GenericBodySchema);
    if (body instanceof Response) return body;
    
    const {
      propertyId,
      propertyName,
      cleaningId,
      reportedBy,
      reportedByName,
      type,
      title,
      description,
      severity,
      photos = [],
    } = body;
    
    // Validazione
    if (!propertyId || !cleaningId || !type || !title || !description) {
      return NextResponse.json(
        { error: "Campi obbligatori mancanti" },
        { status: 400 }
      );
    }
    
    const issueData = {
      propertyId,
      propertyName: propertyName || "",
      cleaningId,
      
      reportedBy: reportedBy || "unknown",
      reportedByName: reportedByName || "Operatore",
      reportedAt: Timestamp.now(),
      
      type,
      title,
      description,
      severity: severity || "medium",
      photos,
      
      status: "open",
      resolved: false,
      
      resolvedAt: null,
      resolvedBy: null,
      resolvedByName: null,
      resolvedInCleaningId: null,
      resolutionNotes: null,
      resolutionPhotos: [],
      
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    
    const docRef = await adminDb.collection("issues").add( issueData);
    
    // ═══════════════════════════════════════════════════════════════════════
    // NOTIFICHE
    // ═══════════════════════════════════════════════════════════════════════
    
    // Notifica Admin
    await adminDb.collection("notifications").add( {
      title: `⚠️ Nuova segnalazione: ${title}`,
      // @ts-expect-error TODO-FIX: TS2339 Property 'substring' does not exist on type '{}'.
      message: `${reportedByName || "Un operatore"} ha segnalato un problema in ${propertyName || "una proprietà"}: ${description.substring(0, 100)}...`,
      type: severity === "critical" ? "WARNING" : "INFO",
      recipientRole: "ADMIN",
      recipientId: null,
      senderId: reportedBy || "system",
      senderName: reportedByName || "Sistema",
      status: "UNREAD",
      actionRequired: severity === "critical" || severity === "high",
      relatedType: "issue",
      relatedId: docRef.id,
      link: `/dashboard/segnalazioni?id=${docRef.id}`,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    // Notifica Proprietario
    if (propertyId) {
      try {
        // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
        const propertySnap = await adminDb.collection("properties").doc(propertyId).get();
        if (propertySnap.exists) {
          const ownerId = (propertySnap.data() as Record<string, any>).ownerId;
          if (ownerId) {
            await adminDb.collection("notifications").add( {
              title: `⚠️ Problema segnalato: ${title}`,
              // @ts-expect-error TODO-FIX: TS2339 Property 'substring' does not exist on type '{}'.
              message: `È stato segnalato un problema nella tua proprietà "${propertyName}": ${description.substring(0, 100)}...`,
              type: severity === "critical" ? "WARNING" : "INFO",
              recipientRole: "PROPRIETARIO",
              recipientId: ownerId,
              senderId: reportedBy || "system",
              senderName: reportedByName || "Sistema",
              status: "UNREAD",
              actionRequired: false,
              relatedType: "issue",
              relatedId: docRef.id,
              link: `/proprietario/segnalazioni?id=${docRef.id}`,
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            });
          }
        }
      } catch (e) {
        console.error("Errore notifica proprietario:", e);
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      id: docRef.id,
      message: "Segnalazione creata con successo"
    });
    
  } catch (error) {
    console.error("Errore POST issue:", error);
    return NextResponse.json(
      { error: "Errore nella creazione della segnalazione" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUT - Aggiorna issue (es: risoluzione)
// ═══════════════════════════════════════════════════════════════════════════

export async function PUT(request: NextRequest) {
  try {
    const body = await validateBody(request, GenericBodySchema);
    if (body instanceof Response) return body;
    const { 
      issueId, 
      action,
      resolvedBy,
      resolvedByName,
      resolvedInCleaningId,
      resolutionNotes,
      resolutionPhotos = [],
    } = body;
    
    if (!issueId) {
      return NextResponse.json(
        { error: "ID segnalazione mancante" },
        { status: 400 }
      );
    }
    
    // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
    const issueRef = adminDb.collection("issues").doc(issueId);
    const issueSnap = await issueRef.get();
    
    if (!issueSnap.exists) {
      return NextResponse.json(
        { error: "Segnalazione non trovata" },
        { status: 404 }
      );
    }
    
    const issueData = issueSnap.data() as Record<string, any>;
    
    if (action === "resolve") {
      // Risolvi issue
      await issueRef.update( {
        status: "resolved",
        resolved: true,
        resolvedAt: Timestamp.now(),
        resolvedBy: resolvedBy || null,
        resolvedByName: resolvedByName || null,
        resolvedInCleaningId: resolvedInCleaningId || null,
        resolutionNotes: resolutionNotes || null,
        resolutionPhotos: resolutionPhotos,
        updatedAt: Timestamp.now(),
      });
      
      // Notifica Proprietario della risoluzione
      if (issueData.propertyId) {
        try {
          const propertySnap = await adminDb.collection("properties").doc(issueData.propertyId).get();
          if (propertySnap.exists) {
            const ownerId = (propertySnap.data() as Record<string, any>).ownerId;
            if (ownerId) {
              await adminDb.collection("notifications").add( {
                title: `✅ Problema risolto: ${issueData.title}`,
                message: `Il problema "${issueData.title}" nella proprietà "${issueData.propertyName}" è stato risolto.${resolutionNotes ? ` Note: ${resolutionNotes}` : ""}`,
                type: "SUCCESS",
                recipientRole: "PROPRIETARIO",
                recipientId: ownerId,
                senderId: resolvedBy || "system",
                senderName: resolvedByName || "Sistema",
                status: "UNREAD",
                actionRequired: false,
                relatedType: "issue",
                relatedId: issueId,
                link: `/proprietario/segnalazioni?id=${issueId}`,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
              });
            }
          }
        } catch (e) {
          console.error("Errore notifica risoluzione:", e);
        }
      }
      
      // Notifica Admin
      await adminDb.collection("notifications").add( {
        title: `✅ Segnalazione risolta: ${issueData.title}`,
        message: `${resolvedByName || "Un operatore"} ha risolto il problema "${issueData.title}" in ${issueData.propertyName}.`,
        type: "SUCCESS",
        recipientRole: "ADMIN",
        recipientId: null,
        senderId: resolvedBy || "system",
        senderName: resolvedByName || "Sistema",
        status: "UNREAD",
        actionRequired: false,
        relatedType: "issue",
        relatedId: issueId,
        link: `/dashboard/segnalazioni?id=${issueId}`,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      
      return NextResponse.json({ 
        success: true, 
        message: "Segnalazione risolta con successo" 
      });
      
    } else if (action === "reopen") {
      // Riapri issue
      await issueRef.update( {
        status: "open",
        resolved: false,
        resolvedAt: null,
        resolvedBy: null,
        resolvedByName: null,
        resolvedInCleaningId: null,
        resolutionNotes: null,
        resolutionPhotos: [],
        updatedAt: Timestamp.now(),
      });
      
      return NextResponse.json({ 
        success: true, 
        message: "Segnalazione riaperta" 
      });
      
    } else {
      // Aggiornamento generico
      const updateData: any = { updatedAt: Timestamp.now() };
      
      if (body.title) updateData.title = body.title;
      if (body.description) updateData.description = body.description;
      if (body.severity) updateData.severity = body.severity;
      if (body.photos) updateData.photos = body.photos;
      if (body.status) updateData.status = body.status;
      
      await issueRef.update( updateData);
      
      return NextResponse.json({ 
        success: true, 
        message: "Segnalazione aggiornata" 
      });
    }
    
  } catch (error) {
    console.error("Errore PUT issue:", error);
    return NextResponse.json(
      { error: "Errore nell'aggiornamento della segnalazione" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE - Elimina issue (solo admin)
// ═══════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  try {
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  // ─────────────────────────────────────────────────────

    const { searchParams } = new URL(request.url);
    const issueId = searchParams.get("id");
    
    if (!issueId) {
      return NextResponse.json(
        { error: "ID segnalazione mancante" },
        { status: 400 }
      );
    }
    
    await adminDb.collection("issues").doc(issueId).delete();
    
    return NextResponse.json({ 
      success: true, 
      message: "Segnalazione eliminata" 
    });
    
  } catch (error) {
    console.error("Errore DELETE issue:", error);
    return NextResponse.json(
      { error: "Errore nell'eliminazione della segnalazione" },
      { status: 500 }
    );
  }
}
