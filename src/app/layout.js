import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css'; // <--- THIS IS THE KEY LINE

// Configure the fonts
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata = {
  title: 'Version Manager',
  description: 'Track app versions',
  manifest: '/manifest.json', // Connects your PWA manifest
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Fallback for icons if manifest doesn't load immediately */}
        <link rel="icon" href="/icon-192.png" />
        <meta name="theme-color" content="#1a1a1a" />
      </head>
      <body className={`${plexSans.variable} ${plexMono.variable}`}>
        {children}
      </body>
    </html>
  );
}