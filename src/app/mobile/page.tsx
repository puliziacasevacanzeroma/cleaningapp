import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import DashboardMobileClient from "./DashboardMobileClient";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

export default async function DashboardMobilePage() {
  const user = await getFirebaseUser();

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