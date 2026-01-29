/**
 * 🔍 SCRIPT DEBUG - Analizza pulizie e ordini biancheria
 * 
 * Mostra in dettaglio:
 * - Tutte le pulizie future
 * - Quali hanno ordini biancheria collegati
 * - Quali NO e PERCHÉ
 * - Stato delle proprietà (usesOwnLinen, serviceConfigs, ecc)
 * 
 * ENDPOINT: GET /api/admin/debug-linen-orders?secret=cleaningapp-cron-2024
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, query, where, Timestamp, doc, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADMIN_SECRET = process.env.CRON_SECRET || 'cleaningapp-cron-2024';

export async function GET(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get('secret');
  
  if (urlSecret !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    // 1. Prendi tutte le pulizie da oggi in poi
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const cleaningsQuery = query(
      collection(db, 'cleanings'),
      where('scheduledDate', '>=', Timestamp.fromDate(today))
    );
    
    const cleaningsSnap = await getDocs(cleaningsQuery);
    
    // 2. Prendi TUTTI gli ordini
    const ordersSnap = await getDocs(collection(db, 'orders'));
    
    // Mappa ordini per cleaningId
    const ordersByCleaningId = new Map<string, any>();
    const ordersByPropertyAndDate = new Map<string, any>();
    const allOrders: any[] = [];
    
    ordersSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      const order = { id: docSnap.id, ...data };
      allOrders.push(order);
      
      if (data.cleaningId) {
        ordersByCleaningId.set(data.cleaningId, order);
      }
      
      if (data.propertyId && data.scheduledDate) {
        const dateObj = data.scheduledDate.toDate ? data.scheduledDate.toDate() : new Date(data.scheduledDate);
        const dateStr = dateObj.toISOString().split('T')[0];
        const key = `${data.propertyId}_${dateStr}`;
        ordersByPropertyAndDate.set(key, order);
      }
    });
    
    // 3. Prendi tutte le proprietà
    const propertiesSnap = await getDocs(collection(db, 'properties'));
    const propertiesMap = new Map<string, any>();
    
    propertiesSnap.docs.forEach(docSnap => {
      propertiesMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
    });
    
    // 4. Analizza ogni pulizia
    const analysis: any[] = [];
    
    for (const cleaningDoc of cleaningsSnap.docs) {
      const cleaning = cleaningDoc.data();
      const cleaningId = cleaningDoc.id;
      const cleaningDate = cleaning.scheduledDate?.toDate ? cleaning.scheduledDate.toDate() : new Date(cleaning.scheduledDate);
      const dateStr = cleaningDate.toISOString().split('T')[0];
      
      const property = propertiesMap.get(cleaning.propertyId);
      
      // Cerca ordine collegato
      const orderByCleaningId = ordersByCleaningId.get(cleaningId);
      const orderByPropertyDate = ordersByPropertyAndDate.get(`${cleaning.propertyId}_${dateStr}`);
      const linkedOrder = orderByCleaningId || orderByPropertyDate;
      
      const item: any = {
        cleaningId,
        propertyId: cleaning.propertyId,
        propertyName: cleaning.propertyName || property?.name || 'SCONOSCIUTA',
        scheduledDate: dateStr,
        scheduledTime: cleaning.scheduledTime || 'N/A',
        status: cleaning.status,
        guestsCount: cleaning.guestsCount || 'NON IMPOSTATO',
        
        // Info proprietà
        property: property ? {
          id: property.id,
          name: property.name,
          usesOwnLinen: property.usesOwnLinen === true ? 'SÌ (biancheria propria)' : 'NO (usa servizio)',
          usesOwnLinenRaw: property.usesOwnLinen,
          hasServiceConfigs: !!property.serviceConfigs,
          serviceConfigsKeys: property.serviceConfigs ? Object.keys(property.serviceConfigs) : [],
          maxGuests: property.maxGuests || 'NON IMPOSTATO',
          bedrooms: property.bedrooms || 'NON IMPOSTATO',
          bathrooms: property.bathrooms || 'NON IMPOSTATO',
        } : 'PROPRIETÀ NON TROVATA',
        
        // Info ordine
        hasLinenOrder: !!linkedOrder,
        linkedOrderId: linkedOrder?.id || null,
        linkedOrderStatus: linkedOrder?.status || null,
        linkedOrderItems: linkedOrder?.items?.length || 0,
        linkedOrderFoundBy: orderByCleaningId ? 'cleaningId' : (orderByPropertyDate ? 'propertyId+date' : null),
        
        // Diagnosi
        diagnosis: ''
      };
      
      // DIAGNOSI
      if (linkedOrder) {
        item.diagnosis = '✅ OK - Ha ordine biancheria collegato';
      } else if (!property) {
        item.diagnosis = '❌ ERRORE - Proprietà non trovata nel database';
      } else if (property.usesOwnLinen === true) {
        item.diagnosis = '⏭️ CORRETTO - Proprietà usa biancheria propria, nessun ordine necessario';
      } else if (!property.serviceConfigs) {
        item.diagnosis = '⚠️ MANCA ORDINE - Proprietà migrata senza serviceConfigs, dovrebbe usare fallback';
      } else {
        const guestsCount = cleaning.guestsCount || property.maxGuests || 2;
        if (!property.serviceConfigs[guestsCount]) {
          item.diagnosis = `⚠️ MANCA ORDINE - serviceConfigs esiste ma non per ${guestsCount} ospiti (chiavi disponibili: ${Object.keys(property.serviceConfigs).join(', ')})`;
        } else {
          item.diagnosis = '⚠️ MANCA ORDINE - Ha serviceConfigs validi ma ordine non creato';
        }
      }
      
      analysis.push(item);
    }
    
    // 5. Statistiche
    const stats = {
      totalCleanings: analysis.length,
      withOrder: analysis.filter(a => a.hasLinenOrder).length,
      withoutOrder: analysis.filter(a => !a.hasLinenOrder).length,
      usesOwnLinen: analysis.filter(a => a.property?.usesOwnLinenRaw === true).length,
      missingOrderShouldHave: analysis.filter(a => 
        !a.hasLinenOrder && 
        a.property !== 'PROPRIETÀ NON TROVATA' && 
        a.property?.usesOwnLinenRaw !== true
      ).length,
    };
    
    // 6. Ordini recenti (ultimi 20)
    const recentOrders = allOrders
      .filter(o => {
        const date = o.scheduledDate?.toDate ? o.scheduledDate.toDate() : new Date(o.scheduledDate);
        return date >= today;
      })
      .sort((a, b) => {
        const dateA = a.scheduledDate?.toDate ? a.scheduledDate.toDate() : new Date(a.scheduledDate);
        const dateB = b.scheduledDate?.toDate ? b.scheduledDate.toDate() : new Date(b.scheduledDate);
        return dateA.getTime() - dateB.getTime();
      })
      .slice(0, 20)
      .map(o => ({
        id: o.id,
        propertyName: o.propertyName,
        cleaningId: o.cleaningId || 'NESSUNO',
        scheduledDate: o.scheduledDate?.toDate ? o.scheduledDate.toDate().toISOString().split('T')[0] : 'N/A',
        status: o.status,
        itemsCount: o.items?.length || 0,
        type: o.type || 'N/A'
      }));
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      
      summary: {
        message: stats.missingOrderShouldHave > 0 
          ? `⚠️ PROBLEMA: ${stats.missingOrderShouldHave} pulizie dovrebbero avere ordine biancheria ma non ce l'hanno!`
          : '✅ TUTTO OK: Tutte le pulizie hanno gli ordini corretti',
        ...stats
      },
      
      cleaningsWithoutOrder: analysis
        .filter(a => !a.hasLinenOrder)
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
      
      cleaningsWithOrder: analysis
        .filter(a => a.hasLinenOrder)
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
      
      recentOrders,
      
      allProperties: Array.from(propertiesMap.values()).map(p => ({
        id: p.id,
        name: p.name,
        usesOwnLinen: p.usesOwnLinen,
        hasServiceConfigs: !!p.serviceConfigs,
        serviceConfigsGuestCounts: p.serviceConfigs ? Object.keys(p.serviceConfigs) : [],
        maxGuests: p.maxGuests,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms
      }))
    });
    
  } catch (error: any) {
    console.error('❌ Errore debug:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
