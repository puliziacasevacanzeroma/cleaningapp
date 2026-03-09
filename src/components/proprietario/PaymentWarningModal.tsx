"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  useOwnerBalance, 
  formatCurrency, 
  getStatusColor, 
  getStatusIcon,
  type MonthDebt 
} from "~/hooks/useOwnerBalance";

interface PaymentWarningModalProps {
  userId: string;
  userName?: string;
}

const DISMISS_KEY = "payment_warning_dismissed";
const DISMISS_DURATION = 24 * 60 * 60 * 1000; // 24 ore

export function PaymentWarningModal({ userId, userName }: PaymentWarningModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);
  
  const { debts, totalDebt, isLoading, countScaduti, countWarning } = useOwnerBalance(userId);

  // Controlla se la modal è stata chiusa di recente
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const dismissedData = localStorage.getItem(DISMISS_KEY);
    if (dismissedData) {
      try {
        const { timestamp } = JSON.parse(dismissedData);
        if (Date.now() - timestamp < DISMISS_DURATION) {
          setIsDismissed(true);
          return;
        }
      } catch (e) {
        // JSON invalido
      }
    }
    setIsDismissed(false);
  }, []);

  // Mostra solo se ci sono debiti e non è stata chiusa
  useEffect(() => {
    if (!isLoading && totalDebt > 0 && !isDismissed) {
      const timer = setTimeout(() => setIsVisible(true), 800);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isLoading, totalDebt, isDismissed]);

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    localStorage.setItem(DISMISS_KEY, JSON.stringify({ timestamp: Date.now() }));
  };

  if (!isVisible) return null;

  const hasScaduti = countScaduti > 0;
  const hasWarning = countWarning > 0;
  
  // Colore header basato sulla gravità
  const headerGradient = hasScaduti 
    ? "from-red-500 to-red-600" 
    : hasWarning 
      ? "from-amber-500 to-orange-500"
      : "from-blue-500 to-blue-600";

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm"
        onClick={handleDismiss}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
        <div 
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={`bg-gradient-to-r ${headerGradient} px-5 py-5 text-center flex-shrink-0`}>
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
              {hasScaduti ? (
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : (
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <h2 className="text-lg font-bold text-white">
              {hasScaduti ? "Pagamenti scaduti!" : "Pagamenti in sospeso"}
            </h2>
            {hasScaduti && (
              <p className="text-white/80 text-sm mt-1">
                Hai {countScaduti} {countScaduti === 1 ? "pagamento scaduto" : "pagamenti scaduti"}
              </p>
            )}
          </div>

          {/* Content */}
          <div className="px-5 py-4 overflow-y-auto flex-1">
            <p className="text-slate-600 text-center text-sm mb-4">
              Ciao <span className="font-semibold text-slate-800">{userName || "Proprietario"}</span>,
              hai pagamenti da saldare:
            </p>

            {/* Lista debiti */}
            <div className="space-y-2 mb-4">
              {debts.slice(0, 5).map((debt: MonthDebt) => {
                const colors = getStatusColor(debt.status);
                return (
                  <div 
                    key={`${debt.month}-${debt.year}`}
                    className={`flex justify-between items-center py-2.5 px-3 rounded-xl border ${colors.bg} ${colors.border}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getStatusIcon(debt.status)}</span>
                      <div>
                        <span className="text-slate-700 font-medium text-sm">
                          {debt.monthName} {debt.year}
                        </span>
                        {debt.status === "SCADUTO" && (
                          <span className="block text-xs text-red-600 font-medium">
                            Scaduto da {Math.abs(debt.giorniAllaScadenza)} giorni
                          </span>
                        )}
                        {debt.status === "WARNING" && (
                          <span className="block text-xs text-amber-600">
                            Scade tra {debt.giorniAllaScadenza} giorni
                          </span>
                        )}
                        {debt.status === "DA_PAGARE" && (
                          <span className="block text-xs text-blue-600">
                            Scade il 10/{debt.month === 12 ? 1 : debt.month + 1}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`font-bold text-base ${colors.text}`}>
                      {formatCurrency(debt.saldo)}
                    </span>
                  </div>
                );
              })}
              
              {debts.length > 5 && (
                <p className="text-center text-sm text-slate-500 py-1">
                  + altri {debts.length - 5} mesi...
                </p>
              )}
            </div>

            {/* Totale */}
            <div className={`rounded-xl p-4 text-center mb-4 border-2 ${
              hasScaduti 
                ? "bg-gradient-to-br from-red-50 to-red-100 border-red-200" 
                : "bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200"
            }`}>
              <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-medium">Totale da pagare</p>
              <p className={`text-3xl font-bold ${hasScaduti ? "text-red-600" : "text-slate-800"}`}>
                {formatCurrency(totalDebt)}
              </p>
            </div>

            {/* Info box */}
            <div className="bg-sky-50 rounded-xl p-3 mb-4 border border-sky-100">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-sky-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-sky-700">
                  Paga tramite <strong>bonifico</strong> o <strong>contanti</strong>. 
                  L'amministratore registrerà il pagamento e riceverai conferma.
                </p>
              </div>
            </div>

            {/* Buttons */}
            <div className="space-y-2">
              <Link
                href="/proprietario/pagamenti"
                className={`w-full py-3 rounded-xl text-center font-semibold block transition-all shadow-sm hover:shadow-md ${
                  hasScaduti 
                    ? "bg-gradient-to-r from-red-500 to-red-600 text-white" 
                    : "bg-gradient-to-r from-sky-500 to-blue-600 text-white"
                }`}
                onClick={handleDismiss}
              >
                Vai ai Pagamenti
              </Link>
              <button
                onClick={handleDismiss}
                className="w-full py-2.5 text-slate-500 text-sm font-medium hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
              >
                Ricordamelo dopo
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-4 flex-shrink-0 border-t border-slate-100 pt-3">
            <p className="text-[10px] text-slate-400 text-center">
              Questo avviso non apparirà per le prossime 24 ore
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
