import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { DashboardContent } from "~/components/dashboard/DashboardContent";

export default async function DashboardPage() {
  const session = await auth();
  if (!session || (session.user.role !== "admin" && session.user.role !== "ADMIN")) redirect("/login");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 7);

  const [cleaningsToday, operatorsActive, propertiesTotal, checkinsWeek] = await Promise.all([
    db.cleaning.count({ where: { scheduledDate: { gte: today, lt: tomorrow } } }),
    db.user.count({ where: { role: "OPERATORE_PULIZIE" } }),
    db.property.count({ where: { status: "ACTIVE" } }),
    db.booking.count({ where: { checkIn: { gte: weekStart, lt: tomorrow } } })
  ]);

  const cleaningsOfToday = await db.cleaning.findMany({
    where: { scheduledDate: { gte: today, lt: tomorrow } },
    include: { property: true, operator: { select: { id: true, name: true } }, booking: { select: { guestName: true } } },
    orderBy: { scheduledTime: "asc" }
  });

  const operators = await db.user.findMany({
    where: { role: "OPERATORE_PULIZIE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });

  return (
    <DashboardContent
      userName={session.user.name || "Admin"}
      stats={{ cleaningsToday, operatorsActive, propertiesTotal, checkinsWeek }}
      cleanings={JSON.parse(JSON.stringify(cleaningsOfToday))}
      operators={operators}
    />
  );
}