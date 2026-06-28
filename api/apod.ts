import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.NASA_API_KEY;
  if (!key) {
    res.status(503).json({ error: "NASA_API_KEY is not configured on the server." });
    return;
  }

  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  const u = new URL("https://api.nasa.gov/planetary/apod");
  u.searchParams.set("api_key", key);
  if (date) u.searchParams.set("date", date);
  u.searchParams.set("thumbs", "true");

  try {
    const r = await fetch(u.toString());
    if (!r.ok) {
      res.status(r.status).json({ error: `NASA API returned ${r.status}` });
      return;
    }
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.status(200).json(await r.json());
  } catch {
    res.status(502).json({ error: "Failed to reach NASA API." });
  }
}
