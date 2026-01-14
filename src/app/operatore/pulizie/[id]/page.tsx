import { redirect, notFound } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import CleaningDetailClient from "./CleaningDetailClient";

export default async function CleaningDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const { id } = await params;

  const cleaning = await db.cleaning.findUnique({
    where: { id },
    include: {
      property: { include: { checklist: { orderBy: { order: "asc" } }, linenConfigs: true } },
      booking: true,
      orders: { include: { items: true } },
    },
  });

  if (!cleaning) notFound();

  return <CleaningDetailClient cleaning={JSON.parse(JSON.stringify(cleaning))} />;
}
