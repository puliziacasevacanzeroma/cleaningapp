"use client";

import { useState, useEffect } from 'react';
import { useQueryClient } from "@tanstack/react-query";
import { collection, getDocs, query, orderBy, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

interface WelcomeSplashProps {
  userName: string;
  userId?: string;
  destination: string;
  onComplete: () => void;
}

export function WelcomeSplash({ userName, userId, destination, onComplete }: WelcomeSplashProps) {
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("Preparazione...");
  const [fadeOut, setFadeOut] = useState(false);
  const queryClient = useQueryClient();

  const firstName = userName.split(" ")[0];

  useEffect(() => {
    const prefetchData = async () => {
      try {
        // ============================================
        // STEP 1: CARICA PROPRIETÀ (per admin e tutti)
        // Query key: ["properties"] - DEVE CORRISPONDERE a queries.ts!
        // ============================================
        setLoadingText("Caricamento proprietà...");
        setProgress(20);

        const propertiesSnapshot = await getDocs(query(
          collection(db, "properties"),
          orderBy("name", "asc")
        ));

        const activeProperties: any[] = [];
        const pendingProperties: any[] = [];
        const suspendedProperties: any[] = [];

        propertiesSnapshot.docs.forEach(doc => {
          const data = doc.data();
          const property = {
            id: doc.id,
            ...data,
            cleaningPrice: data.cleaningPrice || 0,
            monthlyTotal: 0,
            cleaningsThisMonth: 0,
            completedThisMonth: 0,
            _count: { bookings: 0, cleanings: 0 },
            owner: { name: data.ownerName || "" },
          };

          switch (data.status) {
            case "ACTIVE": activeProperties.push(property); break;
            case "PENDING": pendingProperties.push(property); break;
            case "SUSPENDED": suspendedProperties.push(property); break;
          }
        });

        // 🔥 USA LA STESSA QUERY KEY DI queries.ts: ["properties"]
        queryClient.setQueryData(["properties"], {
          activeProperties,
          pendingProperties,
          suspendedProperties,
          proprietari: [],
        });

        console.log("✅ Proprietà precaricate:", activeProperties.length, "attive");

        // ============================================
        // STEP 2: CARICA DASHBOARD
        // Query key: ["dashboard"] - DEVE CORRISPONDERE a queries.ts!
        // ============================================
        setLoadingText("Caricamento dashboard...");
        setProgress(50);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const [cleaningsSnapshot, operatorsSnapshot] = await Promise.all([
          getDocs(query(
            collection(db, "cleanings"),
            where("scheduledDate", ">=", Timestamp.fromDate(today)),
            where("scheduledDate", "<", Timestamp.fromDate(tomorrow))
          )),
          getDocs(query(
            collection(db, "users"),
            where("role", "==", "OPERATORE_PULIZIE")
          )),
        ]);

        const propertiesMap = new Map();
        propertiesSnapshot.docs.forEach(doc => {
          propertiesMap.set(doc.id, { id: doc.id, ...doc.data() });
        });

        const cleanings = cleaningsSnapshot.docs.map(doc => {
          const data = doc.data();
          const property = propertiesMap.get(data.propertyId);
          return {
            id: doc.id,
            date: data.scheduledDate?.toDate?.() || new Date(),
            scheduledTime: data.scheduledTime || "10:00",
            status: data.status || "pending",
            guestsCount: data.guestsCount || 2,
            property: {
              id: data.propertyId || "",
              name: data.propertyName || property?.name || "Proprietà",
              address: property?.address || "",
              imageUrl: null,
            },
            operator: data.operatorId ? { 
              id: data.operatorId, 
              name: data.operatorName || "Operatore" 
            } : null,
            operators: [],
            booking: { 
              guestName: data.guestName || "", 
              guestsCount: data.guestsCount || 2 
            },
          };
        });

        const operators = operatorsSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          name: doc.data().name || "Operatore" 
        }));

        // 🔥 USA LA STESSA QUERY KEY DI queries.ts: ["dashboard"]
        queryClient.setQueryData(["dashboard"], {
          stats: {
            cleaningsToday: cleaningsSnapshot.docs.length,
            operatorsActive: operatorsSnapshot.docs.length,
            propertiesTotal: activeProperties.length,
            checkinsWeek: 0,
          },
          cleanings,
          operators,
        });

        console.log("✅ Dashboard precaricata:", cleanings.length, "pulizie oggi");

        // ============================================
        // STEP 3: SE PROPRIETARIO, CARICA ANCHE LE SUE PROPRIETÀ
        // Query key: ["proprietario-properties"]
        // ============================================
        if (userId && destination.includes("proprietario")) {
          setLoadingText("Caricamento tue proprietà...");
          setProgress(75);

          const ownerPropertiesSnapshot = await getDocs(query(
            collection(db, "properties"),
            where("ownerId", "==", userId),
            orderBy("name", "asc")
          ));

          const ownerActive: any[] = [];
          const ownerPending: any[] = [];

          ownerPropertiesSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const property = { 
              id: doc.id, 
              ...data, 
              cleaningPrice: data.cleaningPrice || 0,
              owner: { name: data.ownerName || "" },
            };
            if (data.status === "ACTIVE") ownerActive.push(property);
            else ownerPending.push(property);
          });

          // Per il proprietario
          queryClient.setQueryData(["proprietario-properties"], {
            activeProperties: ownerActive,
            pendingProperties: ownerPending,
          });

          console.log("✅ Proprietà proprietario precaricate:", ownerActive.length);
        }

        // ============================================
        // COMPLETATO!
        // ============================================
        setLoadingText("Tutto pronto!");
        setProgress(100);

        // Breve pausa per mostrare 100%
        await new Promise(r => setTimeout(r, 400));
        
        // Fade out
        setFadeOut(true);
        
        // Aspetta fade out e completa
        await new Promise(r => setTimeout(r, 600));
        onComplete();

      } catch (error) {
        console.error("❌ Errore prefetch:", error);
        // Anche in caso di errore, procedi
        setFadeOut(true);
        setTimeout(onComplete, 500);
      }
    };

    // Avvia subito il prefetch
    prefetchData();
  }, [queryClient, userId, destination, onComplete]);

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-cyan-500 via-sky-600 to-blue-700 transition-opacity duration-700 overflow-hidden ${fadeOut ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
      
      {/* ========== SFONDO ANIMATO ========== */}
      <div className="absolute inset-0 overflow-hidden">
        
        {/* Gradient mesh animato */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-cyan-400/30 via-transparent to-blue-600/30 animate-[gradient-shift_8s_ease_infinite]"></div>
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-tr from-sky-500/20 via-transparent to-indigo-500/20 animate-[gradient-shift_10s_ease_infinite_reverse]"></div>
        </div>

        {/* Onde fluide SVG */}
        <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 320" preserveAspectRatio="none" style={{ height: '35%' }}>
          <path 
            fill="rgba(255,255,255,0.08)" 
            d="M0,160L48,176C96,192,192,224,288,213.3C384,203,480,149,576,138.7C672,128,768,160,864,181.3C960,203,1056,213,1152,197.3C1248,181,1344,139,1392,117.3L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
            className="animate-[wave_10s_ease-in-out_infinite]"
          />
          <path 
            fill="rgba(255,255,255,0.05)" 
            d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,218.7C672,235,768,245,864,234.7C960,224,1056,192,1152,181.3C1248,171,1344,181,1392,186.7L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
            className="animate-[wave_8s_ease-in-out_infinite_reverse]"
          />
          <path 
            fill="rgba(255,255,255,0.03)" 
            d="M0,288L48,272C96,256,192,224,288,229.3C384,235,480,277,576,277.3C672,277,768,235,864,224C960,213,1056,235,1152,250.7C1248,267,1344,277,1392,282.7L1440,288L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
            className="animate-[wave_12s_ease-in-out_infinite]"
          />
        </svg>

        {/* Cerchi concentrici pulsanti */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="w-[600px] h-[600px] rounded-full border border-white/5 animate-[pulse-ring_4s_ease-out_infinite]"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-white/10 animate-[pulse-ring_4s_ease-out_infinite_0.8s]"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-white/10 animate-[pulse-ring_4s_ease-out_infinite_1.6s]"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full border border-white/15 animate-[pulse-ring_4s_ease-out_infinite_2.4s]"></div>
        </div>

        {/* Sfere luminose grandi */}
        <div className="absolute top-10 left-10 w-40 h-40 bg-cyan-300/20 rounded-full blur-3xl animate-[float-smooth_8s_ease-in-out_infinite]"></div>
        <div className="absolute top-20 right-20 w-32 h-32 bg-blue-400/25 rounded-full blur-3xl animate-[float-smooth_6s_ease-in-out_infinite_1s]"></div>
        <div className="absolute bottom-40 left-1/4 w-48 h-48 bg-sky-400/20 rounded-full blur-3xl animate-[float-smooth_7s_ease-in-out_infinite_2s]"></div>
        <div className="absolute bottom-20 right-1/4 w-36 h-36 bg-indigo-400/20 rounded-full blur-3xl animate-[float-smooth_9s_ease-in-out_infinite_0.5s]"></div>
        <div className="absolute top-1/3 left-1/3 w-24 h-24 bg-white/10 rounded-full blur-2xl animate-[float-smooth_5s_ease-in-out_infinite_1.5s]"></div>

        {/* Particelle fluttuanti */}
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/40 animate-[particle-float_4s_ease-in-out_infinite]"
            style={{
              width: `${3 + (i % 4)}px`,
              height: `${3 + (i % 4)}px`,
              left: `${(i * 3.3) % 100}%`,
              top: `${(i * 7.7) % 100}%`,
              animationDuration: `${4 + (i % 4)}s`,
              animationDelay: `${i * 0.2}s`,
            }}
          ></div>
        ))}

        {/* Stelle scintillanti */}
        {[...Array(15)].map((_, i) => (
          <div
            key={`star-${i}`}
            className="absolute animate-[twinkle_2s_ease-in-out_infinite]"
            style={{
              left: `${(i * 6.5) % 95}%`,
              top: `${(i * 8.3) % 90}%`,
              animationDuration: `${2 + (i % 3)}s`,
              animationDelay: `${i * 0.3}s`,
            }}
          >
            <svg className="w-3 h-3 text-white/60" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L13.09 8.26L19 9L14.14 12.89L15.64 19L12 15.77L8.36 19L9.86 12.89L5 9L10.91 8.26L12 2Z" />
            </svg>
          </div>
        ))}

        {/* Linee di luce */}
        <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-white/10 to-transparent animate-[line-move_6s_ease-in-out_infinite]"></div>
        <div className="absolute top-0 left-2/4 w-px h-full bg-gradient-to-b from-transparent via-white/5 to-transparent animate-[line-move_8s_ease-in-out_infinite_2s]"></div>
        <div className="absolute top-0 left-3/4 w-px h-full bg-gradient-to-b from-transparent via-white/10 to-transparent animate-[line-move_7s_ease-in-out_infinite_4s]"></div>
      </div>

      {/* ========== CONTENUTO PRINCIPALE ========== */}
      <div className="relative z-10 text-center px-6">
        
        {/* Logo CleaningApp */}
        <div className="mb-10 relative animate-[logo-entrance_1s_ease-out_forwards]">
          
          {/* Glow dietro il logo */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-white/20 rounded-full blur-3xl animate-[glow-pulse_2s_ease-in-out_infinite]"></div>
          
          {/* Anello esterno rotante */}
          <div className="absolute top-1/2 left-1/2 w-36 h-36 rounded-full border-2 border-transparent border-t-white/40 border-r-white/20 animate-[spin-slow_4s_linear_infinite]" style={{ transform: "translate(-50%, -50%)" }}></div>
          
          {/* Anello medio rotante (opposto) */}
          <div className="absolute top-1/2 left-1/2 w-32 h-32 rounded-full border-2 border-transparent border-b-cyan-300/40 border-l-cyan-300/20 animate-[spin-slow_3s_linear_infinite_reverse]" style={{ transform: "translate(-50%, -50%)" }}></div>

          {/* Anello interno pulsante */}
          <div className="absolute top-1/2 left-1/2 w-28 h-28 rounded-full border border-white/20 animate-[ring-pulse_2s_ease-in-out_infinite]" style={{ transform: "translate(-50%, -50%)" }}></div>
          
          {/* Logo box principale */}
          <div className="relative w-24 h-24 mx-auto">
            <div className="w-full h-full rounded-3xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-sky-500/50 border border-white/20 animate-[logo-float_3s_ease-in-out_infinite]">
              <svg className="w-12 h-12 text-white drop-shadow-lg animate-[icon-pulse_2s_ease-in-out_infinite]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            
            {/* Pallino verde status */}
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-400 rounded-full border-4 border-white shadow-lg animate-[status-pulse_1.5s_ease-in-out_infinite]"></div>
          </div>
        </div>

        {/* Testo "CleaningApp" */}
        <div className="animate-[text-entrance_0.8s_ease-out_0.3s_forwards] opacity-0">
          <h2 className="text-2xl font-bold text-white/90 mb-1 tracking-wide">CleaningApp</h2>
          <p className="text-sm text-white/50 font-medium tracking-widest uppercase mb-6">Gestionale Pro</p>
        </div>

        {/* Testo benvenuto */}
        <div className="animate-[text-entrance_0.8s_ease-out_0.5s_forwards] opacity-0">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 tracking-tight">
            Bentornato
          </h1>
          <p className="text-2xl text-white/80 font-light mb-10">
            {firstName}
          </p>
        </div>

        {/* Progress bar con glow */}
        <div className="w-72 mx-auto mb-5 animate-[fade-in_0.8s_ease-out_0.7s_forwards] opacity-0">
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm border border-white/10">
            <div 
              className="h-full rounded-full transition-all duration-700 ease-out relative"
              style={{ 
                width: `${progress}%`,
                background: 'linear-gradient(90deg, rgba(34,211,238,0.8) 0%, rgba(255,255,255,1) 100%)',
                boxShadow: '0 0 20px rgba(34,211,238,0.6), 0 0 40px rgba(255,255,255,0.3)'
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-[shimmer_1.5s_ease-in-out_infinite]"></div>
            </div>
          </div>
          <p className="text-right text-white/40 text-xs mt-1 font-mono">{progress}%</p>
        </div>

        {/* Loading text */}
        <p className="text-white/50 text-sm font-light tracking-wide animate-[fade-in_0.8s_ease-out_0.9s_forwards] opacity-0">
          {loadingText}
        </p>

        {/* Dots animati */}
        <div className="flex justify-center gap-2 mt-6 animate-[fade-in_0.8s_ease-out_1s_forwards] opacity-0">
          <div className="w-2 h-2 bg-white/40 rounded-full animate-[bounce-dot_1.4s_ease-in-out_infinite]"></div>
          <div className="w-2 h-2 bg-white/40 rounded-full animate-[bounce-dot_1.4s_ease-in-out_infinite_0.2s]"></div>
          <div className="w-2 h-2 bg-white/40 rounded-full animate-[bounce-dot_1.4s_ease-in-out_infinite_0.4s]"></div>
        </div>
      </div>

      {/* ========== STILI ANIMAZIONE ========== */}
      <style jsx>{`
        @keyframes gradient-shift {
          0%, 100% { opacity: 0.5; transform: scale(1) rotate(0deg); }
          50% { opacity: 0.8; transform: scale(1.1) rotate(5deg); }
        }
        @keyframes wave {
          0%, 100% { transform: translateX(0) translateY(0); }
          50% { transform: translateX(-30px) translateY(10px); }
        }
        @keyframes pulse-ring {
          0% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
        }
        @keyframes float-smooth {
          0%, 100% { transform: translateY(0) translateX(0) scale(1); }
          25% { transform: translateY(-30px) translateX(15px) scale(1.05); }
          50% { transform: translateY(-15px) translateX(-15px) scale(0.95); }
          75% { transform: translateY(-35px) translateX(10px) scale(1.02); }
        }
        @keyframes particle-float {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.3; }
          50% { transform: translateY(-30px) translateX(20px); opacity: 0.8; }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes line-move {
          0%, 100% { opacity: 0; transform: translateY(-100%); }
          50% { opacity: 1; transform: translateY(100%); }
        }
        @keyframes spin-slow {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.2); }
        }
        @keyframes ring-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.3; }
          50% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.6; }
        }
        @keyframes logo-entrance {
          from { opacity: 0; transform: scale(0.5) translateY(30px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes logo-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-8px) rotate(2deg); }
        }
        @keyframes icon-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        @keyframes status-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.5); }
          50% { transform: scale(1.1); box-shadow: 0 0 0 8px rgba(52, 211, 153, 0); }
        }
        @keyframes text-entrance {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes bounce-dot {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
