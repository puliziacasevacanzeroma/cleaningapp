import { type Metadata } from "next";
import GuidaClient from "./GuidaClient";

export const metadata: Metadata = {
  title: "Guida CleaningApp — Come funziona",
  description: "Guida completa per proprietari: registrazione, inserimento proprietà, collegamento iCal e gestione pulizie.",
  openGraph: {
    title: "Guida CleaningApp",
    description: "Tutto quello che devi sapere per iniziare con CleaningApp.",
    type: "website",
  },
};

export default function GuidaPage() {
  return <GuidaClient />;
}
