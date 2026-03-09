/**
 * ROUTE DEPRECATA — usa /dashboard/calendario/prenotazioni
 *
 * Questo secondo strato di redirect è una safety net nel caso in cui
 * il redirect di next.config.js non venisse eseguito (es. navigazione
 * client-side tramite <Link> o router.push verso questa URL).
 *
 * La fonte di verità è il redirect permanente HTTP 308 in next.config.js.
 */
import { redirect } from "next/navigation";

export default function CalendarioPrenotazioniDeprecated() {
  redirect("/dashboard/calendario/prenotazioni");
}
