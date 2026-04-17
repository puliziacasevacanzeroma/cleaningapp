/**
 * export-service-configs.js
 *
 * Scarica TUTTE le serviceConfigs di TUTTE le proprietà in un unico file JSON.
 * Esporta anche l'inventario per poter risolvere gli ID degli item.
 *
 * USO:
 *   1. Posiziona questo file nella ROOT del progetto cleaningapp-main
 *   2. Assicurati di avere `serviceAccountKey.json` nella stessa cartella
 *      (Firebase Console → Impostazioni progetto → Account di servizio →
 *       Genera nuova chiave privata → rinomina in serviceAccountKey.json)
 *   3. Dal CMD esegui:
 *        node export-service-configs.js
 *
 * Genera un file: service-configs-export.json
 * Caricalo poi in chat per l'analisi.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ──────────────────────────────────────────────────────────────────
let serviceAccount;
try {
  serviceAccount = require('./serviceAccountKey.json');
} catch (e) {
  console.error('\n❌ ERRORE: file `serviceAccountKey.json` non trovato.');
  console.error('   Scaricalo da Firebase Console:');
  console.error('   Project Settings → Service Accounts → Generate new private key');
  console.error('   e salvalo nella stessa cartella di questo script.\n');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔍 Caricamento inventario...');
  const inventorySnap = await db.collection('inventory').get();
  const inventory = inventorySnap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || null,
      key: data.key || null,
      category: data.category || null,
      sellPrice: data.sellPrice ?? null,
    };
  });
  console.log(`   → ${inventory.length} item in inventario`);

  console.log('🔍 Caricamento proprietà...');
  const propsSnap = await db.collection('properties').get();
  console.log(`   → ${propsSnap.size} proprietà totali`);

  const properties = [];
  propsSnap.forEach(doc => {
    const data = doc.data();
    properties.push({
      id: doc.id,
      name: data.name || null,
      ownerId: data.ownerId || null,
      maxGuests: data.maxGuests ?? null,
      bedsConfig: data.bedsConfig || null,
      serviceConfigs: data.serviceConfigs || null,
      usesOwnLinen: data.usesOwnLinen ?? null,
    });
  });

  // Statistiche pre-export
  const withConfigs = properties.filter(p => p.serviceConfigs && Object.keys(p.serviceConfigs).length > 0);
  console.log(`   → ${withConfigs.length} proprietà con serviceConfigs configurate`);

  const exportData = {
    exportedAt: new Date().toISOString(),
    counts: {
      inventory: inventory.length,
      properties: properties.length,
      propertiesWithConfigs: withConfigs.length,
    },
    inventory,
    properties,
  };

  const outPath = path.join(process.cwd(), 'service-configs-export.json');
  fs.writeFileSync(outPath, JSON.stringify(exportData, null, 2), 'utf-8');

  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`\n✅ Export completato:`);
  console.log(`   File: ${outPath}`);
  console.log(`   Size: ${sizeKb} KB`);
  console.log(`\n   Carica questo file in chat per l'analisi.\n`);

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Errore:', err);
  process.exit(1);
});
