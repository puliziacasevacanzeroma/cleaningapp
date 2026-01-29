import React, { useState } from 'react';

const mockCleanings = [
  {
    id: '1',
    propertyName: 'Eoli',
    address: 'Via di Montespaccato 19, Primo piano',
    date: '23',
    month: 'GEN',
    dayName: 'venerdì',
    fullDate: 'venerdì 23 gennaio',
    time: '10:00',
    guests: 6,
    totalPrice: 68.20,
    cleaningPrice: 52,
    extrasPrice: 16.20,
    status: 'pending', // pending, assigned
    operators: [],
    bedLinen: [
      { type: 'Matrimoniale', room: 'Camera 1', lenzuolo: 6, federa: 4 },
      { type: 'Divano Letto', room: 'Soggiorno', lenzuolo: 6, federa: 4 },
    ],
    bathLinen: [
      { name: 'Scendi Bagno', qty: 1 },
      { name: 'Telo Corpo', qty: 4 },
      { name: 'Telo Bidet', qty: 4 },
      { name: 'Telo Viso', qty: 4 },
    ],
  },
  {
    id: '2',
    propertyName: 'Stefano Damiani',
    address: 'Via della Cava Aurelia 82, Teopezzeria',
    date: '23',
    month: 'GEN',
    dayName: 'venerdì',
    fullDate: 'venerdì 23 gennaio',
    time: '10:00',
    guests: 3,
    totalPrice: 45.00,
    cleaningPrice: 35,
    extrasPrice: 10.00,
    status: 'pending',
    operators: [],
    bedLinen: [
      { type: 'Matrimoniale', room: 'Camera 1', lenzuolo: 4, federa: 2 },
    ],
    bathLinen: [
      { name: 'Telo Corpo', qty: 2 },
      { name: 'Telo Viso', qty: 2 },
    ],
  },
  {
    id: '3',
    propertyName: 'Appartamento 1',
    address: 'Via del Lavatore, 32, Roma, 00187',
    date: '24',
    month: 'GEN',
    dayName: 'sabato',
    fullDate: 'sabato 24 gennaio',
    time: '10:00',
    guests: 4,
    totalPrice: 68.20,
    cleaningPrice: 52,
    extrasPrice: 16.20,
    status: 'assigned',
    operators: [{ name: 'Jorge' }],
    bedLinen: [
      { type: 'Matrimoniale', room: 'Camera 1', lenzuolo: 6, federa: 4 },
      { type: 'Divano Letto', room: 'Soggiorno', lenzuolo: 6, federa: 4 },
    ],
    bathLinen: [
      { name: 'Scendi Bagno', qty: 1 },
      { name: 'Telo Corpo', qty: 4 },
      { name: 'Telo Bidet', qty: 4 },
      { name: 'Telo Viso', qty: 4 },
    ],
  },
];

// Group by date
const groupByDate = (cleanings) => {
  return cleanings.reduce((acc, cleaning) => {
    const key = cleaning.fullDate;
    if (!acc[key]) {
      acc[key] = { fullDate: cleaning.fullDate, items: [] };
    }
    acc[key].items.push(cleaning);
    return acc;
  }, {});
};

// Date Header
const DateHeader = ({ fullDate, count }) => (
  <div className="flex items-center gap-3 mb-3">
    <div className="px-4 py-2 bg-slate-100 rounded-xl">
      <span className="text-sm font-semibold text-slate-700">{fullDate}</span>
    </div>
    <div className="flex-1 h-px bg-slate-200"></div>
    <span className="text-sm text-slate-400">{count} pulizie</span>
  </div>
);

// Cleaning Card
const CleaningCard = ({ data, expanded, onToggle, onEditGuests }) => {
  const isPending = data.status === 'pending';
  const borderColor = isPending ? 'border-t-red-400' : 'border-t-emerald-400';
  const statusBg = isPending ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600';
  const statusText = isPending ? 'In attesa' : 'Assegnato';

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 overflow-hidden border-t-4 ${borderColor}`}>
      <div className="p-4">
        {/* Header Row */}
        <div className="flex items-start gap-3 mb-3">
          {/* Property Icon */}
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
          </div>

          {/* Property Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-800 truncate">{data.propertyName}</h3>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusBg}`}>
                {statusText}
              </span>
            </div>
            <p className="text-sm text-slate-400 truncate">{data.address}</p>
          </div>
        </div>

        {/* Info Badges Row */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {/* Time */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-full">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-slate-700">{data.time}</span>
          </div>

          {/* Guests - Clickable */}
          <button 
            onClick={(e) => { e.stopPropagation(); onEditGuests(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-full hover:bg-blue-100 transition-colors"
          >
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <span className="text-sm font-medium text-blue-600">{data.guests} ospiti</span>
            <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
          </button>
        </div>

        {/* Bottom Row: Operator Status + Details Button */}
        <div className="flex items-center justify-between">
          {/* Operator or Pending */}
          {data.operators && data.operators.length > 0 ? (
            <div className="flex items-center gap-2">
              {data.operators.map((op, i) => (
                <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 rounded-full">
                  <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white">
                    {op.name[0]}
                  </span>
                  <span className="text-sm font-medium text-white">{op.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-full">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-slate-500">In attesa di assegnazione</span>
            </div>
          )}

          {/* Details Button */}
          <button 
            onClick={onToggle}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-medium text-slate-600">Dettagli</span>
          </button>
        </div>

        {/* Expanded Content - Styled like second screenshot */}
        <div className={`overflow-hidden transition-all duration-300 ${expanded ? 'max-h-[800px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
          <div className="pt-4 border-t border-slate-100">
            
            {/* Summary Row */}
            <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-xl">
              {/* Date Badge */}
              <div className="w-14 h-14 rounded-2xl bg-blue-500 text-white flex flex-col items-center justify-center shadow-lg shadow-blue-200 flex-shrink-0">
                <span className="text-xl font-bold leading-none">{data.date}</span>
                <span className="text-[9px] uppercase opacity-90">{data.month}</span>
              </div>

              {/* Info */}
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="font-medium">{data.dayName.slice(0, 4)}...</span>
                  <span>{data.time}</span>
                  <span>·</span>
                  <div className="flex items-center gap-1">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                    </svg>
                    <span>{data.guests}</span>
                    <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                  </div>
                </div>
                {data.operators && data.operators.length > 0 && (
                  <p className="text-sm text-slate-500">{data.operators.map(o => o.name).join(', ')}</p>
                )}
              </div>

              {/* Price + Arrow */}
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-slate-800">€{data.totalPrice.toFixed(2)}</span>
                <button className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="flex items-center justify-between mb-5 px-2">
              <div>
                <span className="text-sm text-slate-500">Pulizia: </span>
                <span className="text-sm font-bold text-slate-700">€{data.cleaningPrice}</span>
              </div>
              <div>
                <span className="text-sm text-slate-500">Dotazioni: </span>
                <span className="text-sm font-bold text-slate-700">€{data.extrasPrice.toFixed(2)}</span>
              </div>
            </div>

            {/* Biancheria Letto */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
                  </svg>
                </div>
                <span className="font-semibold text-slate-700">Biancheria Letto</span>
              </div>

              <div className="space-y-3 ml-10">
                {data.bedLinen.map((bed, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12" />
                      </svg>
                      <span className="font-medium text-slate-700">{bed.type}</span>
                      <span className="text-sm text-violet-500">({bed.room})</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1 bg-white rounded-lg text-sm text-slate-600 border border-slate-200">
                        Lenzuolo Matrimoniale: <strong>{bed.lenzuolo}</strong>
                      </span>
                      <span className="px-3 py-1 bg-white rounded-lg text-sm text-slate-600 border border-slate-200">
                        Federa: <strong>{bed.federa}</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Biancheria Bagno */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-pink-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                </div>
                <span className="font-semibold text-slate-700">Biancheria Bagno</span>
              </div>

              <div className="flex flex-wrap gap-2 ml-10">
                {data.bathLinen.map((item, i) => (
                  <span key={i} className="px-3 py-1.5 bg-pink-50 rounded-lg text-sm text-pink-600 border border-pink-100">
                    {item.name}: <strong>{item.qty}</strong>
                  </span>
                ))}
              </div>
            </div>

            {/* Modifica Button */}
            <button className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
              Modifica Dettagli Completi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [expanded, setExpanded] = useState({ 1: false, 2: false, 3: true });
  const [showModal, setShowModal] = useState(false);

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const grouped = groupByDate(mockCleanings);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">CleaningApp</h1>
            <p className="text-sm text-slate-400">Area Proprietario</p>
          </div>
          <button className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {Object.values(grouped).map((group) => (
          <div key={group.fullDate}>
            {/* Date Header */}
            <DateHeader fullDate={group.fullDate} count={group.items.length} />
            
            {/* Cards */}
            <div className="space-y-3">
              {group.items.map((cleaning) => (
                <CleaningCard 
                  key={cleaning.id}
                  data={cleaning} 
                  expanded={expanded[cleaning.id]} 
                  onToggle={() => toggle(cleaning.id)}
                  onEditGuests={() => setShowModal(true)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Guest Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-800">Modifica Ospiti</h3>
              <button 
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-center gap-6 py-6">
              <button className="w-14 h-14 rounded-full border-2 border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                </svg>
              </button>
              <div className="text-center">
                <span className="text-5xl font-bold text-slate-800">4</span>
                <p className="text-xs text-slate-400 mt-1">ospiti</p>
              </div>
              <button className="w-14 h-14 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors shadow-lg shadow-blue-200 flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>
            <button 
              onClick={() => setShowModal(false)}
              className="w-full mt-4 py-3.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors"
            >
              Conferma
            </button>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-2">
        <div className="flex items-center justify-around">
          <button className="flex flex-col items-center gap-1 py-2 px-3">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
            </svg>
            <span className="text-xs text-slate-400">Dashboard</span>
          </button>
          <button className="flex flex-col items-center gap-1 py-2 px-3">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
            <span className="text-xs text-slate-400">Proprietà</span>
          </button>
          <button className="flex flex-col items-center gap-1 py-2 px-3">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <span className="text-xs text-slate-400">Prenotazioni</span>
          </button>
          <button className="flex flex-col items-center gap-1 py-2 px-3 relative">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <span className="text-xs text-blue-500 font-medium">Pulizie</span>
          </button>
          <button className="flex flex-col items-center gap-1 py-2 px-3">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
            <span className="text-xs text-slate-400">Menu</span>
          </button>
        </div>
      </div>
    </div>
  );
}
