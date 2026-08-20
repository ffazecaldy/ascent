import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ascend — Sistema operativo per la crescita personale",
  description:
    "Un solo posto per finanze, trading, tempo, corpo e mente. Streak, Ascend Day, Trading Journal completo.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Ascend" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${spaceGrotesk.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
