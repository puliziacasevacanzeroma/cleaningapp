import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import CalendarioPrenotazioniClient from "./CalendarioPrenotazioniClient";

export default async function CalendarioPrenotazioniPage() {
  const session = await auth();
  
  if (!session) {
    redirect("/login");
  }

  // Fetch properties with ALL bookings (not just future)
  const properties = await db.property.findMany({
    include: {
      bookings: {
        orderBy: { checkIn: "asc" },
        take: 50,
      },
    },
    orderBy: { name: "asc" },
  });

  return <CalendarioPrenotazioniClient properties={properties} />;
}