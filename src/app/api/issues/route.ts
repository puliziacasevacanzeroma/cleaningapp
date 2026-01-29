import { NextRequest, NextResponse } from "next/server";
import { db } from "~/lib/firebase/config";
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDocs, 
  getDoc,
  query, 
  where, 
  orderBy, 
  Timestamp,
  deleteDoc 
} from "firebase/firestore";

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
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const status = searchParams.get("status"); // open, resolved, all
    const onlyOpen = searchParams.get("onlyOpen") === "true";
    
    let q;
    
    if (propertyId) {
      // Issues per una specifica proprietà
      if (onlyOpen) {
        q = query(
          collection(db, "issues"),
          where("propertyId", "==", propertyId),
          where("resolved", "==", false),
          orderBy("reportedAt", "desc")
        );
      } else {
        q = query(
          collection(db, "issues"),
          where("propertyId", "==", propertyId),
          orderBy("reportedAt", "desc")
        );
      }
    } else {
      // Tutti gli issues (per admin)
      if (status === "open") {
        q = query(
          collection(db, "issues"),
          where("resolved", "==", false),
          orderBy("reportedAt", "desc")
        );
      } else if (status === "resolved") {
        q = query(
          collection(db, "issues"),
          where("resolved", "==", true),
          orderBy("resolvedAt", "desc")
        );
      } else {
        q = query(
          collection(db, "issues"),
          orderBy("reportedAt", "desc")
        );
      }
    }
    
    const snapshot = await getDocs(q);
    const issues = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      reportedAt: doc.data().reportedAt?.toDate?.()?.toISOString() || null,
      resolvedAt: doc.data().resolvedAt?.toDate?.()?.toISOString() || null,
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
    const body = await request.json();
    
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
    
    const docRef = await addDoc(collection(db, "issues"), issueData);
    
    // ═══════════════════════════════════════════════════════════════════════
    // NOTIFICHE
    // ═══════════════════════════════════════════════════════════════════════
    
    // Notifica Admin
    await addDoc(collection(db, "notifications"), {
      title: `⚠️ Nuova segnalazione: ${title}`,
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
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    // Notifica Proprietario
    if (propertyId) {
      try {
        const propertySnap = await getDoc(doc(db, "properties", propertyId));
        if (propertySnap.exists()) {
          const ownerId = propertySnap.data().ownerId;
          if (ownerId) {
            await addDoc(collection(db, "notifications"), {
              title: `⚠️ Problema segnalato: ${title}`,
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
    const body = await request.json();
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
    
    const issueRef = doc(db, "issues", issueId);
    const issueSnap = await getDoc(issueRef);
    
    if (!issueSnap.exists()) {
      return NextResponse.json(
        { error: "Segnalazione non trovata" },
        { status: 404 }
      );
    }
    
    const issueData = issueSnap.data();
    
    if (action === "resolve") {
      // Risolvi issue
      await updateDoc(issueRef, {
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
          const propertySnap = await getDoc(doc(db, "properties", issueData.propertyId));
          if (propertySnap.exists()) {
            const ownerId = propertySnap.data().ownerId;
            if (ownerId) {
              await addDoc(collection(db, "notifications"), {
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
      await addDoc(collection(db, "notifications"), {
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
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      
      return NextResponse.json({ 
        success: true, 
        message: "Segnalazione risolta con successo" 
      });
      
    } else if (action === "reopen") {
      // Riapri issue
      await updateDoc(issueRef, {
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
      
      await updateDoc(issueRef, updateData);
      
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
    const { searchParams } = new URL(request.url);
    const issueId = searchParams.get("id");
    
    if (!issueId) {
      return NextResponse.json(
        { error: "ID segnalazione mancante" },
        { status: 400 }
      );
    }
    
    await deleteDoc(doc(db, "issues", issueId));
    
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
