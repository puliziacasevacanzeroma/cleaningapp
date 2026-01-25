import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  limit,
  Timestamp,
  doc,
  getDoc
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// TIPI
// ═══════════════════════════════════════════════════════════════

interface RatingScores {
  guestCleanliness: number;      // Pulizia lasciata dagli ospiti
  checkoutPunctuality: number;   // Puntualità checkout
  propertyCondition: number;     // Stato proprietà
  damages: number;               // Danni (5 = nessun danno)
  suppliesComplete: number;      // Dotazioni complete
  accessEase: number;            // Facilità accesso
}

interface Issue {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: string;
  photos: string[];
}

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// COSTANTI CATEGORIE
// ═══════════════════════════════════════════════════════════════

const CATEGORY_INFO: Record<keyof RatingScores, { label: string; icon: string; description: string }> = {
  guestCleanliness: { 
    label: 'Pulizia Ospiti Uscenti', 
    icon: '🧹',
    description: 'Come gli ospiti lasciano la casa al checkout'
  },
  checkoutPunctuality: { 
    label: 'Puntualità Checkout', 
    icon: '⏰',
    description: 'Rispetto dell\'orario di checkout'
  },
  propertyCondition: { 
    label: 'Stato Proprietà', 
    icon: '🏠',
    description: 'Condizioni generali e manutenzione'
  },
  damages: { 
    label: 'Danni Riscontrati', 
    icon: '⚠️',
    description: 'Presenza di danni o rotture (5 = nessun danno)'
  },
  suppliesComplete: { 
    label: 'Dotazioni Ospiti', 
    icon: '🛁',
    description: 'Biancheria, saponi, carta igienica presenti'
  },
  accessEase: { 
    label: 'Accesso Proprietà', 
    icon: '🔑',
    description: 'Facilità nel trovare chiavi e accedere'
  },
};

// ═══════════════════════════════════════════════════════════════
// FUNZIONE CALCOLO FASCIA E PRIORITÀ
// ═══════════════════════════════════════════════════════════════

function getScoreBand(score: number): { 
  priority: string; 
  label: string; 
  color: string;
  emoji: string;
} {
  if (score >= 4.75) return { priority: 'excellence', label: 'Eccellenza', color: 'emerald', emoji: '🌟' };
  if (score >= 4.50) return { priority: 'great', label: 'Ottimo', color: 'green', emoji: '⭐' };
  if (score >= 4.25) return { priority: 'very_good', label: 'Molto buono', color: 'teal', emoji: '👍' };
  if (score >= 4.00) return { priority: 'good', label: 'Buono', color: 'sky', emoji: '✅' };
  if (score >= 3.75) return { priority: 'fair', label: 'Discreto', color: 'blue', emoji: '📊' };
  if (score >= 3.50) return { priority: 'sufficient', label: 'Sufficiente', color: 'indigo', emoji: '📝' };
  if (score >= 3.25) return { priority: 'attention', label: 'Attenzione', color: 'amber', emoji: '⚡' };
  if (score >= 3.00) return { priority: 'improve', label: 'Da migliorare', color: 'orange', emoji: '⚠️' };
  if (score >= 2.50) return { priority: 'problematic', label: 'Problematico', color: 'red', emoji: '🔶' };
  return { priority: 'critical', label: 'Critico', color: 'rose', emoji: '🔴' };
}

// ═══════════════════════════════════════════════════════════════
// GENERAZIONE CONSIGLI INTELLIGENTI
// ═══════════════════════════════════════════════════════════════

function generateInsight(category: keyof RatingScores, score: number): {
  title: string;
  message: string;
  suggestions: string[];
} {
  const band = getScoreBand(score);
  const info = CATEGORY_INFO[category];
  
  // Database consigli per categoria e fascia
  const insights: Record<string, Record<string, { title: string; message: string; suggestions: string[] }>> = {
    // ─────────────────────────────────────────────────────────────
    // 🧹 PULIZIA OSPITI USCENTI
    // ─────────────────────────────────────────────────────────────
    guestCleanliness: {
      excellence: {
        title: "Ospiti impeccabili!",
        message: "I tuoi ospiti lasciano sempre la casa in condizioni eccellenti. La tua comunicazione funziona perfettamente!",
        suggestions: [
          "Continua con le tue ottime pratiche di comunicazione",
          "Le tue regole casa sono efficaci, mantienile",
          "Potresti premiare gli ospiti attenti con recensioni positive"
        ]
      },
      great: {
        title: "Ospiti molto rispettosi",
        message: "Gli ospiti generalmente rispettano molto la casa. Ottimo lavoro nella gestione!",
        suggestions: [
          "La tua comunicazione pre-checkout funziona bene",
          "Mantieni le regole casa attuali"
        ]
      },
      very_good: {
        title: "Buon rispetto delle regole",
        message: "Gli ospiti rispettano la casa con qualche piccola disattenzione occasionale.",
        suggestions: [
          "Aggiungi foto delle aree che richiedono più attenzione",
          "Invia un reminder amichevole il giorno prima del checkout"
        ]
      },
      good: {
        title: "Ospiti nella norma",
        message: "La maggior parte degli ospiti lascia la casa in condizioni accettabili.",
        suggestions: [
          "Rendi le regole casa più visibili nell'annuncio",
          "Aggiungi istruzioni specifiche per la cucina",
          "Considera un messaggio di promemoria checkout"
        ]
      },
      fair: {
        title: "Pulizia discreta",
        message: "Gli ospiti lasciano la casa in condizioni discrete, con margini di miglioramento.",
        suggestions: [
          "Crea una checklist checkout visiva con immagini",
          "Specifica cosa ti aspetti prima della partenza",
          "Invia istruzioni dettagliate pre-checkout"
        ]
      },
      sufficient: {
        title: "Margini di miglioramento",
        message: "Gli ospiti non sempre rispettano gli standard di pulizia attesi.",
        suggestions: [
          "Rivedi e rafforza le regole casa sull'annuncio",
          "Aggiungi sezione 'Prima di partire' ben visibile",
          "Considera un piccolo incentivo per chi lascia pulito",
          "Invia istruzioni dettagliate 24h prima del checkout"
        ]
      },
      attention: {
        title: "Richiede attenzione",
        message: "Frequenti problemi di pulizia lasciata dagli ospiti. Intervento consigliato.",
        suggestions: [
          "Valuta un deposito cauzionale",
          "Modifica le regole casa con liste dettagliate",
          "Accetta preferibilmente ospiti con recensioni positive",
          "Invia promemoria multipli prima del checkout"
        ]
      },
      improve: {
        title: "Problema ricorrente",
        message: "Gli ospiti frequentemente non rispettano gli standard minimi di pulizia.",
        suggestions: [
          "Implementa un deposito cauzionale",
          "Rivedi completamente le regole casa",
          "Filtra gli ospiti più accuratamente",
          "Considera un check-out assistito",
          "Valuta di aumentare il costo pulizie"
        ]
      },
      problematic: {
        title: "Situazione seria",
        message: "La maggior parte degli ospiti non rispetta gli standard. Servono cambiamenti.",
        suggestions: [
          "Aumenta il deposito cauzionale",
          "Accetta SOLO ospiti verificati con buone recensioni",
          "Implementa check-out assistito",
          "Rivedi la comunicazione pre-arrivo",
          "Considera di modificare il target ospiti"
        ]
      },
      critical: {
        title: "Intervento urgente necessario",
        message: "Situazione critica. Gli ospiti non rispettano minimamente la proprietà.",
        suggestions: [
          "Valuta una pausa per riorganizzare l'approccio",
          "Deposito cauzionale significativo obbligatorio",
          "Solo ospiti super verificati",
          "Check-out sempre assistito",
          "Rivedi completamente target e comunicazione"
        ]
      }
    },

    // ─────────────────────────────────────────────────────────────
    // ⏰ PUNTUALITÀ CHECKOUT
    // ─────────────────────────────────────────────────────────────
    checkoutPunctuality: {
      excellence: {
        title: "Puntualità perfetta!",
        message: "Gli ospiti rispettano sempre l'orario di checkout. Comunicazione impeccabile!",
        suggestions: [
          "Il tuo sistema di comunicazione è perfetto",
          "Potresti offrire late checkout a pagamento come servizio extra"
        ]
      },
      great: {
        title: "Ottima puntualità",
        message: "Gli ospiti sono quasi sempre puntuali. Ottima gestione!",
        suggestions: [
          "Continua con i reminder attuali",
          "Sistema ben rodato"
        ]
      },
      very_good: {
        title: "Buona puntualità",
        message: "Raramente ci sono ritardi, e quando accadono sono minimi.",
        suggestions: [
          "Considera un buffer di 30 minuti tra checkout e pulizia"
        ]
      },
      good: {
        title: "Puntualità accettabile",
        message: "Occasionalmente qualche ritardo, ma gestibile.",
        suggestions: [
          "Invia reminder la mattina del checkout",
          "Comunica l'orario con più anticipo"
        ]
      },
      fair: {
        title: "Ritardi occasionali",
        message: "Alcuni ospiti non rispettano l'orario. Margini di miglioramento.",
        suggestions: [
          "Anticipa l'orario comunicato di 30 minuti",
          "Invia reminder 2 ore prima del checkout",
          "Spiega l'importanza della puntualità"
        ]
      },
      sufficient: {
        title: "Ritardi frequenti",
        message: "Spesso gli ospiti non rispettano l'orario concordato.",
        suggestions: [
          "Comunica conseguenze del ritardo",
          "Invia reminder multipli (sera prima + mattina)",
          "Anticipa orario comunicato di 1 ora",
          "Valuta late checkout fee"
        ]
      },
      attention: {
        title: "Problema puntualità",
        message: "I ritardi sono frequenti e creano disagi.",
        suggestions: [
          "Implementa penale per ritardo checkout",
          "Invia reminder automatici multipli",
          "Anticipa orario comunicato significativamente",
          "Contatta ospiti la sera prima per conferma"
        ]
      },
      improve: {
        title: "Ritardi sistematici",
        message: "Gli ospiti regolarmente non rispettano l'orario di checkout.",
        suggestions: [
          "Penale obbligatoria per ritardo",
          "Orario checkout anticipato nell'annuncio",
          "Check-out assistito nei casi critici",
          "Comunicazione più assertiva"
        ]
      },
      problematic: {
        title: "Situazione critica",
        message: "La maggior parte degli ospiti non rispetta l'orario.",
        suggestions: [
          "Rivedi completamente la policy checkout",
          "Penale significativa comunicata chiaramente",
          "Considera check-out sempre assistito",
          "Valuta se l'orario è realistico"
        ]
      },
      critical: {
        title: "Intervento necessario",
        message: "Problema grave con la puntualità. Impatta seriamente le operazioni.",
        suggestions: [
          "Cambia radicalmente l'approccio al checkout",
          "Orario checkout molto anticipato",
          "Check-out assistito obbligatorio",
          "Valuta se il target ospiti è adeguato"
        ]
      }
    },

    // ─────────────────────────────────────────────────────────────
    // 🏠 STATO PROPRIETÀ
    // ─────────────────────────────────────────────────────────────
    propertyCondition: {
      excellence: {
        title: "Proprietà in condizioni eccellenti!",
        message: "La casa è sempre in ottime condizioni. Ottima manutenzione!",
        suggestions: [
          "Continua con la manutenzione preventiva attuale",
          "La tua attenzione ai dettagli paga"
        ]
      },
      great: {
        title: "Ottime condizioni",
        message: "La proprietà è ben mantenuta e funzionale.",
        suggestions: [
          "Mantieni il programma di manutenzione attuale"
        ]
      },
      very_good: {
        title: "Buone condizioni",
        message: "La casa è in buone condizioni con piccoli dettagli da curare.",
        suggestions: [
          "Programma controlli periodici",
          "Crea lista piccole riparazioni da fare"
        ]
      },
      good: {
        title: "Condizioni accettabili",
        message: "La proprietà è funzionale con alcuni aspetti migliorabili.",
        suggestions: [
          "Fai un check completo della proprietà",
          "Prioritizza le riparazioni più visibili",
          "Considera piccoli aggiornamenti"
        ]
      },
      fair: {
        title: "Necessaria manutenzione",
        message: "Alcuni aspetti della proprietà richiedono attenzione.",
        suggestions: [
          "Programma interventi di manutenzione",
          "Controlla impianti e elettrodomestici",
          "Aggiorna elementi usurati"
        ]
      },
      sufficient: {
        title: "Manutenzione da migliorare",
        message: "La proprietà mostra segni di usura che andrebbero affrontati.",
        suggestions: [
          "Fai un audit completo della proprietà",
          "Programma riparazioni prioritarie",
          "Valuta rinnovo elementi datati",
          "Controlla impianti idraulici ed elettrici"
        ]
      },
      attention: {
        title: "Attenzione necessaria",
        message: "Diversi aspetti della proprietà richiedono intervento.",
        suggestions: [
          "Interventi di manutenzione urgenti",
          "Controlla sicurezza impianti",
          "Sostituisci elementi non funzionanti",
          "Valuta ristrutturazione parziale"
        ]
      },
      improve: {
        title: "Interventi necessari",
        message: "La proprietà ha bisogno di significativi interventi di manutenzione.",
        suggestions: [
          "Programma interventi strutturati",
          "Priorità assoluta alla sicurezza",
          "Valuta budget per ristrutturazione",
          "Considera pausa prenotazioni per lavori"
        ]
      },
      problematic: {
        title: "Situazione seria",
        message: "La proprietà presenta problemi significativi che impattano l'esperienza.",
        suggestions: [
          "Interventi urgenti necessari",
          "Valuta seriamente ristrutturazione",
          "Pausa prenotazioni consigliata",
          "Consulta professionisti per valutazione"
        ]
      },
      critical: {
        title: "Intervento urgente",
        message: "Condizioni critiche. La proprietà necessita interventi immediati.",
        suggestions: [
          "Sospendi le prenotazioni",
          "Interventi immediati per sicurezza",
          "Valutazione professionale urgente",
          "Piano di ristrutturazione completo"
        ]
      }
    },

    // ─────────────────────────────────────────────────────────────
    // ⚠️ DANNI RISCONTRATI
    // ─────────────────────────────────────────────────────────────
    damages: {
      excellence: {
        title: "Nessun danno mai riscontrato!",
        message: "Gli ospiti rispettano perfettamente la proprietà. Complimenti!",
        suggestions: [
          "I tuoi ospiti sono selezionati bene",
          "Le regole casa funzionano"
        ]
      },
      great: {
        title: "Danni molto rari",
        message: "Praticamente mai danni. Ottima gestione!",
        suggestions: [
          "Continua con la selezione attuale degli ospiti"
        ]
      },
      very_good: {
        title: "Danni occasionali minimi",
        message: "Raramente piccoli danni, sempre di lieve entità.",
        suggestions: [
          "Sistema che funziona, mantienilo"
        ]
      },
      good: {
        title: "Qualche danno occasionale",
        message: "Occasionalmente si verificano piccoli danni.",
        suggestions: [
          "Assicurati di avere un deposito cauzionale adeguato",
          "Documenta lo stato pre-arrivo con foto"
        ]
      },
      fair: {
        title: "Danni periodici",
        message: "Si verificano danni con una certa regolarità.",
        suggestions: [
          "Aumenta il deposito cauzionale",
          "Foto obbligatorie pre e post soggiorno",
          "Regole casa più chiare sui danni"
        ]
      },
      sufficient: {
        title: "Danni frequenti",
        message: "I danni si verificano spesso e richiedono attenzione.",
        suggestions: [
          "Deposito cauzionale significativo",
          "Documentazione fotografica sistematica",
          "Valuta assicurazione danni",
          "Comunica chiaramente policy danni"
        ]
      },
      attention: {
        title: "Problema danni",
        message: "I danni sono troppo frequenti. Servono misure.",
        suggestions: [
          "Aumenta significativamente il deposito",
          "Seleziona ospiti più accuratamente",
          "Foto dettagliate obbligatorie",
          "Valuta clausole contrattuali più rigide"
        ]
      },
      improve: {
        title: "Danni sistematici",
        message: "I danni sono un problema ricorrente e significativo.",
        suggestions: [
          "Deposito cauzionale alto obbligatorio",
          "Solo ospiti con ottime recensioni",
          "Documentazione completa pre/post",
          "Assicurazione danni consigliata",
          "Rivedi target ospiti"
        ]
      },
      problematic: {
        title: "Situazione critica danni",
        message: "I danni sono frequenti e di entità significativa.",
        suggestions: [
          "Deposito molto alto",
          "Selezione ospiti molto rigorosa",
          "Assicurazione obbligatoria",
          "Valuta cambio strategia affitto"
        ]
      },
      critical: {
        title: "Danni gravi frequenti",
        message: "Situazione insostenibile. Danni gravi e frequenti.",
        suggestions: [
          "Pausa prenotazioni per valutare",
          "Rivedi completamente l'approccio",
          "Assicurazione completa",
          "Valuta target ospiti completamente diverso"
        ]
      }
    },

    // ─────────────────────────────────────────────────────────────
    // 🛁 DOTAZIONI OSPITI
    // ─────────────────────────────────────────────────────────────
    suppliesComplete: {
      excellence: {
        title: "Dotazioni sempre complete!",
        message: "Tutto è sempre presente e in ordine. Gestione impeccabile!",
        suggestions: [
          "Il tuo sistema di inventario funziona perfettamente",
          "Continua così"
        ]
      },
      great: {
        title: "Dotazioni quasi sempre complete",
        message: "Raramente manca qualcosa. Ottima organizzazione!",
        suggestions: [
          "Sistema efficace, mantienilo"
        ]
      },
      very_good: {
        title: "Buona gestione dotazioni",
        message: "Occasionalmente qualcosa da integrare, ma raro.",
        suggestions: [
          "Considera scorte di backup",
          "Checklist pre-arrivo"
        ]
      },
      good: {
        title: "Dotazioni generalmente complete",
        message: "A volte mancano piccole cose.",
        suggestions: [
          "Crea checklist rifornimento",
          "Aumenta leggermente le scorte minime"
        ]
      },
      fair: {
        title: "Dotazioni da migliorare",
        message: "Spesso mancano alcuni articoli.",
        suggestions: [
          "Implementa checklist sistematica",
          "Aumenta scorte minime del 20%",
          "Verifica inventario dopo ogni checkout"
        ]
      },
      sufficient: {
        title: "Carenze frequenti",
        message: "Frequentemente mancano dotazioni.",
        suggestions: [
          "Rivedi completamente la gestione scorte",
          "Checklist obbligatoria post-pulizia",
          "Aumenta significativamente le scorte",
          "Sistema di alert scorte basse"
        ]
      },
      attention: {
        title: "Problema dotazioni",
        message: "Le carenze sono frequenti e impattano l'esperienza.",
        suggestions: [
          "Riorganizza completamente l'inventario",
          "Scorte doppie rispetto al minimo",
          "Verifica sistematica ogni pulizia",
          "Considera servizio rifornimento automatico"
        ]
      },
      improve: {
        title: "Dotazioni insufficienti",
        message: "Spesso mancano articoli essenziali.",
        suggestions: [
          "Investimento in scorte maggiori",
          "Sistema di controllo rigoroso",
          "Backup sempre disponibile",
          "Valuta servizio gestione inventario"
        ]
      },
      problematic: {
        title: "Carenze gravi",
        message: "Mancano frequentemente articoli essenziali.",
        suggestions: [
          "Ristruttura completamente la gestione",
          "Scorte abbondanti obbligatorie",
          "Controllo ogni singola pulizia",
          "Fornitore di backup"
        ]
      },
      critical: {
        title: "Situazione critica",
        message: "Le dotazioni mancanti sono un problema grave.",
        suggestions: [
          "Intervento immediato sulla gestione",
          "Acquisto scorte significative",
          "Sistema di controllo urgente",
          "Valuta outsourcing gestione"
        ]
      }
    },

    // ─────────────────────────────────────────────────────────────
    // 🔑 ACCESSO PROPRIETÀ
    // ─────────────────────────────────────────────────────────────
    accessEase: {
      excellence: {
        title: "Accesso perfetto!",
        message: "Chiavi, codici e istruzioni sempre impeccabili. Complimenti!",
        suggestions: [
          "Le tue istruzioni di accesso sono perfette",
          "Sistema ben organizzato"
        ]
      },
      great: {
        title: "Accesso molto facile",
        message: "L'accesso è quasi sempre semplice e senza problemi.",
        suggestions: [
          "Mantieni le istruzioni aggiornate"
        ]
      },
      very_good: {
        title: "Buon sistema di accesso",
        message: "Raramente ci sono difficoltà nell'accesso.",
        suggestions: [
          "Aggiungi foto della porta se non presenti"
        ]
      },
      good: {
        title: "Accesso generalmente facile",
        message: "Occasionalmente qualche piccola difficoltà.",
        suggestions: [
          "Verifica che le istruzioni siano chiare",
          "Aggiungi foto punti di riferimento",
          "Aggiorna codici se vecchi"
        ]
      },
      fair: {
        title: "Accesso migliorabile",
        message: "A volte ci sono difficoltà nell'accesso.",
        suggestions: [
          "Riscrivi istruzioni più dettagliate",
          "Aggiungi foto passo-passo",
          "Verifica funzionamento serrature",
          "Considera serratura smart"
        ]
      },
      sufficient: {
        title: "Difficoltà frequenti",
        message: "Spesso ci sono problemi di accesso.",
        suggestions: [
          "Rivedi completamente le istruzioni",
          "Video tutorial accesso",
          "Foto dettagliate ogni passaggio",
          "Manutenzione serrature/chiavi",
          "Valuta keybox o serratura smart"
        ]
      },
      attention: {
        title: "Problemi di accesso",
        message: "L'accesso è frequentemente problematico.",
        suggestions: [
          "Aggiorna urgentemente le istruzioni",
          "Installa sistema accesso moderno",
          "Foto e video dettagliati",
          "Numero emergenza sempre disponibile"
        ]
      },
      improve: {
        title: "Accesso difficoltoso",
        message: "Frequenti difficoltà nell'accedere alla proprietà.",
        suggestions: [
          "Cambia sistema di accesso",
          "Serratura smart consigliata",
          "Istruzioni completamente nuove",
          "Supporto telefonico garantito"
        ]
      },
      problematic: {
        title: "Problema grave accesso",
        message: "L'accesso è un problema serio e ricorrente.",
        suggestions: [
          "Intervento urgente sul sistema accesso",
          "Serratura smart obbligatoria",
          "Assistenza sempre disponibile",
          "Rivedi completamente il processo"
        ]
      },
      critical: {
        title: "Accesso critico",
        message: "Situazione critica. L'accesso è costantemente problematico.",
        suggestions: [
          "Sospendi prenotazioni fino a risoluzione",
          "Installa sistema accesso affidabile",
          "Assistenza 24/7",
          "Soluzione definitiva necessaria"
        ]
      }
    }
  };

  const band = getScoreBand(score);
  const categoryInsights = insights[category];
  
  if (categoryInsights && categoryInsights[band.priority]) {
    return categoryInsights[band.priority];
  }

  // Fallback generico
  return {
    title: `${info.label}: ${band.label}`,
    message: `Punteggio ${score.toFixed(2)} su 5`,
    suggestions: ["Monitora questo aspetto"]
  };
}

// ═══════════════════════════════════════════════════════════════
// GET - Ottieni rating e insights per una proprietà
// ═══════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId");
    const cleaningId = searchParams.get("cleaningId");
    const months = parseInt(searchParams.get("months") || "3");

    if (!propertyId && !cleaningId) {
      return NextResponse.json({ error: "propertyId o cleaningId richiesto" }, { status: 400 });
    }

    // ─── CASO 1: Rating singola pulizia ───
    if (cleaningId) {
      const q = query(
        collection(db, "propertyRatings"),
        where("cleaningId", "==", cleaningId)
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        return NextResponse.json({ rating: null });
      }

      const doc = snapshot.docs[0];
      return NextResponse.json({ 
        rating: {
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
        }
      });
    }

    // ─── CASO 2: Tutti i rating di una proprietà + insights ───
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const q = query(
      collection(db, "propertyRatings"),
      where("propertyId", "==", propertyId),
      limit(100)
    );

    const snapshot = await getDocs(q);
    const allRatings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || null,
    })).sort((a, b) => {
      // Ordina manualmente per createdAt desc
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    // Filtra per periodo
    const ratings = allRatings.filter(r => 
      r.createdAt && r.createdAt >= startDate
    );

    if (ratings.length === 0) {
      return NextResponse.json({ 
        ratings: [],
        summary: null,
        insights: [],
        trend: null
      });
    }

    // ─── CALCOLA MEDIE PER CATEGORIA ───
    const categoryAverages: Record<string, { total: number; count: number; avg: number }> = {};
    
    for (const category of Object.keys(CATEGORY_INFO)) {
      categoryAverages[category] = { total: 0, count: 0, avg: 0 };
    }

    for (const rating of ratings) {
      const scores = rating.scores as RatingScores;
      for (const [key, value] of Object.entries(scores)) {
        if (value > 0) {
          categoryAverages[key].total += value;
          categoryAverages[key].count += 1;
        }
      }
    }

    for (const key of Object.keys(categoryAverages)) {
      const cat = categoryAverages[key];
      cat.avg = cat.count > 0 ? cat.total / cat.count : 0;
    }

    // ─── CALCOLA MEDIA GENERALE ───
    const validAverages = Object.values(categoryAverages).filter(c => c.count > 0);
    const overallAverage = validAverages.length > 0
      ? validAverages.reduce((a, b) => a + b.avg, 0) / validAverages.length
      : 0;

    // ─── GENERA INSIGHTS PER OGNI CATEGORIA ───
    const insights = [];
    
    for (const [category, data] of Object.entries(categoryAverages)) {
      if (data.count >= 1) { // Almeno 1 valutazione
        const band = getScoreBand(data.avg);
        const insight = generateInsight(category as keyof RatingScores, data.avg);
        const info = CATEGORY_INFO[category as keyof RatingScores];

        insights.push({
          category,
          categoryLabel: info.label,
          categoryIcon: info.icon,
          score: Math.round(data.avg * 100) / 100,
          basedOnRatings: data.count,
          priority: band.priority,
          priorityLabel: band.label,
          priorityColor: band.color,
          priorityEmoji: band.emoji,
          ...insight
        });
      }
    }

    // Ordina per priorità (peggiori prima)
    const priorityOrder = ['critical', 'problematic', 'improve', 'attention', 'sufficient', 'fair', 'good', 'very_good', 'great', 'excellence'];
    insights.sort((a, b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority));

    // ─── CALCOLA TREND MENSILE ───
    const monthlyData: Record<string, { total: number; count: number }> = {};
    
    for (const rating of allRatings) {
      if (!rating.createdAt) continue;
      const monthKey = `${rating.createdAt.getFullYear()}-${String(rating.createdAt.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { total: 0, count: 0 };
      }
      
      const scores = rating.scores as RatingScores;
      const avgScore = Object.values(scores).filter(v => v > 0);
      if (avgScore.length > 0) {
        monthlyData[monthKey].total += avgScore.reduce((a, b) => a + b, 0) / avgScore.length;
        monthlyData[monthKey].count += 1;
      }
    }

    const trendData = Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        average: data.count > 0 ? Math.round((data.total / data.count) * 100) / 100 : 0,
        count: data.count
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-months);

    // Calcola trend
    let trendDirection: 'improving' | 'stable' | 'declining' = 'stable';
    if (trendData.length >= 2) {
      const recent = trendData[trendData.length - 1].average;
      const previous = trendData[trendData.length - 2].average;
      if (recent > previous + 0.2) trendDirection = 'improving';
      else if (recent < previous - 0.2) trendDirection = 'declining';
    }

    // ─── SUMMARY ───
    const overallBand = getScoreBand(overallAverage);
    const summary = {
      overallAverage: Math.round(overallAverage * 100) / 100,
      totalRatings: ratings.length,
      priority: overallBand.priority,
      priorityLabel: overallBand.label,
      priorityColor: overallBand.color,
      priorityEmoji: overallBand.emoji,
      categoryAverages: Object.fromEntries(
        Object.entries(categoryAverages).map(([k, v]) => [k, {
          average: Math.round(v.avg * 100) / 100,
          count: v.count,
          ...getScoreBand(v.avg),
          ...CATEGORY_INFO[k as keyof RatingScores]
        }])
      )
    };

    return NextResponse.json({
      ratings: ratings.slice(0, 20).map(r => ({
        ...r,
        createdAt: r.createdAt?.toISOString() || null
      })),
      summary,
      insights,
      trend: {
        direction: trendDirection,
        data: trendData
      }
    });

  } catch (error) {
    console.error("Errore GET propertyRatings:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// POST - Salva nuovo rating
// ═══════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await req.json();
    const { 
      cleaningId, 
      propertyId, 
      propertyName,
      scores, 
      notes,
      issues 
    } = body;

    // Validazione
    if (!cleaningId || !propertyId || !scores) {
      return NextResponse.json({ 
        error: "cleaningId, propertyId e scores sono obbligatori" 
      }, { status: 400 });
    }

    // Verifica che tutte le categorie siano valutate
    const requiredCategories = ['guestCleanliness', 'checkoutPunctuality', 'propertyCondition', 'damages', 'suppliesComplete', 'accessEase'];
    for (const cat of requiredCategories) {
      if (!scores[cat] || scores[cat] < 1 || scores[cat] > 5) {
        return NextResponse.json({ 
          error: `Categoria ${cat} non valida (deve essere 1-5)` 
        }, { status: 400 });
      }
    }

    const now = Timestamp.now();

    // Calcola media
    const avgScore = Object.values(scores as Record<string, number>).reduce((a, b) => a + b, 0) / 6;

    // ─── SALVA RATING ───
    const ratingRef = await addDoc(collection(db, "propertyRatings"), {
      cleaningId,
      propertyId,
      propertyName: propertyName || "",
      scores,
      averageScore: Math.round(avgScore * 100) / 100,
      notes: notes || "",
      operatorId: user.id,
      operatorName: user.name || user.email || "Operatore",
      createdAt: now,
    });

    // ─── SALVA ISSUES SE PRESENTI ───
    const savedIssues: string[] = [];
    if (issues && Array.isArray(issues) && issues.length > 0) {
      for (const issue of issues) {
        const issueRef = await addDoc(collection(db, "cleaningIssues"), {
          cleaningId,
          propertyId,
          propertyName: propertyName || "",
          type: issue.type,
          title: issue.title,
          description: issue.description,
          severity: issue.severity,
          photos: issue.photos || [],
          status: 'open',
          reportedBy: user.id,
          reportedByName: user.name || user.email || "Operatore",
          reportedAt: now,
        });
        savedIssues.push(issueRef.id);
      }
    }

    // ─── AGGIORNA CLEANING CON RIFERIMENTO RATING ───
    try {
      const cleaningRef = doc(db, "cleanings", cleaningId);
      const { updateDoc } = await import("firebase/firestore");
      await updateDoc(cleaningRef, {
        ratingId: ratingRef.id,
        ratingScore: Math.round(avgScore * 100) / 100,
        issueIds: savedIssues,
        updatedAt: now,
      });
    } catch (e) {
      console.error("Errore aggiornamento cleaning:", e);
    }

    console.log(`⭐ Rating salvato: ${ratingRef.id} - Media: ${avgScore.toFixed(2)} - Issues: ${savedIssues.length}`);

    return NextResponse.json({
      success: true,
      ratingId: ratingRef.id,
      averageScore: Math.round(avgScore * 100) / 100,
      issueIds: savedIssues,
    });

  } catch (error) {
    console.error("Errore POST propertyRatings:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
