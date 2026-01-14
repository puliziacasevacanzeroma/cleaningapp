import { redirect } from "next/navigation";
import { auth } from "~/server/auth";

export default async function Home() {
  const session = await auth();
  
  if (session?.user) {
    // Se loggato, vai alla dashboard in base al ruolo
    const role = session.user.role?.toLowerCase();
    if (role === "admin") {
      redirect("/dashboard");
    } else if (role === "proprietario" || role === "owner") {
      redirect("/proprietario");
    } else if (role === "operatore" || role === "operatore_pulizie" || role === "operator") {
      redirect("/operatore");
    } else if (role === "rider") {
      redirect("/rider");
    } else {
      redirect("/dashboard");
    }
  } else {
    // Se non loggato, vai al login
    redirect("/login");
  }
}