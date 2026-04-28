/**
 * Template Email: Sospensione Servizi e Accesso Gestionale
 *
 * Inviato il 10 del mese ai proprietari ancora con saldo > 0 dopo il termine.
 * Coincide temporalmente con l'attivazione automatica di paymentBlock.active
 * gestita dal cron `check-payment-blocks`.
 *
 * Tono: serio ma con percorso di recupero in evidenza (3 passi numerati).
 * Palette rossa #991b1b/#dc2626, accompagnato dallo stesso PDF resoconto.
 */

import { APP_URL } from "./config";
import { MONTHS_IT, formatCurrency } from "../payments/debtManager";
import type { MonthDebtServer } from "../payments/computeOwnerDebt";

// ════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════

export interface PaymentSuspensionEmailParams {
  /** Nome completo del cliente */
  clientName: string;
  /** Mese principale del resoconto (es. "Aprile") */
  referenceMonthLabel: string;
  /** Anno principale del resoconto */
  referenceYear: number;
  /** Importo totale dovuto formattato (es. "€ 2.710,38") */
  totalDebtFormatted: string;
  /** Lista debiti per mese (Opzione B - dettaglio paritario) */
  debts: MonthDebtServer[];
  /** Data odierna formattata (es. "10 Maggio 2026") */
  todayFormatted: string;
}

// ════════════════════════════════════════════════════════════════
// TEMPLATE
// ════════════════════════════════════════════════════════════════

export function paymentSuspensionEmail(p: PaymentSuspensionEmailParams): string {
  const {
    clientName,
    referenceMonthLabel,
    referenceYear,
    totalDebtFormatted,
    debts,
    todayFormatted,
  } = p;

  const debtRowsHtml = debts.map(d => debtRow(d, todayFormatted)).join("");
  const currentYear = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sospensione servizi · ${referenceMonthLabel} ${referenceYear}</title>
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
    .step-cell { display: block !important; width: 100% !important; padding: 0 !important; margin-bottom: 14px !important; }
    .step-cell-last { margin-bottom: 0 !important; }
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

      <!-- BANNER ROSSO SOSPENSIONE -->
      <tr><td style="padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #991b1b;">
          <tr><td style="padding: 14px 48px; text-align: center;">
            <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; font-weight: 700; color: #ffffff; letter-spacing: 0.22em; text-transform: uppercase;">
              SERVIZI E ACCESSO SOSPESI
            </p>
          </td></tr>
        </table>
      </td></tr>

      <!-- BODY -->
      <tr><td style="padding: 48px 48px 0;">
        <p style="margin: 0 0 12px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 10px; letter-spacing: 0.25em; text-transform: uppercase; font-weight: 700; color: #dc2626;">
          Comunicazione Formale · ${todayFormatted}
        </p>
        <h2 style="margin: 0 0 20px; font-family: Georgia, 'Times New Roman', serif; font-weight: 400; font-size: 30px; color: #0f172a; line-height: 1.2; letter-spacing: -0.02em;">
          Gentile <em style="font-weight: 500;">${escapeHtml(clientName)}</em>,
        </h2>
        <p style="margin: 0 0 36px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.7; color: #475569;">
          il termine ultimo per il pagamento del resoconto di <strong style="color: #0f172a;">${referenceMonthLabel} ${referenceYear}</strong> è scaduto in data odierna. A partire da questo momento <strong style="color: #dc2626;">l'erogazione dei servizi e l'accesso al gestionale risultano sospesi</strong> fino a regolarizzazione della Sua posizione contabile.
        </p>
      </td></tr>

      <!-- CARD TOTALE DOVUTO (palette rossa) -->
      <tr><td style="padding: 0 48px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #b91c1c 100%); border-radius: 20px; box-shadow: 0 10px 30px rgba(185,28,28,0.25);">
          <tr><td style="padding: 40px 36px; text-align: center;">
            <p style="margin: 0 0 12px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; font-weight: 700; color: rgba(255,255,255,0.85);">
              Importo Totale Dovuto
            </p>
            <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 52px; font-weight: 500; color: #ffffff; line-height: 1; letter-spacing: -0.03em;">
              ${totalDebtFormatted}
            </p>
            <p style="margin: 14px 0 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 12px; color: rgba(255,255,255,0.85); letter-spacing: 0.05em;">
              Pagamento <strong style="color: #ffffff;">scaduto in data ${todayFormatted}</strong>
            </p>
          </td></tr>
        </table>
      </td></tr>

      <!-- DETTAGLIO PER MESE (Opzione B) -->
      <tr><td style="padding: 32px 48px 0;">
        <p style="margin: 0 0 16px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #64748b;">
          Dettaglio per mese
        </p>
        ${debtRowsHtml}
      </td></tr>

      <!-- PERCORSO DI RECUPERO (3 passi) -->
      <tr><td style="padding: 32px 48px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #ffffff; border: 2px solid #0c4a6e; border-radius: 16px; overflow: hidden;">
          <tr><td style="background: #0c4a6e; padding: 14px 24px; text-align: center;">
            <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; font-weight: 700; color: #fbbf24; letter-spacing: 0.18em; text-transform: uppercase;">
              Come ripristinare l'account
            </p>
          </td></tr>

          <tr><td style="padding: 28px 32px 8px; text-align: center;">
            <p style="margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 24px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">
              Tre passaggi per la regolarizzazione
            </p>
            <p style="margin: 6px 0 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 12px; color: #64748b; font-style: italic;">
              Una volta saldato, l'accesso viene ripristinato automaticamente entro 24 ore
            </p>
          </td></tr>

          <tr><td style="padding: 16px 32px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td class="step-cell" width="33.33%" style="vertical-align: top; padding-right: 8px;">
                  <table cellpadding="0" cellspacing="0" width="100%" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <tr><td style="padding: 18px 14px; text-align: center;">
                      <table cellpadding="0" cellspacing="0" align="center" style="margin-bottom: 10px;">
                        <tr><td width="32" height="32" style="background: #0c4a6e; border-radius: 50%; text-align: center; vertical-align: middle;">
                          <p style="margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 16px; font-weight: 700; color: #fbbf24; line-height: 32px;">1</p>
                        </td></tr>
                      </table>
                      <p style="margin: 0 0 4px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 13px; font-weight: 700; color: #0f172a;">
                        Contatti
                      </p>
                      <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11.5px; color: #64748b; line-height: 1.5;">
                        Telefoni all'amministrazione per concordare la modalità di pagamento
                      </p>
                    </td></tr>
                  </table>
                </td>

                <td class="step-cell" width="33.33%" style="vertical-align: top; padding: 0 4px;">
                  <table cellpadding="0" cellspacing="0" width="100%" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <tr><td style="padding: 18px 14px; text-align: center;">
                      <table cellpadding="0" cellspacing="0" align="center" style="margin-bottom: 10px;">
                        <tr><td width="32" height="32" style="background: #0c4a6e; border-radius: 50%; text-align: center; vertical-align: middle;">
                          <p style="margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 16px; font-weight: 700; color: #fbbf24; line-height: 32px;">2</p>
                        </td></tr>
                      </table>
                      <p style="margin: 0 0 4px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 13px; font-weight: 700; color: #0f172a;">
                        Saldo
                      </p>
                      <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11.5px; color: #64748b; line-height: 1.5;">
                        Effettua il pagamento dell'importo dovuto. Su richiesta emettiamo regolare fattura
                      </p>
                    </td></tr>
                  </table>
                </td>

                <td class="step-cell step-cell-last" width="33.33%" style="vertical-align: top; padding-left: 8px;">
                  <table cellpadding="0" cellspacing="0" width="100%" style="background: #ecfdf5; border: 1px solid #6ee7b7; border-radius: 10px;">
                    <tr><td style="padding: 18px 14px; text-align: center;">
                      <table cellpadding="0" cellspacing="0" align="center" style="margin-bottom: 10px;">
                        <tr><td width="32" height="32" style="background: #047857; border-radius: 50%; text-align: center; vertical-align: middle;">
                          <p style="margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 16px; font-weight: 700; color: #ffffff; line-height: 32px;">3</p>
                        </td></tr>
                      </table>
                      <p style="margin: 0 0 4px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 13px; font-weight: 700; color: #064e3b;">
                        Ripristino
                      </p>
                      <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11.5px; color: #047857; line-height: 1.5;">
                        L'accesso completo al gestionale e ai servizi viene ripristinato automaticamente
                      </p>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
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
                    Il dettaglio completo dei servizi del mese è disponibile nel PDF allegato.
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
              RIF. SOSPENSIONE SERVIZI
            </p>
            <p class="terms-title" style="margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 28px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">
              Stato dell'account
            </p>
            <p style="margin: 4px 0 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 12px; color: #64748b; font-style: italic;">
              In attesa di regolarizzazione
            </p>
            <table cellpadding="0" cellspacing="0" align="center" style="margin-top: 16px;"><tr>
              <td width="20" height="1" style="background: #e2e8f0; font-size: 0; line-height: 0;">&nbsp;</td>
              <td width="6" height="6" style="background: #dc2626; border-radius: 50%; font-size: 0; line-height: 0;">&nbsp;</td>
              <td width="20" height="1" style="background: #e2e8f0; font-size: 0; line-height: 0;">&nbsp;</td>
            </tr></table>
          </td></tr>

          <tr><td class="terms-card-body-pad" style="padding: 8px 36px 22px; background: #ffffff;">
            <p class="terms-intro" style="margin: 0 0 22px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 13px; color: #334155; line-height: 1.7; text-align: center;">
              In conseguenza del mancato pagamento entro il termine del ${todayFormatted}, l'account è stato limitato. Il ripristino è automatico una volta avvenuta la regolarizzazione.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td class="terms-cell" width="50%" style="vertical-align: top; padding-right: 10px;">
                  <table cellpadding="0" cellspacing="0" width="100%" style="background: #fafaf9; border: 1px solid #dc2626; border-radius: 6px;">
                    <tr><td style="background: #dc2626; padding: 6px 14px; border-radius: 5px 5px 0 0;">
                      <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 9px; font-weight: 700; color: #ffffff; letter-spacing: 0.18em; text-align: center;">
                        SERVIZI · SOSPESI
                      </p>
                    </td></tr>
                    <tr><td style="padding: 18px 18px 16px; text-align: center; background: #ffffff;">
                      <p class="terms-date" style="margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 26px; font-weight: 700; color: #dc2626; letter-spacing: -0.5px; line-height: 1.1;">
                        Erogazione
                      </p>
                      <div style="width: 24px; height: 1px; background: #cbd5e1; margin: 12px auto; font-size: 0; line-height: 0;">&nbsp;</div>
                      <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11.5px; color: #475569; line-height: 1.6;">
                        Pulizie, biancheria e servizi accessori non sono più erogati fino a saldo.
                      </p>
                    </td></tr>
                  </table>
                </td>

                <td class="terms-cell terms-cell-last" width="50%" style="vertical-align: top; padding-left: 10px;">
                  <table cellpadding="0" cellspacing="0" width="100%" style="background: #fafaf9; border: 1px solid #dc2626; border-radius: 6px;">
                    <tr><td style="background: #dc2626; padding: 6px 14px; border-radius: 5px 5px 0 0;">
                      <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 9px; font-weight: 700; color: #ffffff; letter-spacing: 0.18em; text-align: center;">
                        GESTIONALE · LIMITATO
                      </p>
                    </td></tr>
                    <tr><td style="padding: 18px 18px 16px; text-align: center; background: #ffffff;">
                      <p class="terms-date" style="margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 26px; font-weight: 700; color: #dc2626; letter-spacing: -0.5px; line-height: 1.1;">
                        Accesso
                      </p>
                      <div style="width: 24px; height: 1px; background: #cbd5e1; margin: 12px auto; font-size: 0; line-height: 0;">&nbsp;</div>
                      <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11.5px; color: #475569; line-height: 1.6;">
                        L'accesso è limitato alla sola sezione pagamenti fino a regolarizzazione.
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
        <p style="margin: 0 0 16px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 13px; color: #475569; line-height: 1.6;">
          <strong style="color: #0f172a;">Contatti telefonicamente l'amministrazione per regolarizzare:</strong>
        </p>
        <table cellpadding="0" cellspacing="0" align="center">
          <tr>
            <td>
              <a href="tel:+393927830017" style="display: inline-block; background: #991b1b; color: #ffffff; padding: 14px 32px; border-radius: 8px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 14px; font-weight: 700; text-decoration: none; letter-spacing: 0.02em;">
                📞 +39 392 7830017
              </a>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- CHIUSURA -->
      <tr><td style="padding: 40px 48px 0;">
        <p style="margin: 0 0 24px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.7; color: #64748b;">
          Restiamo a Sua disposizione per individuare la soluzione più adatta a sbloccare rapidamente la situazione.
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
  const scadenzaDate = formatDateForRow(d.scadenza);
  const labelText = d.status === "SCADUTO" && isSameDay(d.scadenza, new Date())
    ? `SCADUTO · oggi ${todayFormatted}`
    : `SCADUTO · era ${scadenzaDate}`;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; margin-bottom: 10px;">
      <tr>
        <td style="padding: 16px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p class="month-row-label" style="margin: 0 0 4px; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 14px; font-weight: 700; color: #0f172a;">
                  ${escapeHtml(d.monthName)} ${d.year}
                </p>
                <p style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; color: #991b1b; font-weight: 600; letter-spacing: 0.05em;">
                  <span style="display: inline-block; width: 6px; height: 6px; background: #dc2626; border-radius: 50%; margin-right: 6px; vertical-align: middle;"></span>${labelText}
                </p>
              </td>
              <td align="right" style="white-space: nowrap;">
                <p class="month-row-amount" style="margin: 0; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 16px; font-weight: 700; color: #dc2626;">
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

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
