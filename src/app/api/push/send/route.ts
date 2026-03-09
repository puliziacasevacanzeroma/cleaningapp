import { NextRequest, NextResponse } from "next/server";
import { sendPushToUser, sendPushToRole } from "~/lib/notifications/sendPushNotification";
import { validateBody, PushSendSchema } from "~/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Verifica secret
  const secret = req.headers.get("x-push-secret");
  if (secret !== (process.env.CRON_SECRET )) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const body = await validateBody(req, PushSendSchema);
    if (body instanceof Response) return body;
    const { title, body: message, recipientId, recipientRole, data } = body;

    if (!title || !message) {
      return NextResponse.json({ error: "title e body richiesti" }, { status: 400 });
    }

    let result;

    if (recipientId) {
      result = await sendPushToUser(recipientId, title, message, data || {});
    } else if (recipientRole && recipientRole !== "ALL") {
      result = await sendPushToRole(
        recipientRole as "ADMIN" | "PROPRIETARIO" | "OPERATORE_PULIZIE" | "RIDER",
        title, message, data || {}
      );
    } else {
      return NextResponse.json({ error: "recipientId o recipientRole richiesto" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("❌ Push API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
