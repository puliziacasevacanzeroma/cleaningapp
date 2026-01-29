import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { collection, addDoc, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

// GET - Lista articoli inventario
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || undefined;
    
    const snapshot = await getDocs(collection(db, "inventory"));
    let items = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    if (category) {
      items = items.filter((item: any) => 
        item.category === category || item.categoryId === category
      );
    }
    
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Errore caricamento inventario:", error);
    return NextResponse.json({ error: "Errore interno", items: [] }, { status: 500 });
  }
}

// POST - Crea nuovo articolo
export async function POST(request: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const data = await request.json();
    
    if (!data.name) {
      return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
    }
    
    const newItem = {
      name: data.name,
      categoryId: data.categoryId || "altro",
      category: data.category || data.categoryId || "altro",
      quantity: data.quantity || 0,
      minQuantity: data.minQuantity || 5,
      sellPrice: data.sellPrice || 0,
      unit: data.unit || "pz",
      isForLinen: data.isForLinen || false,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: user.id || user.email,
    };
    
    const docRef = await addDoc(collection(db, "inventory"), newItem);
    
    return NextResponse.json({ 
      success: true, 
      id: docRef.id,
      message: "Articolo creato con successo"
    });
  } catch (error) {
    console.error("Errore creazione articolo:", error);
    return NextResponse.json({ error: "Errore durante la creazione" }, { status: 500 });
  }
}
