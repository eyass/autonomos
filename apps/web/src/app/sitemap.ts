import type { MetadataRoute } from "next";
import { DOCS } from "@/components/marketing/docs";
import { SITE_URL } from "@/components/marketing/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: Array<{ path: string; priority: number }> = [
    { path: "/", priority: 1 },
    { path: "/security", priority: 0.8 },
    ...DOCS.map((d) => ({ path: d.href, priority: d.slug ? 0.6 : 0.7 })),
    { path: "/terms", priority: 0.3 },
    { path: "/privacy", priority: 0.3 },
  ];
  return pages.map((p) => ({ url: `${SITE_URL}${p.path === "/" ? "" : p.path}`, changeFrequency: "monthly", priority: p.priority }));
}
