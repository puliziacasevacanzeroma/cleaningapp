/**
 * 🔬 ANALISI PROFONDA - Debug completo flusso ordini
 * 
 * Questo script analizza in dettaglio:
 * 1. Le pulizie specifiche senza ordine
 * 2. Il confronto con pulizie che hanno ordine
 * 3. La configurazione della proprietà
 * 4. Il flusso di creazione nel sync-ical
 * 5. Possibili cause e pattern
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const propertyFilter = req.nextUrl.searchParams.get('property') || '';
  
  try {
    if (process.env.NODE_ENV !== "production") console.log('\n🔬 ANALISI PROFONDA FLUSSO ORDINI');
    if (process.env.NODE_ENV !== "production") console.log('='.repeat(70));
    
    // Carica tutti i dati
    const [cleaningsSnap, ordersSnap, propertiesSnap, bookingsSnap] = await Promise.all([
      adminDb.collection('cleanings').get(),
      adminDb.collection('orders').get(),
      adminDb.collection('properties').get(),
      adminDb.collection('bookings').get(),
    ]);
    
    const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
    const properties = propertiesSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
    const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
    
    // Filtra per proprietà se specificato
    const filteredCleanings = propertyFilter 
      ? cleanings.filter((c: any) => c.propertyName?.toLowerCase().includes(propertyFilter.toLowerCase()))
      : cleanings;
    
    // Mappa ordini per cleaningId
    const ordersByCleaningId = new Map<string, any>();
    orders.forEach((o: any) => {
      if (o.cleaningId && o.status !== 'CANCELLED') {
        ordersByCleaningId.set(o.cleaningId, o);
      }
    });
    
    // Mappa proprietà
    const propertiesById = new Map(properties.map((p: any) => [p.id, p]));
    
    // Mappa prenotazioni
    const bookingsById = new Map(bookings.map((b: any) => [b.id, b]));
    
    // ==================== ANALISI PULIZIE SENZA ORDINE ====================
    const cleaningsWithoutOrder: any[] = [];
    const cleaningsWithOrder: any[] = [];
    
    for (const cleaning of filteredCleanings as any[]) {
      const prop = propertiesById.get(cleaning.propertyId) as any;
      if (!prop || prop.usesOwnLinen) continue;
      
      const order = ordersByCleaningId.get(cleaning.id);
      const booking = cleaning.bookingId ? bookingsById.get(cleaning.bookingId) : null;
      
      const cleaningData = {
        cleaningId: cleaning.id,
        propertyId: cleaning.propertyId,
        propertyName: cleaning.propertyName,
        scheduledDate: cleaning.scheduledDate?.toDate?.()?.toISOString(),
        createdAt: cleaning.createdAt?.toDate?.()?.toISOString(),
        status: cleaning.status,
        guestsCount: cleaning.guestsCount,
        bookingId: cleaning.bookingId,
        bookingSource: cleaning.bookingSource,
        laundryOrderId: cleaning.laundryOrderId,
        requiresLaundry: cleaning.requiresLaundry,
        // Dati booking correlato
        booking: booking ? {
          id: booking.id,
          guestName: booking.guestName,
          source: booking.source,
          checkIn: booking.checkIn?.toDate?.()?.toISOString(),
          checkOut: booking.checkOut?.toDate?.()?.toISOString(),
          icalUid: booking.icalUid,
        } : null,
        // Dati ordine correlato (se esiste)
        order: order ? {
          id: order.id,
          status: order.status,
          scheduledDate: order.scheduledDate?.toDate?.()?.toISOString(),
          itemsCount: order.items?.length,
        } : null,
      };
      
      if (!order && !cleaning.laundryOrderId) {
        cleaningsWithoutOrder.push(cleaningData);
      } else {
        cleaningsWithOrder.push(cleaningData);
      }
    }
    
    // ==================== CONFRONTO PATTERN ====================
    const analysis: any = {
      totalCleanings: filteredCleanings.length,
      cleaningsWithOrder: cleaningsWithOrder.length,
      cleaningsWithoutOrder: cleaningsWithoutOrder.length,
      
      // Analisi pulizie senza ordine
      withoutOrderDetails: cleaningsWithoutOrder.map(c => ({
        ...c,
        // Cerca pattern
        hasBookingId: !!c.bookingId,
        hasGuestsCount: !!c.guestsCount && c.guestsCount > 0,
        hasBookingSource: !!c.bookingSource,
      })),
      
      // Confronto con una pulizia che funziona (stessa proprietà)
      workingExample: null as any,
      
      // Pattern comuni
      patterns: {
        withoutOrder: {
          hasBookingId: 0,
          hasGuestsCount: 0,
          bookingSources: {} as Record<string, number>,
          dates: [] as string[],
        },
        withOrder: {
          hasBookingId: 0,
          hasGuestsCount: 0,
          bookingSources: {} as Record<string, number>,
        },
      },
    };
    
    // Calcola pattern per pulizie SENZA ordine
    cleaningsWithoutOrder.forEach(c => {
      if (c.bookingId) analysis.patterns.withoutOrder.hasBookingId++;
      if (c.guestsCount > 0) analysis.patterns.withoutOrder.hasGuestsCount++;
      const src = c.bookingSource || 'unknown';
      analysis.patterns.withoutOrder.bookingSources[src] = (analysis.patterns.withoutOrder.bookingSources[src] || 0) + 1;
      if (c.scheduledDate) analysis.patterns.withoutOrder.dates.push(c.scheduledDate.split('T')[0]);
    });
    
    // Calcola pattern per pulizie CON ordine
    cleaningsWithOrder.forEach(c => {
      if (c.bookingId) analysis.patterns.withOrder.hasBookingId++;
      if (c.guestsCount > 0) analysis.patterns.withOrder.hasGuestsCount++;
      const src = c.bookingSource || 'unknown';
      analysis.patterns.withOrder.bookingSources[src] = (analysis.patterns.withOrder.bookingSources[src] || 0) + 1;
    });
    
    // Trova esempio funzionante della stessa proprietà
    if (cleaningsWithoutOrder.length > 0) {
      const problemPropId = cleaningsWithoutOrder[0].propertyId;
      analysis.workingExample = cleaningsWithOrder.find(c => c.propertyId === problemPropId);
    }
    
    // ==================== ANALISI PROPRIETÀ ====================
    const problemPropertyIds = [...new Set(cleaningsWithoutOrder.map(c => c.propertyId))];
    const propertyAnalysis: any[] = [];
    
    for (const propId of problemPropertyIds) {
      const prop = propertiesById.get(propId) as any;
      if (!prop) continue;
      
      propertyAnalysis.push({
        id: prop.id,
        name: prop.name,
        usesOwnLinen: prop.usesOwnLinen,
        hasServiceConfigs: !!(prop.serviceConfigs && Object.keys(prop.serviceConfigs).length > 0),
        serviceConfigsKeys: prop.serviceConfigs ? Object.keys(prop.serviceConfigs) : [],
        hasLinenConfig: !!(prop.linenConfig && prop.linenConfig.length > 0),
        maxGuests: prop.maxGuests,
        bedrooms: prop.bedrooms,
        bathrooms: prop.bathrooms,
        // Verifica config per numero ospiti specifico
        configForGuests: cleaningsWithoutOrder
          .filter(c => c.propertyId === propId)
          .map(c => ({
            guestsCount: c.guestsCount,
            hasConfig: prop.serviceConfigs ? !!(prop.serviceConfigs[c.guestsCount] || prop.serviceConfigs[String(c.guestsCount)]) : false,
          })),
      });
    }
    
    analysis.propertyAnalysis = propertyAnalysis;
    
    // ==================== VERIFICA FLUSSO SYNC-ICAL ====================
    // Controlla se le date problematiche hanno caratteristiche particolari
    const dateAnalysis: any = {
      problemDates: analysis.patterns.withoutOrder.dates,
      possibleCauses: [],
    };
    
    // Verifica se sono date passate, future, o speciali
    const now = new Date();
    cleaningsWithoutOrder.forEach(c => {
      const date = new Date(c.scheduledDate);
      if (date < now) {
        dateAnalysis.possibleCauses.push(`${c.scheduledDate.split('T')[0]}: Data nel passato - il sync potrebbe aver saltato`);
      }
    });
    
    // Verifica se hanno bookingSource particolare
    if (Object.keys(analysis.patterns.withoutOrder.bookingSources).length > 0) {
      Object.entries(analysis.patterns.withoutOrder.bookingSources).forEach(([src, count]) => {
        if (src === 'unknown' || !src) {
          dateAnalysis.possibleCauses.push(`${count} pulizie senza bookingSource - potrebbero essere manuali o con errore`);
        }
      });
    }
    
    analysis.dateAnalysis = dateAnalysis;
    
    // ==================== DIAGNOSI FINALE ====================
    const diagnosis: string[] = [];
    
    // Check 1: Manca guestsCount
    const withoutGuests = cleaningsWithoutOrder.filter(c => !c.guestsCount || c.guestsCount === 0);
    if (withoutGuests.length > 0) {
      diagnosis.push(`❌ ${withoutGuests.length} pulizie senza guestsCount - impossibile calcolare biancheria`);
    }
    
    // Check 2: Manca configurazione per numero ospiti
    propertyAnalysis.forEach(prop => {
      prop.configForGuests.forEach((cfg: any) => {
        if (!cfg.hasConfig && cfg.guestsCount) {
          diagnosis.push(`❌ Proprietà "${prop.name}" non ha config per ${cfg.guestsCount} ospiti`);
        }
      });
    });
    
    // Check 3: Date nel passato
    const pastDates = cleaningsWithoutOrder.filter(c => new Date(c.scheduledDate) < now);
    if (pastDates.length > 0) {
      diagnosis.push(`⚠️ ${pastDates.length} pulizie con data nel passato - il sync potrebbe averle saltate`);
    }
    
    // Check 4: Booking source mancante
    const noSource = cleaningsWithoutOrder.filter(c => !c.bookingSource);
    if (noSource.length > 0) {
      diagnosis.push(`⚠️ ${noSource.length} pulizie senza bookingSource - origine sconosciuta`);
    }
    
    // Check 5: Confronto con esempio funzionante
    if (analysis.workingExample && cleaningsWithoutOrder.length > 0) {
      const working = analysis.workingExample;
      const notWorking = cleaningsWithoutOrder[0];
      
      if (working.guestsCount !== notWorking.guestsCount) {
        diagnosis.push(`🔍 Differenza guestsCount: funzionante=${working.guestsCount}, non funzionante=${notWorking.guestsCount}`);
      }
      if (working.bookingSource !== notWorking.bookingSource) {
        diagnosis.push(`🔍 Differenza bookingSource: funzionante=${working.bookingSource}, non funzionante=${notWorking.bookingSource}`);
      }
    }
    
    if (diagnosis.length === 0) {
      diagnosis.push('✅ Nessun problema evidente trovato - potrebbe essere un errore temporaneo durante il sync');
    }
    
    analysis.diagnosis = diagnosis;
    
    // ==================== RACCOMANDAZIONI ====================
    const recommendations: string[] = [];
    
    if (withoutGuests.length > 0) {
      recommendations.push('Imposta guestsCount per le pulizie che ne sono prive');
    }
    
    if (cleaningsWithoutOrder.length > 0 && cleaningsWithoutOrder.length <= 5) {
      recommendations.push('Per poche pulizie mancanti, crea gli ordini manualmente dalla dashboard');
    }
    
    recommendations.push('Il sistema ora ha i fix per prevenire questi problemi in futuro');
    recommendations.push('Monitora i prossimi sync per verificare che non si ripresentino');
    
    analysis.recommendations = recommendations;
    
    return NextResponse.json({
      success: true,
      summary: {
        totalAnalyzed: filteredCleanings.length,
        withOrder: cleaningsWithOrder.length,
        withoutOrder: cleaningsWithoutOrder.length,
        percentage: `${Math.round(cleaningsWithOrder.length / filteredCleanings.length * 100)}%`,
      },
      analysis,
    });
    
  } catch (error: any) {
    console.error('❌ Errore:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
