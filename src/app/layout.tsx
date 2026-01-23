import "~/styles/globals.css";
import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { QueryProvider } from "~/lib/QueryProvider";
import { AppProviders } from "~/lib/AppProviders";

export const metadata: Metadata = {
  title: "CleaningApp - Gestionale Pulizie",
  description: "Gestionale per pulizie case vacanza",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className={geist.variable}>
      <body>
        <QueryProvider>
          <AppProviders>
            {children}
          </AppProviders>
        </QueryProvider>
      </body>
    </html>
  );
}