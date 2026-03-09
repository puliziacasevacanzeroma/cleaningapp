import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

// ─── Tipi locali ────────────────────────────────────────────────────────────
interface FirestoreCleaning {
  id?: string;
  ownerId?: string;
  operatorId?: string;
  operators?: { id: string }[];
  propertyId?: string;
  ratingId?: string;
  scheduledDate?: { toDate?: () => Date };
  startedAt?: { toDate?: () => Date };
  completedAt?: { toDate?: () => Date };
  duration?: number;
  status?: string;
  [key: string]: unknown;
}



// ═══════════════════════════════════════════════════════════════
// GET - Riepilogo completo pulizia (foto, issues, rating, etc.)
// ═══════════════════════════════════════════════════════════════

export async function GET(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    
    // ─── CARICA PULIZIA ───
    const cleaningRef = adminDb.collection("cleanings").doc(id);
    const cleaningSnap = await cleaningRef.get();
    
    if (!cleaningSnap.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }
    
    const cleaning = {
      id: cleaningSnap.id,
      ...(cleaningSnap.data() as Record<string, any>),
    };
    
    // ─── VERIFICA PERMESSI ───
    const isAdmin = user.role === "ADMIN";
    const isOwner = (cleaning as FirestoreCleaning).ownerId === user.id;
    const isAssignedOperator = 
      (cleaning as FirestoreCleaning).operatorId === user.id ||
      ((cleaning as FirestoreCleaning).operators || []).some((op: { id: string }) => op.id === user.id);
    
    if (!isAdmin && !isOwner && !isAssignedOperator) {
      return NextResponse.json({ 
        error: "Non hai i permessi per vedere questa pulizia" 
      }, { status: 403 });
    }
    
    // ─── CARICA FOTO DA STORAGE ───
    let photos: Record<string, unknown>[] = [];
    try {
      const bucket = getStorage().bucket();
      const [files] = await bucket.getFiles({ prefix: `cleanings/${id}/photos/` });
      
      // @ts-expect-error TODO-FIX: TS2322 Type '({ id: string; url: string; name: string; category: string | number | true...
      photos = await Promise.all(
        files
          .filter(file => !file.name.endsWith('/'))
          .map(async (file) => {
            try {
              const [metadata] = await file.getMetadata();
              const [url] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
              });
              const fileName = file.name.split('/').pop() || file.name;
              
              return {
                id: fileName,
                url,
                name: fileName,
                category: metadata.metadata?.category || "other",
                caption: metadata.metadata?.caption || null,
                roomName: metadata.metadata?.roomName || null,
                isIssuePhoto: metadata.metadata?.isIssuePhoto === "true",
                size: metadata.size,
                uploadedAt: metadata.timeCreated,
              };
            } catch {
              return null;
            }
          })
      );
      
      photos = photos.filter(p => p !== null);
    } catch (storageError) {
      if (process.env.NODE_ENV !== "production") console.log("Nessuna foto trovata o errore storage:", storageError);
    }
    
    // ─── CARICA THUMBNAILS ───
    const thumbnails: Record<string, string> = {};
    try {
      const bucket = getStorage().bucket();
      const [thumbFiles] = await bucket.getFiles({ prefix: `cleanings/${id}/thumbnails/` });
      
      await Promise.all(
        thumbFiles
          .filter(file => !file.name.endsWith('/'))
          .map(async (file) => {
            try {
              const [url] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 24 * 60 * 60 * 1000,
              });
              const fileName = file.name.split('/').pop() || '';
              const photoId = fileName.replace("_thumb.jpg", "");
              thumbnails[photoId] = url;
            } catch {
              // Ignora errori thumbnail
            }
          })
      );
    } catch {
      // Ignora errori thumbnails
    }
    
    // Aggiungi thumbnails alle foto
    photos = photos.map(photo => ({
      ...photo,
      // @ts-expect-error TODO-FIX: TS18046 'photo.id' is of type 'unknown'.
      thumbnailUrl: thumbnails[photo.id.split(".")[0]] || photo.url,
    }));
    
    // ─── CARICA ISSUES ───
    let issues: Record<string, unknown>[] = [];
    try {
      const issuesQuery = adminDb.collection("cleaningIssues").where("cleaningId", "==", id);
      const issuesSnap = await issuesQuery.get();
      
      issues = issuesSnap.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Record<string, any>),
        reportedAt: (doc.data() as Record<string, any>).reportedAt?.toDate?.() || null,
      }));
    } catch {
      if (process.env.NODE_ENV !== "production") console.log("Nessun issue trovato");
    }
    
    // ─── CARICA EXTRA CHARGES ───
    let extraCharges: Record<string, unknown>[] = [];
    try {
      const chargesQuery = adminDb.collection("extraCharges").where("cleaningId", "==", id);
      const chargesSnap = await chargesQuery.get();
      
      extraCharges = chargesSnap.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Record<string, any>),
        createdAt: (doc.data() as Record<string, any>).createdAt?.toDate?.() || null,
      }));
    } catch {
      if (process.env.NODE_ENV !== "production") console.log("Nessun extra charge trovato");
    }
    
    // ─── CARICA RATING ───
    let rating = null;
    if ((cleaning as FirestoreCleaning).ratingId) {
      try {
        // @ts-expect-error TODO-FIX: TS2345 Argument of type 'string | undefined' is not assignable to parameter of type 'st...
        const ratingSnap = await adminDb.collection("propertyRatings").doc((cleaning as FirestoreCleaning).ratingId).get();
        if (ratingSnap.exists) {
          rating = {
            id: ratingSnap.id,
            ...(ratingSnap.data() as Record<string, any>),
            ratedAt: (ratingSnap.data() as Record<string, any>).ratedAt?.toDate?.() || null,
          };
        }
      } catch {
        if (process.env.NODE_ENV !== "production") console.log("Rating non trovato");
      }
    }
    
    // ─── CARICA PROPRIETÀ ───
    let property = null;
    if ((cleaning as FirestoreCleaning).propertyId) {
      try {
        // @ts-expect-error TODO-FIX: TS2345 Argument of type 'string | undefined' is not assignable to parameter of type 'st...
        const propertySnap = await adminDb.collection("properties").doc((cleaning as FirestoreCleaning).propertyId).get();
        if (propertySnap.exists) {
          property = {
            id: propertySnap.id,
            name: (propertySnap.data() as Record<string, any>).name,
            address: (propertySnap.data() as Record<string, any>).address,
            city: (propertySnap.data() as Record<string, any>).city,
            imageUrl: (propertySnap.data() as Record<string, any>).imageUrl,
            bedrooms: (propertySnap.data() as Record<string, any>).bedrooms,
            bathrooms: (propertySnap.data() as Record<string, any>).bathrooms,
          };
        }
      } catch {
        if (process.env.NODE_ENV !== "production") console.log("Proprietà non trovata");
      }
    }
    
    // ─── CALCOLA STATISTICHE ───
    const photosByCategory: Record<string, number> = {};
    photos.forEach(photo => {
      // @ts-expect-error TODO-FIX: TS2538 Type 'unknown' cannot be used as an index type.
      photosByCategory[photo.category] = (photosByCategory[photo.category] || 0) + 1;
    });
    
    const issuesBySeverity: Record<string, number> = {};
    issues.forEach(issue => {
      // @ts-expect-error TODO-FIX: TS2538 Type 'unknown' cannot be used as an index type.
      issuesBySeverity[issue.severity] = (issuesBySeverity[issue.severity] || 0) + 1;
    });
    
    const stats = {
      totalPhotos: photos.length,
      photosByCategory,
      totalIssues: issues.length,
      issuesBySeverity,
      // @ts-expect-error TODO-FIX: TS2365 Operator '+' cannot be applied to types 'number' and '{}'.
      totalExtraCharges: extraCharges.reduce((sum, c) => sum + (c.amount || 0), 0),
      durationMinutes: (cleaning as FirestoreCleaning).duration || 0,
      // @ts-expect-error TODO-FIX: TS2339 Property 'averageScore' does not exist on type '{ ratedAt: any; id: string; }'.
      averageRating: rating?.averageScore || 0,
    };
    
    // ─── FORMATTA RISPOSTA ───
    const cleaningData = {
      ...(cleaning as FirestoreCleaning),
      scheduledDate: (cleaning as FirestoreCleaning).scheduledDate?.toDate?.() || null,
      startedAt: (cleaning as FirestoreCleaning).startedAt?.toDate?.() || null,
      completedAt: (cleaning as FirestoreCleaning).completedAt?.toDate?.() || null,
      // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
      createdAt: (cleaning as FirestoreCleaning).createdAt?.toDate?.() || null,
    };
    
    return NextResponse.json({
      success: true,
      summary: {
        cleaning: cleaningData,
        property,
        photos,
        issues,
        extraCharges,
        rating,
        stats,
      }
    });
  } catch (error) {
    console.error("Errore GET cleaning summary:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
