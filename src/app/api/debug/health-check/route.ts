/**
 * API: Health Check Completo Sistema
 * GET /api/debug/health-check
 * 
 * Analizza TUTTE le proprietà e trova TUTTI i possibili problemi:
 * - Proprietà senza cleaningPrice
 * - Proprietà senza ownerId
 * - Proprietà con status inconsistente
 * - Pulizie duplicate (stessa data, stessa proprietà)
 * - Pulizie senza prezzo
 * - Pulizie orfane (proprietà non esiste)
 * - Prenotazioni orfane
 * - Ordini orfani
 * - Utenti senza ruolo
 * - Link iCal multipli che potrebbero causare duplicati
 * - Notifiche pendenti non lette
 * - Richieste cancellazione pendenti
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

interface PropertyIssue {
  id: string;
  name: string;
  issues: string[];
  details: Record<string, any>;
}

interface CleaningIssue {
  id: string;
  propertyId: string;
  propertyName: string;
  date: string;
  issue: string;
  details: Record<string, any>;
}

interface SystemIssue {
  category: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  count: number;
  items?: any[];
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log("🏥 Health Check Avviato...");
    
    // ==================== CARICA TUTTI I DATI ====================
    const [
      propertiesSnap,
      cleaningsSnap,
      bookingsSnap,
      ordersSnap,
      usersSnap,
      notificationsSnap,
      deletionRequestsSnap,
    ] = await Promise.all([
      getDocs(collection(db, "properties")),
      getDocs(collection(db, "cleanings")),
      getDocs(collection(db, "bookings")),
      getDocs(collection(db, "orders")),
      getDocs(collection(db, "users")),
      getDocs(collection(db, "notifications")),
      getDocs(query(collection(db, "deletionRequests"), where("status", "==", "pending"))),
    ]);
    
    const properties = propertiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const notifications = notificationsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const deletionRequests = deletionRequestsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const propertyIds = new Set(properties.map(p => p.id));
    
    console.log(`📊 Dati caricati: ${properties.length} proprietà, ${cleanings.length} pulizie, ${bookings.length} prenotazioni`);
    
    // ==================== ANALISI PROPRIETÀ ====================
    const propertyIssues: PropertyIssue[] = [];
    
    for (const prop of properties) {
      const issues: string[] = [];
      const details: Record<string, any> = {};
      
      // 1. Senza cleaningPrice
      if (!prop.cleaningPrice || prop.cleaningPrice === 0) {
        issues.push("❌ cleaningPrice mancante o zero");
        details.cleaningPrice = prop.cleaningPrice;
      }
      
      // 2. Senza ownerId (proprietà admin-created senza proprietario assegnato)
      if (!prop.ownerId) {
        issues.push("⚠️ ownerId mancante");
      }
      
      // 3. Status inconsistente
      const validStatuses = ['ACTIVE', 'PENDING', 'INACTIVE', 'DELETED', 'PENDING_DELETION', 'SUSPENDED'];
      if (!prop.status || !validStatuses.includes(prop.status)) {
        issues.push(`❌ Status non valido: ${prop.status}`);
        details.status = prop.status;
      }
      
      // 4. PENDING senza data creazione recente (vecchie pending dimenticate)
      if (prop.status === 'PENDING') {
        const createdAt = prop.createdAt?.toDate?.();
        if (createdAt) {
          const daysSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceCreation > 30) {
            issues.push(`⚠️ PENDING da ${Math.floor(daysSinceCreation)} giorni`);
            details.pendingDays = Math.floor(daysSinceCreation);
          }
        }
      }
      
      // 5. deactivationRequested ma status ACTIVE (inconsistenza)
      if (prop.deactivationRequested && prop.status === 'ACTIVE') {
        // Questo è OK - è in attesa di approvazione
        // Ma verifichiamo che esista una deletion request
        const hasRequest = deletionRequests.some((r: any) => r.propertyId === prop.id);
        if (!hasRequest) {
          issues.push("⚠️ deactivationRequested=true ma nessuna deletionRequest trovata");
        }
      }
      
      // 6. Link iCal multipli (potenziale fonte di duplicati)
      const icalLinks = [
        prop.icalAirbnb, prop.icalBooking, prop.icalOktorate,
        prop.icalKrossbooking, prop.icalInreception, prop.icalUrl
      ].filter(Boolean);
      
      if (icalLinks.length > 1) {
        issues.push(`ℹ️ ${icalLinks.length} link iCal configurati (verificare duplicati)`);
        details.icalLinksCount = icalLinks.length;
      }
      
      // 7. maxGuests non impostato
      if (!prop.maxGuests || prop.maxGuests < 1) {
        issues.push("⚠️ maxGuests non impostato");
      }
      
      // 8. checkInTime/checkOutTime mancanti
      if (!prop.checkInTime || !prop.checkOutTime) {
        issues.push("⚠️ checkInTime o checkOutTime mancanti");
      }
      
      if (issues.length > 0) {
        propertyIssues.push({
          id: prop.id,
          name: prop.name || "Senza nome",
          issues,
          details,
        });
      }
    }
    
    // ==================== ANALISI PULIZIE ====================
    const cleaningIssues: CleaningIssue[] = [];
    const cleaningsByPropertyDate: Record<string, any[]> = {};
    
    for (const cleaning of cleanings) {
      const propId = cleaning.propertyId;
      const scheduledDate = cleaning.scheduledDate?.toDate?.();
      const dateStr = scheduledDate?.toISOString().split('T')[0] || 'unknown';
      
      // 1. Pulizia orfana (proprietà non esiste)
      if (!propertyIds.has(propId)) {
        cleaningIssues.push({
          id: cleaning.id,
          propertyId: propId,
          propertyName: cleaning.propertyName || "N/A",
          date: dateStr,
          issue: "❌ ORFANA - Proprietà non esiste",
          details: { status: cleaning.status },
        });
        continue;
      }
      
      // 2. Pulizia senza prezzo
      if (!cleaning.price && cleaning.price !== 0) {
        const prop = properties.find(p => p.id === propId);
        cleaningIssues.push({
          id: cleaning.id,
          propertyId: propId,
          propertyName: cleaning.propertyName || prop?.name || "N/A",
          date: dateStr,
          issue: "⚠️ Prezzo mancante",
          details: { status: cleaning.status, price: cleaning.price },
        });
      }
      
      // 3. Raggruppa per proprietà+data per trovare duplicati
      const key = `${propId}_${dateStr}`;
      if (!cleaningsByPropertyDate[key]) cleaningsByPropertyDate[key] = [];
      cleaningsByPropertyDate[key].push(cleaning);
    }
    
    // 4. Trova duplicati
    const duplicateCleanings: any[] = [];
    for (const [key, cleaningsList] of Object.entries(cleaningsByPropertyDate)) {
      if (cleaningsList.length > 1) {
        const [propId, date] = key.split('_');
        const prop = properties.find(p => p.id === propId);
        duplicateCleanings.push({
          propertyId: propId,
          propertyName: prop?.name || "N/A",
          date,
          count: cleaningsList.length,
          cleanings: cleaningsList.map(c => ({
            id: c.id,
            status: c.status,
            bookingSource: c.bookingSource || "N/A",
            price: c.price,
            createdAt: c.createdAt?.toDate?.()?.toISOString(),
          })),
        });
      }
    }
    
    // ==================== ANALISI PRENOTAZIONI ====================
    const orphanBookings = bookings.filter(b => !propertyIds.has(b.propertyId));
    
    // ==================== ANALISI ORDINI ====================
    const orphanOrders = orders.filter(o => !propertyIds.has(o.propertyId));
    
    // ==================== ANALISI UTENTI ====================
    const usersWithoutRole = users.filter(u => !u.role);
    const usersByRole: Record<string, number> = {};
    users.forEach(u => {
      const role = u.role || 'NO_ROLE';
      usersByRole[role] = (usersByRole[role] || 0) + 1;
    });
    
    // ==================== ANALISI NOTIFICHE ====================
    const unreadNotifications = notifications.filter(n => n.status === 'UNREAD');
    const oldUnreadNotifications = unreadNotifications.filter(n => {
      const createdAt = n.createdAt?.toDate?.();
      if (!createdAt) return false;
      const daysSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceCreation > 7;
    });
    
    // ==================== RIEPILOGO PROBLEMI ====================
    const systemIssues: SystemIssue[] = [];
    
    // Proprietà senza prezzo
    const propsWithoutPrice = propertyIssues.filter(p => 
      p.issues.some(i => i.includes('cleaningPrice'))
    );
    if (propsWithoutPrice.length > 0) {
      systemIssues.push({
        category: "Proprietà senza prezzo",
        severity: 'critical',
        message: `${propsWithoutPrice.length} proprietà senza cleaningPrice configurato`,
        count: propsWithoutPrice.length,
        items: propsWithoutPrice.map(p => ({ id: p.id, name: p.name })),
      });
    }
    
    // Pulizie duplicate
    if (duplicateCleanings.length > 0) {
      systemIssues.push({
        category: "Pulizie duplicate",
        severity: 'critical',
        message: `${duplicateCleanings.length} date con pulizie duplicate`,
        count: duplicateCleanings.length,
        items: duplicateCleanings,
      });
    }
    
    // Pulizie senza prezzo
    const cleaningsWithoutPrice = cleaningIssues.filter(c => c.issue.includes('Prezzo'));
    if (cleaningsWithoutPrice.length > 0) {
      systemIssues.push({
        category: "Pulizie senza prezzo",
        severity: 'warning',
        message: `${cleaningsWithoutPrice.length} pulizie senza prezzo`,
        count: cleaningsWithoutPrice.length,
        items: cleaningsWithoutPrice.slice(0, 20), // Primi 20
      });
    }
    
    // Pulizie orfane
    const orphanCleanings = cleaningIssues.filter(c => c.issue.includes('ORFANA'));
    if (orphanCleanings.length > 0) {
      systemIssues.push({
        category: "Pulizie orfane",
        severity: 'critical',
        message: `${orphanCleanings.length} pulizie senza proprietà`,
        count: orphanCleanings.length,
        items: orphanCleanings,
      });
    }
    
    // Prenotazioni orfane
    if (orphanBookings.length > 0) {
      systemIssues.push({
        category: "Prenotazioni orfane",
        severity: 'warning',
        message: `${orphanBookings.length} prenotazioni senza proprietà`,
        count: orphanBookings.length,
        items: orphanBookings.slice(0, 10).map(b => ({ id: b.id, propertyId: b.propertyId })),
      });
    }
    
    // Ordini orfani
    if (orphanOrders.length > 0) {
      systemIssues.push({
        category: "Ordini orfani",
        severity: 'warning',
        message: `${orphanOrders.length} ordini senza proprietà`,
        count: orphanOrders.length,
        items: orphanOrders.slice(0, 10).map(o => ({ id: o.id, propertyId: o.propertyId })),
      });
    }
    
    // Richieste cancellazione pendenti
    if (deletionRequests.length > 0) {
      systemIssues.push({
        category: "Richieste cancellazione pendenti",
        severity: 'info',
        message: `${deletionRequests.length} richieste in attesa di approvazione`,
        count: deletionRequests.length,
        items: deletionRequests.map((r: any) => ({ 
          id: r.id, 
          propertyName: r.propertyName,
          reason: r.reason,
        })),
      });
    }
    
    // Notifiche non lette vecchie
    if (oldUnreadNotifications.length > 0) {
      systemIssues.push({
        category: "Notifiche non lette (>7 giorni)",
        severity: 'info',
        message: `${oldUnreadNotifications.length} notifiche non lette da più di 7 giorni`,
        count: oldUnreadNotifications.length,
      });
    }
    
    // Proprietà PENDING vecchie
    const oldPendingProps = propertyIssues.filter(p => 
      p.issues.some(i => i.includes('PENDING da'))
    );
    if (oldPendingProps.length > 0) {
      systemIssues.push({
        category: "Proprietà PENDING vecchie",
        severity: 'warning',
        message: `${oldPendingProps.length} proprietà in PENDING da più di 30 giorni`,
        count: oldPendingProps.length,
        items: oldPendingProps.map(p => ({ id: p.id, name: p.name, days: p.details.pendingDays })),
      });
    }
    
    // ==================== CALCOLA SCORE SALUTE ====================
    const criticalCount = systemIssues.filter(i => i.severity === 'critical').reduce((sum, i) => sum + i.count, 0);
    const warningCount = systemIssues.filter(i => i.severity === 'warning').reduce((sum, i) => sum + i.count, 0);
    
    let healthScore = 100;
    healthScore -= criticalCount * 10;
    healthScore -= warningCount * 2;
    healthScore = Math.max(0, healthScore);
    
    let healthStatus = '🟢 OTTIMO';
    if (healthScore < 50) healthStatus = '🔴 CRITICO';
    else if (healthScore < 70) healthStatus = '🟠 ATTENZIONE';
    else if (healthScore < 90) healthStatus = '🟡 BUONO';
    
    const elapsedMs = Date.now() - startTime;
    
    return NextResponse.json({
      status: healthStatus,
      healthScore,
      executionTime: `${elapsedMs}ms`,
      summary: {
        totalProperties: properties.length,
        totalCleanings: cleanings.length,
        totalBookings: bookings.length,
        totalOrders: orders.length,
        totalUsers: users.length,
        usersByRole,
        propertiesWithIssues: propertyIssues.length,
        criticalIssues: criticalCount,
        warningIssues: warningCount,
      },
      issues: systemIssues.sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      }),
      details: {
        propertyIssues: propertyIssues.slice(0, 50), // Primi 50
        duplicateCleanings,
      },
    });
    
  } catch (error) {
    console.error("❌ Health Check Error:", error);
    return NextResponse.json({ 
      status: "🔴 ERRORE",
      error: error instanceof Error ? error.message : "Errore sconosciuto" 
    }, { status: 500 });
  }
}
