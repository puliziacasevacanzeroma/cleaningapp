"use client";

import { PulizieView } from "~/components/proprietario/PulizieView";

// 🔴 CENTRALIZZATO: La pagina è ora un semplice wrapper
// PulizieView carica i dati internamente e determina il ruolo automaticamente
export default function CalendarioPuliziePage() {
  return <PulizieView />;
}
