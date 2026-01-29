import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, getDoc, updateDoc, deleteDoc, setDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { isSystemItem, getSystemItem } from "~/lib/inventory/systemItems";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const docSnap = await getDoc(doc(db, "inventory", id));
    if (!docSnap.exists()) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    return NextResponse.json({ id: docSnap.id, ...docSnap.data() });
  } catch (error) {
    console.error("Errore GET inventory:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    const data = await req.json();
    
    // 🔒 BLOCCO: Articoli di sistema non possono essere rinominati o cambiare categoria
    if (isSystemItem(id)) {
      const systemItem = getSystemItem(id);
      
      // Blocca cambio nome
      if (data.name && systemItem && data.name !== systemItem.name) {
        return NextResponse.json({ 
          error: "❌ Articolo di sistema: il nome non può essere modificato",
          isSystemItem: true 
        }, { status: 403 });
      }
      
      // Blocca cambio categoria
      if (data.categoryId && systemItem && data.categoryId !== systemItem.categoryId) {
        return NextResponse.json({ 
          error: "❌ Articolo di sistema: la categoria non può essere modificata",
          isSystemItem: true 
        }, { status: 403 });
      }
      
      // Blocca cambio key
      if (data.key && systemItem && data.key !== systemItem.key) {
        return NextResponse.json({ 
          error: "❌ Articolo di sistema: la chiave non può essere modificata",
          isSystemItem: true 
        }, { status: 403 });
      }
      
      console.log(`🔒 Articolo di sistema ${id}: modifica consentita solo per prezzo/quantità`);
    }
    
    // Rimuovi campi non modificabili
    delete data.id;
    delete data.createdAt;
    
    // 🔒 Per articoli di sistema, mantieni sempre il flag
    if (isSystemItem(id)) {
      data.isSystemItem = true;
    }
    
    const docRef = doc(db, "inventory", id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      // Documento esiste, aggiorna
      await updateDoc(docRef, { 
        ...data, 
        updatedAt: new Date() 
      });
    } else {
      // Documento non esiste, crealo con setDoc
      await setDoc(docRef, {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    return NextResponse.json({ success: true, message: "Articolo aggiornato" });
  } catch (error: any) {
    console.error("Errore PUT inventory:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    
    // 🔒 BLOCCO TOTALE: Articoli di sistema NON possono essere cancellati
    if (isSystemItem(id)) {
      console.log(`🔒 BLOCCO: Tentativo di cancellare articolo di sistema ${id}`);
      return NextResponse.json({ 
        error: "❌ Impossibile eliminare: questo è un articolo di sistema necessario per il funzionamento dell'app",
        isSystemItem: true,
        hint: "Gli articoli di sistema (biancheria letto e bagno) non possono essere eliminati perché sono usati nei calcoli automatici."
      }, { status: 403 });
    }
    
    await deleteDoc(doc(db, "inventory", id));
    
    return NextResponse.json({ success: true, message: "Articolo eliminato" });
  } catch (error: any) {
    console.error("Errore DELETE inventory:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}
