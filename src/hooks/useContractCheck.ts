/**
 * useContractCheck Hook
 * 
 * Hook per verificare se l'utente deve accettare un contratto nuovo/aggiornato.
 * Gestisce anche il salvataggio delle info utente nel cookie per il middleware.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import type { RegulationDocument, ContractAcceptance } from "~/types/contract";

// ==================== TIPI ====================

export interface ContractCheckResult {
  /** Se sta caricando */
  loading: boolean;
  
  /** Se c'è un errore */
  error: string | null;
  
  /** Se deve accettare il contratto */
  needsAcceptance: boolean;
  
  /** Se c'è una nuova versione (aveva già accettato una precedente) */
  isUpdate: boolean;
  
  /** Documento corrente */
  currentDocument: RegulationDocument | null;
  
  /** Accettazione precedente (se esiste) */
  previousAcceptance: ContractAcceptance | null;
  
  /** Funzione per ri-verificare */
  recheck: () => Promise<void>;
}

// ==================== COOKIE HELPER ====================

/**
 * Salva le info utente nel cookie per il middleware
 */
function saveUserInfoCookie(userInfo: {
  uid: string;
  role: string;
  status: string;
  contractAccepted: boolean;
  contractVersion?: string;
}) {
  if (typeof document === "undefined") return;
  
  const cookieValue = JSON.stringify(userInfo);
  // Cookie valido per 7 giorni
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `user-info=${encodeURIComponent(cookieValue)}; path=/; expires=${expires}; SameSite=Lax`;
}

/**
 * Rimuove il cookie info utente
 */
export function clearUserInfoCookie() {
  if (typeof document === "undefined") return;
  document.cookie = "user-info=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

// ==================== HOOK ====================

export function useContractCheck(): ContractCheckResult {
  const { user, userData } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsAcceptance, setNeedsAcceptance] = useState(false);
  const [isUpdate, setIsUpdate] = useState(false);
  const [currentDocument, setCurrentDocument] = useState<RegulationDocument | null>(null);
  const [previousAcceptance, setPreviousAcceptance] = useState<ContractAcceptance | null>(null);

  // Funzione per verificare lo stato del contratto
  const checkContract = useCallback(async () => {
    if (!user) {
      setLoading(false);
      clearUserInfoCookie();
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const token = await user.getIdToken();
      
      const response = await fetch("/api/contract/current", {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Errore verifica contratto");
      }

      const data = await response.json();

      setCurrentDocument(data.document);
      setPreviousAcceptance(data.userAcceptance);
      setNeedsAcceptance(data.needsAcceptance);
      
      // Determina se è un aggiornamento (aveva già accettato una versione precedente)
      setIsUpdate(
        data.needsAcceptance && 
        data.userAcceptance !== null && 
        data.userAcceptance.status === "expired"
      );

      // Aggiorna il cookie per il middleware
      if (userData) {
        saveUserInfoCookie({
          uid: user.uid,
          role: userData.role || "",
          status: userData.status || "",
          contractAccepted: !data.needsAcceptance,
          contractVersion: data.userAcceptance?.documentVersion,
        });
      }

    } catch (err) {
      console.error("Errore verifica contratto:", err);
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  }, [user, userData]);

  // Verifica al mount e quando cambia l'utente
  useEffect(() => {
    checkContract();
  }, [checkContract]);

  // Aggiorna il cookie quando cambiano i dati utente
  useEffect(() => {
    if (user && userData) {
      saveUserInfoCookie({
        uid: user.uid,
        role: userData.role || "",
        status: userData.status || "",
        contractAccepted: userData.contractAcceptance?.accepted || false,
        contractVersion: userData.contractAcceptance?.version,
      });
    }
  }, [user, userData]);

  return {
    loading,
    error,
    needsAcceptance,
    isUpdate,
    currentDocument,
    previousAcceptance,
    recheck: checkContract,
  };
}

export default useContractCheck;
