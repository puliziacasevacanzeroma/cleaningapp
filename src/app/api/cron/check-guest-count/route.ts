/**
 * 🔔 CRON JOB - Notifica Ospiti Mancanti (alle 12:00)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { createNotification } from "~/lib/notifications/createNotification";
import { resend, FROM_EMAIL, APP_URL } from "~/lib/email/config";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const urlSecret = req.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runCheck();
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const body = await req.json().catch(() => ({}));
  if (authHeader !== `Bearer ${CRON_SECRET}` && body.secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runCheck();
}

async function runCheck(): Promise<NextResponse> {
  const stats = { cleaningsTomorrow: 0, missingGuestCount: 0, notificationsSent: 0, emailsSent: 0, errors: 0 };
  if (process.env.NODE_ENV !== "production") console.log('\n🔔 CHECK OSPITI MANCANTI - ' + new Date().toISOString());

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
      stats.missingGuestCount++;

      const property = propertiesMap.get(c.propertyId);
      if (!property) continue;

      const owner = usersMap.get(property.ownerId);
      if (!owner) continue;

      const maxGuests = property.maxGuests || 2;
      const cleaningDate = c.scheduledDate?.toDate?.();
      const dateStr = cleaningDate?.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) || 'domani';
      const cleaningLink = `/proprietario/calendario/pulizie?openCleaning=${c.id}`;

      try {
        await createNotification({
          type: 'GUEST_COUNT_MISSING',
          recipientId: owner.id,
          recipientRole: 'PROPRIETARIO',
          senderId: 'SYSTEM',
          senderName: 'CleaningApp',
          customTitle: '⚠️ Ospiti non inseriti',
          customMessage: `La pulizia di "${property.name}" per ${dateStr} non ha il numero di ospiti. Se non lo inserisci, prepareremo per ${maxGuests} ospiti.`,
          relatedEntityId: c.id,
          relatedEntityType: 'CLEANING',
          relatedEntityName: property.name,
          link: cleaningLink,
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
            subject: `⚠️ Inserisci numero ospiti per ${property.name}`,
            html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2>⚠️ Numero ospiti mancante</h2>
              <p>Ciao <strong>${owner.name || 'Proprietario'}</strong>,</p>
              <p>La pulizia di <strong>"${property.name}"</strong> è programmata per <strong>${dateStr}</strong>, ma non hai ancora inserito il numero di ospiti.</p>
              <p><strong>Attenzione:</strong> Se non inserisci il numero entro oggi, prepareremo per <strong>${maxGuests} ospiti</strong> (capacità massima).</p>
              <p><a href="${APP_URL}${cleaningLink}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;">Inserisci numero ospiti</a></p>
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
