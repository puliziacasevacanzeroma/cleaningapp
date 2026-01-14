import { redirect, notFound } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import Link from "next/link";
import { GuestCountForm } from "~/components/proprietario/GuestCountForm";

export default async function PrenotazioneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;

  const booking = await db.booking.findFirst({
    where: { id, property: { ownerId: session.user.id } },
    include: { property: { include: { linenConfigs: true } }, cleaning: true }
  });

  if (!booking) notFound();

  const checkOutDate = new Date(booking.checkOut);
  const checkInDate = new Date(booking.checkIn);
  
  const deadline = new Date(checkOutDate);
  deadline.setDate(deadline.getDate() - 1);
  deadline.setHours(18, 0, 0, 0);
  
  const canModifyGuests = new Date() < deadline;
  const cleaningFee = booking.property.cleaningFee || 0;

  return (
    <div className="p-4 lg:p-8">
      <Link href="/proprietario/prenotazioni" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-800 mb-6">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Torna alle prenotazioni
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Riservazione</h1>
        <p className="text-slate-500 mt-1">{booking.property.name} - {booking.property.address}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-600">Data</span>
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <p className="text-xl font-bold text-slate-800">{checkOutDate.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
          <p className="text-sm text-slate-500">Data di check-out</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-600">Totale costi</span>
            <span class