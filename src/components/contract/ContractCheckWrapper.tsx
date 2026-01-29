/**
 * ContractCheckWrapper
 * 
 * Componente wrapper che verifica lo stato del contratto e mostra
 * il modal di aggiornamento se necessario.
 * 
 * Uso nei layout:
 * <ContractCheckWrapper>
 *   {children}
 * </ContractCheckWrapper>
 */

"use client";

import React from "react";
import { useContractCheck } from "~/hooks/useContractCheck";
import { ContractUpdateModal } from "./ContractUpdateModal";

// ==================== TIPI ====================

export interface ContractCheckWrapperProps {
  children: React.ReactNode;
  
  /** Se mostrare il modal per aggiornamenti (default: true) */
  showUpdateModal?: boolean;
  
  /** Se bloccare l'accesso finché non accetta (default: false, gestito dal middleware) */
  blockAccess?: boolean;
}

// ==================== COMPONENTE ====================

export function ContractCheckWrapper({
  children,
  showUpdateModal = true,
  blockAccess = false,
}: ContractCheckWrapperProps) {
  const {
    loading,
    needsAcceptance,
    isUpdate,
    currentDocument,
    previousAcceptance,
  } = useContractCheck();

  // Se sta caricando, mostra i children (il middleware gestisce il redirect)
  if (loading) {
    return <>{children}</>;
  }

  // Se deve accettare ed è un aggiornamento, mostra il modal
  if (showUpdateModal && needsAcceptance && isUpdate && currentDocument) {
    return (
      <>
        {/* Mostra il contenuto dietro (sfocato dal modal) */}
        {!blockAccess && children}
        
        {/* Modal aggiornamento */}
        <ContractUpdateModal
          isOpen={true}
          currentVersion={currentDocument.version}
          userVersion={previousAcceptance?.documentVersion}
          changelog={currentDocument.changelog}
          documentTitle={currentDocument.title}
        />
      </>
    );
  }

  // Se deve accettare e blockAccess è true, mostra messaggio
  if (blockAccess && needsAcceptance) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500 mx-auto mb-4" />
          <p className="text-gray-600">Reindirizzamento...</p>
        </div>
      </div>
    );
  }

  // Altrimenti, mostra i children normalmente
  return <>{children}</>;
}

export default ContractCheckWrapper;
