"use client";

import { createContext, useContext, ReactNode } from "react";

interface DashboardPreloadedData {
  stats: {
    cleaningsToday: number;
    operatorsActive: number;
    propertiesTotal: number;
    checkinsWeek: number;
    ordersToday: number;
    ordersPending: number;
  };
  cleanings: any[];
  operators: any[];
  orders: any[];
  riders: any[];
}

interface DashboardContextType {
  preloadedData: DashboardPreloadedData | null;
  isPreloaded: boolean;
}

const DashboardContext = createContext<DashboardContextType>({
  preloadedData: null,
  isPreloaded: false,
});

export function DashboardProvider({ 
  children, 
  preloadedData 
}: { 
  children: ReactNode; 
  preloadedData: DashboardPreloadedData | null;
}) {
  return (
    <DashboardContext.Provider value={{ preloadedData, isPreloaded: !!preloadedData }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardPreloaded() {
  return useContext(DashboardContext);
}
