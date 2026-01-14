import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const dateParam = searchParams.get("date");
  
  let targetDate = new Date();
  if (dateParam) {
    targetDate = new Date(dateParam);
  }
  
  targetDate.setHours(0, 0, 0, 0);
  const nextDay = new Date(targetDate);
  nextDay.setDate(nextDay.getDate() + 1);

  const cleanings = await db.cleaning.findMany({
    where: {
      scheduledDate: {
        gte: targetDate,
        lt: nextDay
      }
    },
    include: {
      property: true,
      operator: { select: { id: true, name: true } },
      booking: { select: { guestName: true, guestsCount: true } }
    },
    orderBy: { scheduledTime: "asc" }
  });

  return NextResponse.json({ cleanings });
}
