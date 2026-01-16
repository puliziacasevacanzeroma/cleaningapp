import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import DashboardMobileClient from "./DashboardMobileClient";

export default async function DashboardMobilePage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const role = session.user.role?.toUpperCase();
  if (role !== "ADMIN") {
    redirect("/proprietario");
  }

  return (
    <DashboardMobileClient />
  );
}