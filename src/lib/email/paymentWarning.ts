/**
 * Template Email: Promemoria Scadenza Pagamento
 *
 * Inviato il 5 del mese ai proprietari con saldo > 0 per il mese precedente.
 * Allerta moderata, palette ambra, accompagnato da PDF resoconto allegato.
 *
 * Coerente con monthlyReport.ts (font, header brand, footer, bar amministrative).
 */

import { APP_URL } from "./config";
import { MONTHS_IT, formatCurrency } from "../payments/debtManager";
import type { MonthDebtServer } from "../payments/computeOwnerDebt";

// ════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════

export interface PaymentWarningEmailParams {
  /** Nome completo del cliente */
  clientName: string;
  /** Mese principale del resoconto (es. "Aprile") */
  referenceMonthLabel: string;
  /** Anno principale del resoconto */
  referenceYear: number;
  /** Importo totale dovuto formattato (es. "€ 2.710,38") */
  totalDebtFormatted: string;
  /** Lista debiti per mese (per dettaglio paritario - Opzione B) */
  debts: MonthDebtServer[];
  /** Data di oggi formattata (es. "5 Maggio 2026") */
  todayFormatted: string;
  /** Data ultima per il pagamento (es. "10 Maggio 2026") */
  paymentDeadlineFormatted: string;
  /** Giorni mancanti al pagamento (es. 5) */
  daysToDeadline: number;
}

// ════════════════════════════════════════════════════════════════
// TEMPLATE
// ════════════════════════════════════════════════════════════════

export function paymentWarningEmail(p: PaymentWarningEmailParams): string {
  const {
    clientName,
    referenceMonthLabel,
    referenceYear,
    totalDebtFormatted,
    debts,
    todayFormatted,
    paymentDeadlineFormatted,
    daysToDeadline,
  } = p;

  const debtRowsHtml = debts.map(d => debtRow(d, todayFormatted)).join("");
  const currentYear = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pagamento in scadenza · ${referenceMonthLabel} ${referenceYear}</title>
<style>
  @media only screen and (max-width: 480px) {
    .terms-cell { display: block !important; width: 100% !important; padding: 0 !important; margin-bottom: 12px !important; }
    .terms-cell-last { margin-bottom: 0 !important; }
    .terms-card-pad { padding: 22px 18px 14px !important; }
    .terms-card-body-pad { padding: 4px 18px 18px !important; }
    .terms-card-top { padding: 4px 16px !important; }
    .terms-card-bottom { padding: 12px 18px 16px !important; }
    .terms-title { font-size: 22px !important; }
    .terms-date { font-size: 24px !important; }
    .terms-intro { font-size: 12.5px !important; }
    .month-row-label { font-size: 13px !important; }
    .month-row-amount { font-size: 14px !important; }
  }
</style>
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
        <p style="margin: 0 0 12px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 10px; letter-spacing: 0.25em; text-transform: uppercase; font-weight: 700; color: #d97706;">
          Promemoria Scadenza · ${todayFormatted}
        </p>
        <h2 style="margin: 0 0 20px; font-family: Georgia, 'Times New Roman', serif; font-weight: 400; font-size: 30px; color: #0f172a; line-height: 1.2; letter-spacing: -0.02em;">
          Gentile <em style="font-weight: 500;">${escapeHtml(clientName)}</em>,
        </h2>
        <p style="margin: 0 0 36px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.7; color: #475569;">
          Le ricordiamo che il pagamento del resoconto di <strong style="color: #0f172a;">${referenceMonthLabel} ${referenceYear}</strong> è in scadenza. Mancano <strong style="color: #d97706;">${daysToDeadline} giorni</strong> al termine ultimo per il saldo. Da oggi <strong style="color: #0f172a;">non è più possibile richiedere modifiche o contestazioni</strong> sul resoconto del mese precedente.
        </p>
      </td></tr>

      <!-- CARD TOTALE DOVUTO (palette ambra) -->
      <tr><td style="padding: 0 48px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #92400e 0%, #b45309 50%, #d97706 100%); border-radius: 20px; box-shadow: 0 10px 30px rgba(217,119,6,0.25);">
          <tr><td style="padding: 40px 36px; text-align: center;">
            <p style="margin: 0 0 12px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; font-weight: 700; color: rgba(255,255,255,0.85);">
              Importo Totale Dovuto
            </p>
            <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 52px; font-weight: 500; color: #ffffff; line-height: 1; letter-spacing: -0.03em;">
              ${totalDebtFormatted}
            </p>
            <p style="margin: 14px 0 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 12px; color: rgba(255,255,255,0.85); letter-spacing: 0.05em;">
              Saldo da pagare entro il <strong style="color: #ffffff;">${paymentDeadlineFormatted}</strong>
            </p>
          </td></tr>
        </table>
      </td></tr>

      <!-- DETTAGLIO PER MESE (Opzione B: paritario al totale) -->
      <tr><td style="padding: 32px 48px 0;">
        <p style="margin: 0 0 16px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #64748b;">
          Dettaglio per mese
        </p>
        ${debtRowsHtml}
      </td></tr>

      <!-- PDF BOX -->
      <tr><td style="padding: 32px 48px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #0f172a; border-radius: 16px;">
          <tr><td style="padding: 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align: top;">
                  <table cellpadding="0" cellspacing="0" style="background: #fbbf24; border-radius: 100px;">
                    <tr><td style="padding: 5px 12px;">
                      <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 10px; font-weight: 800; color: #78350f; letter-spacing: 0.12em;">RESOCONTO PDF</p>
                    </td></tr>
                  </table>
                  <p style="margin: 14px 0 4px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 18px; font-weight: 700; color: #ffffff; line-height: 1.3;">
                    Resoconto dettagliato ${referenceMonthLabel} ${referenceYear}
                  </p>
                  <p style="margin: 0 0 16px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 13px; color: #94a3b8; line-height: 1.5;">
                    Apra il PDF in allegato per consultare il dettaglio dei servizi del mese: pulizie, biancheria e servizi aggiuntivi proprietà per proprietà.
                  </p>
                </td>
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
          </td></tr>
        </table>
      </td></tr>

      <!-- COMUNICAZIONE AMMINISTRATIVA -->
      <tr><td style="padding: 32px 48px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #fafaf9; border: 1px solid #d6d3d1; border-radius: 4px;">
          <tr><td class="terms-card-top" style="background: #0c4a6e; padding: 5px 28px; border-radius: 4px 4px 0 0;">
            <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 9px; color: #fbbf24; letter-spacing: 0.3em; text-align: center; font-weight: 700;">
              · COMUNICAZIONE AMMINISTRATIVA ·
            </p>
          </td></tr>

          <tr><td class="terms-card-pad" style="padding: 28px 36px 18px; text-align: center; background: #ffffff;">
            <p style="margin: 0 0 6px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 9px; font-weight: 700; color: #94a3b8; letter-spacing: 0.25em;">
              RIF. PAGAMENTO MENSILE
            </p>
            <p class="terms-title" style="margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 28px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">
              Termine di pagamento
            </p>
            <p style="margin: 4px 0 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 12px; color: #64748b; font-style: italic;">
              ${daysToDeadline} giorni al saldo dovuto
            </p>
            <table cellpadding="0" cellspacing="0" align="center" style="margin-top: 16px;"><tr>
              <td width="20" height="1" style="background: #e2e8f0; font-size: 0; line-height: 0;">&nbsp;</td>
              <td width="6" height="6" style="background: #d97706; border-radius: 50%; font-size: 0; line-height: 0;">&nbsp;</td>
              <td width="20" height="1" style="background: #e2e8f0; font-size: 0; line-height: 0;">&nbsp;</td>
            </tr></table>
          </td></tr>

          <tr><td class="terms-card-body-pad" style="padding: 8px 36px 22px; background: #ffffff;">
            <p class="terms-intro" style="margin: 0 0 22px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 13px; color: #334155; line-height: 1.7; text-align: center;">
              Da oggi non sono più ammesse modifiche o contestazioni al resoconto. Decorso il termine del saldo, l'erogazione dei servizi sarà sospesa fino a regolarizzazione.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td class="terms-cell" width="50%" style="vertical-align: top; padding-right: 10px;">
                  <table cellpadding="0" cellspacing="0" width="100%" style="background: #fafaf9; border: 1px solid #94a3b8; border-radius: 6px;">
                    <tr><td style="background: #475569; padding: 6px 14px; border-radius: 5px 5px 0 0;">
                      <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 9px; font-weight: 700; color: #ffffff; letter-spacing: 0.18em; text-align: center;">
                        REVISIONE · CHIUSA
                      </p>
                    </td></tr>
                    <tr><td style="padding: 18px 18px 16px; text-align: center; background: #ffffff;">
                      <p class="terms-date" style="margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 26px; font-weight: 700; color: #475569; letter-spacing: -0.5px; line-height: 1.1;">
                        ${todayFormatted}
                      </p>
                      <div style="width: 24px; height: 1px; background: #cbd5e1; margin: 12px auto; font-size: 0; line-height: 0;">&nbsp;</div>
                      <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11.5px; color: #475569; line-height: 1.6;">
                        Termine ultimo per modifiche o contestazioni sul resoconto. <strong style="color: #475569;">Oggi.</strong>
                      </p>
                    </td></tr>
                  </table>
                </td>

                <td class="terms-cell terms-cell-last" width="50%" style="vertical-align: top; padding-left: 10px;">
                  <table cellpadding="0" cellspacing="0" width="100%" style="background: #fafaf9; border: 1px solid #d97706; border-radius: 6px;">
                    <tr><td style="background: #d97706; padding: 6px 14px; border-radius: 5px 5px 0 0;">
                      <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 9px; font-weight: 700; color: #ffffff; letter-spacing: 0.18em; text-align: center;">
                        PAGAMENTO · TERMINE
                      </p>
                    </td></tr>
                    <tr><td style="padding: 18px 18px 16px; text-align: center; background: #ffffff;">
                      <p class="terms-date" style="margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 26px; font-weight: 700; color: #d97706; letter-spacing: -0.5px; line-height: 1.1;">
                        ${paymentDeadlineFormatted}
                      </p>
                      <div style="width: 24px; height: 1px; background: #cbd5e1; margin: 12px auto; font-size: 0; line-height: 0;">&nbsp;</div>
                      <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11.5px; color: #475569; line-height: 1.6;">
                        Saldo dell'importo dovuto. Oltre tale data <strong style="color: #d97706;">sospensione automatica dei servizi</strong>.
                      </p>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td></tr>

          <tr><td class="terms-card-bottom" style="background: #ffffff; padding: 14px 36px 22px;">
            <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11.5px; color: #64748b; text-align: center; line-height: 1.6; font-style: italic;">
              Per modalità di pagamento, emissione di regolare fattura o chiarimenti <strong style="color: #0f172a; font-style: normal;">contattare telefonicamente l'amministrazione</strong>
            </p>
          </td></tr>

          <tr><td class="terms-card-top" style="background: #0c4a6e; padding: 4px 28px; border-radius: 0 0 4px 4px;">
            <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 8px; color: rgba(255,255,255,0.5); letter-spacing: 0.25em; text-align: center;">
              — FINE COMUNICAZIONE —
            </p>
          </td></tr>
        </table>
      </td></tr>

      <!-- CTA telefono -->
      <tr><td style="padding: 32px 48px 0; text-align: center;">
        <p style="margin: 0 0 16px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 13px; color: #64748b; line-height: 1.6;">
          Per regolarizzare il pagamento, contattare telefonicamente l'amministrazione:
        </p>
        <table cellpadding="0" cellspacing="0" align="center">
          <tr>
            <td>
              <a href="tel:+393927830017" style="display: inline-block; background: #0c4a6e; color: #ffffff; padding: 14px 32px; border-radius: 8px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 14px; font-weight: 700; text-decoration: none; letter-spacing: 0.02em;">
                📞 +39 392 7830017
              </a>
            </td>
          </tr>
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
              © ${currentYear} Puliziacasevacanze.it · Tutti i diritti riservati
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

function debtRow(d: MonthDebtServer, todayFormatted: string): string {
  const isScaduto = d.status === "SCADUTO";
  const isWarning = d.status === "WARNING";

  const bg = isScaduto ? "#fef2f2" : isWarning ? "#fffbeb" : "#f8fafc";
  const border = isScaduto ? "#fecaca" : isWarning ? "#fde68a" : "#e2e8f0";
  const dotColor = isScaduto ? "#dc2626" : "#d97706";
  const labelColor = isScaduto ? "#991b1b" : "#92400e";
  const amountColor = isScaduto ? "#dc2626" : "#d97706";
  const scadenzaDate = formatDateForRow(d.scadenza);
  const labelText = isScaduto
    ? `SCADUTO · era ${scadenzaDate}`
    : `IN SCADENZA · ${scadenzaDate}`;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background: ${bg}; border: 1px solid ${border}; border-radius: 12px; margin-bottom: 10px;">
      <tr>
        <td style="padding: 16px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p class="month-row-label" style="margin: 0 0 4px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 14px; font-weight: 700; color: #0f172a;">
                  ${escapeHtml(d.monthName)} ${d.year}
                </p>
                <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; color: ${labelColor}; font-weight: 600; letter-spacing: 0.05em;">
                  <span style="display: inline-block; width: 6px; height: 6px; background: ${dotColor}; border-radius: 50%; margin-right: 6px; vertical-align: middle;"></span>${labelText}
                </p>
              </td>
              <td align="right" style="white-space: nowrap;">
                <p class="month-row-amount" style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 16px; font-weight: 700; color: ${amountColor};">
                  ${formatCurrency(d.saldo)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function formatDateForRow(date: Date): string {
  const day = date.getDate();
  const month = MONTHS_IT[date.getMonth()]?.toLowerCase() || "";
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
