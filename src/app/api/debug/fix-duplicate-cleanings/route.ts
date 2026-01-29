/**
 * API: Fix Pulizie Duplicate
 * POST /api/debug/fix-duplicate-cleanings
 * 
 * 1. Trova tutte le pulizie duplicate (stessa proprietà, stessa data)
 * 2. Mantiene quella con bookingId, elimina le altre
 * 3. Se entrambe hanno bookingId, mantiene la più recente
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, doc, deleteDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// Converte data in stringa YYYY-MM-DD in timezone locale (Italia)
function toLocalDateString(date: Date): string {
  // Aggiungi 1 ora per compensare UTC -> CET (Italia)
  const localDate = new Date(date.getTime() + (1 * 60 * 60 * 1000));
  return localDate.toISOString().split('T')[0];
}

// Alternativa più robusta: usa solo la data senza orario
function normalizeToDateOnly(date: Date): string {
  // Se l'ora è >= 22:00 UTC, probabilmente è il giorno dopo in Italia
  const hours = date.getUTCHours();
  let d = new Date(date);
  
  if (hours >= 22) {
    // È probabilmente mezzanotte o dopo in Italia, aggiungi un giorno
    d.setUTCDate(d.getUTCDate() + 1);
  }
  
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  // GET = Dry run, mostra cosa verrebbe fatto
  return analyzeAndFix(false);
}

export async function POST(request: NextRequest) {
  // POST = Esegue il fix
  return analyzeAndFix(true);
}

async function analyzeAndFix(executeDelete: boolean) {
  try {
    console.log(`🔍 Analisi pulizie duplicate (executeDelete: ${executeDelete})...`);
    
    // Carica tutte le pulizie
    const cleaningsSnap = await getDocs(collection(db, "cleanings"));
    const cleanings = cleaningsSnap.docs.map(d => ({ 
      id: d.id, 
      ...d.data(),
      _scheduledDate: d.data().scheduledDate?.toDate?.(),
    }));
    
    console.log(`📋 Totale pulizie: ${cleanings.length}`);
    
    // Raggruppa per proprietà + data (normalizzata)
    const groups: Record<string, any[]> = {};
    
    for (const cleaning of cleanings) {
      if (!cleaning._scheduledDate || !cleaning.propertyId) continue;
      
      // Normalizza la data considerando il fuso orario
      const dateStr = normalizeToDateOnly(cleaning._scheduledDate);
      const key = `${cleaning.propertyId}_${dateStr}`;
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(cleaning);
    }
    
    // Trova duplicati
    const duplicateGroups: any[] = [];
    const toDelete: any[] = [];
    const toUpdate: any[] = [];
    
    for (const [key, group] of Object.entries(groups)) {
      if (group.length <= 1) continue;
      
      // Ordina: prima quelli con bookingId, poi per data creazione (più recente prima)
      group.sort((a, b) => {
        // Priorità 1: ha bookingId
        if (a.bookingId && !b.bookingId) return -1;
        if (!a.bookingId && b.bookingId) return 1;
        
        // Priorità 2: data creazione più recente
        const aCreated = a.createdAt?.toDate?.()?.getTime() || 0;
        const bCreated = b.createdAt?.toDate?.()?.getTime() || 0;
        return bCreated - aCreated;
      });
      
      // Il primo è quello da mantenere
      const keeper = group[0];
      const duplicates = group.slice(1);
      
      duplicateGroups.push({
        key,
        propertyName: keeper.propertyName,
        date: normalizeToDateOnly(keeper._scheduledDate),
        keeperId: keeper.id,
        keeperBookingId: keeper.bookingId || null,
        keeperCreatedAt: keeper.createdAt?.toDate?.()?.toISOString(),
        duplicatesToDelete: duplicates.map(d => ({
          id: d.id,
          bookingId: d.bookingId || null,
          createdAt: d.createdAt?.toDate?.()?.toISOString(),
          scheduledDate: d._scheduledDate?.toISOString(),
        })),
      });
      
      // Se il keeper non ha bookingId ma un duplicato ce l'ha, aggiorna il keeper
      if (!keeper.bookingId) {
        const withBookingId = duplicates.find(d => d.bookingId);
        if (withBookingId) {
          toUpdate.push({
            id: keeper.id,
            bookingId: withBookingId.bookingId,
            bookingSource: withBookingId.bookingSource,
            guestName: withBookingId.guestName,
          });
        }
      }
      
      // Aggiungi duplicati alla lista da eliminare
      toDelete.push(...duplicates);
    }
    
    console.log(`🔴 Gruppi con duplicati: ${duplicateGroups.length}`);
    console.log(`🗑️ Pulizie da eliminare: ${toDelete.length}`);
    console.log(`📝 Pulizie da aggiornare: ${toUpdate.length}`);
    
    // Esegui le operazioni se richiesto
    let deleted = 0;
    let updated = 0;
    
    if (executeDelete) {
      // Prima aggiorna
      for (const upd of toUpdate) {
        await updateDoc(doc(db, "cleanings", upd.id), {
          bookingId: upd.bookingId,
          bookingSource: upd.bookingSource,
          guestName: upd.guestName,
          updatedAt: Timestamp.now(),
        });
        updated++;
        console.log(`✏️ Aggiornato: ${upd.id}`);
      }
      
      // Poi elimina
      for (const del of toDelete) {
        await deleteDoc(doc(db, "cleanings", del.id));
        deleted++;
        console.log(`🗑️ Eliminato: ${del.id}`);
      }
    }
    
    return NextResponse.json({
      success: true,
      dryRun: !executeDelete,
      summary: {
        totalCleanings: cleanings.length,
        duplicateGroups: duplicateGroups.length,
        cleaningsToDelete: toDelete.length,
        cleaningsToUpdate: toUpdate.length,
        deleted: executeDelete ? deleted : 0,
        updated: executeDelete ? updated : 0,
      },
      duplicates: duplicateGroups,
      message: executeDelete 
        ? `✅ Eliminati ${deleted} duplicati, aggiornati ${updated} record`
        : `🔍 Trovati ${toDelete.length} duplicati da eliminare. Usa POST per eseguire.`,
    });
    
  } catch (error) {
    console.error("❌ Errore:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Errore" 
    }, { status: 500 });
  }
}
