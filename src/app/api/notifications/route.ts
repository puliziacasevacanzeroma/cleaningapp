import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";
import { 
  getAdminNotifications, 
  getUserNotifications,
  createNotification,
  createDeletionRequestNotification,
  countUnreadNotifications,
  countPendingRequests,
} from "~/lib/firebase/notifications-admin";

// GET - Ottieni notifiche
export async function GET(request: NextRequest) {
  try {
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  // ─────────────────────────────────────────────────────

    const searchParams = request.nextUrl.searchParams;
    const role = searchParams.get("role") || "ADMIN";
    const userId = searchParams.get("userId") || "";
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const actionRequired = searchParams.get("actionRequired") === "true";
    const countOnly = searchParams.get("countOnly") === "true";
    const limit = parseInt(searchParams.get("limit") || "50");

    // Se richiesto solo il conteggio
    if (countOnly) {
      if (role === "ADMIN") {
        const [unreadCount, pendingCount] = await Promise.all([
          // @ts-expect-error TODO-FIX: TS2554 Expected 2 arguments, but got 1.
          countUnreadNotifications("ADMIN"),
          countPendingRequests(),
        ]);
        return NextResponse.json({ unreadCount, pendingCount });
      } else {
        const unreadCount = await countUnreadNotifications(role, userId);
        return NextResponse.json({ unreadCount, pendingCount: 0 });
      }
    }

    // Ottieni notifiche complete
    let notifications;
    
    if (role === "ADMIN") {
      // @ts-expect-error TODO-FIX: TS2345 Argument of type '{ unreadOnly: boolean; actionRequired: boolean; limitCount: nu...
      notifications = await getAdminNotifications({
        unreadOnly,
        actionRequired,
        limitCount: limit,
      });
    } else {
      // @ts-expect-error TODO-FIX: TS2345 Argument of type '{ unreadOnly: boolean; limitCount: number; }' is not assignabl...
      notifications = await getUserNotifications(userId, role, {
        unreadOnly,
        limitCount: limit,
      });
    }

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error("Errore GET notifiche:", error);
    return NextResponse.json(
      { error: "Errore nel recupero delle notifiche" },
      { status: 500 }
    );
  }
}

// POST - Crea nuova notifica
export async function POST(request: NextRequest) {
  try {
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  // ─────────────────────────────────────────────────────

    const body = await validateBody(request, GenericBodySchema);
    if (body instanceof Response) return body;
    const { type, ...data } = body;

    // Se è una richiesta di cancellazione proprietà
    if (type === "DELETION_REQUEST") {
      const { propertyId, propertyName, senderId, senderName, senderEmail } = data;
      
      if (!propertyId || !propertyName || !senderId || !senderName) {
        return NextResponse.json(
          { error: "Dati mancanti per la richiesta di cancellazione" },
          { status: 400 }
        );
      }

      const notificationId = await createDeletionRequestNotification(
        // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
        propertyId,
        propertyName,
        senderId,
        senderName,
        senderEmail
      );

      return NextResponse.json({ 
        success: true, 
        notificationId,
        message: "Richiesta di disattivazione inviata" 
      });
    }

    // Crea notifica generica
    const { title, message, recipientRole, recipientId, senderId, senderName, ...rest } = data;

    if (!title || !message || !recipientRole || !senderId || !senderName) {
      return NextResponse.json(
        { error: "Dati mancanti per la notifica" },
        { status: 400 }
      );
    }

    const notificationId = await createNotification({
      // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
      title,
      // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
      message,
      // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
      type: type || "INFO",
      // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
      recipientRole,
      // @ts-expect-error TODO-FIX: TS2322 Type 'unknown' is not assignable to type 'string | undefined'.
      recipientId,
      // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
      senderId,
      // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
      senderName,
      ...rest,
    });

    return NextResponse.json({ 
      success: true, 
      notificationId 
    });
  } catch (error) {
    console.error("Errore POST notifica:", error);
    return NextResponse.json(
      { error: "Errore nella creazione della notifica" },
      { status: 500 }
    );
  }
}
