// ==================== ICAL CONFIG MODAL ====================
interface ICalLinks {
  icalAirbnb: string;
  icalBooking: string;
  icalOktorate: string;
  icalInreception: string;
  icalKrossbooking: string;
}

function ICalConfigModal({
  icalLinks,
  propertyId,
  onClose,
  onSave,
}: {
  icalLinks: ICalLinks;
  propertyId?: string;
  onClose: () => void;
  onSave: (links: ICalLinks) => void;
}) {
  const [airbnb, setAirbnb] = useState(icalLinks.icalAirbnb || "");
  const [booking, setBooking] = useState(icalLinks.icalBooking || "");
  const [oktorate, setOktorate] = useState(icalLinks.icalOktorate || "");
  const [inreception, setInreception] = useState(icalLinks.icalInreception || "");
  const [krossbooking, setKrossbooking] = useState(icalLinks.icalKrossbooking || "");
  const [showSuccess, setShowSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedOta, setExpandedOta] = useState<string | null>(null);

  const otaConfig = [
    {
      id: "airbnb",
      name: "Airbnb",
      desc: "Link iCal di Airbnb",
      value: airbnb,
      setValue: setAirbnb,
      color: "from-red-500 to-red-600",
      icon: "🏠",
    },
    {
      id: "booking",
      name: "Booking.com",
      desc: "Link iCal di Booking.com",
      value: booking,
      setValue: setBooking,
      color: "from-blue-500 to-blue-600",
      icon: "📘",
    },
    {
      id: "oktorate",
      name: "Oktorate",
      desc: "Link iCal di Oktorate",
      value: oktorate,
      setValue: setOktorate,
      color: "from-purple-500 to-purple-600",
      icon: "📱",
    },
    {
      id: "inreception",
      name: "InReception",
      desc: "Link iCal di InReception",
      value: inreception,
      setValue: setInreception,
      color: "from-green-500 to-green-600",
      icon: "🔔",
    },
    {
      id: "krossbooking",
      name: "KrossBooking",
      desc: "Link iCal di KrossBooking",
      value: krossbooking,
      setValue: setKrossbooking,
      color: "from-orange-500 to-orange-600",
      icon: "🗓️",
    },
  ];

  const handleSave = async () => {
    setSaving(true);
    const newLinks: ICalLinks = {
      icalAirbnb: airbnb,
      icalBooking: booking,
      icalOktorate: oktorate,
      icalInreception: inreception,
      icalKrossbooking: krossbooking,
    };

    // Save to database if propertyId exists
    if (propertyId) {
      try {
        const response = await fetch(`/api/properties/${propertyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newLinks),
        });
        if (!response.ok) {
          console.error("Failed to save iCal links");
          setSaving(false);
          return;
        }
      } catch (error) {
        console.error("Error saving iCal links:", error);
        setSaving(false);
        return;
      }
    }

    onSave(newLinks);
    setSaving(false);
    setShowSuccess(true);
  };

  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
            <div className="w-8 h-8 text-emerald-600">{I.check}</div>
          </div>
          <h2 className="text-lg font-semibold text-center mb-2">Link Salvati</h2>
          <p className="text-sm text-slate-500 text-center mb-6">I link iCal sono stati aggiornati con successo. La sincronizzazione inizierà automaticamente.</p>
          <button onClick={onClose} className="w-full py-3 bg-slate-900 text-white text-sm font-semibold rounded-xl active:scale-[0.98]">
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex-shrink-0 bg-white pt-12 px-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Configura Link iCal</h2>
            <p className="text-xs text-slate-500">Aggiungi i link di sincronizzazione da Airbnb, Booking e altri OTA</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-95 active:bg-slate-200">
            <div className="w-5 h-5 text-slate-500">{I.close}</div>
          </button>
        </div>
      </div>

      {/* Content scrollabile */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-2">
          {otaConfig.map((ota) => (
            <div
              key={ota.id}
              className={`rounded-xl border overflow-hidden transition-all ${
                expandedOta === ota.id ? "border-slate-300 shadow-sm" : "border-slate-200"
              } bg-white`}
            >
              <button
                onClick={() => setExpandedOta(expandedOta === ota.id ? null : ota.id)}
                className="w-full px-4 py-3 flex items-center justify-between active:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${ota.color} flex items-center justify-center text-xl`}>
                    {ota.icon}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-800">{ota.name}</p>
                    <p className="text-xs text-slate-500">{ota.value ? "✓ Configurato" : "Non configurato"}</p>
                  </div>
                </div>
                <div className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${expandedOta === ota.id ? "rotate-180" : ""}`}>
                  {I.down}
                </div>
              </button>
              <div
                className={`overflow-hidden transition-all duration-200 ${
                  expandedOta === ota.id ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 space-y-2">
                  <p className="text-xs text-slate-600 mb-2">Incolla il link iCal di {ota.name} qui sotto:</p>
                  <textarea
                    value={ota.value}
                    onChange={(e) => ota.setValue(e.target.value)}
                    placeholder={`Es: https://www.airbnb.com/calendar/ical/...`}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:border-blue-400 focus:outline-none text-xs font-mono resize-none"
                    rows={4}
                  />
                  {ota.value && (
                    <button
                      onClick={() => ota.setValue("")}
                      className="w-full py-2 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 active:scale-95"
                    >
                      Rimuovi Link
                    </button>
                  )}
                  <p className="text-[10px] text-slate-500 italic">
                    Dove trovarlo: Accedi a {ota.name}, vai alle impostazioni calendario e copia l'URL iCal
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Info box */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-700">
            <strong>💡 Suggerimento:</strong> Una volta aggiunto un link, il sistema sincronizzerà automaticamente le prenotazioni dal calendario dell'OTA.
          </p>
        </div>

        {/* Spazio extra per scrollare */}
        <div className="h-4"></div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-4 pt-3 pb-20 border-t border-slate-200 bg-white">
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl active:scale-[0.98]"
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (!airbnb && !booking && !oktorate && !inreception && !krossbooking)}
            className={`flex-1 py-3 text-white text-sm font-semibold rounded-xl active:scale-[0.98] transition-all ${
              saving || (!airbnb && !booking && !oktorate && !inreception && !krossbooking)
                ? "bg-slate-400 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 to-blue-700"
            }`}
          >
            {saving ? "Salvataggio..." : "Salva Link"}
          </button>
        </div>
      </div>
    </div>
  );
}
