import { NextRequest, NextResponse } from "next/server";
import { 
  getAdminNotifications, 
  getUserNotifications,
  createNotification,
  createDeletionRequestNotification,
  countUnreadNotifications,
  countPendingRequests,
} from "~/lib/firebase/notifications";

// GET - Ottieni notifiche
export async function GET(request: NextRequest) {
  try {
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
      notifications = await getAdminNotifications({
        unreadOnly,
        actionRequired,
        limitCount: limit,
      });
    } else {
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
    const body = await request.json();
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
      title,
      message,
      type: type || "INFO",
      recipientRole,
      recipientId,
      senderId,
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
