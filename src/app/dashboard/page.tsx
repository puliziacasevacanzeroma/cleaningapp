import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { DashboardContent } from "~/components/dashboard/DashboardContent";
import { unstable_cache } from "next/cache";

// Cache dashboard data - si aggiorna ogni 15 secondi
const getDashboardData = unstable_cache(
  async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 7);

    const [cleaningsToday, operatorsActive, propertiesTotal, checkinsWeek, cleaningsOfToday, operators] = await Promise.all([
      db.cleaning.count({ where: { scheduledDate: { gte: today, lt: tomorrow } } }),
      db.user.count({ where: { role: "OPERATORE_PULIZIE" } }),
      db.property.count({ where: { status: "ACTIVE" } }),
      db.booking.count({ where: { checkIn: { gte: weekStart, lt: tomorrow } } }),
      db.cleaning.findMany({
        where: { scheduledDate: { gte: today, lt: tomorrow } },
        include: { property: true, operator: { select: { id: true, name: true } }, booking: { select: { guestName: true } } },
        orderBy: { scheduledTime: "asc" }
      }),
      db.user.findMany({
        where: { role: "OPERATORE_PULIZIE" },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      })
    ]);

    return {
      stats: { cleaningsToday, operatorsActive, propertiesTotal, checkinsWeek },
      cleaningsOfToday,
      operators
    };
  },
  ["dashboard-data"],
  { revalidate: 15, tags: ["dashboard"] }
);

export default async function DashboardPage() {
  const session = await auth();
  if (!session || (session.user.role !== "admin" && session.user.role !== "ADMIN")) redirect("/login");

  const { stats, cleaningsOfToday, operators } = await getDashboardData();

  return (
    <DashboardContent
      userName={session.user.name || "Admin"}
      stats={stats}
      cleanings={JSON.parse(JSON.stringify(cleaningsOfToday))}
      operators={operators}
    />
  );
}