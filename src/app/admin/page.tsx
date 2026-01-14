import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { DashboardClient } from "~/components/admin/DashboardClient";

export default async function AdminDashboardPage() {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 7);

  // Stats
  const [cleaningsToday, operatorsActive, propertiesTotal, checkinsWeek] = await Promise.all([
    db.cleaning.count({
      where: {
        scheduledDate: { gte: today, lt: tomorrow }
      }
    }),
    db.user.count({
      where: { role: "operator" }
    }),
    db.property.count({
      where: { status: "active" }
    }),
    db.booking.count({
      where: {
        checkIn: { gte: weekStart, lt: tomorrow }
      }
    })
  ]);

  // Pulizie di oggi con dettagli
  const cleaningsOfToday = await db.cleaning.findMany({
    where: {
      scheduledDate: { gte: today, lt: tomorrow }
    },
    include: {
      property: {
        include: {
          owner: { select: { name: true } }
        }
      },
      operator: { select: { id: true, name: true } },
      booking: { select: { guestName: true } }
    },
    orderBy: { scheduledTime: "asc" }
  });

  return (
    <DashboardClient 
      userName={session.user.name || "Admin"}
      stats={{
        cleaningsToday,
        operatorsActive,
        propertiesTotal,
        checkinsWeek
      }}
      cleanings={JSON.parse(JSON.stringify(cleaningsOfToday))}
    />
  );
}