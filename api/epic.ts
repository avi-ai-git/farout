import type { VercelRequest, VercelResponse } from "@vercel/node";

interface EpicImage {
  identifier: string;
  caption: string;
  image: string;
  date: string;
  centroid_coordinates?: { lat: number; lon: number };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WALKBACK_DAYS = 7;

function shiftDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

async function fetchEpic(url: string): Promise<EpicImage[] | null> {
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = (await r.json()) as EpicImage[];
  return Array.isArray(j) ? j : [];
}

function buildResponse(latest: EpicImage, requestedDate: string | null, servedDate: string) {
  const [yyyy, mm, dd] = latest.date.split(" ")[0].split("-");
  const imageUrl = `https://epic.gsfc.nasa.gov/archive/natural/${yyyy}/${mm}/${dd}/png/${latest.image}.png`;
  return {
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
    requestedDate,
    servedDate,
    // True when the user asked for a specific date but EPIC had nothing
    // current for it, so we walked backward to the nearest day with imagery.
    walkedBack: requestedDate !== null && requestedDate !== servedDate,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.NASA_API_KEY;
  if (!key) {
    res.status(503).json({ error: "NASA_API_KEY is not configured on the server." });
    return;
  }

  const rawDate = typeof req.query.date === "string" ? req.query.date : null;
  const requestedDate = rawDate && ISO_DATE.test(rawDate) ? rawDate : null;

  try {
    if (requestedDate) {
      for (let i = 0; i <= MAX_WALKBACK_DAYS; i++) {
        const tryDate = shiftDate(requestedDate, -i);
        const url = `https://api.nasa.gov/EPIC/api/natural/date/${tryDate}?api_key=${encodeURIComponent(key)}`;
        const images = await fetchEpic(url);
        if (images && images.length > 0) {
          const latest = images[images.length - 1];
          res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
          res.status(200).json(buildResponse(latest, requestedDate, tryDate));
          return;
        }
      }
      res.status(404).json({
        error: "No EPIC imagery available for this date or the prior week.",
        requestedDate,
      });
      return;
    }

    // No date requested — fall back to the most recent EPIC capture.
    const latestUrl = `https://api.nasa.gov/EPIC/api/natural?api_key=${encodeURIComponent(key)}`;
    const images = await fetchEpic(latestUrl);
    if (!images || images.length === 0) {
      res.status(404).json({ error: "No EPIC imagery available." });
      return;
    }
    const latest = images[images.length - 1];
    const servedDate = latest.date.split(" ")[0];
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json(buildResponse(latest, null, servedDate));
  } catch {
    res.status(502).json({ error: "Failed to reach NASA EPIC API." });
  }
}
