import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Le Comptoir CRM", template: "%s · Le Comptoir CRM" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Figtree:wght@400;500;600;700;800&family=Yellowtail&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
