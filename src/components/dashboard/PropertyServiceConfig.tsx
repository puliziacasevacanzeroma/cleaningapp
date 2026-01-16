"use client";

import React, { useState, useRef } from 'react';

// ICONS
const I = {
  bed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18M6 10V7C6 6 7 5 8 5H16C17 5 18 6 18 7V10"/><rect x="6" y="10" width="12" height="4" rx="1" fill="currentColor" opacity="0.15"/></svg>,
  sofa: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M4 12V10C4 9 5 8 6 8H18C19 8 20 9 20 10V12"/><rect x="4" y="12" width="16" height="5" rx="1" fill="currentColor" opacity="0.15"/><path d="M6 17V19M18 17V19"/></svg>,
  towel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="6" y="3" width="12" height="18" rx="2" fill="currentColor" opacity="0.1"/><path d="M6 7H18M6 11H18"/></svg>,
  soap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="6" y="8" width="12" height="12" rx="2" fill="currentColor" opacity="0.1"/><path d="M10 8V6C10 5 11 4 12 4C13 4 14 5 14 6V8M9 12H15M9 15H13"/></svg>,
  gift: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="8" width="18" height="13" rx="2" fill="currentColor" opacity="0.1"/><path d="M12 8V21M3 12H21M12 8C12 8 12 5 9.5 5C8 5 7 6 7 7C7 8 8 8 12 8M12 8C12 8 12 5 14.5 5C16 5 17 6 17 7C17 8 16 8 12 8"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-full h-full"><path d="M5 13L9 17L19 7"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M12 5V19M5 12H19"/></svg>,
  minus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M5 12H19"/></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M18 6L6 18M6 6L18 18"/></svg>,
  down: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M6 9L12 15L18 9"/></svg>,
  right: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M9 18L15 12L9 6"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="9" cy="7" r="3" fill="currentColor" opacity="0.15"/><path d="M2 19C2 16 5 14 9 14S16 16 16 19"/></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="8" r="4" fill="currentColor" opacity="0.15"/><path d="M4 20C4 17 8 14 12 14S20 17 20 20"/></svg>,
  clean: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M12 2V8M9 8H15L14 22H10L9 8Z" fill="currentColor" opacity="0.1"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.15"/><path d="M12 1v3m0 16v3m-9-10h3m13 0h3"/></svg>,
  chart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="12" width="4" height="9" rx="1" fill="currentColor" opacity="0.2"/><rect x="10" y="8" width="4" height="13" rx="1" fill="currentColor" opacity="0.3"/><rect x="17" y="4" width="4" height="17" rx="1" fill="currentColor" opacity="0.15"/></svg>,
  money: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.1"/><path d="M12 6V18M15 9C15 8 14 7 12 7S9 8 9 10C9 11 10 12 12 12S15 13 15 15C15 17 14 17 12 17S9 16 9 15"/></svg>,
  back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M15 18L9 12L15 6"/></svg>,
  bath: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M4 12H20V16C20 18 18 20 16 20H8C6 20 4 18 4 16V12Z" fill="currentColor" opacity="0.1"/><path d="M4 12H20"/></svg>,
  package: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M21 16V8L12 3L3 8V16L12 21L21 16Z" fill="currentColor" opacity="0.1"/><path d="M12 12V21M3 8L12 12L21 8"/></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.1"/><path d="M12 6V12L16 14"/></svg>,
  warn: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M12 3L2 21H22L12 3Z" fill="currentColor" opacity="0.1"/><path d="M12 9V13M12 17H12.01"/></svg>,
  camera: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill="currentColor" opacity="0.1"/><circle cx="12" cy="13" r="4"/></svg>,
  image: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" opacity="0.1"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
};

// DATA
const beds = [
  { id: 'b1', type: 'matr', name: 'Matrimoniale', loc: 'Camera 1', cap: 2 },
  { id: 'b2', type: 'matr', name: 'Matrimoniale', loc: 'Camera 2', cap: 2 },
  { id: 'b3', type: 'sing', name: 'Singolo', loc: 'Cameretta', cap: 1 },
  { id: 'b4', type: 'divano', name: 'Divano Letto', loc: 'Soggiorno', cap: 2 },
];

const linen = {
  matr: [{ id: 'ls', n: 'Lenzuolo Sotto', p: 6, d: 1 }, { id: 'lso', n: 'Lenzuolo Sopra', p: 6, d: 1 }, { id: 'cp', n: 'Copripiumino', p: 12, d: 1 }, { id: 'fed', n: 'Federa', p: 2, d: 2 }],
  sing: [{ id: 'ls', n: 'Lenzuolo Sotto', p: 4, d: 1 }, { id: 'lso', n: 'Lenzuolo Sopra', p: 4, d: 1 }, { id: 'cp', n: 'Copripiumino', p: 8, d: 1 }, { id: 'fed', n: 'Federa', p: 2, d: 1 }],
  divano: [{ id: 'ls', n: 'Lenzuolo Sotto', p: 6, d: 1 }, { id: 'lso', n: 'Lenzuolo Sopra', p: 6, d: 1 }, { id: 'fed', n: 'Federa', p: 2, d: 2 }],
};

const bathItems = [{ id: 'av', n: 'Asciugamano Viso', p: 2, d: 1 }, { id: 'ao', n: 'Asciugamano Ospite', p: 1.5, d: 1 }, { id: 'td', n: 'Telo Doccia', p: 4, d: 1 }, { id: 'ac', n: 'Accappatoio', p: 6, d: 0 }];
const kitItems = [{ id: 'sh', n: 'Shampoo', p: 1, d: 1 }, { id: 'bg', n: 'Bagnoschiuma', p: 1, d: 1 }, { id: 'sp', n: 'Saponetta', p: 0.5, d: 1 }, { id: 'cr', n: 'Crema Corpo', p: 1.5, d: 0 }];
const extras = [{ id: 'welcome', n: 'Welcome Kit', p: 15, desc: 'Vino, snack, acqua' }, { id: 'fiori', n: 'Fiori Freschi', p: 20, desc: 'Composizione floreale' }, { id: 'frigo', n: 'Frigo Pieno', p: 50, desc: 'Colazione e snack' }];

const genCfg = (g) => {
  let sel = [], rem = g;
  ['b1', 'b2', 'b3', 'b4'].forEach(id => { if (rem > 0) { sel.push(id); rem -= beds.find(b => b.id === id).cap; } });
  const bl = {}; sel.forEach(id => { const b = beds.find(x => x.id === id); bl[id] = {}; (linen[b.type] || []).forEach(i => { bl[id][i.id] = i.d; }); });
  const ba = {}, ki = {}, ex = {};
  bathItems.forEach(i => { ba[i.id] = i.d * g; });
  kitItems.forEach(i => { ki[i.id] = i.d * g; });
  extras.forEach(i => { ex[i.id] = false; });
  return { beds: sel, bl, ba, ki, ex };
};

const initCfgs = () => { const c = {}; for (let i = 1; i <= 7; i++) c[i] = genCfg(i); return c; };

const services = [
  { id: '1', date: '2026-01-20', time: '11:00', op: 'Maria R.', guests: 4, edit: true },
  { id: '2', date: '2026-01-18', time: '10:00', op: 'Giuseppe M.', guests: 2, edit: true },
];
const prop = { name: 'Appartamento Colosseo', addr: 'Via dei Fori Imperiali 45', cleanPrice: 65 };

const calcBL = (bl) => { let t = 0; Object.entries(bl).forEach(([bid, items]) => { const b = beds.find(x => x.id === bid); (linen[b?.type] || []).forEach(i => { t += i.p * (items[i.id] || 0); }); }); return t; };
const calcArr = (obj, arr) => Object.entries(obj).reduce((t, [id, q]) => { const i = arr.find(x => x.id === id); return t + (i ? i.p * (typeof q === 'boolean' ? (q ? 1 : 0) : q) : 0); }, 0);
const calcCap = (ids) => ids.reduce((t, id) => t + (beds.find(b => b.id === id)?.cap || 0), 0);

// COMPONENTS
const Cnt = ({ v, onChange }) => (
  <div className="flex items-center gap-1.5">
    <button onClick={() => onChange(Math.max(0, v - 1))} className="w-6 h-6 rounded-lg border border-slate-300 bg-white flex items-center justify-center"><div className="w-3 h-3 text-slate-500">{I.minus}</div></button>
    <span className="w-5 text-center text-sm font-semibold">{v}</span>
    <button onClick={() => onChange(v + 1)} className="w-6 h-6 rounded-lg bg-slate-900 flex items-center justify-center"><div className="w-3 h-3 text-white">{I.plus}</div></button>
  </div>
);

const Section = ({ title, icon, price, expanded, onToggle, children }) => (
  <div className="border-b border-slate-100">
    <button onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between bg-white hover:bg-slate-50">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"><div className="w-4 h-4 text-slate-600">{icon}</div></div>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-700">€{price}</span>
        <div className={`w-5 h-5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>{I.down}</div>
      </div>
    </button>
    {expanded && <div className="px-4 pb-4">{children}</div>}
  </div>
);

// MAIN
export default function PropertyServiceConfig() {
  const [tab, setTab] = useState('services');
  const [svcModal, setSvcModal] = useState(null);
  const [cfgModal, setCfgModal] = useState(false);
  const [cfgs, setCfgs] = useState(initCfgs);
  const [propertyImage, setPropertyImage] = useState(null);
  const fileInputRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPropertyImage(ev.target?.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const getPrice = (s) => { const c = cfgs[s.guests]; return { clean: prop.cleanPrice, linen: calcBL(c.bl) + calcArr(c.ba, bathItems) + calcArr(c.ki, kitItems) + calcArr(c.ex, extras) }; };

  return (
    <div className="min-h-screen bg-slate-50 pb-20" style={{ fontFamily: "-apple-system, sans-serif" }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        .animate-fadeInUp { animation: fadeInUp 0.3s ease-out forwards; }
        .animate-scaleIn { animation: scaleIn 0.2s ease-out forwards; }
        .animate-slideIn { animation: slideIn 0.25s ease-out forwards; }
        .stagger-1 { animation-delay: 0.05s; opacity: 0; }
        .stagger-2 { animation-delay: 0.1s; opacity: 0; }
        .stagger-3 { animation-delay: 0.15s; opacity: 0; }
        .stagger-4 { animation-delay: 0.2s; opacity: 0; }
        .hover-lift { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .hover-lift:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .press-effect { transition: transform 0.1s ease; }
        .press-effect:active { transform: scale(0.98); }
      `}</style>
      
      <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
      
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center gap-3">
          <button className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500"><div className="w-5 h-5">{I.back}</div></button>
          
          {/* Foto Proprietà nell'header */}
          <div 
            className="w-10 h-10 rounded-xl bg-slate-200 overflow-hidden flex items-center justify-center cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            {propertyImage ? (
              <img src={propertyImage} alt="Proprietà" className="w-full h-full object-cover" />
            ) : (
              <div className="w-5 h-5 text-slate-400">{I.image}</div>
            )}
          </div>
          
          <div className="flex-1"><h1 className="text-base font-semibold">{prop.name}</h1><p className="text-xs text-slate-500">{prop.addr}</p></div>
          <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-semibold rounded-md border border-emerald-200">Attiva</span>
        </div>
        <div className="flex px-4 pb-2 gap-1">
          {[{ k: 'dashboard', l: 'Dashboard', i: 'chart' }, { k: 'services', l: 'Servizi', i: 'clean' }, { k: 'settings', l: 'Impostazioni', i: 'settings' }].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${tab === t.k ? 'bg-slate-200 text-slate-800 shadow-sm border border-slate-300' : 'text-slate-500 hover:bg-slate-100'}`}><div className="w-4 h-4">{I[t.i]}</div>{t.l}</button>
          ))}
        </div>
      </header>

      {tab === 'dashboard' && (
        <div className="p-4">
          {/* Card grande con foto */}
          <div className="bg-white rounded-xl border overflow-hidden mb-4 animate-fadeInUp">
            <div className="h-32 bg-slate-200 relative">
              {propertyImage ? (
                <img src={propertyImage} alt="Proprietà" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto text-slate-300 mb-2">{I.image}</div>
                    <p className="text-xs text-slate-400">Nessuna foto</p>
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
              <div className="absolute bottom-3 left-3 text-white">
                <h2 className="font-semibold">{prop.name}</h2>
                <p className="text-xs opacity-80">{prop.addr}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">{[{ i: 'clean', v: '5', l: 'Pulizie' }, { i: 'money', v: '€571', l: 'Spesa' }, { i: 'bed', v: '4', l: 'Letti' }, { i: 'users', v: '7', l: 'Capacità' }].map((s, idx) => <div key={idx} className={`bg-white rounded-xl border p-4 flex items-center gap-3 hover-lift animate-fadeInUp stagger-${idx + 1}`}><div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600"><div className="w-5 h-5">{I[s.i]}</div></div><div><p className="text-xl font-semibold">{s.v}</p><p className="text-[10px] text-slate-500">{s.l}</p></div></div>)}</div>
        </div>
      )}

      {tab === 'services' && <div className="p-4 space-y-3">{services.map((s, idx) => { const p = getPrice(s); return (<div key={s.id} className={`bg-white rounded-xl border overflow-hidden hover-lift animate-fadeInUp stagger-${idx + 1}`}><div className="p-4 flex justify-between"><div><p className="text-sm font-semibold">{new Date(s.date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' })}</p><p className="text-xs text-slate-500 mt-0.5">{s.time} · {s.op}</p><div className="flex items-center gap-1 mt-2 text-xs text-slate-500"><div className="w-3.5 h-3.5">{I.user}</div>{s.guests} ospiti</div></div><div className="text-right"><p className="text-lg font-semibold">€{p.clean + p.linen}</p>{s.edit && <button onClick={() => setSvcModal(s)} className="text-[11px] text-slate-600 mt-1 hover:underline press-effect">Modifica</button>}</div></div><div className="px-4 py-2 bg-slate-50 border-t text-xs text-slate-500 flex justify-between"><span>Pulizia €{p.clean}</span><span>Dotazioni €{p.linen}</span></div></div>); })}</div>}

      {tab === 'settings' && <div className="p-4 space-y-3">
        {/* SEZIONE FOTO PROPRIETÀ */}
        <div className="bg-white rounded-xl border p-4 animate-fadeInUp">
          <h3 className="text-sm font-semibold mb-3">Foto Proprietà</h3>
          <div className="flex items-center gap-4">
            <div 
              className="w-20 h-20 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center cursor-pointer relative group border-2 border-dashed border-slate-300"
              onClick={() => fileInputRef.current?.click()}
            >
              {propertyImage ? (
                <>
                  <img src={propertyImage} alt="Proprietà" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-6 h-6 text-white">{I.camera}</div>
                  </div>
                </>
              ) : (
                <div className="w-8 h-8 text-slate-300">{I.camera}</div>
              )}
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-600 mb-2">
                {propertyImage ? 'Clicca per cambiare foto' : 'Aggiungi una foto della proprietà'}
              </p>
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg active:scale-95"
              >
                {propertyImage ? 'Cambia Foto' : 'Carica Foto'}
              </button>
              {propertyImage && (
                <button 
                  onClick={() => setPropertyImage(null)} 
                  className="ml-2 px-4 py-2 bg-red-50 text-red-600 text-xs font-medium rounded-lg active:scale-95"
                >
                  Rimuovi
                </button>
              )}
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl border p-4 animate-fadeInUp stagger-1"><h3 className="text-sm font-semibold mb-3">Info Proprietà</h3><div className="grid grid-cols-4 gap-2">{[{ i: 'users', v: '7', l: 'Ospiti' }, { i: 'bath', v: '2', l: 'Bagni' }, { i: 'clock', v: '15:00', l: 'In' }, { i: 'clock', v: '10:00', l: 'Out' }].map((x, i) => <div key={i} className="bg-slate-50 rounded-lg p-2 text-center hover:bg-slate-100 transition-colors"><div className="w-4 h-4 mx-auto mb-1 text-slate-400">{I[x.i]}</div><p className="text-sm font-semibold">{x.v}</p><p className="text-[8px] text-slate-500 uppercase">{x.l}</p></div>)}</div></div>
        <button onClick={() => setCfgModal(true)} className="w-full bg-white rounded-xl border p-4 flex items-center gap-4 hover-lift press-effect animate-fadeInUp stagger-2"><div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center"><div className="w-6 h-6 text-slate-600">{I.package}</div></div><div className="flex-1 text-left"><p className="text-sm font-medium">Configurazione Dotazioni</p><p className="text-[11px] text-slate-500">Letti, biancheria, kit, extra</p></div><div className="w-5 h-5 text-slate-400">{I.right}</div></button>
        <div className="bg-white rounded-xl border p-4 flex items-center justify-between hover-lift animate-fadeInUp stagger-3"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><div className="w-5 h-5 text-slate-600">{I.money}</div></div><p className="text-sm font-medium">Prezzo Pulizia</p></div><p className="text-xl font-semibold">€{prop.cleanPrice}</p></div>
      </div>}

      {cfgModal && <CfgModal cfgs={cfgs} setCfgs={setCfgs} onClose={() => setCfgModal(false)} />}
      {svcModal && <SvcModal svc={svcModal} cfgs={cfgs} cleanPrice={prop.cleanPrice} onClose={() => setSvcModal(null)} />}
    </div>
  );
}

// CONFIG MODAL
function CfgModal({ cfgs, setCfgs, onClose }) {
  const [g, setG] = useState(4);
  const [expBed, setExpBed] = useState(null);
  const [sec, setSec] = useState('beds');
  const c = cfgs[g];
  const cap = calcCap(c.beds);
  const warn = cap < g;

  const toggleBed = (id) => { const bed = beds.find(b => b.id === id); const sel = c.beds.includes(id); setCfgs(p => { const newB = sel ? p[g].beds.filter(x => x !== id) : [...p[g].beds, id]; const newL = { ...p[g].bl }; if (!sel) { newL[id] = {}; (linen[bed.type] || []).forEach(i => { newL[id][i.id] = i.d; }); } else delete newL[id]; return { ...p, [g]: { ...p[g], beds: newB, bl: newL } }; }); };
  const updL = (bid, iid, v) => setCfgs(p => ({ ...p, [g]: { ...p[g], bl: { ...p[g].bl, [bid]: { ...p[g].bl[bid], [iid]: v } } } }));
  const updB = (id, v) => setCfgs(p => ({ ...p, [g]: { ...p[g], ba: { ...p[g].ba, [id]: v } } }));
  const updK = (id, v) => setCfgs(p => ({ ...p, [g]: { ...p[g], ki: { ...p[g].ki, [id]: v } } }));
  const togE = (id) => setCfgs(p => ({ ...p, [g]: { ...p[g], ex: { ...p[g].ex, [id]: !p[g].ex[id] } } }));

  const bedP = calcBL(c.bl), bathP = calcArr(c.ba, bathItems), kitP = calcArr(c.ki, kitItems), exP = calcArr(c.ex, extras);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" style={{ animation: 'fadeIn 0.2s ease-out' }} onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl flex flex-col shadow-xl animate-scaleIn" style={{ maxHeight: 'calc(100vh - 32px)' }} onClick={e => e.stopPropagation()}>
        <div className="flex-shrink-0 px-5 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4"><div><h2 className="text-lg font-semibold">Configurazione Dotazioni</h2><p className="text-xs text-slate-500">Imposta per ogni numero di ospiti</p></div><button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"><div className="w-4 h-4 text-slate-500">{I.close}</div></button></div>
          <div className="flex gap-1.5">{[1, 2, 3, 4, 5, 6, 7].map(n => <button key={n} onClick={() => setG(n)} className={`flex-1 py-2.5 rounded-lg text-sm font-semibold ${g === n ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{n}</button>)}</div>
          {warn && <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2"><div className="w-5 h-5 text-amber-500">{I.warn}</div><div><p className="text-xs font-medium text-amber-800">Capacità insufficiente</p><p className="text-[11px] text-amber-600">Letti per {cap} posti, configurazione per {g} ospiti.</p></div></div>}
        </div>
        <div className="flex-1 overflow-y-auto">
          <Section title="Biancheria Letto" icon={I.bed} price={bedP} expanded={sec === 'beds'} onToggle={() => setSec(sec === 'beds' ? null : 'beds')}>
            <div className="space-y-2">{beds.map(bed => { const sel = c.beds.includes(bed.id); const bl = c.bl[bed.id] || {}; const items = linen[bed.type] || []; const bp = items.reduce((s, i) => s + i.p * (bl[i.id] || 0), 0); return (<div key={bed.id} className={`rounded-xl border-2 overflow-hidden ${sel ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50 opacity-50'}`}><div className="p-3 flex items-center gap-3 cursor-pointer" onClick={() => toggleBed(bed.id)}><div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${sel ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>{sel && <div className="w-3 h-3 text-white">{I.check}</div>}</div><div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center"><div className="w-5 h-5 text-slate-600">{bed.type === 'divano' ? I.sofa : I.bed}</div></div><div className="flex-1"><p className="text-sm font-medium">{bed.name}</p><p className="text-[10px] text-slate-500">{bed.loc} · {bed.cap}p</p></div>{sel && <><span className="text-sm font-semibold text-slate-600">€{bp}</span><button onClick={e => { e.stopPropagation(); setExpBed(expBed === bed.id ? null : bed.id); }} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center"><div className={`w-4 h-4 text-slate-500 transition-transform ${expBed === bed.id ? 'rotate-180' : ''}`}>{I.down}</div></button></>}</div>{sel && expBed === bed.id && <div className="px-3 pb-3 pt-2 border-t border-slate-100 bg-slate-50 space-y-2">{items.map(i => <div key={i.id} className="flex items-center justify-between"><span className="text-xs text-slate-600">{i.n} <span className="text-slate-400">€{i.p}</span></span><Cnt v={bl[i.id] || 0} onChange={v => updL(bed.id, i.id, v)} /></div>)}</div>}</div>); })}</div>
          </Section>
          <Section title="Biancheria Bagno" icon={I.towel} price={bathP} expanded={sec === 'bath'} onToggle={() => setSec(sec === 'bath' ? null : 'bath')}>
            <div className="space-y-2">{bathItems.map(i => <div key={i.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-2.5 border border-slate-200"><span className="text-xs text-slate-700">{i.n} <span className="text-slate-400">€{i.p}</span></span><Cnt v={c.ba[i.id] || 0} onChange={v => updB(i.id, v)} /></div>)}</div>
          </Section>
          <Section title="Kit Cortesia" icon={I.soap} price={kitP} expanded={sec === 'kit'} onToggle={() => setSec(sec === 'kit' ? null : 'kit')}>
            <div className="space-y-2">{kitItems.map(i => <div key={i.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-2.5 border border-slate-200"><span className="text-xs text-slate-700">{i.n} <span className="text-slate-400">€{i.p}</span></span><Cnt v={c.ki[i.id] || 0} onChange={v => updK(i.id, v)} /></div>)}</div>
          </Section>
          <Section title="Servizi Extra" icon={I.gift} price={exP} expanded={sec === 'extra'} onToggle={() => setSec(sec === 'extra' ? null : 'extra')}>
            <div className="space-y-2">{extras.map(i => <div key={i.id} onClick={() => togE(i.id)} className={`rounded-xl p-3 border-2 cursor-pointer ${c.ex[i.id] ? 'border-slate-400 bg-white' : 'border-slate-200 bg-slate-50'}`}><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${c.ex[i.id] ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>{c.ex[i.id] && <div className="w-3 h-3 text-white">{I.check}</div>}</div><div><p className="text-sm font-medium">{i.n}</p><p className="text-[10px] text-slate-500">{i.desc}</p></div></div><span className="text-sm font-semibold">€{i.p}</span></div></div>)}</div>
          </Section>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-slate-100 bg-slate-50"><div className="flex items-center justify-between mb-3"><span className="text-sm text-slate-600">Totale per <strong>{g}</strong> ospiti</span><span className="text-2xl font-bold">€{bedP + bathP + kitP + exP}</span></div><button onClick={onClose} className="w-full py-3 bg-slate-900 text-white text-sm font-semibold rounded-xl">Salva Configurazione</button></div>
      </div>
    </div>
  );
}

// SERVICE MODAL - EDIT DIRETTO
function SvcModal({ svc, cfgs, cleanPrice, onClose }) {
  const [g, setG] = useState(svc.guests);
  const [expBed, setExpBed] = useState(null);
  const [sec, setSec] = useState('beds');
  const std = cfgs[g];
  const [myBeds, setMyBeds] = useState(std.beds);
  const [myBL, setMyBL] = useState(JSON.parse(JSON.stringify(std.bl)));
  const [myBa, setMyBa] = useState({ ...std.ba });
  const [myKi, setMyKi] = useState({ ...std.ki });
  const [myEx, setMyEx] = useState({ ...std.ex });

  const handleG = (n) => { setG(n); setExpBed(null); const c = cfgs[n]; setMyBeds(c.beds); setMyBL(JSON.parse(JSON.stringify(c.bl))); setMyBa({ ...c.ba }); setMyKi({ ...c.ki }); setMyEx({ ...c.ex }); };
  const cap = calcCap(myBeds);
  const warn = cap < g;

  const toggleBed = (id) => { const bed = beds.find(b => b.id === id); const sel = myBeds.includes(id); if (sel) { setMyBeds(myBeds.filter(x => x !== id)); const nl = { ...myBL }; delete nl[id]; setMyBL(nl); } else { setMyBeds([...myBeds, id]); const nl = { ...myBL }; nl[id] = {}; (linen[bed.type] || []).forEach(i => { nl[id][i.id] = i.d; }); setMyBL(nl); } };
  const updL = (bid, iid, v) => setMyBL(p => ({ ...p, [bid]: { ...p[bid], [iid]: v } }));
  const updB = (id, v) => setMyBa(p => ({ ...p, [id]: v }));
  const updK = (id, v) => setMyKi(p => ({ ...p, [id]: v }));
  const togE = (id) => setMyEx(p => ({ ...p, [id]: !p[id] }));

  const bedP = calcBL(myBL), bathP = calcArr(myBa, bathItems), kitP = calcArr(myKi, kitItems), exP = calcArr(myEx, extras);
  const linenP = bedP + bathP + kitP + exP;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" style={{ animation: 'fadeIn 0.2s ease-out' }} onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl flex flex-col shadow-xl animate-scaleIn" style={{ maxHeight: 'calc(100vh - 32px)' }} onClick={e => e.stopPropagation()}>
        <div className="flex-shrink-0 px-5 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4"><div><h2 className="text-lg font-semibold">Modifica Servizio</h2><p className="text-xs text-slate-500">{new Date(svc.date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' })} · {svc.time}</p></div><button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"><div className="w-4 h-4 text-slate-500">{I.close}</div></button></div>
          <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3 border border-slate-200"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center"><div className="w-4 h-4 text-slate-600">{I.users}</div></div><span className="text-sm font-medium text-slate-700">Ospiti</span></div><div className="flex items-center gap-2"><button onClick={() => handleG(Math.max(1, g - 1))} className="w-8 h-8 rounded-lg border border-slate-300 bg-white flex items-center justify-center"><div className="w-4 h-4 text-slate-500">{I.minus}</div></button><span className="w-8 text-center text-xl font-bold">{g}</span><button onClick={() => handleG(Math.min(7, g + 1))} className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center"><div className="w-4 h-4 text-white">{I.plus}</div></button></div></div>
          {warn && <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2"><div className="w-5 h-5 text-amber-500">{I.warn}</div><p className="text-xs text-amber-700">Capacità letti ({cap}) inferiore agli ospiti ({g})</p></div>}
        </div>
        <div className="flex-1 overflow-y-auto">
          <Section title="Biancheria Letto" icon={I.bed} price={bedP} expanded={sec === 'beds'} onToggle={() => setSec(sec === 'beds' ? null : 'beds')}>
            <div className="space-y-2">{beds.map(bed => { const sel = myBeds.includes(bed.id); const bl = myBL[bed.id] || {}; const items = linen[bed.type] || []; const bp = items.reduce((s, i) => s + i.p * (bl[i.id] || 0), 0); return (<div key={bed.id} className={`rounded-xl border-2 overflow-hidden ${sel ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50 opacity-50'}`}><div className="p-3 flex items-center gap-3 cursor-pointer" onClick={() => toggleBed(bed.id)}><div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${sel ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>{sel && <div className="w-3 h-3 text-white">{I.check}</div>}</div><div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center"><div className="w-5 h-5 text-slate-600">{bed.type === 'divano' ? I.sofa : I.bed}</div></div><div className="flex-1"><p className="text-sm font-medium">{bed.name}</p><p className="text-[10px] text-slate-500">{bed.loc} · {bed.cap}p</p></div>{sel && <><span className="text-sm font-semibold text-slate-600">€{bp}</span><button onClick={e => { e.stopPropagation(); setExpBed(expBed === bed.id ? null : bed.id); }} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center"><div className={`w-4 h-4 text-slate-500 transition-transform ${expBed === bed.id ? 'rotate-180' : ''}`}>{I.down}</div></button></>}</div>{sel && expBed === bed.id && <div className="px-3 pb-3 pt-2 border-t border-slate-100 bg-slate-50 space-y-2">{items.map(i => <div key={i.id} className="flex items-center justify-between"><span className="text-xs text-slate-600">{i.n} <span className="text-slate-400">€{i.p}</span></span><Cnt v={bl[i.id] || 0} onChange={v => updL(bed.id, i.id, v)} /></div>)}</div>}</div>); })}</div>
          </Section>
          <Section title="Biancheria Bagno" icon={I.towel} price={bathP} expanded={sec === 'bath'} onToggle={() => setSec(sec === 'bath' ? null : 'bath')}>
            <div className="space-y-2">{bathItems.map(i => <div key={i.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-2.5 border border-slate-200"><span className="text-xs text-slate-700">{i.n} <span className="text-slate-400">€{i.p}</span></span><Cnt v={myBa[i.id] || 0} onChange={v => updB(i.id, v)} /></div>)}</div>
          </Section>
          <Section title="Kit Cortesia" icon={I.soap} price={kitP} expanded={sec === 'kit'} onToggle={() => setSec(sec === 'kit' ? null : 'kit')}>
            <div className="space-y-2">{kitItems.map(i => <div key={i.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-2.5 border border-slate-200"><span className="text-xs text-slate-700">{i.n} <span className="text-slate-400">€{i.p}</span></span><Cnt v={myKi[i.id] || 0} onChange={v => updK(i.id, v)} /></div>)}</div>
          </Section>
          <Section title="Servizi Extra" icon={I.gift} price={exP} expanded={sec === 'extra'} onToggle={() => setSec(sec === 'extra' ? null : 'extra')}>
            <div className="space-y-2">{extras.map(i => <div key={i.id} onClick={() => togE(i.id)} className={`rounded-xl p-3 border-2 cursor-pointer ${myEx[i.id] ? 'border-slate-400 bg-white' : 'border-slate-200 bg-slate-50'}`}><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${myEx[i.id] ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>{myEx[i.id] && <div className="w-3 h-3 text-white">{I.check}</div>}</div><div><p className="text-sm font-medium">{i.n}</p><p className="text-[10px] text-slate-500">{i.desc}</p></div></div><span className="text-sm font-semibold">€{i.p}</span></div></div>)}</div>
          </Section>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-slate-100 bg-slate-50">
          <div className="space-y-1 mb-3"><div className="flex justify-between text-xs text-slate-500"><span>Pulizia</span><span>€{cleanPrice}</span></div><div className="flex justify-between text-xs text-slate-500"><span>Dotazioni</span><span>€{linenP}</span></div><div className="flex justify-between pt-2 border-t border-slate-200"><span className="text-sm font-semibold">Totale</span><span className="text-xl font-bold">€{cleanPrice + linenP}</span></div></div>
          <button className="w-full py-3 bg-slate-900 text-white text-sm font-semibold rounded-xl">Salva Modifiche</button>
        </div>
      </div>
    </div>
  );
}
