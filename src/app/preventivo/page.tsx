import type { Metadata } from "next";
import { PreventivoWizard } from "~/components/preventivo/PreventivoWizard";
import "~/components/preventivo/preventivo.css";

export const metadata: Metadata = {
  title: "Calcola il tuo preventivo | Puliziacasevacanze.it",
  description:
    "Pulizie e noleggio biancheria per case vacanze, B&B e affittacamere a Roma. Calcola subito il tuo preventivo gratuito in due minuti.",
  robots: { index: true, follow: true },
};

export default function PreventivoPage() {
  return (
    <main className="pv-page">
      <PreventivoWizard />
    </main>
  );
}
