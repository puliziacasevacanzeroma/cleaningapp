/**
 * quoteEngine.selftest.ts — Batteria di test del motore preventivi
 * Esegui con:  npx tsx src/lib/quote/quoteEngine.selftest.ts
 *
 * v6 (14/07/2026) — MODELLO ADDITIVO. Oltre alla tabella prezzi, i test
 * verificano ESAUSTIVAMENTE gli invarianti che rendono impossibili le anomalie:
 *   - più mq / più letti / più bagni => il prezzo non cala MAI
 *   - cucina ed esterni ordinati
 *   - stessa casa, taglio dichiarato diverso => stesso prezzo
 * TUTTI i test devono passare prima di qualsiasi deploy che tocchi il motore.
 */
import {
  ENGINE, calcolaCasa, calcolaBnb, verificaCopertura, calcolaCase, calcolaBnbV2,
  prezzoCamera, prezzoAreaComuneInLoco, prezzoAreaComuneDedicata, calcolaPassaggioSoggiorno,
  prezzoGiardino, prezzoPuliziaCasa,
} from './quoteEngine';
import type { DatiCasa, Taglio, TipoCucina, TipoEsterno } from './quoteEngine';

let passati = 0, falliti = 0;
function check(nome: string, cond: boolean, dettaglio = '') {
  if (cond) { passati++; console.log('  \u2713 ' + nome); }
  else { falliti++; console.error('  \u2717 ' + nome + (dettaglio ? ' \u2014 ' + dettaglio : '')); }
}

const base: Omit<DatiCasa, 'taglio' | 'mq'> = {
  matrimoniali: 1, singoli: 0, divani: 0, bagni: 1,
  cucina: 'angolo', esterno: 'no',
  vuoleBiancheria: false, vuoleKit: false, ospiti: 2,
};

// ───────────────────────── TABELLA PREZZI (ancore validate) ─────────────────────────
console.log('\n\u2500\u2500 TABELLA PREZZI (ancore validate con Ariele 14/07/2026) \u2500\u2500');
{
  const r = calcolaCasa({ ...base, taglio: 'mono', mq: 40 });
  check('Mono 40mq, 1 letto, 1 bagno \u2192 40\u201345', r.min === 40 && r.max === 45, `${r.min}-${r.max}`);
}
{
  const r = calcolaCasa({ ...base, taglio: 'bilo', mq: 55, matrimoniali: 1, singoli: 1, cucina: 'sep', esterno: 'balcone' });
  check('Bilo 55mq, 2 letti, cucina sep, balcone \u2192 50\u201360', r.min === 50 && r.max === 60, `${r.min}-${r.max}`);
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
  check('Attico 120mq, 5 letti, 3 bagni, terr.grande \u2192 90\u2013105', r.min === 90 && r.max === 105, `${r.min}-${r.max}`);
}
{
  const r = calcolaCasa({ ...base, taglio: 'grande', mq: 160, matrimoniali: 4, singoli: 2, bagni: 3, cucina: 'abit' });
  check('Casa grande 160mq, 6 letti, 3 bagni \u2192 95\u2013110', r.min === 95 && r.max === 110, `${r.min}-${r.max}`);
}
{
  const r = calcolaCasa({ ...base, taglio: 'grande', mq: 300, matrimoniali: 5, singoli: 3, bagni: 4, cucina: 'abit' });
  check('Casa 300mq, 8 letti, 4 bagni \u2192 145\u2013170', r.min === 145 && r.max === 170, `${r.min}-${r.max}`);
}
{
  const r = calcolaCasa({ ...base, taglio: 'mono', mq: 15, matrimoniali: 1, bagni: 1 });
  check('Prezzo minimo: un buco da 15mq non scende sotto 40\u20ac', r.puntuale === 40, String(r.puntuale));
}

// ───────────────────────── INVARIANTI ANTI-ANOMALIA (esaustivi) ─────────────────────────
console.log('\n\u2500\u2500 v6: INVARIANTI \u2014 LE ANOMALIE DEVONO ESSERE IMPOSSIBILI \u2500\u2500');
{
  const TAGLI: Taglio[] = ['mono', 'bilo', 'trilo', 'quadri', 'grande'];
  const CUCINE: TipoCucina[] = ['angolo', 'sep', 'abit'];
  const ESTERNI: TipoEsterno[] = ['no', 'balcone', 'terrazzo', 'terrazzoGrande'];
  const d = (mq: number, letti: number, bagni: number, cucina: TipoCucina = 'sep', esterno: TipoEsterno = 'no'): DatiCasa =>
    ({ ...base, taglio: 'mono', mq, matrimoniali: letti, singoli: 0, divani: 0, bagni, cucina, esterno });

  // 1) più mq → mai meno caro
  let viol = 0, es = '';
  for (let letti = 1; letti <= 10; letti++) {
    for (let bagni = 1; bagni <= 5; bagni++) {
      for (const cu of CUCINE) {
        let prec = 0;
        for (let mq = 15; mq <= 400; mq++) {
          const p = prezzoPuliziaCasa(d(mq, letti, bagni, cu));
          if (p < prec - 0.001) { viol++; if (!es) es = `${mq}mq ${letti}letti: ${p} < ${prec}`; }
          prec = p;
        }
      }
    }
  }
  check('Più mq \u2192 il prezzo non cala MAI (15\u2192400mq \u00d7 letti \u00d7 bagni \u00d7 cucine)', viol === 0, `${viol} violazioni, es: ${es}`);

  // 2) più letti → mai meno caro
  viol = 0; es = '';
  for (let mq = 15; mq <= 400; mq += 5) {
    for (let bagni = 1; bagni <= 5; bagni++) {
      let prec = 0;
      for (let letti = 0; letti <= 12; letti++) {
        const p = prezzoPuliziaCasa(d(mq, letti, bagni));
        if (p < prec - 0.001) { viol++; if (!es) es = `${mq}mq ${letti}letti`; }
        prec = p;
      }
    }
  }
  check('Più letti \u2192 il prezzo non cala MAI', viol === 0, `${viol} violazioni, es: ${es}`);

  // 3) più bagni → mai meno caro
  viol = 0;
  for (let mq = 15; mq <= 400; mq += 5) {
    for (let letti = 1; letti <= 10; letti++) {
      let prec = 0;
      for (let bagni = 1; bagni <= 6; bagni++) {
        const p = prezzoPuliziaCasa(d(mq, letti, bagni));
        if (p < prec - 0.001) viol++;
        prec = p;
      }
    }
  }
  check('Più bagni \u2192 il prezzo non cala MAI', viol === 0, `${viol} violazioni`);

  // 4) STESSA CASA, TAGLIO DIVERSO → STESSO PREZZO (il bug di Ariele: bilo 93mq > quadri 93mq)
  viol = 0; es = '';
  for (let mq = 15; mq <= 400; mq += 1) {
    for (let letti = 1; letti <= 8; letti++) {
      const prezzi = TAGLI.map((t) => calcolaCasa({ ...d(mq, letti, 2), taglio: t }).puntuale);
      const tutti = prezzi.every((p) => Math.abs(p - prezzi[0]!) < 0.001);
      if (!tutti) { viol++; if (!es) es = `${mq}mq ${letti}letti: ${prezzi.join('/')}`; }
    }
  }
  check('Stessa casa, taglio dichiarato diverso \u2192 STESSO prezzo', viol === 0, `${viol} violazioni, es: ${es}`);

  // 5) cucina ed esterni ordinati
  viol = 0;
  for (let mq = 15; mq <= 400; mq += 5) {
    const a = prezzoPuliziaCasa(d(mq, 3, 2, 'angolo'));
    const s = prezzoPuliziaCasa(d(mq, 3, 2, 'sep'));
    const ab = prezzoPuliziaCasa(d(mq, 3, 2, 'abit'));
    if (!(a <= s && s <= ab)) viol++;
    const e0 = prezzoPuliziaCasa(d(mq, 3, 2, 'sep', 'no'));
    const e1 = prezzoPuliziaCasa(d(mq, 3, 2, 'sep', 'balcone'));
    const e2 = prezzoPuliziaCasa(d(mq, 3, 2, 'sep', 'terrazzo'));
    const e3 = prezzoPuliziaCasa(d(mq, 3, 2, 'sep', 'terrazzoGrande'));
    if (!(e0 <= e1 && e1 <= e2 && e2 <= e3)) viol++;
  }
  check('Cucina (angolo\u2264sep\u2264abit) ed esterni ordinati', viol === 0, `${viol} violazioni`);
  void ESTERNI;

  // 6) il caso reale trovato in produzione
  const bilo93 = calcolaCasa({ ...base, taglio: 'bilo', mq: 93, matrimoniali: 3, singoli: 2, bagni: 2 });
  const quadri93 = calcolaCasa({ ...base, taglio: 'quadri', mq: 93, matrimoniali: 3, singoli: 2, bagni: 2 });
  check('CASO REALE: bilo 93mq = quadri 93mq (stessa casa, stesso prezzo)',
    bilo93.puntuale === quadri93.puntuale, `${bilo93.puntuale} vs ${quadri93.puntuale}`);

  // 7) il problema di partenza: i mq devono pesare
  const t60 = calcolaCasa({ ...base, taglio: 'trilo', mq: 60, matrimoniali: 2, singoli: 1, cucina: 'sep' });
  const t100 = calcolaCasa({ ...base, taglio: 'trilo', mq: 100, matrimoniali: 2, singoli: 1, cucina: 'sep' });
  check('Trilo 100mq costa più di un trilo 60mq (+11,20)', round(t100.puntuale - t60.puntuale) === 11.2, `${t60.puntuale} \u2192 ${t100.puntuale}`);
}
function round(v: number) { return Math.round(v * 100) / 100; }

// ───────────────────────── TETTO, VILLA, GIARDINO ─────────────────────────
console.log('\n\u2500\u2500 TETTO 400mq, VILLA, GIARDINO \u2500\u2500');
{
  const g400 = calcolaCasa({ ...base, taglio: 'grande', mq: 400 });
  check('400mq: ancora calcolato', g400.suMisura === false);
  const g401 = calcolaCasa({ ...base, taglio: 'grande', mq: 401 });
  check('401mq: su misura (lead + email "ti contattiamo")', g401.suMisura === true);
  const v = calcolaCasa({ ...base, taglio: 'villa', mq: 180 });
  check('Villa: SEMPRE su misura, zero prezzi', v.suMisura === true && v.min === 0 && v.max === 0);

  const b2: DatiCasa = { ...base, taglio: 'bilo', mq: 55, matrimoniali: 1, singoli: 1 };
  const no = calcolaCasa(b2);
  check('Giardino piccolo (15mq) = +15', calcolaCasa({ ...b2, esterno: 'giardino', giardinoMq: 15 }).puntuale === round(no.puntuale + 15));
  check('Giardino medio (40mq) = +25', calcolaCasa({ ...b2, esterno: 'giardino', giardinoMq: 40 }).puntuale === round(no.puntuale + 25));
  check('Giardino grande (100mq) = +50', calcolaCasa({ ...b2, esterno: 'giardino', giardinoMq: 100 }).puntuale === round(no.puntuale + 50));
  check('Fasce esatte: 20mq \u2192 piccolo, 60mq \u2192 medio', prezzoGiardino(20) === 15 && prezzoGiardino(60) === 25);
  check('Giardino 0mq: nessun supplemento (input sporco)', calcolaCasa({ ...b2, esterno: 'giardino', giardinoMq: 0 }).puntuale === no.puntuale);
}

// ───────────────────────── BIANCHERIA E KIT ─────────────────────────
console.log('\n\u2500\u2500 BIANCHERIA E KIT \u2500\u2500');
{
  const r = calcolaCasa({ ...base, taglio: 'trilo', mq: 65, matrimoniali: 2, singoli: 1, cucina: 'sep', vuoleBiancheria: true, ospiti: 5 });
  const atteso = round(2 * 5.60 + 1 * 4.30 + 5 * 3.80 + 1 * 1.00 + 1.50);
  check('Biancheria 2 matr + 1 singolo + 5 ospiti', r.biancheria === atteso, `${r.biancheria} vs ${atteso}`);
}
{
  const r = calcolaCasa({ ...base, taglio: 'bilo', mq: 50, vuoleKit: true, ospiti: 4 });
  check('Kit 4 ospiti = \u20ac5,04', r.kit === 5.04, String(r.kit));
}

// ───────────────────────── B&B ─────────────────────────
console.log('\n\u2500\u2500 B&B \u2500\u2500');
{
  check('Camera singola = 25', prezzoCamera(1) === 25);
  check('Camera doppia = 28', prezzoCamera(2) === 28);
  check('Tripla = 31', prezzoCamera(3) === 31);
  check('Quadrupla = 34', prezzoCamera(4) === 34);
  const r = calcolaBnbV2({ camere: [{ persone: 2 }, { persone: 2 }, { persone: 3 }], frequenza: 'giornaliera', areaComune: 'dedicata', areaComuneMq: 30, vuoleKit: true });
  check('3 camere (2+2+3) checkout = \u20ac87 (85\u2013100)', r.puntuale === 87 && r.min === 85 && r.max === 100, `${r.puntuale}/${r.min}-${r.max}`);
  check('Rifacimento giornaliero 3 camere = \u20ac40/uscita', r.rifacimentoGiornaliero === 40);
  check('Area dedicata 30mq = \u20ac28', r.areaComuneImporto === 28, String(r.areaComuneImporto));
  check('Kit 7 ospiti = \u20ac8,82', r.kit === 8.82, String(r.kit));
  check('Etichetta tripla', r.camereDettaglio[2]!.etichetta === 'Tripla');
}
{
  check('Area in loco 15mq = \u20ac8', prezzoAreaComuneInLoco(15) === 8);
  check('Area in loco 30mq = \u20ac13', prezzoAreaComuneInLoco(30) === 13);
  check('Dedicata 45mq = \u20ac40', prezzoAreaComuneDedicata(45) === 40);
  const b = calcolaBnb({ singole: 2, doppie: 1, vuoleKit: false });
  check('calcolaBnb legacy: 2 singole + 1 doppia = 78', b.puntuale === 78, String(b.puntuale));
}

// ───────────────────────── PIÙ CASE ─────────────────────────
console.log('\n\u2500\u2500 PI\u00d9 CASE VACANZE \u2500\u2500');
{
  const bilo: DatiCasa = { ...base, taglio: 'bilo', mq: 55, matrimoniali: 1, singoli: 1 };
  const r = calcolaCase([{ ...bilo, nome: 'Casa Trastevere' }, bilo]);
  const singolo = calcolaCasa(bilo).puntuale;
  check('Nomi casa nel dettaglio', r.unitaDettaglio[0]!.nome === 'Casa Trastevere' && r.unitaDettaglio[1]!.nome === 'Casa 2');
  check('2 case: totale = somma -5%', r.puntuale === round(singolo * 2 * 0.95), String(r.puntuale));
  check('Sconto -5% visibile anche sul prezzo di OGNI casa',
    r.unitaDettaglio[0]!.min === Math.floor((singolo * 0.95) / 5) * 5, `${r.unitaDettaglio[0]!.min}`);
  const solo = calcolaCase([bilo]);
  check('1 sola casa: nessuno sconto, prezzo pieno', solo.scontoPercento === 0 && solo.unitaDettaglio[0]!.min === calcolaCasa(bilo).min);
  const conGrande = calcolaCase([bilo, { ...base, taglio: 'grande', mq: 450 }]);
  check('Una casa oltre il tetto \u2192 tutto su misura', conGrande.suMisura === true);
  const conVilla = calcolaCase([bilo, { ...base, taglio: 'villa', mq: 200 }]);
  check('Una villa nel gruppo \u2192 tutto su misura (la UI la esclude, ma il motore regge)', conVilla.suMisura === true);
}

// ───────────────────────── PASSAGGIO INFRA-SOGGIORNO ─────────────────────────
console.log('\n\u2500\u2500 PASSAGGIO INFRA-SOGGIORNO \u2500\u2500');
{
  const p = calcolaPassaggioSoggiorno({ ...base, taglio: 'bilo', mq: 55, matrimoniali: 1, singoli: 1, vuoleKit: true, ospiti: 3 });
  check('Bilo 2 letti + kit 3 ospiti = 10+20+3,78 = \u20ac33,78', p.totale === 33.78, String(p.totale));
}

// ───────────────────────── COPERTURA ─────────────────────────
console.log('\n\u2500\u2500 COPERTURA \u2500\u2500');
{
  const caps = ['00165', '00185'];
  check('CAP coperto', verificaCopertura('00165', caps) === 'coperta');
  check('CAP non in lista \u2192 in_valutazione', verificaCopertura('00199', caps) === 'in_valutazione');
  check('CAP con spazi', verificaCopertura(' 00185 ', caps) === 'coperta');
}

// ───────────────────────── PARAMETRI INIETTABILI ─────────────────────────
console.log('\n\u2500\u2500 PARAMETRI INIETTABILI (pannello admin) \u2500\u2500');
{
  const P = JSON.parse(JSON.stringify(ENGINE)) as typeof ENGINE;
  P.casa.euroMq = 0.50;
  const conOverride = calcolaCasa({ ...base, taglio: 'trilo', mq: 100, matrimoniali: 2, singoli: 1, cucina: 'sep' }, P);
  const senza = calcolaCasa({ ...base, taglio: 'trilo', mq: 100, matrimoniali: 2, singoli: 1, cucina: 'sep' });
  check('Override euroMq 0,50 alza il prezzo di 100*(0,50-0,28)=22', round(conOverride.puntuale - senza.puntuale) === 22, `${senza.puntuale} \u2192 ${conOverride.puntuale}`);
  check('Senza override i default restano intatti', ENGINE.casa.euroMq === 0.28);
  const P2 = JSON.parse(JSON.stringify(ENGINE)) as typeof ENGINE;
  P2.casa.minimo = 60;
  check('Override prezzo minimo', calcolaCasa({ ...base, taglio: 'mono', mq: 20 }, P2).puntuale === 60);
  const P3 = JSON.parse(JSON.stringify(ENGINE)) as typeof ENGINE;
  P3.scontoMultiUnita.percento = 10;
  const bilo: DatiCasa = { ...base, taglio: 'bilo', mq: 55, matrimoniali: 1, singoli: 1 };
  check('Override sconto multi 10%', calcolaCase([bilo, bilo], P3).scontoPercento === 10);
}

console.log('\n============================================');
console.log(`RISULTATO: ${passati} passati, ${falliti} falliti`);
console.log('============================================');
if (falliti > 0) process.exit(1);
