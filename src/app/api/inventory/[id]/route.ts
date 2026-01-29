import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, getDoc, updateDoc, deleteDoc, setDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// 🔒 ARTICOLI DI SISTEMA - IMPOSSIBILE ELIMINARE O RINOMINARE
const SYSTEM_ITEM_IDS = new Set([
  "item_doubleSheets",
  "item_singleSheets",
  "item_pillowcases",
  "item_towelsLarge",
  "item_towelsFace",
  "item_towelsSmall",
  "item_bathMats",
]);

const SYSTEM_ITEMS_DATA: Record<string, { name: string; categoryId: string; key: string }> = {
  "item_doubleSheets": { name: "Lenzuola Matrimoniali", categoryId: "biancheria_letto", key: "doubleSheets" },
  "item_singleSheets": { name: "Lenzuola Singole", categoryId: "biancheria_letto", key: "singleSheets" },
  "item_pillowcases": { name: "Federe", categoryId: "biancheria_letto", key: "pillowcases" },
  "item_towelsLarge": { name: "Telo Doccia", categoryId: "biancheria_bagno", key: "towelsLarge" },
  "item_towelsFace": { name: "Asciugamano Viso", categoryId: "biancheria_bagno", key: "towelsFace" },
  "item_towelsSmall": { name: "Asciugamano Bidet", categoryId: "biancheria_bagno", key: "towelsSmall" },
  "item_bathMats": { name: "Tappetino Scendibagno", categoryId: "biancheria_bagno", key: "bathMats" },
};

const SYSTEM_ITEM_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(SYSTEM_ITEMS_DATA).map(([id, data]) => [id, data.name])
);

function isSystemItem(id: string): boolean {
  return SYSTEM_ITEM_IDS.has(id);
}

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
    
    // 🔒 ARTICOLI DI SISTEMA: Forza sempre nome e categoria corretti
    if (isSystemItem(id)) {
      const sysData = SYSTEM_ITEMS_DATA[id];
      if (sysData) {
        // Forza valori corretti (ignora qualsiasi tentativo di cambiarli)
        data.name = sysData.name;
        data.categoryId = sysData.categoryId;
        data.key = sysData.key;
        data.isSystemItem = true;
        data.isForLinen = true;
        
        console.log(`🔒 Articolo di sistema ${id}: salvando con nome forzato "${sysData.name}"`);
      }
    }
    
    // Verifica che name non sia null/undefined
    if (!data.name) {
      return NextResponse.json({ 
        error: "Il nome è obbligatorio",
      }, { status: 400 });
    }
    
    // Rimuovi campi non modificabili
    delete data.id;
    delete data.createdAt;
    
    const docRef = doc(db, "inventory", id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      // Mantieni i campi esistenti e aggiorna solo quelli forniti
      const existingData = docSnap.data();
      await updateDoc(docRef, { 
        ...existingData,
        ...data, 
        updatedAt: new Date() 
      });
    } else {
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
    
    // 🔒 BLOCCO ASSOLUTO: Articoli di sistema NON POSSONO MAI ESSERE CANCELLATI
    if (isSystemItem(id)) {
      const itemName = SYSTEM_ITEM_NAMES[id] || id;
      console.log(`🔒 BLOCCO ASSOLUTO: Tentativo di cancellare articolo di sistema ${id} (${itemName})`);
      return NextResponse.json({ 
        error: `❌ IMPOSSIBILE ELIMINARE: "${itemName}" è un articolo di sistema fondamentale per il funzionamento dell'app. Non può essere cancellato.`,
        isSystemItem: true,
      }, { status: 403 });
    }
    
    await deleteDoc(doc(db, "inventory", id));
    
    return NextResponse.json({ success: true, message: "Articolo eliminato" });
  } catch (error: any) {
    console.error("Errore DELETE inventory:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}
