"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAssistant, type ChatMessage } from "~/hooks/useAssistant";

const QUICK_SUGGESTIONS = [
  "Prossime pulizie",
  "Prossimi ospiti",
  "Problemi aperti",
  "Spese ultimi 3 mesi",
];

function formatText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part.split("\n").map((line, j, arr) => (
      <span key={`${i}-${j}`}>
        {line}
        {j < arr.length - 1 && <br />}
      </span>
    ));
  });
}

function MessageBubble({ message }: { message: ChatMessage & { isLoading?: boolean } }) {
  const isAssistant = message.role === "assistant";

  if ((message as any).isLoading) {
    return (
      <div className="flex gap-2 items-end">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
          <span className="text-[8px] text-white font-bold">AI</span>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-sm px-3 py-2.5 shadow-sm">
          <div className="flex gap-1 items-center h-3">
            <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    );
  }

  if (isAssistant) {
    return (
      <div className="flex gap-2 items-start">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-[8px] text-white font-bold">AI</span>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-sm px-3 py-2.5 shadow-sm max-w-[85%]">
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
      <div className="bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl rounded-br-sm px-3 py-2.5 shadow-sm max-w-[85%]">
        <p className="text-sm text-white leading-relaxed">{message.content}</p>
        <p className="text-[10px] text-violet-200 mt-1 text-right">
          {message.timestamp.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

export function AssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  // panelStyle: posizione calcolata dinamicamente con Visual Viewport API
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const { messages, isLoading, sendMessage, clearHistory } = useAssistant();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

  // Visual Viewport API — posiziona il pannello DENTRO il visual viewport visibile
  // In questo modo rimane sempre sopra la tastiera, indipendentemente dalla navbar
  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;

    const updatePanel = () => {
      const vv = window.visualViewport;
      if (!vv) {
        // Fallback senza Visual Viewport API
        setPanelStyle({ bottom: "140px" });
        return;
      }
      // Il pannello deve stare dentro il visual viewport:
      // top del pannello = vv.offsetTop + 8px di margine
      // bottom del pannello = vv.offsetTop + vv.height - 8px di margine
      // Usiamo position fixed con top calcolato per stare dentro il viewport visibile
      const vpTop = vv.offsetTop;
      const vpHeight = vv.height;
      const MARGIN = 8;
      const MAX_HEIGHT = Math.max(200, vpHeight - 16);

      setPanelStyle({
        position: "fixed",
        top: vpTop + MARGIN,
        left: MARGIN,
        right: MARGIN,
        bottom: "auto",
        height: MAX_HEIGHT,
        maxHeight: MAX_HEIGHT,
        transition: "top 0.15s ease, height 0.15s ease",
      });
    };

    const vv = window.visualViewport;
    vv?.addEventListener("resize", updatePanel);
    vv?.addEventListener("scroll", updatePanel);
    updatePanel();

    return () => {
      vv?.removeEventListener("resize", updatePanel);
      vv?.removeEventListener("scroll", updatePanel);
      setPanelStyle({});
    };
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

  return (
    <>
      <style>{`
        .ai-chat-panel {
          position: fixed;
          z-index: 199;
          display: flex;
          flex-direction: column;
          background: #f8fafc;
          box-shadow: 0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
          border: 1px solid rgba(226,232,240,0.8);
          overflow: hidden;
          border-radius: 18px;
        }
        @media (min-width: 1024px) {
          .ai-chat-panel {
            top: auto !important;
            height: auto !important;
            bottom: 88px !important;
            right: 24px !important;
            left: auto !important;
            width: 360px;
            max-height: 500px;
        }
        .ai-fab {
          position: fixed;
          right: 12px;
          z-index: 200;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0 12px 0 8px;
          height: 44px;
          border-radius: 22px;
          background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
          box-shadow: 0 4px 20px rgba(109,40,217,0.45), 0 2px 6px rgba(0,0,0,0.12);
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          bottom: calc(76px + 6px);
        }
        @media (min-width: 1024px) {
          .ai-fab { bottom: 24px; }
        }
        .ai-fab:active { transform: scale(0.95); }
        .ai-fab.open {
          background: linear-gradient(135deg, #475569 0%, #334155 100%);
          box-shadow: 0 4px 14px rgba(0,0,0,0.2);
        }
      `}</style>

      {/* FAB */}
      <button
        className={`ai-fab ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(prev => !prev)}
        aria-label="Assistente AI"
      >
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {isOpen ? (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1 1l9 9M10 1L1 10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" fill="white" opacity="0.95"/>
              <circle cx="19.5" cy="4.5" r="1.5" fill="white" opacity="0.65"/>
              <circle cx="5" cy="18.5" r="1" fill="white" opacity="0.45"/>
            </svg>
          )}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: "white", letterSpacing: "0.2px", whiteSpace: "nowrap" }}>
          {isOpen ? "Chiudi" : "Assistente AI"}
        </span>
      </button>

      {/* PANNELLO CHAT */}
      {isOpen && (
        <div className="ai-chat-panel" style={panelStyle}>

          {/* Header */}
          <div style={{ flexShrink: 0, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" fill="white"/>
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "white", lineHeight: 1.2 }}>Assistente AI</p>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", display: "inline-block" }} />
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.65)" }}>Online</p>
                </div>
              </div>
            </div>
            <button
              onClick={clearHistory}
              style={{ padding: 6, borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center" }}
              title="Nuova conversazione"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* Messaggi */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 10, background: "#f8fafc", minHeight: 0 }}>
            {messages.map((msg: ChatMessage) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {showSuggestions && (
              <div style={{ paddingTop: 4 }}>
                <p style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginBottom: 8 }}>Suggerimenti rapidi</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                  {QUICK_SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      style={{ padding: "4px 10px", background: "white", border: "1px solid #e2e8f0", borderRadius: 20, fontSize: 11, color: "#475569", cursor: "pointer" }}
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
          <div style={{ flexShrink: 0, padding: "8px 10px", background: "white", borderTop: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Scrivi un messaggio..."
                rows={1}
                disabled={isLoading}
                style={{ flex: 1, resize: "none", fontSize: 13, padding: "8px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, outline: "none", maxHeight: 68, overflowY: "auto", fontFamily: "inherit", color: "#1e293b" }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, #7c3aed, #4f46e5)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: (!input.trim() || isLoading) ? 0.4 : 1, transition: "opacity 0.2s" }}
              >
                {isLoading ? (
                  <svg className="animate-spin" width="13" height="13" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4" />
                    <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg width="13" height="13" fill="none" stroke="white" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
            <p style={{ fontSize: 9, color: "#94a3b8", textAlign: "center", marginTop: 4 }}>
              Enter per inviare · Shift+Enter per nuova riga
            </p>
          </div>

        </div>
      )}
    </>
  );
}
