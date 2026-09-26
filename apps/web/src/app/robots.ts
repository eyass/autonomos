import type { MetadataRoute } from "next";
import { SITE_URL } from "@/components/marketing/config";

const APP_ROUTES = ["/api/", "/activity", "/agents", "/approvals", "/discover", "/integrations", "/opportunities", "/processes", "/settings", "/onboarding", "/auth/", "/landing", "/reset-password"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/security", "/docs", "/terms", "/privacy"],
      disallow: APP_ROUTES,
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
