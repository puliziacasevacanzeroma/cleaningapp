import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { PulizieClient } from "~/components/proprietario/PulizieClient";

export default async function PuliziePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cleanings = await db.cleaning.findMany({
    where: {
      property: { ownerId: userId }
    },
    include: {
      property: true,
      operator: true,
      booking: true
    },
    orderBy: { date: "asc" }
  });

  // Serializza le date per il componente client
  const serializedCleanings = cleanings.map(c => ({
    ...c,
    date: c.date.toISOString(),
  }));

  // Separa pulizie future e passate
  const upcomingCleanings = serializedCleanings.filter(c => new Date(c.date) >= today);
  const pastCleanings = serializedCleanings.filter(c => new Date(c.date) < today);

  return (
    <PulizieClient 
      upcomingCleanings={upcomingCleanings}
      pastCleanings={pastCleanings}
    />
  );
}
