/**
 * 🕗 CRON JOB - Applica Ospiti Default (alle 20:00)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { createNotification } from "~/lib/notifications/createNotification";
import { getItemName } from "~/lib/itemNames";
import { resend, FROM_EMAIL, APP_URL, logResendWarning } from "~/lib/email/config";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

interface LinenRequirement {
  lenzuoloMatrimoniale: number;
  lenzuoloSingolo: number;
  federa: number;
}

function getLinenForBedType(bedType: string): LinenRequirement {
  switch (bedType) {
    case 'matr':
    case 'matrimoniale':
      return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    case 'sing':
    case 'singolo':
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
    case 'divano':
    case 'divano_letto':
      return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    case 'castello':
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 6, federa: 2 };
    default:
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
  }
}

function calculateFallbackLinen(guestsCount: number, bedrooms: number, bathrooms: number): { id: string; name: string; quantity: number }[] {
  const items: { id: string; name: string; quantity: number }[] = [];
  const matrimonialiNeeded = Math.min(bedrooms, Math.ceil(guestsCount / 2));
  const postiMatrimoniali = matrimonialiNeeded * 2;
  const singolariNeeded = Math.max(0, guestsCount - postiMatrimoniali);
  let totalLenzMatr = 0, totalLenzSing = 0, totalFedere = 0;
  for (let i = 0; i < matrimonialiNeeded; i++) { const req = getLinenForBedType('matr'); totalLenzMatr += req.lenzuoloMatrimoniale; totalFedere += req.federa; }
  for (let i = 0; i < singolariNeeded; i++) { const req = getLinenForBedType('sing'); totalLenzSing += req.lenzuoloSingolo; totalFedere += req.federa; }
  if (totalLenzMatr > 0) items.push({ id: 'lenzuola_matrimoniale', name: 'Lenzuola Matrimoniale', quantity: totalLenzMatr });
  if (totalLenzSing > 0) items.push({ id: 'lenzuola_singolo', name: 'Lenzuola Singolo', quantity: totalLenzSing });
  if (totalFedere > 0) items.push({ id: 'federa', name: 'Federa', quantity: totalFedere });
  items.push({ id: 'telo_doccia', name: 'Telo Doccia', quantity: guestsCount });
  items.push({ id: 'asciugamano_viso', name: 'Asciugamano Viso', quantity: guestsCount });
  items.push({ id: 'asciugamano_ospite', name: 'Asciugamano Ospite/Bidet', quantity: guestsCount });
  if (bathrooms > 0) items.push({ id: 'tappetino_bagno', name: 'Tappetino Bagno', quantity: bathrooms });
  return items;
}

function calculateLinenItemsForProperty(prop: any, guestsCount: number): { id: string; name: string; quantity: number }[] {
  let linenItems: { id: string; name: string; quantity: number }[] = [];
  if (prop.serviceConfigs) {
    const config = prop.serviceConfigs[guestsCount] || prop.serviceConfigs[String(guestsCount)];
    if (config) {
      if (config.bl) {
        const hasAll = config.bl['all'] && typeof config.bl['all'] === 'object' && Object.keys(config.bl['all']).length > 0;
        if (hasAll) {
          Object.entries(config.bl['all']).forEach(([itemId, qty]: [string, any]) => { if (typeof qty === 'number' && qty > 0) linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty }); });
        } else {
          Object.entries(config.bl).forEach(([bedId, items]: [string, any]) => {
            if (bedId !== 'all' && typeof items === 'object') {
              Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
                if (typeof qty === 'number' && qty > 0) {
                  const existing = linenItems.find(i => i.id === itemId);
                  if (existing) existing.quantity += qty;
                  else linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                }
              });
            }
          });
        }
      }
      if (config.ba) Object.entries(config.ba).forEach(([itemId, qty]: [string, any]) => { if (typeof qty === 'number' && qty > 0) linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty }); });
      if (config.ki) Object.entries(config.ki).forEach(([itemId, qty]: [string, any]) => { if (typeof qty === 'number' && qty > 0) linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty }); });
    }
  }
  if (linenItems.length === 0) linenItems = calculateFallbackLinen(guestsCount, prop.bedrooms || 1, prop.bathrooms || 1);
  return linenItems;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const urlSecret = req.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runApplyDefaults();
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const body = await req.json().catch(() => ({}));
  if (authHeader !== `Bearer ${CRON_SECRET}` && body.secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runApplyDefaults();
}

async function runApplyDefaults(): Promise<NextResponse> {
  const stats = { cleaningsTomorrow: 0, withoutGuests: 0, updated: 0, ordersUpdated: 0, notificationsSent: 0, emailsSent: 0, errors: 0 };
  if (process.env.NODE_ENV !== "production") console.log('\n🕗 APPLY DEFAULT GUESTS - ' + new Date().toISOString());

  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    const propsSnap = await adminDb.collection('properties').get();
    const propertiesMap = new Map<string, any>();
    propsSnap.docs.forEach(d => propertiesMap.set(d.id, { id: d.id, ...(d.data() as Record<string, any>) }));

    const usersSnap = await adminDb.collection('users').get();
    const usersMap = new Map<string, any>();
    usersSnap.docs.forEach(d => usersMap.set(d.id, { id: d.id, ...(d.data() as Record<string, any>) }));

    const ordersSnap = await adminDb.collection('orders').get();
    const ordersMap = new Map<string, any>();
    ordersSnap.docs.forEach(d => {
      const data = d.data() as Record<string, any>;
      if (data.cleaningId) ordersMap.set(data.cleaningId, { id: d.id, ...data });
    });

    const cleaningsSnap = await adminDb.collection('cleanings').get();
    const cleaningsTomorrow = cleaningsSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }))
      .filter((c: any) => {
        const date = c.scheduledDate?.toDate?.();
        if (!date) return false;
        return date >= tomorrow && date < dayAfterTomorrow;
      });

    stats.cleaningsTomorrow = cleaningsTomorrow.length;
    if (process.env.NODE_ENV !== "production") console.log(`📅 Pulizie domani (${tomorrow.toLocaleDateString('it-IT')}): ${cleaningsTomorrow.length}`);

    for (const cleaning of cleaningsTomorrow) {
      const c = cleaning as any;
      if (c.guestsConfirmed === true) continue;
      stats.withoutGuests++;

      const property = propertiesMap.get(c.propertyId);
      if (!property) { stats.errors++; continue; }

      const maxGuests = property.maxGuests || 2;
      const cleaningDate = c.scheduledDate?.toDate?.();
      const dateStr = cleaningDate?.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) || 'domani';

      try {
        await adminDb.collection('cleanings').doc(c.id).update({
          guestsCount: maxGuests,
          guestsConfirmed: true,
          guestsAppliedBySystem: true,
          guestsAppliedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        stats.updated++;
      } catch (err) {
        console.error('Errore aggiornamento pulizia:', err);
        stats.errors++;
        continue;
      }

      if (!property.usesOwnLinen) {
        const existingOrder = ordersMap.get(c.id);
        if (existingOrder) {
          try {
            const newLinenItems = calculateLinenItemsForProperty(property, maxGuests);
            await adminDb.collection('orders').doc(existingOrder.id).update({
              items: newLinenItems,
              guestsCount: maxGuests,
              guestsAppliedBySystem: true,
              updatedAt: Timestamp.now(),
            });
            stats.ordersUpdated++;
          } catch (err) {
            console.error('Errore aggiornamento ordine:', err);
            stats.errors++;
          }
        }
      }

      const owner = usersMap.get(property.ownerId);
      if (!owner) continue;

      try {
        await createNotification({
          type: 'GUEST_COUNT_APPLIED',
          recipientId: owner.id,
          recipientRole: 'PROPRIETARIO',
          senderId: 'SYSTEM',
          senderName: 'CleaningApp',
          customTitle: '📋 Ospiti applicati automaticamente',
          customMessage: `Non avendo ricevuto il numero ospiti, la pulizia di "${property.name}" per ${dateStr} è stata impostata per ${maxGuests} ospiti (capacità massima).`,
          relatedEntityId: c.id,
          relatedEntityType: 'CLEANING',
          relatedEntityName: property.name,
          link: `/proprietario/proprieta/${property.id}`,
        });
        stats.notificationsSent++;
      } catch (err) {
        console.error('Errore notifica:', err);
        stats.errors++;
      }

      if (resend && owner.email) {
        try {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: owner.email,
            subject: `📋 Ospiti applicati per ${property.name}`,
            html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2>📋 Ospiti applicati automaticamente</h2>
              <p>Ciao <strong>${owner.name || 'Proprietario'}</strong>,</p>
              <p>Non avendo ricevuto il numero di ospiti per la pulizia di <strong>"${property.name}"</strong> per <strong>${dateStr}</strong>, abbiamo impostato automaticamente la preparazione per <strong>${maxGuests} ospiti</strong> (capacità massima).</p>
              <p><a href="https://gestionale.puliziacasevacanze.it/proprietario/proprieta/${property.id}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;">Vai alla proprietà</a></p>
            </div>`,
          });
          stats.emailsSent++;
        } catch (err) {
          console.error('Errore email:', err);
          stats.errors++;
        }
      }
    }

    return NextResponse.json({ success: true, stats });
  } catch (error: any) {
    console.error('❌ Errore:', error);
    return NextResponse.json({ success: false, error: error.message, stats }, { status: 500 });
  }
}
