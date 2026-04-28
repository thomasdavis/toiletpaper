import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/styleguide"],
      },
    ],
    sitemap: "https://toiletpaper.dev/sitemap.xml",
    host: "https://toiletpaper.dev",
  };
}
