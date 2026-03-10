"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAssistant, type ChatMessage } from "~/hooks/useAssistant";

const QUICK_SUGGESTIONS = [
  "Prossime pulizie",
  "Quanto devo pagare?",
  "Inserisci nuova pulizia",
  "Prossimi ospiti",
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
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 8, color: "white", fontWeight: 700 }}>AI</span>
        </div>
        <div style={{ background: "white", border: "1px solid #f1f5f9", borderRadius: "16px 16px 16px 4px", padding: "8px 12px" }}>
          <div style={{ display: "flex", gap: 4, alignItems: "center", height: 12 }}>
            {[0, 150, 300].map(d => (
              <span key={d} style={{ width: 6, height: 6, background: "#a78bfa", borderRadius: "50%", display: "inline-block", animation: "aiBounce 1.2s infinite", animationDelay: `${d}ms` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (isAssistant) {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
          <span style={{ fontSize: 8, color: "white", fontWeight: 700 }}>AI</span>
        </div>
        <div style={{ background: "white", border: "1px solid #f1f5f9", borderRadius: "16px 16px 16px 4px", padding: "8px 12px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", maxWidth: "85%" }}>
          <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.55, margin: 0 }}>{formatText(message.content)}</p>
          <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 4, marginBottom: 0 }}>
            {message.timestamp.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", borderRadius: "16px 16px 4px 16px", padding: "8px 12px", maxWidth: "85%" }}>
        <p style={{ fontSize: 13, color: "white", lineHeight: 1.55, margin: 0 }}>{message.content}</p>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 4, marginBottom: 0, textAlign: "right" }}>
          {message.timestamp.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

// ─── Bottone header — pillola con testo ───
export function AssistantHeaderButton({ onClick, isOpen, id }: { onClick: () => void; isOpen: boolean; id?: string }) {
  return (
    <>
      <style>{`
        @keyframes orbFloat {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.06); }
        }
        #ai-header-btn.plasma-btn {
          position: relative;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 14px 0 5px;
          height: 36px;
          border-radius: 18px;
          cursor: pointer;
          border: 1.5px solid #e2e8f0;
          background: #ffffff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.07);
          transition: border-color 0.2s, box-shadow 0.2s;
          flex-shrink: 0;
          overflow: visible;
        }
        #ai-header-btn.plasma-btn:hover {
          border-color: #c4b5fd;
          box-shadow: 0 1px 8px rgba(124,58,237,0.12);
        }
        #ai-header-btn.plasma-btn.open-state {
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          border-color: transparent;
          box-shadow: none;
        }
        .plasma-inner {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .plasma-orb {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          position: relative;
          animation: orbFloat 3s ease-in-out infinite;
        }
        .plasma-orb-text {
          font-size: 9px;
          font-weight: 300;
          color: white;
          letter-spacing: 0.1em;
          line-height: 1;
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          user-select: none;
        }
        .plasma-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #22c55e;
          position: absolute;
          top: -1px;
          right: -1px;
          border: 1.5px solid white;
        }
        .plasma-label {
          font-size: 12.5px;
          font-weight: 600;
          color: #3b1f6e;
          white-space: nowrap;
          letter-spacing: -0.01em;
        }
      `}</style>
      <button
        onClick={onClick}
        id={id}
        aria-label="Assistente AI"
        className={`plasma-btn${isOpen ? " open-state" : ""}`}
      >
        <div className="plasma-inner">
          {isOpen ? (
            <span style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
            </span>
          ) : (
            <div className="plasma-orb">
              <span className="plasma-orb-text">AI</span>
              <span className="plasma-dot" />
            </div>
          )}
          <span className={isOpen ? undefined : "plasma-label"}
                style={isOpen ? { fontSize: 12.5, fontWeight: 700, color: "white", whiteSpace: "nowrap" } : undefined}>
            Assistente AI
          </span>
        </div>
      </button>
    </>
  );
}

// ─── Pannello chat principale ───
export function AssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const { messages, isLoading, sendMessage, clearHistory } = useAssistant();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

  // ── Visual Viewport API — fix tastiera Android ──
  // Il pannello usa top+height calcolati dalla viewport visuale reale,
  // NON da 100vh (che non cambia con la tastiera su Android).
  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;

    const HEADER_H = 56;  // altezza header px
    const NAVBAR_H = 64;  // altezza navbar mobile px
    const GAP = 4;

    const update = () => {
      const vv = window.visualViewport;
      if (!vv) {
        // Fallback senza Visual Viewport API
        setPanelStyle({ top: HEADER_H, left: 0, right: 0, bottom: NAVBAR_H });
        return;
      }

      // vv.offsetTop: quanto la viewport visuale è scesa dall'alto (scroll + tastiera)
      // vv.height: altezza visibile della viewport (si riduce con la tastiera)
      const panelTop = HEADER_H; // sempre sotto l'header
      const availableHeight = vv.height - HEADER_H - GAP;
      // Con tastiera aperta: bottom della tastiera = window.innerHeight - vv.height - vv.offsetTop
      // Ma usando top+height fissi rispetto alla viewport visuale è più semplice:
      // Il pannello sta sempre dentro la viewport visuale visibile.
      const isMobileWidth = window.innerWidth < 768;

      if (isMobileWidth) {
        setPanelStyle({
          position: "fixed",
          top: vv.offsetTop + HEADER_H,
          left: 0,
          right: 0,
          height: Math.max(200, availableHeight),
          zIndex: 200,
        });
      } else {
        // Desktop: pannello a destra, larghezza fissa
        setPanelStyle({
          position: "fixed",
          top: HEADER_H,
          right: 12,
          width: 360,
          maxHeight: `calc(100vh - ${HEADER_H}px - ${NAVBAR_H}px - ${GAP * 2}px)`,
          zIndex: 200,
        });
      }
    };

    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    update();

    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      setPanelStyle({});
    };
  }, [isOpen]);

  // Chiudi cliccando fuori
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        const btn = document.getElementById("ai-header-btn");
        if (btn && btn.contains(target)) return;
        setIsOpen(false);
        _globalOnClose?.();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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

  const showSuggestions = messages.length <= 1 && !isLoading;

  return (
    <>
      <style>{`
        @keyframes aiSlideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes aiBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
        @keyframes aiSpin {
          to { transform: rotate(360deg); }
        }
        .ai-panel {
          display: flex;
          flex-direction: column;
          background: #f8fafc;
          box-shadow: 0 8px 40px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08);
          border: 1px solid #e2e8f0;
          overflow: hidden;
          animation: aiSlideDown 0.2s ease forwards;
        }
        @media (max-width: 767px) {
          .ai-panel {
            border-radius: 0 0 16px 16px;
            border-top: none;
            border-left: none;
            border-right: none;
          }
        }
        @media (min-width: 768px) {
          .ai-panel {
            border-radius: 0 0 20px 20px;
            border-top: none;
          }
        }
      `}</style>

      {isOpen && (
        <div ref={panelRef} className="ai-panel" style={panelStyle}>

          {/* Header pannello */}
          <div style={{ flexShrink: 0, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" fill="white"/>
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "white", lineHeight: 1.2, margin: 0 }}>Assistente AI</p>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", display: "inline-block" }} />
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", margin: 0 }}>Online</p>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={clearHistory} title="Nuova conversazione"
                style={{ padding: 6, borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center" }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button onClick={() => { setIsOpen(false); _globalOnClose?.(); }} title="Chiudi"
                style={{ padding: 6, borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center" }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messaggi */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
            {messages.map((msg: ChatMessage) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {showSuggestions && (
              <div style={{ paddingTop: 4 }}>
                <p style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginBottom: 8 }}>Suggerimenti rapidi</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                  {QUICK_SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => sendMessage(s)}
                      style={{ padding: "5px 12px", background: "white", border: "1px solid #e2e8f0", borderRadius: 20, fontSize: 12, color: "#475569", cursor: "pointer" }}>
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
              <button onClick={handleSend} disabled={!input.trim() || isLoading}
                style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #7c3aed, #4f46e5)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: (!input.trim() || isLoading) ? 0.4 : 1, transition: "opacity 0.2s" }}>
                {isLoading ? (
                  <svg style={{ animation: "aiSpin 1s linear infinite" }} width="13" height="13" fill="none" viewBox="0 0 24 24">
                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="white" strokeWidth="4" />
                    <path style={{ opacity: 0.75 }} fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg width="13" height="13" fill="none" stroke="white" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
            <p style={{ fontSize: 9, color: "#94a3b8", textAlign: "center", marginTop: 4, marginBottom: 0, display: "none" }} className="md:block">
              Enter per inviare · Shift+Enter per nuova riga
            </p>
          </div>
        </div>
      )}

      <AssistantWidgetController isOpen={isOpen} setIsOpen={setIsOpen} />
    </>
  );
}

let _globalToggle: (() => void) | null = null;
export function triggerAssistant() { _globalToggle?.(); }

// Callback chiamato quando il pannello si chiude dall'interno (pulsante X interno)
// Il layout si registra qui per sincronizzare il proprio stato isAssistantOpen
let _globalOnClose: (() => void) | null = null;
export function onAssistantClose(cb: (() => void) | null) { _globalOnClose = cb; }

function AssistantWidgetController({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (v: boolean) => void }) {
  useEffect(() => {
    _globalToggle = () => setIsOpen(!isOpen);
    return () => { _globalToggle = null; };
  }, [isOpen, setIsOpen]);
  return null;
}
