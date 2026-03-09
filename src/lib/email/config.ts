/**
 * Configurazione Email Centralizzata
 * 
 * Questo file contiene tutte le configurazioni per l'invio email con Resend.
 * 
 * SETUP RESEND:
 * 1. Crea un account su resend.com
 * 2. Verifica il dominio puliziacasevacanze.it (DNS records)
 * 3. Copia l'API key in Railway come RESEND_API_KEY
 * 4. Configura le variabili d'ambiente su Railway
 * 
 * VARIABILI AMBIENTE RICHIESTE:
 * - RESEND_API_KEY: API key di Resend
 * - RESEND_FROM_EMAIL: (opzionale) Override dell'email mittente
 * - NEXT_PUBLIC_APP_URL: (opzionale) Override dell'URL app
 */

import { Resend } from "resend";

// ==================== CONFIGURAZIONE ====================

// Email mittente - usa variabile d'ambiente o default
export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "CleaningApp <noreply@puliziacasevacanze.it>";

// URL dell'applicazione - usa variabile d'ambiente o default produzione
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://gestionale.puliziacasevacanze.it";

// Inizializza Resend client (null se API key non configurata)
export const resend = process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY) 
  : null;

// ==================== HELPERS ====================

/**
 * Verifica se Resend è configurato
 */
export function isResendConfigured(): boolean {
  return resend !== null;
}

/**
 * Log di warning se Resend non è configurato
 */
export function logResendWarning(context: string): void {
  console.warn(`⚠️ [${context}] Resend non configurato - RESEND_API_KEY mancante. Email non inviata.`);
}

/**
 * Genera URL completo per link nelle email
 */
export function getEmailLink(path: string): string {
  // Rimuovi slash iniziale se presente
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${APP_URL}${cleanPath}`;
}

// ==================== EMAIL TEMPLATES ====================

export const EMAIL_STYLES = {
  container: `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
  `,
  header: (gradient: string) => `
    background: linear-gradient(135deg, ${gradient});
    padding: 30px;
    border-radius: 16px 16px 0 0;
    text-align: center;
  `,
  content: `
    background: white;
    padding: 30px;
    border: 1px solid #e5e7eb;
    border-top: none;
    border-radius: 0 0 16px 16px;
  `,
  button: (gradient: string) => `
    display: inline-block;
    background: linear-gradient(135deg, ${gradient});
    color: white;
    padding: 14px 32px;
    text-decoration: none;
    border-radius: 12px;
    font-weight: 600;
    font-size: 16px;
  `,
  infoBox: (bgColor: string, borderColor: string, textColor: string) => `
    background-color: ${bgColor};
    border-left: 4px solid ${borderColor};
    padding: 16px;
    margin: 24px 0;
    border-radius: 0 8px 8px 0;
    color: ${textColor};
  `,
  footer: `
    font-size: 12px;
    color: #9ca3af;
    text-align: center;
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid #e5e7eb;
  `,
};

// Colori predefiniti per i template
export const EMAIL_COLORS = {
  primary: "#3b82f6, #2563eb",      // Blu
  success: "#10b981, #059669",       // Verde
  warning: "#f59e0b, #d97706",       // Arancione
  danger: "#ef4444, #dc2626",        // Rosso
  neutral: "#64748b, #475569",       // Grigio
};
