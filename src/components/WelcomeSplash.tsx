"use client";

import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from "@tanstack/react-query";
import { collection, getDocs, query, orderBy, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

interface WelcomeSplashProps {
  userName: string;
  userId?: string;
  destination: string;
  onComplete: () => void;
}

// ⏱️ WATCHDOG: tempo massimo assoluto sullo splash. Oltre questo, si prosegue
// comunque (la dashboard/operatore carica i dati da sé via onSnapshot/cache).
const GLOBAL_WATCHDOG_MS = 8000;
// Timeout per singola query Firestore. Se una getDocs si impianta (es. lease
// IndexedDB bloccato su iOS PWA, rete che stalla), invece di restare pending
// all'infinito rigetta e si prosegue.
const QUERY_TIMEOUT_MS = 6000;

// Rende interrompibile una Promise: se non risolve entro `ms`, rigetta.
// Serve perché una getDocs che resta *pending* non finisce MAI nel catch.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout:${label}`)), ms)
    ),
  ]);
}

export function WelcomeSplash({ userName, userId, destination, onComplete }: WelcomeSplashProps) {
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("Preparazione...");
  const [fadeOut, setFadeOut] = useState(false);
  const queryClient = useQueryClient();

  // Riferimenti stabili: onComplete chiamato UNA SOLA volta, watchdog cancellabile.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const doneRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const firstName = userName.split(" ")[0];
  const isProprietario = destination.includes("proprietario");

  useEffect(() => {
    // Chiusura sicura: completa la barra a 100%, fade, onComplete. Garantito una sola volta.
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      // Porta la barra a 100% (la transizione CSS la anima dal valore corrente),
      // breve pausa per mostrare il riempimento, poi fade. Niente attesa extra sui dati.
      setProgress(100);
      setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => onCompleteRef.current(), 500);
      }, 350);
    };

    // 🎞️ Animazione barra INDIPENDENTE dai dati: sale fluida verso ~90% e rallenta,
    // così non resta MAI inchiodata a un valore intermedio (es. 15%) se una query stalla.
    // Quando il prefetch finisce o va in timeout, finish() la porta a 100%.
    progressTimerRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        const next = prev + Math.max(0.5, (90 - prev) * 0.06);
        return Math.min(90, next);
      });
    }, 120);

    // 🛡️ RETE DI SICUREZZA ULTIMA: qualunque cosa accada, non si resta bloccati.
    watchdogRef.current = setTimeout(() => {
      console.warn("⏱️ SPLASH: watchdog scattato, proseguo comunque");
      finish();
    }, GLOBAL_WATCHDOG_MS);

    const prefetchData = async () => {
      try {
        // STEP 1: CARICA PROPRIETÀ
        setLoadingText("Caricamento proprietà...");

        const propertiesSnapshot = await withTimeout(
          getDocs(query(collection(db, "properties"), orderBy("name", "asc"))),
          QUERY_TIMEOUT_MS,
          "properties"
        );

        const allProperties = propertiesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as Record<string, any>),
          cleaningPrice: (doc.data() as Record<string, any>).cleaningPrice || 0,
          owner: { name: (doc.data() as Record<string, any>).ownerName || "" },
        }));

        const activeProperties = allProperties.filter((p: any) => p.status === "ACTIVE");
        const pendingProperties = allProperties.filter((p: any) => p.status === "PENDING");
        const suspendedProperties = allProperties.filter((p: any) => p.status === "SUSPENDED");

        queryClient.setQueryData(["properties"], {
          activeProperties, pendingProperties, suspendedProperties, proprietari: [],
        });

        // STEP 2: SE PROPRIETARIO
        if (isProprietario && userId) {
          setLoadingText("Caricamento tue proprietà...");

          const ownerProperties = allProperties.filter((p: any) => p.ownerId === userId);
          const propertyIds = ownerProperties.map((p: any) => p.id);

          queryClient.setQueryData(["proprietario-properties"], {
            activeProperties: ownerProperties.filter((p: any) => p.status === "ACTIVE"),
            pendingProperties: ownerProperties.filter((p: any) => p.status !== "ACTIVE"),
          });

          // STEP 3: DASHBOARD PROPRIETARIO
          setLoadingText("Caricamento dashboard...");

          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const nextWeek = new Date();
          nextWeek.setDate(nextWeek.getDate() + 7);

          const [cleaningsSnapshot, bookingsSnapshot] = await withTimeout(
            Promise.all([
              getDocs(query(collection(db, "cleanings"),
                where("scheduledDate", ">=", Timestamp.fromDate(todayStart)),
                where("scheduledDate", "<=", Timestamp.fromDate(nextWeek))
              )),
              getDocs(collection(db, "bookings")),
            ]),
            QUERY_TIMEOUT_MS,
            "proprietario-dashboard"
          );

          const myCleanings = cleaningsSnapshot.docs
            .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }))
            .filter((c: any) => propertyIds.includes(c.propertyId));

          const myBookings = bookingsSnapshot.docs
            .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }))
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


        } else {
          // ADMIN DASHBOARD
          setLoadingText("Caricamento dashboard...");

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);

          const [cleaningsSnapshot, operatorsSnapshot] = await withTimeout(
            Promise.all([
              getDocs(query(collection(db, "cleanings"),
                where("scheduledDate", ">=", Timestamp.fromDate(today)),
                where("scheduledDate", "<", Timestamp.fromDate(tomorrow))
              )),
              getDocs(query(collection(db, "users"), where("role", "==", "OPERATORE_PULIZIE"))),
            ]),
            QUERY_TIMEOUT_MS,
            "admin-dashboard"
          );

          const propertiesMap = new Map();
          propertiesSnapshot.docs.forEach(doc => propertiesMap.set(doc.id, { id: doc.id, ...(doc.data() as Record<string, any>) }));

          const cleanings = cleaningsSnapshot.docs.map(doc => {
            const data = doc.data() as Record<string, any>;
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
            operators: operatorsSnapshot.docs.map(doc => ({ id: doc.id, name: (doc.data() as Record<string, any>).name || "Operatore" })),
          });

        }

        setLoadingText("Tutto pronto!");
        finish();

      } catch (error) {
        // Copre sia gli errori reali sia i timeout delle query (withTimeout):
        // in ogni caso si prosegue, NON si resta bloccati sullo splash.
        console.error("❌ SPLASH: prefetch interrotto, proseguo:", error);
        finish();
      }
    };

    prefetchData();

    // Cleanup: se il componente si smonta prima, niente timer orfani.
    return () => {
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
    // Mount-once: lo splash gira una sola volta per sessione.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <p className="text-right text-white/40 text-xs mt-1">{Math.round(progress)}%</p>
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
