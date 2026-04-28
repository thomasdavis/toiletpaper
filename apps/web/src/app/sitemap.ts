import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { papers } from "@toiletpaper/db";
import { desc } from "drizzle-orm";

const BASE = "https://toiletpaper.dev";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE}/papers`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/upload`, changeFrequency: "monthly", priority: 0.5 },
  ];

  let paperEntries: MetadataRoute.Sitemap = [];
  try {
    const rows = await db
      .select({ id: papers.id, updatedAt: papers.updatedAt })
      .from(papers)
      .orderBy(desc(papers.updatedAt));
    paperEntries = rows.flatMap((p) => {
      const lastModified = p.updatedAt ?? undefined;
      return [
        {
          url: `${BASE}/papers/${p.id}`,
          lastModified,
          changeFrequency: "weekly" as const,
          priority: 0.8,
        },
        {
          url: `${BASE}/papers/${p.id}/report`,
          lastModified,
          changeFrequency: "weekly" as const,
          priority: 0.7,
        },
        {
          url: `${BASE}/papers/${p.id}/annotated`,
          lastModified,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        },
        {
          url: `${BASE}/papers/${p.id}/simulations`,
          lastModified,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        },
      ];
    });
  } catch {
    // DB unreachable — return static entries only.
  }

  return [...staticEntries, ...paperEntries];
}
