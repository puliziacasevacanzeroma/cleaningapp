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
    const url = new URL(req.url);
    const checkOnly = url.searchParams.get("check") === "true";
    const confirm = url.searchParams.get("confirm") === "true";
    
    // 🔒 BLOCCO ASSOLUTO: Articoli di sistema NON POSSONO MAI ESSERE CANCELLATI
    if (isSystemItem(id)) {
      const itemName = SYSTEM_ITEM_NAMES[id] || id;
      console.log(`🔒 BLOCCO ASSOLUTO: Tentativo di cancellare articolo di sistema ${id} (${itemName})`);
      return NextResponse.json({ 
        error: `❌ IMPOSSIBILE ELIMINARE: "${itemName}" è un articolo di sistema fondamentale per il funzionamento dell'app. Non può essere cancellato.`,
        isSystemItem: true,
      }, { status: 403 });
    }
    
    // Ottieni nome articolo
    const itemSnap = await getDoc(doc(db, "inventory", id));
    if (!itemSnap.exists()) {
      return NextResponse.json({ error: "Articolo non trovato" }, { status: 404 });
    }
    const itemData = itemSnap.data();
    const itemName = itemData.name || id;
    
    // Cerca proprietà che usano questo articolo nelle serviceConfigs
    const { collection: coll, getDocs: getDocsFn } = await import("firebase/firestore");
    const propertiesSnap = await getDocsFn(coll(db, "properties"));
    
    const affectedProperties: { id: string; name: string; ownerId: string }[] = [];
    
    propertiesSnap.docs.forEach(propDoc => {
      const propData = propDoc.data();
      const configs = propData.serviceConfigs || propData.customLinenConfig;
      
      if (configs) {
        // Cerca l'articolo nelle config
        let found = false;
        Object.values(configs).forEach((config: any) => {
          if (config?.items) {
            config.items.forEach((item: any) => {
              if (item.itemId === id || item.id === id) {
                found = true;
              }
            });
          }
        });
        
        if (found) {
          affectedProperties.push({
            id: propDoc.id,
            name: propData.name || "Senza nome",
            ownerId: propData.ownerId,
          });
        }
      }
    });
    
    // Se solo check, ritorna l'impatto
    if (checkOnly) {
      return NextResponse.json({
        itemId: id,
        itemName,
        affectedPropertiesCount: affectedProperties.length,
        affectedProperties: affectedProperties.map(p => ({ id: p.id, name: p.name })),
        message: affectedProperties.length > 0
          ? `Questo articolo è utilizzato da ${affectedProperties.length} proprietà. Eliminandolo verrà rimosso dalle loro configurazioni.`
          : "Questo articolo non è utilizzato da nessuna proprietà."
      });
    }
    
    // Se non confermato e ci sono proprietà interessate, richiedi conferma
    if (!confirm && affectedProperties.length > 0) {
      return NextResponse.json({
        requiresConfirmation: true,
        itemId: id,
        itemName,
        affectedPropertiesCount: affectedProperties.length,
        message: `Questo articolo è utilizzato da ${affectedProperties.length} proprietà. Aggiungi ?confirm=true per procedere.`
      }, { status: 400 });
    }
    
    // Procedi con l'eliminazione
    
    // 1. Rimuovi l'articolo dalle config delle proprietà interessate
    const { createItemDiscontinuedNotification } = await import("~/lib/firebase/notifications");
    const ownerNotifications: Record<string, string[]> = {};
    
    for (const prop of affectedProperties) {
      const propRef = doc(db, "properties", prop.id);
      const propSnap = await getDoc(propRef);
      const propData = propSnap.data();
      
      if (propData?.serviceConfigs) {
        const updatedConfigs = { ...propData.serviceConfigs };
        
        Object.keys(updatedConfigs).forEach(guestCount => {
          if (updatedConfigs[guestCount]?.items) {
            updatedConfigs[guestCount].items = updatedConfigs[guestCount].items.filter(
              (item: any) => item.itemId !== id && item.id !== id
            );
          }
        });
        
        await updateDoc(propRef, { 
          serviceConfigs: updatedConfigs,
          updatedAt: new Date()
        });
      }
      
      // Raggruppa per owner per notifica
      if (!ownerNotifications[prop.ownerId]) {
        ownerNotifications[prop.ownerId] = [];
      }
      ownerNotifications[prop.ownerId].push(prop.name);
    }
    
    // 2. Invia notifiche ai proprietari
    for (const [ownerId, propertyNames] of Object.entries(ownerNotifications)) {
      await createItemDiscontinuedNotification(ownerId, itemName, propertyNames);
    }
    
    // 3. Elimina l'articolo
    await deleteDoc(doc(db, "inventory", id));
    
    return NextResponse.json({ 
      success: true, 
      message: "Articolo eliminato",
      affectedProperties: affectedProperties.length,
      notificationsSent: Object.keys(ownerNotifications).length
    });
  } catch (error: any) {
    console.error("Errore DELETE inventory:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}
