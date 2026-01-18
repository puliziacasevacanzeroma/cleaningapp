import { NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { db } from "~/server/db";
import bcrypt from "bcryptjs";

// PATCH - Modifica utente
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    if (!session || user.role !== "admin") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    const body = await request.json();
    const { name, email, phone, password, role } = body;
    
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (role !== undefined) updateData.role = role;
    
    // Se c'è una nuova password, hashala
    if (password && password.length > 0) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    const user = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true
      }
    });
    
    return NextResponse.json(user);
  } catch (error) {
    console.error("Errore modifica utente:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// DELETE - Elimina utente
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    if (!session || user.role !== "admin") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    
    // Non permettere di eliminare se stessi
    if (id === user.id) {
      return NextResponse.json({ error: "Non puoi eliminare te stesso" }, { status: 400 });
    }
    
    await db.user.delete({
      where: { id }
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore eliminazione utente:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// GET - Ottieni singolo utente
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    if (!session || user.role !== "admin") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    
    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true
      }
    });
    
    if (!user) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }
    
    return NextResponse.json(user);
  } catch (error) {
    console.error("Errore get utente:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}