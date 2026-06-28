import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const yearStart = typeof req.query.year_start === "string" ? req.query.year_start : undefined;

  const u = new URL("https://images-api.nasa.gov/search");
  if (q) u.searchParams.set("q", q);
  u.searchParams.set("media_type", "image");
  if (yearStart) u.searchParams.set("year_start", yearStart);

  try {
    const r = await fetch(u.toString());
    if (!r.ok) {
      res.status(r.status).json({ error: `NASA Images API returned ${r.status}` });
      return;
    }
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json(await r.json());
  } catch {
    res.status(502).json({ error: "Failed to reach NASA Images API." });
  }
}
