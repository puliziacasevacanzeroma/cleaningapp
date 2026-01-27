/**
 * 🔔 CRON JOB - Notifica Ospiti Mancanti
 * 
 * Gira ogni giorno alle 12:00
 * Per ogni pulizia di DOMANI senza guestsCount:
 * - Invia notifica in-app al proprietario
 * - Invia email al proprietario
 * 
 * Se il proprietario non inserisce il numero ospiti,
 * la pulizia userà maxGuests della proprietà.
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { createNotification } from "~/lib/notifications/createNotification";
import { Resend } from "resend";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || 'cleaningapp-cron-2024';
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

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
  const stats = { 
    cleaningsTomorrow: 0, 
    missingGuestCount: 0, 
    notificationsSent: 0, 
    emailsSent: 0,
    errors: 0 
  };
  
  console.log('\n🔔 CHECK OSPITI MANCANTI - ' + new Date().toISOString());
  
  try {
    // Calcola "domani" (da mezzanotte a mezzanotte)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    
    // Carica proprietà per avere info proprietario
    const propsSnap = await getDocs(collection(db, 'properties'));
    const propertiesMap = new Map<string, any>();
    propsSnap.docs.forEach(d => {
      propertiesMap.set(d.id, { id: d.id, ...d.data() });
    });
    
    // Carica utenti per avere email
    const usersSnap = await getDocs(collection(db, 'users'));
    const usersMap = new Map<string, any>();
    usersSnap.docs.forEach(d => {
      usersMap.set(d.id, { id: d.id, ...d.data() });
    });
    
    // Trova pulizie di domani
    const cleaningsSnap = await getDocs(collection(db, 'cleanings'));
    const cleaningsTomorrow = cleaningsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((c: any) => {
        const date = c.scheduledDate?.toDate?.();
        if (!date) return false;
        return date >= tomorrow && date < dayAfterTomorrow;
      });
    
    stats.cleaningsTomorrow = cleaningsTomorrow.length;
    console.log(`📅 Pulizie domani (${tomorrow.toLocaleDateString('it-IT')}): ${cleaningsTomorrow.length}`);
    
    // Per ogni pulizia senza guestsCount
    for (const cleaning of cleaningsTomorrow) {
      const c = cleaning as any;
      
      // Salta se ha già guestsCount
      if (c.guestsCount && c.guestsCount > 0) {
        continue;
      }
      
      stats.missingGuestCount++;
      
      const property = propertiesMap.get(c.propertyId);
      if (!property) {
        console.log(`   ⚠️ Proprietà non trovata: ${c.propertyId}`);
        continue;
      }
      
      const owner = usersMap.get(property.ownerId);
      if (!owner) {
        console.log(`   ⚠️ Proprietario non trovato: ${property.ownerId}`);
        continue;
      }
      
      const maxGuests = property.maxGuests || 2;
      const cleaningDate = c.scheduledDate?.toDate?.();
      const dateStr = cleaningDate?.toLocaleDateString('it-IT', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long' 
      }) || 'domani';
      
      // 1. Invia notifica in-app
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
          link: `/proprietario/proprieta/${property.id}`,
        });
        stats.notificationsSent++;
        console.log(`   📱 Notifica inviata a ${owner.name || owner.email}`);
      } catch (err) {
        console.error(`   ❌ Errore notifica:`, err);
        stats.errors++;
      }
      
      // 2. Invia email
      if (resend && owner.email) {
        try {
          await resend.emails.send({
            from: 'CleaningApp <noreply@cleaningapp.it>',
            to: owner.email,
            subject: `⚠️ Inserisci numero ospiti per ${property.name}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ Numero ospiti mancante</h1>
                </div>
                
                <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
                  <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                    Ciao <strong>${owner.name || 'Proprietario'}</strong>,
                  </p>
                  
                  <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                    La pulizia della tua proprietà <strong>"${property.name}"</strong> è programmata per <strong>${dateStr}</strong>, ma non hai ancora inserito il numero di ospiti.
                  </p>
                  
                  <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
                    <p style="margin: 0; color: #92400e; font-size: 14px;">
                      <strong>Importante:</strong> Se non inserisci il numero di ospiti entro oggi, prepareremo la casa per <strong>${maxGuests} ospiti</strong> (capacità massima).
                    </p>
                  </div>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://cleaningapp-production.up.railway.app/proprietario/proprieta/${property.id}" 
                       style="display: inline-block; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px;">
                      Inserisci numero ospiti
                    </a>
                  </div>
                  
                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                  
                  <p style="font-size: 12px; color: #9ca3af; text-align: center;">
                    Questa email è stata inviata automaticamente da CleaningApp.<br>
                    Se hai domande, contatta il supporto.
                  </p>
                </div>
              </div>
            `,
          });
          stats.emailsSent++;
          console.log(`   📧 Email inviata a ${owner.email}`);
        } catch (err) {
          console.error(`   ❌ Errore email:`, err);
          stats.errors++;
        }
      } else if (!resend) {
        console.log(`   ⚠️ Resend non configurato - email non inviata`);
      }
    }
    
    console.log(`\n✅ COMPLETATO: ${stats.missingGuestCount} pulizie senza ospiti, ${stats.notificationsSent} notifiche, ${stats.emailsSent} email`);
    
    return NextResponse.json({ success: true, stats });
    
  } catch (error: any) {
    console.error('❌ Errore:', error);
    return NextResponse.json({ success: false, error: error.message, stats }, { status: 500 });
  }
}
