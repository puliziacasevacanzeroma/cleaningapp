"use client";

import { memo } from "react";

interface GuestSuccessToastProps {
  count: number;
  propertyName: string;
  onClose: () => void;
}

export const GuestSuccessToast = memo(function GuestSuccessToast({ count, propertyName, onClose }: GuestSuccessToastProps) {
  return (
    <>
      <style>{`
        @keyframes gst-overlay { 0%{opacity:0} 100%{opacity:1} }
        @keyframes gst-pop { 0%{opacity:0;transform:scale(.6)} 50%{transform:scale(1.03)} 100%{opacity:1;transform:scale(1)} }
        @keyframes gst-check { 0%{opacity:0;transform:scale(0)} 100%{opacity:1;transform:scale(1)} }
        @keyframes gst-stroke { 0%{stroke-dashoffset:30} 100%{stroke-dashoffset:0} }
        @keyframes gst-bar { 0%{transform:scaleX(1)} 100%{transform:scaleX(0)} }
        @keyframes gst-text { 0%{opacity:0;transform:translateY(6px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes gst-out { 0%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(.9)} }
      `}</style>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 80,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          background: "rgba(0,0,0,0.2)",
          animation: "gst-overlay .15s ease both",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#fff", borderRadius: 24, width: "100%", maxWidth: 240,
            overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            animation: "gst-pop .3s cubic-bezier(.17,.67,.29,1.2) both",
          }}
        >
          <div style={{ padding: "28px 20px 20px", textAlign: "center" }}>
            {/* Check circle */}
            <div style={{
              width: 56, height: 56, margin: "0 auto 12px", borderRadius: "50%",
              background: "linear-gradient(135deg, #10b981, #059669)",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "gst-check .25s cubic-bezier(.17,.67,.29,1.2) .08s both",
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                style={{ animation: "gst-stroke .3s ease .2s both" }}
              >
                <path d="M5 13l4 4L19 7" style={{ strokeDasharray: 30, strokeDashoffset: 30, animation: "gst-stroke .3s ease .2s forwards" }} />
              </svg>
            </div>

            {/* Text */}
            <p style={{
              fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "0 0 8px",
              animation: "gst-text .2s ease .15s both",
            }}>
              Ospiti confermati!
            </p>

            {/* Badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 99,
              background: "#ecfdf5", border: "1px solid #a7f3d0",
              animation: "gst-text .2s ease .2s both",
            }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#059669" }}>{count}</span>
              <span style={{ fontSize: 11, color: "#059669" }}>{count === 1 ? "ospite" : "ospiti"}</span>
            </div>

            {propertyName && (
              <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 10, animation: "gst-text .2s ease .25s both" }}>
                {propertyName}
              </p>
            )}
          </div>

          {/* Progress bar 1.8s */}
          <div style={{
            height: 3, background: "#34d399", transformOrigin: "left",
            animation: "gst-bar 1.8s linear forwards",
          }} />
        </div>
      </div>
    </>
  );
});
