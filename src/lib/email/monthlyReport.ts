/**
 * Template Email: Resoconto Mensile
 * 
 * Inviato al cliente il 1° del mese successivo con riassunto servizi del mese precedente.
 * Accompagnato da PDF allegato con dettaglio per pulizia.
 */

import { APP_URL } from "./config";

// ════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════

export interface MonthlyReportEmailParams {
  /** Nome completo del cliente */
  clientName: string;
  /** Mese in italiano (es. "Aprile") */
  monthLabel: string;
  /** Anno (es. 2026) */
  year: number;
  /** Totale del mese formattato (es. "€ 2.710,38") */
  totalFormatted: string;
  /** Numero proprietà distinte */
  propertiesCount: number;
  /** Numero totale servizi */
  servicesCount: number;
  /** Numero totale pulizie */
  cleaningsCount: number;
  /** Breakdown per categoria */
  breakdown: {
    cleanings: { amount: number; amountFormatted: string; percent: number };
    laundry: { amount: number; amountFormatted: string; percent: number };
    kits: { amount: number; amountFormatted: string; percent: number };
    extras: { amount: number; amountFormatted: string; percent: number };
  };
}

// ════════════════════════════════════════════════════════════════
// TEMPLATE
// ════════════════════════════════════════════════════════════════

export function monthlyReportEmail(p: MonthlyReportEmailParams): string {
  const {
    clientName, monthLabel, year, totalFormatted,
    propertiesCount, servicesCount, cleaningsCount, breakdown,
  } = p;

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Resoconto Mensile ${monthLabel} ${year}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Tahoma, Geneva, Verdana, sans-serif; background-color: #f1f5f9;">

<table width="100%" cellpadding="0" cellspacing="0" style="background: #f1f5f9; padding: 40px 20px;">
  <tr><td align="center">
    <table width="640" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 40px rgba(15,23,42,0.12);">

      <!-- HEADER -->
      <tr><td style="background: linear-gradient(135deg, #0c4a6e 0%, #075985 40%, #0369a1 100%); padding: 64px 48px 56px; text-align: center;">
        <h1 style="margin: 0; padding: 0; color: #ffffff; font-family: -apple-system, 'Segoe UI', 'Inter', sans-serif; font-size: 36px; font-weight: 900; letter-spacing: -0.035em; line-height: 1;">
          Puliziacasevacanze<span style="color: #fbbf24;">.it</span>
        </h1>
        <p style="margin: 20px 0 0; color: rgba(255,255,255,0.85); font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; font-weight: 500;">
          Pulizie e servizi per strutture extralberghiere
        </p>
      </td></tr>

      <!-- BODY -->
      <tr><td style="padding: 48px 48px 0;">
        <p style="margin: 0 0 12px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 10px; letter-spacing: 0.25em; text-transform: uppercase; font-weight: 700; color: #0369a1;">
          Resoconto Mensile · ${monthLabel} ${year}
        </p>
        <h2 style="margin: 0 0 20px; font-family: Georgia, 'Times New Roman', serif; font-weight: 400; font-size: 30px; color: #0f172a; line-height: 1.2; letter-spacing: -0.02em;">
          Gentile <em style="font-weight: 500;">${escapeHtml(clientName)}</em>,
        </h2>
        <p style="margin: 0 0 36px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.7; color: #475569;">
          desideriamo ringraziarLa per la fiducia accordata nel mese di <strong style="color: #0f172a;">${monthLabel} ${year}</strong>. Di seguito trova il resoconto dei servizi erogati presso le Sue proprietà. Nel PDF allegato trova il dettaglio completo di ogni pulizia con tutti i servizi forniti e la biancheria consegnata articolo per articolo.
        </p>
      </td></tr>

      <!-- CARD TOTALE -->
      <tr><td style="padding: 0 48px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #0c4a6e 0%, #0369a1 50%, #0284c7 100%); border-radius: 20px; box-shadow: 0 10px 30px rgba(3,105,161,0.25);">
          <tr><td style="padding: 40px 36px; text-align: center;">
            <p style="margin: 0 0 12px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; font-weight: 700; color: rgba(255,255,255,0.85);">
              Totale del mese
            </p>
            <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 52px; font-weight: 500; color: #ffffff; line-height: 1; letter-spacing: -0.03em;">
              ${totalFormatted}
            </p>
          </td></tr>
        </table>
      </td></tr>

      <!-- MINI STATS -->
      <tr><td style="padding: 32px 48px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="33.33%" style="padding: 0 6px 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px;">
                <tr><td style="padding: 20px 12px; text-align: center;">
                  <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 28px; font-weight: 900; color: #0369a1; line-height: 1; letter-spacing: -0.02em;">${propertiesCount}</p>
                  <p style="margin: 6px 0 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #64748b;">Immobili</p>
                </td></tr>
              </table>
            </td>
            <td width="33.33%" style="padding: 0 6px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px;">
                <tr><td style="padding: 20px 12px; text-align: center;">
                  <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 28px; font-weight: 900; color: #0369a1; line-height: 1; letter-spacing: -0.02em;">${servicesCount}</p>
                  <p style="margin: 6px 0 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #64748b;">Servizi</p>
                </td></tr>
              </table>
            </td>
            <td width="33.33%" style="padding: 0 0 0 6px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px;">
                <tr><td style="padding: 20px 12px; text-align: center;">
                  <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 28px; font-weight: 900; color: #0369a1; line-height: 1; letter-spacing: -0.02em;">${cleaningsCount}</p>
                  <p style="margin: 6px 0 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #64748b;">Pulizie</p>
                </td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- BREAKDOWN -->
      <tr><td style="padding: 32px 48px 0;">
        <p style="margin: 0 0 16px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #64748b;">
          Suddivisione servizi
        </p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${breakdownRow("Pulizie", breakdown.cleanings, "#0ea5e9", true)}
          ${breakdownRow("Biancheria & lavanderia", breakdown.laundry, "#8b5cf6", true)}
          ${breakdownRow("Kit cortesia ospiti", breakdown.kits, "#f59e0b", true)}
          ${breakdownRow("Servizi extra", breakdown.extras, "#10b981", false)}
        </table>
      </td></tr>

      <!-- PDF BOX - Card scura con badge giallo (Demo 2) -->
      <tr><td style="padding: 32px 48px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #0f172a; border-radius: 16px;">
          <tr><td style="padding: 24px;">
            <!-- Riga superiore: badge + documento -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align: top;">
                  <!-- Badge giallo "ALLEGATO PDF" -->
                  <table cellpadding="0" cellspacing="0" style="background: #fbbf24; border-radius: 100px;">
                    <tr><td style="padding: 5px 12px;">
                      <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 10px; font-weight: 800; color: #78350f; letter-spacing: 0.12em;">ALLEGATO PDF</p>
                    </td></tr>
                  </table>
                  <!-- Titolo -->
                  <p style="margin: 14px 0 4px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 18px; font-weight: 700; color: #ffffff; line-height: 1.3;">
                    Resoconto dettagliato
                  </p>
                  <!-- Sottotitolo -->
                  <p style="margin: 0 0 16px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 13px; color: #94a3b8; line-height: 1.5;">
                    Apri il PDF in allegato per vedere ogni servizio, articolo di biancheria e prezzo proprietà per proprietà.
                  </p>
                </td>
                <!-- Documento bianco a destra -->
                <td width="80" style="vertical-align: top; padding-left: 16px;">
                  <table cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 6px;">
                    <tr><td width="64" height="78" style="text-align: center; padding-top: 26px;">
                      <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 12px; font-weight: 800; color: #dc2626; letter-spacing: 0.1em;">PDF</p>
                      <table cellpadding="0" cellspacing="0" align="center" style="margin-top: 10px;">
                        <tr><td width="42" height="2" style="background: #cbd5e1; border-radius: 1px; font-size: 0; line-height: 0;">&nbsp;</td></tr>
                        <tr><td height="3" style="font-size: 0; line-height: 0;">&nbsp;</td></tr>
                        <tr><td width="42" height="2" style="background: #cbd5e1; border-radius: 1px; font-size: 0; line-height: 0;">&nbsp;</td></tr>
                        <tr><td height="3" style="font-size: 0; line-height: 0;">&nbsp;</td></tr>
                        <tr><td width="26" height="2" style="background: #cbd5e1; border-radius: 1px; font-size: 0; line-height: 0;">&nbsp;</td></tr>
                      </table>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
            <!-- Riga inferiore con numeri reali -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; margin-top: 4px;">
              <tr><td style="padding: 12px 14px;">
                <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 13px; font-weight: 600; color: #fbbf24; text-align: center; letter-spacing: 0.02em;">
                  ${propertiesCount} ${propertiesCount === 1 ? 'proprietà' : 'proprietà'} · ${servicesCount} servizi · ${totalFormatted}
                </p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>

      <!-- CHIUSURA -->
      <tr><td style="padding: 40px 48px 0;">
        <p style="margin: 0 0 24px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.7; color: #64748b;">
          Per qualsiasi chiarimento il nostro team è a Sua completa disposizione.
        </p>
        <table cellpadding="0" cellspacing="0" style="margin: 0; padding: 24px 0 0; border-top: 1px solid #e2e8f0; width: 100%;">
          <tr><td>
            <p style="margin: 0 0 4px; font-family: Georgia, 'Times New Roman', serif; font-size: 20px; font-weight: 500; color: #0f172a; letter-spacing: -0.01em;">
              Il Team <strong style="font-weight: 600;">Puliziacasevacanze.it</strong>
            </p>
            <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 12px; color: #64748b;">
              Pulizie e servizi per strutture extralberghiere
            </p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding: 40px 48px 48px;"></td></tr>

      <!-- FOOTER -->
      <tr><td style="background: #0f172a; padding: 36px 48px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center">
            <p style="margin: 0 0 4px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 18px; font-weight: 900; color: #ffffff; letter-spacing: -0.025em;">
              Puliziacasevacanze<span style="color: #fbbf24;">.it</span>
            </p>
            <p style="margin: 0 0 20px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 10px; color: #64748b; letter-spacing: 0.2em; text-transform: uppercase; font-weight: 600;">
              Pulizie e servizi per strutture extralberghiere
            </p>
            <div style="width: 40px; height: 1px; background: rgba(251,191,36,0.5); margin: 0 auto 20px; font-size: 0; line-height: 0;">&nbsp;</div>
            <p style="margin: 4px 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; color: #94a3b8;">
              Via della Cava Aurelia 84, Roma
            </p>
            <p style="margin: 4px 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; color: #94a3b8;">
              <a href="tel:+393927830017" style="color: #94a3b8; text-decoration: none;">+39 392 7830017</a>
            </p>
            <p style="margin: 4px 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; color: #94a3b8;">
              <a href="mailto:puliziacasevacanzeroma@gmail.com" style="color: #94a3b8; text-decoration: none;">puliziacasevacanzeroma@gmail.com</a>
            </p>
            <p style="margin: 4px 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; color: #94a3b8;">
              <a href="${APP_URL}" style="color: #94a3b8; text-decoration: none;">puliziacasevacanze.it</a>
            </p>
            <div style="width: 40px; height: 1px; background: rgba(148,163,184,0.3); margin: 16px auto 12px; font-size: 0; line-height: 0;">&nbsp;</div>
            <p style="margin: 4px 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 10px; color: #64748b; letter-spacing: 0.05em;">
              Puliziacasevacanze.it srls · P.IVA 17817311008
            </p>
            <p style="margin: 12px 0 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 10px; color: #475569;">
              © ${year} Puliziacasevacanze.it · Tutti i diritti riservati
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>

</body>
</html>`;
}

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

function breakdownRow(
  label: string,
  data: { amount: number; amountFormatted: string; percent: number },
  color: string,
  hasBorder: boolean,
): string {
  if (data.amount <= 0) return "";
  const borderStyle = hasBorder ? "border-bottom: 1px solid #e2e8f0;" : "";
  return `
    <tr><td style="padding: 14px 0; ${borderStyle}">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <span style="display: inline-block; width: 4px; height: 20px; background: ${color}; border-radius: 2px; vertical-align: middle; margin-right: 12px;"></span>
            <span style="font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 14px; color: #334155; font-weight: 500;">${escapeHtml(label)}</span>
          </td>
          <td align="right" style="white-space: nowrap;">
            <span style="font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 12px; color: #94a3b8; margin-right: 12px;">${data.percent}%</span>
            <span style="font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 15px; color: #0f172a; font-weight: 700;">${data.amountFormatted}</span>
          </td>
        </tr>
      </table>
    </td></tr>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
