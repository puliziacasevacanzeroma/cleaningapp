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
  const isProprietario = destination.includes("proprietario");

  useEffect(() => {
    const prefetchData = async () => {
      try {
        console.log("🚀 SPLASH: Inizio precaricamento");
        console.log("🚀 SPLASH: userId =", userId);
        console.log("🚀 SPLASH: destination =", destination);
        console.log("🚀 SPLASH: isProprietario =", isProprietario);
        
        const startTime = Date.now();
        
        // STEP 1: CARICA PROPRIETÀ
        setLoadingText("Caricamento proprietà...");
        setProgress(15);

        const propertiesSnapshot = await getDocs(query(
          collection(db, "properties"),
          orderBy("name", "asc")
        ));

        const allProperties = propertiesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          cleaningPrice: doc.data().cleaningPrice || 0,
          owner: { name: doc.data().ownerName || "" },
        }));

        const activeProperties = allProperties.filter((p: any) => p.status === "ACTIVE");
        const pendingProperties = allProperties.filter((p: any) => p.status === "PENDING");
        const suspendedProperties = allProperties.filter((p: any) => p.status === "SUSPENDED");

        queryClient.setQueryData(["properties"], {
          activeProperties, pendingProperties, suspendedProperties, proprietari: [],
        });

        console.log("✅ SPLASH: Proprietà admin:", activeProperties.length);

        // STEP 2: SE PROPRIETARIO
        if (isProprietario && userId) {
          setLoadingText("Caricamento tue proprietà...");
          setProgress(30);

          const ownerProperties = allProperties.filter((p: any) => p.ownerId === userId);
          const propertyIds = ownerProperties.map((p: any) => p.id);

          console.log("✅ SPLASH: Proprietà proprietario trovate:", ownerProperties.length);

          queryClient.setQueryData(["proprietario-properties"], {
            activeProperties: ownerProperties.filter((p: any) => p.status === "ACTIVE"),
            pendingProperties: ownerProperties.filter((p: any) => p.status !== "ACTIVE"),
          });

          // STEP 3: DASHBOARD PROPRIETARIO
          setLoadingText("Caricamento dashboard...");
          setProgress(50);

          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const nextWeek = new Date();
          nextWeek.setDate(nextWeek.getDate() + 7);

          const [cleaningsSnapshot, bookingsSnapshot] = await Promise.all([
            getDocs(query(collection(db, "cleanings"),
              where("scheduledDate", ">=", Timestamp.fromDate(todayStart)),
              where("scheduledDate", "<=", Timestamp.fromDate(nextWeek))
            )),
            getDocs(collection(db, "bookings")),
          ]);

          const myCleanings = cleaningsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter((c: any) => propertyIds.includes(c.propertyId));

          const myBookings = bookingsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter((b: any) => propertyIds.includes(b.propertyId));

          const today = new Date();
          const todayStr = today.toISOString().split('T')[0];
          
          const cleaningsToday = myCleanings.filter((c: any) => {
            const d = c.scheduledDate?.toDate?.();
            return d && d.toISOString().split('T')[0] === todayStr;
          });

          const activeBookings = myBookings.filter((b: any) => {
            const co = b.checkOut?.toDate?.();
            return co && co >= new Date();
          });

          const upcomingCleanings = myCleanings
            .filter((c: any) => c.scheduledDate?.toDate?.() >= today)
            .sort((a: any, b: any) => {
              const da = a.scheduledDate?.toDate?.() || new Date(0);
              const db = b.scheduledDate?.toDate?.() || new Date(0);
              return da.getTime() - db.getTime();
            })
            .slice(0, 5);

          // 🔥 SALVA CON LA STESSA KEY DELLA PAGINA
          const dashboardQueryKey = ["proprietario-dashboard", userId];
          const dashboardData = {
            stats: {
              properties: ownerProperties.length,
              bookings: activeBookings.length,
              cleaningsToday: cleaningsToday.length
            },
            upcomingCleanings
          };
          
          queryClient.setQueryData(dashboardQueryKey, dashboardData);
          
          console.log("✅ SPLASH: Dashboard salvata con key:", JSON.stringify(dashboardQueryKey));
          
          // Verifica
          const verify = queryClient.getQueryData(dashboardQueryKey);
          console.log("✅ SPLASH: Verifica cache:", verify ? "OK ✅" : "ERRORE ❌");

          setProgress(80);

        } else {
          // ADMIN DASHBOARD
          setLoadingText("Caricamento dashboard...");
          setProgress(50);

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);

          const [cleaningsSnapshot, operatorsSnapshot] = await Promise.all([
            getDocs(query(collection(db, "cleanings"),
              where("scheduledDate", ">=", Timestamp.fromDate(today)),
              where("scheduledDate", "<", Timestamp.fromDate(tomorrow))
            )),
            getDocs(query(collection(db, "users"), where("role", "==", "OPERATORE_PULIZIE"))),
          ]);

          const propertiesMap = new Map();
          propertiesSnapshot.docs.forEach(doc => propertiesMap.set(doc.id, { id: doc.id, ...doc.data() }));

          const cleanings = cleaningsSnapshot.docs.map(doc => {
            const data = doc.data();
            const property = propertiesMap.get(data.propertyId);
            
            // 🔥 LEGGI l'array operators dal database
            let operatorsArray: Array<{id: string, name: string}> = data.operators || [];
            
            // Migra vecchio formato singolo se l'array è vuoto
            if (operatorsArray.length === 0 && data.operatorId) {
              operatorsArray = [{ id: data.operatorId, name: data.operatorName || "Operatore" }];
            }
            
            // Filtra operatori undefined
            operatorsArray = operatorsArray.filter(op => op && op.id);
            
            return {
              id: doc.id,
              date: data.scheduledDate?.toDate?.() || new Date(),
              scheduledTime: data.scheduledTime || "10:00",
              status: data.status || "pending",
              guestsCount: data.guestsCount || 2,
              property: { id: data.propertyId || "", name: data.propertyName || property?.name || "Proprietà", address: property?.address || "", imageUrl: null, maxGuests: property?.maxGuests || 6 },
              operator: operatorsArray[0] ? { id: operatorsArray[0].id, name: operatorsArray[0].name } : null,
              // 🔥 PASSA L'ARRAY COMPLETO
              operators: operatorsArray.map(op => ({ id: op.id, operator: { id: op.id, name: op.name } })),
              booking: { guestName: data.guestName || "", guestsCount: data.guestsCount || 2 },
            };
          });

          queryClient.setQueryData(["dashboard"], {
            stats: { cleaningsToday: cleaningsSnapshot.docs.length, operatorsActive: operatorsSnapshot.docs.length, propertiesTotal: activeProperties.length, checkinsWeek: 0 },
            cleanings,
            operators: operatorsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name || "Operatore" })),
          });

          console.log("✅ SPLASH: Dashboard admin precaricata");
          setProgress(80);
        }

        setLoadingText("Tutto pronto!");
        setProgress(100);
        console.log(`🏁 SPLASH: Completato in ${Date.now() - startTime}ms`);

        await new Promise(r => setTimeout(r, 400));
        setFadeOut(true);
        await new Promise(r => setTimeout(r, 600));
        onComplete();

      } catch (error) {
        console.error("❌ SPLASH: Errore:", error);
        setFadeOut(true);
        setTimeout(onComplete, 500);
      }
    };

    prefetchData();
  }, [queryClient, userId, destination, isProprietario, onComplete]);

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-cyan-500 via-sky-600 to-blue-700 transition-opacity duration-700 ${fadeOut ? "opacity-0" : "opacity-100"}`}>
      <div className="absolute inset-0 overflow-hidden">
        <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 320" preserveAspectRatio="none" style={{ height: '35%' }}>
          <path fill="rgba(255,255,255,0.08)" d="M0,160L48,176C96,192,192,224,288,213.3C384,203,480,149,576,138.7C672,128,768,160,864,181.3C960,203,1056,213,1152,197.3C1248,181,1344,139,1392,117.3L1440,96L1440,320L0,320Z"/>
        </svg>
        <div className="absolute top-10 left-10 w-40 h-40 bg-cyan-300/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-36 h-36 bg-indigo-400/20 rounded-full blur-3xl animate-pulse"></div>
      </div>

      <div className="relative z-10 text-center px-6">
        <div className="mb-10">
          <div className="relative w-24 h-24 mx-auto">
            <div className="w-full h-full rounded-3xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 flex items-center justify-center shadow-2xl border border-white/20 animate-bounce">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-400 rounded-full border-4 border-white shadow-lg"></div>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-white/90 mb-1">CleaningApp</h2>
        <p className="text-sm text-white/50 uppercase mb-6">Gestionale Pro</p>
        <h1 className="text-4xl font-bold text-white mb-2">Bentornato</h1>
        <p className="text-2xl text-white/80 font-light mb-10">{firstName}</p>

        <div className="w-72 mx-auto mb-5">
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ 
              width: `${progress}%`,
              background: 'linear-gradient(90deg, rgba(34,211,238,0.8), white)',
              boxShadow: '0 0 20px rgba(34,211,238,0.6)'
            }}></div>
          </div>
          <p className="text-right text-white/40 text-xs mt-1">{progress}%</p>
        </div>

        <p className="text-white/50 text-sm">{loadingText}</p>

        <div className="flex justify-center gap-2 mt-6">
          <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{animationDelay:'0ms'}}></div>
          <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{animationDelay:'150ms'}}></div>
          <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{animationDelay:'300ms'}}></div>
        </div>
      </div>
    </div>
  );
}
