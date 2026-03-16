import { NextResponse } from "next/server";
import { getProperties } from "~/lib/firebase/firestore-data-admin";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { createNewPropertyNotification, createNotification } from "~/lib/firebase/notifications-admin";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, PropertyCreateSchema } from "~/lib/validation/schemas";


export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  // ─────────────────────────────────────────────────────

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "ACTIVE";
    const properties = await getProperties(status);
    return NextResponse.json({ properties });
  } catch (error) {
    console.error("Errore caricamento proprietà:", error);
    return NextResponse.json({ error: "Errore interno", properties: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  // ─────────────────────────────────────────────────────

    const data = await validateBody(request, PropertyCreateSchema);
    if (data instanceof Response) return data;
    
    // Validazione base
    if (!data.name || !data.address) {
      return NextResponse.json(
        { error: "Campi obbligatori mancanti: name, address" },
        { status: 400 }
      );
    }

    // Determina ownerId, cleaningPrice e status in base al ruolo
    const isAdmin = _user.role?.toUpperCase() === "ADMIN";
    const d = data as Record<string, any>;

    // Se ADMIN: usa i dati dal payload (proprietario selezionato, prezzo, status)
    // Se PROPRIETARIO: usa il proprio ID, nessun prezzo, status PENDING
    const resolvedOwnerId = isAdmin ? (d.ownerId || "pending") : _user.id;
    const resolvedOwnerName = isAdmin ? (d.ownerName || "") : _user.name || "";
    const resolvedOwnerEmail = isAdmin ? (d.ownerEmail || "") : _user.email || "";
    const resolvedCleaningPrice = isAdmin ? (d.cleaningPrice || 0) : 0;
    const resolvedStatus = isAdmin ? (d.status || "PENDING_SIGNATURE") : "PENDING";

    // Salva su Firestore
    const propertyData = {
      name: data.name,
      address: data.address,
      city: data.city || "",
      zone: d.zone || "",
      type: d.type || "apartment",
      size: d.size || 0,
      bedrooms: data.bedrooms || 1,
      bathrooms: data.bathrooms || 1,
      maxGuests: data.maxGuests || 2,
      cleaningPrice: resolvedCleaningPrice,
      ownerId: resolvedOwnerId,
      ownerName: resolvedOwnerName,
      ownerEmail: resolvedOwnerEmail,
      status: resolvedStatus,
      icalUrl: data.icalUrl || "",
      notes: data.notes || "",
      // @ts-expect-error TODO-FIX: TS2339 Property 'usesOwnLinen' does not exist on type '{ name: string; address: string;...
      usesOwnLinen: data.usesOwnLinen || false,
      // @ts-expect-error TODO-FIX: TS2339 Property 'linenConfig' does not exist on type '{ name: string; address: string; ...
      linenConfig: data.linenConfig || [],
      // Campi extra dal form proprietario
      postalCode: data.postalCode || "",
      // @ts-expect-error TODO-FIX: TS2339 Property 'floor' does not exist on type '{ name: string; address: string; city?:...
      floor: data.floor || "",
      // @ts-expect-error TODO-FIX: TS2339 Property 'accessCode' does not exist on type '{ name: string; address: string; c...
      accessCode: data.accessCode || "",
      // @ts-expect-error TODO-FIX: TS2339 Property 'checkInTime' does not exist on type '{ name: string; address: string; ...
      checkInTime: data.checkInTime || "15:00",
      // @ts-expect-error TODO-FIX: TS2339 Property 'checkOutTime' does not exist on type '{ name: string; address: string;...
      checkOutTime: data.checkOutTime || "10:00",
      // @ts-expect-error TODO-FIX: TS2339 Property 'bedConfiguration' does not exist on type '{ name: string; address: str...
      bedConfiguration: data.bedConfiguration || [],
      // ⭐ NUOVO: Letti e configurazioni biancheria nel formato STANDARD
      // Questi campi sono usati da tutto il resto dell'app:
      // - PropertyServiceConfig (configuratore biancheria)
      // - sync-ical (creazione ordini automatici)
      // - NewCleaningModal (creazione pulizie manuali)
      // - cleanings/manual API
      // @ts-expect-error TODO-FIX: TS2339 Property 'beds' does not exist on type '{ name: string; address: string; city?: ...
      beds: data.beds || [],
      // @ts-expect-error TODO-FIX: TS2339 Property 'serviceConfigs' does not exist on type '{ name: string; address: strin...
      serviceConfigs: data.serviceConfigs || {},
      // Coordinate geografiche per calcolo distanze assegnazioni
      // @ts-expect-error TODO-FIX: TS2339 Property 'coordinates' does not exist on type '{ name: string; address: string; ...
      coordinates: data.coordinates || null,
      // @ts-expect-error TODO-FIX: TS2339 Property 'coordinatesVerified' does not exist on type '{ name: string; address: ...
      coordinatesVerified: data.coordinatesVerified || false,
      // Timestamps
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Log per debug
    // @ts-expect-error TODO-FIX: TS2339 Property 'serviceConfigs' does not exist on type '{ name: string; address: strin...
    if (data.serviceConfigs && Object.keys(data.serviceConfigs).length > 0) {
      // @ts-expect-error TODO-FIX: TS2339 Property 'serviceConfigs' does not exist on type '{ name: string; address: strin...
      if (process.env.NODE_ENV !== "production") console.log(`📦 Salvando proprietà "${data.name}" con ${Object.keys(data.serviceConfigs).length} configurazioni ospiti`);
      // @ts-expect-error TODO-FIX: TS2339 Property 'serviceConfigs' does not exist on type '{ name: string; address: strin...
      if (process.env.NODE_ENV !== "production") console.log(`   Esempio config 1 ospite:`, data.serviceConfigs[1] ? 'presente' : 'assente');
      // @ts-expect-error TODO-FIX: TS2339 Property 'serviceConfigs' does not exist on type '{ name: string; address: strin...
      if (process.env.NODE_ENV !== "production") console.log(`   Esempio config maxGuests (${data.maxGuests}):`, data.serviceConfigs[data.maxGuests] ? 'presente' : 'assente');
    }

    const docRef = await adminDb.collection("properties").add(propertyData);

    // Invia notifica in base a chi ha creato la proprietà
    try {
      // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ name: string; address: string; city?...
      if (resolvedStatus === "PENDING_SIGNATURE") {
        // Admin ha creato con prezzo → notifica al PROPRIETARIO per firmare
        if (resolvedOwnerId && resolvedOwnerId !== "pending") {
          await createNotification({
            title: "Nuova Proprietà - Firma Richiesta 📋",
            message: `L'amministrazione ha aggiunto la proprietà "${data.name}" al tuo account. Firma l'Allegato D nella sezione Proprietà per attivarla.`,
            type: "NEW_PROPERTY",
            recipientRole: "PROPRIETARIO",
            recipientId: resolvedOwnerId,
            senderId: "admin",
            senderName: "Amministrazione",
            relatedEntityId: docRef.id,
            relatedEntityType: "PROPERTY",
            relatedEntityName: data.name,
            actionRequired: true,
            link: `/proprietario/proprieta`,
          });
        }
      // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ name: string; address: string; city?...
      } else if (resolvedStatus === "ACTIVE") {
        if (resolvedOwnerId && resolvedOwnerId !== "pending") {
          await createNotification({
            title: "Nuova Proprietà Inserita",
            message: `L'amministrazione ha aggiunto la proprietà "${data.name}" al tuo account.`,
            type: "NEW_PROPERTY",
            recipientRole: "PROPRIETARIO",
            recipientId: resolvedOwnerId,
            senderId: "admin",
            senderName: "Amministrazione",
            relatedEntityId: docRef.id,
            relatedEntityType: "PROPERTY",
            relatedEntityName: data.name,
            actionRequired: false,
            link: `/proprietario/proprieta/${docRef.id}`,
          });
        }
      } else {
        // Proprietario ha creato (PENDING) → notifica all'ADMIN per approvazione
        await createNewPropertyNotification(
          docRef.id,
          data.name,
          // @ts-expect-error TODO-FIX: TS2339 Property 'ownerId' does not exist on type '{ name: string; address: string; city...
          resolvedOwnerId || "unknown",
          resolvedOwnerName || "Proprietario"
        );
      }
    } catch (notifError) {
      console.error("Errore invio notifica:", notifError);
      // Non blocchiamo la creazione se la notifica fallisce
    }

    return NextResponse.json({ 
      success: true, 
      id: docRef.id,
      propertyId: docRef.id,
      message: "Proprietà creata con successo",
      // @ts-expect-error TODO-FIX: TS2339 Property 'serviceConfigs' does not exist on type '{ name: string; address: strin...
      hasServiceConfigs: data.serviceConfigs && Object.keys(data.serviceConfigs).length > 0
    });
  } catch (error) {
    console.error("Errore creazione proprietà:", error);
    return NextResponse.json(
      { error: "Errore nella creazione della proprietà" },
      { status: 500 }
    );
  }
}
