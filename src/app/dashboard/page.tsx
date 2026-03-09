"use client";

import { useAuth } from "~/lib/firebase/AuthContext";
import { DashboardClientWrapper } from "~/components/dashboard/DashboardClientWrapper";

export default function DashboardPage() {
  const { user } = useAuth();
  
  return <DashboardClientWrapper userName={user?.name || "Admin"} />;
}