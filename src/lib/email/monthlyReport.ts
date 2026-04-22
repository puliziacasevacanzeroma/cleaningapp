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

      <!-- PDF BOX -->
      <tr><td style="padding: 32px 48px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #fef9c3 0%, #fef3c7 100%); border: 1px solid #fde68a; border-radius: 16px;">
          <tr><td style="padding: 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="56" style="vertical-align: middle;">
                  <div style="width: 48px; height: 56px; background: #ffffff; border: 1px solid #fde68a; border-radius: 6px; text-align: center; padding-top: 20px;">
                    <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 9px; font-weight: 800; color: #a16207; letter-spacing: 0.1em;">PDF</p>
                  </div>
                </td>
                <td style="padding-left: 16px; vertical-align: middle;">
                  <p style="margin: 0 0 4px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 14px; font-weight: 700; color: #78350f;">
                    Dettaglio completo in allegato
                  </p>
                  <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 12px; line-height: 1.5; color: #92400e;">
                    Ogni pulizia con data · Ogni articolo di biancheria · Tutti i servizi aggiuntivi
                  </p>
                </td>
              </tr>
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
              <a href="tel:+393927830017" style="color: #38bdf8; text-decoration: none;">+39 392 7830017</a>
            </p>
            <p style="margin: 4px 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; color: #94a3b8;">
              <a href="mailto:puliziacasevacanzeroma@gmail.com" style="color: #38bdf8; text-decoration: none;">puliziacasevacanzeroma@gmail.com</a>
            </p>
            <p style="margin: 4px 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; color: #94a3b8;">
              <a href="${APP_URL}" style="color: #38bdf8; text-decoration: none;">puliziacasevacanze.it</a>
            </p>
            <p style="margin: 20px 0 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 10px; color: #475569;">
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
