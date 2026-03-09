"use client";

import { useState, useCallback, useRef } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

export function useAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Ciao! Sono il tuo assistente. Posso aiutarti a consultare pulizie, pagamenti e proprietà, oppure eseguire azioni come spostare una pulizia o richiedere materiali. Come posso aiutarti?",
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mantiene la storia nel formato atteso dall'API (solo user/assistant, no loading)
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);

  const sendMessage = useCallback(async (userText: string) => {
    if (!userText.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userText.trim(),
      timestamp: new Date(),
    };

    const loadingMsg: ChatMessage = {
      id: `loading-${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages((prev: ChatMessage[]) => [...prev, userMsg, loadingMsg]);
    setIsLoading(true);
    setError(null);

    // Aggiorna storia per l'API
    historyRef.current = [
      ...historyRef.current,
      { role: "user", content: userText.trim() },
    ];

    try {
      const res = await fetch("/api/proprietario/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyRef.current }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Errore ${res.status}`);
      }

      const data = await res.json();
      const reply = data.reply || "Non ho capito, puoi ripetere?";

      // Aggiorna storia con risposta
      historyRef.current = [
        ...historyRef.current,
        { role: "assistant", content: reply },
      ];

      // Sostituisce il loading con la risposta reale
      setMessages((prev: ChatMessage[]) =>
        prev.map((m: ChatMessage) => m.isLoading ? { ...m, content: reply, isLoading: false } : m)
      );
    } catch (err: any) {
      const errMsg = err.message || "Errore di connessione. Riprova.";
      setError(errMsg);
      setMessages((prev: ChatMessage[]) =>
        prev.map((m: ChatMessage) =>
          m.isLoading
            ? { ...m, content: `⚠️ ${errMsg}`, isLoading: false }
            : m
        )
      );
      // BUG 5 FIX: rimuovi il messaggio utente dalla storia (ne era stato aggiunto 1, non 2)
      historyRef.current = historyRef.current.slice(0, -1);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    setMessages([
      {
        id: "welcome-new",
        role: "assistant",
        content: "Chat resettata. Come posso aiutarti?",
        timestamp: new Date(),
      },
    ]);
    setError(null);
  }, []);

  return { messages, isLoading, error, sendMessage, clearHistory };
}
