import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { 
  collection, 
  getDocs, 
  addDoc, 
  Timestamp 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { ITALIAN_HOLIDAYS } from "~/types/holiday";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// GET - Lista festività
// ═══════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("activeOnly") === "true";
    const year = searchParams.get("year");
    
    const snapshot = await getDocs(collection(db, "holidays"));
    
    let holidays = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        date: data.date?.toDate?.() || null,
      };
    });
    
    // Filtri
    if (activeOnly) {
      holidays = holidays.filter((h: any) => h.isActive);
    }
    
    if (year) {
      const yearInt = parseInt(year);
      holidays = holidays.filter((h: any) => {
        if (h.isRecurring) return true; // Le festività ricorrenti valgono sempre
        if (!h.date) return false;
        return h.date.getFullYear() === yearInt;
      });
    }
    
    // Ordina per data (mese/giorno)
    holidays.sort((a: any, b: any) => {
      const monthA = a.isRecurring ? a.recurringMonth : (a.date?.getMonth() + 1) || 0;
      const monthB = b.isRecurring ? b.recurringMonth : (b.date?.getMonth() + 1) || 0;
      const dayA = a.isRecurring ? a.recurringDay : a.date?.getDate() || 0;
      const dayB = b.isRecurring ? b.recurringDay : b.date?.getDate() || 0;
      
      if (monthA !== monthB) return monthA - monthB;
      return dayA - dayB;
    });
    
    return NextResponse.json({ holidays });
  } catch (error) {
    console.error("Errore GET holidays:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// POST - Crea festività (solo admin)
// ═══════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin può creare festività" }, { status: 403 });
    }
    
    const body = await req.json();
    const {
      name,
      date,
      type,
      isRecurring,
      recurringMonth,
      recurringDay,
      surchargeType,
      surchargePercentage,
      surchargeFixed,
      appliesToAllServices,
      applicableServiceTypes,
      notes,
    } = body;
    
    // Validazione
    if (!name) {
      return NextResponse.json({ error: "Nome festività obbligatorio" }, { status: 400 });
    }
    
    if (isRecurring && (!recurringMonth || !recurringDay)) {
      return NextResponse.json({ 
        error: "Per festività ricorrenti servono mese e giorno" 
      }, { status: 400 });
    }
    
    if (!isRecurring && !date) {
      return NextResponse.json({ 
        error: "Per festività non ricorrenti serve la data" 
      }, { status: 400 });
    }
    
    if (!surchargeType || (surchargeType === "percentage" && !surchargePercentage) || 
        (surchargeType === "fixed" && !surchargeFixed)) {
      return NextResponse.json({ 
        error: "Specificare tipo e valore maggiorazione" 
      }, { status: 400 });
    }
    
    const now = Timestamp.now();
    
    const holidayData: Record<string, unknown> = {
      name,
      type: type || "custom",
      isRecurring: isRecurring || false,
      surchargeType,
      appliesToAllServices: appliesToAllServices ?? true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
    };
    
    if (isRecurring) {
      holidayData.recurringMonth = parseInt(recurringMonth);
      holidayData.recurringDay = parseInt(recurringDay);
    } else {
      holidayData.date = Timestamp.fromDate(new Date(date));
    }
    
    if (surchargeType === "percentage") {
      holidayData.surchargePercentage = parseFloat(surchargePercentage);
    } else {
      holidayData.surchargeFixed = parseFloat(surchargeFixed);
    }
    
    if (!appliesToAllServices && applicableServiceTypes) {
      holidayData.applicableServiceTypes = applicableServiceTypes;
    }
    
    if (notes) {
      holidayData.notes = notes;
    }
    
    const docRef = await addDoc(collection(db, "holidays"), holidayData);
    
    console.log(`✅ Festività creata: ${docRef.id} (${name})`);
    
    return NextResponse.json({ 
      success: true,
      id: docRef.id,
      message: `Festività "${name}" creata`
    });
  } catch (error) {
    console.error("Errore POST holidays:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// PUT - Seed festività italiane (chiamare una volta)
// ═══════════════════════════════════════════════════════════════

export async function PUT(req: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    // Verifica se già popolato
    const existingSnapshot = await getDocs(collection(db, "holidays"));
    if (existingSnapshot.docs.length > 0) {
      return NextResponse.json({ 
        error: "Festività già presenti. Elimina prima quelle esistenti.",
        existing: existingSnapshot.docs.length
      }, { status: 400 });
    }
    
    const now = Timestamp.now();
    const currentYear = new Date().getFullYear();
    const created: string[] = [];
    
    for (const holiday of ITALIAN_HOLIDAYS) {
      // Per festività non ricorrenti (Pasqua/Pasquetta), creiamo per l'anno corrente
      // In futuro potremmo calcolare le date esatte
      const holidayData: Record<string, unknown> = {
        ...holiday,
        createdAt: now,
        updatedAt: now,
        createdBy: user.id,
      };
      
      // Se non ricorrente ma senza data, salta (Pasqua va gestita manualmente)
      if (!holiday.isRecurring) {
        // Imposta una data placeholder per l'anno corrente
        // Pasqua 2025 è il 20 aprile
        if (holiday.name === "Pasqua") {
          holidayData.date = Timestamp.fromDate(new Date(currentYear, 3, 20)); // Aprile
        } else if (holiday.name === "Pasquetta") {
          holidayData.date = Timestamp.fromDate(new Date(currentYear, 3, 21)); // Aprile
        }
      }
      
      await addDoc(collection(db, "holidays"), holidayData);
      created.push(holiday.name);
    }
    
    console.log(`✅ Seed completato: ${created.length} festività create`);
    
    return NextResponse.json({ 
      success: true,
      created: created.length,
      holidays: created,
      message: `${created.length} festività italiane create`,
      note: "Ricordati di aggiornare le date di Pasqua e Pasquetta ogni anno!"
    });
  } catch (error) {
    console.error("Errore PUT holidays (seed):", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
