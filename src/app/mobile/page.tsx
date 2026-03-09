import { redirect } from "next/navigation";
import DashboardMobileClient from "./DashboardMobileClient";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

export default async function DashboardMobilePage() {
  const user = await getApiUser();

  if (!user) {
    redirect("/login");
  }

  const role = user.role?.toUpperCase();
  if (role !== "ADMIN") {
    redirect("/proprietario");
  }

  return (
    <DashboardMobileClient />
  );
}