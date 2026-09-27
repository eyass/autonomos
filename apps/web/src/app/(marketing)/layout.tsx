import type { Metadata } from "next";
import { SITE_URL, OG_IMAGES } from "@/components/marketing/config";
import { SiteFooter, SiteHeader } from "@/components/marketing/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  openGraph: { siteName: "AutonomOS", locale: "en_GB", images: OG_IMAGES },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
