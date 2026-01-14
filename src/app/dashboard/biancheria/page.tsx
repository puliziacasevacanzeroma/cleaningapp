import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import BiancheriaClient from "./BiancheriaClient";

export default async function BiancheriaPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard");

  const items = await db.linenPricing.findMany({ orderBy: { name: "asc" } });

  return <BiancheriaClient items={JSON.parse(JSON.stringify(items))} />;
}
