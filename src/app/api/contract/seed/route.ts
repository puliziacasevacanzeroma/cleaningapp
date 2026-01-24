/**
 * API: GET/POST /api/contract/seed
 * 
 * GET: Verifica documenti esistenti
 * POST: Crea documento regolamentare di test
 * DELETE: Elimina tutti i documenti (per test)
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  collection, 
  addDoc, 
  Timestamp,
  query,
  where,
  getDocs,
  deleteDoc,
  doc
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { COLLECTIONS } from "~/lib/firebase/collections";

// Contenuto HTML del regolamento
const REGOLAMENTO_CONTENT = `
<h2>1. PREMESSA</h2>
<p>Il presente Regolamento Operativo disciplina i rapporti tra <strong>CleaningApp</strong> (di seguito "Azienda") e i collaboratori che svolgono attività di pulizia, consegna e gestione delle proprietà turistiche.</p>

<h2>2. OBBLIGHI DEL COLLABORATORE</h2>
<p>Il collaboratore si impegna a:</p>
<ul>
  <li>Svolgere le attività assegnate con diligenza e professionalità</li>
  <li>Rispettare gli orari e le scadenze concordate</li>
  <li>Mantenere la riservatezza sulle informazioni relative ai clienti e alle proprietà</li>
  <li>Utilizzare i prodotti e le attrezzature fornite in modo appropriato</li>
  <li>Segnalare tempestivamente eventuali problemi o danni riscontrati</li>
</ul>

<h2>3. MODALITÀ DI LAVORO</h2>
<p>Le attività vengono assegnate tramite l'applicazione CleaningApp. Il collaboratore deve:</p>
<ul>
  <li>Controllare regolarmente l'app per nuove assegnazioni</li>
  <li>Confermare la presa in carico delle attività entro 2 ore</li>
  <li>Segnalare l'inizio e la fine di ogni attività tramite l'app</li>
  <li>Documentare con foto lo stato delle proprietà</li>
</ul>

<h2>4. COMPENSI E PAGAMENTI</h2>
<p>I compensi sono stabiliti come segue:</p>
<ul>
  <li>Pulizia standard: secondo tariffario concordato</li>
  <li>Pulizia profonda: maggiorazione del 50%</li>
  <li>Consegne: tariffa fissa per consegna</li>
  <li>Pagamenti mensili entro il 10 del mese successivo</li>
</ul>

<h2>5. SICUREZZA E PRIVACY</h2>
<p>Il collaboratore si impegna a:</p>
<ul>
  <li>Rispettare le norme sulla sicurezza sul lavoro</li>
  <li>Non divulgare dati personali dei clienti</li>
  <li>Non effettuare copie delle chiavi delle proprietà</li>
</ul>

<h2>6. RESPONSABILITÀ</h2>
<p>Il collaboratore è responsabile per danni causati per negligenza, furto o mancato rispetto delle procedure.</p>

<h2>7. CESSAZIONE DEL RAPPORTO</h2>
<p>Il rapporto può cessare per recesso volontario (preavviso 15 giorni), decisione aziendale o mutuo consenso.</p>

<h2>8. DISPOSIZIONI FINALI</h2>
<p>Il regolamento entra in vigore dalla data di accettazione. Modifiche comunicate con 30 giorni di preavviso.</p>

<p><em>Ultimo aggiornamento: Gennaio 2026</em></p>
`;

async function generateHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function GET() {
  try {
    const docsQuery = query(
      collection(db, COLLECTIONS.REGULATION_DOCUMENTS)
    );
    
    const snapshot = await getDocs(docsQuery);
    
    const documents = snapshot.docs.map(doc => ({
      id: doc.id,
      type: doc.data().type,
      version: doc.data().version,
      title: doc.data().title,
      applicableTo: doc.data().applicableTo,
      isActive: doc.data().isActive,
    }));

    return NextResponse.json({ success: true, count: documents.length, documents });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Errore" }, { status: 500 });
  }
}

export async function POST() {
  try {
    // Prima elimina documenti esistenti per evitare duplicati
    const existingQuery = query(
      collection(db, COLLECTIONS.REGULATION_DOCUMENTS)
    );
    
    const existingDocs = await getDocs(existingQuery);
    
    // Elimina tutti i documenti esistenti
    for (const docSnapshot of existingDocs.docs) {
      await deleteDoc(doc(db, COLLECTIONS.REGULATION_DOCUMENTS, docSnapshot.id));
    }

    const contentHash = await generateHash(REGOLAMENTO_CONTENT);

    // Crea documento con TUTTI i ruoli incluso ADMIN e ALL
    const documentData = {
      type: "regolamento_operativo",
      version: "1.0",
      title: "Regolamento Operativo v1.0",
      content: REGOLAMENTO_CONTENT,
      hash: contentHash,
      applicableTo: ["ADMIN", "PROPRIETARIO", "OPERATORE_PULIZIE", "RIDER", "ALL"],
      effectiveFrom: Timestamp.now(),
      isActive: true,
      isDraft: false,
      createdAt: Timestamp.now(),
      createdBy: "SYSTEM",
      publishedAt: Timestamp.now(),
      publishedBy: "SYSTEM",
    };

    const docRef = await addDoc(collection(db, COLLECTIONS.REGULATION_DOCUMENTS), documentData);

    return NextResponse.json({
      success: true,
      message: "Documento creato per TUTTI i ruoli",
      documentId: docRef.id,
      applicableTo: documentData.applicableTo,
    });
  } catch (error) {
    console.error("Errore:", error);
    return NextResponse.json({ success: false, error: "Errore creazione" }, { status: 500 });
  }
}

// DELETE per pulire
export async function DELETE() {
  try {
    const docsQuery = query(collection(db, COLLECTIONS.REGULATION_DOCUMENTS));
    const snapshot = await getDocs(docsQuery);
    
    for (const docSnapshot of snapshot.docs) {
      await deleteDoc(doc(db, COLLECTIONS.REGULATION_DOCUMENTS, docSnapshot.id));
    }

    return NextResponse.json({ success: true, message: `Eliminati ${snapshot.docs.length} documenti` });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Errore" }, { status: 500 });
  }
}
