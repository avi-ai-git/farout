import type { VercelRequest, VercelResponse } from "@vercel/node";

interface EpicImage {
  identifier: string;
  caption: string;
  image: string;
  date: string;
  centroid_coordinates?: { lat: number; lon: number };
}

// EPIC natural-colour imagery begins 2015-06-13. For an in-range date we ask for
// that exact day; if the day has no frame (gaps happen) or is out of range, we
// fall back to the most recent frame and flag it so the UI can stay honest.
const EPIC_START = "2015-06-13";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.NASA_API_KEY;
  if (!key) {
    res.status(503).json({ error: "NASA_API_KEY is not configured on the server." });
    return;
  }

  const date =
    typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : undefined;
  const tryDate = date && date >= EPIC_START ? date : undefined;

  try {
    let images: EpicImage[] = [];
    let matchedDate = false;

    if (tryDate) {
      const dUrl = new URL(`https://api.nasa.gov/EPIC/api/natural/date/${tryDate}`);
      dUrl.searchParams.set("api_key", key);
      const dRes = await fetch(dUrl.toString());
      if (dRes.ok) {
        const dImages = (await dRes.json()) as EpicImage[];
        if (Array.isArray(dImages) && dImages.length > 0) {
          images = dImages;
          matchedDate = true;
        }
      }
    }

    if (images.length === 0) {
      const metaUrl = new URL("https://api.nasa.gov/EPIC/api/natural");
      metaUrl.searchParams.set("api_key", key);
      const metaRes = await fetch(metaUrl.toString());
      if (!metaRes.ok) {
        res.status(metaRes.status).json({ error: `NASA EPIC API returned ${metaRes.status}` });
        return;
      }
      images = (await metaRes.json()) as EpicImage[];
    }

    if (!Array.isArray(images) || images.length === 0) {
      res.status(404).json({ error: "No EPIC imagery available." });
      return;
    }

    const chosen = images[images.length - 1];
    const dateParts = chosen.date.split(" ")[0].split("-");
    const yyyy = dateParts[0];
    const mm = dateParts[1];
    const dd = dateParts[2];
    const imageUrl = `https://epic.gsfc.nasa.gov/archive/natural/${yyyy}/${mm}/${dd}/png/${chosen.image}.png`;

    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json({
      imageUrl,
      identifier: chosen.identifier,
      imageName: chosen.image,
      date: chosen.date,
      matchedDate,
      requestedDate: date ?? null,
      caption: chosen.caption || null,
      centroid: chosen.centroid_coordinates
        ? {
            lat: Math.round(chosen.centroid_coordinates.lat * 10) / 10,
            lon: Math.round(chosen.centroid_coordinates.lon * 10) / 10,
          }
        : null,
      source: "NASA EPIC / DSCOVR",
      archiveDate: `${yyyy}/${mm}/${dd}`,
    });
  } catch {
    res.status(502).json({ error: "Failed to reach NASA EPIC API." });
  }
}
