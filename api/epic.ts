import type { VercelRequest, VercelResponse } from "@vercel/node";

interface EpicImage {
  identifier: string;
  caption: string;
  image: string;
  date: string;
  centroid_coordinates?: { lat: number; lon: number };
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const key = process.env.NASA_API_KEY;
  if (!key) {
    res.status(503).json({ error: "NASA_API_KEY is not configured on the server." });
    return;
  }

  try {
    const metaUrl = new URL("https://api.nasa.gov/EPIC/api/natural");
    metaUrl.searchParams.set("api_key", key);

    const metaRes = await fetch(metaUrl.toString());
    if (!metaRes.ok) {
      res.status(metaRes.status).json({ error: `NASA EPIC API returned ${metaRes.status}` });
      return;
    }

    const images = (await metaRes.json()) as EpicImage[];
    if (!Array.isArray(images) || images.length === 0) {
      res.status(404).json({ error: "No EPIC imagery available." });
      return;
    }

    const latest = images[images.length - 1];
    const dateParts = latest.date.split(" ")[0].split("-");
    const yyyy = dateParts[0];
    const mm = dateParts[1];
    const dd = dateParts[2];
    const imageUrl = `https://epic.gsfc.nasa.gov/archive/natural/${yyyy}/${mm}/${dd}/png/${latest.image}.png`;

    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json({
      imageUrl,
      identifier: latest.identifier,
      imageName: latest.image,
      date: latest.date,
      caption: latest.caption || null,
      centroid: latest.centroid_coordinates
        ? {
            lat: Math.round(latest.centroid_coordinates.lat * 10) / 10,
            lon: Math.round(latest.centroid_coordinates.lon * 10) / 10,
          }
        : null,
      source: "NASA EPIC / DSCOVR",
      archiveDate: `${yyyy}/${mm}/${dd}`,
    });
  } catch {
    res.status(502).json({ error: "Failed to reach NASA EPIC API." });
  }
}
