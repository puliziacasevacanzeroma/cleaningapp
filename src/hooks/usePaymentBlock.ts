"use client";

/**
 * usePaymentBlock — Legge il campo paymentBlock dal documento utente in realtime.
 *
 * Il campo paymentBlock è SEPARATO dallo status utente (ACTIVE/SUSPENDED):
 * - status: "SUSPENDED" → blocco admin manuale, l'utente NON può fare login
 * - paymentBlock.active: true → blocco per morosità, l'utente PUÒ fare login
 *   ma vede solo la pagina pagamenti
 *
 * Il blocco si rimuove automaticamente quando:
 * 1. L'admin registra un pagamento che azzera i debiti scaduti
 * 2. L'admin sblocca manualmente (overriddenByAdmin: true)
 */

import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export interface PaymentBlockData {
  active: boolean;
  since?: Date | null;
  reason?: string | null;
  overriddenByAdmin: boolean;
  overriddenAt?: Date | null;
}

export interface UsePaymentBlockResult {
  /** true se l'account è bloccato per morosità E non è stato sbloccato dall'admin */
  isBlocked: boolean;
  /** Dati grezzi del blocco (null se il campo non esiste) */
  blockData: PaymentBlockData | null;
  /** true durante il primo caricamento */
  isLoading: boolean;
}

export function usePaymentBlock(userId: string | undefined): UsePaymentBlockResult {
  const [blockData, setBlockData] = useState<PaymentBlockData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      setBlockData(null);
      return;
    }

    // Reset loading quando userId cambia
    setIsLoading(true);

    const unsubscribe = onSnapshot(
      doc(db, "users", userId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const pb = data.paymentBlock;
          
          if (pb && typeof pb === "object") {
            setBlockData({
              active: pb.active === true,
              since: pb.since?.toDate?.() || null,
              reason: pb.reason || null,
              overriddenByAdmin: pb.overriddenByAdmin === true,
              overriddenAt: pb.overriddenAt?.toDate?.() || null,
            });
          } else {
            setBlockData(null);
          }
        } else {
          setBlockData(null);
        }
        setIsLoading(false);
      },
      (error) => {
        console.error("usePaymentBlock: errore listener", error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  const isBlocked = blockData !== null 
    && blockData.active === true 
    && blockData.overriddenByAdmin !== true;

  return { isBlocked, blockData, isLoading };
}
