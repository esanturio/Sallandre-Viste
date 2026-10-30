import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sallandre · Avis de coupure d’eau',
  description: 'Création et envoi des avis de coupure d’eau — Sallandre × BatiBig',
  robots: { index: false, follow: false },
  icons: { icon: '/logo-sallandre.png' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#134575' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
