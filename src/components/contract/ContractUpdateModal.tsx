/**
 * ContractUpdateModal
 * 
 * Modal bloccante che appare quando c'è una nuova versione del regolamento.
 * L'utente non può chiuderlo senza accettare il nuovo regolamento.
 */

"use client";

import React from "react";
import { useRouter } from "next/navigation";

// ==================== TIPI ====================

export interface ContractUpdateModalProps {
  /** Se il modal è visibile */
  isOpen: boolean;
  
  /** Versione corrente del regolamento */
  currentVersion: string;
  
  /** Versione accettata dall'utente */
  userVersion?: string;
  
  /** Changelog delle modifiche */
  changelog?: string;
  
  /** Titolo del documento */
  documentTitle?: string;
}

// ==================== COMPONENTE ====================

export function ContractUpdateModal({
  isOpen,
  currentVersion,
  userVersion,
  changelog,
  documentTitle = "Regolamento Operativo",
}: ContractUpdateModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const handleAccept = () => {
    router.push("/accept-contract");
  };

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto">
      {/* Overlay scuro */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />
      
      {/* Contenitore centrato */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
          
          {/* Header con icona */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-4">
              <svg 
                className="w-8 h-8 text-white" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white">
              Aggiornamento Regolamento
            </h2>
            <p className="text-white/80 mt-2">
              È richiesta la tua attenzione
            </p>
          </div>

          {/* Contenuto */}
          <div className="px-6 py-6">
            <div className="text-center mb-6">
              <p className="text-gray-700 text-lg">
                È stata pubblicata una <strong>nuova versione</strong> del
              </p>
              <p className="text-xl font-semibold text-gray-900 mt-1">
                {documentTitle}
              </p>
            </div>

            {/* Badge versioni */}
            <div className="flex items-center justify-center gap-4 mb-6">
              {userVersion && (
                <div className="text-center">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">
                    Versione accettata
                  </span>
                  <div className="mt-1 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
                    v{userVersion}
                  </div>
                </div>
              )}
              
              <div className="text-gray-300">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              
              <div className="text-center">
                <span className="text-xs text-gray-500 uppercase tracking-wide">
                  Nuova versione
                </span>
                <div className="mt-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-bold">
                  v{currentVersion}
                </div>
              </div>
            </div>

            {/* Changelog */}
            {changelog && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Modifiche principali:
                </h3>
                <p className="text-sm text-gray-600 whitespace-pre-line">
                  {changelog}
                </p>
              </div>
            )}

            {/* Avviso */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-blue-700">
                  Per continuare a utilizzare l'applicazione, è necessario leggere e accettare la nuova versione del regolamento.
                </p>
              </div>
            </div>

            {/* Bottone */}
            <button
              onClick={handleAccept}
              className="w-full py-4 px-6 bg-gradient-to-r from-sky-500 to-blue-600 text-white font-semibold rounded-xl hover:from-sky-600 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Leggi e accetta nuovo regolamento
            </button>

            <p className="text-center text-xs text-gray-400 mt-4">
              Non puoi continuare senza accettare il regolamento aggiornato
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ContractUpdateModal;
