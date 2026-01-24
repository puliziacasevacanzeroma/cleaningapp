/**
 * API: POST /api/auth/approval-email
 * 
 * Invia email di approvazione o rifiuto registrazione
 */

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

interface ApprovalEmailRequest {
  type: "approved" | "rejected";
  userEmail: string;
  userName: string;
  password?: string; // Solo per approvazione
  rejectReason?: string; // Solo per rifiuto
}

export async function POST(request: NextRequest) {
  try {
    const body: ApprovalEmailRequest = await request.json();
    const { type, userEmail, userName, password, rejectReason } = body;

    if (!type || !userEmail || !userName) {
      return NextResponse.json(
        { error: "Parametri mancanti" },
        { status: 400 }
      );
    }

    if (!resend) {
      console.warn("⚠️ Resend non configurato - email non inviata");
      return NextResponse.json({
        success: false,
        error: "Servizio email non configurato (RESEND_API_KEY mancante)",
      });
    }

    if (type === "approved") {
      // Email di approvazione con credenziali
      await resend.emails.send({
        from: "CleaningApp <noreply@puliziacasevacanza.com>",
        to: userEmail,
        subject: "🎉 Account Approvato - CleaningApp",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f1f5f9;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px; text-align: center;">
                        <div style="width: 80px; height: 80px; background-color: rgba(255,255,255,0.2); border-radius: 20px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                          <span style="font-size: 40px;">✅</span>
                        </div>
                        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Account Approvato!</h1>
                        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px;">Benvenuto in CleaningApp</p>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px;">
                        <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                          Ciao <strong>${userName}</strong>,
                        </p>
                        <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                          Siamo lieti di comunicarti che la tua richiesta di registrazione è stata <strong style="color: #10b981;">approvata</strong>! 
                          Ora puoi accedere a tutte le funzionalità di CleaningApp.
                        </p>
                        
                        <!-- Credentials Box -->
                        <div style="background-color: #f0fdf4; border: 2px solid #86efac; border-radius: 12px; padding: 24px; margin-bottom: 30px;">
                          <h3 style="color: #166534; margin: 0 0 16px; font-size: 16px; font-weight: 600;">
                            🔐 Le tue credenziali di accesso
                          </h3>
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding: 8px 0;">
                                <span style="color: #64748b; font-size: 14px;">Email:</span>
                                <p style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 4px 0 0 0;">${userEmail}</p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0;">
                                <span style="color: #64748b; font-size: 14px;">Password:</span>
                                <p style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 4px 0 0 0; font-family: monospace; background: #dcfce7; padding: 8px 12px; border-radius: 6px; display: inline-block;">${password || "La password che hai scelto in fase di registrazione"}</p>
                              </td>
                            </tr>
                          </table>
                        </div>
                        
                        <!-- CTA Button -->
                        <div style="text-align: center; margin: 30px 0;">
                          <a href="https://app.puliziacasevacanza.com/login" 
                             style="display: inline-block; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 600; font-size: 16px;">
                            Accedi Ora →
                          </a>
                        </div>
                        
                        <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 30px 0 0; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                          💡 <strong>Consiglio:</strong> Ti consigliamo di cambiare la password al primo accesso dalle impostazioni del tuo profilo.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                          © ${new Date().getFullYear()} CleaningApp - Gestionale Pulizie
                        </p>
                        <p style="color: #94a3b8; font-size: 12px; margin: 8px 0 0;">
                          Hai bisogno di aiuto? <a href="mailto:supporto@puliziacasevacanza.com" style="color: #0ea5e9;">Contattaci</a>
                        </p>
                      </td>
                    </tr>
                    
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
      });

      console.log(`📧 Email approvazione inviata a: ${userEmail}`);

    } else if (type === "rejected") {
      // Email di rifiuto
      await resend.emails.send({
        from: "CleaningApp <noreply@puliziacasevacanza.com>",
        to: userEmail,
        subject: "Registrazione non approvata - CleaningApp",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f1f5f9;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #64748b 0%, #475569 100%); padding: 40px; text-align: center;">
                        <div style="width: 80px; height: 80px; background-color: rgba(255,255,255,0.2); border-radius: 20px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                          <span style="font-size: 40px;">📋</span>
                        </div>
                        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Richiesta non approvata</h1>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px;">
                        <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                          Ciao <strong>${userName}</strong>,
                        </p>
                        <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                          Ti informiamo che la tua richiesta di registrazione a CleaningApp non è stata approvata.
                        </p>
                        
                        ${rejectReason ? `
                        <!-- Reason Box -->
                        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 24px 0;">
                          <p style="color: #991b1b; font-size: 14px; font-weight: 600; margin: 0 0 8px;">Motivo:</p>
                          <p style="color: #7f1d1d; font-size: 14px; margin: 0; line-height: 1.5;">${rejectReason}</p>
                        </div>
                        ` : ''}
                        
                        <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 24px 0;">
                          Se ritieni che ci sia stato un errore o desideri maggiori informazioni, non esitare a contattarci.
                        </p>
                        
                        <!-- Info Box -->
                        <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 20px; margin: 24px 0;">
                          <p style="color: #0369a1; font-size: 14px; margin: 0; line-height: 1.6;">
                            💡 <strong>Puoi riprovare:</strong> Se desideri, puoi effettuare una nuova registrazione fornendo informazioni corrette e complete.
                          </p>
                        </div>
                        
                        <!-- CTA Button -->
                        <div style="text-align: center; margin: 30px 0;">
                          <a href="https://app.puliziacasevacanza.com/register" 
                             style="display: inline-block; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 14px;">
                            Nuova Registrazione
                          </a>
                        </div>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                          © ${new Date().getFullYear()} CleaningApp - Gestionale Pulizie
                        </p>
                        <p style="color: #94a3b8; font-size: 12px; margin: 8px 0 0;">
                          Hai domande? <a href="mailto:supporto@puliziacasevacanza.com" style="color: #0ea5e9;">Contattaci</a>
                        </p>
                      </td>
                    </tr>
                    
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
      });

      console.log(`📧 Email rifiuto inviata a: ${userEmail}`);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("❌ Errore invio email:", error);
    return NextResponse.json(
      { error: "Errore invio email", details: error instanceof Error ? error.message : "Errore sconosciuto" },
      { status: 500 }
    );
  }
}
