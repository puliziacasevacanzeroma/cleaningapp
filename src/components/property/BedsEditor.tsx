"use client";

import { useState, useEffect } from "react";

// Tipi letto disponibili
const BED_TYPES = [
  { tipo: 'matrimoniale', nome: 'Matrimoniale', capacita: 2, icon: '🛏️' },
  { tipo: 'singolo', nome: 'Singolo', capacita: 1, icon: '🛏️' },
  { tipo: 'piazza_mezza', nome: 'Piazza e Mezza', capacita: 1, icon: '🛏️' },
  { tipo: 'divano_letto', nome: 'Divano Letto', capacita: 2, icon: '🛋️' },
  { tipo: 'castello', nome: 'Letto a Castello', capacita: 2, icon: '🛏️' },
];

interface Bed {
  id: string;
  type: string;
  name: string;
  loc?: string;
  cap: number;
}

interface Room {
  id: string;
  nome: string;
  letti: { tipo: string; nome: string }[];
}

interface BedsEditorProps {
  propertyId: string;
  currentBeds: Bed[];
  currentBedConfiguration?: Room[];
  maxGuests: number;
  isAdmin: boolean;
  onSave: (beds: Bed[], bedConfiguration: Room[]) => Promise<void>;
  onRequestChange?: (currentValue: string, requestedValue: string, newBeds: Bed[]) => Promise<void>;
}

export function BedsEditor({ 
  propertyId, 
  currentBeds, 
  currentBedConfiguration,
  maxGuests,
  isAdmin,
  onSave,
  onRequestChange
}: BedsEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inizializza rooms da bedConfiguration o ricostruisci da beds
  useEffect(() => {
    if (currentBedConfiguration && currentBedConfiguration.length > 0) {
      setRooms(currentBedConfiguration.map((r, idx) => ({
        id: r.id || `room_${idx}`,
        nome: r.nome,
        letti: r.letti || []
      })));
    } else if (currentBeds && currentBeds.length > 0) {
      // Raggruppa beds per location
      const roomMap: Record<string, { nome: string; letti: { tipo: string; nome: string }[] }> = {};
      
      currentBeds.forEach(bed => {
        const roomName = bed.loc || "Stanza";
        if (!roomMap[roomName]) {
          roomMap[roomName] = { nome: roomName, letti: [] };
        }
        const bedType = BED_TYPES.find(t => t.tipo === bed.type || t.nome === bed.name);
        roomMap[roomName].letti.push({
          tipo: bedType?.tipo || bed.type || 'singolo',
          nome: bedType?.nome || bed.name || 'Singolo'
        });
      });
      
      setRooms(Object.entries(roomMap).map(([name, data], idx) => ({
        id: `room_${idx}`,
        nome: data.nome,
        letti: data.letti
      })));
    }
  }, [currentBedConfiguration, currentBeds]);

  // Calcola capacità totale
  const totalCapacity = rooms.reduce((sum, room) => {
    return sum + room.letti.reduce((bedSum, letto) => {
      const bedType = BED_TYPES.find(t => t.tipo === letto.tipo);
      return bedSum + (bedType?.capacita || 1);
    }, 0);
  }, 0);

  // Aggiungi stanza
  const addRoom = () => {
    setRooms([...rooms, {
      id: `room_${Date.now()}`,
      nome: `Stanza ${rooms.length + 1}`,
      letti: []
    }]);
  };

  // Rimuovi stanza
  const removeRoom = (roomId: string) => {
    setRooms(rooms.filter(r => r.id !== roomId));
  };

  // Aggiorna nome stanza
  const updateRoomName = (roomId: string, nome: string) => {
    setRooms(rooms.map(r => r.id === roomId ? { ...r, nome } : r));
  };

  // Aggiungi letto a stanza
  const addBedToRoom = (roomId: string, tipo: string) => {
    const bedType = BED_TYPES.find(t => t.tipo === tipo);
    if (!bedType) return;
    
    setRooms(rooms.map(r => {
      if (r.id !== roomId) return r;
      return {
        ...r,
        letti: [...r.letti, { tipo, nome: bedType.nome }]
      };
    }));
  };

  // Rimuovi letto da stanza
  const removeBedFromRoom = (roomId: string, bedIndex: number) => {
    setRooms(rooms.map(r => {
      if (r.id !== roomId) return r;
      return {
        ...r,
        letti: r.letti.filter((_, idx) => idx !== bedIndex)
      };
    }));
  };

  // Converti rooms in beds per il salvataggio
  const convertToBeds = (): Bed[] => {
    const beds: Bed[] = [];
    
    rooms.forEach(room => {
      room.letti.forEach((letto, idx) => {
        const bedType = BED_TYPES.find(t => t.tipo === letto.tipo);
        beds.push({
          id: `${room.id}_${letto.tipo}_${idx}`,
          type: letto.tipo,
          name: bedType?.nome || letto.nome,
          loc: room.nome,
          cap: bedType?.capacita || 1
        });
      });
    });
    
    return beds;
  };

  // Salva modifiche
  const handleSave = async () => {
    setError(null);
    
    // Validazioni
    if (rooms.length === 0) {
      setError("Aggiungi almeno una stanza");
      return;
    }
    
    const hasEmptyRoom = rooms.some(r => r.letti.length === 0);
    if (hasEmptyRoom) {
      setError("Ogni stanza deve avere almeno un letto");
      return;
    }
    
    if (totalCapacity < maxGuests) {
      setError(`La capacità (${totalCapacity} posti) deve essere almeno uguale al numero massimo di ospiti (${maxGuests})`);
      return;
    }
    
    setSaving(true);
    
    try {
      const newBeds = convertToBeds();
      
      if (isAdmin) {
        // Admin salva direttamente
        await onSave(newBeds, rooms);
      } else if (onRequestChange) {
        // Proprietario crea richiesta
        const currentCapacity = currentBeds.reduce((sum, b) => sum + (b.cap || 1), 0);
        await onRequestChange(
          `${currentBeds.length} letti (${currentCapacity} posti)`,
          `${newBeds.length} letti (${totalCapacity} posti)`,
          newBeds
        );
      }
      
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  // Visualizzazione compatta (non editing)
  if (!isEditing) {
    return (
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛏️</span>
            <h3 className="font-semibold text-slate-800">Stanze e Letti</h3>
          </div>
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1.5 text-sm font-medium text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
          >
            ✏️ Modifica
          </button>
        </div>
        
        <div className="flex items-center gap-4 mb-3">
          <div className="px-3 py-1 bg-white rounded-lg border border-slate-200">
            <span className="text-sm text-slate-500">Capacità:</span>
            <span className="ml-1 font-bold text-slate-800">{totalCapacity} posti</span>
          </div>
          <div className="px-3 py-1 bg-white rounded-lg border border-slate-200">
            <span className="text-sm text-slate-500">Max ospiti:</span>
            <span className="ml-1 font-bold text-slate-800">{maxGuests}</span>
          </div>
          {totalCapacity < maxGuests && (
            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-lg">
              ⚠️ Capacità insufficiente
            </span>
          )}
        </div>
        
        <div className="space-y-2">
          {rooms.map(room => (
            <div key={room.id} className="bg-white rounded-lg p-3 border border-slate-200">
              <p className="font-medium text-slate-700 text-sm">{room.nome}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {room.letti.map((letto, idx) => {
                  const bedType = BED_TYPES.find(t => t.tipo === letto.tipo);
                  return (
                    <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">
                      {bedType?.icon} {bedType?.nome || letto.nome}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
          
          {rooms.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-4">
              Nessuna stanza configurata
            </p>
          )}
        </div>
      </div>
    );
  }

  // Modalità editing
  return (
    <div className="bg-sky-50 rounded-xl p-4 border-2 border-sky-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛏️</span>
          <h3 className="font-semibold text-slate-800">Modifica Stanze e Letti</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-lg text-sm font-medium ${
            totalCapacity >= maxGuests 
              ? 'bg-emerald-100 text-emerald-700' 
              : 'bg-amber-100 text-amber-700'
          }`}>
            Capacità: {totalCapacity} / {maxGuests} posti
          </span>
        </div>
      </div>
      
      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
          ⚠️ {error}
        </div>
      )}
      
      <div className="space-y-4 mb-4">
        {rooms.map(room => (
          <div key={room.id} className="bg-white rounded-xl p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                value={room.nome}
                onChange={(e) => updateRoomName(room.id, e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium"
                placeholder="Nome stanza"
              />
              <button
                onClick={() => removeRoom(room.id)}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                title="Rimuovi stanza"
              >
                🗑️
              </button>
            </div>
            
            {/* Letti nella stanza */}
            <div className="flex flex-wrap gap-2 mb-3">
              {room.letti.map((letto, idx) => {
                const bedType = BED_TYPES.find(t => t.tipo === letto.tipo);
                return (
                  <div key={idx} className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg">
                    <span className="text-sm">{bedType?.icon} {bedType?.nome}</span>
                    <button
                      onClick={() => removeBedFromRoom(room.id, idx)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
            
            {/* Aggiungi letto */}
            <div className="flex flex-wrap gap-1">
              {BED_TYPES.map(bedType => (
                <button
                  key={bedType.tipo}
                  onClick={() => addBedToRoom(room.id, bedType.tipo)}
                  className="px-2 py-1 text-xs bg-sky-100 text-sky-700 rounded hover:bg-sky-200 transition-colors"
                >
                  + {bedType.icon} {bedType.nome}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {/* Aggiungi stanza */}
      <button
        onClick={addRoom}
        className="w-full py-2 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-sky-400 hover:text-sky-600 transition-colors"
      >
        + Aggiungi Stanza
      </button>
      
      {/* Pulsanti azione */}
      <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-slate-200">
        <button
          onClick={() => setIsEditing(false)}
          className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          disabled={saving}
        >
          Annulla
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-sky-500 text-white font-medium rounded-lg hover:bg-sky-600 disabled:opacity-50 transition-colors"
        >
          {saving ? "Salvataggio..." : isAdmin ? "Salva Modifiche" : "Richiedi Modifica"}
        </button>
      </div>
      
      {!isAdmin && (
        <p className="text-xs text-slate-500 text-center mt-2">
          Le modifiche devono essere approvate dall'amministratore
        </p>
      )}
    </div>
  );
}
