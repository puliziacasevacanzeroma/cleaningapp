import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import CalendarioPulizieClient from "./CalendarioPulizieClient";

export default async function CalendarioPuliziePage() {
  const session = await auth();
  
  if (!session) {
    redirect("/login");
  }

  // Fetch properties with cleanings
  const properties = await db.property.findMany({
    include: {
      cleanings: {
        where: {
          date: { gte: new Date(new Date().setDate(new Date().getDate() - 7)) },
        },
        include: { operator: true },
        orderBy: { date: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  // Fetch operators
  const operators = await db.user.findMany({
    where: { role: "operator" },
    orderBy: { name: "asc" },
  });

  return <CalendarioPulizieClient properties={properties} operators={operators} />;
}
