/**
 * quoteEngine.selftest.ts — Batteria di test del motore preventivi
 * Esegui con:  npx tsx src/lib/quote/quoteEngine.selftest.ts
 * Tabella validata con Ariele il 06/07/2026. TUTTI i test devono passare
 * prima di qualsiasi deploy che tocchi il motore.
 */
import { calcolaCasa, calcolaBnb, verificaCopertura } from './quoteEngine';
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

console.log('\n\u2500\u2500 COPERTURA \u2500\u2500');
check('CAP coperto', verificaCopertura('00165', ['00165', '00186']) === 'coperta');
check('CAP non in lista \u2192 in_valutazione', verificaCopertura('00118', ['00165']) === 'in_valutazione');
check('CAP con spazi', verificaCopertura(' 00165 ', ['00165']) === 'coperta');

console.log(`\n${'='.repeat(44)}\nRISULTATO: ${passati} passati, ${falliti} falliti\n${'='.repeat(44)}`);
if (falliti > 0) process.exit(1);
