import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { ref, listAll, getDownloadURL, getMetadata } from "firebase/storage";
import { storage } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// GET - Riepilogo completo pulizia (foto, issues, rating, etc.)
// ═══════════════════════════════════════════════════════════════

export async function GET(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    
    // ─── CARICA PULIZIA ───
    const cleaningRef = doc(db, "cleanings", id);
    const cleaningSnap = await getDoc(cleaningRef);
    
    if (!cleaningSnap.exists()) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }
    
    const cleaning = {
      id: cleaningSnap.id,
      ...cleaningSnap.data(),
    };
    
    // ─── VERIFICA PERMESSI ───
    const isAdmin = user.role === "ADMIN";
    const isOwner = (cleaning as any).ownerId === user.id;
    const isAssignedOperator = 
      (cleaning as any).operatorId === user.id ||
      ((cleaning as any).operators || []).some((op: { id: string }) => op.id === user.id);
    
    if (!isAdmin && !isOwner && !isAssignedOperator) {
      return NextResponse.json({ 
        error: "Non hai i permessi per vedere questa pulizia" 
      }, { status: 403 });
    }
    
    // ─── CARICA FOTO DA STORAGE ───
    let photos: any[] = [];
    try {
      const photosRef = ref(storage, `cleanings/${id}/photos`);
      const photosList = await listAll(photosRef);
      
      photos = await Promise.all(
        photosList.items.map(async (itemRef) => {
          try {
            const url = await getDownloadURL(itemRef);
            const metadata = await getMetadata(itemRef);
            
            return {
              id: itemRef.name,
              url,
              name: itemRef.name,
              category: metadata.customMetadata?.category || "other",
              caption: metadata.customMetadata?.caption || null,
              roomName: metadata.customMetadata?.roomName || null,
              isIssuePhoto: metadata.customMetadata?.isIssuePhoto === "true",
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
      console.log("Nessuna foto trovata o errore storage:", storageError);
    }
    
    // ─── CARICA THUMBNAILS ───
    let thumbnails: Record<string, string> = {};
    try {
      const thumbsRef = ref(storage, `cleanings/${id}/thumbnails`);
      const thumbsList = await listAll(thumbsRef);
      
      await Promise.all(
        thumbsList.items.map(async (itemRef) => {
          try {
            const url = await getDownloadURL(itemRef);
            const photoId = itemRef.name.replace("_thumb.jpg", "");
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
      thumbnailUrl: thumbnails[photo.id.split(".")[0]] || photo.url,
    }));
    
    // ─── CARICA ISSUES ───
    let issues: any[] = [];
    try {
      const issuesQuery = query(
        collection(db, "cleaningIssues"),
        where("cleaningId", "==", id)
      );
      const issuesSnap = await getDocs(issuesQuery);
      
      issues = issuesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        reportedAt: doc.data().reportedAt?.toDate?.() || null,
      }));
    } catch {
      console.log("Nessun issue trovato");
    }
    
    // ─── CARICA EXTRA CHARGES ───
    let extraCharges: any[] = [];
    try {
      const chargesQuery = query(
        collection(db, "extraCharges"),
        where("cleaningId", "==", id)
      );
      const chargesSnap = await getDocs(chargesQuery);
      
      extraCharges = chargesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || null,
      }));
    } catch {
      console.log("Nessun extra charge trovato");
    }
    
    // ─── CARICA RATING ───
    let rating = null;
    if ((cleaning as any).ratingId) {
      try {
        const ratingSnap = await getDoc(doc(db, "propertyRatings", (cleaning as any).ratingId));
        if (ratingSnap.exists()) {
          rating = {
            id: ratingSnap.id,
            ...ratingSnap.data(),
            ratedAt: ratingSnap.data().ratedAt?.toDate?.() || null,
          };
        }
      } catch {
        console.log("Rating non trovato");
      }
    }
    
    // ─── CARICA PROPRIETÀ ───
    let property = null;
    if ((cleaning as any).propertyId) {
      try {
        const propertySnap = await getDoc(doc(db, "properties", (cleaning as any).propertyId));
        if (propertySnap.exists()) {
          property = {
            id: propertySnap.id,
            name: propertySnap.data().name,
            address: propertySnap.data().address,
            city: propertySnap.data().city,
            imageUrl: propertySnap.data().imageUrl,
            bedrooms: propertySnap.data().bedrooms,
            bathrooms: propertySnap.data().bathrooms,
          };
        }
      } catch {
        console.log("Proprietà non trovata");
      }
    }
    
    // ─── CALCOLA STATISTICHE ───
    const photosByCategory: Record<string, number> = {};
    photos.forEach(photo => {
      photosByCategory[photo.category] = (photosByCategory[photo.category] || 0) + 1;
    });
    
    const issuesBySeverity: Record<string, number> = {};
    issues.forEach(issue => {
      issuesBySeverity[issue.severity] = (issuesBySeverity[issue.severity] || 0) + 1;
    });
    
    const stats = {
      totalPhotos: photos.length,
      photosByCategory,
      totalIssues: issues.length,
      issuesBySeverity,
      totalExtraCharges: extraCharges.reduce((sum, c) => sum + (c.amount || 0), 0),
      durationMinutes: (cleaning as any).duration || 0,
      averageRating: rating?.averageScore || 0,
    };
    
    // ─── FORMATTA RISPOSTA ───
    const cleaningData = {
      ...(cleaning as any),
      scheduledDate: (cleaning as any).scheduledDate?.toDate?.() || null,
      startedAt: (cleaning as any).startedAt?.toDate?.() || null,
      completedAt: (cleaning as any).completedAt?.toDate?.() || null,
      createdAt: (cleaning as any).createdAt?.toDate?.() || null,
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
