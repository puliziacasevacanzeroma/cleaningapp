import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";
import { invalidateCache } from "~/lib/cache";

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const docSnap = await adminDb.collection("inventory").doc(id).get();
    if (!docSnap.exists) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    return NextResponse.json({ id: docSnap.id, ...(docSnap.data() as Record<string, any>) });
  } catch (error) {
    console.error("Errore GET inventory:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const data = await validateBody(req, GenericBodySchema);
    if (data instanceof Response) return data;

    // 🔒 ARTICOLI DI SISTEMA: Forza sempre nome e categoria corretti
    if (isSystemItem(id)) {
      const sysData = SYSTEM_ITEMS_DATA[id];
      if (sysData) {
        data.name = sysData.name;
        data.categoryId = sysData.categoryId;
        data.key = sysData.key;
        data.isSystemItem = true;
        data.isForLinen = true;
      }
    }

    if (!data.name) {
      return NextResponse.json({ error: "Il nome è obbligatorio" }, { status: 400 });
    }

    delete data.id;
    delete data.createdAt;

    const docRef = adminDb.collection("inventory").doc(id);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const existingData = docSnap.data()!;
      await docRef.set({
        ...existingData,
        ...data,
        updatedAt: Timestamp.now(),
      });
    } else {
      await docRef.set({
        ...data,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }

    await invalidateCache("inventory:list"); // 🔄 Invalida cache Redis
    return NextResponse.json({ success: true, message: "Articolo aggiornato" });
  } catch (error: unknown) {
    console.error("Errore PUT inventory:", error);
    const message = error instanceof Error ? error.message : "Errore server";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const url = new URL(req.url);
    const checkOnly = url.searchParams.get("check") === "true";
    const confirm = url.searchParams.get("confirm") === "true";

    // 🔒 BLOCCO ASSOLUTO: Articoli di sistema non possono essere cancellati
    if (isSystemItem(id)) {
      const itemName = SYSTEM_ITEM_NAMES[id] || id;
      return NextResponse.json({
        error: `⛔ IMPOSSIBILE ELIMINARE: "${itemName}" è un articolo di sistema fondamentale per il funzionamento dell'app. Non può essere cancellato.`,
        isSystemItem: true,
      }, { status: 403 });
    }

    const itemSnap = await adminDb.collection("inventory").doc(id).get();
    if (!itemSnap.exists) {
      return NextResponse.json({ error: "Articolo non trovato" }, { status: 404 });
    }
    const itemData = itemSnap.data()!;
    const itemName = itemData.name || id;

    // Cerca proprietà che usano questo articolo nelle serviceConfigs
    const propertiesSnap = await adminDb.collection("properties").get();

    const affectedProperties: { id: string; name: string; ownerId: string }[] = [];

    propertiesSnap.docs.forEach(propDoc => {
      const propData = propDoc.data() as Record<string, any>;
      const configs = propData.serviceConfigs || propData.customLinenConfig;

      if (configs) {
        let found = false;
        Object.values(configs).forEach((config: unknown) => {
          const c = config as Record<string, unknown>;
          if (c?.items && Array.isArray(c.items)) {
            c.items.forEach((item: unknown) => {
              const i = item as Record<string, string>;
              if (i.itemId === id || i.id === id) found = true;
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

    if (checkOnly) {
      return NextResponse.json({
        itemId: id,
        itemName,
        affectedPropertiesCount: affectedProperties.length,
        affectedProperties: affectedProperties.map(p => ({ id: p.id, name: p.name })),
        message: affectedProperties.length > 0
          ? `Questo articolo è utilizzato da ${affectedProperties.length} proprietà. Eliminandolo verrà rimosso dalle loro configurazioni.`
          : "Questo articolo non è utilizzato da nessuna proprietà.",
      });
    }

    if (!confirm && affectedProperties.length > 0) {
      return NextResponse.json({
        requiresConfirmation: true,
        itemId: id,
        itemName,
        affectedPropertiesCount: affectedProperties.length,
        message: `Questo articolo è utilizzato da ${affectedProperties.length} proprietà. Aggiungi ?confirm=true per procedere.`,
      }, { status: 400 });
    }

    // Rimuovi l'articolo dalle config delle proprietà interessate
    const { createItemDiscontinuedNotification } = await import("~/lib/firebase/notifications-admin");
    const ownerNotifications: Record<string, string[]> = {};

    for (const prop of affectedProperties) {
      const propRef = adminDb.collection("properties").doc(prop.id);
      const propSnap = await propRef.get();
      const propData = propSnap.data() as Record<string, any>;

      if (propData?.serviceConfigs) {
        const updatedConfigs = { ...propData.serviceConfigs };

        Object.keys(updatedConfigs).forEach(guestCount => {
          if (updatedConfigs[guestCount]?.items) {
            updatedConfigs[guestCount].items = updatedConfigs[guestCount].items.filter(
              (item: Record<string, string>) => item.itemId !== id && item.id !== id
            );
          }
        });

        await propRef.update({
          serviceConfigs: updatedConfigs,
          updatedAt: Timestamp.now(),
        });
      }

      if (!ownerNotifications[prop.ownerId]) {
        ownerNotifications[prop.ownerId] = [];
      }
      ownerNotifications[prop.ownerId].push(prop.name);
    }

    // Invia notifiche ai proprietari
    for (const [ownerId, propertyNames] of Object.entries(ownerNotifications)) {
      await createItemDiscontinuedNotification(ownerId, itemName, propertyNames);
    }

    // Elimina l'articolo
    await adminDb.collection("inventory").doc(id).delete();
    await invalidateCache("inventory:list"); // 🔄 Invalida cache Redis

    return NextResponse.json({
      success: true,
      message: "Articolo eliminato",
      affectedProperties: affectedProperties.length,
      notificationsSent: Object.keys(ownerNotifications).length,
    });
  } catch (error: unknown) {
    console.error("Errore DELETE inventory:", error);
    const message = error instanceof Error ? error.message : "Errore server";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
