"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { calculateDotazioni } from "~/lib/calculateDotazioni";
import { useAuth } from "~/lib/firebase/AuthContext";

// Interfacce minime per il debug
interface InventoryItem {
  id: string;
  name: string;
  sellPrice: number;
  category: string;
}

interface Property {
  id: string;
  name: string;
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
  cleaningPrice?: number;
  bedsConfig?: any[];
  serviceConfigs?: Record<string, any>;
}

interface Cleaning {
  id: string;
  propertyId: string;
  propertyName?: string;
  guestsCount?: number;
  guestsConfirmed?: boolean;
  date?: any;
  status: string;
  price?: number;
  contractPrice?: number;
  customLinenConfig?: any;
  linenConfigModified?: boolean;
  hasLinenOrder?: boolean;
}

export default function DebugLinenPage() {
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCleaningId, setSelectedCleaningId] = useState<string | null>(null);

  // Carica dati da Firestore
  useEffect(() => {
    if (!user?.id) return;

    const unsubs: (() => void)[] = [];

    // Properties
    unsubs.push(
      onSnapshot(collection(db, "properties"), (snap) => {
        const data = snap.docs.map(doc => {
          const d = doc.data() as Record<string, any>;
          return {
            id: doc.id,
            name: d.name || "Senza nome",
            bedrooms: d.bedrooms,
            bathrooms: d.bathrooms,
            maxGuests: d.maxGuests,
            cleaningPrice: d.cleaningPrice,
            bedsConfig: d.bedsConfig,
            serviceConfigs: d.serviceConfigs,
          } as Property;
        });
        setProperties(data);
      })
    );

    // Cleanings
    unsubs.push(
      onSnapshot(collection(db, "cleanings"), (snap) => {
        const data = snap.docs.map(doc => {
          const d = doc.data() as Record<string, any>;
          return {
            id: doc.id,
            propertyId: d.propertyId,
            propertyName: d.propertyName,
            guestsCount: d.guestsCount,
            guestsConfirmed: d.guestsConfirmed,
            date: d.date,
            status: d.status,
            price: d.price,
            contractPrice: d.contractPrice,
            customLinenConfig: d.customLinenConfig,
            linenConfigModified: d.linenConfigModified,
            hasLinenOrder: d.hasLinenOrder,
          } as Cleaning;
        });
        // Ordina per data decrescente e prendi solo le più recenti
        data.sort((a, b) => {
          const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
          const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
          return dateB.getTime() - dateA.getTime();
        });
        setCleanings(data.slice(0, 20)); // Ultime 20
      })
    );

    // Inventory
    unsubs.push(
      onSnapshot(collection(db, "inventory"), (snap) => {
        const data = snap.docs.map(doc => {
          const d = doc.data() as Record<string, any>;
          return {
            id: doc.id,
            name: d.name || "",
            sellPrice: d.sellPrice || 0,
            category: d.category || "",
          } as InventoryItem;
        });
        setInventory(data);
        setLoading(false);
      })
    );

    return () => unsubs.forEach(u => u());
  }, [user?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-green-400 p-8 font-mono">
        <h1 className="text-2xl mb-4">🔍 DEBUG BIANCHERIA - Caricamento...</h1>
      </div>
    );
  }

  // Seleziona cleaning da analizzare
  const selectedCleaning = selectedCleaningId 
    ? cleanings.find(c => c.id === selectedCleaningId) 
    : cleanings[0];

  const selectedProperty = selectedCleaning 
    ? properties.find(p => p.id === selectedCleaning.propertyId)
    : null;

  // Esegui calculateDotazioni
  let result: any = null;
  let error: string | null = null;
  
  if (selectedCleaning && selectedProperty) {
    try {
      result = calculateDotazioni(
        selectedCleaning,
        selectedProperty,
        // @ts-expect-error TODO-FIX: TS2345 Argument of type 'InventoryItem[]' is not assignable to parameter of type 'impor...
        inventory
      );
    } catch (e: any) {
      error = e.message;
    }
  }

  // Analisi serviceConfigs
  const serviceConfigsAnalysis = selectedProperty?.serviceConfigs 
    ? Object.entries(selectedProperty.serviceConfigs).map(([key, config]: [string, any]) => ({
        key,
        beds: config.beds || [],
        bl: config.bl || {},
        ba: config.ba || {},
        ki: config.ki || {},
        ex: config.ex || {},
      }))
    : [];

  // Config usata per questo numero di ospiti
  const guestsCount = selectedCleaning?.guestsCount || 2;
  const configForGuests = selectedProperty?.serviceConfigs
    ? (selectedProperty.serviceConfigs[guestsCount] || selectedProperty.serviceConfigs[String(guestsCount)])
    : null;

  return (
    <div className="min-h-screen bg-gray-900 text-green-400 p-4 font-mono text-xs overflow-auto">
      <h1 className="text-xl mb-2 text-yellow-400">🔍 DEBUG BIANCHERIA - calculateDotazioni</h1>
      <p className="text-gray-500 mb-4">Questa pagina mostra esattamente i dati INPUT e OUTPUT di calculateDotazioni</p>
      
      {/* SELETTORE PULIZIA */}
      <div className="mb-6 bg-gray-800 p-3 rounded-lg">
        <h2 className="text-yellow-300 mb-2">📋 Seleziona Pulizia</h2>
        <select 
          value={selectedCleaningId || cleanings[0]?.id || ''} 
          onChange={e => setSelectedCleaningId(e.target.value)}
          className="w-full bg-gray-700 text-green-400 p-2 rounded border border-gray-600"
        >
          {cleanings.map(c => {
            const prop = properties.find(p => p.id === c.propertyId);
            const dateStr = c.date?.toDate ? c.date.toDate().toLocaleDateString('it-IT') : 'N/A';
            return (
              <option key={c.id} value={c.id}>
                {prop?.name || c.propertyName || 'Sconosciuta'} — {dateStr} — {c.guestsCount || '?'} ospiti — {c.status}
              </option>
            );
          })}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* ========== COLONNA SINISTRA: INPUT ========== */}
        <div className="space-y-4">
          
          {/* CLEANING INPUT */}
          <div className="bg-gray-800 p-3 rounded-lg border border-gray-700">
            <h2 className="text-cyan-400 mb-2 text-sm font-bold">📦 INPUT: Cleaning Object</h2>
            {selectedCleaning ? (
              <div className="space-y-1">
                <div><span className="text-gray-500">id:</span> {selectedCleaning.id}</div>
                <div><span className="text-gray-500">propertyId:</span> {selectedCleaning.propertyId}</div>
                <div>
                  <span className="text-gray-500">guestsCount:</span>{' '}
                  <span className={selectedCleaning.guestsCount ? 'text-green-400' : 'text-red-400 font-bold'}>
                    {selectedCleaning.guestsCount ?? 'undefined (default: 2)'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">guestsConfirmed:</span>{' '}
                  <span className={selectedCleaning.guestsConfirmed ? 'text-green-400' : 'text-yellow-400'}>
                    {String(selectedCleaning.guestsConfirmed ?? 'undefined')}
                  </span>
                </div>
                <div><span className="text-gray-500">price:</span> {selectedCleaning.price ?? 'undefined'}</div>
                <div><span className="text-gray-500">contractPrice:</span> {selectedCleaning.contractPrice ?? 'undefined'}</div>
                <div>
                  <span className="text-gray-500">hasLinenOrder:</span>{' '}
                  <span className={
                    selectedCleaning.hasLinenOrder === false ? 'text-red-400 font-bold' : 
                    selectedCleaning.hasLinenOrder === true ? 'text-green-400' : 'text-yellow-400'
                  }>
                    {String(selectedCleaning.hasLinenOrder ?? 'undefined')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">linenConfigModified:</span>{' '}
                  <span className={selectedCleaning.linenConfigModified ? 'text-orange-400 font-bold' : 'text-gray-400'}>
                    {String(selectedCleaning.linenConfigModified ?? 'undefined')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">customLinenConfig:</span>{' '}
                  <span className={selectedCleaning.customLinenConfig ? 'text-orange-400' : 'text-gray-400'}>
                    {selectedCleaning.customLinenConfig ? 'PRESENTE ▼' : 'null/undefined'}
                  </span>
                </div>
                {selectedCleaning.customLinenConfig && (
                  <pre className="mt-1 p-2 bg-gray-900 rounded text-[10px] overflow-auto max-h-40 text-orange-300">
                    {JSON.stringify(selectedCleaning.customLinenConfig, null, 2)}
                  </pre>
                )}
                <div><span className="text-gray-500">status:</span> {selectedCleaning.status}</div>
              </div>
            ) : (
              <div className="text-red-400">Nessuna pulizia selezionata</div>
            )}
          </div>

          {/* PROPERTY INPUT */}
          <div className="bg-gray-800 p-3 rounded-lg border border-gray-700">
            <h2 className="text-cyan-400 mb-2 text-sm font-bold">🏠 INPUT: Property Object</h2>
            {selectedProperty ? (
              <div className="space-y-1">
                <div><span className="text-gray-500">id:</span> {selectedProperty.id}</div>
                <div><span className="text-gray-500">name:</span> {selectedProperty.name}</div>
                <div><span className="text-gray-500">bedrooms:</span> {selectedProperty.bedrooms ?? 'undefined'}</div>
                <div><span className="text-gray-500">bathrooms:</span> {selectedProperty.bathrooms ?? 'undefined'}</div>
                <div><span className="text-gray-500">maxGuests:</span> {selectedProperty.maxGuests ?? 'undefined'}</div>
                <div><span className="text-gray-500">cleaningPrice:</span> €{selectedProperty.cleaningPrice ?? 'undefined'}</div>
                <div>
                  <span className="text-gray-500">bedsConfig:</span>{' '}
                  {selectedProperty.bedsConfig ? `${(Array.isArray(selectedProperty.bedsConfig) ? selectedProperty.bedsConfig : []).length} letti` : 'null'}
                </div>
                {selectedProperty.bedsConfig && (
                  <pre className="mt-1 p-2 bg-gray-900 rounded text-[10px] overflow-auto max-h-32">
                    {JSON.stringify(selectedProperty.bedsConfig, null, 2)}
                  </pre>
                )}
                <div className="mt-2">
                  <span className="text-gray-500">serviceConfigs:</span>{' '}
                  {selectedProperty.serviceConfigs 
                    ? `${Object.keys(selectedProperty.serviceConfigs).length} configurazioni — chiavi: [${Object.keys(selectedProperty.serviceConfigs).join(', ')}]`
                    : 'null/undefined'}
                </div>
              </div>
            ) : (
              <div className="text-red-400">Property non trovata per propertyId: {selectedCleaning?.propertyId}</div>
            )}
          </div>

          {/* SERVICE CONFIGS DETTAGLIO */}
          <div className="bg-gray-800 p-3 rounded-lg border border-gray-700">
            <h2 className="text-cyan-400 mb-2 text-sm font-bold">
              ⚙️ serviceConfigs DETTAGLIO 
              {configForGuests 
                ? <span className="text-green-400 ml-2">✅ Config trovata per {guestsCount} ospiti</span>
                : <span className="text-red-400 ml-2">❌ NESSUNA config per {guestsCount} ospiti!</span>
              }
            </h2>
            
            {serviceConfigsAnalysis.length > 0 ? (
              serviceConfigsAnalysis.map(cfg => (
                <div key={cfg.key} className={`mb-3 p-2 rounded ${
                  String(cfg.key) === String(guestsCount) ? 'bg-green-900/30 border border-green-700' : 'bg-gray-900'
                }`}>
                  <div className="text-yellow-300 font-bold mb-1">
                    Chiave: "{cfg.key}" (tipo: {typeof cfg.key})
                    {String(cfg.key) === String(guestsCount) && ' ← QUESTA VIENE USATA'}
                  </div>
                  
                  <div className="ml-2 space-y-1">
                    <div><span className="text-gray-500">beds:</span> [{cfg.beds?.join(', ') || 'vuoto'}]</div>
                    
                    <div className="text-purple-400 font-bold mt-1">bl (Biancheria Letto):</div>
                    {cfg.bl && Object.keys(cfg.bl).length > 0 ? (
                      Object.entries(cfg.bl).map(([groupKey, items]: [string, any]) => (
                        <div key={groupKey} className="ml-4">
                          <span className="text-purple-300">gruppo "{groupKey}":</span>
                          <pre className="text-[10px] text-purple-200 ml-4">
                            {JSON.stringify(items, null, 2)}
                          </pre>
                        </div>
                      ))
                    ) : (
                      <div className="ml-4 text-gray-500">vuoto</div>
                    )}
                    
                    <div className="text-blue-400 font-bold mt-1">ba (Biancheria Bagno):</div>
                    {cfg.ba && Object.keys(cfg.ba).length > 0 ? (
                      <pre className="ml-4 text-[10px] text-blue-200">
                        {JSON.stringify(cfg.ba, null, 2)}
                      </pre>
                    ) : (
                      <div className="ml-4 text-gray-500">vuoto</div>
                    )}
                    
                    <div className="text-pink-400 font-bold mt-1">ki (Kit Cortesia):</div>
                    <pre className="ml-4 text-[10px] text-pink-200">
                      {JSON.stringify(cfg.ki || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-red-400">Nessuna serviceConfigs sulla proprietà!</div>
            )}
          </div>

          {/* INVENTORY */}
          <div className="bg-gray-800 p-3 rounded-lg border border-gray-700">
            <h2 className="text-cyan-400 mb-2 text-sm font-bold">📦 Inventario ({inventory.length} articoli)</h2>
            <div className="grid grid-cols-2 gap-1">
              {inventory.map(item => (
                <div key={item.id} className="text-[10px] flex justify-between">
                  <span className="text-gray-400">{item.name}</span>
                  <span className="text-green-300">€{item.sellPrice}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ========== COLONNA DESTRA: OUTPUT ========== */}
        <div className="space-y-4">
          
          {/* DECISIONI calculateDotazioni */}
          <div className="bg-gray-800 p-3 rounded-lg border border-yellow-700">
            <h2 className="text-yellow-400 mb-2 text-sm font-bold">🧠 ANALISI DECISIONI calculateDotazioni</h2>
            <div className="space-y-2">
              
              <div className="p-2 bg-gray-900 rounded">
                <div className="text-gray-400 mb-1">1️⃣ Numero ospiti usato:</div>
                <div className="text-white font-bold">
                  guestsCount = {selectedCleaning?.guestsCount || 2}
                  {!selectedCleaning?.guestsCount && ' (default perché undefined)'}
                </div>
                {!selectedCleaning?.guestsConfirmed && selectedProperty?.maxGuests && (
                  <div className="text-orange-400 mt-1">
                    ⚠️ guestsConfirmed=false + maxGuests={selectedProperty.maxGuests} 
                    → SE il termine è scaduto, userebbe maxGuests={selectedProperty.maxGuests}!
                  </div>
                )}
              </div>
              
              <div className="p-2 bg-gray-900 rounded">
                <div className="text-gray-400 mb-1">2️⃣ hasLinenOrder check:</div>
                <div className={selectedCleaning?.hasLinenOrder === false ? 'text-red-400 font-bold' : 'text-green-400'}>
                  {selectedCleaning?.hasLinenOrder === false 
                    ? '❌ hasLinenOrder=false → NESSUNA biancheria (return precoce)' 
                    : selectedCleaning?.hasLinenOrder === true 
                      ? '✅ hasLinenOrder=true → Calcola biancheria'
                      : '⚠️ hasLinenOrder=undefined → Calcola biancheria (legacy)'}
                </div>
              </div>
              
              <div className="p-2 bg-gray-900 rounded">
                <div className="text-gray-400 mb-1">3️⃣ Fonte config:</div>
                <div className="text-white font-bold">
                  {selectedCleaning?.linenConfigModified && selectedCleaning?.customLinenConfig
                    ? '🔒 PRIORITÀ 1: customLinenConfig (modificata manualmente)'
                    : configForGuests
                      ? `📊 PRIORITÀ 2: serviceConfigs[${guestsCount}]`
                      : '🤖 PRIORITÀ 3: Auto-generazione (nessuna config salvata)'}
                </div>
              </div>
              
              <div className="p-2 bg-gray-900 rounded">
                <div className="text-gray-400 mb-1">4️⃣ Se usa serviceConfigs, bl logic:</div>
                {configForGuests?.bl ? (
                  <div>
                    <div className="text-white">
                      Chiavi bl: [{Object.keys(configForGuests.bl).join(', ')}]
                    </div>
                    <div className={configForGuests.bl['all'] ? 'text-orange-400 font-bold' : 'text-blue-400'}>
                      {configForGuests.bl['all'] 
                        ? `⚠️ Ha "all" → USA SOLO "all" come fonte di verità`
                        : '✅ Nessun "all" → usa gruppi per letto singoli'}
                    </div>
                    {configForGuests.bl['all'] && (
                      <div className="mt-1">
                        <div className="text-gray-400">Contenuto bl["all"]:</div>
                        <pre className="text-[10px] text-orange-200">
                          {JSON.stringify(configForGuests.bl['all'], null, 2)}
                        </pre>
                        <div className="text-red-400 mt-1 font-bold">
                          ⚠️ QUESTI sono i dati che vengono usati per la card!
                          Se qui ci sono numeri sbagliati, il problema è nel SALVATAGGIO della config!
                        </div>
                      </div>
                    )}
                    
                    {/* Mostra TUTTI i gruppi bl per confronto */}
                    <div className="mt-2 text-gray-400">Tutti i gruppi bl per confronto:</div>
                    {Object.entries(configForGuests.bl).map(([key, items]: [string, any]) => (
                      <div key={key} className="ml-2 mt-1">
                        <span className="text-yellow-300">"{key}":</span>
                        <pre className="text-[10px] ml-4">
                          {JSON.stringify(items, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-500">Nessun bl nella config</div>
                )}
              </div>
            </div>
          </div>
          
          {/* RISULTATO calculateDotazioni */}
          <div className="bg-gray-800 p-3 rounded-lg border border-green-700">
            <h2 className="text-green-400 mb-2 text-sm font-bold">✅ OUTPUT: calculateDotazioni RESULT</h2>
            {error ? (
              <div className="text-red-400 font-bold">ERRORE: {error}</div>
            ) : result ? (
              <div className="space-y-2">
                <div className="flex gap-4">
                  <div className="p-2 bg-gray-900 rounded flex-1">
                    <div className="text-gray-400">cleaningPrice</div>
                    <div className="text-white text-lg font-bold">€{result.cleaningPrice}</div>
                  </div>
                  <div className="p-2 bg-gray-900 rounded flex-1">
                    <div className="text-gray-400">dotazioniPrice</div>
                    <div className="text-white text-lg font-bold">€{result.dotazioniPrice.toFixed(2)}</div>
                  </div>
                  <div className="p-2 bg-green-900/50 rounded flex-1 border border-green-600">
                    <div className="text-gray-400">totalPrice</div>
                    <div className="text-green-400 text-lg font-bold">€{result.totalPrice.toFixed(2)}</div>
                  </div>
                </div>
                
                <div className="p-2 bg-gray-900 rounded">
                  <div className="text-purple-400 font-bold mb-1">bedItems (mostrati nella card):</div>
                  {result.bedItems.length > 0 ? (
                    result.bedItems.map((item: any, idx: number) => (
                      <div key={idx} className="ml-2 flex justify-between">
                        <span className="text-purple-200">{item.name}</span>
                        <span className="text-white font-bold">qty: {item.quantity} × €{item.price || 0} = €{((item.price || 0) * item.quantity).toFixed(2)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-500 ml-2">Nessun item letto</div>
                  )}
                </div>
                
                <div className="p-2 bg-gray-900 rounded">
                  <div className="text-blue-400 font-bold mb-1">bathItems (mostrati nella card):</div>
                  {result.bathItems.length > 0 ? (
                    result.bathItems.map((item: any, idx: number) => (
                      <div key={idx} className="ml-2 flex justify-between">
                        <span className="text-blue-200">{item.name}</span>
                        <span className="text-white font-bold">qty: {item.quantity} × €{item.price || 0} = €{((item.price || 0) * item.quantity).toFixed(2)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-500 ml-2">Nessun item bagno</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-yellow-400">Nessun risultato (cleaning o property mancante)</div>
            )}
          </div>
          
          {/* CONFRONTO ATTESO vs OTTENUTO */}
          <div className="bg-gray-800 p-3 rounded-lg border border-red-700">
            <h2 className="text-red-400 mb-2 text-sm font-bold">🚨 DIAGNOSI PROBLEMA</h2>
            <div className="space-y-2 text-sm">
              
              {/* Check 1: bl['all'] vs gruppi individuali */}
              {configForGuests?.bl && configForGuests.bl['all'] && (
                <div className="p-2 bg-red-900/20 rounded">
                  <div className="text-red-300 font-bold">POSSIBILE BUG: bl["all"] potrebbe contenere totali CUMULATI</div>
                  <div className="text-gray-300 mt-1">
                    La funzione usa SOLO bl["all"] quando presente. Se bl["all"] è la SOMMA 
                    di tutti i gruppi letto invece del valore corretto, i numeri saranno gonfiati.
                  </div>
                  <div className="mt-2">
                    <div className="text-yellow-300">Somma dei gruppi individuali:</div>
                    {(() => {
                      const groupTotals: Record<string, number> = {};
                      Object.entries(configForGuests.bl).forEach(([key, items]: [string, any]) => {
                        if (key !== 'all') {
                          Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
                            groupTotals[itemId] = (groupTotals[itemId] || 0) + (qty as number);
                          });
                        }
                      });
                      return (
                        <pre className="text-[10px] text-yellow-200 ml-2">
                          {JSON.stringify(groupTotals, null, 2)}
                        </pre>
                      );
                    })()}
                    
                    <div className="text-orange-300 mt-1">Contenuto di bl["all"]:</div>
                    <pre className="text-[10px] text-orange-200 ml-2">
                      {JSON.stringify(configForGuests.bl['all'], null, 2)}
                    </pre>
                    
                    <div className="mt-2 text-white font-bold">
                      {(() => {
                        const groupTotals: Record<string, number> = {};
                        Object.entries(configForGuests.bl).forEach(([key, items]: [string, any]) => {
                          if (key !== 'all') {
                            Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
                              groupTotals[itemId] = (groupTotals[itemId] || 0) + (qty as number);
                            });
                          }
                        });
                        const allItems = configForGuests.bl['all'] as Record<string, number>;
                        const matches = JSON.stringify(groupTotals) === JSON.stringify(allItems);
                        const isDouble = Object.entries(allItems).some(([k, v]) => {
                          return groupTotals[k] && v === groupTotals[k] * 2;
                        });
                        return matches 
                          ? '✅ bl["all"] = somma gruppi (corretto)' 
                          : isDouble 
                            ? '🚨 bl["all"] È IL DOPPIO dei gruppi! BUG nel salvataggio!'
                            : '⚠️ bl["all"] ≠ somma gruppi (possibile incoerenza)';
                      })()}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Check 2: Numero ospiti vs maxGuests */}
              {selectedCleaning && selectedProperty && (
                <div className="p-2 bg-gray-900 rounded">
                  <div className="text-yellow-300 font-bold">Check ospiti:</div>
                  <div>guestsCount sulla cleaning: {selectedCleaning.guestsCount ?? 'undefined'}</div>
                  <div>maxGuests sulla proprietà: {selectedProperty.maxGuests ?? 'undefined'}</div>
                  <div>guestsConfirmed: {String(selectedCleaning.guestsConfirmed)}</div>
                  {!selectedCleaning.guestsConfirmed && selectedCleaning.guestsCount !== selectedProperty.maxGuests && (
                    <div className="text-red-400 mt-1">
                      ⚠️ Se termine scaduto, la funzione userebbe maxGuests={selectedProperty.maxGuests} 
                      invece di guestsCount={selectedCleaning.guestsCount}!
                    </div>
                  )}
                </div>
              )}

              {/* Check 3: Config per numero ospiti specifico vs auto-generazione */}
              <div className="p-2 bg-gray-900 rounded">
                <div className="text-yellow-300 font-bold">Check config path:</div>
                {selectedCleaning?.linenConfigModified && selectedCleaning?.customLinenConfig ? (
                  <div className="text-orange-400">
                    Usa customLinenConfig → controllare se i dati dentro sono corretti (vedi sopra)
                  </div>
                ) : configForGuests ? (
                  <div className="text-green-400">
                    Usa serviceConfigs[{guestsCount}] → controllare se bl/ba sono corretti (vedi sopra)
                  </div>
                ) : (
                  <div className="text-red-400">
                    ⚠️ NESSUNA CONFIG SALVATA → auto-genera con generateAutoBeds({guestsCount}, {selectedProperty?.bedrooms || 1})
                    <br />Questo potrebbe generare letti sbagliati!
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RAW JSON OUTPUT */}
          <div className="bg-gray-800 p-3 rounded-lg border border-gray-700">
            <h2 className="text-cyan-400 mb-2 text-sm font-bold">📝 RAW JSON Output</h2>
            <pre className="text-[10px] text-gray-300 overflow-auto max-h-60">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
