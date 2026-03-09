import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
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

// ═══════════════════════════════════════════════════════════════
// GET - Ottieni suggerimenti per assegnazione
// ═══════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    
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

    // ─── CARICA PULIZIA ───
    const cleaningRef = adminDb.collection("cleanings").doc(id);
    const cleaningSnap = await cleaningRef.get();

    if (!cleaningSnap.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const cleaningData = cleaningSnap.data();

    // Verifica che la pulizia non sia già completata/annullata
    // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
    if (cleaningData.status === "COMPLETED" || cleaningData.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Non puoi assegnare una pulizia completata o annullata" },
        { status: 400 }
      );
    }

    // ─── CARICA PROPRIETÀ PER COORDINATE ───
    // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
    let propertyCoordinates = cleaningData.propertyCoordinates;
    
    // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
    if (!propertyCoordinates && cleaningData.propertyId) {
      // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
      const propertyRef = adminDb.collection("properties").doc(cleaningData.propertyId);
      const propertySnap = await propertyRef.get();
      
      if (propertySnap.exists) {
        const propertyData = propertySnap.data() as Record<string, any>;
        propertyCoordinates = propertyData.coordinates;
      }
    }

    // Prepara oggetto pulizia per l'algoritmo
    // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
    const scheduledDate = cleaningData.scheduledDate?.toDate?.() || new Date();
    
    const cleaningForAssignment: CleaningForAssignment = {
      id,
      // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
      propertyId: cleaningData.propertyId,
      // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
      propertyName: cleaningData.propertyName || "Proprietà",
      // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
      propertyAddress: cleaningData.propertyAddress || "",
      // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
      propertyCity: cleaningData.propertyCity,
      // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
      propertyPostalCode: cleaningData.propertyPostalCode,
      coordinates: propertyCoordinates,
      scheduledDate,
      // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
      scheduledTime: cleaningData.scheduledTime,
      // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
      estimatedDuration: cleaningData.estimatedDuration,
    };

    // ─── CARICA OPERATORI ATTIVI ───
    const operatorsQuery = adminDb.collection("users").where("role", "==", "OPERATORE_PULIZIE").where("status", "==", "ACTIVE");

    const operatorsSnap = await operatorsQuery.get();
    
    const operators: OperatorForAssignment[] = operatorsSnap.docs.map((doc) => {
      const data = doc.data() as Record<string, any>;
      return {
        id: doc.id,
        name: data.name || data.displayName || "Operatore",
        email: data.email || "",
        phone: data.phone,
        status: data.status || "ACTIVE",
        rating: data.rating || 4.0, // Default 4.0
      };
    });

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
    // Esclude la pulizia corrente dal conteggio (se già assegnata)
    const todayAssignments = await loadTodayAssignmentsByOperator(scheduledDate, id);

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
    const averageWorkload = operatorsWithAssignments > 0
      ? Array.from(todayAssignments.values()).reduce((sum, arr) => sum + arr.length, 0) / operatorsWithAssignments
      : 0;

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
        // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
        currentOperatorId: cleaningData.operatorId || null,
        // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
        currentOperatorName: cleaningData.operatorName || null,
        // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
        status: cleaningData.status,
      },
      stats: {
        totalOperators,
        operatorsWithAssignments,
        averageWorkload: Math.round(averageWorkload * 10) / 10,
        date: scheduledDate.toISOString().split("T")[0],
      },
    });
  } catch (error) {
    console.error("❌ Errore GET suggestions:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
