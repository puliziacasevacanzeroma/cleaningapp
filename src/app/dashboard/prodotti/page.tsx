import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import ProdottiClient from "./ProdottiClient";

export default async function ProdottiPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard");

  const products = await db.product.findMany({ orderBy: { name: "asc" } });

  return <ProdottiClient products={JSON.parse(JSON.stringify(products))} />;
}
