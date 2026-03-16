/**
 * ============================================================
 * EMAIL TEMPLATES — Template HTML per le email transazionali
 * ============================================================
 *
 * PROBLEMA RISOLTO:
 * I template HTML delle email erano inline nelle API route,
 * rendendo il codice illeggibile e i template non riutilizzabili.
 *
 * Tutti i template sono funzioni pure che ricevono i dati e
 * restituiscono HTML come stringa. Nessuna logica di business
 * qui: solo presentazione.
 * ============================================================
 */

import { APP_URL, EMAIL_COLORS } from "~/lib/email/config";

// ─── Helpers strutturali ─────────────────────────────────────────────────────

function emailWrapper(content: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      ${content}
      <p style="font-size: 11px; color: #9ca3af; text-align: center; margin-top: 24px;">
        CleaningApp · Gestionale Pulizie Appartamenti Turistici<br>
        <a href="${APP_URL}" style="color: #9ca3af;">gestionale.puliziacasevacanze.it</a>
      </p>
    </div>
  `.trim();
}

function header(title: string, gradient: string): string {
  return `
    <div style="background: linear-gradient(135deg, ${gradient}); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">${title}</h1>
    </div>
  `;
}

function body(content: string): string {
  return `
    <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
      ${content}
    </div>
  `;
}

function infoBox(items: Array<{ label: string; value: string }>, variant: "success" | "warning" | "danger" | "info" = "info"): string {
  const colors = {
    success: { bg: "#ecfdf5", border: "#10b981", text: "#065f46" },
    warning: { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
    danger:  { bg: "#fef2f2", border: "#ef4444", text: "#7f1d1d" },
    info:    { bg: "#eff6ff", border: "#3b82f6", text: "#1e3a8a" },
  };
  const c = colors[variant];
  const rows = items
    .map((i) => `<p style="margin: 6px 0 0 0; color: ${c.text};"><strong>${i.label}:</strong> ${i.value}</p>`)
    .join("");
  return `
    <div style="background-color: ${c.bg}; border-left: 4px solid ${c.border}; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
      ${rows}
    </div>
  `;
}

function ctaButton(text: string, url: string, gradient: string): string {
  return `
    <div style="text-align: center; margin-top: 28px;">
      <a href="${url}"
         style="display: inline-block; background: linear-gradient(135deg, ${gradient}); color: white; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px;">
        ${text}
      </a>
    </div>
  `;
}

function greeting(name: string): string {
  return `<p style="font-size: 16px; color: #374151; line-height: 1.6;">Ciao <strong>${name}</strong>,</p>`;
}

// ─── TEMPLATE: Pulizia completata ────────────────────────────────────────────

export interface CleaningCompletedEmailParams {
  ownerName: string;
  propertyName: string;
  dateStr: string;
  issuesCount: number;
  cleaningId: string;
  /** Se true il proprietario può vedere le segnalazioni */
  isOwner?: boolean;
}

export function cleaningCompletedEmail(p: CleaningCompletedEmailParams): string {
  const hasIssues = p.issuesCount > 0;
  const gradient = hasIssues ? EMAIL_COLORS.warning : EMAIL_COLORS.success;
  const variant = hasIssues ? "warning" : "success";
  const title = hasIssues ? "⚠️ Pulizia completata con segnalazioni" : "✅ Pulizia completata";

  const url = p.isOwner
    ? `${APP_URL}/proprietario/calendario/pulizie?id=${p.cleaningId}`
    : `${APP_URL}/dashboard?openCleaning=${p.cleaningId}`;

  const intro = hasIssues
    ? `La pulizia di <strong>${p.propertyName}</strong> è stata completata, ma sono stati segnalati <strong>${p.issuesCount} problema/i</strong> che richiedono attenzione.`
    : `La pulizia di <strong>${p.propertyName}</strong> è stata completata con successo. Tutto in ordine! 🎉`;

  const infoItems = [
    { label: "📅 Data", value: p.dateStr },
    { label: "🏠 Proprietà", value: p.propertyName },
    ...(hasIssues ? [{ label: "⚠️ Segnalazioni", value: `${p.issuesCount} problema/i rilevato/i` }] : []),
  ];

  return emailWrapper(`
    ${header(title, gradient)}
    ${body(`
      ${greeting(p.ownerName)}
      <p style="font-size: 16px; color: #374151; line-height: 1.6;">${intro}</p>
      ${infoBox(infoItems, variant)}
      ${ctaButton("Vedi Dettagli", url, gradient)}
    `)}
  `);
}

// ─── TEMPLATE: Nuova registrazione (per admin) ────────────────────────────────

export interface NewRegistrationEmailParams {
  adminName: string;
  userName: string;
  userEmail: string;
  userPhone: string;
}

export function newRegistrationEmail(p: NewRegistrationEmailParams): string {
  return emailWrapper(`
    ${header("🆕 Nuova Registrazione", EMAIL_COLORS.primary)}
    ${body(`
      ${greeting(p.adminName)}
      <p style="font-size: 16px; color: #374151; line-height: 1.6;">
        Un nuovo proprietario si è registrato su CleaningApp e attende la tua approvazione.
      </p>
      ${infoBox([
        { label: "👤 Nome", value: p.userName },
        { label: "📧 Email", value: p.userEmail },
        { label: "📱 Telefono", value: p.userPhone },
      ], "info")}
      ${ctaButton("Gestisci Utenti", `${APP_URL}/dashboard/utenti`, EMAIL_COLORS.primary)}
    `)}
  `);
}

// ─── TEMPLATE: Account approvato (per proprietario) ──────────────────────────

export interface AccountApprovedEmailParams {
  userName: string;
}

export function accountApprovedEmail(p: AccountApprovedEmailParams): string {
  return emailWrapper(`
    ${header("🎉 Account Approvato!", EMAIL_COLORS.success)}
    ${body(`
      ${greeting(p.userName)}
      <p style="font-size: 16px; color: #374151; line-height: 1.6;">
        Il tuo account su CleaningApp è stato approvato. Puoi ora accedere e iniziare a gestire le tue proprietà!
      </p>
      ${ctaButton("Accedi ora", `${APP_URL}/proprietario`, EMAIL_COLORS.success)}
    `)}
  `);
}

// ─── TEMPLATE: Nuova segnalazione critica ─────────────────────────────────────

export interface CriticalIssueEmailParams {
  adminName: string;
  propertyName: string;
  issueTitle: string;
  issueSeverity: string;
  issueDescription: string;
  cleaningId: string;
  issueId: string;
}

export function criticalIssueEmail(p: CriticalIssueEmailParams): string {
  return emailWrapper(`
    ${header("🚨 Problema Critico Rilevato", EMAIL_COLORS.danger)}
    ${body(`
      ${greeting(p.adminName)}
      <p style="font-size: 16px; color: #374151; line-height: 1.6;">
        Durante una pulizia è stato segnalato un problema <strong>critico</strong> che richiede attenzione immediata.
      </p>
      ${infoBox([
        { label: "🏠 Proprietà", value: p.propertyName },
        { label: "⚠️ Problema", value: p.issueTitle },
        { label: "🔴 Severità", value: p.issueSeverity },
        { label: "📝 Descrizione", value: p.issueDescription || "—" },
      ], "danger")}
      ${ctaButton("Vedi Segnalazione", `${APP_URL}/dashboard/segnalazioni?id=${p.issueId}`, EMAIL_COLORS.danger)}
    `)}
  `);
}

// ─── TEMPLATE: Nuovo ordine biancheria ───────────────────────────────────────

export interface LinenOrderEmailParams {
  riderName: string;
  propertyName: string;
  scheduledDateStr: string;
  itemsSummary: string;
  orderId: string;
}

export function linenOrderEmail(p: LinenOrderEmailParams): string {
  return emailWrapper(`
    ${header("📦 Nuovo Ordine Biancheria", EMAIL_COLORS.primary)}
    ${body(`
      ${greeting(p.riderName)}
      <p style="font-size: 16px; color: #374151; line-height: 1.6;">
        Ti è stato assegnato un nuovo ordine di consegna biancheria.
      </p>
      ${infoBox([
        { label: "🏠 Proprietà", value: p.propertyName },
        { label: "📅 Data consegna", value: p.scheduledDateStr },
        { label: "📋 Articoli", value: p.itemsSummary },
      ], "info")}
      ${ctaButton("Vedi Ordine", `${APP_URL}/rider?orderId=${p.orderId}`, EMAIL_COLORS.primary)}
    `)}
  `);
}

// ─── TEMPLATE: Promemoria pulizia (per operatore) ─────────────────────────────

export interface CleaningReminderEmailParams {
  operatorName: string;
  propertyName: string;
  propertyAddress: string;
  scheduledDateStr: string;
  scheduledTime: string;
  cleaningId: string;
}

export function cleaningReminderEmail(p: CleaningReminderEmailParams): string {
  return emailWrapper(`
    ${header("🔔 Promemoria Pulizia", EMAIL_COLORS.primary)}
    ${body(`
      ${greeting(p.operatorName)}
      <p style="font-size: 16px; color: #374151; line-height: 1.6;">
        Ricorda che domani hai una pulizia programmata!
      </p>
      ${infoBox([
        { label: "🏠 Proprietà", value: p.propertyName },
        { label: "📍 Indirizzo", value: p.propertyAddress },
        { label: "📅 Data", value: p.scheduledDateStr },
        { label: "🕐 Orario", value: p.scheduledTime },
      ], "info")}
      ${ctaButton("Vedi Dettagli", `${APP_URL}/operatore?cleaningId=${p.cleaningId}`, EMAIL_COLORS.primary)}
    `)}
  `);
}

// ─── TEMPLATE: Account approvato con credenziali ─────────────────────────────

export interface AccountApprovedWithCredentialsParams {
  userName: string;
  userEmail: string;
  password?: string;
}

export function accountApprovedWithCredentialsEmail(p: AccountApprovedWithCredentialsParams): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <tr><td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px; text-align: center;">
          <div style="width: 80px; height: 80px; background-color: rgba(255,255,255,0.2); border-radius: 20px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 40px;">✅</span>
          </div>
          <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Account Approvato!</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px;">Benvenuto in CleaningApp</p>
        </td></tr>
        <tr><td style="padding: 40px;">
          <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">Ciao <strong>${p.userName}</strong>,</p>
          <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
            Siamo lieti di comunicarti che la tua richiesta di registrazione è stata <strong style="color: #10b981;">approvata</strong>!
            Ora puoi accedere a tutte le funzionalità di CleaningApp.
          </p>
          <div style="background-color: #f0fdf4; border: 2px solid #86efac; border-radius: 12px; padding: 24px; margin-bottom: 30px;">
            <h3 style="color: #166534; margin: 0 0 16px; font-size: 16px; font-weight: 600;">🔐 Le tue credenziali di accesso</h3>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding: 8px 0;">
                <span style="color: #64748b; font-size: 14px;">Email:</span>
                <p style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 4px 0 0 0;">${p.userEmail}</p>
              </td></tr>
              <tr><td style="padding: 8px 0;">
                <span style="color: #64748b; font-size: 14px;">Password:</span>
                <p style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 4px 0 0 0; font-family: monospace; background: #dcfce7; padding: 8px 12px; border-radius: 6px; display: inline-block;">${p.password || "La password che hai scelto in fase di registrazione"}</p>
              </td></tr>
            </table>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/login" style="display: inline-block; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 600; font-size: 16px;">Accedi Ora →</a>
          </div>
          <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 30px 0 0; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            💡 <strong>Consiglio:</strong> Ti consigliamo di cambiare la password al primo accesso dalle impostazioni del tuo profilo.
          </p>
        </td></tr>
        <tr><td style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} CleaningApp - Gestionale Pulizie</p>
          <p style="color: #94a3b8; font-size: 12px; margin: 8px 0 0;">Hai bisogno di aiuto? <a href="mailto:supporto@puliziacasevacanza.com" style="color: #0ea5e9;">Contattaci</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ─── TEMPLATE: Registrazione rifiutata ────────────────────────────────────────

export interface AccountRejectedEmailParams {
  userName: string;
  rejectReason?: string;
}

export function accountRejectedEmail(p: AccountRejectedEmailParams): string {
  const reasonBlock = p.rejectReason ? `
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 24px 0;">
      <p style="color: #991b1b; font-size: 14px; font-weight: 600; margin: 0 0 8px;">Motivo:</p>
      <p style="color: #7f1d1d; font-size: 14px; margin: 0; line-height: 1.5;">${p.rejectReason}</p>
    </div>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <tr><td style="background: linear-gradient(135deg, #64748b 0%, #475569 100%); padding: 40px; text-align: center;">
          <div style="width: 80px; height: 80px; background-color: rgba(255,255,255,0.2); border-radius: 20px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 40px;">📋</span>
          </div>
          <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Richiesta non approvata</h1>
        </td></tr>
        <tr><td style="padding: 40px;">
          <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">Ciao <strong>${p.userName}</strong>,</p>
          <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">Ti informiamo che la tua richiesta di registrazione a CleaningApp non è stata approvata.</p>
          ${reasonBlock}
          <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 24px 0;">Se ritieni che ci sia stato un errore o desideri maggiori informazioni, non esitare a contattarci.</p>
          <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="color: #0369a1; font-size: 14px; margin: 0; line-height: 1.6;">💡 <strong>Puoi riprovare:</strong> Se desideri, puoi effettuare una nuova registrazione fornendo informazioni corrette e complete.</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/register" style="display: inline-block; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 14px;">Nuova Registrazione</a>
          </div>
        </td></tr>
        <tr><td style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} CleaningApp - Gestionale Pulizie</p>
          <p style="color: #94a3b8; font-size: 12px; margin: 8px 0 0;">Hai domande? <a href="mailto:supporto@puliziacasevacanza.com" style="color: #0ea5e9;">Contattaci</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ─── TEMPLATE: Pulizia iniziata ──────────────────────────────────────────────

export interface CleaningStartedEmailParams {
  ownerName: string;
  propertyName: string;
  dateStr: string;
  operatorName: string;
  cleaningId: string;
}

export function cleaningStartedEmail(p: CleaningStartedEmailParams): string {
  return emailWrapper(`
    ${header("🧹 Pulizia in corso", EMAIL_COLORS.primary)}
    ${body(`
      ${greeting(p.ownerName)}
      <p style="font-size: 16px; color: #374151; line-height: 1.6;">
        Ti informiamo che la pulizia della tua proprietà <strong>${p.propertyName}</strong> è appena iniziata.
      </p>
      ${infoBox([
        { label: "📅 Data", value: p.dateStr },
        { label: "👤 Operatore", value: p.operatorName },
      ], "info")}
      ${ctaButton("Vai al Gestionale", `${APP_URL}/proprietario/calendario/pulizie?id=${p.cleaningId}`, EMAIL_COLORS.primary)}
    `)}
  `);
}

// ─── TEMPLATE: Benvenuto nuovo utente con credenziali ────────────────────────

export interface WelcomeUserEmailParams {
  name: string;
  email: string;
  password: string;
  roleLabel: string;
}

export function welcomeUserEmail(p: WelcomeUserEmailParams): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px;">🏠 CleaningApp</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Gestionale Pulizie Professionale</p>
    </div>
    <div style="background: white; border-radius: 0 0 16px 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <h2 style="color: #1f2937; margin: 0 0 20px 0;">Ciao ${p.name}! 👋</h2>
      <p style="color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
        Il tuo account <strong>${p.roleLabel}</strong> è stato creato con successo.
        Ecco le tue credenziali per accedere alla piattaforma:
      </p>
      <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0;">
        <div style="margin-bottom: 16px;">
          <span style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Email</span>
          <p style="color: #1e293b; font-size: 18px; font-weight: 600; margin: 4px 0 0 0;">${p.email}</p>
        </div>
        <div>
          <span style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Password</span>
          <p style="color: #1e293b; font-size: 18px; font-weight: 600; margin: 4px 0 0 0; font-family: monospace; background: #fef3c7; padding: 8px 12px; border-radius: 6px; display: inline-block;">${p.password}</p>
        </div>
      </div>
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
        <p style="color: #92400e; margin: 0; font-size: 14px;">⚠️ <strong>Importante:</strong> Ti consigliamo di cambiare la password al primo accesso.</p>
      </div>
      <a href="${APP_URL}/login" style="display: block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 600; text-align: center; margin-top: 24px;">🚀 Accedi Ora</a>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 24px 0 0 0;">Se non hai richiesto questo account, ignora questa email.</p>
    </div>
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">© ${new Date().getFullYear()} CleaningApp. Tutti i diritti riservati.</p>
  </div>
</body></html>`;
}

// ─── TEMPLATE: Proprietà Approvata — firma Allegato D ─────────────────────────

export interface PropertyApprovedEmailParams {
  ownerName: string;
  propertyName: string;
  cleaningPrice: number;
  propertyUrl: string;
}

export function propertyApprovedEmail(p: PropertyApprovedEmailParams): string {
  return emailWrapper(`
    ${header("🎉 Proprietà Approvata!", EMAIL_COLORS.success)}
    ${body(`
      ${greeting(p.ownerName)}
      <p style="font-size: 16px; color: #374151; line-height: 1.6;">
        La tua proprietà <strong>"${p.propertyName}"</strong> è stata approvata 
        con un prezzo di pulizia di <strong>€${p.cleaningPrice}</strong>.
      </p>
      <p style="font-size: 16px; color: #374151; line-height: 1.6;">
        Per attivarla devi firmare l'<strong>Allegato D</strong> (contratto di servizio). 
        Clicca sul pulsante qui sotto per accedere alla sezione Proprietà e procedere con la firma.
      </p>
      ${ctaButton("Firma l'Allegato D", p.propertyUrl, EMAIL_COLORS.success)}
      <p style="font-size: 14px; color: #6b7280; margin-top: 16px;">
        Una volta firmato il contratto, la tua proprietà sarà attiva e potrai iniziare a ricevere pulizie.
      </p>
    `)}
  `);
}
