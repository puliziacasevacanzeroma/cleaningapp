/**
 * API: GET /api/contract/history
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { COLLECTIONS } from "~/lib/firebase/collections";
import type { ContractAcceptance, AcceptanceHistoryResponse, ApplicableRole } from "~/types/contract";

async function getAuthenticatedUser(request: NextRequest): Promise<{ uid: string; role: ApplicableRole; email: string } | null> {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.replace("Bearer ", "");
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const userDocSnap = await adminDb.collection(COLLECTIONS.USERS).doc(payload.user_id || payload.uid).get();
      if (!userDocSnap.exists) return null;
      const userData = userDocSnap.data()!;
      return { uid: payload.user_id || payload.uid, role: userData.role as ApplicableRole, email: payload.email || userData.email };
    } catch { return null; }
  } catch (error) {
    console.error("Errore autenticazione:", error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

    const { uid } = user;
    const { searchParams } = new URL(request.url);
    const limitParam = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const statusFilter = searchParams.get("status");

    let query = adminDb.collection(COLLECTIONS.CONTRACT_ACCEPTANCES)
      .where("userId", "==", uid)
      .orderBy("createdAt", "desc");

    if (statusFilter && ["valid", "expired", "revoked", "pending"].includes(statusFilter)) {
      query = adminDb.collection(COLLECTIONS.CONTRACT_ACCEPTANCES)
        .where("userId", "==", uid)
        .where("status", "==", statusFilter)
        .orderBy("createdAt", "desc") as any;
    }

    const acceptanceSnapshot = await (query as any).limit(limitParam).get();

    const acceptances: ContractAcceptance[] = acceptanceSnapshot.docs.map((docSnapshot: any) => ({
      ...docSnapshot.data() as ContractAcceptance,
      id: docSnapshot.id,
      signatureImage: "[FIRMA]",
      metadata: {
        ...(docSnapshot.data() as Record<string, any>).metadata,
        ipAddress: maskIP((docSnapshot.data() as Record<string, any>).metadata?.ipAddress),
      },
    }));

    const response: AcceptanceHistoryResponse = { acceptances, total: acceptances.length };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Errore API contract/history:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}

function maskIP(ip: string | undefined): string {
  if (!ip || ip === "unknown") return "***";
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  return ip.substring(0, 10) + "...";
}
