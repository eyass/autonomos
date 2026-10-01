import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Brand type: Bricolage Grotesque for headings and numbers, Instrument Sans for text,
// JetBrains Mono for IDs and code.
const heading = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-heading", weight: ["500", "600", "700"] });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-body" });
const code = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code" });

export const viewport = { themeColor: "#0f766e" };

export const metadata: Metadata = {
  title: { default: "AutonomOS", template: "%s · AutonomOS" },
  description: "Discover what to automate, deploy the agents, and measure the impact.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${code.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
