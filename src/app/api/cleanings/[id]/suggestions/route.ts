import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  Timestamp 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import {
  getTopOperatorsForCleaning,
  loadTodayAssignmentsByOperator,
  type CleaningForAssignment,
  type OperatorForAssignment,
} from "~/lib/assignments";

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// HELPER: Ottieni utente da cookie
// ═══════════════════════════════════════════════════════════════

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) {
      return JSON.parse(decodeURIComponent(userCookie.value));
    }
    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// GET - Ottieni suggerimenti per assegnazione
// ═══════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // Solo admin può vedere suggerimenti
    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Solo admin può vedere i suggerimenti" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "5");

    console.log(`\n🎯 Calcolo suggerimenti per pulizia: ${id}`);

    // ─── CARICA PULIZIA ───
    const cleaningRef = doc(db, "cleanings", id);
    const cleaningSnap = await getDoc(cleaningRef);

    if (!cleaningSnap.exists()) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const cleaningData = cleaningSnap.data();

    // Verifica che la pulizia non sia già completata/annullata
    if (cleaningData.status === "COMPLETED" || cleaningData.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Non puoi assegnare una pulizia completata o annullata" },
        { status: 400 }
      );
    }

    // ─── CARICA PROPRIETÀ PER COORDINATE ───
    let propertyCoordinates = cleaningData.propertyCoordinates;
    
    if (!propertyCoordinates && cleaningData.propertyId) {
      const propertyRef = doc(db, "properties", cleaningData.propertyId);
      const propertySnap = await getDoc(propertyRef);
      
      if (propertySnap.exists()) {
        const propertyData = propertySnap.data();
        propertyCoordinates = propertyData.coordinates;
      }
    }

    // Prepara oggetto pulizia per l'algoritmo
    const scheduledDate = cleaningData.scheduledDate?.toDate?.() || new Date();
    
    const cleaningForAssignment: CleaningForAssignment = {
      id,
      propertyId: cleaningData.propertyId,
      propertyName: cleaningData.propertyName || "Proprietà",
      propertyAddress: cleaningData.propertyAddress || "",
      propertyCity: cleaningData.propertyCity,
      propertyPostalCode: cleaningData.propertyPostalCode,
      coordinates: propertyCoordinates,
      scheduledDate,
      scheduledTime: cleaningData.scheduledTime,
      estimatedDuration: cleaningData.estimatedDuration,
    };

    console.log(`📍 Proprietà: ${cleaningForAssignment.propertyName}`);
    console.log(`📅 Data: ${scheduledDate.toISOString().split('T')[0]}`);
    console.log(`🗺️ Coordinate: ${propertyCoordinates ? 'Sì' : 'No'}`);

    // ─── CARICA OPERATORI ATTIVI ───
    const operatorsQuery = query(
      collection(db, "users"),
      where("role", "==", "OPERATORE_PULIZIE"),
      where("status", "==", "ACTIVE")
    );

    const operatorsSnap = await getDocs(operatorsQuery);
    
    const operators: OperatorForAssignment[] = operatorsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || data.displayName || "Operatore",
        email: data.email || "",
        phone: data.phone,
        status: data.status || "ACTIVE",
        rating: data.rating || 4.0, // Default 4.0
      };
    });

    console.log(`👥 Operatori attivi trovati: ${operators.length}`);

    if (operators.length === 0) {
      return NextResponse.json({
        suggestions: [],
        message: "Nessun operatore attivo trovato",
        cleaning: {
          id,
          propertyName: cleaningForAssignment.propertyName,
          scheduledDate: scheduledDate.toISOString(),
          scheduledTime: cleaningForAssignment.scheduledTime,
        },
      });
    }

    // ─── CARICA ASSEGNAZIONI DEL GIORNO ───
    // IMPORTANTE: Escludiamo la pulizia corrente dal conteggio!
    // Così se stiamo decidendo chi assegnare a questa pulizia,
    // non viene contata nel carico di lavoro
    const todayAssignments = await loadTodayAssignmentsByOperator(
      scheduledDate,
      id // <-- Escludi questa pulizia dal conteggio
    );

    // Log carico per debug
    console.log(`\n📊 Carico operatori (escludendo pulizia ${id}):`);
    operators.forEach(op => {
      const count = todayAssignments.get(op.id)?.length || 0;
      console.log(`  - ${op.name}: ${count} pulizie`);
    });

    // ─── CALCOLA SUGGERIMENTI ───
    const suggestions = await getTopOperatorsForCleaning(
      cleaningForAssignment,
      operators,
      todayAssignments,
      limit
    );

    // ─── STATISTICHE RIEPILOGO ───
    const totalOperators = operators.length;
    const operatorsWithAssignments = todayAssignments.size;
    const totalAssignments = Array.from(todayAssignments.values()).reduce(
      (sum, arr) => sum + arr.length, 
      0
    );
    const averageWorkload = totalOperators > 0
      ? totalAssignments / totalOperators
      : 0;

    console.log(`\n✅ Suggerimenti calcolati: ${suggestions.length}`);
    suggestions.slice(0, 3).forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.operatorName}: ${s.totalScore}/100 (carico: ${s.breakdown.workload.todayCleanings})`);
    });

    // ─── RISPOSTA ───
    return NextResponse.json({
      suggestions: suggestions.map((s, index) => ({
        ...s,
        rank: index + 1,
        medal: index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : null,
      })),
      cleaning: {
        id,
        propertyId: cleaningForAssignment.propertyId,
        propertyName: cleaningForAssignment.propertyName,
        propertyAddress: cleaningForAssignment.propertyAddress,
        hasCoordinates: !!propertyCoordinates,
        scheduledDate: scheduledDate.toISOString(),
        scheduledTime: cleaningForAssignment.scheduledTime,
        currentOperatorId: cleaningData.operatorId || null,
        currentOperatorName: cleaningData.operatorName || null,
        currentOperators: cleaningData.operators || [],
        status: cleaningData.status,
      },
      stats: {
        totalOperators,
        operatorsWithAssignments,
        totalAssignments,
        averageWorkload: Math.round(averageWorkload * 10) / 10,
        date: scheduledDate.toISOString().split("T")[0],
      },
    });
  } catch (error) {
    console.error("❌ Errore GET suggestions:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
