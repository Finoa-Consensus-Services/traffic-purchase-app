import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { connection } from "next/server";
import { ClientProviders } from "@/components/ClientProviders";
import { DevnetBanner } from "@/components/site/DevnetBanner";
import { devnetBannerEnabled } from "@/lib/devnet-banner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-inter",
});

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Validator Traffic",
    template: "%s · Validator Traffic",
  },
  description: "Buy traffic for a validator with your own wallet.",
};

/** Public origin. Falls back to localhost. */
function configuredAppOrigin(): string {
  const configured = process.env["NEXT_PUBLIC_APP_ORIGIN"]?.trim();
  return configured || "http://localhost:3000";
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read env on the request. A build-time read freezes the banner and origin.
  await connection();
  const showDevnetBanner = devnetBannerEnabled({
    APP_NETWORK: process.env["APP_NETWORK"],
    NEXT_PUBLIC_APP_ORIGIN: process.env["NEXT_PUBLIC_APP_ORIGIN"],
  });
  return (
    <html
      lang="en-GB"
      className={`${inter.variable} ${plex.variable}`}
      style={showDevnetBanner ? ({ "--banner-h": "2.75rem" } as CSSProperties) : undefined}
    >
      <body className="font-sans">
        {showDevnetBanner ? <DevnetBanner /> : null}
        <ClientProviders
          appOrigin={configuredAppOrigin()}
          devnet={showDevnetBanner}
          walletConnectProjectId={process.env["NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"]?.trim() || undefined}
        >
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
