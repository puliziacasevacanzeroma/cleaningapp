"use client";

import { useState } from "react";
import NewCleaningModal from "~/components/NewCleaningModal";

interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  photos?: string[];
}

interface Operator {
  id: string;
  name: string | null;
}

interface Booking {
  id: string;
  guestsCount: number;
}

interface Cleaning {
  id: string;
  date: Date | string;
  status: string;
  scheduledTime?: string | null;
  guestsCount?: number | null;
  property: Property;
  operator?: Operator | null;
  booking?: Booking | null;
}

interface PulizieClientProps {
  upcomingCleanings: Cleaning[];
  pastCleanings: Cleaning[];
  ownerId?: string;
}

const Icons = {
  calendar: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  users: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  plus: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
  clean: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>,
  linen: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18M6 10V7C6 6 7 5 8 5H16C17 5 18 6 18 7V10" /><rect x="6" y="10" width="12" height="4" rx="1" fill="currentColor" opacity="0.15" /></svg>,
  building: <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21" /></svg>,
  sparkle: <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>,
};

export function PulizieClient({ upcomingCleanings, pastCleanings, ownerId }: PulizieClientProps) {
  const [activeTab, setActiveTab] = useState<"upcoming" | "completed">("upcoming");
  const [showNewCleaningModal, setShowNewCleaningModal] = useState(false);
  const [modalRequestType, setModalRequestType] = useState<"cleaning" | "linen_only">("cleaning");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "completed":
        return { label: "Completata", bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" };
      case "in_progress":
        return { label: "In corso", bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" };
      case "assigned":
        return { label: "Assegnata", bg: "bg-sky-100", text: "text-sky-700", dot: "bg-sky-500" };
      default:
        return { label: "Da assegnare", bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-400" };
    }
  };

  const getOperatorColor = (index: number) => {
    const colors = ["bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-rose-500"];
    return colors[index % colors.length];
  };

  const handleNewCleaning = () => {
    setModalRequestType("cleaning");
    setShowNewCleaningModal(true);
  };

  const handleRequestLinen = () => {
    setModalRequestType("linen_only");
    setShowNewCleaningModal(true);
  };

  const handleModalClose = () => {
    setShowNewCleaningModal(false);
  };

  const handleSuccess = () => {
    setShowNewCleaningModal(false);
    // Ricarica la pagina per vedere la nuova pulizia
    window.location.reload();
  };

  const cleaningsToShow = activeTab === "upcoming" ? upcomingCleanings : pastCleanings.filter(c => c.status === "completed");

  return (
    <div className="p-4 lg:p-8">
      {/* Header con pulsanti */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Pulizie</h1>
            <p className="text-slate-500 mt-1">Tutte le pulizie delle tue proprietà</p>
          </div>
          
          {/* Pulsanti azione */}
          <div className="flex gap-2">
            <button
              onClick={handleRequestLinen}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium text-sm hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 shadow-sm"
            >
              {Icons.linen}
              <span>Richiedi Biancheria</span>
            </button>
            <button
              onClick={handleNewCleaning}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-xl font-medium text-sm hover:from-sky-600 hover:to-sky-700 transition-all active:scale-95 shadow-md"
            >
              {Icons.plus}
              <span>Nuova Pulizia</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-slate-200">
        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab("upcoming")}
            className={`px-4 py-2 text-sm font-medium ${activeTab === "upcoming" ? "text-sky-600 border-b-2 border-sky-500" : "text-slate-500 hover:text-slate-700"}`}
          >
            Programmate ({upcomingCleanings.length})
          </button>
          <button 
            onClick={() => setActiveTab("completed")}
            className={`px-4 py-2 text-sm font-medium ${activeTab === "completed" ? "text-sky-600 border-b-2 border-sky-500" : "text-slate-500 hover:text-slate-700"}`}
          >
            Completate ({pastCleanings.filter(c => c.status === "completed").length})
          </button>
        </div>
      </div>

      {/* Lista Pulizie */}
      {cleaningsToShow.length > 0 ? (
        <div className="space-y-4">
          {cleaningsToShow.map((cleaning, index) => {
            const cleaningDate = new Date(cleaning.date);
            const isToday = cleaningDate.toDateString() === today.toDateString();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const isTomorrow = cleaningDate.toDateString() === tomorrow.toDateString();
            const statusConfig = getStatusConfig(cleaning.status);

            return (
              <div
                key={cleaning.id}
                className="flex gap-4 bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-lg transition-all"
              >
                {/* Immagine */}
                <div className="w-32 h-24 lg:w-40 lg:h-28 rounded-xl overflow-hidden bg-slate-200 flex-shrink-0">
                  {cleaning.property.photos?.[0] ? (
                    <img
                      src={cleaning.property.photos[0]}
                      alt={cleaning.property.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
                      {Icons.building}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-800">{cleaning.property.name}</h3>
                    <span className={`px-2 py-1 ${statusConfig.bg} ${statusConfig.text} text-xs font-medium rounded-lg flex-shrink-0`}>
                      {statusConfig.label}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">{cleaning.property.address}, {cleaning.property.city}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                    <span className="flex items-center gap-1.5">
                      {Icons.calendar}
                      <span className={isToday ? "text-emerald-600 font-medium" : isTomorrow ? "text-amber-600 font-medium" : ""}>
                        {isToday ? "Oggi" : isTomorrow ? "Domani" : cleaningDate.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}, {cleaning.scheduledTime || "09:00"}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      {Icons.users}
                      Ospiti - {cleaning.guestsCount ?? cleaning.booking?.guestsCount ?? "N/D"}
                    </span>
                  </div>

                  {/* Operatore */}
                  <div className="mt-3">
                    <p className="text-xs text-slate-500 mb-1">Operatori</p>
                    {cleaning.operator ? (
                      <span className={`inline-flex px-3 py-1 ${getOperatorColor(index)} text-white text-sm font-medium rounded-lg`}>
                        {cleaning.operator.name}
                      </span>
                    ) : (
                      <span className="inline-flex px-3 py-1 bg-slate-200 text-slate-600 text-sm font-medium rounded-lg">
                        Non assegnato
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            {Icons.sparkle}
          </div>
          <p className="text-slate-600 font-medium">
            {activeTab === "upcoming" ? "Nessuna pulizia programmata" : "Nessuna pulizia completata"}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {activeTab === "upcoming" ? "Le prossime pulizie appariranno qui" : "Le pulizie completate appariranno qui"}
          </p>
          {activeTab === "upcoming" && (
            <button
              onClick={handleNewCleaning}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-xl font-medium text-sm hover:from-sky-600 hover:to-sky-700 transition-all active:scale-95 shadow-md"
            >
              {Icons.plus}
              <span>Programma una pulizia</span>
            </button>
          )}
        </div>
      )}

      {/* Modal Nuova Pulizia / Richiedi Biancheria */}
      <NewCleaningModal
        isOpen={showNewCleaningModal}
        onClose={handleModalClose}
        onSuccess={handleSuccess}
        userRole="PROPRIETARIO"
        ownerId={ownerId}
        defaultRequestType={modalRequestType}
      />
    </div>
  );
}
