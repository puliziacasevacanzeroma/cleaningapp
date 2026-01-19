import { NextRequest, NextResponse } from "next/server";
import { 
  getNotificationById,
  markAsRead,
  archiveNotification,
  handleNotificationAction,
  deleteNotification,
  createActionResultNotification,
} from "~/lib/firebase/notifications";
import { updateProperty } from "~/lib/firebase/firestore-data";

// GET - Ottieni singola notifica
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const notification = await getNotificationById(id);
    
    if (!notification) {
      return NextResponse.json(
        { error: "Notifica non trovata" },
        { status: 404 }
      );
    }

    return NextResponse.json({ notification });
  } catch (error) {
    console.error("Errore GET notifica:", error);
    return NextResponse.json(
      { error: "Errore nel recupero della notifica" },
      { status: 500 }
    );
  }
}

// PATCH - Aggiorna notifica (mark as read, archive, action)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, adminId, note } = body;

    const notification = await getNotificationById(id);
    if (!notification) {
      return NextResponse.json(
        { error: "Notifica non trovata" },
        { status: 404 }
      );
    }

    switch (action) {
      case "markAsRead":
        await markAsRead(id);
        return NextResponse.json({ success: true, message: "Notifica segnata come letta" });

      case "archive":
        await archiveNotification(id);
        return NextResponse.json({ success: true, message: "Notifica archiviata" });

      case "approve":
      case "reject": {
        if (!adminId) {
          return NextResponse.json(
            { error: "adminId richiesto per questa azione" },
            { status: 400 }
          );
        }

        const actionStatus = action === "approve" ? "APPROVED" : "REJECTED";
        await handleNotificationAction(id, actionStatus, adminId, note);

        // Se è una richiesta di cancellazione proprietà, aggiorna lo stato della proprietà
        if (notification.type === "DELETION_REQUEST" && notification.relatedEntityId) {
          if (action === "approve") {
            // Disattiva la proprietà
            await updateProperty(notification.relatedEntityId, { status: "SUSPENDED" });
          }
          
          // Notifica il proprietario del risultato
          if (notification.senderId) {
            await createActionResultNotification(
              notification.senderId,
              notification.relatedEntityName || "Proprietà",
              action === "approve",
              note
            );
          }
        }

        return NextResponse.json({ 
          success: true, 
          message: action === "approve" ? "Richiesta approvata" : "Richiesta rifiutata" 
        });
      }

      default:
        return NextResponse.json(
          { error: "Azione non valida" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Errore PATCH notifica:", error);
    return NextResponse.json(
      { error: "Errore nell'aggiornamento della notifica" },
      { status: 500 }
    );
  }
}

// DELETE - Elimina notifica
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteNotification(id);
    return NextResponse.json({ success: true, message: "Notifica eliminata" });
  } catch (error) {
    console.error("Errore DELETE notifica:", error);
    return NextResponse.json(
      { error: "Errore nell'eliminazione della notifica" },
      { status: 500 }
    );
  }
}
