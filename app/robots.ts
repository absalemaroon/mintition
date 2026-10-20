import type { MetadataRoute } from "next"

/** Tell every crawler to stay away. (The IP gate already hides the app from them entirely.) */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] }
}
