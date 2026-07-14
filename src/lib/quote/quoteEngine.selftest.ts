/**
 * quoteEngine.selftest.ts — Batteria di test del motore preventivi
 * Esegui con:  npx tsx src/lib/quote/quoteEngine.selftest.ts
 * Tabelle v1 (06/07) e v2 (07/07) validate con Ariele. TUTTI i test devono passare
 * prima di qualsiasi deploy che tocchi il motore.
 */
import { ENGINE, calcolaCasa, calcolaBnb, verificaCopertura, calcolaCase, calcolaBnbV2, prezzoCamera, prezzoAreaComuneInLoco, prezzoAreaComuneDedicata, calcolaPassaggioSoggiorno, prezzoGiardino } from './quoteEngine';
const round2 = (v: number) => Math.round(v * 100) / 100;
import type { DatiCasa } from './quoteEngine';

let passati = 0, falliti = 0;
function check(nome: string, cond: boolean, dettaglio = '') {
  if (cond) { passati++; console.log('  \u2713 ' + nome); }
  else { falliti++; console.error('  \u2717 ' + nome + (dettaglio ? ' \u2014 ' + dettaglio : '')); }
}

const base: Omit<DatiCasa, 'taglio' | 'mq'> = {
  matrimoniali: 1, singoli: 0, divani: 0, bagni: 1,
  cucina: 'angolo', esterno: 'no', vuoleBiancheria: false, vuoleKit: false, ospiti: 2,
};

console.log('\n\u2500\u2500 TABELLA PREZZI CONCORDATA \u2500\u2500');
{
  const r = calcolaCasa({ ...base, taglio: 'mono', mq: 40 });
  check('Monolocale 40mq, 1 letto, 1 bagno \u2192 40\u201345', r.min === 40 && r.max === 45, `${r.min}-${r.max}`);
}
{
  const r = calcolaCasa({ ...base, taglio: 'bilo', mq: 55, matrimoniali: 1, singoli: 1, cucina: 'sep', esterno: 'balcone' });
  check('Bilocale 55mq, 2 letti, cucina sep, balcone \u2192 50\u201360', r.min === 50 && r.max === 60, `${r.min}-${r.max}`);
}
{
  const r = calcolaCasa({ ...base, taglio: 'trilo', mq: 65, matrimoniali: 2, singoli: 1, cucina: 'sep' });
  check('CASO REALE: trilo 65mq, 3 letti, cucina sep \u2192 55\u201365', r.min === 55 && r.max === 65, `${r.min}-${r.max}`);
}
{
  const r = calcolaCasa({ ...base, taglio: 'trilo', mq: 80, matrimoniali: 2, singoli: 1, bagni: 2, cucina: 'abit' });
  check('Trilo 80mq, 3 letti, 2 bagni, abit \u2192 60\u201375', r.min === 60 && r.max === 75, `${r.min}-${r.max}`);
}
{
  const r = calcolaCasa({ ...base, taglio: 'trilo', mq: 90, matrimoniali: 2, singoli: 2, bagni: 2, cucina: 'sep', esterno: 'terrazzo' });
  check('Trilo 90mq, 4 letti, 2 bagni, terrazzo \u2192 70\u201385 (v4: +15mq oltre soglia)', r.min === 70 && r.max === 85, `${r.min}-${r.max}`);
}
{
  const r = calcolaCasa({ ...base, taglio: 'quadri', mq: 100, matrimoniali: 3, singoli: 1, bagni: 2, cucina: 'abit', esterno: 'terrazzo' });
  check('Quadri 100mq, 4 letti, 2 bagni, terrazzo \u2192 75\u201385', r.min === 75 && r.max === 85, `${r.min}-${r.max}`);
}
{
  const r = calcolaCasa({ ...base, taglio: 'quadri', mq: 120, matrimoniali: 3, singoli: 2, bagni: 3, cucina: 'abit', esterno: 'terrazzoGrande' });
  check('Attico 120mq, 5 letti, 3 bagni, terr.grande \u2192 90\u2013105 (v4: +20mq oltre soglia)', r.min === 90 && r.max === 105, `${r.min}-${r.max}`);
}
{
  const r = calcolaCasa({ ...base, taglio: 'quadri', mq: 150 });
  check('150mq \u2192 CALCOLATO (v4: tetto a 400)', r.suMisura === false && r.puntuale === 75, String(r.puntuale));
}

console.log('\n\u2500\u2500 v4: MQ NEL PREZZO \u2500\u2500');
{
  // sotto la soglia inclusa: i mq NON pesano
  let r = calcolaCasa({ ...base, taglio: 'trilo', mq: 65, matrimoniali: 2, singoli: 1 });
  const r75 = calcolaCasa({ ...base, taglio: 'trilo', mq: 75, matrimoniali: 2, singoli: 1 });
  check('Trilo 65mq = Trilo 75mq (entro soglia)', r.puntuale === r75.puntuale, `${r.puntuale} vs ${r75.puntuale}`);
  // oltre la soglia: +0,30 €/mq
  const r100 = calcolaCasa({ ...base, taglio: 'trilo', mq: 100, matrimoniali: 2, singoli: 1 });
  check('Trilo 100mq = 75mq + 25*0,30 = +7,50', r100.puntuale === round2(r75.puntuale + 7.5), `${r100.puntuale}`);
  // niente più promozioni: il taglio resta quello dichiarato
  check('Taglio dichiarato = taglio effettivo (no promozioni)', r100.taglioEffettivo === 'trilo', String(r100.taglioEffettivo));
  // taglio 'grande': base 60, 120mq inclusi, correttivi tabella grande
  const g160 = calcolaCasa({ ...base, taglio: 'grande', mq: 160, matrimoniali: 4, singoli: 2, bagni: 3, cucina: 'abit' });
  // 60 + 40*0.30=12 + 2 letti extra*2=4 + 2 bagni extra*5=10 + abit 5 = 91
  check('Casa grande 160mq 6letti 3bagni abit = 91 (ancora Ariele: 90-100)', g160.puntuale === 91, String(g160.puntuale));
  check('Casa grande 160mq range 90-105', g160.min === 90 && g160.max === 105, `${g160.min}-${g160.max}`);
  // fino a 400 il calcolo esiste
  const g400 = calcolaCasa({ ...base, taglio: 'grande', mq: 400 });
  check('400mq: ancora calcolato', g400.suMisura === false);
  const g401 = calcolaCasa({ ...base, taglio: 'grande', mq: 401 });
  check('401mq: su misura', g401.suMisura === true);
  // villa: sempre su misura, anche piccola
  const v = calcolaCasa({ ...base, taglio: 'villa', mq: 180 });
  check('Villa: SEMPRE su misura', v.suMisura === true && v.taglioEffettivo === 'villa');
  // taglio sconosciuto (config sporca): mai NaN
  const strano = calcolaCasa({ ...base, taglio: 'attico' as never, mq: 80 });
  check('Taglio sconosciuto: su misura, mai NaN', strano.suMisura === true && Number.isFinite(strano.puntuale));
}

console.log('\n\u2500\u2500 v4: GIARDINO \u2500\u2500');
{
  const b2 = { ...base, taglio: 'bilo' as const, mq: 55, matrimoniali: 1, singoli: 1 };
  const no = calcolaCasa({ ...b2, esterno: 'no' });
  const gp = calcolaCasa({ ...b2, esterno: 'giardino', giardinoMq: 15 });
  const gm = calcolaCasa({ ...b2, esterno: 'giardino', giardinoMq: 40 });
  const gg = calcolaCasa({ ...b2, esterno: 'giardino', giardinoMq: 100 });
  check('Giardino piccolo (15mq) = +15', gp.puntuale === no.puntuale + 15, `${gp.puntuale}`);
  check('Giardino medio (40mq) = +25', gm.puntuale === no.puntuale + 25, `${gm.puntuale}`);
  check('Giardino grande (100mq) = +50', gg.puntuale === no.puntuale + 50, `${gg.puntuale}`);
  check('Fascia esatta: 20mq \u2192 piccolo, 60mq \u2192 medio', prezzoGiardino(20) === 15 && prezzoGiardino(60) === 25);
  const gz = calcolaCasa({ ...b2, esterno: 'giardino', giardinoMq: 0 });
  check('Giardino 0mq: nessun supplemento (input sporco)', gz.puntuale === no.puntuale);
}
{
  const r = calcolaCasa({ ...base, taglio: 'trilo', mq: 78 });
  check('Trilo 78mq resta trilo: 52 + 3mq*0,30 = 52,90 (v4: niente promozioni)', r.taglioEffettivo === 'trilo' && r.puntuale === 52.9, `${r.taglioEffettivo}/${r.puntuale}`);
}

console.log('\n\u2500\u2500 BIANCHERIA E KIT \u2500\u2500');
{
  const r = calcolaCasa({ ...base, taglio: 'trilo', mq: 65, matrimoniali: 2, singoli: 1, cucina: 'sep', vuoleBiancheria: true, ospiti: 5 });
  check('Biancheria 2 matr + 1 sing, 5 ospiti, 1 bagno = \u20ac37,00', r.biancheria === 37.00, String(r.biancheria));
}
{
  const r = calcolaCasa({ ...base, taglio: 'bilo', mq: 50, vuoleKit: true, ospiti: 4 });
  check('Kit 4 ospiti = \u20ac5,04', r.kit === 5.04, String(r.kit));
}

console.log('\n\u2500\u2500 B&B \u2500\u2500');
{
  const r = calcolaBnb({ singole: 2, doppie: 2, vuoleKit: false });
  check('B&B 2 singole + 2 doppie = \u20ac106 puntuale (105\u2013120)', r.puntuale === 106 && r.min === 105 && r.max === 120, `${r.puntuale}/${r.min}-${r.max}`);
}
{
  const r = calcolaBnb({ singole: 1, doppie: 2, vuoleKit: true });
  check('B&B kit: 1 sing + 2 doppie (5 ospiti) = \u20ac6,30', r.kit === 6.30, String(r.kit));
}


console.log('\n\u2500\u2500 v2: CAMERE B&B A PERSONE \u2500\u2500');
check('1 persona = \u20ac25', prezzoCamera(1) === 25);
check('2 persone = \u20ac28', prezzoCamera(2) === 28);
check('3 persone (tripla) = \u20ac31', prezzoCamera(3) === 31);
check('4 persone (quadrupla) = \u20ac34', prezzoCamera(4) === 34);

console.log('\n\u2500\u2500 v2: AREE COMUNI \u2500\u2500');
check('In loco 15mq = \u20ac8', prezzoAreaComuneInLoco(15) === 8);
check('In loco 30mq = \u20ac13', prezzoAreaComuneInLoco(30) === 13);
check('Dedicata 15mq = \u20ac20', prezzoAreaComuneDedicata(15) === 20);
check('Dedicata 30mq = \u20ac28', prezzoAreaComuneDedicata(30) === 28, String(prezzoAreaComuneDedicata(30)));
check('Dedicata 45mq = \u20ac40', prezzoAreaComuneDedicata(45) === 40);

console.log('\n\u2500\u2500 v2: B&B COMPLETO \u2500\u2500');
{
  const r = calcolaBnbV2({ camere: [{persone:2},{persone:2},{persone:3}], frequenza:'giornaliera', areaComune:'dedicata', areaComuneMq:30, vuoleKit:true });
  check('3 camere (2+2+3p) checkout = \u20ac87 (85\u2013100)', r.puntuale===87 && r.min===85 && r.max===100, `${r.puntuale}/${r.min}-${r.max}`);
  check('Rifacimento giornaliero 3 letti = \u20ac40/uscita', r.rifacimentoGiornaliero===40, String(r.rifacimentoGiornaliero));
  check('Area dedicata 30mq = \u20ac28/uscita', r.areaComuneImporto===28);
  check('Kit 7 ospiti = \u20ac8,82', r.kit===8.82, String(r.kit));
  check('Dettaglio camere: 28+28+31', r.camereDettaglio.map(c=>c.prezzo).join('+')==='28+28+31', r.camereDettaglio.map(c=>c.prezzo).join('+'));
  check('Etichetta tripla', r.camereDettaglio[2]!.etichetta==='Tripla');
}

console.log('\n\u2500\u2500 v2: PI\u00d9 CASE VACANZE \u2500\u2500');
{
  const bilo: DatiCasa = { ...base, taglio:'bilo', mq:55, matrimoniali:1, singoli:1 };
  const r = calcolaCase([{ ...bilo, nome:'Casa Trastevere' }, bilo]);
  check('Nomi casa nel dettaglio', r.unitaDettaglio[0]!.nome==='Casa Trastevere' && r.unitaDettaglio[1]!.nome==='Casa 2', r.unitaDettaglio.map(u=>u.nome).join('/'));
  check('2 bilocali: 90 -5% = 85,50 \u2192 range 85\u2013100', r.puntuale===85.5 && r.min===85 && r.max===100 && r.scontoPercento===5, `${r.puntuale}/${r.min}-${r.max}/${r.scontoPercento}%`);
  // v4: lo sconto multi-casa deve comparire ANCHE nel prezzo della singola casa
  // (bilo puntuale 45 -> 42,75 scontato -> range 40-50; senza sconto era 45-50)
  check('Sconto -5% applicato al prezzo di OGNI casa', r.unitaDettaglio[0]!.min===40 && r.unitaDettaglio[0]!.max===50, `${r.unitaDettaglio[0]!.min}-${r.unitaDettaglio[0]!.max}`);
  check('Somma per-casa coerente col totale scontato', r.puntuale===85.5);
  const uno = calcolaCase([{ ...bilo, nome:'Unica' }]);
  check('1 sola casa: prezzo pieno, nessuno sconto sulla card', uno.unitaDettaglio[0]!.min===45 && uno.unitaDettaglio[0]!.max===50, `${uno.unitaDettaglio[0]!.min}-${uno.unitaDettaglio[0]!.max}`);
  const solo = calcolaCase([bilo]);
  check('1 unit\u00e0 sola: nessuno sconto', solo.scontoPercento===0 && solo.puntuale===45);
  const conGrande = calcolaCase([bilo, { ...base, taglio:'grande', mq:450 }]);
  check('Una casa oltre il tetto (450mq) \u2192 tutto su misura', conGrande.suMisura===true);
  const conVilla = calcolaCase([bilo, { ...base, taglio:'villa', mq:200 }]);
  check('Una villa nel gruppo \u2192 tutto su misura (non dovrebbe accadere: UI la esclude)', conVilla.suMisura===true);
}

console.log('\n\u2500\u2500 v2: PASSAGGIO INFRA-SOGGIORNO \u2500\u2500');
{
  const p = calcolaPassaggioSoggiorno({ ...base, taglio:'bilo', mq:55, matrimoniali:1, singoli:1, vuoleKit:true, ospiti:3 });
  check('Bilo 2 letti + kit 3 ospiti = 10+20+3,78 = \u20ac33,78', p.totale===33.78, String(p.totale));
  const p2 = calcolaPassaggioSoggiorno({ ...base, taglio:'trilo', mq:65, matrimoniali:2, singoli:1, vuoleBiancheria:true, ospiti:5 });
  check('Trilo 3 letti + biancheria 37 = 10+30+37 = \u20ac77', p2.totale===77, String(p2.totale));
}

console.log('\n\u2500\u2500 COPERTURA \u2500\u2500');
check('CAP coperto', verificaCopertura('00165', ['00165', '00186']) === 'coperta');
check('CAP non in lista \u2192 in_valutazione', verificaCopertura('00118', ['00165']) === 'in_valutazione');
check('CAP con spazi', verificaCopertura(' 00165 ', ['00165']) === 'coperta');


// ────────────── v3: iniezione parametri (config Firestore) ──────────────
console.log('\nv3 — parametri iniettabili:');
{
  const casaTest: DatiCasa = { ...base, taglio: 'bilo', mq: 50 };
  const conDefault = calcolaCasa(casaTest);
  const P2 = JSON.parse(JSON.stringify(ENGINE)) as typeof ENGINE;
  P2.basi.bilo = 55; // 45 → 55
  const conOverride = calcolaCasa(casaTest, P2);
  check('override base bilo sposta il puntuale di +10', conOverride.puntuale === conDefault.puntuale + 10);
  check('senza override i default restano intatti', calcolaCasa(casaTest).puntuale === conDefault.puntuale);

  const P3 = JSON.parse(JSON.stringify(ENGINE)) as typeof ENGINE;
  P3.bnb.personaExtra = 5;
  check('override personaExtra cambia la tripla', prezzoCamera(3, P3) === ENGINE.bnb.doppia + 5);
  check('prezzoCamera default invariato', prezzoCamera(3) === ENGINE.bnb.doppia + ENGINE.bnb.personaExtra);

  const P4 = JSON.parse(JSON.stringify(ENGINE)) as typeof ENGINE;
  P4.scontoMultiUnita.percento = 10;
  const dueCase: DatiCasa[] = [{ ...base, taglio: 'bilo', mq: 50 }, { ...base, taglio: 'bilo', mq: 50 }];
  const mDefault = calcolaCase(dueCase);
  const mOverride = calcolaCase(dueCase, P4);
  check('sconto multi override 10% applicato', mOverride.scontoPercento === 10 && mOverride.puntuale < mDefault.puntuale);
}

console.log(`\n${'='.repeat(44)}\nRISULTATO: ${passati} passati, ${falliti} falliti\n${'='.repeat(44)}`);
if (falliti > 0) process.exit(1);
