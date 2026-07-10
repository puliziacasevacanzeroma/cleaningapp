/**
 * emailPreventivo.ts — Email preventivo per il cliente
 * v3 — 10/07/2026: fix proporzioni logo (onda completa, ratio 1.137)
 * v2 — 10/07/2026: testata con solo logo simbolo (logo_full.png), rimossa scritta affiancata
 * v1 — 07/07/2026
 * Design speculare al widget /preventivo: testata blu, pannello prezzo scuro
 * "a partire da", righe di dettaglio con badge-icona, blocco verde inclusi,
 * footer aziendale. Tutto in tabelle + stili inline: renderizza corretto
 * su Gmail, Outlook, Apple Mail (niente SVG/CSS esterni: vengono strippati).
 */

const BLU = '#3D5A73';
const BLU_SCURO = '#2A4257';
const BLU_CHIARO = '#EAF0F4';
const RAME = '#B0764A';
const RAME_CHIARO = '#F3E4D4';
const FONDO = '#EDF1F4';
const INCHIOSTRO = '#22333F';
const GRIGIO = '#7A8A96';
const OK = '#3E7C5B';
const OK_CHIARO = '#E8F2EC';

const eur = (v: number) => '\u20ac ' + v.toFixed(2).replace('.', ',');

export interface DatiEmailPreventivo {
  nome: string;
  tipo: 'casa' | 'case' | 'bnb' | 'hotel';
  zona?: string;
  copertura?: string;
  quote: {
    suMisura: boolean;
    min: number;
    max: number;
    biancheria: number;
    kit: number;
    scontoPercento?: number;
    unitaDettaglio?: { nome: string; min: number; max: number }[] | null;
    camereDettaglio?: { persone: number; etichetta: string; prezzo: number }[] | null;
    rifacimentoGiornaliero?: number;
    rifacimentoPerCamera?: number;
    rifacimentoUscita?: number;
    areaComuneImporto?: number;
    areaComuneTipo?: string;
    passaggio?: { totale: number } | null;
  };
}

/** Badge tondo con glifo: l'equivalente email-safe delle icone del widget */
function badge(glifo: string, bg = BLU_CHIARO): string {
  return `<td width="44" valign="middle" style="padding:0 12px 0 0">
    <div style="width:40px;height:40px;border-radius:12px;background:${bg};text-align:center;line-height:40px;font-size:19px">${glifo}</div>
  </td>`;
}

function riga(glifo: string, titolo: string, sotto: string, prezzo: string): string {
  return `<tr><td style="padding:0 0 10px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1.5px solid #E3E9EE;border-radius:14px">
      <tr>
        <td style="padding:13px 16px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            ${badge(glifo)}
            <td valign="middle">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;font-weight:bold;color:${BLU_SCURO}">${titolo}</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${GRIGIO};padding-top:1px">${sotto}</div>
            </td>
            <td valign="middle" align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:${BLU_SCURO};white-space:nowrap;padding-left:10px">${prezzo}</td>
          </tr></table>
        </td>
      </tr>
    </table>
  </td></tr>`;
}

function cardMini(titolo: string, prezzoHtml: string, sub: string, badge?: string): string {
  return `<td align="center" style="padding:6px">
    <table role="presentation" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.24);border-radius:14px">
      <tr><td align="center" style="padding:13px 18px 11px;position:relative">
        ${badge ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;color:#E8C9A8;padding-bottom:2px">${badge}</div>` : ''}
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1px;color:#ffffff;opacity:.88;text-transform:uppercase">${titolo}</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:800;color:#ffffff;line-height:1.1;padding-top:4px">${prezzoHtml}</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#ffffff;opacity:.72;padding-top:2px">${sub}</div>
      </td></tr>
    </table>
  </td>`;
}

/** Pannello blu: per camera (B&B), per struttura (multi) o classico (casa singola). MAI totali per B&B/multi. */
function buildPannelloPrezzo(d: DatiEmailPreventivo, q: DatiEmailPreventivo['quote']): string {
  const wrap = (titolo: string, corpo: string, nota: string) => `<tr><td style="padding:6px 0 18px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BLU_SCURO}" style="background:linear-gradient(165deg,#243B4E,${BLU} 70%,#46647F);border-radius:18px">
      <tr><td align="center" style="padding:28px 18px 24px">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:#ffffff;opacity:.85;font-weight:bold">${titolo}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:10px auto 0"><tr>${corpo}</tr></table>
        <div style="width:52px;height:4px;border-radius:99px;background:${RAME};margin:16px auto 0;font-size:0;line-height:0">&nbsp;</div>
        <div style="padding-top:12px"><span style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#ffffff;border:1px solid rgba(255,255,255,.35);border-radius:99px;padding:7px 16px;background:rgba(255,255,255,.10)">${nota}</span></div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#ffffff;opacity:.75;padding-top:12px">prezzo definitivo confermato al sopralluogo gratuito</div>
      </td></tr>
    </table>
  </td></tr>`;

  if (d.tipo === 'bnb' && q.camereDettaglio && q.camereDettaglio.length > 0) {
    const gruppi: { etichetta: string; prezzo: number; n: number }[] = [];
    for (const c of q.camereDettaglio) {
      const g = gruppi.find((x) => x.etichetta === c.etichetta && x.prezzo === c.prezzo);
      if (g) g.n++; else gruppi.push({ etichetta: c.etichetta, prezzo: c.prezzo, n: 1 });
    }
    const corpo = gruppi.map((g) =>
      cardMini(g.etichetta, `\u20ac ${g.prezzo}`, 'a checkout', g.n > 1 ? `\u00d7${g.n}` : undefined)
    ).join('');
    return wrap('PREZZO PER SINGOLA CAMERA', corpo, 'Paghi solo le camere effettivamente pulite \u2014 <b>nessun costo fisso</b>');
  }

  if (d.tipo === 'case' && q.unitaDettaglio && q.unitaDettaglio.length > 0) {
    const corpo = q.unitaDettaglio.map((u) =>
      cardMini(u.nome, `<span style="font-size:13px;font-weight:600">da</span> \u20ac ${u.min}`, `max \u20ac ${u.max} \u00b7 a cambio ospite`)
    ).join('');
    const sconto = q.scontoPercento
      ? `sconto multi-struttura -${q.scontoPercento}% gi\u00e0 applicato a ogni casa \u2014 `
      : '';
    return wrap('PREZZO PER SINGOLA STRUTTURA', corpo, sconto + 'Ogni casa paga solo le proprie uscite \u2014 <b>nessun cumulo</b>');
  }

  return `<tr><td style="padding:6px 0 18px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BLU_SCURO}" style="background:linear-gradient(165deg,#243B4E,${BLU} 70%,#46647F);border-radius:18px">
      <tr><td align="center" style="padding:30px 24px 26px">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:#ffffff;opacity:.85;font-weight:bold">PULIZIA A OGNI CAMBIO OSPITE</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#ffffff;opacity:.9;padding-top:14px">a partire da</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:58px;font-weight:800;color:#ffffff;line-height:1;padding-top:2px">\u20ac ${q.min}</div>
        <div style="width:52px;height:4px;border-radius:99px;background:${RAME};margin:14px auto 0;font-size:0;line-height:0">&nbsp;</div>
        <div style="padding-top:14px"><span style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#ffffff;border:1px solid rgba(255,255,255,.35);border-radius:99px;padding:7px 16px;background:rgba(255,255,255,.10)">stima massima <b>\u20ac ${q.max}</b></span></div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#ffffff;opacity:.75;padding-top:13px">prezzo definitivo confermato al sopralluogo gratuito</div>
      </td></tr>
    </table>
  </td></tr>`;
}

export function buildEmailPreventivo(d: DatiEmailPreventivo): { subject: string; html: string } {
  const q = d.quote;
  const suMisura = q.suMisura || d.tipo === 'hotel';

  // ── righe di dettaglio ──
  let righe = '';
  if (!suMisura) {
    const haCamere = !!(q.camereDettaglio && q.camereDettaglio.length > 0);
    const haUnita = !!(q.unitaDettaglio && q.unitaDettaglio.length > 0 && d.tipo === 'case');
    if (!haCamere && !haUnita) {
      righe += riga('\u{1F3E0}', 'Pulizia completa', 'a ogni cambio ospite', 'da \u20ac ' + q.min);
    }
    if (q.biancheria > 0) righe += riga('\u{1F9FA}', 'Biancheria a noleggio', 'a cambio \u00b7 consegna e ritiro inclusi', '+ ' + eur(q.biancheria));
    if (q.kit > 0) righe += riga('\u{1F9F4}', 'Kit di cortesia', 'un set per ogni ospite', '+ ' + eur(q.kit));
    if (q.rifacimentoPerCamera) righe += riga('\u{1F4C5}', 'Rifacimento letti giornaliero', `+ \u20ac ${q.rifacimentoUscita ?? 0} di uscita, durante il soggiorno`, '\u20ac ' + q.rifacimentoPerCamera + ' /camera');
    else if (q.rifacimentoGiornaliero) righe += riga('\u{1F4C5}', 'Rifacimento letti giornaliero', 'a uscita, durante il soggiorno', eur(q.rifacimentoGiornaliero));
    if (q.areaComuneImporto) righe += riga('\u{1F6CB}', 'Aree comuni', q.areaComuneTipo === 'dedicata' ? 'a uscita dedicata' : 'quando siamo gi\u00e0 in struttura', eur(q.areaComuneImporto));
    if (q.passaggio) righe += riga('\u{1F504}', 'Servizio durante il soggiorno', 'a passaggio: letti, biancheria e kit', eur(q.passaggio.totale));
  }

  const inclusi = d.tipo === 'bnb'
    ? ['Pulizia completa delle camere a ogni checkout', 'Prodotti per la pulizia inclusi', 'Coordinamento con i tuoi check-in, 365 giorni l\u2019anno', 'Referente dedicato sempre raggiungibile']
    : ['Pulizia di stanze, bagni e cucina', 'Prodotti per la pulizia inclusi', '2 rotoli di carta igienica per bagno e un cioccolatino per ospite', 'Controllo di luci, acqua calda e clima a ogni intervento', 'Coordinamento con i tuoi check-in, 365 giorni l\u2019anno'];

  // ── pannello prezzo / su misura ──
  const pannello = suMisura
    ? `<tr><td style="padding:6px 0 18px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BLU_SCURO}" style="background:linear-gradient(165deg,#243B4E,${BLU});border-radius:18px">
          <tr><td align="center" style="padding:34px 24px">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:#ffffff;line-height:1.35">La tua struttura merita<br>un preventivo su misura.</div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;color:#ffffff;opacity:.85;padding-top:10px">Un nostro referente ti contatta <b>entro 24 ore</b> per costruire l\u2019offerta insieme a te.</div>
          </td></tr>
        </table>
      </td></tr>`
    : buildPannelloPrezzo(d, q);

  const avvisoZona = d.copertura && d.copertura !== 'coperta' && !suMisura
    ? `<tr><td style="padding:0 0 14px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BLU_CHIARO};border:1.5px solid #C9D6DF;border-radius:14px">
          <tr><td style="padding:13px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BLU_SCURO};line-height:1.5">
            <b>\u{1F4CD} Un\u2019ultima verifica per la tua zona.</b> ${d.zona || 'La tua zona'} \u00e8 fuori dal nostro giro abituale: un referente controlla i nostri percorsi e ti conferma disponibilit\u00e0 e prezzo entro 24 ore.
          </td></tr>
        </table>
      </td></tr>` : '';

  const html = `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${FONDO}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${FONDO}" style="background:${FONDO}">
<tr><td align="center" style="padding:28px 12px 40px">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

    <!-- TESTATA BRAND -->
    <tr><td bgcolor="${BLU_SCURO}" style="background:linear-gradient(135deg,${BLU_SCURO},${BLU});border-radius:22px 22px 0 0;padding:24px 28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td><img src="https://gestionale.puliziacasevacanze.it/preventivo/logo_full.png" alt="Puliziacasevacanze.it" width="50" height="44" style="display:block;border:0" /></td>
      </tr><tr>
        <td style="font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#ffffff;opacity:.85;padding-top:3px">Pulizie e noleggio biancheria per case vacanze, B&amp;B e affittacamere a Roma \u2014 365 giorni l\u2019anno</td>
      </tr></table>
    </td></tr>

    <!-- CORPO -->
    <tr><td bgcolor="#ffffff" style="background:#ffffff;padding:30px 28px 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

        <tr><td align="center" style="padding:0 0 16px 0">
          <span style="display:inline-block;background:${RAME};color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:2.5px;padding:8px 18px;border-radius:99px">IL TUO PREVENTIVO</span>
        </td></tr>

        <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:${INCHIOSTRO};line-height:1.55;padding:0 0 6px 0">
          Ciao <b>${d.nome}</b>,<br>grazie per la richiesta! Ecco il preventivo indicativo per la tua struttura${d.zona ? ' a <b>' + d.zona + '</b>' : ''}:
        </td></tr>

        ${pannello}
        ${righe ? `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${righe}</table></td></tr>` : ''}

        <!-- SEMPRE COMPRESO -->
        <tr><td style="padding:4px 0 14px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${OK_CHIARO};border:1.5px solid #CFE4D7;border-radius:14px">
            <tr><td style="padding:15px 18px">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2px;font-weight:bold;color:${OK};padding-bottom:8px">SEMPRE COMPRESO NEL SERVIZIO</div>
              ${inclusi.map((i) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${INCHIOSTRO};line-height:1.7">\u2713&nbsp; ${i}</div>`).join('')}
            </td></tr>
          </table>
        </td></tr>

        ${avvisoZona}

        <!-- CTA -->
        <tr><td align="center" style="padding:8px 0 6px 0">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td bgcolor="${BLU}" style="border-radius:14px">
              <a href="https://wa.me/393927830017?text=Ciao!%20Ho%20appena%20richiesto%20un%20preventivo%20online%20e%20vorrei%20fissare%20il%20sopralluogo." style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;padding:15px 30px">\u{1F4AC}&nbsp; Fissa il sopralluogo su WhatsApp</a>
            </td>
          </tr></table>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:${GRIGIO};padding-top:10px">oppure chiamaci: <a href="tel:+393927830017" style="color:${RAME};font-weight:bold;text-decoration:none">392 783 0017</a></div>
        </td></tr>

        <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:${GRIGIO};line-height:1.55;padding:16px 4px 0">
          Prezzi al netto di IVA. Il preventivo definitivo te lo confermiamo dopo un <b>sopralluogo gratuito e senza impegno</b>: prima di iniziare firmiamo insieme condizioni e costi, nessuna sorpresa. In allegato trovi il preventivo in PDF, pronto da stampare o condividere.
        </td></tr>

      </table>
    </td></tr>

    <!-- FOOTER -->
    <tr><td bgcolor="${BLU_SCURO}" style="background:${BLU_SCURO};border-radius:0 0 22px 22px;padding:22px 28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#ffffff;line-height:1.8;opacity:.9">
          <b style="font-size:13.5px">PULIZIACASEVACANZE.IT</b> \u2014 Ditta di servizi per attivit\u00e0 ricettive<br>
          Via della Cava Aurelia 84N, Roma \u00b7 P.IVA 17480841000<br>
          <a href="tel:+393927830017" style="color:#E8C9A8;text-decoration:none">392 783 0017</a> \u00b7
          <a href="mailto:info@puliziacasevacanze.it" style="color:#E8C9A8;text-decoration:none">info@puliziacasevacanze.it</a> \u00b7
          <a href="https://www.puliziacasevacanze.it" style="color:#E8C9A8;text-decoration:none">puliziacasevacanze.it</a>
        </td>
      </tr></table>
    </td></tr>

  </table>
</td></tr>
</table>
</body></html>`;

  return {
    subject: suMisura
      ? 'La tua richiesta di preventivo \u2014 Puliziacasevacanze.it'
      : d.tipo === 'bnb'
      ? `Il tuo preventivo: prezzi per singola camera \u2014 Puliziacasevacanze.it`
      : d.tipo === 'case'
      ? `Il tuo preventivo: prezzi per singola struttura \u2014 Puliziacasevacanze.it`
      : `Il tuo preventivo: a partire da \u20ac ${q.min} \u2014 Puliziacasevacanze.it`,
    html,
  };
}
