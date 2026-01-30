import "~/styles/globals.css";
import { type Metadata, type Viewport } from "next";
import { Geist } from "next/font/google";
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

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

// Script che viene eseguito PRIMA di React per redirect immediato
const earlyRedirectScript = `
(function() {
  try {
    var path = window.location.pathname;
    if (path !== '/login' && path !== '/register') return;
    
    var cookies = document.cookie.split(';');
    var userCookie = null;
    for (var i = 0; i < cookies.length; i++) {
      var c = cookies[i].trim();
      if (c.startsWith('firebase-user=')) {
        userCookie = c.substring(14);
        break;
      }
    }
    
    if (!userCookie) {
      var stored = localStorage.getItem('user');
      if (stored) userCookie = stored;
    }
    
    if (userCookie) {
      var user = JSON.parse(decodeURIComponent(userCookie));
      if (user && user.role) {
        var role = user.role.toUpperCase();
        var dest = '/dashboard';
        if (role === 'RIDER') dest = '/rider';
        else if (role === 'OPERATORE_PULIZIE' || role === 'OPERATORE' || role === 'OPERATOR') dest = '/operatore';
        else if (role === 'PROPRIETARIO' || role === 'OWNER' || role === 'CLIENTE') dest = '/proprietario';
        window.location.replace(dest);
      }
    }
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className={geist.variable}>
      <head>
        {/* 🚀 Script eseguito PRIMA di React per evitare flash della pagina login */}
        <script dangerouslySetInnerHTML={{ __html: earlyRedirectScript }} />
      </head>
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