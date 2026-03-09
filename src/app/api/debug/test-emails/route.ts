import { NextRequest, NextResponse } from "next/server";
import { resend, FROM_EMAIL, APP_URL, isResendConfigured } from "~/lib/email/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const email = searchParams.get("email");

  if (secret !== (process.env.CRON_SECRET )) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  if (!email) {
    return NextResponse.json({ error: "Parametro email richiesto" }, { status: 400 });
  }

  if (!isResendConfigured()) {
    return NextResponse.json({ error: "Resend non configurato" }, { status: 500 });
  }

  const results: { name: string; success: boolean; error?: string }[] = [];

  // ─── 1. Email Approvazione Account ───
  try {
    await resend!.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "🧪 TEST 1/5 - Account Approvato",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0;">🎉 Account Approvato</h1>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 16px 16px;">
            <p>Ciao <strong>Test Utente</strong>,</p>
            <p>Il tuo account è stato approvato! Puoi accedere con queste credenziali:</p>
            <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 4px 0;"><strong>Password:</strong> test123</p>
            </div>
            <p style="color: #6b7280; font-size: 12px;">Questo è un test - Email 1/5</p>
          </div>
        </div>
      `,
    });
    results.push({ name: "1. Approvazione Account", success: true });
  } catch (e: any) {
    results.push({ name: "1. Approvazione Account", success: false, error: e.message });
  }

  // ─── 2. Email Rifiuto Account ───
  try {
    await resend!.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "🧪 TEST 2/5 - Registrazione Non Approvata",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #ef4444, #dc2626); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0;">❌ Registrazione Non Approvata</h1>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 16px 16px;">
            <p>Ciao <strong>Test Utente</strong>,</p>
            <p>La tua richiesta di registrazione non è stata approvata.</p>
            <div style="background: #fef2f2; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p><strong>Motivo:</strong> Dati incompleti nella registrazione</p>
            </div>
            <p style="color: #6b7280; font-size: 12px;">Questo è un test - Email 2/5</p>
          </div>
        </div>
      `,
    });
    results.push({ name: "2. Rifiuto Account", success: true });
  } catch (e: any) {
    results.push({ name: "2. Rifiuto Account", success: false, error: e.message });
  }

  // ─── 3. Email Pulizia Iniziata ───
  try {
    await resend!.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "🧪 TEST 3/5 - 🧹 Pulizia Iniziata",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #3b82f6, #2563eb); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0;">🧹 Pulizia in corso</h1>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 16px 16px;">
            <p>Ciao <strong>Proprietario Test</strong>,</p>
            <p>La pulizia della tua proprietà <strong>Appartamento Roma Centro</strong> è appena iniziata.</p>
            <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 0; color: #1e40af;"><strong>📅 Data:</strong> 23 febbraio 2026</p>
              <p style="margin: 8px 0 0 0; color: #1e40af;"><strong>👤 Operatore:</strong> Mario Rossi</p>
            </div>
            <div style="text-align: center; margin-top: 24px;">
              <a href="${APP_URL}/proprietario" style="display: inline-block; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 600;">
                Vai al Gestionale
              </a>
            </div>
            <p style="color: #6b7280; font-size: 12px; text-align: center; margin-top: 24px;">Questo è un test - Email 3/5</p>
          </div>
        </div>
      `,
    });
    results.push({ name: "3. Pulizia Iniziata", success: true });
  } catch (e: any) {
    results.push({ name: "3. Pulizia Iniziata", success: false, error: e.message });
  }

  // ─── 4. Email Pulizia Completata ───
  try {
    await resend!.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "🧪 TEST 4/5 - ✅ Pulizia Completata",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0;">✅ Pulizia completata</h1>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 16px 16px;">
            <p>Ciao <strong>Proprietario Test</strong>,</p>
            <p>La pulizia della tua proprietà <strong>Appartamento Roma Centro</strong> è stata completata con successo.</p>
            <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 0; color: #065f46;"><strong>📅 Data:</strong> 23 febbraio 2026</p>
              <p style="margin: 8px 0 0 0; color: #065f46;"><strong>🏠 Proprietà:</strong> Appartamento Roma Centro</p>
            </div>
            <div style="text-align: center; margin-top: 24px;">
              <a href="${APP_URL}/proprietario" style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 600;">
                Vedi Dettagli
              </a>
            </div>
            <p style="color: #6b7280; font-size: 12px; text-align: center; margin-top: 24px;">Questo è un test - Email 4/5</p>
          </div>
        </div>
      `,
    });
    results.push({ name: "4. Pulizia Completata", success: true });
  } catch (e: any) {
    results.push({ name: "4. Pulizia Completata", success: false, error: e.message });
  }

  // ─── 5. Email Benvenuto (Credenziali) ───
  try {
    await resend!.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "🧪 TEST 5/5 - 🎉 Benvenuto in CleaningApp",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0;">🏠 Benvenuto in CleaningApp</h1>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 16px 16px;">
            <p>Ciao <strong>Nuovo Operatore</strong>,</p>
            <p>Il tuo account è stato creato dall'amministratore. Ecco le tue credenziali:</p>
            <div style="background: #eef2ff; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 4px 0;"><strong>Password:</strong> password-temporanea</p>
              <p style="margin: 4px 0;"><strong>Ruolo:</strong> Operatore Pulizie</p>
            </div>
            <div style="text-align: center; margin-top: 24px;">
              <a href="${APP_URL}/login" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 600;">
                Accedi Ora
              </a>
            </div>
            <p style="color: #6b7280; font-size: 12px; text-align: center; margin-top: 24px;">Questo è un test - Email 5/5</p>
          </div>
        </div>
      `,
    });
    results.push({ name: "5. Benvenuto Credenziali", success: true });
  } catch (e: any) {
    results.push({ name: "5. Benvenuto Credenziali", success: false, error: e.message });
  }

  const allSuccess = results.every(r => r.success);
  
  return NextResponse.json({
    success: allSuccess,
    email,
    from: FROM_EMAIL,
    totalSent: results.filter(r => r.success).length,
    totalFailed: results.filter(r => !r.success).length,
    results,
    note: "Controlla la casella email (anche spam) per verificare la ricezione di tutte e 5 le email di test."
  });
}
