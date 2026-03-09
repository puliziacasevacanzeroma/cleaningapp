import "~/styles/globals.css";
import { type Metadata, type Viewport } from "next";
import { QueryProvider } from "~/lib/QueryProvider";
import { AppProviders } from "~/lib/AppProviders";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: "CleaningApp - Gestionale Pulizie",
  description: "Gestionale professionale per pulizie case vacanza",
  manifest: "/manifest.json",
  icons: [
    { rel: "icon", url: "/favicon.ico", sizes: "any" },
    { rel: "icon", url: "/Favicon_32.png", sizes: "32x32", type: "image/png" },
    { rel: "icon", url: "/Favicon_16.png", sizes: "16x16", type: "image/png" },
    { rel: "icon", url: "/Favicon_192.png", sizes: "192x192", type: "image/png" },
    { rel: "apple-touch-icon", url: "/Favicon_180.png", sizes: "180x180" },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CleaningApp",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <head />
      <body suppressHydrationWarning>
        <QueryProvider>
          <AppProviders>
            {children}
          </AppProviders>
        </QueryProvider>
      </body>
    </html>
  );
}
