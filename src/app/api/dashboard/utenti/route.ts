import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import bcrypt from "bcryptjs";

// POST - Crea nuovo utente
export async function POST(request: Request) {
  try {
    const session = await auth();
    const role = session?.user?.role?.toUpperCase();
    if (!session || role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { name, email, phone, password, role: userRole } = await request.json();

    // Verifica che l'email non esista già
    const existingUser = await db.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json({ message: "Email già registrata" }, { status: 400 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crea utente
    const user = await db.user.create({
      data: {
        name,
        email,
        phone,
        password: hashedPassword,
        role: userRole
      }
    });

    return NextResponse.json({ 
      success: true, 
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Errore creazione utente:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// GET - Lista tutti gli utenti
export async function GET(request: Request) {
  try {
    const session = await auth();
    const role = session?.user?.role?.toUpperCase();
    if (!session || role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filterRole = searchParams.get("role");

    const users = await db.user.findMany({
      where: filterRole ? { role: { equals: filterRole, mode: "insensitive" } } : undefined,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true
      },
      orderBy: { name: "asc" }
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("Errore lista utenti:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}