import type { MetadataRoute } from "next";
import { DOCS } from "@/components/marketing/docs";
import { SITE_URL } from "@/components/marketing/config";
import { DEPARTMENTS } from "@/components/marketing/departments";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: Array<{ path: string; priority: number }> = [
    { path: "/", priority: 1 },
    { path: "/security", priority: 0.8 },
    { path: "/solutions", priority: 0.8 },
    ...DEPARTMENTS.map((d) => ({ path: `/solutions/${d.slug}`, priority: 0.7 })),
    ...DOCS.map((d) => ({ path: d.href, priority: d.slug ? 0.6 : 0.7 })),
  ];
  return pages.map((p) => ({ url: `${SITE_URL}${p.path === "/" ? "" : p.path}`, changeFrequency: "monthly", priority: p.priority }));
}
