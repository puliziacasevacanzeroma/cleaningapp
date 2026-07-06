/**
 * quoteEngine.selftest.ts — Batteria di test del motore preventivi
 * Esegui con:  npx tsx src/lib/quote/quoteEngine.selftest.ts
 * Tabelle v1 (06/07) e v2 (07/07) validate con Ariele. TUTTI i test devono passare
 * prima di qualsiasi deploy che tocchi il motore.
 */
import { calcolaCasa, calcolaBnb, verificaCopertura, calcolaCase, calcolaBnbV2, prezzoCamera, prezzoAreaComuneInLoco, prezzoAreaComuneDedicata, calcolaPassaggioSoggiorno } from './quoteEngine';
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
  check('Trilo 90mq, 4 letti, 2 bagni, terrazzo \u2192 70\u201380', r.min === 70 && r.max === 80, `${r.min}-${r.max}`);
}
{
  const r = calcolaCasa({ ...base, taglio: 'quadri', mq: 100, matrimoniali: 3, singoli: 1, bagni: 2, cucina: 'abit', esterno: 'terrazzo' });
  check('Quadri 100mq, 4 letti, 2 bagni, terrazzo \u2192 75\u201385', r.min === 75 && r.max === 85, `${r.min}-${r.max}`);
}
{
  const r = calcolaCasa({ ...base, taglio: 'quadri', mq: 120, matrimoniali: 3, singoli: 2, bagni: 3, cucina: 'abit', esterno: 'terrazzoGrande' });
  check('Attico 120mq, 5 letti, 3 bagni, terr.grande \u2192 85\u2013100', r.min === 85 && r.max === 100, `${r.min}-${r.max}`);
}
{
  const r = calcolaCasa({ ...base, taglio: 'quadri', mq: 150 });
  check('150mq \u2192 su misura', r.suMisura === true);
}

console.log('\n\u2500\u2500 PROMOZIONE TAGLIO DA MQ \u2500\u2500');
{
  const r = calcolaCasa({ ...base, taglio: 'mono', mq: 60 });
  check('Mono dichiarato ma 60mq \u2192 trattato bilo', r.taglioEffettivo === 'bilo', r.taglioEffettivo);
}
{
  const r = calcolaCasa({ ...base, taglio: 'trilo', mq: 78, matrimoniali: 2, singoli: 1 });
  check('Trilo 78mq \u2192 triloGrande (base 54)', r.taglioEffettivo === 'triloGrande' && r.puntuale === 54, `${r.taglioEffettivo}/${r.puntuale}`);
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
  check('Nomi unit\u00e0 nel dettaglio', r.unitaDettaglio[0]!.nome==='Casa Trastevere' && r.unitaDettaglio[1]!.nome==='Unit\u00e0 2', r.unitaDettaglio.map(u=>u.nome).join('/'));
  check('2 bilocali: 90 -5% = 85,50 \u2192 range 85\u2013100', r.puntuale===85.5 && r.min===85 && r.max===100 && r.scontoPercento===5, `${r.puntuale}/${r.min}-${r.max}/${r.scontoPercento}%`);
  const solo = calcolaCase([bilo]);
  check('1 unit\u00e0 sola: nessuno sconto', solo.scontoPercento===0 && solo.puntuale===45);
  const conGrande = calcolaCase([bilo, { ...base, taglio:'quadri', mq:150 }]);
  check('Una unit\u00e0 >120mq \u2192 tutto su misura', conGrande.suMisura===true);
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

console.log(`\n${'='.repeat(44)}\nRISULTATO: ${passati} passati, ${falliti} falliti\n${'='.repeat(44)}`);
if (falliti > 0) process.exit(1);
