"use client";

import { DashboardClientWrapper } from "~/components/dashboard/DashboardClientWrapper";
import { useUser } from "~/lib/UserContext";

export default function DashboardPage() {
  const { userName } = useUser();
  return <DashboardClientWrapper userName={userName || "Admin"} />;
}