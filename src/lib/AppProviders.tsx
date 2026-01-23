"use client";

import { ReactNode } from "react";
import { AuthProvider } from "~/lib/firebase/AuthContext";
import { CleaningsProvider } from "~/lib/contexts/CleaningsContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CleaningsProvider>
        {children}
      </CleaningsProvider>
    </AuthProvider>
  );
}
