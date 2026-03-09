"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAssistant, type ChatMessage } from "~/hooks/useAssistant";

// ═══════════════════════════════
// SUGGERIMENTI RAPIDI
// ═══════════════════════════════
const QUICK_SUGGESTIONS = [
  "Prossime pulizie",
  "Prossimi ospiti",
  "Problemi aperti",
  "Spese ultimi 3 mesi",
];

// ═══════════════════════════════
// FORMATTA TESTO — markdown semplice
// ═══════════════════════════════
function formatText(text: string) {
  // Bold **testo**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    // Converti newline in <br>
    return part.split("\n").map((line, j) => (
      <span key={`${i}-${j}`}>
        {line}
        {j < part.split("\n").length - 1 && <br />}
      </span>
    ));
  });
}

// ═══════════════════════════════
// BUBBLE MESSAGGIO
// ═══════════════════════════════
function MessageBubble({ message }: { message: { role: string; content: string; timestamp: Date; isLoading?: boolean } }) {
  const isAssistant = message.role === "assistant";

  if (message.isLoading) {
    return (
      <div className="flex gap-2 items-end">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
          <span className="text-[10px] text-white font-bold">AI</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
          <div className="flex gap-1 items-center h-4">
            <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    );
  }

  if (isAssistant) {
    return (
      <div className="flex gap-2 items-end">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm self-start mt-0.5">
          <span className="text-[10px] text-white font-bold">AI</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm max-w-[85%]">
          <p className="text-sm text-slate-700 leading-relaxed">{formatText(message.content)}</p>
          <p className="text-[10px] text-slate-400 mt-1">
            {message.timestamp.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <div className="bg-gradient-to-br from-sky-500 to-indigo-600 rounded-2xl rounded-br-sm px-4 py-3 shadow-sm max-w-[85%]">
        <p className="text-sm text-white leading-relaxed">{message.content}</p>
        <p className="text-[10px] text-sky-200 mt-1 text-right">
          {message.timestamp.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════
// WIDGET PRINCIPALE
// ═══════════════════════════════
export function AssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const { messages, isLoading, sendMessage, clearHistory } = useAssistant();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll automatico ai nuovi messaggi
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input quando apre
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    sendMessage(text);
  }, [input, isLoading, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleSuggestion = useCallback((text: string) => {
    sendMessage(text);
  }, [sendMessage]);

  const showSuggestions = messages.length <= 1 && !isLoading;

  return (
    <>
      {/* ═══ FAB BUTTON ═══ */}
      <button
        onClick={() => setIsOpen((prev: boolean) => !prev)}
        className={`fixed bottom-[76px] right-4 z-[200] w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 active:scale-95 lg:bottom-6 lg:right-6 ${
          isOpen
            ? "bg-slate-700 rotate-0"
            : "bg-gradient-to-br from-sky-500 to-indigo-600"
        }`}
        aria-label="Assistente virtuale"
      >
        {isOpen ? (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* ═══ PANNELLO CHAT ═══ */}
      {isOpen && (
        <>
          {/* BUG 6 FIX: la class media query va sul div fixed stesso */}
          <style>{`
            .assistant-chat-panel {
              position: fixed;
              z-index: 199;
              display: flex;
              flex-direction: column;
              background: white;
              box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
              border: 1px solid #e2e8f0;
              overflow: hidden;
              border-radius: 20px;
              bottom: calc(76px + 64px + 8px);
              right: 8px;
              left: 8px;
              max-height: 60vh;
            }
            @media (min-width: 1024px) {
              .assistant-chat-panel {
                bottom: 88px;
                right: 24px;
                left: auto;
                width: 380px;
                max-height: 520px;
              }
            }
          `}</style>
          <div className="assistant-chat-panel">
          <div className="flex flex-col h-full" style={{ maxHeight: "inherit" }}>

            {/* Header */}
            <div className="flex-shrink-0 px-4 py-3 bg-gradient-to-r from-sky-500 to-indigo-600 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Assistente</p>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="text-[10px] text-sky-100">Online</p>
                  </div>
                </div>
              </div>
              <button
                onClick={clearHistory}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                title="Nuova conversazione"
              >
                <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            {/* Messaggi */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-slate-50">
              {messages.map((msg: ChatMessage) => (
                <div key={msg.id}>
                  <MessageBubble message={msg} />
                </div>
              ))}

              {/* Suggerimenti rapidi */}
              {showSuggestions && (
                <div className="pt-1">
                  <p className="text-[10px] text-slate-400 text-center mb-2">Suggerimenti rapidi</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {QUICK_SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => handleSuggestion(s)}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-600 hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50 transition-colors shadow-sm"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 px-3 py-2.5 bg-white border-t border-slate-100">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Scrivi un messaggio..."
                  rows={1}
                  disabled={isLoading}
                  className="flex-1 resize-none text-sm px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-transparent disabled:opacity-50 placeholder-slate-400"
                  style={{ maxHeight: "80px", overflowY: "auto" }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center flex-shrink-0 disabled:opacity-40 active:scale-95 transition-all shadow-sm"
                >
                  {isLoading ? (
                    <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="text-[9px] text-slate-400 text-center mt-1.5">
                Invio con Enter · Shift+Enter per nuova riga
              </p>
            </div>
          </div>
          </div>
        </>
      )}
    </>
  );
}
